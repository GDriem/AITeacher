using Azure.Core;
using AITeacher.Api.Features.Tutor;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Xunit;

namespace AITeacher.Api.Tests;

public sealed class VertexFederationTests
{
    private const string Audience = "//iam.googleapis.com/projects/930398712637/locations/global/workloadIdentityPools/aiteacher-beta/providers/azure-runtime";
    private const string Resource = "api://10000000-0000-0000-0000-000000000001";
    private static IConfiguration Config(string? endpoint = null, string audience = Audience, string resource = Resource) =>
        new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> {
            ["AI:VertexAuthentication:Mode"] = "azureFederation",
            ["AI:VertexAuthentication:Audience"] = audience,
            ["AI:VertexAuthentication:AzureResource"] = resource,
            ["AI:VertexAuthentication:StsEndpoint"] = endpoint
        }).Build();
    private static string Endpoint => (Environment.GetEnvironmentVariable("AITEACHER_TEST_STS_URL")
        ?? (Environment.GetEnvironmentVariable("AITEACHER_TEST_AI_URL") is { } url ? url + "/sts/v1/token" : null)
        ?? throw new InvalidOperationException("Start vertex-federation.sim.yaml; set AITEACHER_TEST_STS_URL to its /sts/v1/token endpoint."));

    [Fact]
    public async Task Exchanges_managed_identity_subject_over_HTTP_and_reuses_short_lived_token()
    {
        var source = new SyntheticIdentity("synthetic-azure-jwt");
        var credential = new ConfiguredVertexCredential(Config(Endpoint), new Host("Development"), source);
        var results = await Task.WhenAll(Enumerable.Range(0, 4).Select(_ =>
            credential.Token(CancellationToken.None)));
        Assert.All(results, value => Assert.Equal("synthetic-google-token", value));
        Assert.Equal(1, source.Calls);
        Assert.Equal(Resource + "/.default", source.Scope);
    }

    [Fact]
    public async Task Trust_denial_does_not_fall_back_to_personal_ADC()
    {
        var source = new SyntheticIdentity("synthetic-denied");
        var credential = new ConfiguredVertexCredential(Config(Endpoint), new Host("Development"), source);
        await Assert.ThrowsAsync<TutorUnavailableException>(() => credential.Token(CancellationToken.None));
        Assert.Equal(1, source.Calls);
    }

    [Fact]
    public async Task Token_exchange_can_be_cancelled_within_operation_budget()
    {
        var credential = new ConfiguredVertexCredential(Config(Endpoint), new Host("Development"), new SyntheticIdentity("synthetic-hang"));
        using var deadline = new CancellationTokenSource(TimeSpan.FromMilliseconds(250));
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() =>
            credential.Token(deadline.Token));
    }

    [Fact]
    public async Task Token_exchange_rejects_redirects()
    {
        var credential = new ConfiguredVertexCredential(Config(Endpoint), new Host("Development"), new SyntheticIdentity("synthetic-redirect"));
        await Assert.ThrowsAsync<TutorUnavailableException>(() => credential.Token(CancellationToken.None));
    }

    [Theory]
    [InlineData("http://127.0.0.1:4900/sts/v1/token")]
    [InlineData("https://untrusted.example/token")]
    [InlineData("https://sts.googleapis.com/v1/token?key=unexpected")]
    public void Production_rejects_alternate_token_destinations(string endpoint) =>
        Assert.Throws<TutorUnavailableException>(() => ConfiguredVertexCredential.CreateFederated(Config(endpoint), new Host("Production"), new SyntheticIdentity("unused")));

    [Theory]
    [InlineData("//evil/projects/1", Resource)]
    [InlineData(Audience, "https://management.azure.com/")]
    [InlineData(Audience, "api://bad?x=y")]
    public void Malformed_trust_configuration_is_rejected_before_requesting_identity(string audience, string resource)
    {
        var source = new SyntheticIdentity("unused");
        Assert.Throws<TutorUnavailableException>(() => ConfiguredVertexCredential.CreateFederated(Config(audience: audience, resource: resource), new Host("Production"), source));
        Assert.Equal(0, source.Calls);
    }

    private sealed class SyntheticIdentity(string value) : TokenCredential
    {
        public int Calls;
        public string? Scope;
        public override AccessToken GetToken(TokenRequestContext requestContext, CancellationToken cancellationToken) => throw new NotSupportedException();
        public override ValueTask<AccessToken> GetTokenAsync(TokenRequestContext requestContext, CancellationToken cancellationToken)
        {
            cancellationToken.ThrowIfCancellationRequested();
            Interlocked.Increment(ref Calls); Scope = Assert.Single(requestContext.Scopes);
            return ValueTask.FromResult(new AccessToken(value, DateTimeOffset.UtcNow.AddHours(1)));
        }
    }

    private sealed class Host(string name) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = name;
        public string ApplicationName { get; set; } = "FederationTests";
        public string ContentRootPath { get; set; } = ".";
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
