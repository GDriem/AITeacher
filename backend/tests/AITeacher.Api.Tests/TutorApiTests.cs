using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using System.Text.Json;
using AITeacher.Api.Features.Tutor;
using AITeacher.Modules.Curriculum.Publishing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace AITeacher.Api.Tests;

public sealed class TutorApiTests(ApiFixture fixture) : IClassFixture<ApiFixture>
{
    private static async Task<HttpClient> Login(Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactory<Program> host, string credential = "student-a")
    {
        var client = host.CreateClient();
        await Csrf(client);
        await Ok(await client.PostAsJsonAsync("/api/auth/google", new { credential }));
        await Csrf(client);
        return client;
    }
    private static async Task Csrf(HttpClient client)
    {
        var token = await client.GetFromJsonAsync<JsonObject>("/api/auth/csrf");
        client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", token!["requestToken"]!.GetValue<string>());
    }
    private static async Task<JsonObject> Ok(HttpResponseMessage response, HttpStatusCode code = HttpStatusCode.OK)
    {
        var text = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == code, $"Expected {code}; got {response.StatusCode}: {text}");
        return JsonNode.Parse(text)!.AsObject();
    }
    private async Task<(Guid Unit, Guid Revision, Guid Reading, Guid Exercise, long Version)> Publish()
    {
        using var authorHost = new ApiHost(fixture.Connection, fixture.Clock);
        using var author = await Login(authorHost, "author");
        var entry = new { name = "Tema", slug = "tutor-" + Guid.NewGuid().ToString("N") };
        var subject = await Ok(await author.PostAsJsonAsync("/api/catalog/subjects", entry), HttpStatusCode.Created);
        var category = await Ok(await author.PostAsJsonAsync("/api/catalog/categories", new { subjectId = subject["id"]!.GetValue<Guid>(), entry }), HttpStatusCode.Created);
        var topic = await Ok(await author.PostAsJsonAsync("/api/catalog/topics", new { subjectId = subject["id"]!.GetValue<Guid>(), categoryId = category["id"]!.GetValue<Guid>(), entry }), HttpStatusCode.Created);
        var concept = Guid.NewGuid(); var objective = Guid.NewGuid(); var reading = Guid.NewGuid(); var exercise = Guid.NewGuid();
        var doc = new UnitDocument("Unidad de tutor", [new(concept, "Idea")], [new(objective, "Explicar idea", [concept])],
            [new(reading, "Lectura", new string('á', 10000), "Fuente editorial", [objective])],
            [new(exercise, "Practica la idea", [objective])], [new(Guid.NewGuid(), "Prueba", "PRIVATE-ANSWER", [objective])], []);
        var unit = await Ok(await author.PostAsJsonAsync("/api/units", new { topicId = topic["id"]!.GetValue<Guid>(), document = doc }), HttpStatusCode.Created);
        var id = unit["id"]!.GetValue<Guid>(); var revision = unit["revision"]!["id"]!.GetValue<Guid>();
        var published = await Ok(await author.PostAsJsonAsync($"/api/units/{id}/revisions/{revision}/publish", new { version = 1 }));
        return (id, revision, reading, exercise, published["version"]!.GetValue<long>());
    }
    private static async Task<JsonObject> Conversation(HttpClient client, Guid unit, string mode = "chat", Guid? activityId = null) =>
        await Ok(await client.PostAsJsonAsync("/api/tutor/conversations", new { unitId = unit, mode, activityId }), HttpStatusCode.Created);
    private static string Url(JsonObject c) => "/api/tutor/conversations/" + c["id"]!.GetValue<Guid>();

    [Fact]
    public async Task Tutor_links_reading_practice_and_chat_with_bounded_verified_sources_and_persistence()
    {
        var unit = await Publish();
        using var student = await Login(fixture.Host);
        foreach (var (mode, activity) in new (string, Guid?)[] { ("reading", unit.Reading), ("practice", unit.Exercise), ("chat", null) })
        {
            var c = await Conversation(student, unit.Unit, mode, activity);
            var request = new { requestId = Guid.NewGuid(), version = 1, text = "Ayúdame a entender" };
            var result = await Ok(await student.PostAsJsonAsync(Url(c) + "/turns", request));
            var messages = result["messages"]!.AsArray();
            Assert.Equal(2, messages.Count);
            Assert.Equal("assistant", messages[1]!["role"]!.GetValue<string>());
            var source = messages[1]!["sources"]![0]!;
            Assert.Equal(unit.Reading, source["id"]!.GetValue<Guid>());
            Assert.Equal(unit.Revision, source["revisionId"]!.GetValue<Guid>());
            Assert.Equal(2000, source["excerpt"]!.GetValue<string>().Length);
            Assert.True(result["manifest"]!["characterCount"]!.GetValue<int>() <= ContextBuilder.MaxCharacters);
            Assert.DoesNotContain("PRIVATE-ANSWER", result.ToJsonString());
            var replay = await Ok(await student.PostAsJsonAsync(Url(c) + "/turns", request));
            Assert.Equal(result["id"]!.GetValue<Guid>(), replay["id"]!.GetValue<Guid>());
            using var restarted = new ApiHost(fixture.Connection, fixture.Clock);
            using var reconnect = await Login(restarted);
            var history = await reconnect.GetFromJsonAsync<JsonObject>(Url(c) + "/messages?offset=1&limit=1");
            Assert.Equal(2, history!["total"]!.GetValue<int>());
            Assert.Single(history["items"]!.AsArray());
        }
    }

    [Fact]
    public async Task Ownership_csrf_validation_and_conflicting_requests_are_enforced()
    {
        var unit = await Publish();
        using var a = await Login(fixture.Host);
        using var b = await Login(fixture.Host, "student-b");
        using var author = await Login(fixture.Host, "author");
        var c = await Conversation(a, unit.Unit);
        foreach (var other in new[] { b, author })
        {
            Assert.Equal(HttpStatusCode.NotFound, (await other.GetAsync(Url(c))).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await other.GetAsync(Url(c) + "/messages")).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await other.PostAsJsonAsync(Url(c) + "/turns", new { requestId = Guid.NewGuid(), version = 1, text = "Hola" })).StatusCode);
        }
        Assert.Equal(HttpStatusCode.BadRequest, (await a.PostAsJsonAsync("/api/tutor/conversations", new { unitId = unit.Unit, mode = "practice", activityId = unit.Reading })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await a.GetAsync(Url(c) + "/messages?limit=101")).StatusCode);
        var request = new CreateTurnRequest(Guid.NewGuid(), 1, "Hola");
        var response = await a.PostAsJsonAsync(Url(c) + "/turns", request);
        Assert.Equal("no-store", response.Headers.CacheControl!.ToString());
        await Ok(response);
        Assert.Equal(HttpStatusCode.Conflict, (await a.PostAsJsonAsync(Url(c) + "/turns", request with { Text = "Otro" })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await a.PostAsJsonAsync(Url(c) + "/turns", request with { RequestId = Guid.NewGuid() })).StatusCode);
        var another = await Conversation(a, unit.Unit);
        Assert.Equal(HttpStatusCode.Conflict, (await a.PostAsJsonAsync(Url(another) + "/turns", request)).StatusCode);
        a.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        Assert.Equal(HttpStatusCode.BadRequest, (await a.PostAsJsonAsync("/api/tutor/notes", new { kind = "student", text = "Texto" })).StatusCode);
        using var anonymous = fixture.Host.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/tutor/conversations")).StatusCode);
    }

    [Fact]
    public async Task Notes_preserve_kind_origin_and_ownership_through_edits_and_restart()
    {
        var unit = await Publish();
        using var a = await Login(fixture.Host); using var b = await Login(fixture.Host, "student-b");
        var c = await Conversation(a, unit.Unit);
        var turn = await Ok(await a.PostAsJsonAsync(Url(c) + "/turns", new { requestId = Guid.NewGuid(), version = 1, text = "Hola" }));
        var cid = c["id"]!.GetValue<Guid>(); var mid = turn["messages"]![1]!["id"]!.GetValue<Guid>();
        var requests = new CreateNoteRequest[] { new("student", "Mi explicación"), new("savedMessage", ConversationId: cid, MessageId: mid), new("summary", ConversationId: cid) };
        foreach (var request in requests)
        {
            var note = await Ok(await a.PostAsJsonAsync("/api/tutor/notes", request), HttpStatusCode.Created);
            var id = note["id"]!.GetValue<Guid>();
            Assert.Equal(HttpStatusCode.NotFound, (await b.PutAsJsonAsync($"/api/tutor/notes/{id}", new { version = 1, text = "Robo" })).StatusCode);
            var edited = await Ok(await a.PutAsJsonAsync($"/api/tutor/notes/{id}", new { version = 1, text = "Mi corrección" }));
            Assert.Equal(request.Kind, edited["kind"]!.GetValue<string>());
            Assert.True(JsonNode.DeepEquals(note["origin"], edited["origin"]));
            Assert.Equal(HttpStatusCode.Conflict, (await a.DeleteAsync($"/api/tutor/notes/{id}?version=1")).StatusCode);
            Assert.Equal(HttpStatusCode.NoContent, (await a.DeleteAsync($"/api/tutor/notes/{id}?version=2")).StatusCode);
        }
        Assert.Equal(HttpStatusCode.NotFound, (await b.PostAsJsonAsync("/api/tutor/notes", requests[1])).StatusCode);
        var persistent = await Ok(await a.PostAsJsonAsync("/api/tutor/notes", requests[0]), HttpStatusCode.Created);
        using var restarted = new ApiHost(fixture.Connection, fixture.Clock); using var reconnect = await Login(restarted);
        var page = await reconnect.GetFromJsonAsync<JsonObject>("/api/tutor/notes");
        Assert.Contains(page!["items"]!.AsArray(), n => n!["id"]!.GetValue<Guid>() == persistent["id"]!.GetValue<Guid>());
    }

    [Fact]
    public async Task Withdrawal_blocks_new_turns_and_messages_are_immutable()
    {
        var unit = await Publish(); using var a = await Login(fixture.Host); using var author = await Login(fixture.Host, "author");
        var c = await Conversation(a, unit.Unit);
        await Ok(await a.PostAsJsonAsync(Url(c) + "/turns", new { requestId = Guid.NewGuid(), version = 1, text = "Hola" }));
        await Ok(await author.PostAsJsonAsync($"/api/units/{unit.Unit}/unpublish", new { version = unit.Version }));
        Assert.Equal(HttpStatusCode.Conflict, (await a.PostAsJsonAsync(Url(c) + "/turns", new { requestId = Guid.NewGuid(), version = 2, text = "Otra pregunta" })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await a.PostAsJsonAsync("/api/tutor/conversations", new { unitId = unit.Unit })).StatusCode);
        Assert.Equal(2, (await a.GetFromJsonAsync<JsonObject>(Url(c) + "/messages"))!["total"]!.GetValue<int>());
        using var scope = fixture.Host.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<TutorDbContext>();
        var cid = c["id"]!.GetValue<Guid>();
        await Assert.ThrowsAsync<Npgsql.PostgresException>(() => db.Database.ExecuteSqlInterpolatedAsync($"UPDATE conversations.messages SET \"Text\"='changed' WHERE \"ConversationId\"={cid}"));
    }

    private ApiHost ProviderHost(string tutor, string summary = "mock")
    {
        var url = Environment.GetEnvironmentVariable("AITEACHER_TEST_AI_URL")
            ?? throw new InvalidOperationException("Start postman/simulations/tutor.sim.yaml and set AITEACHER_TEST_AI_URL (see TUTOR.md).");
        return new(fixture.Connection, fixture.Clock, new Dictionary<string, string> {
            ["AI:Capabilities:Tutor:Provider"] = tutor, ["AI:Capabilities:Tutor:Model"] = "contract-model",
            ["AI:Capabilities:Summary:Provider"] = summary, ["AI:Capabilities:Summary:Model"] = "contract-summary",
            ["AI:Providers:azure:Endpoint"] = url + "/azure/", ["AI:Providers:azure:ApiKey"] = "simulation-key",
            ["AI:Providers:gemini:Endpoint"] = url + "/gemini/", ["AI:Providers:gemini:ApiKey"] = "simulation-key",
            ["AI:Providers:vertex:Endpoint"] = url + "/gemini/", ["AI:Providers:vertex:Project"] = "contract-project", ["AI:Providers:vertex:Location"] = "us-central1"
        });
    }

    [Theory]
    [InlineData("azure", "gemini")]
    [InlineData("gemini", "azure")]
    [InlineData("vertex", "azure")]
    public async Task Real_adapters_use_HTTP_contracts_and_route_capabilities_independently(string provider, string summary)
    {
        var unit = await Publish(); using var host = ProviderHost(provider, summary); using var client = await Login(host);
        var c = await Conversation(client, unit.Unit, "practice", unit.Exercise);
        var result = await Ok(await client.PostAsJsonAsync(Url(c) + "/turns", new { requestId = Guid.NewGuid(), version = 1, text = "Explica la idea" }));
        Assert.Equal(provider, result["provider"]!["provider"]!.GetValue<string>());
        Assert.True(result["inputTokens"]!.GetValue<int>() > 0);
        Assert.Single(result["messages"]![1]!["sources"]!.AsArray());
        var note = await Ok(await client.PostAsJsonAsync("/api/tutor/notes", new { kind = "summary", conversationId = c["id"]!.GetValue<Guid>() }), HttpStatusCode.Created);
        Assert.Equal(summary, note["origin"]!["provider"]!["provider"]!.GetValue<string>());
        Assert.Equal(2, note["origin"]!["manifest"]!["messageIds"]!.AsArray().Count);
    }

    [Theory]
    [InlineData("__UNAVAILABLE__", HttpStatusCode.ServiceUnavailable)]
    [InlineData("__HTML__", HttpStatusCode.ServiceUnavailable)]
    [InlineData("__BAD_SOURCE__", HttpStatusCode.BadGateway)]
    [InlineData("__EMPTY_CHOICES__", HttpStatusCode.BadGateway)]
    public async Task Provider_failures_do_not_publish_assistant_messages_or_duplicate_user_messages(string text, HttpStatusCode expected)
    {
        var unit = await Publish(); using var host = ProviderHost("azure"); using var a = await Login(host);
        var c = await Conversation(a, unit.Unit); var request = new CreateTurnRequest(Guid.NewGuid(), 1, text);
        Assert.Equal(expected, (await a.PostAsJsonAsync(Url(c) + "/turns", request)).StatusCode);
        Assert.Equal(expected, (await a.PostAsJsonAsync(Url(c) + "/turns", request)).StatusCode);
        var messages = await a.GetFromJsonAsync<JsonObject>(Url(c) + "/messages");
        Assert.Equal(1, messages!["total"]!.GetValue<int>());
        Assert.Null((await a.GetFromJsonAsync<JsonObject>(Url(c)))!["activeTurnId"]);
    }

    [Fact]
    public async Task Concurrent_turns_reserve_once_and_expired_lease_recovers_with_same_request()
    {
        var unit = await Publish(); using var host = ProviderHost("azure"); using var a = await Login(host); using var b = await Login(host);
        var c = await Conversation(a, unit.Unit); var request = new CreateTurnRequest(Guid.NewGuid(), 1, "__SLOW__");
        var responses = await Task.WhenAll(a.PostAsJsonAsync(Url(c) + "/turns", request), b.PostAsJsonAsync(Url(c) + "/turns", request));
        Assert.Contains(responses, r => r.StatusCode == HttpStatusCode.OK);
        Assert.All(responses, r => Assert.Contains(r.StatusCode, new[] { HttpStatusCode.OK, HttpStatusCode.Conflict }));
        Assert.Equal(2, (await a.GetFromJsonAsync<JsonObject>(Url(c) + "/messages"))!["total"]!.GetValue<int>());
        // Emulate process loss after reservation: keep the user message, remove no historical data.
        var failed = await Conversation(a, unit.Unit);
        var retry = new CreateTurnRequest(Guid.NewGuid(), 1, "__RECOVER__");
        Assert.Equal(HttpStatusCode.ServiceUnavailable, (await a.PostAsJsonAsync(Url(failed) + "/turns", retry)).StatusCode);
        using var scope = host.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<TutorDbContext>();
        var turn = await db.Turns.SingleAsync(x => x.RequestId == retry.RequestId);
        turn.State = "pending"; turn.LeaseUntil = fixture.Clock.GetUtcNow().AddMinutes(-1);
        // Recover with the same recorded provider/model, without making a second user row.
        var conversation = await db.Conversations.SingleAsync(x => x.Id == turn.ConversationId); conversation.ActiveTurnId = turn.Id;
        await db.SaveChangesAsync();
        await Ok(await a.PostAsJsonAsync(Url(failed) + "/turns", retry));
        Assert.Equal(2, (await a.GetFromJsonAsync<JsonObject>(Url(failed) + "/messages"))!["total"]!.GetValue<int>());
    }
    private sealed class SimulatedProcessLoss : Exception;
    private sealed class CrashAfterProviderReply : DelegatingHandler
    {
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            using var response = await base.SendAsync(request, ct);
            // Emulate a process disappearing after reservation and HTTP I/O, without service cleanup.
            throw new SimulatedProcessLoss();
        }
    }

    [Fact]
    public async Task Reload_recovers_original_pending_input_after_process_loss_and_lease_expiry()
    {
        var unit = await Publish();
        using var providerHost = ProviderHost("azure");
        using var crashedHost = providerHost.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
            services.AddHttpClient("tutor-provider").AddHttpMessageHandler(() => new CrashAfterProviderReply())));
        using var beforeCrash = await Login(crashedHost);
        var c = await Conversation(beforeCrash, unit.Unit);
        var original = new CreateTurnRequest(Guid.NewGuid(), 1, "Recuperar después de recargar");
        Assert.Equal(HttpStatusCode.InternalServerError, (await beforeCrash.PostAsJsonAsync(Url(c) + "/turns", original)).StatusCode);
        await crashedHost.DisposeAsync();

        using var restartedHost = ProviderHost("azure");
        using var reloaded = await Login(restartedHost);
        var response = await reloaded.GetAsync(Url(c) + "/pending-turn");
        Assert.True(response.Headers.CacheControl?.NoStore);
        var pending = await Ok(response);
        var recovered = pending["request"]!.Deserialize<CreateTurnRequest>(new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
        Assert.Equal(original, recovered);
        using var other = await Login(restartedHost, "student-b");
        using var author = await Login(restartedHost, "author");
        using var anonymous = restartedHost.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync(Url(c) + "/pending-turn")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await other.GetAsync(Url(c) + "/pending-turn")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await author.GetAsync(Url(c) + "/pending-turn")).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await reloaded.PostAsJsonAsync(Url(c) + "/turns", recovered)).StatusCode);
        var now = fixture.Clock.Now;
        try
        {
            fixture.Clock.Now = pending["leaseUntil"]!.GetValue<DateTimeOffset>().AddSeconds(1);
            var result = await Ok(await reloaded.PostAsJsonAsync(Url(c) + "/turns", recovered));
            Assert.Equal(original.RequestId, result["requestId"]!.GetValue<Guid>());
            var replay = await Ok(await reloaded.PostAsJsonAsync(Url(c) + "/turns", recovered));
            Assert.Equal(result["id"]!.GetValue<Guid>(), replay["id"]!.GetValue<Guid>());
            Assert.Equal(2, (await reloaded.GetFromJsonAsync<JsonObject>(Url(c) + "/messages"))!["total"]!.GetValue<int>());
            Assert.Null((await reloaded.GetFromJsonAsync<JsonObject>(Url(c) + "/pending-turn"))!["request"]);
        }
        finally { fixture.Clock.Now = now; }
    }

    [Fact]
    public void Bounded_context_preserves_current_input_and_reports_truncation_without_old_sourced_messages()
    {
        var reading = Guid.NewGuid();
        var unit = new TutorUnit(Guid.NewGuid(), Guid.NewGuid(), "Unidad", [],
            [new(reading, "Lectura", new string('x', 10000), "Origen", [])], []);
        var conversation = new Conversation { UnitId = unit.UnitId, RevisionId = unit.RevisionId };
        var history = Enumerable.Range(0, 20).Select(i => new TutorMessage { Role = i % 2 == 0 ? "user" : "assistant",
            Text = new string('á', 4000), SourcesJson = i % 2 == 0 ? "[]" : "[{\"id\":\"00000000-0000-0000-0000-000000000001\"}]" }).ToArray();
        var result = new ContextBuilder().Build(unit, conversation, history, "CURRENT-INPUT");
        Assert.True(result.Manifest.CharacterCount <= ContextBuilder.MaxCharacters);
        Assert.True(result.Manifest.Truncated);
        Assert.True(result.Manifest.MessageIds.Length <= 8);
        Assert.Contains("CURRENT-INPUT", result.Payload);
        Assert.DoesNotContain(history.Where(x => x.Role == "assistant"), x => result.Manifest.MessageIds.Contains(x.Id));
        Assert.Equal(2000, result.Sources[0].Excerpt.Length);
        Assert.True(new ContextBuilder().Summary(history).Manifest.CharacterCount <= ContextBuilder.MaxCharacters);
    }

    [Fact]
    public async Task Unconfigured_capabilities_and_unreachable_providers_fail_without_fabricated_answers()
    {
        var unit = await Publish();
        using var disabled = new ApiHost(fixture.Connection, fixture.Clock, new Dictionary<string, string> { ["AI:Capabilities:Tutor:Provider"] = "disabled" });
        using var a = await Login(disabled);
        var c = await Conversation(a, unit.Unit);
        Assert.Equal(HttpStatusCode.ServiceUnavailable, (await a.PostAsJsonAsync(Url(c) + "/turns", new { requestId = Guid.NewGuid(), version = 1, text = "Hola" })).StatusCode);
        Assert.Equal(0, (await a.GetFromJsonAsync<JsonObject>(Url(c) + "/messages"))!["total"]!.GetValue<int>());
        using var unreachable = new ApiHost(fixture.Connection, fixture.Clock, new Dictionary<string, string> {
            ["AI:Capabilities:Tutor:Provider"] = "azure", ["AI:Providers:azure:Endpoint"] = "http://127.0.0.1:1/", ["AI:Providers:azure:ApiKey"] = "simulation-key" });
        using var b = await Login(unreachable);
        Assert.Equal(HttpStatusCode.ServiceUnavailable, (await b.PostAsJsonAsync(Url(c) + "/turns", new { requestId = Guid.NewGuid(), version = 1, text = "Hola" })).StatusCode);
        Assert.Equal(1, (await b.GetFromJsonAsync<JsonObject>(Url(c) + "/messages"))!["total"]!.GetValue<int>());
    }

    private async Task<TutorTurn> WaitForReservation(Guid conversationId)
    {
        for (var attempt = 0; attempt < 100; attempt++)
        {
            using var scope = fixture.Host.Services.CreateScope();
            var turn = await scope.ServiceProvider.GetRequiredService<TutorDbContext>().Turns.AsNoTracking()
                .SingleOrDefaultAsync(x => x.ConversationId == conversationId && x.State == "pending");
            if (turn is not null) return turn;
            await Task.Delay(10);
        }
        throw new InvalidOperationException("Turn was not reserved.");
    }

    [Fact]
    public async Task Withdrawing_during_HTTP_generation_discards_response_and_releases_reservation()
    {
        var unit = await Publish(); using var host = ProviderHost("azure"); using var a = await Login(host);
        using var author = await Login(fixture.Host, "author");
        var c = await Conversation(a, unit.Unit); var cid = c["id"]!.GetValue<Guid>();
        var pending = a.PostAsJsonAsync(Url(c) + "/turns", new { requestId = Guid.NewGuid(), version = 1, text = "__SLOW__" });
        await WaitForReservation(cid);
        await Ok(await author.PostAsJsonAsync($"/api/units/{unit.Unit}/unpublish", new { version = unit.Version }));
        Assert.Equal(HttpStatusCode.Conflict, (await pending).StatusCode);
        Assert.Equal(1, (await a.GetFromJsonAsync<JsonObject>(Url(c) + "/messages"))!["total"]!.GetValue<int>());
        Assert.Null((await a.GetFromJsonAsync<JsonObject>(Url(c)))!["activeTurnId"]);
    }

    [Fact]
    public async Task Expired_lease_fences_late_provider_response()
    {
        var unit = await Publish(); using var host = ProviderHost("azure"); using var a = await Login(host); using var b = await Login(host);
        var c = await Conversation(a, unit.Unit); var cid = c["id"]!.GetValue<Guid>();
        var request = new CreateTurnRequest(Guid.NewGuid(), 1, "__SLOW__");
        var pending = a.PostAsJsonAsync(Url(c) + "/turns", request);
        var reserved = await WaitForReservation(cid);
        using (var scope = fixture.Host.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TutorDbContext>();
            await db.Turns.Where(x => x.Id == reserved.Id).ExecuteUpdateAsync(set => set.SetProperty(x => x.LeaseUntil, fixture.Clock.GetUtcNow().AddMinutes(-1)));
        }
        var recovery = (await b.GetFromJsonAsync<JsonObject>(Url(c) + "/pending-turn"))!["request"]!.Deserialize<CreateTurnRequest>(new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
        var recovered = b.PostAsJsonAsync(Url(c) + "/turns", recovery);
        Assert.Equal(HttpStatusCode.Conflict, (await pending).StatusCode);
        await Ok(await recovered);
        Assert.Equal(2, (await a.GetFromJsonAsync<JsonObject>(Url(c) + "/messages"))!["total"]!.GetValue<int>());
    }

    [Fact]
    public async Task Hanging_provider_is_bounded_by_timeout_and_keeps_only_the_user_message()
    {
        var unit = await Publish(); using var host = ProviderHost("gemini"); using var a = await Login(host);
        var c = await Conversation(a, unit.Unit);
        var timer = System.Diagnostics.Stopwatch.StartNew();
        Assert.Equal(HttpStatusCode.ServiceUnavailable, (await a.PostAsJsonAsync(Url(c) + "/turns", new { requestId = Guid.NewGuid(), version = 1, text = "__TIMEOUT__" })).StatusCode);
        Assert.InRange(timer.Elapsed.TotalSeconds, 28, 40);
        Assert.Equal(1, (await a.GetFromJsonAsync<JsonObject>(Url(c) + "/messages"))!["total"]!.GetValue<int>());
        Assert.Null((await a.GetFromJsonAsync<JsonObject>(Url(c)))!["activeTurnId"]);
    }

}
