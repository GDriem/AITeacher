using Microsoft.AspNetCore.Diagnostics;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using AITeacher.Api.Features.Tutor;

public sealed class ApiExceptionHandler(IProblemDetailsService problems, ILogger<ApiExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext context, Exception exception, CancellationToken cancellationToken)
    {
        var (status, title) = exception switch
        {
            DbUpdateConcurrencyException => (409, "Resource has changed; reload before saving"),
            DbUpdateException { InnerException: PostgresException { SqlState: PostgresErrorCodes.UniqueViolation } }
                => (409, "A resource with that unique identifier already exists in this scope"),
            DbUpdateException { InnerException: PostgresException { SqlState: PostgresErrorCodes.ForeignKeyViolation or PostgresErrorCodes.CheckViolation or PostgresErrorCodes.NotNullViolation or PostgresErrorCodes.StringDataRightTruncation } }
                => (400, "Invalid resource data or reference"),
            TutorUnavailableException => (503, "AI capability is not configured or unavailable"),
            TutorOutputException => (502, "Invalid AI response"),
            HttpRequestException or TimeoutException or NpgsqlException => (503, "A required service is unavailable"),
            _ => (500, "An unexpected error occurred")
        };
        if (status >= 500)
        {
            // Record diagnostic types/codes only: never exception messages, payloads, tokens or connection strings.
            var azure = exception as Azure.RequestFailedException ?? exception.InnerException as Azure.RequestFailedException;
            logger.LogError("API failure {ExceptionType}; inner {InnerType}; scheme {Scheme}; secureCookieRejected {SecureCookieRejected}; Azure status {AzureStatus}; Azure code {AzureCode}",
                exception.GetType().Name, exception.InnerException?.GetType().Name, context.Request.Scheme,
                exception is InvalidOperationException && exception.Message.Contains("Cookie.SecurePolicy", StringComparison.Ordinal),
                azure?.Status, azure?.ErrorCode);
        }
        context.Response.StatusCode = status;
        return await problems.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = context,
            ProblemDetails = new() { Status = status, Title = title }
        });
    }
}
