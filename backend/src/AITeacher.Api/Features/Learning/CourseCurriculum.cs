using System.Text.Json;
using AITeacher.Api.Features.Assessments;
using AITeacher.Api.Features.Catalog;
using AITeacher.Api.Features.Editorial;
using AITeacher.Modules.Curriculum.Publishing;
using Microsoft.EntityFrameworkCore;

namespace AITeacher.Api.Features.Learning;

public sealed record CourseUnit(Guid UnitId, string Title, Guid TopicId, string TopicName, Guid CategoryId, string CategoryName);
public sealed record CourseOutline(Guid SubjectId, string Slug, string Name, CourseUnit[] Units);
/// <summary>Graded results only come from assessment-mode tests that show feedback, so progress never reveals hidden scores.</summary>
public sealed record UnitActivity(DateTimeOffset LastActivityAt, decimal? BestFraction, DateTimeOffset? PassedAt);
public interface ICourseCurriculum
{
    Task<CourseOutline[]> Courses(CancellationToken ct);
    Task<Dictionary<Guid, UnitActivity>> Activity(string student, decimal passing, CancellationToken ct);
}
// Application adapter: the only place where Learning reads catalog, editorial and assessment persistence for courses.
public sealed class CourseCurriculum(CatalogDbContext catalog, EditorialDbContext editorial, AssessmentDbContext assessments) : ICourseCurriculum
{
    private static T Read<T>(string json) => JsonSerializer.Deserialize<T>(json, AssessmentService.Json)!;
    public async Task<CourseOutline[]> Courses(CancellationToken ct)
    {
        var subjects = await catalog.Subjects.AsNoTracking().Where(x => x.IsAvailable).ToArrayAsync(ct);
        var categories = await catalog.Categories.AsNoTracking().Where(x => x.IsAvailable).ToDictionaryAsync(x => x.Id, ct);
        var topics = await catalog.Topics.AsNoTracking().Where(x => x.IsAvailable).ToDictionaryAsync(x => x.Id, ct);
        var units = await (from unit in editorial.Units.AsNoTracking()
                           join revision in editorial.Revisions.AsNoTracking() on unit.PublishedRevisionId equals (Guid?)revision.Id
                           select new { unit.Id, unit.TopicId, RevisionId = revision.Id, revision.DocumentJson }).ToArrayAsync(ct);
        // A unit counts towards a course only when a graded test can complete it; readings, practice-only units and
        // tests that hide their score (feedback=never) stay optional, otherwise they would block the diploma forever.
        var graded = (await assessments.Revisions.AsNoTracking().Where(x => x.Kind == "definition").Select(x => x.DocumentJson).ToArrayAsync(ct))
            .Select(Read<DefinitionDocument>).Where(d => d.Mode == "assessment" && d.Feedback == "afterSubmission")
            .Select(d => (d.UnitId, d.UnitRevisionId)).ToHashSet();
        var placed = units.Where(u => graded.Contains((u.Id, u.RevisionId)) && topics.ContainsKey(u.TopicId) && categories.ContainsKey(topics[u.TopicId].CategoryId))
            .Select(u => (unit: u, topic: topics[u.TopicId], category: categories[topics[u.TopicId].CategoryId],
                document: JsonSerializer.Deserialize<UnitDocument>(u.DocumentJson, EditorialService.Json)!))
            .Where(x => x.document.Kind != "reading").ToArray();
        return subjects.OrderBy(s => s.SortOrder).ThenBy(s => s.Name)
            .Select(s => new CourseOutline(s.Id, s.Slug, s.Name, placed.Where(x => x.category.SubjectId == s.Id)
                .OrderBy(x => x.category.SortOrder).ThenBy(x => x.topic.SortOrder).ThenBy(x => x.document.Title, StringComparer.Ordinal)
                .Select(x => new CourseUnit(x.unit.Id, x.document.Title, x.topic.Id, x.topic.Name, x.category.Id, x.category.Name)).ToArray()))
            .Where(c => c.Units.Length > 0).ToArray();
    }
    public async Task<Dictionary<Guid, UnitActivity>> Activity(string student, decimal passing, CancellationToken ct)
    {
        var attempts = await assessments.Attempts.AsNoTracking().Where(a => a.StudentId == student)
            .Select(a => new { a.DefinitionRevisionId, a.StartedAt, a.SubmittedAt, a.ScoresJson,
                Reviewed = assessments.Reviews.Where(r => r.AttemptId == a.Id).Select(r => r.ScoresJson).FirstOrDefault() }).ToArrayAsync(ct);
        var definitionIds = attempts.Select(a => a.DefinitionRevisionId).Distinct().ToArray();
        var definitions = (await assessments.Revisions.AsNoTracking().Where(r => definitionIds.Contains(r.Id)).Select(r => new { r.Id, r.DocumentJson }).ToArrayAsync(ct))
            .ToDictionary(r => r.Id, r => Read<DefinitionDocument>(r.DocumentJson));
        var questionIds = definitions.Values.SelectMany(d => d.QuestionRevisionIds).Distinct().ToArray();
        var rubric = (await assessments.Revisions.AsNoTracking().Where(r => questionIds.Contains(r.Id)).Select(r => new { r.Id, r.DocumentJson }).ToArrayAsync(ct))
            .Where(q => AssessmentService.IsRubric(Read<QuestionDocument>(q.DocumentJson))).Select(q => q.Id).ToHashSet();
        var activity = new Dictionary<Guid, UnitActivity>();
        foreach (var attempt in attempts)
        {
            var d = definitions[attempt.DefinitionRevisionId];
            var at = attempt.SubmittedAt ?? attempt.StartedAt;
            var graded = attempt.SubmittedAt is not null && d.Mode == "assessment" && d.Feedback == "afterSubmission" &&
                (attempt.Reviewed is not null || !d.QuestionRevisionIds.Any(rubric.Contains));
            var scores = graded ? Read<ScoreDocument[]>(attempt.Reviewed ?? attempt.ScoresJson!) : [];
            decimal? fraction = scores.Length > 0 ? scores.Average(x => x.Fraction) : null;
            var current = activity.GetValueOrDefault(d.UnitId, new UnitActivity(at, null, null));
            activity[d.UnitId] = new UnitActivity(at > current.LastActivityAt ? at : current.LastActivityAt,
                fraction > (current.BestFraction ?? -1) ? fraction : current.BestFraction,
                fraction >= passing && (current.PassedAt is null || attempt.SubmittedAt < current.PassedAt) ? attempt.SubmittedAt : current.PassedAt);
        }
        return activity;
    }
}
