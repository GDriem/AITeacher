using System.Runtime.InteropServices;
using System.Text.Json;
using System.Net.WebSockets;
using AITeacher.Api.Features.History;
using AITeacher.Api.Features.Identity;
using AITeacher.Api.Features.Tutor;
using AITeacher.Api.Tests;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Configuration;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.Extensions.Logging;

// This executable is a test harness, never a deployment target. The API has no fake-login switch.
internal static class BrowserHost
{
    public static async Task Main(string[] args)
    {
        Directory.SetCurrentDirectory(AppContext.BaseDirectory);
        if (args.Contains("--verify-vertex") || args.Contains("--verify-voice"))
        {
            var project = Environment.GetEnvironmentVariable("GOOGLE_CLOUD_PROJECT") ?? throw new InvalidOperationException("Set GOOGLE_CLOUD_PROJECT");
            var location = Environment.GetEnvironmentVariable("GOOGLE_CLOUD_LOCATION") ?? "us-central1";
            var model = Environment.GetEnvironmentVariable("GEMINI_MODEL") ?? throw new InvalidOperationException("Set GEMINI_MODEL");
            await using var verifier = new ApiHost("Host=127.0.0.1;Database=unused", new TestClock(), new Dictionary<string, string>
            {
                ["AI:Capabilities:Tutor:Provider"] = "vertex", ["AI:Capabilities:Tutor:Model"] = model,
                ["AI:Providers:vertex:Endpoint"] = location == "global" ? "https://aiplatform.googleapis.com/" : $"https://{location}-aiplatform.googleapis.com/",
                ["AI:Providers:vertex:Project"] = project, ["AI:Providers:vertex:Location"] = location,
                ["TestHarness:RealVertexCredential"] = "true", ["Logging:LogLevel:Default"] = "Warning"
            });
            using var scope = verifier.Services.CreateScope();
            if (args.Contains("--verify-voice"))
            {
                var voiceLocation = Environment.GetEnvironmentVariable("GOOGLE_CLOUD_LIVE_LOCATION") ?? "us-central1";
                var voiceModel = Environment.GetEnvironmentVariable("GEMINI_LIVE_MODEL") ?? throw new InvalidOperationException("Set GEMINI_LIVE_MODEL");
                var voiceConfiguration = new Microsoft.Extensions.Configuration.ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
                { ["AI:Voice:Project"] = project, ["AI:Voice:Location"] = voiceLocation, ["AI:Voice:Model"] = voiceModel }).Build();
                using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(60));
                using var socket = new ClientWebSocket();
                var token = await scope.ServiceProvider.GetRequiredService<IVertexCredential>().Token(deadline.Token);
                socket.Options.SetRequestHeader("Authorization", "Bearer " + token);
                await socket.ConnectAsync(LiveVoice.ProviderEndpoint(voiceConfiguration, scope.ServiceProvider.GetRequiredService<Microsoft.Extensions.Hosting.IHostEnvironment>()), deadline.Token);
                var voiceContext = new TutorContext("", "{\"unit\":\"Vectores\",\"activity\":\"Explicar características\",\"sources\":[]}", [], new("voice-smoke-v1", 100, 200, [], [], null, "Tutor", false));
                await LiveVoice.Send(socket, LiveVoice.Setup(voiceConfiguration, voiceContext), deadline.Token);
                var initial = await LiveVoice.Receive(socket, 1048576, deadline.Token);
                using var setup = JsonDocument.Parse(initial.Data);
                if (!setup.RootElement.TryGetProperty("setupComplete", out _)) throw new InvalidOperationException("Live setup failed");
                long audioBytes = 0;
                for (var turn = 0; turn < 2; turn++)
                {
                    await LiveVoice.Send(socket, new { realtimeInput = new { text = turn == 0 ? "Explica en una frase qué es un vector." : "Da un ejemplo breve de dos características." } }, deadline.Token);
                    while (true)
                    {
                        var frame = await LiveVoice.Receive(socket, 1048576, deadline.Token);
                        using var json = JsonDocument.Parse(frame.Data);
                        if (!json.RootElement.TryGetProperty("serverContent", out var server)) continue;
                        if (server.TryGetProperty("modelTurn", out var modelTurn) && modelTurn.TryGetProperty("parts", out var parts))
                            foreach (var part in parts.EnumerateArray())
                                if (part.TryGetProperty("inlineData", out var data) && data.TryGetProperty("data", out var encoded))
                                    audioBytes += Convert.FromBase64String(encoded.GetString()!).Length;
                        if (server.TryGetProperty("turnComplete", out var complete) && complete.GetBoolean()) break;
                    }
                }
                if (audioBytes == 0) throw new InvalidOperationException("No live audio");
                await socket.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, "Synthetic check complete", deadline.Token);
                Console.WriteLine(JsonSerializer.Serialize(new { passed = true, provider = "vertex-live-dotnet", model = voiceModel, completedTurns = 2, audioBytesDiscarded = audioBytes, syntheticInputOnly = true, hardwareMicrophoneNotVerified = true }));
                return;
            }
            var provider = scope.ServiceProvider.GetRequiredService<TutorProviders>();
            var context = new TutorContext("Eres un tutor. Devuelve únicamente el objeto solicitado, sin fuentes si no existen. No acredites dominio.",
                "{\"request\":\"Explica en una frase qué es un vector.\",\"sources\":[]}", [],
                new("live-synthetic-smoke-v1", 200, 300, [], [], null, "Tutor", false));
            var reply = await provider.Generate(provider.Select("Tutor"), context, default);
            Console.WriteLine(JsonSerializer.Serialize(new { passed = true, provider = "vertex", model,
                inputTokens = reply.InputTokens, outputTokens = reply.OutputTokens, reply.SourceIds.Length,
                syntheticInputOnly = true, pedagogicalAcceptance = false }));
            return;
        }
        var fixture = new ApiFixture();
        try
        {
            await fixture.InitializeAsync();
            var simulation = Environment.GetEnvironmentVariable("AITEACHER_TEST_AI_URL")
                ?? throw new InvalidOperationException("Start the local Postman tutor simulation first.");
            var settings = new Dictionary<string, string>
            {
                ["AI:Capabilities:Tutor:Provider"] = "azure", ["AI:Capabilities:Summary:Provider"] = "azure",
                ["AI:Providers:azure:Endpoint"] = simulation + "/azure/", ["AI:Providers:azure:ApiKey"] = "simulation-key",
                ["Learning:WorkerEnabled"] = "true", ["Logging:LogLevel:Default"] = "Warning"
            };
            var voiceBuilder = WebApplication.CreateBuilder();
            voiceBuilder.WebHost.UseUrls("http://127.0.0.1:0"); voiceBuilder.Logging.ClearProviders();
            await using var voiceMock = voiceBuilder.Build(); voiceMock.UseWebSockets();
            voiceMock.Map("/live", async context =>
            {
                using var socket = await context.WebSockets.AcceptWebSocketAsync();
                await LiveVoice.Receive(socket, 262144, context.RequestAborted);
                await LiveVoice.Send(socket, new { setupComplete = new { } }, context.RequestAborted);
                var answered = false;
                try
                {
                    while (socket.State == WebSocketState.Open)
                    {
                        var frame = await LiveVoice.Receive(socket, 65536, context.RequestAborted);
                        if (frame.Type == WebSocketMessageType.Close) break;
                        if (answered) continue;
                        answered = true;
                        await LiveVoice.Send(socket, new { serverContent = new { outputTranscription = new { text = "Voz de prueba de la unidad" },
                            modelTurn = new { parts = new[] { new { inlineData = new { mimeType = "audio/pcm;rate=24000", data = "AAABAA==" } } } }, turnComplete = true } }, context.RequestAborted);
                    }
                    if (socket.State == WebSocketState.CloseReceived) await socket.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, "Done", default);
                }
                catch (Exception error) when (error is WebSocketException or OperationCanceledException) { }
            });
            await voiceMock.StartAsync();
            var voiceAddress = voiceMock.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()!.Addresses.Single().Replace("http:", "ws:");
            settings["AI:Voice:Enabled"] = "true"; settings["AI:Voice:Project"] = "browser-project";
            settings["AI:Voice:Location"] = "us-central1"; settings["AI:Voice:Model"] = "synthetic-live"; settings["AI:Voice:Endpoint"] = voiceAddress + "/live";
            await using var host = new ApiHost(fixture.Connection, fixture.Clock, settings);
            host.UseKestrel(5088);
            using var scope = host.Services.CreateScope();
            await scope.ServiceProvider.GetRequiredService<AITeacher.Api.Features.Editorial.CurriculumMigration>().Run("apply", default);
            var owner = SessionAuthenticationHandler.StudentId("student-a-sub");
            var payload = JsonSerializer.SerializeToElement(new
            {
                id = "legacy-browser", student_id = owner, title = "Historia de vectores", topic = "embeddings",
                messages = new[] { new { id = "legacy-message", role = "user", content = "Mi explicación histórica", sources = Array.Empty<string>() } },
                pending_evaluation = new { student_id = owner, quiz = new { expected_keywords = new[] { "PRIVATE-HISTORICAL-KEY" } } }
            });
            await scope.ServiceProvider.GetRequiredService<HistoryMigration>().Import(new(1, Guid.NewGuid(), "browser-synthetic",
                [new("conversation", "legacy-browser", owner, payload)]), default);
            Console.WriteLine("Browser test host listening at http://127.0.0.1:5088; isolated synthetic PostgreSQL database.");
            var stop = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            Console.CancelKeyPress += (_, args) => { args.Cancel = true; stop.TrySetResult(); };
            using var termination = PosixSignalRegistration.Create(PosixSignal.SIGTERM, context => { context.Cancel = true; stop.TrySetResult(); });
            await stop.Task;
            await voiceMock.StopAsync();
        }
        finally { await fixture.DisposeAsync(); }
    }
}
