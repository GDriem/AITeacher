using Google.Apis.Auth.OAuth2;

namespace AITeacher.Api.Features.Tutor;

public interface IVertexCredential
{
    Task<string> Token(CancellationToken ct);
}

public sealed class VertexCredential : IVertexCredential
{
    public async Task<string> Token(CancellationToken ct)
    {
        var credential = await GoogleCredential.GetApplicationDefaultAsync(ct);
        return await credential.CreateScoped("https://www.googleapis.com/auth/cloud-platform")
            .UnderlyingCredential.GetAccessTokenForRequestAsync(cancellationToken: ct);
    }
}
