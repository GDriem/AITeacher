using AITeacher.Api.Infrastructure;
using AITeacher.Api.Features.History;
using AITeacher.Api.Features.Learning;
using AITeacher.Api.Features.Graphs;
using AITeacher.Api.Features.Assessments;
using AITeacher.Api.Features.Catalog;
using AITeacher.Api.Features.Editorial;
using AITeacher.Api.Features.Identity;
using AITeacher.Api.Features.Tutor;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using Microsoft.EntityFrameworkCore;
using System.Threading.RateLimiting;

var builder = WebApplication.CreateBuilder(args);
var connection = builder.Configuration.GetConnectionString("Postgres")
    ?? throw new InvalidOperationException("Configure ConnectionStrings:Postgres before starting the backend.");
builder.Services.AddAzureHosting(builder.Configuration, builder.Environment);
builder.Services.AddDbContext<HistoryDbContext>((services, options) => options.UseNpgsql(services.GetRequiredService<PostgresConnections>().Pooled,
    postgres => postgres.MigrationsHistoryTable("__EFMigrationsHistory", "history")));
builder.Services.AddScoped<HistoryMigration>();
builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<ApiExceptionHandler>();
builder.Services.AddValidation();
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddScoped<IGoogleIdentityVerifier, GoogleIdentityVerifier>();
builder.Services.AddDbContext<IdentityDbContext>((services, options) => options.UseNpgsql(services.GetRequiredService<PostgresConnections>().Pooled,
    postgres => postgres.MigrationsHistoryTable("__EFMigrationsHistory", "identity")));
builder.Services.AddDbContext<CatalogDbContext>((services, options) => options.UseNpgsql(services.GetRequiredService<PostgresConnections>().Pooled,
    postgres => postgres.MigrationsHistoryTable("__EFMigrationsHistory", "curriculum")));
builder.Services.AddDbContext<EditorialDbContext>((services, options) => options.UseNpgsql(services.GetRequiredService<PostgresConnections>().Pooled,
    postgres => postgres.MigrationsHistoryTable("__EFMigrationsHistory", "content")));
builder.Services.AddDbContext<AssessmentDbContext>((services, options) => options.UseNpgsql(services.GetRequiredService<PostgresConnections>().Pooled,
    postgres => postgres.MigrationsHistoryTable("__EFMigrationsHistory", "assessments")));
builder.Services.AddDbContext<TutorDbContext>((services, options) => options.UseNpgsql(services.GetRequiredService<PostgresConnections>().Pooled,
    postgres => postgres.MigrationsHistoryTable("__EFMigrationsHistory", "conversations")));
builder.Services.AddDbContext<GraphDbContext>((services, options) => options.UseNpgsql(services.GetRequiredService<PostgresConnections>().Pooled,
    postgres => postgres.MigrationsHistoryTable("__EFMigrationsHistory", "graphs")));
builder.Services.AddDbContext<LearningDbContext>((services, options) => options.UseNpgsql(services.GetRequiredService<PostgresConnections>().Pooled,
    postgres => postgres.MigrationsHistoryTable("__EFMigrationsHistory", "learning")));
builder.Services.AddScoped<IAssessmentEvidenceFeed, AssessmentEvidenceFeed>();
builder.Services.AddScoped<LearningService>();
builder.Services.AddHostedService<EvidenceWorker>();
builder.Services.AddScoped<IGraphCurriculum, GraphCurriculum>();
builder.Services.AddScoped<IGraphMessages, GraphMessages>();
builder.Services.AddScoped<GraphService>();
builder.Services.AddScoped<ITutorContent, TutorContent>();
builder.Services.AddScoped<TutorService>();
builder.Services.AddSingleton<ContextBuilder>();
builder.Services.AddScoped<TutorProviders>();
builder.Services.AddScoped<LiveVoice>();
builder.Services.AddSingleton<IVertexCredential, VertexCredential>();
builder.Services.AddHttpClient("tutor-provider", client => client.Timeout = Timeout.InfiniteTimeSpan)
    .ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler { AllowAutoRedirect = false });
builder.Services.AddSingleton<IVertexCredential, ConfiguredVertexCredential>();
builder.Services.AddScoped<IAssessmentCurriculum, AssessmentCurriculum>();
builder.Services.AddScoped<AssessmentService>();
builder.Services.AddScoped<ITopicCatalog, TopicCatalog>();
builder.Services.AddScoped<EditorialService>();
builder.Services.AddScoped<CorpusImporter>();
builder.Services.AddScoped<CurriculumMigration>();
builder.Services.AddHealthChecks().AddCheck<PostgresReadiness>("postgres", tags: ["ready"]);
builder.Services.AddAuthentication(SessionAuthenticationHandler.SchemeName)
    .AddScheme<AuthenticationSchemeOptions, SessionAuthenticationHandler>(SessionAuthenticationHandler.SchemeName, _ => { });
builder.Services.AddAuthorization(options => options.AddPolicy("Author", policy => policy.RequireRole("Author")));
builder.Services.AddAntiforgery(options =>
{
    options.HeaderName = "X-CSRF-TOKEN";
    options.Cookie.Name = "ait_dotnet_csrf";
    options.Cookie.SameSite = SameSiteMode.Strict;
    options.Cookie.SecurePolicy = builder.Environment.IsDevelopment() ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;
});
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = 429;
    options.AddPolicy("login", context => RateLimitPartition.GetFixedWindowLimiter(
        context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 20, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
});

var app = builder.Build();
if (args.Contains("--bootstrap-data-protection-key", StringComparer.Ordinal))
    await PrivateKeyBootstrap.Run(builder.Configuration);
// Explicit command: migrations are never applied implicitly by API startup.
if (args.Contains("--migrate", StringComparer.Ordinal))
{
    await using var scope = app.Services.CreateAsyncScope();
    await scope.ServiceProvider.GetRequiredService<IdentityDbContext>().Database.MigrateAsync();
    await scope.ServiceProvider.GetRequiredService<CatalogDbContext>().Database.MigrateAsync();
    await scope.ServiceProvider.GetRequiredService<EditorialDbContext>().Database.MigrateAsync();
    await scope.ServiceProvider.GetRequiredService<AssessmentDbContext>().Database.MigrateAsync();
    await scope.ServiceProvider.GetRequiredService<TutorDbContext>().Database.MigrateAsync();
    await scope.ServiceProvider.GetRequiredService<GraphDbContext>().Database.MigrateAsync();
    await scope.ServiceProvider.GetRequiredService<LearningDbContext>().Database.MigrateAsync();
    await scope.ServiceProvider.GetRequiredService<HistoryDbContext>().Database.MigrateAsync();
    return;
}
if (args.Contains("--curriculum", StringComparer.Ordinal))
{
    await using var scope = app.Services.CreateAsyncScope();
    var index = Array.IndexOf(args, "--curriculum");
    if (args.Length != index + 2) throw new InvalidDataException("Use --curriculum inspect|apply|reconcile.");
    var report = await scope.ServiceProvider.GetRequiredService<CurriculumMigration>().Run(args[index + 1], CancellationToken.None);
    var reportJson = System.Text.Json.JsonSerializer.SerializeToElement(report, new System.Text.Json.JsonSerializerOptions(System.Text.Json.JsonSerializerDefaults.Web));
    Console.WriteLine(reportJson);
    if (reportJson.GetProperty("conflicts").GetArrayLength() > 0 || (args[index + 1] == "reconcile" && !reportJson.GetProperty("matches").GetBoolean())) Environment.ExitCode = 2;
    return;
}
if (args.Contains("--consume-evidence", StringComparer.Ordinal))
{
    await using var scope = app.Services.CreateAsyncScope();
    while (await scope.ServiceProvider.GetRequiredService<LearningService>().Consume(CancellationToken.None) == 100) { }
    return;
}
if (args.Contains("--history", StringComparer.Ordinal))
{
    await using var scope = app.Services.CreateAsyncScope();
    try
    {
        if (!app.Environment.IsDevelopment())
            throw new InvalidDataException("History rehearsal commands require Development environment.");
        var index = Array.IndexOf(args, "--history");
        if (args.Length != index + 3) throw new InvalidDataException("Use --history import|reconcile <snapshot> or rollback <batch UUID>.");
        var service = scope.ServiceProvider.GetRequiredService<HistoryMigration>();
        if (args[index + 1] == "rollback")
        {
            await service.Rollback(Guid.Parse(args[index + 2]), CancellationToken.None);
            Console.WriteLine("History batch rolled back.");
        }
        else if (args[index + 1] is "import" or "reconcile")
        {
            await using var input = File.OpenRead(args[index + 2]);
            var snapshot = await System.Text.Json.JsonSerializer.DeserializeAsync<HistorySnapshot>(input, HistoryMigration.Json)
                ?? throw new InvalidDataException("Empty snapshot.");
            var report = args[index + 1] == "import"
                ? await service.Import(snapshot, CancellationToken.None)
                : await service.Reconcile(snapshot, CancellationToken.None);
            Console.WriteLine(System.Text.Json.JsonSerializer.Serialize(report, HistoryMigration.Json));
            if (!report.Matches) Environment.ExitCode = 2;
        }
        else throw new InvalidDataException("Unknown history command.");
    }
    catch (Exception)
    {
        // Do not echo payloads, connection strings or source validation errors.
        Console.Error.WriteLine("History command failed. Check snapshot, batch state, migrations and database connectivity.");
        Environment.ExitCode = 2;
    }
    return;
}
if (args.Contains("--grant-runtime-access", StringComparer.Ordinal))
{
    await RuntimeDatabaseAccess.Grant(app.Services.GetRequiredService<PostgresConnections>(), app.Configuration);
    return;
}
app.UseForwardedHeaders();
app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseDefaultFiles();
app.UseStaticFiles();
if (!app.Environment.IsDevelopment())
{
    app.UseHsts();
    app.UseWhen(context => context.Request.Path != "/health" && context.Request.Path != "/health/ready",
        secure => secure.UseHttpsRedirection());
}
app.UseAuthentication();
app.UseWebSockets();
app.UseAuthorization();
app.UseRateLimiter();
app.Use(async (context, next) =>
{
    if (context.Request.Path.StartsWithSegments("/api") &&
        !HttpMethods.IsGet(context.Request.Method) && !HttpMethods.IsHead(context.Request.Method) &&
        !HttpMethods.IsOptions(context.Request.Method))
    {
        try { await context.RequestServices.GetRequiredService<IAntiforgery>().ValidateRequestAsync(context); }
        catch (AntiforgeryValidationException)
        {
            await Results.Problem(statusCode: 400, title: "Missing or invalid CSRF token").ExecuteAsync(context);
            return;
        }
    }
    await next(context);
});
app.MapHealthChecks("/health", new() { Predicate = _ => false });
app.MapHealthChecks("/health/ready", new() { Predicate = check => check.Tags.Contains("ready") });
app.MapIdentity();
app.MapCatalog();
app.MapEditorial();
app.MapAssessments();
app.MapTutor();
app.MapGraphs();
app.MapLearning();
app.MapHistory();
app.MapGet("/static/pcm-capture-worklet.js", () => Results.File(
    Path.Combine(AppContext.BaseDirectory, "voice-assets", "pcm-capture-worklet.js"), "text/javascript; charset=utf-8"));
// React is public static content; private data still requires API authorization.
// Unknown API/WebSocket paths must retain their real 404 instead of receiving the SPA.
app.MapFallback(async context =>
{
    var root = app.Environment.WebRootPath;
    var shell = root is null ? null : Path.Combine(root, "index.html");
    if (context.Request.Path.StartsWithSegments("/api") || context.Request.Path.StartsWithSegments("/ws") ||
        context.Request.Path.StartsWithSegments("/health") || shell is null || !File.Exists(shell))
    {
        await Results.Problem(statusCode: 404, title: "Not found").ExecuteAsync(context);
        return;
    }
    context.Response.Headers.CacheControl = "no-store";
    await Results.File(shell, "text/html; charset=utf-8").ExecuteAsync(context);
});
app.Run();

public partial class Program;
