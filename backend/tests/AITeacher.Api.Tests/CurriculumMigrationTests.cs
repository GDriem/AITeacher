using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Json;
using System.Text.Json.Nodes;
using AITeacher.Api.Features.Catalog;
using AITeacher.Api.Features.Editorial;
using AITeacher.Modules.Curriculum.Publishing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace AITeacher.Api.Tests;

public sealed class CurriculumMigrationTests(ApiFixture fixture) : IClassFixture<ApiFixture>
{
    private async Task<JsonElement> Run(string mode)
    {
        using var scope = fixture.Host.Services.CreateScope();
        return JsonSerializer.SerializeToElement(await scope.ServiceProvider.GetRequiredService<CurriculumMigration>().Run(mode, default), new JsonSerializerOptions(JsonSerializerDefaults.Web));
    }

    [Fact]
    public async Task Migration_inspects_without_writes_publishes_all_repeats_and_preserves_editorial_conflicts()
    {
        var before = await Run("inspect");
        Assert.Equal(0, before.GetProperty("imported").GetInt32());
        using (var scope = fixture.Host.Services.CreateScope())
            Assert.Equal(0, await scope.ServiceProvider.GetRequiredService<CatalogDbContext>().Subjects.CountAsync());
        var first = await Run("apply");
        Assert.True(first.GetProperty("matches").GetBoolean());
        Assert.Equal(82, first.GetProperty("published").GetInt32());
        Assert.Equal(51, first.GetProperty("catalogEntriesToCreate").GetInt32());
        var again = await Run("apply");
        Assert.True(again.GetProperty("matches").GetBoolean());
        Assert.Equal(0, again.GetProperty("catalogEntriesToCreate").GetInt32());
        Assert.Equal(0, again.GetProperty("readingsToImportOrPublish").GetInt32());
        Assert.Equal(first.GetProperty("items").ToString(), again.GetProperty("items").ToString());
        Assert.True((await Run("reconcile")).GetProperty("matches").GetBoolean());

        using var student = fixture.Host.CreateClient();
        var csrf = await student.GetFromJsonAsync<JsonObject>("/api/auth/csrf");
        student.DefaultRequestHeaders.Add("X-CSRF-TOKEN", csrf!["requestToken"]!.GetValue<string>());
        Assert.Equal(HttpStatusCode.OK, (await student.PostAsJsonAsync("/api/auth/google", new { credential = "student-a" })).StatusCode);
        var page = await student.GetFromJsonAsync<JsonObject>("/api/units?limit=100");
        Assert.Equal(82, page!["total"]!.GetValue<int>());
        foreach (var item in page["items"]!.AsArray())
        {
            var unit = await student.GetFromJsonAsync<JsonObject>("/api/units/" + item!["id"]!.GetValue<Guid>());
            Assert.Null(unit!["revision"]!["origin"]);
            var document = unit["revision"]!["document"]!;
            Assert.Null(document["assessments"]);
            Assert.Empty(document["exercises"]!.AsArray());
            Assert.NotNull(document["readingProvenance"]!["level"]);
            Assert.Equal("reading", document["kind"]!.GetValue<string>());
            Assert.Equal(HttpStatusCode.Forbidden, (await student.GetAsync("/api/units/" + item["id"]!.GetValue<Guid>() + "/revisions")).StatusCode);
        }
        using var anonymous = fixture.Host.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/catalog/source-curriculum")).StatusCode);
        var reference = await student.GetFromJsonAsync<JsonObject>("/api/catalog/source-curriculum");
        Assert.Equal(35, reference!["topics"]!.AsArray().Count);
        Assert.Equal(3, reference["levels"]!.AsArray().Count);

        // An author's newer revision must never be replaced or republished by a rerun.
        using (var scope = fixture.Host.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<EditorialDbContext>();
            var unit = await db.Units.FirstAsync();
            var revision = await db.Revisions.SingleAsync(x => x.UnitId == unit.Id);
            var document = JsonSerializer.Deserialize<UnitDocument>(revision.DocumentJson, new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
            var actor = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, "other-author")], "test"));
            await scope.ServiceProvider.GetRequiredService<EditorialService>().Revise(unit.Id, new(unit.Version, document with { Title = "Edición que debe conservarse" }), actor, default);
        }
        var blocked = await Run("apply");
        Assert.NotEmpty(blocked.GetProperty("conflicts").EnumerateArray());
        Assert.False(blocked.GetProperty("matches").GetBoolean());
        using (var scope = fixture.Host.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<EditorialDbContext>();
            Assert.Equal(82, await db.Units.CountAsync());
            Assert.Equal(83, await db.Revisions.CountAsync());
        }
    }

    [Fact]
    public void Reading_publication_does_not_relax_complete_learning_unit_coverage()
    {
        var reading = new UnitDocument("Lectura", [], [], [new(Guid.NewGuid(), "Título", "Texto", "Fuente", [])], [], [], [], "reading");
        Assert.Empty(UnitDocumentValidation.Validate(reading, publishing: true));
        Assert.NotEmpty(UnitDocumentValidation.Validate(reading with { Kind = "learningUnit" }, publishing: true));
        Assert.NotEmpty(UnitDocumentValidation.Validate(reading with { Readings = [] }, publishing: true));
        Assert.NotEmpty(UnitDocumentValidation.Validate(reading with { Exercises = [new(Guid.NewGuid(), "Inventado", [])] }, publishing: true));
    }
}
