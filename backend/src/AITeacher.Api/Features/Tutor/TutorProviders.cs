using System.Diagnostics;
using System.Net.Http.Json;
using System.Text.Json;

namespace AITeacher.Api.Features.Tutor;

// Fixed capability routing: configuration chooses providers, callers and models cannot override it.
public sealed class TutorProviders(IConfiguration configuration, IHttpClientFactory clients, IHostEnvironment environment,
    ILogger<TutorProviders> logger)
{
    public ProviderSelection Select(string capability)
    {
        var section = configuration.GetSection("AI:Capabilities:" + capability);
        var choice = new ProviderSelection(section["Provider"] ?? "disabled", section["Model"] ?? "",
            section["ConfigurationVersion"] ?? "1", section.GetValue("StructuredOutput", false));
        if (!choice.StructuredOutput || choice.Provider is not ("mock" or "azure" or "gemini") ||
            (choice.Provider == "mock" && !environment.IsDevelopment()) || string.IsNullOrWhiteSpace(choice.Model))
            throw new TutorUnavailableException();
        if (choice.Provider != "mock") _ = Endpoint(choice.Provider);
        return choice;
    }

    private (Uri Uri, string Key) Endpoint(string provider)
    {
        var section = configuration.GetSection("AI:Providers:" + provider);
        if (!Uri.TryCreate(section["Endpoint"], UriKind.Absolute, out var uri) ||
            (uri.Scheme != "https" && !(environment.IsDevelopment() && uri.IsLoopback && uri.Scheme == "http")) ||
            uri.Query.Length != 0 || uri.UserInfo.Length != 0 || string.IsNullOrWhiteSpace(section["ApiKey"]))
            throw new TutorUnavailableException();
        return (new Uri(uri.AbsoluteUri.TrimEnd('/') + "/"), section["ApiKey"]!);
    }

    // A small shared schema; the application validates IDs and text even when a provider claims schema support.
    private static readonly object Schema = new { type = "object", additionalProperties = false,
        properties = new { text = new { type = "string" }, sourceIds = new { type = "array", items = new { type = "string" } } },
        required = new[] { "text", "sourceIds" } };

    public async Task<ProviderReply> Generate(ProviderSelection selection, TutorContext context, CancellationToken ct)
    {
        if (!selection.StructuredOutput || selection.Provider is not ("mock" or "azure" or "gemini") ||
            (selection.Provider == "mock" && !environment.IsDevelopment()) || string.IsNullOrWhiteSpace(selection.Model))
            throw new TutorUnavailableException();
        var timer = Stopwatch.StartNew();
        ProviderReply reply;
        try
        {
            if (selection.Provider == "mock")
                reply = new(context.Manifest.Capability == "Summary" ? "[Mock] Resumen de los mensajes incluidos; no acredita dominio." :
                    "[Mock] Revisemos la actividad paso a paso. ¿Cómo explicarías la idea principal?", context.Sources.Take(1).Select(x => x.Id).ToArray());
            else
            {
                var (endpoint, key) = Endpoint(selection.Provider);
                using var request = new HttpRequestMessage(HttpMethod.Post, selection.Provider == "azure"
                    ? new Uri(endpoint, "openai/v1/chat/completions")
                    : new Uri(endpoint, "v1beta/models/" + Uri.EscapeDataString(selection.Model) + ":generateContent"));
                if (selection.Provider == "azure")
                {
                    request.Headers.Add("api-key", key);
                    request.Content = JsonContent.Create(new { model = selection.Model,
                        messages = new[] { new { role = "system", content = context.System }, new { role = "user", content = context.Payload } },
                        max_completion_tokens = 2048, response_format = new { type = "json_schema", json_schema = new { name = "tutor_reply", strict = true, schema = Schema } } });
                }
                else
                {
                    request.Headers.Add("x-goog-api-key", key);
                    request.Content = JsonContent.Create(new { systemInstruction = new { parts = new[] { new { text = context.System } } },
                        contents = new[] { new { role = "user", parts = new[] { new { text = context.Payload } } } },
                        generationConfig = new { maxOutputTokens = 2048, responseMimeType = "application/json", responseJsonSchema = Schema } });
                }
                using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
                timeout.CancelAfter(TimeSpan.FromSeconds(30));
                using var response = await clients.CreateClient("tutor-provider").SendAsync(request, HttpCompletionOption.ResponseHeadersRead, timeout.Token);
                if (!response.IsSuccessStatusCode) throw new TutorUnavailableException();
                // Bound response allocation, including bodies from faulty gateways.
                await using var stream = await response.Content.ReadAsStreamAsync(timeout.Token);
                using var bounded = new MemoryStream();
                var buffer = new byte[8192];
                int count;
                while ((count = await stream.ReadAsync(buffer, timeout.Token)) > 0)
                {
                    if (bounded.Length + count > 256000) throw new TutorOutputException();
                    bounded.Write(buffer, 0, count);
                }
                using var body = JsonDocument.Parse(bounded.ToArray());
                var root = body.RootElement;
                string output;
                int? inputTokens = null, outputTokens = null;
                if (selection.Provider == "azure")
                {
                    var choice = root.GetProperty("choices")[0];
                    if (choice.GetProperty("finish_reason").GetString() != "stop") throw new TutorOutputException();
                    output = choice.GetProperty("message").GetProperty("content").GetString()!;
                    if (root.TryGetProperty("usage", out var usage))
                    { inputTokens = Number(usage, "prompt_tokens"); outputTokens = Number(usage, "completion_tokens"); }
                }
                else
                {
                    var candidate = root.GetProperty("candidates")[0];
                    if (candidate.GetProperty("finishReason").GetString() != "STOP") throw new TutorOutputException();
                    output = string.Concat(candidate.GetProperty("content").GetProperty("parts").EnumerateArray()
                        .Where(x => !x.TryGetProperty("thought", out var thought) || !thought.GetBoolean())
                        .Select(x => x.GetProperty("text").GetString()));
                    if (root.TryGetProperty("usageMetadata", out var usage))
                    { inputTokens = Number(usage, "promptTokenCount"); outputTokens = Number(usage, "candidatesTokenCount"); }
                }
                if (string.IsNullOrWhiteSpace(output)) throw new TutorOutputException();
                reply = JsonSerializer.Deserialize<ProviderReply>(output, ContextBuilder.Json) ?? throw new TutorOutputException();
                reply = reply with { InputTokens = inputTokens, OutputTokens = outputTokens };
            }
            if (string.IsNullOrWhiteSpace(reply.Text) || reply.Text.Length > 12000 || reply.SourceIds is null || reply.SourceIds.Length > 3 ||
                reply.SourceIds.Distinct().Count() != reply.SourceIds.Length || reply.SourceIds.Any(id => !context.Sources.Any(x => x.Id == id)))
                throw new TutorOutputException();
            logger.LogInformation("AI operation {Capability} provider {Provider} model {Model} config {ConfigurationVersion} skill {Skill} latencyMs {LatencyMs} inputTokens {InputTokens} outputTokens {OutputTokens}",
                context.Manifest.Capability, selection.Provider, selection.Model, selection.ConfigurationVersion, context.Manifest.SkillVersion,
                timer.ElapsedMilliseconds, reply.InputTokens, reply.OutputTokens);
            return reply;
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested) { throw new TutorUnavailableException(); }
        catch (Exception ex) when (ex is JsonException or KeyNotFoundException or InvalidOperationException or ArgumentOutOfRangeException or IndexOutOfRangeException or FormatException)
        { throw new TutorOutputException(); }
    }
    private static int? Number(JsonElement element, string name) => element.TryGetProperty(name, out var v) && v.TryGetInt32(out var n) && n >= 0 ? n : null;
}
