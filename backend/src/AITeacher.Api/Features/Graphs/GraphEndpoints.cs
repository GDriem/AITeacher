using System.Security.Claims;

namespace AITeacher.Api.Features.Graphs;

public static class GraphEndpoints
{
    public static void MapGraphs(this WebApplication app)
    {
        var g = app.MapGroup("/api/graphs").RequireAuthorization();
        g.AddEndpointFilter(async (context, next) => {
            context.HttpContext.Response.Headers.CacheControl = "no-store";
            context.HttpContext.Response.Headers["X-Content-Type-Options"] = "nosniff";
            context.HttpContext.Response.Headers.ContentSecurityPolicy = GraphHtml.ContentSecurityPolicy;
            return await next(context);
        });
        g.MapPost("/revisions", (GraphRequest r, ClaimsPrincipal u, GraphService s, CancellationToken ct) => s.Create(r, u, ct)).RequireAuthorization("Author");
        g.MapGet("/revisions", (Guid? topicId, int? offset, int? limit, GraphService s, CancellationToken ct) => s.List(topicId, offset ?? 0, limit ?? 50, ct));
        g.MapGet("/revisions/{id:guid}", (Guid id, GraphService s, CancellationToken ct) => s.Get(id, ct));
        g.MapPost("/conversations/{id:guid}/observations", (Guid id, ObservationRequest r, ClaimsPrincipal u, GraphService s, CancellationToken ct) => s.Observe(id, r, u, ct));
        g.MapPost("/conversations/{id:guid}/extract", (Guid id, ExtractRequest r, ClaimsPrincipal u, GraphService s, CancellationToken ct) => s.Extract(id, r, u, ct));
        g.MapGet("/observations/{id:guid}", (Guid id, ClaimsPrincipal u, GraphService s, CancellationToken ct) => s.ReadObservation(id, u, ct));
        g.MapPost("/observations/{id:guid}/corrections", (Guid id, CorrectionRequest r, ClaimsPrincipal u, GraphService s, CancellationToken ct) => s.Correct(id, r, u, ct));
        g.MapGet("/conversations/{id:guid}", (Guid id, Guid graphRevisionId, ClaimsPrincipal u, GraphService s, CancellationToken ct) => s.Map(id, graphRevisionId, u, false, ct));
        g.MapGet("/conversations/{id:guid}/list", (Guid id, Guid graphRevisionId, ClaimsPrincipal u, GraphService s, CancellationToken ct) => s.Map(id, graphRevisionId, u, true, ct));
        g.MapGet("/conversations/{id:guid}/messages/{messageId:guid}", (Guid id, Guid messageId, HttpContext context, ClaimsPrincipal u, GraphService s, CancellationToken ct) => {
            context.Response.Headers.Vary = "Accept";
            return s.Source(id, messageId, u, context.Request.GetTypedHeaders().Accept?.Any(x => x.MediaType.Value == "text/html") == true, ct);
        });
    }
}
