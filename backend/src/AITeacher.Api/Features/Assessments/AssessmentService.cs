using System.Security.Claims;
using System.Text.Json;
using AITeacher.Modules.Assessments.Questions;
using AITeacher.Modules.Assessments.Scoring;
using Microsoft.EntityFrameworkCore;

namespace AITeacher.Api.Features.Assessments;

public sealed partial class AssessmentService(AssessmentDbContext db, IAssessmentCurriculum curriculum, TimeProvider clock)
{
    internal static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private static T Read<T>(string json) => JsonSerializer.Deserialize<T>(json, Json)!;
    private static string Write<T>(T value) => JsonSerializer.Serialize(value, Json);
    private static string Actor(ClaimsPrincipal user) => user.FindFirstValue(ClaimTypes.NameIdentifier)!;
    private static IResult Invalid(string message) => Results.ValidationProblem(new Dictionary<string, string[]> { ["assessment"] = [message] });
    private static IResult Conflict(string message) => Results.Problem(statusCode: 409, title: message);
    private static bool Ids(Guid[]? ids, bool required = true) => ids is { Length: <= 200 } && (!required || ids.Length > 0) && ids.All(x => x != Guid.Empty) && ids.Distinct().Count() == ids.Length;

    private static ChoiceQuestion Question(AssessmentRevision revision) => Question(revision.ResourceId, revision.Number, Read<QuestionDocument>(revision.DocumentJson));
    private static ChoiceQuestion Question(Guid id, int number, QuestionDocument d)
    {
        var type = d.Type switch { "singleChoice" => QuestionType.SingleChoice, "multipleChoice" => QuestionType.MultipleChoice,
            "trueFalse" => QuestionType.TrueFalse, _ => throw new ArgumentException("Unknown closed question type.") };
        var policy = d.ScoringPolicy switch { "exactMatch" => ChoiceScoringPolicy.ExactMatch, "partialCredit" => ChoiceScoringPolicy.PartialCredit,
            _ => throw new ArgumentException("Unknown scoring policy.") };
        if (!Ids(d.ConceptIds) || !Ids(d.ObjectiveIds) || !Ids(d.CorrectOptionIds) || d.Options is null || d.Options.Any(x => x is null) ||
            d.Prompt?.Length > 20000 || d.Options.Length > 50 || d.Options.Any(x => x.Text?.Length > 10000))
            throw new ArgumentException("Invalid question references or size.");
        return new(id, number, type, d.Prompt!, d.Options.Select(x => new AnswerOption(x.Id, x.Text)), d.CorrectOptionIds, d.ConceptIds, policy);
    }

    private async Task<bool> References(Guid unitId, Guid revisionId, Guid[] objectives, Guid[]? concepts, CancellationToken ct)
    {
        var unit = await curriculum.PublishedRevision(unitId, revisionId, ct);
        if (unit is null || !Ids(objectives) || objectives.Except(unit.Objectives.Select(x => x.Id)).Any()) return false;
        if (concepts is null) return true;
        // Every assessed concept is covered by a selected objective, and every selected objective is represented.
        return concepts.Except(unit.Objectives.Where(x => objectives.Contains(x.Id)).SelectMany(x => x.ConceptIds)).Any() == false &&
            unit.Objectives.Where(x => objectives.Contains(x.Id)).All(x => x.ConceptIds.Intersect(concepts).Any());
    }

    public async Task<IResult> CreateQuestion(QuestionRequest request, ClaimsPrincipal user, CancellationToken ct)
    {
        if (request.Document is null) return Invalid("A document is required.");
        try { ValidateQuestion(request); }
        catch (ArgumentException e) { return Invalid(e.Message); }
        if (!await References(request.Document.UnitId, request.Document.UnitRevisionId, request.Document.ObjectiveIds, request.Document.ConceptIds, ct))
            return Invalid("Questions must reference objectives and concepts of a published unit revision.");
        return await Append("question", request.Id, request.Number, request.Document, user, ct);
    }

    public async Task<IResult> CreateDefinition(DefinitionRequest request, ClaimsPrincipal user, CancellationToken ct)
    {
        var d = request.Document;
        if (d is null || request.Id == Guid.Empty || request.Number < 1 || string.IsNullOrWhiteSpace(d.Title) || d.Title.Length > 300 ||
            !Ids(d.ObjectiveIds) || !Ids(d.QuestionRevisionIds) || d.QuestionRevisionIds.Length > 100 ||
            d.Mode is not ("practice" or "assessment") || d.Feedback is not ("afterSubmission" or "never") || d.Assistance != "none" ||
            d.TimeLimitMinutes is < 1 or > 1440 || d.MaxAttempts is < 1 or > 100)
            return Invalid("Invalid definition, composition or policy.");
        if (!await References(d.UnitId, d.UnitRevisionId, d.ObjectiveIds, null, ct)) return Invalid("Unknown published unit revision or objectives.");
        var questions = await db.Revisions.AsNoTracking().Where(x => x.Kind == "question" && d.QuestionRevisionIds.Contains(x.Id)).ToListAsync(ct);
        if (questions.Count != d.QuestionRevisionIds.Length) return Invalid("Unknown question revisions.");
        var documents = questions.Select(x => Read<QuestionDocument>(x.DocumentJson)).ToArray();
        if (questions.Select(x => x.ResourceId).Distinct().Count() != questions.Count ||
            documents.Any(x => x.UnitId != d.UnitId || x.UnitRevisionId != d.UnitRevisionId || x.ObjectiveIds.Except(d.ObjectiveIds).Any()) ||
            d.ObjectiveIds.Except(documents.SelectMany(x => x.ObjectiveIds)).Any())
            return Invalid("Questions must cover the definition objectives in the same unit revision without duplicate question identities.");
        return await Append("definition", request.Id, request.Number, d, user, ct);
    }

    private async Task<IResult> Append<T>(string kind, Guid id, int number, T document, ClaimsPrincipal user, CancellationToken ct)
    {
        var previous = await db.Revisions.Where(x => x.Kind == kind && x.ResourceId == id).MaxAsync(x => (int?)x.Number, ct) ?? 0;
        if (number != previous + 1) return Conflict("Revision number must follow the latest immutable snapshot");
        var revision = new AssessmentRevision { ResourceId = id, Number = number, Kind = kind, DocumentJson = Write(document), CreatedAt = clock.GetUtcNow(), CreatedBy = Actor(user) };
        db.Revisions.Add(revision);
        await db.SaveChangesAsync(ct);
        return Results.Created($"/api/assessments/{kind}s/{revision.Id}", RevisionResponse(revision));
    }

    private static object RevisionResponse(AssessmentRevision r) => new { r.Id, r.ResourceId, r.Number, r.CreatedAt, r.CreatedBy, document = Read<JsonElement>(r.DocumentJson) };
    public async Task<IResult> GetRevision(string kind, Guid id, CancellationToken ct)
    {
        var r = await db.Revisions.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id && x.Kind == kind, ct);
        return r is null ? Results.NotFound() : Results.Ok(RevisionResponse(r));
    }
    public async Task<IResult> List(string kind, int? offset, int? limit, ClaimsPrincipal user, CancellationToken ct)
    {
        var skip = offset ?? 0;
        var take = limit ?? 50;
        if (skip < 0 || take is < 1 or > 100) return Invalid("Invalid pagination.");
        var query = db.Revisions.AsNoTracking().Where(x => x.Kind == kind);
        var total = await query.CountAsync(ct);
        var rows = await query.OrderBy(x => x.ResourceId).ThenByDescending(x => x.Number).Skip(skip).Take(take).ToListAsync(ct);
        return Results.Ok(new { items = rows.Select(x => kind == "question" ? RevisionResponse(x) : DefinitionSummary(x)), total, offset = skip, limit = take });
    }
    private static object DefinitionSummary(AssessmentRevision r)
    {
        var d = Read<DefinitionDocument>(r.DocumentJson);
        return new { r.Id, r.ResourceId, r.Number, d.Title, d.UnitId, d.UnitRevisionId, d.ObjectiveIds, d.Mode, d.TimeLimitMinutes, d.MaxAttempts, d.Feedback, d.Assistance, questionCount = d.QuestionRevisionIds.Length };
    }

    public async Task<IResult> Start(StartAttemptRequest request, ClaimsPrincipal user, CancellationToken ct)
    {
        if (request.RequestId == Guid.Empty || request.DefinitionRevisionId == Guid.Empty) return Invalid("Definition revision and request IDs are required.");
        var student = Actor(user);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        // Transaction-scoped database lock covers both retry deduplication and limits, across API instances.
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({student}, 0))", ct);
        var existing = await db.Attempts.SingleOrDefaultAsync(x => x.StudentId == student && x.RequestId == request.RequestId, ct);
        if (existing is not null)
            return existing.DefinitionRevisionId != request.DefinitionRevisionId ? Conflict("Request ID already used with another definition") : Results.Ok(await AttemptResponse(existing, ct));
        var revision = await db.Revisions.SingleOrDefaultAsync(x => x.Id == request.DefinitionRevisionId && x.Kind == "definition", ct);
        if (revision is null) return Results.NotFound();
        var d = Read<DefinitionDocument>(revision.DocumentJson);
        if (await db.Attempts.CountAsync(x => x.StudentId == student && x.DefinitionId == revision.ResourceId, ct) >= d.MaxAttempts)
            return Conflict("Attempt limit reached");
        var now = clock.GetUtcNow();
        var attempt = new AssessmentAttempt { StudentId = student, RequestId = request.RequestId, DefinitionId = revision.ResourceId,
            DefinitionRevisionId = revision.Id, StartedAt = now, ExpiresAt = now.AddMinutes(d.TimeLimitMinutes) };
        db.Attempts.Add(attempt);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return Results.Created($"/api/assessments/attempts/{attempt.Id}", await AttemptResponse(attempt, ct));
    }
    public async Task<IResult> GetAttempt(Guid id, ClaimsPrincipal user, CancellationToken ct)
    {
        var student = Actor(user);
        var attempt = await db.Attempts.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id && x.StudentId == student, ct);
        return attempt is null ? Results.NotFound() : Results.Ok(await AttemptResponse(attempt, ct));
    }
    public async Task<IResult> ListAttempts(int offset, int limit, ClaimsPrincipal user, bool submissions, CancellationToken ct)
    {
        if (offset < 0 || limit is < 1 or > 100) return Invalid("Invalid pagination.");
        var student = Actor(user);
        var query = db.Attempts.AsNoTracking().Where(a => submissions ? a.SubmittedAt != null : a.StudentId == student);
        var total = await query.CountAsync(ct);
        var rows = await (from a in query
                          join definition in db.Revisions.AsNoTracking() on a.DefinitionRevisionId equals definition.Id
                          orderby a.StartedAt descending, a.Id
                          select new { a.Id, a.DefinitionRevisionId, a.StartedAt, a.ExpiresAt, a.SubmittedAt, definition.DocumentJson,
                              reviewed = db.Reviews.Any(r => r.AttemptId == a.Id) }).Skip(offset).Take(limit).ToArrayAsync(ct);
        var definitions = rows.Select(r => Read<DefinitionDocument>(r.DocumentJson)).ToArray();
        var questionIds = definitions.SelectMany(d => d.QuestionRevisionIds).Distinct().ToArray();
        var questions = await db.Revisions.AsNoTracking().Where(r => questionIds.Contains(r.Id)).Select(r => new { r.Id, r.DocumentJson }).ToArrayAsync(ct);
        var rubricIds = questions.Where(q => IsRubric(Read<QuestionDocument>(q.DocumentJson))).Select(q => q.Id).ToHashSet();
        var now = clock.GetUtcNow();
        var items = rows.Select((row, index) => new { row.Id, row.DefinitionRevisionId, row.StartedAt, row.ExpiresAt, row.SubmittedAt,
            definitions[index].Title, definitions[index].Mode,
            status = row.SubmittedAt is null ? now >= row.ExpiresAt ? "expired" : "inProgress"
                : !row.reviewed && definitions[index].QuestionRevisionIds.Any(rubricIds.Contains) ? "pendingReview" : "submitted" });
        return Results.Ok(new { items, total, offset, limit });
    }
    private async Task<object> AttemptResponse(AssessmentAttempt a, CancellationToken ct)
    {
        var definition = await db.Revisions.AsNoTracking().SingleAsync(x => x.Id == a.DefinitionRevisionId, ct);
        var d = Read<DefinitionDocument>(definition.DocumentJson);
        var rows = await db.Revisions.AsNoTracking().Where(x => d.QuestionRevisionIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id, ct);
        var review = await db.Reviews.AsNoTracking().SingleOrDefaultAsync(x => x.AttemptId == a.Id, ct);
        var pending = a.SubmittedAt is not null && review is null && rows.Values.Any(x => IsRubric(Read<QuestionDocument>(x.DocumentJson)));
        var feedback = a.SubmittedAt is not null && !pending && d.Feedback == "afterSubmission";
        var scores = feedback ? Read<ScoreDocument[]>(review?.ScoresJson ?? a.ScoresJson!) : null;
        return new { a.Id, a.DefinitionRevisionId, a.StartedAt, a.ExpiresAt, a.SubmittedAt,
            status = pending ? "pendingReview" : a.SubmittedAt is not null ? "submitted" : clock.GetUtcNow() >= a.ExpiresAt ? "expired" : "inProgress",
            d.Title, d.Mode, d.Feedback, d.Assistance,
            questions = d.QuestionRevisionIds.Select(id => { var q = Read<QuestionDocument>(rows[id].DocumentJson);
                return new { revisionId = id, questionId = rows[id].ResourceId, number = rows[id].Number,
                    q.Type, q.Prompt, q.Options, q.ObjectiveIds, q.ConceptIds, q.ScoringPolicy }; }),
            answers = a.AnswersJson is null ? null : Read<AnswerDocument[]>(a.AnswersJson),
            scores, fraction = scores is null ? (decimal?)null : scores.Average(x => x.Fraction) };
    }

    public async Task<IResult> Submit(Guid id, SubmitAttemptRequest request, ClaimsPrincipal user, CancellationToken ct)
    {
        var student = Actor(user);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var a = await db.Attempts.FromSqlInterpolated($"SELECT * FROM assessments.attempts WHERE \"Id\" = {id} AND \"StudentId\" = {student} FOR UPDATE").SingleOrDefaultAsync(ct);
        if (a is null) return Results.NotFound();
        var definition = await db.Revisions.AsNoTracking().SingleAsync(x => x.Id == a.DefinitionRevisionId, ct);
        var d = Read<DefinitionDocument>(definition.DocumentJson);
        if (request.Answers is null || request.Answers.Length > d.QuestionRevisionIds.Length || request.Answers.Any(x => x is null || !Ids(x.SelectedOptionIds, false) || x.Text?.Length > 20000) ||
            request.Answers.Select(x => x.QuestionRevisionId).Distinct().Count() != request.Answers.Length || request.Answers.Any(x => !d.QuestionRevisionIds.Contains(x.QuestionRevisionId)))
            return Invalid("Answers must contain distinct known question and option IDs.");
        var normalized = d.QuestionRevisionIds.Select(q => new AnswerDocument(q,
            request.Answers.SingleOrDefault(x => x.QuestionRevisionId == q)?.SelectedOptionIds.Order().ToArray() ?? [],
            request.Answers.SingleOrDefault(x => x.QuestionRevisionId == q)?.Text is { } text && text.Length > 0 ? text : null)).ToArray();
        var answers = Write(normalized);
        // jsonb normalizes whitespace/key order, so compare deserialized canonical data.
        if (a.SubmittedAt is not null)
            return Write(Read<AnswerDocument[]>(a.AnswersJson!)) == answers ? Results.Ok(await AttemptResponse(a, ct)) : Conflict("Attempt already submitted with different answers");
        var now = clock.GetUtcNow();
        if (now >= a.ExpiresAt) return Conflict("Attempt has expired");
        var questions = await db.Revisions.AsNoTracking().Where(x => d.QuestionRevisionIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id, ct);
        var scores = new List<ScoreDocument>();
        foreach (var answer in normalized)
        {
            var revision = questions[answer.QuestionRevisionId];
            var document = Read<QuestionDocument>(revision.DocumentJson);
            if (IsRubric(document))
            {
                if (answer.SelectedOptionIds.Length != 0) return Invalid("Rubric answers cannot select options.");
                continue;
            }
            if (answer.Text is not null) return Invalid("Closed answers cannot contain text.");
            var q = Question(revision);
            ChoiceScore score;
            try { score = new ChoiceScorer().Score(q, answer.SelectedOptionIds); }
            catch (ArgumentException e) { return Invalid(e.Message); }
            scores.Add(new(revision.Id, score.Fraction, score.IsCorrect));
        }
        a.SubmittedAt = now;
        a.AnswersJson = answers;
        a.ScoresJson = Write(scores);
        if (scores.Count == d.QuestionRevisionIds.Length)
            AddEvidence(a, definition, d, questions, scores, now);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return Results.Ok(await AttemptResponse(a, ct));
    }

    private void AddEvidence(AssessmentAttempt a, AssessmentRevision definition, DefinitionDocument d,
        Dictionary<Guid, AssessmentRevision> questions, IEnumerable<ScoreDocument> scores, DateTimeOffset now, Guid? reviewId = null)
    {
        foreach (var score in scores)
        {
            var r = questions[score.QuestionRevisionId];
            var q = Read<QuestionDocument>(r.DocumentJson);
            foreach (var concept in q.ConceptIds)
                db.EvidenceEvents.Add(new() { AttemptId = a.Id, QuestionRevisionId = r.Id, ConceptId = concept, CreatedAt = clock.GetUtcNow(),
                    PayloadJson = Write(new { schemaVersion = 1, studentId = a.StudentId, attemptId = a.Id, definitionRevisionId = definition.Id,
                        reviewId, evaluatedAt = clock.GetUtcNow(), evaluator = IsRubric(q) ? "human-rubric" : "deterministic",
                        questionId = r.ResourceId, questionRevisionId = r.Id, questionRevision = r.Number,
                        q.UnitId, q.UnitRevisionId, conceptId = concept, source = d.Mode, assistance = d.Assistance, score.Fraction, observedAt = now }) });
        }
    }
}
