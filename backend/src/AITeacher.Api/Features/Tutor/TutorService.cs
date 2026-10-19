using System.Diagnostics;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;

namespace AITeacher.Api.Features.Tutor;

public sealed class TutorService(TutorDbContext db, ITutorContent content, ContextBuilder contexts, TutorProviders providers, TimeProvider clock)
{
    private static string Actor(ClaimsPrincipal user) => user.FindFirstValue(ClaimTypes.NameIdentifier)!;
    private static string Json<T>(T value) => JsonSerializer.Serialize(value, ContextBuilder.Json);
    private static IResult Invalid(string message) => Results.ValidationProblem(new Dictionary<string, string[]> { ["request"] = [message] });
    private static IResult Conflict(string message = "Conversation has changed or a turn is active; reload or retry the same request") => Results.Problem(statusCode: 409, title: message);
    private static bool Page(int offset, int limit) => offset >= 0 && limit is >= 1 and <= 100;
    private static object ConversationView(Conversation c) => new { c.Id, c.UnitId, c.RevisionId, c.Mode, c.ActivityId, c.Version, c.ActiveTurnId, c.CreatedAt };
    private static object MessageView(TutorMessage m) => new { m.Id, m.TurnId, m.Sequence, m.Role, m.Text, m.CreatedAt, sources = JsonSerializer.Deserialize<TutorSource[]>(m.SourcesJson, ContextBuilder.Json) };
    private static object NoteView(StudentNote n) => new { n.Id, n.Kind, n.Text, n.ConversationId, n.MessageId, n.Version, n.CreatedAt, n.UpdatedAt, origin = JsonSerializer.Deserialize<JsonElement>(n.OriginJson) };

    public async Task<IResult> Create(CreateConversationRequest request, ClaimsPrincipal user, CancellationToken ct)
    {
        if (request.UnitId == Guid.Empty || request.Mode is not ("chat" or "reading" or "practice")) return Invalid("A published unit and valid mode are required.");
        var unit = await content.Active(request.UnitId, ct);
        if (unit is null) return Results.NotFound();
        if (request.Mode == "chat" ? request.ActivityId is not null : request.Mode == "reading"
            ? !unit.Readings.Any(x => x.Id == request.ActivityId) : !unit.Exercises.Any(x => x.Id == request.ActivityId))
            return Invalid("Activity must belong to the active publication and match the mode; chat has no activity.");
        var conversation = new Conversation { StudentId = Actor(user), UnitId = unit.UnitId, RevisionId = unit.RevisionId,
            Mode = request.Mode, ActivityId = request.ActivityId, CreatedAt = clock.GetUtcNow() };
        db.Conversations.Add(conversation);
        await db.SaveChangesAsync(ct);
        return Results.Created($"/api/tutor/conversations/{conversation.Id}", ConversationView(conversation));
    }

    public async Task<IResult> List(int offset, int limit, ClaimsPrincipal user, CancellationToken ct)
    {
        if (!Page(offset, limit)) return Invalid("Invalid pagination.");
        var query = db.Conversations.AsNoTracking().Where(x => x.StudentId == Actor(user));
        var total = await query.CountAsync(ct);
        var rows = await query.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id).Skip(offset).Take(limit).ToListAsync(ct);
        return Results.Ok(new { items = rows.Select(ConversationView), total, offset, limit });
    }
    public async Task<IResult> Get(Guid id, ClaimsPrincipal user, CancellationToken ct)
    {
        var row = await db.Conversations.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id && x.StudentId == Actor(user), ct);
        return row is null ? Results.NotFound() : Results.Ok(ConversationView(row));
    }
    public async Task<IResult> Messages(Guid id, int offset, int limit, ClaimsPrincipal user, CancellationToken ct)
    {
        if (!Page(offset, limit)) return Invalid("Invalid pagination.");
        if (!await Owns(id, user, ct)) return Results.NotFound();
        var query = db.Messages.AsNoTracking().Where(x => x.ConversationId == id);
        var total = await query.CountAsync(ct);
        var rows = await query.OrderBy(x => x.Sequence).Skip(offset).Take(limit).ToListAsync(ct);
        return Results.Ok(new { items = rows.Select(MessageView), total, offset, limit });
    }

    // Row lock is held only for reservation/finalization, never during model I/O.
    private Task<Conversation?> Lock(Guid id, string student, CancellationToken ct) =>
        db.Conversations.FromSqlInterpolated($"SELECT * FROM conversations.conversations WHERE \"Id\"={id} AND \"StudentId\"={student} FOR UPDATE")
            .SingleOrDefaultAsync(ct);
    private Task<bool> Owns(Guid id, ClaimsPrincipal user, CancellationToken ct) => db.Conversations.AnyAsync(x => x.Id == id && x.StudentId == Actor(user), ct);
    private async Task<List<TutorMessage>> History(Guid conversation, CancellationToken ct) =>
        await (from m in db.Messages.AsNoTracking() join t in db.Turns.AsNoTracking() on m.TurnId equals t.Id
               where m.ConversationId == conversation && t.State == "completed"
               orderby m.Sequence descending select m).Take(9).OrderBy(x => x.Sequence).ToListAsync(ct);

    public async Task<IResult> Turn(Guid id, CreateTurnRequest request, ClaimsPrincipal user, CancellationToken ct)
    {
        if (request.RequestId == Guid.Empty || request.Version < 1 || string.IsNullOrWhiteSpace(request.Text) || request.Text.Length > 4000)
            return Invalid("requestId, positive version and text of 1–4000 characters are required.");
        var student = Actor(user);
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(Json(new { id, request.Version, request.Text }))));
        Conversation conversation;
        TutorTurn turn;
        TutorContext context;
        ProviderSelection selection;
        var lease = Guid.NewGuid();
        await using (var tx = await db.Database.BeginTransactionAsync(ct))
        {
            var found = await Lock(id, student, ct);
            if (found is null) return Results.NotFound();
            conversation = found;
            var existing = await db.Turns.SingleOrDefaultAsync(x => x.StudentId == student && x.RequestId == request.RequestId, ct);
            if (existing is not null)
            {
                if (existing.InputHash != hash || existing.ConversationId != id) return Conflict("requestId was already used for a different request");
                if (existing.State == "completed") return await TurnResult(existing, ct);
                if (existing.State == "pending" && existing.LeaseUntil > clock.GetUtcNow()) return Conflict();
                if (conversation.Version != existing.ReservedVersion || (conversation.ActiveTurnId is not null && conversation.ActiveTurnId != existing.Id)) return Conflict();
                turn = existing;
                selection = JsonSerializer.Deserialize<ProviderSelection>(turn.ProviderJson, ContextBuilder.Json)!;
            }
            else
            {
                if (conversation.Version != request.Version || conversation.ActiveTurnId is not null) return Conflict();
                selection = providers.Select("Tutor");
                turn = new TutorTurn { ConversationId = id, StudentId = student, RequestId = request.RequestId,
                    InputHash = hash, ReservedVersion = checked(conversation.Version + 1), ProviderJson = Json(selection) };
            }
            var unit = await content.Active(conversation.UnitId, ct);
            if (unit is null || unit.RevisionId != conversation.RevisionId) return Conflict("Publication changed or was withdrawn; create a new conversation");
            try { context = contexts.Build(unit, conversation, await History(id, ct), request.Text); }
            catch (ArgumentException) { return Invalid("Input cannot fit the context budget."); }
            turn.State = "pending";
            turn.LeaseToken = lease;
            turn.LeaseUntil = clock.GetUtcNow().AddMinutes(2);
            turn.ManifestJson = Json(context.Manifest);
            conversation.ActiveTurnId = turn.Id;
            if (existing is null)
            {
                conversation.Version = turn.ReservedVersion;
                db.Turns.Add(turn);
                db.Messages.Add(new TutorMessage { ConversationId = id, TurnId = turn.Id, Sequence = checked(turn.ReservedVersion * 2),
                    Text = request.Text, CreatedAt = clock.GetUtcNow() });
            }
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
        }
        var timer = Stopwatch.StartNew();
        try
        {
            var reply = await providers.Generate(selection, context, ct);
            var active = await content.Active(conversation.UnitId, ct);
            if (active is null || active.RevisionId != conversation.RevisionId) throw new TutorPublicationException();
            db.ChangeTracker.Clear();
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            var locked = await Lock(id, student, ct);
            var current = await db.Turns.SingleAsync(x => x.Id == turn.Id, ct);
            if (current.LeaseToken != lease || current.State != "pending" || locked!.ActiveTurnId != current.Id) return Conflict();
            current.State = "completed";
            current.InputTokens = reply.InputTokens;
            current.OutputTokens = reply.OutputTokens;
            current.LatencyMs = timer.ElapsedMilliseconds;
            locked.ActiveTurnId = null;
            db.Messages.Add(new TutorMessage { ConversationId = id, TurnId = current.Id, Sequence = checked(current.ReservedVersion * 2 + 1),
                Role = "assistant", Text = reply.Text, SourcesJson = Json(context.Sources.Where(x => reply.SourceIds.Contains(x.Id)).ToArray()), CreatedAt = clock.GetUtcNow() });
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
            return await TurnResult(current, ct);
        }
        catch (Exception ex) when (ex is TutorOutputException or TutorUnavailableException or HttpRequestException or OperationCanceledException or TutorPublicationException)
        {
            // Independent bounded cleanup: a disconnected caller must not hold the conversation indefinitely.
            using var cleanup = new CancellationTokenSource(TimeSpan.FromSeconds(5));
            db.ChangeTracker.Clear();
            await using var tx = await db.Database.BeginTransactionAsync(cleanup.Token);
            var locked = await Lock(id, student, cleanup.Token);
            var current = await db.Turns.SingleAsync(x => x.Id == turn.Id, cleanup.Token);
            if (current.LeaseToken == lease && current.State == "pending")
            {
                current.State = "failed";
                if (locked!.ActiveTurnId == current.Id) locked.ActiveTurnId = null;
                await db.SaveChangesAsync(cleanup.Token);
            }
            await tx.CommitAsync(cleanup.Token);
            if (ex is OperationCanceledException && ct.IsCancellationRequested) throw;
            return Results.Problem(statusCode: ex is TutorPublicationException ? 409 : ex is TutorOutputException ? 502 : 503,
                title: ex is TutorPublicationException ? "Publication changed during generation" : "Tutor response unavailable; retry the same request");
        }
    }
    private async Task<IResult> TurnResult(TutorTurn turn, CancellationToken ct)
    {
        var messages = await db.Messages.AsNoTracking().Where(x => x.TurnId == turn.Id).OrderBy(x => x.Sequence).ToListAsync(ct);
        return Results.Ok(new { turn.Id, turn.ConversationId, turn.RequestId, turn.State, version = turn.ReservedVersion,
            messages = messages.Select(MessageView), provider = JsonSerializer.Deserialize<ProviderSelection>(turn.ProviderJson, ContextBuilder.Json),
            manifest = JsonSerializer.Deserialize<ContextManifest>(turn.ManifestJson, ContextBuilder.Json), turn.InputTokens, turn.OutputTokens, turn.LatencyMs });
    }

    public async Task<IResult> CreateNote(CreateNoteRequest request, ClaimsPrincipal user, CancellationToken ct)
    {
        if (request.Kind is not ("student" or "savedMessage" or "summary")) return Invalid("Invalid note kind.");
        if (request.ConversationId is { } conversationId && !await Owns(conversationId, user, ct)) return Results.NotFound();
        var note = new StudentNote { StudentId = Actor(user), Kind = request.Kind, ConversationId = request.ConversationId,
            CreatedAt = clock.GetUtcNow(), UpdatedAt = clock.GetUtcNow() };
        switch (request.Kind)
        {
            case "student":
                if (request.MessageId is not null || string.IsNullOrWhiteSpace(request.Text) || request.Text.Length > 12000) return Invalid("Student notes require text and no messageId.");
                note.Text = request.Text;
                break;
            case "savedMessage":
                if (request.ConversationId is null || request.MessageId is null || request.Text is not null) return Invalid("Saved messages require conversationId/messageId and no text.");
                var message = await db.Messages.AsNoTracking().SingleOrDefaultAsync(x => x.Id == request.MessageId && x.ConversationId == request.ConversationId, ct);
                if (message is null) return Results.NotFound();
                note.Text = message.Text;
                note.MessageId = message.Id;
                note.OriginJson = Json(new { messageId = message.Id, sources = JsonSerializer.Deserialize<TutorSource[]>(message.SourcesJson, ContextBuilder.Json) });
                break;
            case "summary":
                if (request.ConversationId is null || request.MessageId is not null || request.Text is not null) return Invalid("Summaries require only conversationId.");
                var history = await History(request.ConversationId.Value, ct);
                if (history.Count == 0) return Invalid("No completed messages to summarize.");
                var context = contexts.Summary(history);
                var selection = providers.Select("Summary");
                var reply = await providers.Generate(selection, context, ct);
                note.Text = reply.Text;
                note.OriginJson = Json(new { manifest = context.Manifest, provider = selection, reply.InputTokens, reply.OutputTokens });
                break;
        }
        db.Notes.Add(note);
        await db.SaveChangesAsync(ct);
        return Results.Created($"/api/tutor/notes/{note.Id}", NoteView(note));
    }
    public async Task<IResult> GetNote(Guid id, ClaimsPrincipal user, CancellationToken ct)
    {
        var note = await db.Notes.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id && x.StudentId == Actor(user), ct);
        return note is null ? Results.NotFound() : Results.Ok(NoteView(note));
    }
    public async Task<IResult> Notes(int offset, int limit, ClaimsPrincipal user, CancellationToken ct)
    {
        if (!Page(offset, limit)) return Invalid("Invalid pagination.");
        var query = db.Notes.AsNoTracking().Where(x => x.StudentId == Actor(user));
        var total = await query.CountAsync(ct);
        var rows = await query.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id).Skip(offset).Take(limit).ToListAsync(ct);
        return Results.Ok(new { items = rows.Select(NoteView), total, offset, limit });
    }
    public async Task<IResult> EditNote(Guid id, UpdateNoteRequest request, ClaimsPrincipal user, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Text) || request.Text.Length > 12000 || request.Version < 1) return Invalid("Positive version and text of 1–12000 characters are required.");
        var note = await db.Notes.SingleOrDefaultAsync(x => x.Id == id && x.StudentId == Actor(user), ct);
        if (note is null) return Results.NotFound();
        if (note.Version != request.Version) return Conflict("Note changed; reload before saving");
        note.Text = request.Text;
        note.Version = checked(note.Version + 1);
        note.UpdatedAt = clock.GetUtcNow();
        await db.SaveChangesAsync(ct);
        return Results.Ok(NoteView(note));
    }
    public async Task<IResult> DeleteNote(Guid id, long version, ClaimsPrincipal user, CancellationToken ct)
    {
        var note = await db.Notes.SingleOrDefaultAsync(x => x.Id == id && x.StudentId == Actor(user), ct);
        if (note is null) return Results.NotFound();
        if (note.Version != version) return Conflict("Note changed; reload before deleting");
        db.Notes.Remove(note);
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }
}
public sealed class TutorPublicationException : Exception;
