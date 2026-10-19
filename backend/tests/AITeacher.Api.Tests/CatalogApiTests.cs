using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using AITeacher.Api.Features.Catalog;
using AITeacher.Api.Features.Identity;
using AITeacher.Modules.Curriculum.Catalog;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace AITeacher.Api.Tests;

public sealed class CatalogApiTests(ApiFixture fixture) : IClassFixture<ApiFixture>
{
    private static object Entry(string? slug = null) => new { name = "Álgebra", slug = slug ?? "item-" + Guid.NewGuid().ToString("N"), sortOrder = 1, isAvailable = true };
    private HttpClient Client() => fixture.Host.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });

    private static async Task Csrf(HttpClient client)
    {
        var response = await client.GetFromJsonAsync<JsonObject>("/api/auth/csrf");
        client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", response!["requestToken"]!.GetValue<string>());
    }

    private async Task<HttpClient> Login(string credential = "author")
    {
        var client = Client();
        await Csrf(client);
        var response = await client.PostAsJsonAsync("/api/auth/google", new { credential });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        await Csrf(client); // Antiforgery tokens are bound to the authenticated identity.
        return client;
    }

    private static async Task<JsonObject> Create(HttpClient client, string resource, object request)
    {
        var response = await client.PostAsJsonAsync("/api/catalog/" + resource, request);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.NotNull(response.Headers.Location);
        return (await response.Content.ReadFromJsonAsync<JsonObject>())!;
    }

    [Fact]
    public async Task Health_and_auth_boundaries()
    {
        using var client = Client();
        Assert.Equal("Healthy", await client.GetStringAsync("/health"));
        Assert.Equal("Healthy", await client.GetStringAsync("/health/ready"));
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/catalog/subjects")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync("/api/catalog/subjects", Entry())).StatusCode);
        var unknown = await client.GetAsync("/missing");
        Assert.Equal(HttpStatusCode.NotFound, unknown.StatusCode);
        Assert.Equal("application/problem+json", unknown.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Missing_google_configuration_is_unavailable_without_creating_a_session()
    {
        using var client = Client();
        await Csrf(client);
        var config = fixture.Host.Services.GetRequiredService<IConfiguration>();
        try
        {
            config["Authentication:GoogleClientId"] = "";
            var response = await client.PostAsJsonAsync("/api/auth/google", new { credential = "author" });
            Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
            Assert.False(response.Headers.Contains("Set-Cookie"));
        }
        finally { config["Authentication:GoogleClientId"] = "test-client"; }
    }

    [Fact]
    public async Task Database_failure_changes_readiness_but_not_liveness()
    {
        var connection = new Npgsql.NpgsqlConnectionStringBuilder(fixture.Connection)
        {
            Port = 1, Timeout = 1
        }.ConnectionString;
        await using var unavailable = new ApiHost(connection, fixture.Clock);
        using var client = unavailable.CreateClient();
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/health")).StatusCode);
        Assert.Equal(HttpStatusCode.ServiceUnavailable, (await client.GetAsync("/health/ready")).StatusCode);
    }

    [Fact]
    public async Task Login_rejects_invalid_credentials_and_csrf()
    {
        using var client = Client();
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/auth/google", new { credential = "author" })).StatusCode);
        await Csrf(client);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync("/api/auth/google", new { credential = "invalid" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/auth/google", new { credential = "" })).StatusCode);
    }

    [Fact]
    public async Task Student_can_read_but_cannot_write_or_grant_a_role()
    {
        using var client = await Login("student-a");
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/catalog/subjects")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync("/api/catalog/subjects", new { name = "Hack", slug = "hack", role = "Author" })).StatusCode);
        var me = await client.GetFromJsonAsync<JsonObject>("/api/auth/me");
        Assert.False(me!["canAuthor"]!.GetValue<bool>());
        Assert.Equal(SessionAuthenticationHandler.StudentId("student-a-sub"), me["studentId"]!.GetValue<string>());
    }

    [Fact]
    public async Task Full_catalog_is_persisted_and_survives_a_new_host()
    {
        using var client = await Login();
        var subject = await Create(client, "subjects", Entry());
        var category = await Create(client, "categories", new { subjectId = subject["id"]!.GetValue<Guid>(), entry = Entry() });
        var scale = await Create(client, "scales", new { purpose = "proficiency", entry = Entry() });
        var level = await Create(client, "levels", new { scaleId = scale["id"]!.GetValue<Guid>(), entry = Entry() });
        var topic = await Create(client, "topics", new { subjectId = subject["id"]!.GetValue<Guid>(), categoryId = category["id"]!.GetValue<Guid>(), levelId = level["id"]!.GetValue<Guid>(), entry = Entry() });
        Assert.Equal(category["id"]!.GetValue<Guid>(), topic["categoryId"]!.GetValue<Guid>());
        await using var restarted = new ApiHost(fixture.Connection, fixture.Clock);
        using var scope = restarted.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CatalogDbContext>();
        Assert.True(await db.Topics.AnyAsync(x => x.Id == topic["id"]!.GetValue<Guid>()));
        Assert.True(await scope.ServiceProvider.GetRequiredService<IdentityDbContext>().Students.AnyAsync(x => x.GoogleSubject == "author-sub"));
    }

    [Fact]
    public async Task Parent_references_and_subject_category_scope_are_enforced()
    {
        using var client = await Login();
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/catalog/categories", new { subjectId = Guid.NewGuid(), entry = Entry() })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/catalog/levels", new { scaleId = Guid.NewGuid(), entry = Entry() })).StatusCode);
        var subject = await Create(client, "subjects", Entry());
        var other = await Create(client, "subjects", Entry());
        var category = await Create(client, "categories", new { subjectId = subject["id"]!.GetValue<Guid>(), entry = Entry() });
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/catalog/topics", new { subjectId = other["id"]!.GetValue<Guid>(), categoryId = category["id"]!.GetValue<Guid>(), entry = Entry() })).StatusCode);
        using var scope = fixture.Host.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CatalogDbContext>();
        db.Topics.Add(new Topic { Name = "Invalid", Slug = "invalid", SubjectId = other["id"]!.GetValue<Guid>(), CategoryId = category["id"]!.GetValue<Guid>() });
        await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
    }

    [Fact]
    public async Task Names_slugs_purpose_nested_requests_and_pagination_are_validated()
    {
        using var client = await Login();
        foreach (var entry in new object[] { new { name = " ", slug = "valid" }, new { name = "Valid", slug = "Bad Slug" }, new { name = new string('x', 151), slug = "valid" } })
            Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/catalog/subjects", entry)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/catalog/scales", new { purpose = "arbitrary", entry = Entry() })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/catalog/scales", new { purpose = "mastery", entry = new { name = " ", slug = "valid" } })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/catalog/scales", new { purpose = "mastery", entry = (object?)null })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/catalog/subjects?limit=101")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/catalog/subjects?offset=-1")).StatusCode);
    }

    [Fact]
    public async Task Duplicate_slug_returns_conflict_without_database_details()
    {
        using var client = await Login();
        var entry = Entry();
        await Create(client, "subjects", entry);
        var response = await client.PostAsJsonAsync("/api/catalog/subjects", entry);
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.DoesNotContain("INSERT", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Concurrent_updates_have_one_winner_and_preserve_version()
    {
        using var client = await Login();
        var subject = await Create(client, "subjects", Entry());
        var url = "/api/catalog/subjects/" + subject["id"]!.GetValue<Guid>();
        var responses = await Task.WhenAll(
            client.PutAsJsonAsync(url, new { version = 1, entry = Entry() }),
            client.PutAsJsonAsync(url, new { version = 1, entry = Entry() }));
        Assert.Single(responses, x => x.StatusCode == HttpStatusCode.OK);
        Assert.Single(responses, x => x.StatusCode == HttpStatusCode.Conflict);
        var saved = await client.GetFromJsonAsync<JsonObject>(url);
        Assert.Equal(2, saved!["version"]!.GetValue<int>());
    }

    [Fact]
    public async Task Author_write_requires_csrf_and_update_can_change_availability()
    {
        using var client = await Login();
        var subject = await Create(client, "subjects", Entry());
        client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/catalog/subjects", Entry())).StatusCode);
        await Csrf(client);
        var response = await client.PutAsJsonAsync("/api/catalog/subjects/" + subject["id"]!.GetValue<Guid>(),
            new { version = 1, entry = new { name = "Renamed", slug = "disabled-" + Guid.NewGuid().ToString("N"), sortOrder = 10, isAvailable = false } });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.False((await response.Content.ReadFromJsonAsync<JsonObject>())!["isAvailable"]!.GetValue<bool>());
    }

    [Fact]
    public async Task Users_are_isolated_logout_revokes_replayed_cookie_and_tokens_are_hashed()
    {
        using var a = await Login("student-a");
        using var b = await Login("student-b");
        var profileA = await a.GetFromJsonAsync<JsonObject>("/api/auth/me");
        var profileB = await b.GetFromJsonAsync<JsonObject>("/api/auth/me");
        Assert.NotEqual(profileA!["studentId"]!.GetValue<string>(), profileB!["studentId"]!.GetValue<string>());
        // Capture the issued cookie, then prove server-side revocation, even when replayed.
        using var fresh = Client();
        await Csrf(fresh);
        var login = await fresh.PostAsJsonAsync("/api/auth/google", new { credential = "student-a" });
        var cookie = login.Headers.GetValues("Set-Cookie").Single(x => x.StartsWith(SessionAuthenticationHandler.CookieName + "=", StringComparison.Ordinal)).Split(';')[0];
        var rawToken = cookie.Split('=')[1];
        using (var scope = fixture.Host.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<IdentityDbContext>();
            Assert.False(await db.Sessions.AnyAsync(x => x.TokenHash == rawToken));
            Assert.True(await db.Sessions.AnyAsync(x => x.TokenHash == SessionAuthenticationHandler.Hash(rawToken)));
        }
        await Csrf(fresh);
        Assert.Equal(HttpStatusCode.NoContent, (await fresh.PostAsJsonAsync("/api/auth/logout", new { })).StatusCode);
        using var replay = Client();
        replay.DefaultRequestHeaders.Add("Cookie", cookie);
        Assert.Equal(HttpStatusCode.Unauthorized, (await replay.GetAsync("/api/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await b.GetAsync("/api/auth/me")).StatusCode);
    }

    [Fact]
    public async Task Expired_sessions_are_rejected()
    {
        using var client = await Login();
        var previous = fixture.Clock.Now;
        try
        {
            fixture.Clock.Now = previous.AddDays(8);
            Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/auth/me")).StatusCode);
        }
        finally { fixture.Clock.Now = previous; }
    }

    [Fact]
    public async Task Removing_author_configuration_revokes_write_access_immediately()
    {
        using var client = await Login();
        var config = fixture.Host.Services.GetRequiredService<IConfiguration>();
        try
        {
            config["Authentication:AuthorGoogleSubjects:0"] = "revoked";
            Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync("/api/catalog/subjects", Entry())).StatusCode);
        }
        finally { config["Authentication:AuthorGoogleSubjects:0"] = "author-sub"; }
    }
}
