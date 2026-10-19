using Microsoft.AspNetCore.Diagnostics;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using AITeacher.Api.Features.Tutor;

public sealed class ApiExceptionHandler(IProblemDetailsService problems) : IExceptionHandler
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
        context.Response.StatusCode = status;
        return await problems.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = context,
            ProblemDetails = new() { Status = status, Title = title }
        });
    }
}
