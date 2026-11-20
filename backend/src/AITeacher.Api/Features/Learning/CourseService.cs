using System.Security.Claims;
using System.Security.Cryptography;
using AITeacher.Api.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace AITeacher.Api.Features.Learning;

public sealed record CourseUnitProgress(Guid UnitId, string Title, Guid TopicId, string TopicName, string Status, int? BestPercent, DateTimeOffset? CompletedAt);
public sealed record CourseSectionProgress(Guid CategoryId, string Name, CourseUnitProgress[] Units);
public sealed record CertificateSummary(string Code, string StudentName, string CourseName, int UnitCount, int AveragePercent, DateTimeOffset IssuedAt);
public sealed record CourseSummary(Guid SubjectId, string Slug, string Name, DateTimeOffset? EnrolledAt, int UnitCount, int CompletedCount,
    int StartedCount, int Percent, DateTimeOffset? LastActivityAt, CertificateSummary? Certificate);
public sealed record CourseDetail(CourseSummary Course, CourseSectionProgress[] Sections, Guid? NextUnitId, int PassingPercent);
public sealed class CourseService(LearningDbContext db, ICourseCurriculum curriculum, TimeProvider clock)
{
    /// <summary>A unit is completed by one graded assessment attempt at or above this fraction.</summary>
    public const decimal PassingFraction = 0.7m;
    // Unambiguous characters only: codes are read aloud and typed from a printed diploma.
    private const string CodeAlphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    private static string Actor(ClaimsPrincipal user) => user.FindFirstValue(ClaimTypes.NameIdentifier)!;
    private static int Percent(decimal fraction) => (int)Math.Round(fraction * 100, MidpointRounding.AwayFromZero);
    private static CertificateSummary Summary(CertificateRow x) => new(x.Code, x.StudentName, x.CourseName, x.UnitCount, Percent(x.AverageFraction), x.IssuedAt);

    private async Task<(CourseOutline Outline, CourseUnitProgress[] Units, CourseSummary Summary, decimal? AverageFraction)[]> Load(
        string student, Guid? subjectId, CancellationToken ct)
    {
        var courses = (await curriculum.Courses(ct)).Where(c => subjectId is null || c.SubjectId == subjectId).ToArray();
        if (courses.Length == 0) return [];
        var activity = await curriculum.Activity(student, PassingFraction, ct);
        var enrollments = await db.Enrollments.AsNoTracking().Where(x => x.StudentId == student).ToDictionaryAsync(x => x.SubjectId, ct);
        var certificates = await db.Certificates.AsNoTracking().Where(x => x.StudentId == student).ToDictionaryAsync(x => x.SubjectId, ct);
        return courses.Select(course =>
        {
            var units = course.Units.Select(u => activity.GetValueOrDefault(u.UnitId) is { } a
                ? new CourseUnitProgress(u.UnitId, u.Title, u.TopicId, u.TopicName, a.PassedAt is null ? "inProgress" : "completed",
                    a.BestFraction is { } best ? Percent(best) : null, a.PassedAt)
                : new CourseUnitProgress(u.UnitId, u.Title, u.TopicId, u.TopicName, "notStarted", null, null)).ToArray();
            var completed = units.Count(u => u.Status == "completed");
            var last = course.Units.Select(u => activity.GetValueOrDefault(u.UnitId)?.LastActivityAt).Max();
            var summary = new CourseSummary(course.SubjectId, course.Slug, course.Name, enrollments.GetValueOrDefault(course.SubjectId)?.EnrolledAt,
                units.Length, completed, units.Count(u => u.Status != "notStarted"), completed * 100 / units.Length, last,
                certificates.GetValueOrDefault(course.SubjectId) is { } certificate ? Summary(certificate) : null);
            var average = completed == units.Length ? course.Units.Average(u => activity[u.UnitId].BestFraction) : null;
            return (course, units, summary, average);
        }).ToArray();
    }

    public async Task<IResult> List(ClaimsPrincipal user, CancellationToken ct) =>
        Results.Ok(new { items = (await Load(Actor(user), null, ct)).Select(x => x.Summary) });

    public async Task<IResult> Get(Guid subjectId, ClaimsPrincipal user, CancellationToken ct)
    {
        var found = (await Load(Actor(user), subjectId, ct)).SingleOrDefault();
        if (found.Outline is null) return Results.NotFound();
        var sections = found.Outline.Units.Zip(found.Units).GroupBy(x => (x.First.CategoryId, x.First.CategoryName))
            .Select(g => new CourseSectionProgress(g.Key.CategoryId, g.Key.CategoryName, g.Select(x => x.Second).ToArray())).ToArray();
        // Continue where the student already started before suggesting a new unit.
        var next = found.Units.FirstOrDefault(u => u.Status == "inProgress") ?? found.Units.FirstOrDefault(u => u.Status == "notStarted");
        return Results.Ok(new CourseDetail(found.Summary, sections, next?.UnitId, Percent(PassingFraction)));
    }

    public async Task<IResult> Enroll(Guid subjectId, ClaimsPrincipal user, CancellationToken ct)
    {
        if (!(await curriculum.Courses(ct)).Any(c => c.SubjectId == subjectId)) return Results.NotFound();
        var student = Actor(user);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await LockEnrollment(student, subjectId, ct);
        var now = PostgresTimestamp.Normalize(clock.GetUtcNow());
        // Idempotent: a repeated enrollment keeps the original date.
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"INSERT INTO learning.enrollments (\"StudentId\", \"SubjectId\", \"EnrolledAt\") VALUES ({student}, {subjectId}, {now}) ON CONFLICT DO NOTHING", ct);
        var row = await db.Enrollments.AsNoTracking().SingleAsync(x => x.StudentId == student && x.SubjectId == subjectId, ct);
        await tx.CommitAsync(ct);
        return Results.Ok(new { row.SubjectId, row.EnrolledAt });
    }

    public async Task<IResult> Unenroll(Guid subjectId, ClaimsPrincipal user, CancellationToken ct)
    {
        var student = Actor(user);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await LockEnrollment(student, subjectId, ct);
        // Leaving a course keeps attempts and diplomas.
        await db.Enrollments.Where(x => x.StudentId == student && x.SubjectId == subjectId).ExecuteDeleteAsync(ct);
        await tx.CommitAsync(ct);
        return Results.NoContent();
    }

    // Order enrollment changes for the same student and course across API instances.
    private Task LockEnrollment(string student, Guid subjectId, CancellationToken ct) =>
        db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({$"{subjectId}:{student}"}, 8))", ct);

    public async Task<IResult> Certificates(ClaimsPrincipal user, CancellationToken ct)
    {
        var student = Actor(user);
        var rows = await db.Certificates.AsNoTracking().Where(x => x.StudentId == student).OrderByDescending(x => x.IssuedAt).ToArrayAsync(ct);
        return Results.Ok(new { items = rows.Select(Summary) });
    }

    public async Task<IResult> Issue(Guid subjectId, ClaimsPrincipal user, CancellationToken ct)
    {
        var student = Actor(user);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({student}, 7))", ct);
        var existing = await db.Certificates.AsNoTracking().SingleOrDefaultAsync(x => x.StudentId == student && x.SubjectId == subjectId, ct);
        if (existing is not null) return Results.Ok(Summary(existing));
        var found = (await Load(student, subjectId, ct)).SingleOrDefault();
        if (found.Outline is null) return Results.NotFound();
        if (found.AverageFraction is not { } average)
            return Results.Problem(statusCode: 409, title: "Every graded unit must be passed before issuing a certificate");
        var row = new CertificateRow
        {
            StudentId = student, SubjectId = subjectId, Code = NewCode(),
            // DisplayName is already limited to 100 characters by Identity.
            StudentName = user.FindFirstValue(ClaimTypes.Name) is { Length: > 0 } name ? name : "Estudiante",
            CourseName = found.Outline.Name, UnitCount = found.Summary.UnitCount,
            AverageFraction = average,
            IssuedAt = PostgresTimestamp.Normalize(clock.GetUtcNow()),
        };
        db.Certificates.Add(row);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return Results.Created($"/api/certificates/{row.Code}", Summary(row));
    }

    /// <summary>Public verification: whoever holds the code sees the name, course and date printed on the diploma, nothing else.</summary>
    public async Task<IResult> Verify(string code, CancellationToken ct)
    {
        var normalized = code.Trim().ToUpperInvariant();
        if (normalized.Length > 20) return Results.NotFound();
        var row = await db.Certificates.AsNoTracking().SingleOrDefaultAsync(x => x.Code == normalized, ct);
        return row is null ? Results.NotFound() : Results.Ok(new { row.Code, row.StudentName, row.CourseName, row.UnitCount, row.IssuedAt });
    }

    private static string NewCode()
    {
        var raw = RandomNumberGenerator.GetString(CodeAlphabet, 12);
        return $"{raw[..4]}-{raw[4..8]}-{raw[8..]}";
    }
}
public static class CourseEndpoints
{
    public static void MapCourses(this WebApplication app)
    {
        var group = app.MapGroup("/api/learning").RequireAuthorization();
        group.AddEndpointFilter(async (context, next) => { context.HttpContext.Response.Headers.CacheControl = "no-store"; return await next(context); });
        group.MapGet("/courses", (ClaimsPrincipal user, CourseService s, CancellationToken ct) => s.List(user, ct));
        group.MapGet("/courses/{subjectId:guid}", (Guid subjectId, ClaimsPrincipal user, CourseService s, CancellationToken ct) => s.Get(subjectId, user, ct));
        group.MapPut("/courses/{subjectId:guid}/enrollment", (Guid subjectId, ClaimsPrincipal user, CourseService s, CancellationToken ct) => s.Enroll(subjectId, user, ct));
        group.MapDelete("/courses/{subjectId:guid}/enrollment", (Guid subjectId, ClaimsPrincipal user, CourseService s, CancellationToken ct) => s.Unenroll(subjectId, user, ct));
        group.MapPost("/courses/{subjectId:guid}/certificate", (Guid subjectId, ClaimsPrincipal user, CourseService s, CancellationToken ct) => s.Issue(subjectId, user, ct));
        group.MapGet("/certificates", (ClaimsPrincipal user, CourseService s, CancellationToken ct) => s.Certificates(user, ct));
        app.MapGet("/api/certificates/{code}", (string code, CourseService s, CancellationToken ct) => s.Verify(code, ct))
            .AllowAnonymous().RequireRateLimiting("certificate");
    }
}
