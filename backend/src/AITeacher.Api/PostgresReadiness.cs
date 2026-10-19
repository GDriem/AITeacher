using AITeacher.Api.Features.Assessments;
using AITeacher.Api.Features.Catalog;
using AITeacher.Api.Features.Editorial;
using AITeacher.Api.Features.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Diagnostics.HealthChecks;

public sealed class PostgresReadiness(IServiceScopeFactory scopes) : IHealthCheck
{
    public async Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        try
        {
            await using var scope = scopes.CreateAsyncScope();
            var identity = scope.ServiceProvider.GetRequiredService<IdentityDbContext>();
            var catalog = scope.ServiceProvider.GetRequiredService<CatalogDbContext>();
            if (!await catalog.Database.CanConnectAsync(cancellationToken)) return HealthCheckResult.Unhealthy();
            var editorial = scope.ServiceProvider.GetRequiredService<EditorialDbContext>();
            var assessments = scope.ServiceProvider.GetRequiredService<AssessmentDbContext>();
            if ((await assessments.Database.GetPendingMigrationsAsync(cancellationToken)).Any() ||
                (await editorial.Database.GetPendingMigrationsAsync(cancellationToken)).Any() ||
                (await identity.Database.GetPendingMigrationsAsync(cancellationToken)).Any() ||
                (await catalog.Database.GetPendingMigrationsAsync(cancellationToken)).Any()) return HealthCheckResult.Unhealthy();
            return HealthCheckResult.Healthy();
        }
        catch (Exception) { return HealthCheckResult.Unhealthy(); }
    }
}
