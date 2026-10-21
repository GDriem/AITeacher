using Google.Apis.Auth;

namespace AITeacher.Api.Features.Identity;

public sealed record GoogleIdentity(string Subject, string Email, string DisplayName);

public interface IGoogleIdentityVerifier
{
    Task<GoogleIdentity?> VerifyAsync(string credential, CancellationToken cancellationToken);
}

public sealed class GoogleIdentityVerifier(IConfiguration configuration) : IGoogleIdentityVerifier
{
    public async Task<GoogleIdentity?> VerifyAsync(string credential, CancellationToken cancellationToken)
    {
        try
        {
            var payload = await GoogleJsonWebSignature.ValidateAsync(credential,
                new GoogleJsonWebSignature.ValidationSettings
                {
                    Audience = [configuration["Authentication:GoogleClientId"]!],
                    IssuedAtClockTolerance = TimeSpan.FromSeconds(10),
                    ExpirationTimeClockTolerance = TimeSpan.Zero
                }).WaitAsync(TimeSpan.FromSeconds(15), cancellationToken);
            if (!payload.EmailVerified || string.IsNullOrWhiteSpace(payload.Subject) ||
                payload.Subject.Length > 255 || string.IsNullOrWhiteSpace(payload.Email) ||
                payload.Email.Length > 320 || string.IsNullOrWhiteSpace(payload.Name) || payload.Name.Length > 100)
                return null;
            return new(payload.Subject, payload.Email, payload.Name);
        }
        catch (InvalidJwtException) { return null; }
    }
}
