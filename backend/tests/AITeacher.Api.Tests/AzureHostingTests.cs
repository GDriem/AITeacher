using AITeacher.Api.Infrastructure;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using System.Net;
using Xunit;

namespace AITeacher.Api.Tests;

public sealed class AzureHostingTests
{
    [Theory]
    [InlineData("Host=db;Database=app;Username=runtime;SSL Mode=Require")]
    [InlineData("Host=db;Database=app;Username=runtime;SSL Mode=VerifyFull;Password=token")]
    [InlineData("Host=db;Database=app;Username=runtime;SSL Mode=VerifyFull;Passfile=/tmp/password")]
    [InlineData("Host=db;Database=app;SSL Mode=VerifyFull")]
    public void ManagedIdentityRejectsUnsafeConnectionSettings(string connection) =>
        Assert.Throws<InvalidOperationException>(() => PostgresConnections.Validate(connection, true));

    [Fact]
    public void LocalPasswordConfigurationStillWorks() =>
        PostgresConnections.Validate("Host=localhost;Database=app;Username=user;Password=local", false);

    [Fact]
    public void ManagedIdentityRequiresAnExplicitClientId()
    {
        var empty = new ConfigurationBuilder().Build();
        Assert.Throws<InvalidOperationException>(() => AzureHosting.Credential(empty));
        var valid = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
            { ["Azure:ManagedIdentityClientId"] = Guid.NewGuid().ToString() }).Build();
        Assert.IsType<Azure.Identity.ManagedIdentityCredential>(AzureHosting.Credential(valid));
    }

    [Fact]
    public void SqlIdentifierEscapesEmbeddedQuotesWithoutTruncating()
    {
        Assert.Equal("\"runtime\"\";DROP ROLE owner;--\"", RuntimeDatabaseAccess.Identifier("runtime\";DROP ROLE owner;--"));
        Assert.Throws<InvalidOperationException>(() => RuntimeDatabaseAccess.Identifier(new string('x', 64)));
        Assert.Throws<InvalidOperationException>(() => RuntimeDatabaseAccess.Identifier("a\0b"));
        Assert.Throws<InvalidOperationException>(() => RuntimeDatabaseAccess.Identifier(new string('á', 32)));
        var sql = RuntimeDatabaseAccess.Grants("aiteacher", "runtime");
        Assert.Contains("GRANT USAGE ON SCHEMA \"content\" TO \"runtime\"", sql);
        Assert.DoesNotContain("GRANT CREATE", sql);
        Assert.DoesNotContain("ALL PRIVILEGES", sql);
        Assert.Contains("ALTER DEFAULT PRIVILEGES", sql);
    }

    [Theory]
    [InlineData("10.42.0.4", "https", "198.51.100.7")]
    [InlineData("203.0.113.4", "http", "203.0.113.4")]
    [InlineData("::ffff:100.100.0.26", "https", "198.51.100.7")]
    [InlineData("100.100.0.27", "https", "198.51.100.7")]
    [InlineData("100.100.128.1", "http", "100.100.128.1")]
    public async Task OnlyTheConfiguredProxyCanChangeSchemeAndClientAddress(string proxy, string scheme, string client)
    {
        using var host = await new HostBuilder().ConfigureWebHost(web => web.UseTestServer()
            .ConfigureServices(services => services.Configure<ForwardedHeadersOptions>(options =>
                AzureHosting.ConfigureProxy(options, ["10.42.0.0/23", "100.100.0.0/17", "::ffff:100.100.0.0/113"])))
            .Configure(app =>
            {
                app.Use(async (context, next) => { context.Connection.RemoteIpAddress = IPAddress.Parse(proxy); await next(); });
                app.UseForwardedHeaders();
                app.Run(context => context.Response.WriteAsync($"{context.Request.Scheme}|{context.Connection.RemoteIpAddress}|{context.Request.Host}"));
            })).StartAsync();
        using var http = host.GetTestClient();
        using var request = new HttpRequestMessage(HttpMethod.Get, "http://app.example/");
        request.Headers.Add("X-Forwarded-Proto", "https");
        request.Headers.Add("X-Forwarded-For", "198.51.100.7");
        request.Headers.Add("X-Forwarded-Host", "attacker.example");
        using var response = await http.SendAsync(request);
        Assert.Equal($"{scheme}|{client}|app.example", await response.Content.ReadAsStringAsync());
    }
}
