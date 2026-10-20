using System.Net;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using AITeacher.Modules.Curriculum.Concepts;
using Microsoft.EntityFrameworkCore;

namespace AITeacher.Api.Features.Graphs;

public sealed class GraphService(GraphDbContext db, IGraphCurriculum curriculum, IGraphMessages messages, TimeProvider clock)
{
    internal static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private static string Actor(ClaimsPrincipal u) => u.FindFirstValue(ClaimTypes.NameIdentifier)!;
    private static IResult Invalid(string text) => Results.ValidationProblem(new Dictionary<string, string[]> { ["graph"] = [text] });
    private static IResult Conflict(string text) => Results.Problem(statusCode: 409, title: text);
    private static bool Relation(string? r) => r is "requires" or "explains" or "applies" or "differsFrom";
    private static bool Shape(Guid from, Guid? to, string? relation, string stage, decimal confidence) =>
        from != Guid.Empty && (to is null && relation is null || to is not null && to != Guid.Empty && to != from && Relation(relation)) &&
        stage is "mention" or "exploration" or "understanding" && confidence is >= 0 and <= 1;

    public async Task<IResult> Create(GraphRequest r, ClaimsPrincipal u, CancellationToken ct)
    {
        if (r.GraphId == Guid.Empty || r.TopicId == Guid.Empty || r.Number < 1 || string.IsNullOrWhiteSpace(r.Title) || r.Title.Length > 150 ||
            r.Nodes is not { Length: > 0 and <= 200 } || r.Edges is not { Length: <= 500 } ||
            r.Nodes.Any(x => x is null || x.Id == Guid.Empty) || r.Edges.Any(x => x is null || !Relation(x.Relation) || x.FromNodeId == x.ToNodeId) ||
            r.Nodes.Select(x => x.Id).Distinct().Count() != r.Nodes.Length || r.Edges.Distinct().Count() != r.Edges.Length)
            return Invalid("Invalid graph identity, title, nodes or edges.");
        var ids = r.Nodes.Select(x => x.Id).ToHashSet();
        if (r.Edges.Any(x => !ids.Contains(x.FromNodeId) || !ids.Contains(x.ToNodeId))) return Invalid("Edges must resolve in the same snapshot.");
        try { PrerequisiteGraph.Validate(ids, r.Edges.Where(x => x.Relation == "requires").Select(x => new Prerequisite(x.FromNodeId, x.ToNodeId))); }
        catch (ArgumentException e) { return Invalid(e.Message); }
        var previous = await db.Revisions.AsNoTracking().Where(x => x.GraphId == r.GraphId).OrderByDescending(x => x.Number).FirstOrDefaultAsync(ct);
        if (r.Number != (previous?.Number ?? 0) + 1) return Conflict("Revision number must follow the latest snapshot");
        if (previous is not null && previous.TopicId != r.TopicId) return Invalid("A graph cannot change topic.");
        var historical = await (from n in db.Nodes.AsNoTracking() join g in db.Revisions on n.RevisionId equals g.Id
                                where g.GraphId == r.GraphId && ids.Contains(n.Id) select n).ToListAsync(ct);
        if (r.Nodes.Any(n => historical.Any(h => h.Id == n.Id && (h.UnitId != n.UnitId || h.ConceptId != n.ConceptId))))
            return Invalid("Stable node IDs cannot be reassigned to different concepts.");
        var revision = new GraphRevision { GraphId = r.GraphId, TopicId = r.TopicId, Number = r.Number, Title = r.Title.Trim(), CreatedBy = Actor(u), CreatedAt = clock.GetUtcNow() };
        var nodes = new List<GraphNode>();
        foreach (var n in r.Nodes)
        {
            var concept = await curriculum.Concept(n.UnitId, n.UnitRevisionId, n.ConceptId, ct);
            if (concept is null || concept.TopicId != r.TopicId) return Invalid("Nodes must reference published concepts of the graph topic.");
            nodes.Add(new() { RevisionId = revision.Id, Id = n.Id, UnitId = n.UnitId, UnitRevisionId = n.UnitRevisionId, ConceptId = n.ConceptId, Name = concept.Name });
        }
        if (nodes.Select(x => (x.UnitId, x.UnitRevisionId, x.ConceptId)).Distinct().Count() != nodes.Count)
            return Invalid("A source concept can appear only once per snapshot.");
        db.Revisions.Add(revision); db.Nodes.AddRange(nodes);
        db.Relations.AddRange(r.Edges.Select(e => new GraphRelation { RevisionId = revision.Id, FromNodeId = e.FromNodeId, ToNodeId = e.ToNodeId, Relation = e.Relation }));
        await db.SaveChangesAsync(ct);
        return Results.Created($"/api/graphs/revisions/{revision.Id}", await Snapshot(revision, ct));
    }
    public async Task<IResult> List(Guid? topicId, int offset, int limit, CancellationToken ct)
    {
        if (offset < 0 || limit is < 1 or > 100) return Invalid("Invalid pagination.");
        var q = db.Revisions.AsNoTracking().Where(x => topicId == null || x.TopicId == topicId);
        return Results.Ok(new { items = await q.OrderBy(x => x.GraphId).ThenByDescending(x => x.Number).Skip(offset).Take(limit).ToArrayAsync(ct), total = await q.CountAsync(ct), offset, limit });
    }
    public async Task<IResult> Get(Guid id, CancellationToken ct)
    {
        var r = await db.Revisions.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct);
        return r is null ? Results.NotFound() : Results.Ok(await Snapshot(r, ct));
    }
    private async Task<object> Snapshot(GraphRevision r, CancellationToken ct) => new { r.Id, r.GraphId, r.TopicId, r.Number, r.Title, r.CreatedBy, r.CreatedAt,
        nodes = await db.Nodes.AsNoTracking().Where(x => x.RevisionId == r.Id).OrderBy(x => x.Id).ToArrayAsync(ct),
        edges = await db.Relations.AsNoTracking().Where(x => x.RevisionId == r.Id).OrderBy(x => x.FromNodeId).ThenBy(x => x.ToNodeId).ThenBy(x => x.Relation).ToArrayAsync(ct) };
    private async Task<bool> Compatible(Guid cid, Guid rid, string actor, CancellationToken ct)
    {
        var c = await messages.Conversation(cid, actor, ct);
        return c is not null && await db.Nodes.AnyAsync(x => x.RevisionId == rid && x.UnitId == c.UnitId && x.UnitRevisionId == c.RevisionId, ct);
    }
    private async Task<bool> NodesExist(Guid rid, Guid from, Guid? to, CancellationToken ct) =>
        await db.Nodes.AnyAsync(x => x.RevisionId == rid && x.Id == from, ct) &&
        (to is null || await db.Nodes.AnyAsync(x => x.RevisionId == rid && x.Id == to, ct));
    private GraphObservation AddObservation(Guid cid, Guid rid, Guid mid, string actor, string origin, Guid from, Guid? to, string? relation, string stage, decimal confidence, string? key = null)
    {
        var o = new GraphObservation { ConversationId = cid, GraphRevisionId = rid, MessageId = mid, StudentId = actor, Origin = origin,
            CreatedAt = clock.GetUtcNow(), DeduplicationKey = key };
        db.Observations.Add(o);
        db.Corrections.Add(new() { ObservationId = o.Id, GraphRevisionId = rid, Version = 1, FromNodeId = from, ToNodeId = to,
            Relation = relation, Stage = stage, Confidence = confidence, CreatedAt = o.CreatedAt, Reason = origin });
        return o;
    }
    public async Task<IResult> Observe(Guid cid, ObservationRequest r, ClaimsPrincipal u, CancellationToken ct)
    {
        var actor = Actor(u);
        if (await messages.Conversation(cid, actor, ct) is null) return Results.NotFound();
        if (!Shape(r.FromNodeId, r.ToNodeId, r.Relation, r.Stage, r.Confidence)) return Invalid("Invalid observation shape, stage or confidence.");
        var message = await messages.Message(cid, r.MessageId, actor, ct);
        if (message is null || message.Role != "user") return Invalid("A source message written by the student in this conversation is required.");
        if (!await Compatible(cid, r.GraphRevisionId, actor, ct) || !await NodesExist(r.GraphRevisionId, r.FromNodeId, r.ToNodeId, ct))
            return Invalid("Unknown nodes or graph revision incompatible with the conversation.");
        await using var tx = await db.Database.BeginTransactionAsync(ct); await Lock(cid, ct);
        if (await Count(cid, r.GraphRevisionId, ct) >= 1000) return Conflict("Observation limit reached");
        var o = AddObservation(cid, r.GraphRevisionId, r.MessageId, actor, "student", r.FromNodeId, r.ToNodeId, r.Relation, r.Stage, r.Confidence);
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        return Results.Created($"/api/graphs/observations/{o.Id}", await Observation(o, ct));
    }
    // Serializes bounded inserts for a map without locking tutor turns.
    private Task Lock(Guid id, CancellationToken ct) => db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({"graph:" + id}, 0))", ct);
    private Task<int> Count(Guid cid, Guid rid, CancellationToken ct) => db.Observations.CountAsync(x => x.ConversationId == cid && x.GraphRevisionId == rid, ct);
    public async Task<IResult> Extract(Guid cid, ExtractRequest r, ClaimsPrincipal u, CancellationToken ct)
    {
        var actor = Actor(u);
        if (await messages.Conversation(cid, actor, ct) is null) return Results.NotFound();
        var message = await messages.Message(cid, r.MessageId, actor, ct);
        if (message is null || message.Role != "user") return Invalid("A source message written by the student is required.");
        if (!await Compatible(cid, r.GraphRevisionId, actor, ct)) return Invalid("Graph revision incompatible with the conversation.");
        var nodes = await db.Nodes.AsNoTracking().Where(x => x.RevisionId == r.GraphRevisionId).OrderBy(x => x.Id).ToArrayAsync(ct);
        var matched = nodes.Where(n => Regex.IsMatch(message.Text.Normalize(NormalizationForm.FormC),
            @"(?<![\p{L}\p{N}_])" + Regex.Escape(n.Name.Normalize(NormalizationForm.FormC)) + @"(?![\p{L}\p{N}_])",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(100))).ToArray();
        await using var tx = await db.Database.BeginTransactionAsync(ct); await Lock(cid, ct);
        var keys = matched.Select(n => $"{cid}:{r.GraphRevisionId}:{r.MessageId}:{n.Id}").ToArray();
        var existing = await db.Observations.Where(x => x.DeduplicationKey != null && keys.Contains(x.DeduplicationKey)).ToListAsync(ct);
        var known = existing.Select(x => x.DeduplicationKey).ToHashSet();
        if (await Count(cid, r.GraphRevisionId, ct) + matched.Length - existing.Count > 1000) return Conflict("Observation limit reached");
        foreach (var n in matched)
        {
            var key = $"{cid}:{r.GraphRevisionId}:{r.MessageId}:{n.Id}";
            if (!known.Contains(key)) existing.Add(AddObservation(cid, r.GraphRevisionId, r.MessageId, actor, "name-match-v1", n.Id, null, null, "mention", 1m, key));
        }
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        var items = new List<object>(); foreach (var o in existing.OrderBy(x => x.Id)) items.Add(await Observation(o, ct));
        return Results.Ok(new { items, algorithm = "name-match-v1" });
    }
    public async Task<IResult> ReadObservation(Guid id, ClaimsPrincipal u, CancellationToken ct)
    {
        var o = await db.Observations.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id && x.StudentId == Actor(u), ct);
        return o is null ? Results.NotFound() : Results.Ok(await Observation(o, ct));
    }
    public async Task<IResult> Correct(Guid id, CorrectionRequest r, ClaimsPrincipal u, CancellationToken ct)
    {
        var o = await db.Observations.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id && x.StudentId == Actor(u), ct);
        if (o is null) return Results.NotFound();
        if (!Shape(r.FromNodeId, r.ToNodeId, r.Relation, r.Stage, r.Confidence) || r.Status is not ("pending" or "accepted" or "rejected") ||
            string.IsNullOrWhiteSpace(r.Reason) || r.Reason.Length > 2000 || !await NodesExist(o.GraphRevisionId, r.FromNodeId, r.ToNodeId, ct))
            return Invalid("Invalid correction, reason, status or nodes.");
        var version = await db.Corrections.Where(x => x.ObservationId == id).MaxAsync(x => x.Version, ct);
        if (r.Version != version || version >= 100) return Conflict("Observation has changed or reached its revision limit");
        db.Corrections.Add(new() { ObservationId = id, GraphRevisionId = o.GraphRevisionId, Version = version + 1, FromNodeId = r.FromNodeId,
            ToNodeId = r.ToNodeId, Relation = r.Relation, Stage = r.Stage, Confidence = r.Confidence, Status = r.Status, Reason = r.Reason.Trim(), CreatedAt = clock.GetUtcNow() });
        await db.SaveChangesAsync(ct);
        return Results.Ok(await Observation(o, ct));
    }
    private async Task<object> Observation(GraphObservation o, CancellationToken ct)
    {
        var history = await db.Corrections.AsNoTracking().Where(x => x.ObservationId == o.Id).OrderBy(x => x.Version).ToArrayAsync(ct);
        return Observation(o, history);
    }
    private static object Observation(GraphObservation o, ObservationRevision[] history) => new { o.Id, o.ConversationId, o.GraphRevisionId, o.MessageId, o.Origin, o.CreatedAt,
        sourceUrl = $"/api/graphs/conversations/{o.ConversationId}/messages/{o.MessageId}", current = history[^1], history };
    public async Task<IResult> Source(Guid cid, Guid mid, ClaimsPrincipal u, bool html, CancellationToken ct)
    {
        var m = await messages.Message(cid, mid, Actor(u), ct);
        return m is null ? Results.NotFound() : html ? Results.Content(GraphHtml.Source(m), "text/html; charset=utf-8") : Results.Ok(m);
    }
    public async Task<IResult> Map(Guid cid, Guid rid, ClaimsPrincipal u, bool html, CancellationToken ct)
    {
        var actor = Actor(u);
        if (await messages.Conversation(cid, actor, ct) is null || !await Compatible(cid, rid, actor, ct)) return Results.NotFound();
        var graph = await db.Revisions.AsNoTracking().SingleAsync(x => x.Id == rid, ct);
        var nodes = await db.Nodes.AsNoTracking().Where(x => x.RevisionId == rid).OrderBy(x => x.Id).ToArrayAsync(ct);
        var edges = await db.Relations.AsNoTracking().Where(x => x.RevisionId == rid).OrderBy(x => x.FromNodeId).ThenBy(x => x.ToNodeId).ThenBy(x => x.Relation).ToArrayAsync(ct);
        var observations = await db.Observations.AsNoTracking().Where(x => x.StudentId == actor && x.ConversationId == cid && x.GraphRevisionId == rid).OrderBy(x => x.Id).ToArrayAsync(ct);
        var ids = observations.Select(x => x.Id).ToArray();
        var revisions = await db.Corrections.AsNoTracking().Where(x => ids.Contains(x.ObservationId)).OrderBy(x => x.Version).ToArrayAsync(ct);
        var byId = revisions.ToLookup(x => x.ObservationId);
        var current = observations.Select(x => byId[x.Id].Last()).Where(x => x.Status != "rejected").ToArray();
        var accepted = current.Where(x => x.Status == "accepted").SelectMany(x => new[] { (Guid?)x.FromNodeId, x.ToNodeId }).Where(x => x.HasValue).Select(x => x!.Value).ToHashSet();
        var mentioned = current.SelectMany(x => new[] { (Guid?)x.FromNodeId, x.ToNodeId }).Where(x => x.HasValue).Select(x => x!.Value).ToHashSet();
        var missing = nodes.Where(x => !mentioned.Contains(x.Id)).Select(x => x.Id).ToArray();
        var gaps = edges.Where(x => x.Relation == "requires" && accepted.Contains(x.FromNodeId) && !accepted.Contains(x.ToNodeId)).ToArray();
        var differences = current.Where(x => x.ToNodeId != null && !edges.Any(e => e.FromNodeId == x.FromNodeId && e.ToNodeId == x.ToNodeId && e.Relation == x.Relation)).Select(x => x.ObservationId).ToArray();
        var items = observations.Select(x => Observation(x, byId[x.Id].ToArray())).ToArray();
        if (!html) return Results.Ok(new { conversationId = cid, graphRevisionId = rid, nodes, edges, observations = items,
            comparison = new { mentionedNodeIds = mentioned.Order().ToArray(), acceptedNodeIds = accepted.Order().ToArray(), unmentionedNodeIds = missing, prerequisiteGaps = gaps, differingObservationIds = differences, masteryEvaluated = false } });
        return Results.Content(GraphHtml.Render(graph, nodes, edges, observations, byId, accepted, mentioned, gaps, differences.Length), "text/html; charset=utf-8");
    }
}
