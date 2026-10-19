using System.Security.Claims;
using System.Text.Json;
using AITeacher.Api.Features.Catalog;
using AITeacher.Modules.Curriculum.Publishing;
using Microsoft.EntityFrameworkCore;

namespace AITeacher.Api.Features.Editorial;

public sealed class EditorialService(EditorialDbContext db, ITopicCatalog catalog, TimeProvider clock)
{
    internal static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    internal static string Actor(ClaimsPrincipal user) => user.FindFirstValue(ClaimTypes.NameIdentifier)!;
    internal static IResult Invalid(IEnumerable<string> errors) => Results.ValidationProblem(new Dictionary<string, string[]> { ["document"] = errors.ToArray() });
    internal static IResult Conflict() => Results.Problem(statusCode: 409, title: "Editorial unit has changed; reload before saving");

    public async Task<IResult> Create(CreateUnitRequest request, ClaimsPrincipal user, CancellationToken ct)
    {
        var errors = Validate(request.Document);
        if (errors.Count > 0) return Invalid(errors);
        if (!await catalog.ExistsAsync(request.TopicId, ct)) return Invalid(["Unknown topic reference."]);
        var unit = new EditorialUnit { TopicId = request.TopicId };
        var revision = NewRevision(unit, request.Document, Actor(user));
        db.Units.Add(unit);
        db.Revisions.Add(revision);
        await db.SaveChangesAsync(ct);
        return Results.Created($"/api/units/{unit.Id}", Response(unit, revision, true));
    }

    public async Task<IResult> Revise(Guid unitId, CreateRevisionRequest request, ClaimsPrincipal user, CancellationToken ct)
    {
        var errors = Validate(request.Document);
        if (errors.Count > 0) return Invalid(errors);
        var unit = await db.Units.SingleOrDefaultAsync(x => x.Id == unitId, ct);
        if (unit is null) return Results.NotFound();
        if (unit.Version != request.Version) return Conflict();
        unit.Version = checked(unit.Version + 1);
        unit.RevisionCount = checked(unit.RevisionCount + 1);
        var revision = NewRevision(unit, request.Document, Actor(user));
        db.Revisions.Add(revision);
        await db.SaveChangesAsync(ct);
        return Results.Created($"/api/units/{unit.Id}/revisions/{revision.Id}", Response(unit, revision, true));
    }

    public async Task<IResult> Get(Guid unitId, Guid? revisionId, ClaimsPrincipal user, CancellationToken ct)
    {
        var author = user.IsInRole("Author");
        // One SQL statement keeps visibility and snapshot consistent with unpublish/publish.
        var query = from unit in db.Units.AsNoTracking()
                    join revision in db.Revisions.AsNoTracking() on unit.Id equals revision.UnitId
                    where unit.Id == unitId && (author
                        ? (revisionId != null ? revision.Id == revisionId : revision.Number == unit.RevisionCount)
                        : revision.Id == unit.PublishedRevisionId)
                    select new { unit, revision };
        var found = await query.SingleOrDefaultAsync(ct);
        return found is null ? Results.NotFound() : Results.Ok(Response(found.unit, found.revision, author));
    }

    public async Task<IResult> List(int? offset, int? limit, Guid? topicId, ClaimsPrincipal user, CancellationToken ct)
    {
        var skip = offset ?? 0;
        var take = limit ?? 50;
        if (skip < 0 || take is < 1 or > 100) return Invalid(["Invalid pagination."]);
        var author = user.IsInRole("Author");
        var query = from unit in db.Units.AsNoTracking()
                    join revision in db.Revisions.AsNoTracking() on unit.Id equals revision.UnitId
                    where (topicId == null || unit.TopicId == topicId) &&
                        (author ? revision.Number == unit.RevisionCount : revision.Id == unit.PublishedRevisionId)
                    select new { unit.Id, unit.TopicId, unit.Version, unit.PublishedRevisionId, RevisionId = revision.Id, revision.Number, revision.DocumentJson };
        var total = await query.CountAsync(ct);
        var rows = await query.OrderBy(x => x.Id).Skip(skip).Take(take).ToListAsync(ct);
        return Results.Ok(new { items = rows.Select(x => new { x.Id, x.TopicId, x.Version, x.PublishedRevisionId, x.RevisionId, x.Number,
            Title = JsonSerializer.Deserialize<UnitDocument>(x.DocumentJson, Json)!.Title }), total, offset = skip, limit = take });
    }

    public async Task<IResult> History(Guid unitId, int? offset, int? limit, CancellationToken ct)
    {
        var skip = offset ?? 0;
        var take = limit ?? 50;
        if (skip < 0 || take is < 1 or > 100) return Invalid(["Invalid pagination."]);
        if (!await db.Units.AnyAsync(x => x.Id == unitId, ct)) return Results.NotFound();
        var query = from revision in db.Revisions.AsNoTracking()
                    join publication in db.Publications.AsNoTracking() on revision.Id equals publication.RevisionId into publications
                    from publication in publications.DefaultIfEmpty()
                    where revision.UnitId == unitId
                    select new { revision.Id, revision.Number, revision.CreatedAt, revision.CreatedBy, PublishedAt = publication == null ? (DateTimeOffset?)null : publication.PublishedAt };
        var total = await query.CountAsync(ct);
        var items = await query.OrderByDescending(x => x.Number).Skip(skip).Take(take).ToListAsync(ct);
        return Results.Ok(new { items, total, offset = skip, limit = take });
    }

    public async Task<IResult> Publish(Guid unitId, Guid revisionId, UnitVersionRequest request, ClaimsPrincipal user, CancellationToken ct)
    {
        var unit = await db.Units.SingleOrDefaultAsync(x => x.Id == unitId, ct);
        if (unit is null) return Results.NotFound();
        if (unit.Version != request.Version) return Conflict();
        var revision = await db.Revisions.AsNoTracking().SingleOrDefaultAsync(x => x.UnitId == unitId && x.Id == revisionId, ct);
        if (revision is null) return Results.NotFound();
        var document = JsonSerializer.Deserialize<UnitDocument>(revision.DocumentJson, Json)!;
        var errors = UnitDocumentValidation.Validate(document, publishing: true);
        if (errors.Count > 0) return Invalid(errors);
        if (!await catalog.ExistsAsync(unit.TopicId, ct)) return Invalid(["Unknown topic reference."]);
        unit.Version = checked(unit.Version + 1);
        unit.PublishedRevisionId = revisionId;
        if (!await db.Publications.AnyAsync(x => x.RevisionId == revisionId, ct))
            db.Publications.Add(new EditorialPublication { RevisionId = revisionId, PublishedAt = clock.GetUtcNow(), PublishedBy = Actor(user) });
        await db.SaveChangesAsync(ct);
        return Results.Ok(Response(unit, revision, true));
    }

    public async Task<IResult> Unpublish(Guid unitId, UnitVersionRequest request, CancellationToken ct)
    {
        var unit = await db.Units.SingleOrDefaultAsync(x => x.Id == unitId, ct);
        if (unit is null) return Results.NotFound();
        if (unit.Version != request.Version) return Conflict();
        unit.Version = checked(unit.Version + 1);
        unit.PublishedRevisionId = null;
        await db.SaveChangesAsync(ct);
        var revision = await db.Revisions.AsNoTracking().SingleAsync(x => x.UnitId == unitId && x.Number == unit.RevisionCount, ct);
        return Results.Ok(Response(unit, revision, true));
    }

    internal EditorialRevision NewRevision(EditorialUnit unit, UnitDocument document, string actor, string? origin = null) => new()
    {
        UnitId = unit.Id, Number = unit.RevisionCount, DocumentJson = JsonSerializer.Serialize(document, Json),
        CreatedAt = clock.GetUtcNow(), CreatedBy = actor, OriginJson = origin
    };

    private static IReadOnlyList<string> Validate(UnitDocument document)
    {
        var errors = UnitDocumentValidation.Validate(document);
        if (errors.Count > 0) return errors;
        return System.Text.Encoding.UTF8.GetByteCount(JsonSerializer.Serialize(document, Json)) > 2_000_000
            ? ["Document exceeds 2 MB."] : [];
    }

    private static object Response(EditorialUnit unit, EditorialRevision revision, bool author)
    {
        var document = JsonSerializer.Deserialize<UnitDocument>(revision.DocumentJson, Json)!;
        object visible = author ? document : new { document.Title, document.Concepts, document.Objectives,
            document.Readings, document.Exercises, document.Prerequisites };
        return new { unit.Id, unit.TopicId, unit.Version, unit.PublishedRevisionId,
            revision = new { revision.Id, revision.Number, revision.CreatedAt, revision.CreatedBy,
                origin = author && revision.OriginJson is not null ? JsonSerializer.Deserialize<JsonElement>(revision.OriginJson) : (JsonElement?)null,
                document = visible } };
    }
}
