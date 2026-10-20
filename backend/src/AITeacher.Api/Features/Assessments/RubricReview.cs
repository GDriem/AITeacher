using System.Security.Claims;
using Microsoft.EntityFrameworkCore;

namespace AITeacher.Api.Features.Assessments;

public sealed partial class AssessmentService
{
    private static bool IsRubric(QuestionDocument d) => d.Type is "openResponse" or "caseAnalysis" or "practicalExercise";
    private static void ValidateQuestion(QuestionRequest request)
    {
        var d = request.Document;
        if (!IsRubric(d))
        {
            if (d.Rubric is not null) throw new ArgumentException("Closed questions cannot have a rubric.");
            _ = Question(request.Id, request.Number, d);
            return;
        }
        var r = d.Rubric;
        if (request.Id == Guid.Empty || request.Number < 1 || !Ids(d.ObjectiveIds) || !Ids(d.ConceptIds) ||
            string.IsNullOrWhiteSpace(d.Prompt) || d.Prompt.Length > 20000 ||
            d.Options is not { Length: 0 } || d.CorrectOptionIds is not { Length: 0 } || d.ScoringPolicy != "rubric" ||
            r is null || r.Version < 1 || string.IsNullOrWhiteSpace(r.PrivateGuidance) || r.PrivateGuidance.Length > 20000 ||
            r.Criteria is not { Length: > 0 and <= 50 } || r.Criteria.Any(c => c is null || c.Id == Guid.Empty ||
                string.IsNullOrWhiteSpace(c.Description) || c.Description.Length > 2000 || c.MaxPoints is <= 0 or > 1000) ||
            r.Criteria.Select(c => c.Id).Distinct().Count() != r.Criteria.Length)
            throw new ArgumentException("Rubric questions require valid references, prompt, empty options and key, and a versioned rubric with distinct weighted criteria.");
    }
    public async Task<IResult> GetReview(Guid id, CancellationToken ct)
    {
        var a = await db.Attempts.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct);
        if (a is null) return Results.NotFound();
        if (a.SubmittedAt is null) return Conflict("Attempt has not been submitted");
        var definition = await db.Revisions.AsNoTracking().SingleAsync(x => x.Id == a.DefinitionRevisionId, ct);
        var d = Read<DefinitionDocument>(definition.DocumentJson);
        var rows = await db.Revisions.AsNoTracking().Where(x => d.QuestionRevisionIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id, ct);
        var review = await db.Reviews.AsNoTracking().SingleOrDefaultAsync(x => x.AttemptId == a.Id, ct);
        return Results.Ok(new { attemptId = a.Id, a.DefinitionRevisionId, a.SubmittedAt,
            questions = d.QuestionRevisionIds.Select(q => new { revisionId = q, document = Read<QuestionDocument>(rows[q].DocumentJson) }),
            answers = Read<AnswerDocument[]>(a.AnswersJson!), review });
    }
    public async Task<IResult> Review(Guid id, ReviewRequest request, ClaimsPrincipal user, CancellationToken ct)
    {
        if (request.RequestId == Guid.Empty || request.Grades is not { Length: > 0 and <= 100 } ||
            request.Grades.Any(g => g is null || g.Criteria is not { Length: > 0 and <= 50 } ||
                g.Criteria.Any(c => c is null) || string.IsNullOrWhiteSpace(g.Feedback) || g.Feedback.Length > 10000) ||
            request.Grades.Select(g => g.QuestionRevisionId).Distinct().Count() != request.Grades.Length)
            return Invalid("A review requires distinct question grades, criteria, feedback and a request ID.");
        var normalized = request.Grades.OrderBy(g => g.QuestionRevisionId)
            .Select(g => g with { Criteria = g.Criteria.OrderBy(c => c.CriterionId).ToArray() }).ToArray();
        var json = Write(normalized);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var a = await db.Attempts.FromSqlInterpolated($"SELECT * FROM assessments.attempts WHERE \"Id\" = {id} FOR UPDATE").SingleOrDefaultAsync(ct);
        if (a is null) return Results.NotFound();
        if (a.SubmittedAt is null) return Conflict("Attempt has not been submitted");
        var previous = await db.Reviews.SingleOrDefaultAsync(x => x.AttemptId == id, ct);
        if (previous is not null)
            return previous.RequestId == request.RequestId && previous.ReviewerId == Actor(user) && Write(Read<QuestionGrade[]>(previous.GradesJson)) == json
                ? Results.Ok(new { attemptId = id, reviewId = previous.Id }) : Conflict("Attempt already reviewed");
        var definition = await db.Revisions.AsNoTracking().SingleAsync(x => x.Id == a.DefinitionRevisionId, ct);
        var d = Read<DefinitionDocument>(definition.DocumentJson);
        var rows = await db.Revisions.AsNoTracking().Where(x => d.QuestionRevisionIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id, ct);
        var open = rows.Where(x => IsRubric(Read<QuestionDocument>(x.Value.DocumentJson))).ToDictionary();
        if (open.Count != normalized.Length || normalized.Any(g => !open.ContainsKey(g.QuestionRevisionId)))
            return Invalid("Review must grade exactly every rubric question in this attempt.");
        var scores = Read<ScoreDocument[]>(a.ScoresJson!).ToList();
        foreach (var grade in normalized)
        {
            var rubric = Read<QuestionDocument>(open[grade.QuestionRevisionId].DocumentJson).Rubric!;
            if (grade.Criteria.Length != rubric.Criteria.Length || grade.Criteria.Select(c => c.CriterionId).Distinct().Count() != grade.Criteria.Length ||
                grade.Criteria.Any(c => !rubric.Criteria.Any(r => r.Id == c.CriterionId && c.Points >= 0 && c.Points <= r.MaxPoints)))
                return Invalid("Every rubric criterion needs exactly one score within its allowed range.");
            var fraction = grade.Criteria.Sum(c => c.Points) / rubric.Criteria.Sum(c => c.MaxPoints);
            scores.Add(new(grade.QuestionRevisionId, fraction, fraction == 1, grade.Feedback));
        }
        var orderedScores = d.QuestionRevisionIds.Select(q => scores.Single(s => s.QuestionRevisionId == q)).ToArray();
        var now = clock.GetUtcNow();
        var review = new AssessmentReview { AttemptId = id, RequestId = request.RequestId, ReviewerId = Actor(user),
            CreatedAt = now, GradesJson = json, ScoresJson = Write(orderedScores) };
        db.Reviews.Add(review);
        AddEvidence(a, definition, d, rows, orderedScores, a.SubmittedAt.Value, review.Id);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return Results.Ok(new { attemptId = id, reviewId = review.Id });
    }
}
