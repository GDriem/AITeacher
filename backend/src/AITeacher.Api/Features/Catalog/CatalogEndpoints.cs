using System.ComponentModel.DataAnnotations;
using AITeacher.Modules.Curriculum.Catalog;
using Microsoft.EntityFrameworkCore;

namespace AITeacher.Api.Features.Catalog;

public record EntryRequest(
    [property: Required, StringLength(150), RegularExpression(@".*\S.*")] string Name,
    [property: Required, StringLength(80), RegularExpression("^[a-z0-9]+(-[a-z0-9]+)*$")] string Slug,
    [property: Range(0, int.MaxValue)] int SortOrder = 0, bool IsAvailable = true);
public sealed record CategoryRequest(Guid SubjectId, [property: Required] EntryRequest Entry);
public sealed record ScaleRequest([property: Required, RegularExpression("^(difficulty|proficiency|mastery)$")] string Purpose, [property: Required] EntryRequest Entry);
public sealed record LevelRequest(Guid ScaleId, [property: Required] EntryRequest Entry);
public sealed record TopicRequest(Guid SubjectId, Guid CategoryId, Guid? LevelId, [property: Required] EntryRequest Entry);
public sealed record UpdateEntryRequest([property: Range(1, long.MaxValue)] long Version, [property: Required] EntryRequest Entry);
public sealed record EntryResponse(Guid Id, string Name, string Slug, int SortOrder, bool IsAvailable, long Version,
    Guid? SubjectId = null, Guid? CategoryId = null, Guid? ScaleId = null, Guid? LevelId = null, string? Purpose = null);

public static class CatalogEndpoints
{
    public static void MapCatalog(this WebApplication app)
    {
        var group = app.MapGroup("/api/catalog").RequireAuthorization();
        MapReadAndUpdate<Subject>(group, "subjects");
        MapReadAndUpdate<Category>(group, "categories");
        MapReadAndUpdate<LevelScale>(group, "scales");
        MapReadAndUpdate<Level>(group, "levels");
        MapReadAndUpdate<Topic>(group, "topics");
        group.MapPost("/subjects", (EntryRequest request, CatalogDbContext db, CancellationToken ct) =>
            Create(new Subject(), request, "subjects", db, ct)).RequireAuthorization("Author");
        group.MapPost("/categories", async (CategoryRequest request, CatalogDbContext db, CancellationToken ct) =>
        {
            if (!await db.Subjects.AnyAsync(x => x.Id == request.SubjectId, ct)) return InvalidParent();
            return await Create(new Category { SubjectId = request.SubjectId }, request.Entry, "categories", db, ct);
        }).RequireAuthorization("Author");
        group.MapPost("/scales", (ScaleRequest request, CatalogDbContext db, CancellationToken ct) =>
            Create(new LevelScale { Purpose = request.Purpose }, request.Entry, "scales", db, ct)).RequireAuthorization("Author");
        group.MapPost("/levels", async (LevelRequest request, CatalogDbContext db, CancellationToken ct) =>
        {
            if (!await db.Scales.AnyAsync(x => x.Id == request.ScaleId, ct)) return InvalidParent();
            return await Create(new Level { ScaleId = request.ScaleId }, request.Entry, "levels", db, ct);
        }).RequireAuthorization("Author");
        group.MapPost("/topics", async (TopicRequest request, CatalogDbContext db, CancellationToken ct) =>
        {
            if (!await db.Categories.AnyAsync(x => x.Id == request.CategoryId && x.SubjectId == request.SubjectId, ct) ||
                (request.LevelId is { } levelId && !await db.Levels.AnyAsync(x => x.Id == levelId, ct))) return InvalidParent();
            return await Create(new Topic { SubjectId = request.SubjectId, CategoryId = request.CategoryId, LevelId = request.LevelId },
                request.Entry, "topics", db, ct);
        }).RequireAuthorization("Author");
    }

    private static IResult InvalidParent() => Results.Problem(statusCode: 400, title: "Invalid catalog parent reference");

    private static void MapReadAndUpdate<T>(RouteGroupBuilder group, string resource) where T : class, ICatalogEntry
    {
        group.MapGet($"/{resource}", async (int? offset, int? limit, CatalogDbContext db, CancellationToken ct) =>
        {
            var skip = offset ?? 0;
            var take = limit ?? 50;
            if (skip < 0 || take is < 1 or > 100) return Results.Problem(statusCode: 400, title: "Invalid pagination");
            var query = db.Set<T>().AsNoTracking();
            var total = await query.CountAsync(ct);
            var items = await query.OrderBy(x => x.SortOrder).ThenBy(x => x.Id).Skip(skip).Take(take).ToListAsync(ct);
            return Results.Ok(new { items = items.Select(ToResponse), total, offset = skip, limit = take });
        });
        group.MapGet($"/{resource}/{{id:guid}}", async (Guid id, CatalogDbContext db, CancellationToken ct) =>
        {
            var entity = await db.Set<T>().AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct);
            return entity is null ? Results.NotFound() : Results.Ok(ToResponse(entity));
        });
        group.MapPut($"/{resource}/{{id:guid}}", async (Guid id, UpdateEntryRequest request, CatalogDbContext db, CancellationToken ct) =>
        {
            var entity = await db.Set<T>().SingleOrDefaultAsync(x => x.Id == id, ct);
            if (entity is null) return Results.NotFound();
            if (entity.Version != request.Version) return Results.Problem(statusCode: 409, title: "Catalog entry has changed; reload before saving");
            Apply(entity, request.Entry);
            entity.Version = checked(entity.Version + 1);
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToResponse(entity));
        }).RequireAuthorization("Author");
    }

    private static async Task<IResult> Create<T>(T entity, EntryRequest request, string resource,
        CatalogDbContext db, CancellationToken ct) where T : class, ICatalogEntry
    {
        Apply(entity, request);
        db.Set<T>().Add(entity);
        await db.SaveChangesAsync(ct);
        return Results.Created($"/api/catalog/{resource}/{entity.Id}", ToResponse(entity));
    }

    private static void Apply(ICatalogEntry entity, EntryRequest request)
    {
        entity.Name = request.Name.Trim();
        entity.Slug = request.Slug;
        entity.SortOrder = request.SortOrder;
        entity.IsAvailable = request.IsAvailable;
    }

    private static EntryResponse ToResponse(ICatalogEntry x) => new(x.Id, x.Name, x.Slug, x.SortOrder, x.IsAvailable, x.Version,
        x switch { Category c => c.SubjectId, Topic t => t.SubjectId, _ => null },
        x is Topic topic ? topic.CategoryId : null, x is Level level ? level.ScaleId : null,
        x is Topic t2 ? t2.LevelId : null, x is LevelScale scale ? scale.Purpose : null);
}
