using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using AITeacher.Api.Features.Graphs;
using AITeacher.Modules.Curriculum.Publishing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace AITeacher.Api.Tests;

public sealed class GraphApiTests(ApiFixture fixture) : IClassFixture<ApiFixture>
{
    private static async Task<HttpClient> Login(ApiHost host, string credential = "student-a")
    {
        var c = host.CreateClient(); await Csrf(c);
        await Ok(await c.PostAsJsonAsync("/api/auth/google", new { credential })); await Csrf(c); return c;
    }
    private static async Task Csrf(HttpClient c)
    {
        var token = await c.GetFromJsonAsync<JsonObject>("/api/auth/csrf");
        c.DefaultRequestHeaders.Remove("X-CSRF-TOKEN"); c.DefaultRequestHeaders.Add("X-CSRF-TOKEN", token!["requestToken"]!.GetValue<string>());
    }
    private static async Task<JsonObject> Ok(HttpResponseMessage r, HttpStatusCode code = HttpStatusCode.OK)
    {
        var text = await r.Content.ReadAsStringAsync();
        Assert.True(r.StatusCode == code, $"Expected {code}; got {r.StatusCode}: {text}"); return JsonNode.Parse(text)!.AsObject();
    }
    private sealed record Setup(Guid Topic, Guid Unit, Guid Revision, long UnitVersion, GraphRequest Request, Guid GraphRevision, Guid NodeA, Guid NodeB);
    private async Task<Setup> Prepare()
    {
        using var a = await Login(fixture.Host, "author");
        var entry = new { name = "Grafos", slug = "graph-" + Guid.NewGuid().ToString("N") };
        var subject = await Ok(await a.PostAsJsonAsync("/api/catalog/subjects", entry), HttpStatusCode.Created);
        var category = await Ok(await a.PostAsJsonAsync("/api/catalog/categories", new { subjectId = subject["id"]!.GetValue<Guid>(), entry }), HttpStatusCode.Created);
        var topic = await Ok(await a.PostAsJsonAsync("/api/catalog/topics", new { subjectId = subject["id"]!.GetValue<Guid>(), categoryId = category["id"]!.GetValue<Guid>(), entry }), HttpStatusCode.Created);
        var ca = Guid.NewGuid(); var cb = Guid.NewGuid(); var obj = Guid.NewGuid();
        var doc = new UnitDocument("Unidad", [new(ca, "Derivada"), new(cb, "Límite")], [new(obj, "Explicar", [ca, cb])],
            [new(Guid.NewGuid(), "Lectura", "Texto", "Fuente", [obj])], [new(Guid.NewGuid(), "Práctica", [obj])], [new(Guid.NewGuid(), "Prueba", "GRAPH-PRIVATE-KEY", [obj])], []);
        var unit = await Ok(await a.PostAsJsonAsync("/api/units", new { topicId = topic["id"]!.GetValue<Guid>(), document = doc }), HttpStatusCode.Created);
        var uid = unit["id"]!.GetValue<Guid>(); var rid = unit["revision"]!["id"]!.GetValue<Guid>();
        var pub = await Ok(await a.PostAsJsonAsync($"/api/units/{uid}/revisions/{rid}/publish", new { version = 1 }));
        var na = Guid.NewGuid(); var nb = Guid.NewGuid();
        var request = new GraphRequest(Guid.NewGuid(), 1, topic["id"]!.GetValue<Guid>(), "Mapa <script>alert(1)</script>",
            [new(na, uid, rid, ca), new(nb, uid, rid, cb)], [new(na, nb, "requires")]);
        var graph = await Ok(await a.PostAsJsonAsync("/api/graphs/revisions", request), HttpStatusCode.Created);
        return new(request.TopicId, uid, rid, pub["version"]!.GetValue<long>(), request, graph["id"]!.GetValue<Guid>(), na, nb);
    }
    private static async Task<(Guid Conversation, Guid UserMessage, Guid AssistantMessage)> Talk(HttpClient s, Guid unit, string text = "La Derivada me interesa")
    {
        var c = await Ok(await s.PostAsJsonAsync("/api/tutor/conversations", new { unitId = unit }), HttpStatusCode.Created);
        var id = c["id"]!.GetValue<Guid>();
        var t = await Ok(await s.PostAsJsonAsync($"/api/tutor/conversations/{id}/turns", new { requestId = Guid.NewGuid(), version = 1, text }));
        return (id, t["messages"]![0]!["id"]!.GetValue<Guid>(), t["messages"]![1]!["id"]!.GetValue<Guid>());
    }
    private static string MapUrl(Guid cid, Guid rid) => $"/api/graphs/conversations/{cid}?graphRevisionId={rid}";
    private static string ExtractUrl(Guid cid) => $"/api/graphs/conversations/{cid}/extract";
    private static CorrectionRequest Correction(Guid node, int version = 1, string status = "accepted") => new(version, node, null, null, "exploration", .8m, status, "Revisé mi explicación");

    [Fact]
    public async Task Editorial_graphs_are_versioned_safe_and_validate_scope_identity_and_prerequisites()
    {
        var x = await Prepare(); using var a = await Login(fixture.Host, "author"); using var s = await Login(fixture.Host);
        var initial = await s.GetStringAsync($"/api/graphs/revisions/{x.GraphRevision}"); Assert.DoesNotContain("GRAPH-PRIVATE-KEY", initial);
        var cyclic = x.Request with { Number = 2, Edges = [new(x.NodeA, x.NodeB, "requires"), new(x.NodeB, x.NodeA, "requires")] };
        Assert.Equal(HttpStatusCode.BadRequest, (await a.PostAsJsonAsync("/api/graphs/revisions", cyclic)).StatusCode);
        var legal = cyclic with { Edges = [new(x.NodeA, x.NodeB, "explains"), new(x.NodeB, x.NodeA, "explains")] };
        await Ok(await a.PostAsJsonAsync("/api/graphs/revisions", legal), HttpStatusCode.Created);
        Assert.Equal(initial, await s.GetStringAsync($"/api/graphs/revisions/{x.GraphRevision}"));
        Assert.Equal(HttpStatusCode.Conflict, (await a.PostAsJsonAsync("/api/graphs/revisions", legal)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await s.PostAsJsonAsync("/api/graphs/revisions", legal)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await a.PostAsJsonAsync("/api/graphs/revisions", legal with { Number = 3, TopicId = Guid.NewGuid() })).StatusCode);
        var wrong = legal.Nodes.ToArray(); wrong[0] = wrong[0] with { ConceptId = wrong[1].ConceptId };
        Assert.Equal(HttpStatusCode.BadRequest, (await a.PostAsJsonAsync("/api/graphs/revisions", legal with { Number = 3, Nodes = wrong })).StatusCode);
        wrong = legal.Nodes.ToArray(); wrong[0] = wrong[0] with { UnitRevisionId = Guid.NewGuid() };
        Assert.Equal(HttpStatusCode.BadRequest, (await a.PostAsJsonAsync("/api/graphs/revisions", legal with { Number = 3, Nodes = wrong })).StatusCode);
        var page = await s.GetFromJsonAsync<JsonObject>($"/api/graphs/revisions?topicId={x.Topic}&limit=1"); Assert.Equal(2, page!["total"]!.GetValue<int>());
        Assert.Equal(HttpStatusCode.BadRequest, (await s.GetAsync("/api/graphs/revisions?limit=101")).StatusCode);
    }

    [Fact]
    public async Task Extraction_deduplicates_concurrently_and_corrections_preserve_original_provenance()
    {
        var x = await Prepare(); using var a = await Login(fixture.Host); using var b = await Login(fixture.Host);
        var t = await Talk(a, x.Unit); var request = new ExtractRequest(x.GraphRevision, t.UserMessage);
        var results = await Task.WhenAll(a.PostAsJsonAsync(ExtractUrl(t.Conversation), request), b.PostAsJsonAsync(ExtractUrl(t.Conversation), request));
        var first = await Ok(results[0]); var second = await Ok(results[1]);
        Assert.Single(first["items"]!.AsArray());
        var obs = first["items"]![0]!; var id = obs["id"]!.GetValue<Guid>();
        Assert.Equal(id, second["items"]![0]!["id"]!.GetValue<Guid>());
        Assert.Equal("name-match-v1", obs["origin"]!.GetValue<string>()); Assert.Equal("pending", obs["current"]!["status"]!.GetValue<string>());
        var correction = await Ok(await a.PostAsJsonAsync($"/api/graphs/observations/{id}/corrections", Correction(x.NodeA)));
        Assert.Equal(2, correction["history"]!.AsArray().Count); Assert.True(JsonNode.DeepEquals(obs["current"], correction["history"]![0]));
        Assert.Equal(t.UserMessage, correction["messageId"]!.GetValue<Guid>());
        var replay = await Ok(await a.PostAsJsonAsync(ExtractUrl(t.Conversation), request));
        Assert.True(JsonNode.DeepEquals(correction, replay["items"]![0]));
        Assert.Equal(HttpStatusCode.Conflict, (await a.PostAsJsonAsync($"/api/graphs/observations/{id}/corrections", Correction(x.NodeB))).StatusCode);
        var map = await a.GetFromJsonAsync<JsonObject>(MapUrl(t.Conversation, x.GraphRevision));
        Assert.Single(map!["observations"]!.AsArray()); Assert.Single(map["comparison"]!["prerequisiteGaps"]!.AsArray());
        Assert.Single(map["comparison"]!["unmentionedNodeIds"]!.AsArray()); Assert.False(map["comparison"]!["masteryEvaluated"]!.GetValue<bool>());
        using var restart = new ApiHost(fixture.Connection, fixture.Clock); using var reconnect = await Login(restart);
        var persisted = await reconnect.GetFromJsonAsync<JsonObject>($"/api/graphs/observations/{id}"); Assert.True(JsonNode.DeepEquals(correction, persisted));
        var source = await reconnect.GetFromJsonAsync<JsonObject>(obs["sourceUrl"]!.GetValue<string>()); Assert.Equal(t.UserMessage, source!["id"]!.GetValue<Guid>());
    }

    [Fact]
    public async Task Private_maps_enforce_ownership_csrf_and_message_and_revision_provenance()
    {
        var x = await Prepare(); using var a = await Login(fixture.Host); using var b = await Login(fixture.Host, "student-b"); using var author = await Login(fixture.Host, "author");
        var t = await Talk(a, x.Unit); var other = await Talk(a, x.Unit);
        var obs = new ObservationRequest(x.GraphRevision, t.UserMessage, x.NodeA, null, null, "mention", 1);
        var created = await Ok(await a.PostAsJsonAsync($"/api/graphs/conversations/{t.Conversation}/observations", obs), HttpStatusCode.Created);
        var id = created["id"]!.GetValue<Guid>();
        foreach (var client in new[] { b, author })
        {
            Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(MapUrl(t.Conversation, x.GraphRevision))).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/graphs/observations/{id}")).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(created["sourceUrl"]!.GetValue<string>())).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync($"/api/graphs/observations/{id}/corrections", Correction(x.NodeA))).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync(ExtractUrl(t.Conversation), new ExtractRequest(x.GraphRevision, t.UserMessage))).StatusCode);
        }
        foreach (var mid in new[] { t.AssistantMessage, other.UserMessage, Guid.NewGuid() })
            Assert.Equal(HttpStatusCode.BadRequest, (await a.PostAsJsonAsync(ExtractUrl(t.Conversation), new ExtractRequest(x.GraphRevision, mid))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await a.PostAsJsonAsync($"/api/graphs/conversations/{t.Conversation}/observations", obs with { Stage = "mastery" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await a.PostAsJsonAsync($"/api/graphs/conversations/{t.Conversation}/observations", obs with { FromNodeId = Guid.NewGuid() })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await a.PostAsJsonAsync(ExtractUrl(t.Conversation), new ExtractRequest(Guid.NewGuid(), t.UserMessage))).StatusCode);
        a.DefaultRequestHeaders.Remove("X-CSRF-TOKEN"); Assert.Equal(HttpStatusCode.BadRequest, (await a.PostAsJsonAsync(ExtractUrl(t.Conversation), new ExtractRequest(x.GraphRevision, t.UserMessage))).StatusCode);
        using var anon = fixture.Host.CreateClient(); Assert.Equal(HttpStatusCode.Unauthorized, (await anon.GetAsync("/api/graphs/revisions")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anon.GetAsync(MapUrl(t.Conversation, x.GraphRevision))).StatusCode);
    }

    [Fact]
    public async Task Rejected_relations_are_excluded_and_HTML_is_accessible_escaped_and_historical()
    {
        var x = await Prepare(); using var a = await Login(fixture.Host); using var author = await Login(fixture.Host, "author");
        var t = await Talk(a, x.Unit);
        var obs = new ObservationRequest(x.GraphRevision, t.UserMessage, x.NodeA, x.NodeB, "differsFrom", "understanding", .5m);
        var created = await Ok(await a.PostAsJsonAsync($"/api/graphs/conversations/{t.Conversation}/observations", obs), HttpStatusCode.Created);
        var id = created["id"]!.GetValue<Guid>();
        var map = await a.GetFromJsonAsync<JsonObject>(MapUrl(t.Conversation, x.GraphRevision)); Assert.Single(map!["comparison"]!["differingObservationIds"]!.AsArray());
        await Ok(await a.PostAsJsonAsync($"/api/graphs/observations/{id}/corrections", Correction(x.NodeA, status: "rejected") with { Reason = "<img src=x onerror=alert(1)>" }));
        map = await a.GetFromJsonAsync<JsonObject>(MapUrl(t.Conversation, x.GraphRevision)); Assert.Empty(map!["comparison"]!["mentionedNodeIds"]!.AsArray());
        Assert.Empty(map["comparison"]!["differingObservationIds"]!.AsArray()); Assert.Single(map["observations"]!.AsArray());
        await Ok(await author.PostAsJsonAsync($"/api/units/{x.Unit}/unpublish", new { version = x.UnitVersion }));
        var response = await a.GetAsync($"/api/graphs/conversations/{t.Conversation}/list?graphRevisionId={x.GraphRevision}"); var html = await response.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.OK, response.StatusCode); Assert.Equal("text/html", response.Content.Headers.ContentType!.MediaType);
        Assert.Contains("<html lang=\"es\">", html); Assert.Contains("<main>", html); Assert.Contains("<ul>", html); Assert.Contains("<a href=", html);
        Assert.DoesNotContain("<script>", html); Assert.DoesNotContain("<img", html); Assert.Contains("&lt;img", html); Assert.DoesNotContain("GRAPH-PRIVATE-KEY", html);
        Assert.Equal("no-store", response.Headers.CacheControl!.ToString()); Assert.True(response.Headers.Contains("Content-Security-Policy"));
        if (Environment.GetEnvironmentVariable("AITEACHER_TEST_ARTIFACTS") is string artifacts)
        {
            Directory.CreateDirectory(artifacts);
            await File.WriteAllTextAsync(Path.Combine(artifacts, "graph-list.html"), html);
        }
        a.DefaultRequestHeaders.Accept.ParseAdd("text/html");
        var sourceResponse = await a.GetAsync(created["sourceUrl"]!.GetValue<string>());
        Assert.Equal("text/html", sourceResponse.Content.Headers.ContentType!.MediaType);
        Assert.Contains("Mensaje de origen", await sourceResponse.Content.ReadAsStringAsync());
        a.DefaultRequestHeaders.Accept.Clear();
        await Ok(await a.GetAsync($"/api/graphs/revisions/{x.GraphRevision}"));
    }

    [Fact]
    public async Task Snapshot_and_correction_races_commit_once_and_SQL_rejects_history_mutation()
    {
        var x = await Prepare(); using var a = await Login(fixture.Host, "author"); using var b = await Login(fixture.Host, "author");
        var next = x.Request with { Number = 2 };
        var writes = await Task.WhenAll(a.PostAsJsonAsync("/api/graphs/revisions", next), b.PostAsJsonAsync("/api/graphs/revisions", next));
        Assert.Single(writes, r => r.StatusCode == HttpStatusCode.Created); Assert.Single(writes, r => r.StatusCode == HttpStatusCode.Conflict);
        using var s = await Login(fixture.Host); using var s2 = await Login(fixture.Host); var t = await Talk(s, x.Unit);
        var extracted = await Ok(await s.PostAsJsonAsync(ExtractUrl(t.Conversation), new ExtractRequest(x.GraphRevision, t.UserMessage)));
        var id = extracted["items"]![0]!["id"]!.GetValue<Guid>();
        writes = await Task.WhenAll(s.PostAsJsonAsync($"/api/graphs/observations/{id}/corrections", Correction(x.NodeA)), s2.PostAsJsonAsync($"/api/graphs/observations/{id}/corrections", Correction(x.NodeB)));
        Assert.Single(writes, r => r.StatusCode == HttpStatusCode.OK); Assert.Single(writes, r => r.StatusCode == HttpStatusCode.Conflict);
        using var scope = fixture.Host.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<GraphDbContext>();
        await Assert.ThrowsAsync<Npgsql.PostgresException>(() => db.Database.ExecuteSqlInterpolatedAsync($"UPDATE graphs.revisions SET \"Title\"='changed' WHERE \"Id\"={x.GraphRevision}"));
        await Assert.ThrowsAsync<Npgsql.PostgresException>(() => db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM graphs.nodes WHERE \"RevisionId\"={x.GraphRevision}"));
        await Assert.ThrowsAsync<Npgsql.PostgresException>(() => db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM graphs.relations WHERE \"RevisionId\"={x.GraphRevision}"));
        await Assert.ThrowsAsync<Npgsql.PostgresException>(() => db.Database.ExecuteSqlInterpolatedAsync($"UPDATE graphs.observations SET \"Origin\"='student' WHERE \"Id\"={id}"));
        await Assert.ThrowsAsync<Npgsql.PostgresException>(() => db.Database.ExecuteSqlInterpolatedAsync($"UPDATE graphs.observation_revisions SET \"Reason\"='changed' WHERE \"ObservationId\"={id}"));
    }

    [Fact]
    public async Task Name_matching_respects_word_boundaries_unicode_and_does_not_use_assistant_claims()
    {
        var x = await Prepare(); using var s = await Login(fixture.Host);
        var t = await Talk(s, x.Unit, "derivadas y delimitadores no son coincidencias");
        var none = await Ok(await s.PostAsJsonAsync(ExtractUrl(t.Conversation), new ExtractRequest(x.GraphRevision, t.UserMessage))); Assert.Empty(none["items"]!.AsArray());
        var unicode = await Talk(s, x.Unit, "DERIVADA y LI\u0301MITE");
        var both = await Ok(await s.PostAsJsonAsync(ExtractUrl(unicode.Conversation), new ExtractRequest(x.GraphRevision, unicode.UserMessage))); Assert.Equal(2, both["items"]!.AsArray().Count);
        Assert.All(both["items"]!.AsArray(), i => Assert.Equal("mention", i!["current"]!["stage"]!.GetValue<string>()));
    }
}
