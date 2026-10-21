using System.Text.RegularExpressions;
using Azure.Core;
using Azure.Identity;
using Google.Apis.Auth.OAuth2;
using Google.Apis.Auth.OAuth2.Responses;
using AITeacher.Api.Infrastructure;

namespace AITeacher.Api.Features.Tutor;

// Singleton: the Google SDK caches and refreshes short-lived STS tokens in memory.
// No service-account impersonation, credential files, or fallback from federation to ADC.
public sealed class ConfiguredVertexCredential(IConfiguration configuration, IHostEnvironment environment,
    TokenCredential? managedIdentity = null) : IVertexCredential
{
    private readonly SemaphoreSlim gate = new(1, 1);
    private GoogleCredential? credential;

    public async Task<string> Token(CancellationToken ct)
    {
        try
        {
            await gate.WaitAsync(ct);
            try
            {
                if (credential is null)
                {
                    var mode = configuration["AI:VertexAuthentication:Mode"] ?? "adc";
                    credential = mode switch
                    {
                        "adc" => (await GoogleCredential.GetApplicationDefaultAsync(ct))
                            .CreateScoped("https://www.googleapis.com/auth/cloud-platform"),
                        "azureFederation" => CreateFederated(configuration, environment, managedIdentity ?? AzureHosting.Credential(configuration)),
                        _ => throw new TutorUnavailableException()
                    };
                }
            }
            finally { gate.Release(); }
            return await credential.UnderlyingCredential.GetAccessTokenForRequestAsync(cancellationToken: ct);
        }
        catch (Exception ex) when (ex is AuthenticationFailedException or TokenResponseException or
            InvalidOperationException or ArgumentException or HttpRequestException)
        {
            // Do not propagate SDK response bodies, tokens, or identity endpoint diagnostics.
            throw new TutorUnavailableException();
        }
    }

    public static GoogleCredential CreateFederated(IConfiguration configuration, IHostEnvironment environment, TokenCredential managedIdentity)
    {
        var section = configuration.GetSection("AI:VertexAuthentication");
        var audience = section["Audience"] ?? "";
        var resource = section["AzureResource"] ?? "";
        if (!Regex.IsMatch(audience, @"\A//iam\.googleapis\.com/projects/[0-9]+/locations/global/workloadIdentityPools/[a-z0-9-]+/providers/[a-z0-9-]+\z") ||
            !resource.StartsWith("api://", StringComparison.Ordinal) || !Guid.TryParseExact(resource[6..], "D", out _))
            throw new TutorUnavailableException();
        var endpoint = section["StsEndpoint"] ?? "https://sts.googleapis.com/v1/token";
        if (endpoint != "https://sts.googleapis.com/v1/token" &&
            !(environment.IsDevelopment() && Uri.TryCreate(endpoint, UriKind.Absolute, out var uri) &&
              uri.IsLoopback && uri.Scheme == "http" && uri.UserInfo.Length == 0 && uri.Query.Length == 0 && uri.Fragment.Length == 0))
            throw new TutorUnavailableException();
        return new ProgrammaticExternalAccountCredential(new(
            endpoint, audience, "urn:ietf:params:oauth:token-type:jwt", new AzureSubject(managedIdentity, resource))
        {
            Scopes = ["https://www.googleapis.com/auth/cloud-platform"],
            HttpClientFactory = new NoRedirectFactory()
        }).ToGoogleCredential();
    }

    private sealed class AzureSubject(TokenCredential identity, string resource) : ProgrammaticExternalAccountCredential.ISubjectTokenProvider
    {
        public async Task<string> GetSubjectTokenAsync(ProgrammaticExternalAccountCredential caller, CancellationToken taskCancellationToken) =>
            (await identity.GetTokenAsync(new TokenRequestContext([resource + "/.default"]), taskCancellationToken)).Token;
    }

    private sealed class NoRedirectFactory : Google.Apis.Http.HttpClientFactory
    {
        protected override HttpClientHandler CreateClientHandler() => new() { AllowAutoRedirect = false };
    }
}
