using AITeacher.Api.Features.Assessments;
using AITeacher.Api.Features.Catalog;
using AITeacher.Api.Features.Editorial;
using AITeacher.Api.Features.Identity;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using Microsoft.EntityFrameworkCore;
using System.Threading.RateLimiting;

var builder = WebApplication.CreateBuilder(args);
var connection = builder.Configuration.GetConnectionString("Postgres")
    ?? throw new InvalidOperationException("Configure ConnectionStrings:Postgres before starting the backend.");
builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<ApiExceptionHandler>();
builder.Services.AddValidation();
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddScoped<IGoogleIdentityVerifier, GoogleIdentityVerifier>();
builder.Services.AddDbContext<IdentityDbContext>(options => options.UseNpgsql(connection,
    postgres => postgres.MigrationsHistoryTable("__EFMigrationsHistory", "identity")));
builder.Services.AddDbContext<CatalogDbContext>(options => options.UseNpgsql(connection,
    postgres => postgres.MigrationsHistoryTable("__EFMigrationsHistory", "curriculum")));
builder.Services.AddDbContext<EditorialDbContext>(options => options.UseNpgsql(connection,
    postgres => postgres.MigrationsHistoryTable("__EFMigrationsHistory", "content")));
builder.Services.AddDbContext<AssessmentDbContext>(options => options.UseNpgsql(connection,
    postgres => postgres.MigrationsHistoryTable("__EFMigrationsHistory", "assessments")));
builder.Services.AddScoped<IAssessmentCurriculum, AssessmentCurriculum>();
builder.Services.AddScoped<AssessmentService>();
builder.Services.AddScoped<ITopicCatalog, TopicCatalog>();
builder.Services.AddScoped<EditorialService>();
builder.Services.AddScoped<CorpusImporter>();
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
// Explicit command: migrations are never applied implicitly by API startup.
if (args.Contains("--migrate", StringComparer.Ordinal))
{
    await using var scope = app.Services.CreateAsyncScope();
    await scope.ServiceProvider.GetRequiredService<IdentityDbContext>().Database.MigrateAsync();
    await scope.ServiceProvider.GetRequiredService<CatalogDbContext>().Database.MigrateAsync();
    await scope.ServiceProvider.GetRequiredService<EditorialDbContext>().Database.MigrateAsync();
    await scope.ServiceProvider.GetRequiredService<AssessmentDbContext>().Database.MigrateAsync();
    return;
}
app.UseExceptionHandler();
app.UseStatusCodePages();
if (!app.Environment.IsDevelopment())
{
    app.UseHsts();
    app.UseHttpsRedirection();
}
app.UseAuthentication();
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
app.Run();

public partial class Program;
