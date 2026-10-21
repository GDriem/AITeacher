using System.Text.Json;
using AITeacher.Api.Features.Editorial;
using AITeacher.Api.Features.Tutor;
using AITeacher.Modules.Curriculum.Publishing;
using Microsoft.EntityFrameworkCore;

namespace AITeacher.Api.Features.Graphs;

public sealed record GraphNodeInput(Guid Id, Guid UnitId, Guid UnitRevisionId, Guid ConceptId);
public sealed record GraphEdge(Guid FromNodeId, Guid ToNodeId, string Relation);
public sealed record GraphRequest(Guid GraphId, int Number, Guid TopicId, string Title, GraphNodeInput[] Nodes, GraphEdge[] Edges);
public sealed record ObservationRequest(Guid GraphRevisionId, Guid MessageId, Guid FromNodeId, Guid? ToNodeId,
    string? Relation, string Stage, decimal Confidence);
public sealed record ExtractRequest(Guid GraphRevisionId, Guid MessageId);
public sealed record CorrectionRequest(int Version, Guid FromNodeId, Guid? ToNodeId, string? Relation,
    string Stage, decimal Confidence, string Status, string Reason);
public sealed record GraphConcept(Guid TopicId, string Name);
public sealed record GraphConversation(Guid UnitId, Guid RevisionId);
public sealed record GraphMessage(Guid Id, string Text, string Role);

// Module contracts expose safe projections, never foreign tracked entities.
public interface IGraphCurriculum
{
    Task<GraphConcept?> Concept(Guid unitId, Guid revisionId, Guid conceptId, CancellationToken ct);
}
public sealed class GraphCurriculum(EditorialDbContext db) : IGraphCurriculum
{
    public async Task<GraphConcept?> Concept(Guid unitId, Guid revisionId, Guid conceptId, CancellationToken ct)
    {
        var row = await (from r in db.Revisions.AsNoTracking()
                         join p in db.Publications on r.Id equals p.RevisionId
                         join u in db.Units on r.UnitId equals u.Id
                         where r.UnitId == unitId && r.Id == revisionId select new { u.TopicId, r.DocumentJson }).SingleOrDefaultAsync(ct);
        if (row is null) return null;
        var concept = JsonSerializer.Deserialize<UnitDocument>(row.DocumentJson, GraphService.Json)!.Concepts.SingleOrDefault(x => x.Id == conceptId);
        return concept is null ? null : new(row.TopicId, concept.Name);
    }
}
public interface IGraphMessages
{
    Task<GraphConversation?> Conversation(Guid id, string student, CancellationToken ct);
    Task<GraphMessage?> Message(Guid conversationId, Guid messageId, string student, CancellationToken ct);
}
public sealed class GraphMessages(TutorDbContext db) : IGraphMessages
{
    public Task<GraphConversation?> Conversation(Guid id, string student, CancellationToken ct) => db.Conversations.AsNoTracking()
        .Where(x => x.Id == id && x.StudentId == student).Select(x => new GraphConversation(x.UnitId, x.RevisionId)).SingleOrDefaultAsync(ct);
    public Task<GraphMessage?> Message(Guid conversationId, Guid messageId, string student, CancellationToken ct) =>
        (from m in db.Messages.AsNoTracking() join c in db.Conversations on m.ConversationId equals c.Id
         where c.Id == conversationId && c.StudentId == student && m.Id == messageId
         select new GraphMessage(m.Id, m.Text, m.Role)).SingleOrDefaultAsync(ct);
}
