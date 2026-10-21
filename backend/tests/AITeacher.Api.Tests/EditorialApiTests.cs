using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using AITeacher.Api.Features.Editorial;
using AITeacher.Modules.Curriculum.Publishing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace AITeacher.Api.Tests;

public sealed class EditorialApiTests(ApiFixture fixture) : IClassFixture<ApiFixture>
{
    private async Task<HttpClient> Login(string credential = "author")
    {
        var client = fixture.Host.CreateClient();
        await Csrf(client);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync("/api/auth/google", new { credential })).StatusCode);
        await Csrf(client);
        return client;
    }

    private static async Task Csrf(HttpClient client)
    {
        var token = await client.GetFromJsonAsync<JsonObject>("/api/auth/csrf");
        client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", token!["requestToken"]!.GetValue<string>());
    }

    private static async Task<JsonObject> Success(HttpResponseMessage response, HttpStatusCode expected = HttpStatusCode.OK)
    {
        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == expected, $"Expected {expected}, got {response.StatusCode}: {body}");
        return JsonNode.Parse(body)!.AsObject();
    }

    private static async Task<Guid> Topic(HttpClient client)
    {
        var entry = new { name = "Tema", slug = "test-" + Guid.NewGuid().ToString("N") };
        var subject = await Success(await client.PostAsJsonAsync("/api/catalog/subjects", entry), HttpStatusCode.Created);
        var category = await Success(await client.PostAsJsonAsync("/api/catalog/categories", new { subjectId = subject["id"]!.GetValue<Guid>(), entry }), HttpStatusCode.Created);
        var topic = await Success(await client.PostAsJsonAsync("/api/catalog/topics", new { subjectId = subject["id"]!.GetValue<Guid>(), categoryId = category["id"]!.GetValue<Guid>(), entry }), HttpStatusCode.Created);
        return topic["id"]!.GetValue<Guid>();
    }

    private static UnitDocument Document(string title = "Unidad")
    {
        var concept = Guid.NewGuid();
        var objective = Guid.NewGuid();
        return new(title, [new(concept, "Concepto")], [new(objective, "Explicar y aplicar el concepto", [concept])],
            [new(Guid.NewGuid(), "Lectura", "Explicación", "Fuente propia", [objective])],
            [new(Guid.NewGuid(), "Aplicar el concepto", [objective])],
            [new(Guid.NewGuid(), "Evaluar transferencia", "PRIVATE-ANSWER-DO-NOT-EXPOSE", [objective])], []);
    }

    private static string Url(JsonObject unit) => "/api/units/" + unit["id"]!.GetValue<Guid>();
    private static string Revision(JsonObject unit) => Url(unit) + "/revisions/" + unit["revision"]!["id"]!.GetValue<Guid>();
    private static long Version(JsonObject unit) => unit["version"]!.GetValue<long>();
    private static async Task<JsonObject> Create(HttpClient client, Guid topic, UnitDocument document) =>
        await Success(await client.PostAsJsonAsync("/api/units", new { topicId = topic, document }), HttpStatusCode.Created);
    private static async Task<JsonObject> Publish(HttpClient client, JsonObject unit) =>
        await Success(await client.PostAsJsonAsync(Revision(unit) + "/publish", new { version = Version(unit) }));

    [Fact]
    public async Task Complete_unit_publish_revise_and_unpublish_preserves_history_and_student_projection()
    {
        using var author = await Login();
        using var student = await Login("student-a");
        var topic = await Topic(author);
        var first = await Create(author, topic, Document());
        Assert.Equal(HttpStatusCode.NotFound, (await student.GetAsync(Url(first))).StatusCode);
        var page = await student.GetFromJsonAsync<JsonObject>($"/api/units?topicId={topic}");
        Assert.Equal(0, page!["total"]!.GetValue<int>());
        var published = await Publish(author, first);
        var visible = await student.GetStringAsync(Url(first));
        Assert.DoesNotContain("PRIVATE-ANSWER", visible);
        Assert.DoesNotContain("assessments", visible);
        var next = await Success(await author.PostAsJsonAsync(Url(first) + "/revisions", new { version = Version(published), document = Document("Borrador nuevo") }), HttpStatusCode.Created);
        Assert.Equal(2, next["revision"]!["number"]!.GetValue<int>());
        var studentVersion = await student.GetFromJsonAsync<JsonObject>(Url(first));
        Assert.Equal(first["revision"]!["id"]!.GetValue<Guid>(), studentVersion!["revision"]!["id"]!.GetValue<Guid>());
        Assert.Equal("Unidad", studentVersion["revision"]!["document"]!["title"]!.GetValue<string>());
        Assert.Equal("Borrador nuevo", (await author.GetFromJsonAsync<JsonObject>(Url(first)))!["revision"]!["document"]!["title"]!.GetValue<string>());
        var second = await Publish(author, next);
        Assert.Contains("Borrador nuevo", await student.GetStringAsync(Url(first)));
        await Success(await author.PostAsJsonAsync(Url(first) + "/unpublish", new { version = Version(second) }));
        Assert.Equal(HttpStatusCode.NotFound, (await student.GetAsync(Url(first))).StatusCode);
        page = await student.GetFromJsonAsync<JsonObject>($"/api/units?topicId={topic}");
        Assert.Equal(0, page!["total"]!.GetValue<int>());
        var old = await author.GetFromJsonAsync<JsonObject>(Revision(first));
        Assert.Equal("Unidad", old!["revision"]!["document"]!["title"]!.GetValue<string>());
        var history = await author.GetFromJsonAsync<JsonObject>(Url(first) + "/revisions");
        Assert.Equal(2, history!["total"]!.GetValue<int>());
        Assert.All(history["items"]!.AsArray(), x => Assert.NotNull(x!["publishedAt"]));
        await using var restarted = new ApiHost(fixture.Connection, fixture.Clock);
        using var scope = restarted.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<EditorialDbContext>();
        Assert.Equal(2, await db.Revisions.CountAsync(x => x.UnitId == first["id"]!.GetValue<Guid>()));
        Assert.Null((await db.Units.SingleAsync(x => x.Id == first["id"]!.GetValue<Guid>())).PublishedRevisionId);
    }

    [Fact]
    public async Task Publication_requires_coverage_for_each_objective_and_does_not_change_version_on_failure()
    {
        using var author = await Login();
        var topic = await Topic(author);
        var complete = Document();
        foreach (var document in new[] { complete with { Objectives = [], Readings = [], Exercises = [], Assessments = [] },
            complete with { Readings = [] }, complete with { Exercises = [] }, complete with { Assessments = [] },
            complete with { Objectives = [complete.Objectives[0] with { ConceptIds = [] }] },
            complete with { Objectives = [.. complete.Objectives, new(Guid.NewGuid(), "Objetivo sin cobertura", [complete.Concepts[0].Id])] } })
        {
            var unit = await Create(author, topic, document);
            Assert.Equal(HttpStatusCode.BadRequest, (await author.PostAsJsonAsync(Revision(unit) + "/publish", new { version = 1 })).StatusCode);
            var saved = await author.GetFromJsonAsync<JsonObject>(Url(unit));
            Assert.Equal(1, Version(saved!));
            Assert.Null(saved!["publishedRevisionId"]);
        }
    }

    [Fact]
    public async Task Unknown_cross_unit_references_duplicates_cycles_and_invalid_text_are_rejected()
    {
        using var author = await Login();
        var topic = await Topic(author);
        var doc = Document();
        var a = doc.Concepts[0].Id;
        var b = Guid.NewGuid();
        foreach (var invalid in new[] {
            doc with { Title = " " }, doc with { Concepts = null! },
            doc with { Readings = [doc.Readings[0] with { ObjectiveIds = [Guid.NewGuid()] }] },
            doc with { Objectives = [doc.Objectives[0] with { ConceptIds = [Guid.NewGuid()] }] },
            doc with { Exercises = [doc.Exercises[0] with { Id = doc.Readings[0].Id }] },
            doc with { Concepts = [doc.Concepts[0], new(b, "Segundo")], Prerequisites = [new(a, b), new(b, a)] },
            doc with { Prerequisites = [new(a, Guid.NewGuid())] },
            doc with { Assessments = [doc.Assessments[0] with { PrivateCriteria = "" }] },
            doc with { Readings = [null!] } })
            Assert.Equal(HttpStatusCode.BadRequest, (await author.PostAsJsonAsync("/api/units", new { topicId = topic, document = invalid })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await author.PostAsJsonAsync("/api/units", new { topicId = Guid.NewGuid(), document = doc })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await author.PostAsJsonAsync("/api/units", new { topicId = topic, document = (object?)null })).StatusCode);
    }

    [Fact]
    public async Task Editorial_routes_enforce_auth_author_csrf_pagination_and_revision_ownership()
    {
        using var anonymous = fixture.Host.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/units")).StatusCode);
        using var author = await Login();
        using var student = await Login("student-a");
        var topic = await Topic(author);
        var unit = await Create(author, topic, Document());
        var other = await Create(author, topic, Document());
        Assert.Equal(HttpStatusCode.Forbidden, (await student.PostAsJsonAsync("/api/units", new { topicId = topic, document = Document() })).StatusCode);
        foreach (var path in new[] { Url(unit) + "/revisions", Revision(unit) })
            Assert.Equal(HttpStatusCode.Forbidden, (await student.GetAsync(path)).StatusCode);
        foreach (var path in new[] { Url(unit) + "/revisions", Revision(unit) + "/publish", Url(unit) + "/unpublish", "/api/units/import" })
            Assert.Equal(HttpStatusCode.Forbidden, (await student.PostAsJsonAsync(path, new { version = 1 })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await author.GetAsync(Url(other) + "/revisions/" + unit["revision"]!["id"]!.GetValue<Guid>())).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await author.PostAsJsonAsync(Url(other) + "/revisions/" + unit["revision"]!["id"]!.GetValue<Guid>() + "/publish", new { version = 1 })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await author.GetAsync("/api/units?limit=101")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await author.GetAsync(Url(unit) + "/revisions?offset=-1")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await author.PostAsJsonAsync(Url(unit) + "/unpublish", new { version = 0 })).StatusCode);
        author.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        Assert.Equal(HttpStatusCode.BadRequest, (await author.PostAsJsonAsync(Revision(unit) + "/publish", new { version = 1 })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await author.PostAsJsonAsync("/api/units/import", new { records = new object[0], topicMappings = new { } })).StatusCode);
    }

    [Fact]
    public async Task Concurrent_revision_writes_commit_one_snapshot_and_conflict_rolls_back_the_loser()
    {
        using var author = await Login();
        var unit = await Create(author, await Topic(author), Document());
        var results = await Task.WhenAll(author.PostAsJsonAsync(Url(unit) + "/revisions", new { version = 1, document = Document("A") }),
            author.PostAsJsonAsync(Url(unit) + "/revisions", new { version = 1, document = Document("B") }));
        Assert.Single(results, x => x.StatusCode == HttpStatusCode.Created);
        Assert.Single(results, x => x.StatusCode == HttpStatusCode.Conflict);
        var history = await author.GetFromJsonAsync<JsonObject>(Url(unit) + "/revisions");
        Assert.Equal(2, history!["total"]!.GetValue<int>());
        Assert.Equal(HttpStatusCode.Conflict, (await author.PostAsJsonAsync(Revision(unit) + "/publish", new { version = 1 })).StatusCode);
    }

    [Fact]
    public async Task Concurrent_publication_and_revision_have_one_winner()
    {
        using var author = await Login();
        var unit = await Create(author, await Topic(author), Document());
        var results = await Task.WhenAll(author.PostAsJsonAsync(Url(unit) + "/revisions", new { version = 1, document = Document("Nuevo") }),
            author.PostAsJsonAsync(Revision(unit) + "/publish", new { version = 1 }));
        Assert.Single(results, x => x.IsSuccessStatusCode);
        Assert.Single(results, x => x.StatusCode == HttpStatusCode.Conflict);
        var current = await author.GetFromJsonAsync<JsonObject>(Url(unit));
        Assert.Equal(2, Version(current!));
        using var scope = fixture.Host.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<EditorialDbContext>();
        var revisionId = unit["revision"]!["id"]!.GetValue<Guid>();
        Assert.Equal(current!["publishedRevisionId"] is not null, await db.Publications.AnyAsync(x => x.RevisionId == revisionId));
    }

    [Fact]
    public async Task Revision_content_and_publication_records_are_immutable_even_in_sql()
    {
        using var author = await Login();
        var unit = await Create(author, await Topic(author), Document());
        await Publish(author, unit);
        using var scope = fixture.Host.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<EditorialDbContext>();
        var revision = unit["revision"]!["id"]!.GetValue<Guid>();
        await Assert.ThrowsAsync<Npgsql.PostgresException>(() => db.Database.ExecuteSqlInterpolatedAsync($"UPDATE content.unit_revisions SET \"DocumentJson\" = '{{}}'::jsonb WHERE \"Id\" = {revision}"));
        await Assert.ThrowsAsync<Npgsql.PostgresException>(() => db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM content.unit_revisions WHERE \"Id\" = {revision}"));
        await Assert.ThrowsAsync<Npgsql.PostgresException>(() => db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM content.publications WHERE \"RevisionId\" = {revision}"));
        var other = await Create(author, unit["topicId"]!.GetValue<Guid>(), Document());
        var otherId = other["id"]!.GetValue<Guid>();
        await Assert.ThrowsAsync<Npgsql.PostgresException>(() => db.Database.ExecuteSqlInterpolatedAsync($"UPDATE content.units SET \"PublishedRevisionId\" = {revision} WHERE \"Id\" = {otherId}"));
    }

    [Fact]
    public async Task Real_corpus_import_preserves_all_82_records_as_drafts_and_retries_skip_editorial_changes()
    {
        using var author = await Login();
        var records = JsonSerializer.Deserialize<CorpusRecord[]>(await File.ReadAllTextAsync(Path.Combine(AppContext.BaseDirectory, "learning_content.json")), new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
        Assert.Equal(82, records.Length);
        var topic = await Topic(author);
        var mappings = records.Select(x => x.Topic).Distinct().ToDictionary(x => x, _ => topic);
        var request = new ImportCorpusRequest(records, mappings);
        var first = await Success(await author.PostAsJsonAsync("/api/units/import", request));
        Assert.Equal(82, first["created"]!.GetValue<int>());
        var unitId = first["items"]![0]!["unitId"]!.GetValue<Guid>();
        var unit = await author.GetFromJsonAsync<JsonObject>("/api/units/" + unitId);
        var origin = unit!["revision"]!["origin"]!;
        Assert.Equal(records[0].Id, origin["id"]!.GetValue<string>());
        Assert.Equal(records[0].Level, origin["level"]!.GetValue<string>());
        Assert.Equal(records[0].Text, unit["revision"]!["document"]!["readings"]![0]!["text"]!.GetValue<string>());
        Assert.Equal("reading", unit["revision"]!["document"]!["kind"]!.GetValue<string>());
        await Success(await author.PostAsJsonAsync(Url(unit) + "/revisions", new { version = 1, document = Document("Curado") }), HttpStatusCode.Created);
        var repeat = await Success(await author.PostAsJsonAsync("/api/units/import", request));
        Assert.Equal(0, repeat["created"]!.GetValue<int>());
        Assert.Equal(82, repeat["skipped"]!.GetValue<int>());
        Assert.Equal(unitId, repeat["items"]![0]!["unitId"]!.GetValue<Guid>());
        Assert.Contains("Curado", await author.GetStringAsync(Url(unit)));
        using var student = await Login("student-a");
        Assert.Equal(HttpStatusCode.NotFound, (await student.GetAsync(Url(unit))).StatusCode);
    }

    [Fact]
    public async Task Import_rejects_invalid_batches_and_conflicts_without_partial_writes()
    {
        using var author = await Login();
        var topic = await Topic(author);
        var record = new CorpusRecord(Guid.NewGuid().ToString(), "source-topic", "Lectura", "beginner", "Texto", "Propia", ["clave"]);
        var mappings = new Dictionary<string, Guid> { [record.Topic] = topic };
        foreach (var invalid in new[] { new ImportCorpusRequest([], mappings), new([record, record], mappings),
            new([record], []), new([record], new() { [record.Topic] = Guid.NewGuid() }),
            new([record with { Text = " " }], mappings), new([null!], mappings) })
            Assert.Equal(HttpStatusCode.BadRequest, (await author.PostAsJsonAsync("/api/units/import", invalid)).StatusCode);
        await Success(await author.PostAsJsonAsync("/api/units/import", new ImportCorpusRequest([record], mappings)));
        var added = record with { Id = Guid.NewGuid().ToString() };
        Assert.Equal(HttpStatusCode.Conflict, (await author.PostAsJsonAsync("/api/units/import", new ImportCorpusRequest([added, record with { Text = "Cambió" }], mappings))).StatusCode);
        using var scope = fixture.Host.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<EditorialDbContext>();
        Assert.False(await db.Units.AnyAsync(x => x.ImportKey == "learning-content-v1:" + added.Id));
        var other = await Topic(author);
        Assert.Equal(HttpStatusCode.Conflict, (await author.PostAsJsonAsync("/api/units/import", new ImportCorpusRequest([record], new() { [record.Topic] = other }))).StatusCode);
    }
}
