using System.Text.Json;
using AITeacher.Api.Features.Assessments;
using Microsoft.EntityFrameworkCore;

namespace AITeacher.Api.Features.Learning;

public sealed record EvidenceMessage(Guid Id, string Json);
public interface IAssessmentEvidenceFeed
{
    Task<EvidenceMessage[]> Pending(CancellationToken ct);
    Task Acknowledge(Guid id, CancellationToken ct);
    Task<bool> Covers(Guid definitionId, Guid revisionId, Guid conceptId, CancellationToken ct);
    Task<bool> Completed(Guid attemptId, string student, Guid definitionId, DateTimeOffset dueAt, CancellationToken ct);
}
// Application adapter: only this assessment-owned adapter reads assessment persistence.
public sealed class AssessmentEvidenceFeed(AssessmentDbContext db) : IAssessmentEvidenceFeed
{
    public async Task<EvidenceMessage[]> Pending(CancellationToken ct) => await db.EvidenceEvents.AsNoTracking()
        .Where(e => !db.EvidenceReceipts.Any(r => r.Id == e.Id)).OrderBy(e => e.CreatedAt).ThenBy(e => e.Id)
        .Take(100).Select(e => new EvidenceMessage(e.Id, e.PayloadJson)).ToArrayAsync(ct);
    public async Task Acknowledge(Guid id, CancellationToken ct) =>
        await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO assessments.evidence_receipts (\"Id\") VALUES ({id}) ON CONFLICT DO NOTHING", ct);
    public async Task<bool> Covers(Guid definitionId, Guid revisionId, Guid conceptId, CancellationToken ct)
    {
        var r = await db.Revisions.AsNoTracking().SingleOrDefaultAsync(x => x.Id == definitionId && x.Kind == "definition", ct);
        if (r is null) return false;
        var d = JsonSerializer.Deserialize<DefinitionDocument>(r.DocumentJson, AssessmentService.Json)!;
        if (d.UnitRevisionId != revisionId) return false;
        var questions = await db.Revisions.AsNoTracking().Where(x => d.QuestionRevisionIds.Contains(x.Id)).ToArrayAsync(ct);
        return questions.Any(q => JsonSerializer.Deserialize<QuestionDocument>(q.DocumentJson, AssessmentService.Json)!.ConceptIds.Contains(conceptId));
    }
    public async Task<bool> Completed(Guid attemptId, string student, Guid definitionId, DateTimeOffset dueAt, CancellationToken ct)
    {
        var a = await db.Attempts.AsNoTracking().SingleOrDefaultAsync(x => x.Id == attemptId && x.StudentId == student && x.DefinitionRevisionId == definitionId, ct);
        if (a?.SubmittedAt is null || a.StartedAt < dueAt) return false;
        var r = await db.Revisions.AsNoTracking().SingleAsync(x => x.Id == definitionId, ct);
        var d = JsonSerializer.Deserialize<DefinitionDocument>(r.DocumentJson, AssessmentService.Json)!;
        return JsonSerializer.Deserialize<ScoreDocument[]>(a.ScoresJson!, AssessmentService.Json)!.Length == d.QuestionRevisionIds.Length ||
            await db.Reviews.AnyAsync(x => x.AttemptId == attemptId, ct);
    }
}
