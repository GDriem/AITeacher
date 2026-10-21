using System.Security.Claims;

namespace AITeacher.Api.Features.Tutor;

public static class TutorEndpoints
{
    public static void MapTutor(this WebApplication app)
    {
        var group = app.MapGroup("/api/tutor").RequireAuthorization();
        group.AddEndpointFilter(async (context, next) =>
        {
            context.HttpContext.Response.Headers.CacheControl = "no-store";
            return await next(context);
        });
        group.MapGet("/availability", (TutorProviders providers) =>
        {
            try { _ = providers.Select("Tutor"); return Results.Ok(new { enabled = true }); }
            catch (TutorUnavailableException) { return Results.Ok(new { enabled = false }); }
        });
        group.MapPost("/conversations", (CreateConversationRequest r, ClaimsPrincipal u, TutorService s, CancellationToken ct) => s.Create(r, u, ct));
        group.MapGet("/conversations", (int? offset, int? limit, ClaimsPrincipal u, TutorService s, CancellationToken ct) => s.List(offset ?? 0, limit ?? 50, u, ct));
        group.MapGet("/conversations/{id:guid}", (Guid id, ClaimsPrincipal u, TutorService s, CancellationToken ct) => s.Get(id, u, ct));
        group.MapGet("/conversations/{id:guid}/messages", (Guid id, int? offset, int? limit, ClaimsPrincipal u, TutorService s, CancellationToken ct) => s.Messages(id, offset ?? 0, limit ?? 50, u, ct));
        group.MapPost("/conversations/{id:guid}/turns", (Guid id, CreateTurnRequest r, ClaimsPrincipal u, TutorService s, CancellationToken ct) => s.Turn(id, r, u, ct));
        group.MapPost("/notes", (CreateNoteRequest r, ClaimsPrincipal u, TutorService s, CancellationToken ct) => s.CreateNote(r, u, ct));
        group.MapGet("/notes", (int? offset, int? limit, ClaimsPrincipal u, TutorService s, CancellationToken ct) => s.Notes(offset ?? 0, limit ?? 50, u, ct));
        group.MapGet("/notes/{id:guid}", (Guid id, ClaimsPrincipal u, TutorService s, CancellationToken ct) => s.GetNote(id, u, ct));
        group.MapPut("/notes/{id:guid}", (Guid id, UpdateNoteRequest r, ClaimsPrincipal u, TutorService s, CancellationToken ct) => s.EditNote(id, r, u, ct));
        group.MapDelete("/notes/{id:guid}", (Guid id, long version, ClaimsPrincipal u, TutorService s, CancellationToken ct) => s.DeleteNote(id, version, u, ct));
    }
}
