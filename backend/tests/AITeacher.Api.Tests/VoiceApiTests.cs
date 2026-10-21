using System.Net;
using System.Net.Http.Json;
using System.Net.WebSockets;
using System.Text.Json;
using System.Text.Json.Nodes;
using AITeacher.Api.Features.Identity;
using AITeacher.Api.Features.Tutor;
using AITeacher.Modules.Curriculum.Publishing;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Xunit;

namespace AITeacher.Api.Tests;

// Real local WebSocket wire stand-in for Vertex Live, separate from the API under test.
public sealed class VoiceApiTests(ApiFixture fixture) : IClassFixture<ApiFixture>
{
    private static async Task<(HttpClient Client, string Cookie)> Login(ApiHost host, string credential)
    {
        var client = host.CreateClient();
        var token = await client.GetFromJsonAsync<JsonObject>("/api/auth/csrf");
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", token!["requestToken"]!.GetValue<string>());
        var login = await client.PostAsJsonAsync("/api/auth/google", new { credential });
        login.EnsureSuccessStatusCode();
        var cookie = login.Headers.GetValues("Set-Cookie").Single(s => s.StartsWith(SessionAuthenticationHandler.CookieName + "=")).Split(';')[0];
        token = await client.GetFromJsonAsync<JsonObject>("/api/auth/csrf");
        client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", token!["requestToken"]!.GetValue<string>());
        return (client, cookie);
    }
    private static async Task<Guid> Publish(HttpClient client)
    {
        async Task<JsonObject> Post(string path, object body)
        {
            var result = await client.PostAsJsonAsync(path, body); result.EnsureSuccessStatusCode();
            return (await result.Content.ReadFromJsonAsync<JsonObject>())!;
        }
        var entry = new { name = "Voz", slug = "voice-" + Guid.NewGuid().ToString("N") };
        var subject = await Post("/api/catalog/subjects", entry);
        var category = await Post("/api/catalog/categories", new { subjectId = subject["id"]!.GetValue<Guid>(), entry });
        var topic = await Post("/api/catalog/topics", new { subjectId = subject["id"]!.GetValue<Guid>(), categoryId = category["id"]!.GetValue<Guid>(), entry });
        var c = Guid.NewGuid(); var o = Guid.NewGuid();
        var document = new UnitDocument("Unidad de voz", [new(c, "Vector")], [new(o, "Comparar vectores", [c])],
            [new(Guid.NewGuid(), "Lectura", "Un vector contiene características.", "Fuente de prueba", [o])],
            [new(Guid.NewGuid(), "Practicar", [o])], [new(Guid.NewGuid(), "Evaluar", "PRIVATE-VOICE-KEY", [o])], []);
        var unit = await Post("/api/units", new { topicId = topic["id"]!.GetValue<Guid>(), document });
        var id = unit["id"]!.GetValue<Guid>();
        await Post($"/api/units/{id}/revisions/{unit["revision"]!["id"]!.GetValue<Guid>()}/publish", new { version = 1 });
        return id;
    }
    private static Task<WebSocket> Connect(ApiHost host, Guid id, string? cookie, string origin = "http://localhost")
    {
        var client = host.Server.CreateWebSocketClient();
        client.ConfigureRequest = request => { if (cookie is not null) request.Headers["Cookie"] = cookie; request.Headers["Origin"] = origin; };
        return client.ConnectAsync(new Uri($"ws://localhost/api/tutor/conversations/{id}/voice"), default);
    }
    private static async Task<string> Json(WebSocket socket)
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        var frame = await LiveVoice.Receive(socket, 1048576, timeout.Token);
        Assert.Equal(WebSocketMessageType.Text, frame.Type);
        return System.Text.Encoding.UTF8.GetString(frame.Data);
    }

    [Fact]
    public async Task Voice_websocket_preserves_ownership_origin_distributed_slots_protocol_and_reconnection()
    {
        var setups = new List<string>();
        var audioReceived = 0;
        var builder = WebApplication.CreateBuilder(); builder.WebHost.UseUrls("http://127.0.0.1:0"); builder.Logging.ClearProviders();
        await using var standin = builder.Build(); standin.UseWebSockets();
        standin.Map("/live", async context =>
        {
            Assert.Equal("Bearer simulation-vertex-token", context.Request.Headers.Authorization);
            using var socket = await context.WebSockets.AcceptWebSocketAsync();
            var setup = await LiveVoice.Receive(socket, 262144, default);
            lock (setups) setups.Add(System.Text.Encoding.UTF8.GetString(setup.Data));
            await LiveVoice.Send(socket, new { setupComplete = new { } }, default);
            try
            {
                while (socket.State == WebSocketState.Open)
                {
                    var frame = await LiveVoice.Receive(socket, 65536, default);
                    if (frame.Type == WebSocketMessageType.Close) break;
                    using var json = JsonDocument.Parse(frame.Data);
                    var input = json.RootElement.GetProperty("realtimeInput");
                    if (input.TryGetProperty("audio", out var audio)) { Assert.Equal("audio/pcm;rate=16000", audio.GetProperty("mimeType").GetString()); Interlocked.Increment(ref audioReceived); continue; }
                    if (input.TryGetProperty("audioStreamEnd", out _)) continue;
                    var text = input.GetProperty("text").GetString();
                    await LiveVoice.Send(socket, new { serverContent = new { interrupted = text == "interrupt",
                        outputTranscription = new { text = "Respuesta de voz" },
                        modelTurn = new { parts = new[] { new { inlineData = new { mimeType = "audio/pcm;rate=24000", data = "AAABAA==" } } } }, turnComplete = true } }, default);
                }
            }
            catch (WebSocketException) { }
        });
        await standin.StartAsync();
        var address = standin.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()!.Addresses.Single().Replace("http:", "ws:");
        var settings = new Dictionary<string, string> { ["AI:Voice:Enabled"] = "true", ["AI:Voice:Project"] = "contract-project", ["AI:Voice:Location"] = "us-central1",
            ["AI:Voice:Model"] = "contract-voice", ["AI:Voice:Endpoint"] = address + "/live", ["AI:Voice:MaxConcurrentSessions"] = "1" };
        using var host = new ApiHost(fixture.Connection, fixture.Clock, settings);
        using var secondHost = new ApiHost(fixture.Connection, fixture.Clock, settings);
        var author = await Login(host, "author"); using var a = author.Client;
        var student = await Login(host, "student-a"); using var s = student.Client;
        var other = await Login(host, "student-b"); using var b = other.Client;
        var unit = await Publish(a);
        var conversation = await s.PostAsJsonAsync("/api/tutor/conversations", new { unitId = unit });
        var id = (await conversation.Content.ReadFromJsonAsync<JsonObject>())!["id"]!.GetValue<Guid>();
        var secondConversation = await b.PostAsJsonAsync("/api/tutor/conversations", new { unitId = unit });
        var otherId = (await secondConversation.Content.ReadFromJsonAsync<JsonObject>())!["id"]!.GetValue<Guid>();
        Assert.True((await s.GetFromJsonAsync<JsonObject>("/api/tutor/voice"))!["enabled"]!.GetValue<bool>());
        await Assert.ThrowsAnyAsync<Exception>(() => Connect(host, id, null));
        await Assert.ThrowsAnyAsync<Exception>(() => Connect(host, id, other.Cookie));
        await Assert.ThrowsAnyAsync<Exception>(() => Connect(host, id, student.Cookie, "https://untrusted.example"));
        Assert.Empty(setups);
        using (var browser = await Connect(host, id, student.Cookie))
        {
            Assert.Contains("ready", await Json(browser));
            await Assert.ThrowsAnyAsync<Exception>(() => Connect(secondHost, id, student.Cookie));
            await Assert.ThrowsAnyAsync<Exception>(() => Connect(secondHost, otherId, other.Cookie));
            Assert.Single(setups);
            await browser.SendAsync(new ArraySegment<byte>(new byte[] { 0, 0, 1, 0 }), WebSocketMessageType.Binary, true, default);
            for (var turn = 0; turn < 2; turn++)
            {
                await LiveVoice.Send(browser, new { type = "text", text = turn == 0 ? "Explica" : "interrupt" }, default);
                Assert.Contains("transcript", await Json(browser));
                var audio = await LiveVoice.Receive(browser, 100, default); Assert.Equal(WebSocketMessageType.Binary, audio.Type);
                Assert.Equal(new byte[] { 0, 0, 1, 0 }, audio.Data);
                if (turn == 1) Assert.Contains("interrupted", await Json(browser));
                Assert.Contains("turn_complete", await Json(browser));
            }
            using var close = new CancellationTokenSource(TimeSpan.FromSeconds(5));
            await browser.CloseAsync(WebSocketCloseStatus.NormalClosure, "Done", close.Token);
        }
        // Closing completes the API request and releases the unpooled PostgreSQL session lock.
        using var reconnected = await Connect(secondHost, id, student.Cookie);
        Assert.Contains("ready", await Json(reconnected));
        Assert.Equal(2, setups.Count); Assert.Equal(1, audioReceived);
        Assert.All(setups, setup => { Assert.DoesNotContain("PRIVATE-VOICE-KEY", setup); Assert.DoesNotContain("student-a", setup); Assert.Contains("Un vector contiene", setup); });
        var messages = await s.GetFromJsonAsync<JsonObject>($"/api/tutor/conversations/{id}/messages");
        Assert.Equal(0, messages!["total"]!.GetValue<int>());
        using var finish = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        await reconnected.CloseAsync(WebSocketCloseStatus.NormalClosure, "Done", finish.Token);
        await standin.StopAsync();
    }
}
