using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using AITeacher.Modules.Curriculum.Publishing;

namespace AITeacher.Api.Features.Editorial;

public sealed record CreateUnitRequest(Guid TopicId, [property: Required] UnitDocument Document);
public sealed record CreateRevisionRequest([property: Range(1, long.MaxValue)] long Version, [property: Required] UnitDocument Document);
public sealed record UnitVersionRequest([property: Range(1, long.MaxValue)] long Version);

public static class EditorialEndpoints
{
    public static void MapEditorial(this WebApplication app)
    {
        var group = app.MapGroup("/api/units").RequireAuthorization();
        group.MapGet("", (int? offset, int? limit, Guid? topicId, ClaimsPrincipal user, EditorialService service, CancellationToken ct) =>
            service.List(offset, limit, topicId, user, ct));
        group.MapGet("/{unitId:guid}", (Guid unitId, ClaimsPrincipal user, EditorialService service, CancellationToken ct) =>
            service.Get(unitId, null, user, ct));
        group.MapPost("", (CreateUnitRequest request, ClaimsPrincipal user, EditorialService service, CancellationToken ct) =>
            service.Create(request, user, ct)).RequireAuthorization("Author");
        group.MapPost("/{unitId:guid}/revisions", (Guid unitId, CreateRevisionRequest request, ClaimsPrincipal user, EditorialService service, CancellationToken ct) =>
            service.Revise(unitId, request, user, ct)).RequireAuthorization("Author");
        group.MapGet("/{unitId:guid}/revisions", (Guid unitId, int? offset, int? limit, EditorialService service, CancellationToken ct) =>
            service.History(unitId, offset, limit, ct)).RequireAuthorization("Author");
        group.MapGet("/{unitId:guid}/revisions/{revisionId:guid}", (Guid unitId, Guid revisionId, ClaimsPrincipal user, EditorialService service, CancellationToken ct) =>
            service.Get(unitId, revisionId, user, ct)).RequireAuthorization("Author");
        group.MapPost("/{unitId:guid}/revisions/{revisionId:guid}/publish", (Guid unitId, Guid revisionId, UnitVersionRequest request, ClaimsPrincipal user, EditorialService service, CancellationToken ct) =>
            service.Publish(unitId, revisionId, request, user, ct)).RequireAuthorization("Author");
        group.MapPost("/{unitId:guid}/unpublish", (Guid unitId, UnitVersionRequest request, EditorialService service, CancellationToken ct) =>
            service.Unpublish(unitId, request, ct)).RequireAuthorization("Author");
        group.MapPost("/import", (ImportCorpusRequest request, ClaimsPrincipal user, CorpusImporter importer, CancellationToken ct) =>
            importer.Import(request, user, ct)).RequireAuthorization("Author");
    }
}
