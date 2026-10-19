using AITeacher.Api.Features.Assessments;
using AITeacher.Api.Features.Catalog;
using AITeacher.Api.Features.Editorial;
using AITeacher.Api.Features.Identity;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Npgsql;
using Xunit;

namespace AITeacher.Api.Tests;

public sealed class TestClock : TimeProvider
{
    public DateTimeOffset Now { get; set; } = DateTimeOffset.UtcNow;
    public override DateTimeOffset GetUtcNow() => Now;
}

// Test-only port replacement. The production host has no bypass or fake login mode.
public sealed class TestGoogleVerifier : IGoogleIdentityVerifier
{
    public Task<GoogleIdentity?> VerifyAsync(string credential, CancellationToken cancellationToken) =>
        Task.FromResult(credential switch
        {
            "author" => new GoogleIdentity("author-sub", "author@example.test", "Author"),
            "student-a" => new GoogleIdentity("student-a-sub", "a@example.test", "Student A"),
            "student-b" => new GoogleIdentity("student-b-sub", "b@example.test", "Student B"),
            _ => (GoogleIdentity?)null
        });
}

public sealed class ApiHost(string connection, TestClock clock) : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");
        builder.UseSetting("ConnectionStrings:Postgres", connection);
        builder.UseSetting("Authentication:GoogleClientId", "test-client");
        builder.UseSetting("Authentication:AuthorGoogleSubjects:0", "author-sub");
        builder.ConfigureServices(services =>
        {
            services.RemoveAll<IGoogleIdentityVerifier>();
            services.AddScoped<IGoogleIdentityVerifier, TestGoogleVerifier>();
            services.RemoveAll<TimeProvider>();
            services.AddSingleton<TimeProvider>(clock);
        });
    }
}

public sealed class ApiFixture : IAsyncLifetime
{
    private readonly string databaseName = "aiteacher_test_" + Guid.NewGuid().ToString("N");
    private string adminConnection = "";
    public string Connection { get; private set; } = "";
    public TestClock Clock { get; } = new();
    public ApiHost Host { get; private set; } = null!;

    public async Task InitializeAsync()
    {
        adminConnection = Environment.GetEnvironmentVariable("AITEACHER_TEST_POSTGRES")
            ?? throw new InvalidOperationException("Set AITEACHER_TEST_POSTGRES to a local PostgreSQL connection with CREATEDB permission. These tests require real PostgreSQL.");
        await using var admin = new NpgsqlConnection(adminConnection);
        await admin.OpenAsync();
        await using var command = new NpgsqlCommand($"CREATE DATABASE {databaseName}", admin);
        await command.ExecuteNonQueryAsync();
        Connection = new NpgsqlConnectionStringBuilder(adminConnection) { Database = databaseName }.ConnectionString;
        Host = new ApiHost(Connection, Clock);
        using var scope = Host.Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<IdentityDbContext>().Database.MigrateAsync();
        await scope.ServiceProvider.GetRequiredService<CatalogDbContext>().Database.MigrateAsync();
        await scope.ServiceProvider.GetRequiredService<EditorialDbContext>().Database.MigrateAsync();
        await scope.ServiceProvider.GetRequiredService<AssessmentDbContext>().Database.MigrateAsync();
    }

    public async Task DisposeAsync()
    {
        if (Host is not null) await Host.DisposeAsync();
        if (string.IsNullOrEmpty(adminConnection)) return;
        NpgsqlConnection.ClearAllPools();
        await using var admin = new NpgsqlConnection(adminConnection);
        await admin.OpenAsync();
        await using var command = new NpgsqlCommand($"DROP DATABASE IF EXISTS {databaseName} WITH (FORCE)", admin);
        await command.ExecuteNonQueryAsync();
    }
}
