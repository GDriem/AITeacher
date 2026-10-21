using System.Security.Claims;
using System.Text.Json;
using AITeacher.Api.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace AITeacher.Api.Features.Learning;

public sealed record ScheduleReview(Guid RequestId, Guid EvidenceId, Guid DefinitionRevisionId, DateTimeOffset DueAt);
public sealed record CompleteReview(Guid AttemptId);
public sealed class LearningService(LearningDbContext db, IAssessmentEvidenceFeed feed, TimeProvider clock)
{
    private static string Actor(ClaimsPrincipal user) => user.FindFirstValue(ClaimTypes.NameIdentifier)!;
    private static IResult Invalid(string message) => Results.ValidationProblem(new Dictionary<string, string[]> { ["learning"] = [message] });
    private static IResult Conflict(string message) => Results.Problem(statusCode: 409, title: message);
    public async Task<int> Consume(CancellationToken ct)
    {
        var messages = await feed.Pending(ct);
        foreach (var message in messages)
        {
            await using (var tx = await db.Database.BeginTransactionAsync(ct))
            {
                // Cross-instance serialization; the durable inbox also deduplicates redeliveries after a crash.
                await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(602601)", ct);
                if (!await db.Evidence.AnyAsync(x => x.Id == message.Id, ct))
                {
                    using var payload = JsonDocument.Parse(message.Json);
                    var p = payload.RootElement;
                    if (p.GetProperty("schemaVersion").GetInt32() != 1) throw new InvalidOperationException("Unsupported evidence schema");
                    db.Evidence.Add(new EvidenceRow { Id = message.Id, StudentId = p.GetProperty("studentId").GetString()!,
                        AttemptId = p.GetProperty("attemptId").GetGuid(), DefinitionRevisionId = p.GetProperty("definitionRevisionId").GetGuid(),
                        QuestionRevisionId = p.GetProperty("questionRevisionId").GetGuid(), UnitRevisionId = p.GetProperty("unitRevisionId").GetGuid(),
                        ConceptId = p.GetProperty("conceptId").GetGuid(), Fraction = p.GetProperty("fraction").GetDecimal(),
                        Assistance = p.GetProperty("assistance").GetString()!, Source = p.GetProperty("source").GetString()!,
                        ObservedAt = p.GetProperty("observedAt").GetDateTimeOffset(), PayloadJson = message.Json });
                    await db.SaveChangesAsync(ct);
                }
                await tx.CommitAsync(ct);
            }
            // A failed acknowledgement leaves a retryable event; the committed inbox prevents duplicate evidence.
            await feed.Acknowledge(message.Id, ct);
            db.ChangeTracker.Clear();
        }
        return messages.Length;
    }
    public async Task<IResult> Evidence(ClaimsPrincipal user, int? offset, int? limit, CancellationToken ct)
    {
        var skip = offset ?? 0; var take = limit ?? 50;
        if (skip < 0 || take is < 1 or > 100) return Invalid("Invalid pagination");
        var student = Actor(user);
        var query = db.Evidence.AsNoTracking().Where(x => x.StudentId == student);
        // No raw payload or scores: feedback=never cannot be bypassed through learning projections.
        var items = await query.OrderByDescending(x => x.ObservedAt).ThenBy(x => x.Id).Skip(skip).Take(take)
            .Select(x => new { x.Id, x.AttemptId, x.QuestionRevisionId, x.UnitRevisionId, x.ConceptId, x.Source, x.Assistance, x.ObservedAt }).ToArrayAsync(ct);
        return Results.Ok(new { items, total = await query.CountAsync(ct), offset = skip, limit = take });
    }
    public async Task<IResult> Concepts(ClaimsPrincipal user, int? offset, int? limit, CancellationToken ct)
    {
        var skip = offset ?? 0; var take = limit ?? 50;
        if (skip < 0 || take is < 1 or > 100) return Invalid("Invalid pagination");
        var student = Actor(user);
        var query = db.Evidence.AsNoTracking().Where(x => x.StudentId == student)
            .GroupBy(x => new { x.UnitRevisionId, x.ConceptId }).Select(g => new { g.Key.UnitRevisionId, g.Key.ConceptId,
                evidenceCount = g.Count(), lastObservedAt = g.Max(x => x.ObservedAt), masteryStatus = "uncalibrated" });
        return Results.Ok(new { items = await query.OrderBy(x => x.UnitRevisionId).ThenBy(x => x.ConceptId).Skip(skip).Take(take).ToArrayAsync(ct),
            total = await query.CountAsync(ct), offset = skip, limit = take });
    }
    public async Task<IResult> Schedule(ScheduleReview request, ClaimsPrincipal user, CancellationToken ct)
    {
        var student = Actor(user);
        if (request.RequestId == Guid.Empty || request.EvidenceId == Guid.Empty || request.DefinitionRevisionId == Guid.Empty)
            return Invalid("Request, evidence and definition IDs are required");
        request = request with { DueAt = PostgresTimestamp.Normalize(request.DueAt) };
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({student}, 6))", ct);
        var existing = await db.Reviews.SingleOrDefaultAsync(x => x.StudentId == student && x.RequestId == request.RequestId, ct);
        if (existing is not null) return existing.EvidenceId == request.EvidenceId && existing.DefinitionRevisionId == request.DefinitionRevisionId && existing.DueAt == request.DueAt
            ? Results.Ok(existing) : Conflict("Request ID already used with another schedule");
        var evidence = await db.Evidence.AsNoTracking().SingleOrDefaultAsync(x => x.Id == request.EvidenceId && x.StudentId == student, ct);
        if (evidence is null) return Results.NotFound();
        var now = clock.GetUtcNow();
        if (request.DueAt <= now || request.DueAt > now.AddYears(1) || request.DueAt.Offset != TimeSpan.Zero)
            return Invalid("Due date must be UTC, in the future and within one year");
        if (!await feed.Covers(request.DefinitionRevisionId, evidence.UnitRevisionId, evidence.ConceptId, ct))
            return Invalid("Review definition must assess this concept in the same editorial revision");
        var review = new ReviewRow { StudentId = student, RequestId = request.RequestId, EvidenceId = evidence.Id,
            DefinitionRevisionId = request.DefinitionRevisionId, DueAt = request.DueAt, CreatedAt = PostgresTimestamp.Normalize(now) };
        db.Reviews.Add(review); await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        return Results.Created($"/api/learning/reviews/{review.Id}", review);
    }
    public async Task<IResult> Reviews(ClaimsPrincipal user, int? offset, int? limit, CancellationToken ct)
    {
        var skip = offset ?? 0; var take = limit ?? 50;
        if (skip < 0 || take is < 1 or > 100) return Invalid("Invalid pagination");
        var student = Actor(user); var query = db.Reviews.AsNoTracking().Where(x => x.StudentId == student);
        return Results.Ok(new { items = await query.OrderBy(x => x.DueAt).ThenBy(x => x.Id).Skip(skip).Take(take).ToArrayAsync(ct),
            total = await query.CountAsync(ct), offset = skip, limit = take });
    }
    public async Task<IResult> Complete(Guid id, CompleteReview request, ClaimsPrincipal user, CancellationToken ct)
    {
        var student = Actor(user);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        // Serialize completions for this student, including attempts used for two different review rows.
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({student}, 6))", ct);
        var review = await db.Reviews.SingleOrDefaultAsync(x => x.Id == id && x.StudentId == student, ct);
        if (review is null) return Results.NotFound();
        if (review.CompletedAt is not null) return review.CompletedAttemptId == request.AttemptId ? Results.Ok(review) : Conflict("Review already completed");
        if (clock.GetUtcNow() < review.DueAt || await db.Reviews.AnyAsync(x => x.StudentId == student && x.CompletedAttemptId == request.AttemptId, ct) ||
            !await feed.Completed(request.AttemptId, student, review.DefinitionRevisionId, review.DueAt, ct))
            return Conflict("A new, fully graded, unused attempt started after the due date is required");
        review.CompletedAttemptId = request.AttemptId; review.CompletedAt = PostgresTimestamp.Normalize(clock.GetUtcNow());
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        return Results.Ok(review);
    }
}
public sealed class EvidenceWorker(IServiceScopeFactory scopes, IConfiguration configuration, ILogger<EvidenceWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!configuration.GetValue<bool>("Learning:WorkerEnabled")) return;
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await using var scope = scopes.CreateAsyncScope();
                var count = await scope.ServiceProvider.GetRequiredService<LearningService>().Consume(stoppingToken);
                if (count == 100) continue;
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { return; }
            catch (Exception) { logger.LogWarning("Evidence consumption failed; durable batch will be retried"); }
            try { await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken); }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { return; }
        }
    }
}
public static class LearningEndpoints
{
    public static void MapLearning(this WebApplication app)
    {
        var group = app.MapGroup("/api/learning").RequireAuthorization();
        group.AddEndpointFilter(async (context, next) => { context.HttpContext.Response.Headers.CacheControl = "no-store"; return await next(context); });
        group.MapGet("/evidence", (ClaimsPrincipal user, int? offset, int? limit, LearningService s, CancellationToken ct) => s.Evidence(user, offset, limit, ct));
        group.MapGet("/concepts", (ClaimsPrincipal user, int? offset, int? limit, LearningService s, CancellationToken ct) => s.Concepts(user, offset, limit, ct));
        group.MapGet("/reviews", (ClaimsPrincipal user, int? offset, int? limit, LearningService s, CancellationToken ct) => s.Reviews(user, offset, limit, ct));
        group.MapPost("/reviews", (ScheduleReview request, ClaimsPrincipal user, LearningService s, CancellationToken ct) => s.Schedule(request, user, ct));
        group.MapPost("/reviews/{id:guid}/complete", (Guid id, CompleteReview request, ClaimsPrincipal user, LearningService s, CancellationToken ct) => s.Complete(id, request, user, ct));
    }
}
