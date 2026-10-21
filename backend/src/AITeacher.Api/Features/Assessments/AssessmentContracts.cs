using System.Text.Json;
using AITeacher.Api.Features.Editorial;
using AITeacher.Modules.Curriculum.Publishing;
using Microsoft.EntityFrameworkCore;

namespace AITeacher.Api.Features.Assessments;

public sealed record QuestionDocument(Guid UnitId, Guid UnitRevisionId, Guid[] ObjectiveIds, Guid[] ConceptIds,
    string Type, string Prompt, OptionDocument[] Options, Guid[] CorrectOptionIds, string ScoringPolicy, RubricDocument? Rubric = null);
public sealed record OptionDocument(Guid Id, string Text);
public sealed record DefinitionDocument(string Title, Guid UnitId, Guid UnitRevisionId, Guid[] ObjectiveIds,
    Guid[] QuestionRevisionIds, string Mode, int TimeLimitMinutes, int MaxAttempts, string Feedback, string Assistance);
public sealed record QuestionRequest(Guid Id, int Number, QuestionDocument Document);
public sealed record DefinitionRequest(Guid Id, int Number, DefinitionDocument Document);
public sealed record StartAttemptRequest(Guid DefinitionRevisionId, Guid RequestId);
public sealed record AnswerDocument(Guid QuestionRevisionId, Guid[] SelectedOptionIds, string? Text = null);
public sealed record RubricDocument(int Version, RubricCriterion[] Criteria, string PrivateGuidance);
public sealed record RubricCriterion(Guid Id, string Description, decimal MaxPoints);
public sealed record CriterionGrade(Guid CriterionId, decimal Points);
public sealed record QuestionGrade(Guid QuestionRevisionId, CriterionGrade[] Criteria, string Feedback);
public sealed record ReviewRequest(Guid RequestId, QuestionGrade[] Grades);
public sealed record SubmitAttemptRequest(AnswerDocument[] Answers);
public sealed record ScoreDocument(Guid QuestionRevisionId, decimal Fraction, bool IsCorrect, string? Feedback = null);

// Application port: assessment persistence never navigates editorial EF entities.
public interface IAssessmentCurriculum
{
    Task<UnitDocument?> PublishedRevision(Guid unitId, Guid revisionId, CancellationToken ct);
}
public sealed class AssessmentCurriculum(EditorialDbContext db) : IAssessmentCurriculum
{
    public async Task<UnitDocument?> PublishedRevision(Guid unitId, Guid revisionId, CancellationToken ct)
    {
        var json = await (from r in db.Revisions.AsNoTracking()
                          join p in db.Publications on r.Id equals p.RevisionId
                          where r.UnitId == unitId && r.Id == revisionId select r.DocumentJson).SingleOrDefaultAsync(ct);
        return json is null ? null : JsonSerializer.Deserialize<UnitDocument>(json, AssessmentService.Json);
    }
}
