using System.Security.Claims;

namespace AITeacher.Api.Features.Assessments;

public static class AssessmentEndpoints
{
    public static void MapAssessments(this WebApplication app)
    {
        var group = app.MapGroup("/api/assessments").RequireAuthorization();
        group.AddEndpointFilter(async (context, next) =>
        {
            context.HttpContext.Response.Headers.CacheControl = "no-store";
            return await next(context);
        });
        group.MapPost("/questions", (QuestionRequest request, ClaimsPrincipal user, AssessmentService s, CancellationToken ct) => s.CreateQuestion(request, user, ct)).RequireAuthorization("Author");
        group.MapGet("/questions", (int? offset, int? limit, ClaimsPrincipal user, AssessmentService s, CancellationToken ct) => s.List("question", offset, limit, user, ct)).RequireAuthorization("Author");
        group.MapGet("/questions/{id:guid}", (Guid id, AssessmentService s, CancellationToken ct) => s.GetRevision("question", id, ct)).RequireAuthorization("Author");
        group.MapPost("/definitions", (DefinitionRequest request, ClaimsPrincipal user, AssessmentService s, CancellationToken ct) => s.CreateDefinition(request, user, ct)).RequireAuthorization("Author");
        group.MapGet("/definitions", (int? offset, int? limit, ClaimsPrincipal user, AssessmentService s, CancellationToken ct) => s.List("definition", offset, limit, user, ct));
        group.MapGet("/definitions/{id:guid}", (Guid id, AssessmentService s, CancellationToken ct) => s.GetRevision("definition", id, ct)).RequireAuthorization("Author");
        group.MapGet("/attempts/{id:guid}/review", (Guid id, AssessmentService s, CancellationToken ct) => s.GetReview(id, ct)).RequireAuthorization("Author");
        group.MapPost("/attempts/{id:guid}/review", (Guid id, ReviewRequest request, ClaimsPrincipal user, AssessmentService s, CancellationToken ct) => s.Review(id, request, user, ct)).RequireAuthorization("Author");
        group.MapPost("/attempts", (StartAttemptRequest request, ClaimsPrincipal user, AssessmentService s, CancellationToken ct) => s.Start(request, user, ct));
        group.MapGet("/attempts/{id:guid}", (Guid id, ClaimsPrincipal user, AssessmentService s, CancellationToken ct) => s.GetAttempt(id, user, ct));
        group.MapPost("/attempts/{id:guid}/submit", (Guid id, SubmitAttemptRequest request, ClaimsPrincipal user, AssessmentService s, CancellationToken ct) => s.Submit(id, request, user, ct));
    }
}
