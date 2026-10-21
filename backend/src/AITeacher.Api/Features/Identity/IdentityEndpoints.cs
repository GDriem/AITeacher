using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using System.Security.Cryptography;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.EntityFrameworkCore;

namespace AITeacher.Api.Features.Identity;

public sealed record GoogleLoginRequest([property: Required, StringLength(8192, MinimumLength = 1)] string Credential);
public sealed record StudentProfile(string StudentId, string Email, string DisplayName, bool CanAuthor);
public sealed record AuthenticationStatus(bool Enabled, bool Authenticated, string? GoogleClientId, StudentProfile? Profile);

public static class IdentityEndpoints
{
    public static void MapIdentity(this WebApplication app)
    {
        var group = app.MapGroup("/api/auth");
        group.MapGet("/status", async (HttpContext context, IConfiguration configuration, IdentityDbContext db, CancellationToken ct) =>
        {
            context.Response.Headers.CacheControl = "no-store";
            StudentProfile? profile = null;
            if (context.User.Identity?.IsAuthenticated == true)
            {
                var id = context.User.FindFirstValue(ClaimTypes.NameIdentifier)!;
                var student = await db.Students.AsNoTracking().SingleAsync(x => x.Id == id, ct);
                profile = new(student.Id, student.Email, student.DisplayName, context.User.IsInRole("Author"));
            }
            var clientId = configuration["Authentication:GoogleClientId"];
            return Results.Ok(new AuthenticationStatus(true, profile is not null,
                string.IsNullOrWhiteSpace(clientId) ? null : clientId, profile));
        }).AllowAnonymous();
        group.MapGet("/csrf", (HttpContext context, IAntiforgery antiforgery) =>
        {
            context.Response.Headers.CacheControl = "no-store";
            var tokens = antiforgery.GetAndStoreTokens(context);
            return Results.Ok(new { requestToken = tokens.RequestToken });
        }).AllowAnonymous();
        group.MapPost("/google", Login).AllowAnonymous().RequireRateLimiting("login");
        group.MapGet("/me", async (HttpContext context, IdentityDbContext db, CancellationToken ct) =>
        {
            context.Response.Headers.CacheControl = "no-store";
            var id = context.User.FindFirstValue(ClaimTypes.NameIdentifier)!;
            var student = await db.Students.AsNoTracking().SingleAsync(x => x.Id == id, ct);
            return Results.Ok(new StudentProfile(student.Id, student.Email, student.DisplayName, context.User.IsInRole("Author")));
        }).RequireAuthorization();
        group.MapPost("/logout", async (HttpContext context, IdentityDbContext db, CancellationToken ct) =>
        {
            var hash = SessionAuthenticationHandler.Hash(context.Request.Cookies[SessionAuthenticationHandler.CookieName]!);
            await db.Sessions.Where(x => x.TokenHash == hash).ExecuteDeleteAsync(ct);
            context.Response.Cookies.Delete(SessionAuthenticationHandler.CookieName, Cookie(context));
            return Results.NoContent();
        }).RequireAuthorization();
    }

    private static CookieOptions Cookie(HttpContext context) => new()
    {
        HttpOnly = true, Secure = !context.RequestServices.GetRequiredService<IHostEnvironment>().IsDevelopment(),
        SameSite = SameSiteMode.Lax, Path = "/api", IsEssential = true
    };

    private static async Task<IResult> Login(GoogleLoginRequest request, HttpContext context,
        IConfiguration configuration, IGoogleIdentityVerifier verifier, IdentityDbContext db,
        TimeProvider clock, CancellationToken ct)
    {
        context.Response.Headers.CacheControl = "no-store";
        if (string.IsNullOrWhiteSpace(configuration["Authentication:GoogleClientId"]))
            return Results.Problem(statusCode: 503, title: "Google login is not configured");
        var identity = await verifier.VerifyAsync(request.Credential, ct);
        if (identity is null) return Results.Unauthorized();
        var now = clock.GetUtcNow();
        var id = SessionAuthenticationHandler.StudentId(identity.Subject);
        // Atomic upsert also handles concurrent first logins for one Google subject.
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO identity.students ("Id", "GoogleSubject", "Email", "DisplayName", "CreatedAt", "LastLoginAt")
            VALUES ({id}, {identity.Subject}, {identity.Email}, {identity.DisplayName}, {now}, {now})
            ON CONFLICT ("Id") DO UPDATE SET "Email" = EXCLUDED."Email",
                "DisplayName" = EXCLUDED."DisplayName", "LastLoginAt" = EXCLUDED."LastLoginAt"
            """, ct);
        if (context.Request.Cookies.TryGetValue(SessionAuthenticationHandler.CookieName, out var previous))
        {
            var hash = SessionAuthenticationHandler.Hash(previous);
            await db.Sessions.Where(x => x.TokenHash == hash).ExecuteDeleteAsync(ct);
        }
        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
        var expires = now.AddDays(7);
        db.Sessions.Add(new() { TokenHash = SessionAuthenticationHandler.Hash(token), StudentId = id, ExpiresAt = expires });
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        var cookie = Cookie(context);
        cookie.Expires = expires;
        context.Response.Cookies.Append(SessionAuthenticationHandler.CookieName, token, cookie);
        var authors = configuration.GetSection("Authentication:AuthorGoogleSubjects").Get<string[]>() ?? [];
        return Results.Ok(new StudentProfile(id, identity.Email, identity.DisplayName,
            authors.Contains(identity.Subject, StringComparer.Ordinal)));
    }
}
