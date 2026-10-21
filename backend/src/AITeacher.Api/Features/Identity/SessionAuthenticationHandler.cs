using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace AITeacher.Api.Features.Identity;

public sealed class SessionAuthenticationHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder,
    IdentityDbContext db, IConfiguration configuration, TimeProvider clock)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    public const string SchemeName = "DatabaseSession";
    // Separate cookie from Python: the two hosts do not share session formats.
    public const string CookieName = "ait_dotnet_session";
    public static string Hash(string value) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value)));
    public static string StudentId(string subject) => "google-" + Hash(subject)[..32].ToLowerInvariant();

    protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (!Request.Cookies.TryGetValue(CookieName, out var token)) return AuthenticateResult.NoResult();
        if (token.Length != 64) return AuthenticateResult.Fail("Invalid session");
        var now = clock.GetUtcNow();
        var hash = Hash(token);
        var student = await (from session in db.Sessions.AsNoTracking()
                             join user in db.Students.AsNoTracking() on session.StudentId equals user.Id
                             where session.TokenHash == hash && session.ExpiresAt > now
                             select user).SingleOrDefaultAsync(Context.RequestAborted);
        if (student is null) return AuthenticateResult.Fail("Invalid or expired session");
        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, student.Id), new(ClaimTypes.Name, student.DisplayName),
            new(ClaimTypes.Role, "Student")
        };
        // No trust in email, request claims or client-supplied roles. Revocations apply next request.
        var authors = configuration.GetSection("Authentication:AuthorGoogleSubjects").Get<string[]>() ?? [];
        if (authors.Contains(student.GoogleSubject, StringComparer.Ordinal)) claims.Add(new(ClaimTypes.Role, "Author"));
        return AuthenticateResult.Success(new AuthenticationTicket(
            new ClaimsPrincipal(new ClaimsIdentity(claims, SchemeName)), SchemeName));
    }
}
