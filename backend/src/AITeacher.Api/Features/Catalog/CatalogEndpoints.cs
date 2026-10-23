using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
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
public sealed record TopicRequest(Guid SubjectId, Guid CategoryId, Guid? LevelId, [property: Required] EntryRequest Entry,
    [property: StringLength(CatalogEndpoints.DescriptionMaxLength)] string? Description = null);
public sealed record UpdateEntryRequest([property: Range(1, long.MaxValue)] long Version, [property: Required] EntryRequest Entry);
// PUT distingue el campo ausente de null: si falta, se conserva la descripción guardada (clientes
// que no la conocen no la borran); con null o texto en blanco, se borra.
public sealed record UpdateTopicRequest([property: Range(1, long.MaxValue)] long Version, [property: Required] EntryRequest Entry)
{
    private readonly string? description;

    // System.Text.Json sólo invoca el init cuando la propiedad viene en el cuerpo, incluso con null.
    [StringLength(CatalogEndpoints.DescriptionMaxLength)]
    public string? Description { get => description; init { description = value; HasDescription = true; } }

    [JsonIgnore] public bool HasDescription { get; private init; }
}
public sealed record EntryResponse(Guid Id, string Name, string Slug, int SortOrder, bool IsAvailable, long Version,
    Guid? SubjectId = null, Guid? CategoryId = null, Guid? ScaleId = null, Guid? LevelId = null, string? Purpose = null,
    string? Description = null);

public static class CatalogEndpoints
{
    public const int DescriptionMaxLength = 600;

    public static void MapCatalog(this WebApplication app)
    {
        var group = app.MapGroup("/api/catalog").RequireAuthorization();
        group.MapGet("/source-curriculum", () =>
        {
            var source = AITeacher.Api.Features.Editorial.SourceCurriculum.Load();
            return Results.Ok(new { source.Source, source.Topics, source.Levels });
        });
        MapReadAndUpdate<Subject>(group, "subjects");
        MapReadAndUpdate<Category>(group, "categories");
        MapReadAndUpdate<LevelScale>(group, "scales");
        MapReadAndUpdate<Level>(group, "levels");
        MapRead<Topic>(group, "topics");
        group.MapPut("/topics/{id:guid}", (Guid id, UpdateTopicRequest request, CatalogDbContext db, CancellationToken ct) =>
            Update<Topic>(id, request.Version, db, topic =>
            {
                Apply(topic, request.Entry);
                if (request.HasDescription) topic.Description = Normalize(request.Description);
            }, ct))
            .RequireAuthorization("Author");
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
            return await Create(new Topic { SubjectId = request.SubjectId, CategoryId = request.CategoryId, LevelId = request.LevelId,
                Description = Normalize(request.Description) }, request.Entry, "topics", db, ct);
        }).RequireAuthorization("Author");
    }

    private static IResult InvalidParent() => Results.Problem(statusCode: 400, title: "Invalid catalog parent reference");

    private static void MapReadAndUpdate<T>(RouteGroupBuilder group, string resource) where T : class, ICatalogEntry
    {
        MapRead<T>(group, resource);
        group.MapPut($"/{resource}/{{id:guid}}", (Guid id, UpdateEntryRequest request, CatalogDbContext db, CancellationToken ct) =>
            Update<T>(id, request.Version, db, entity => Apply(entity, request.Entry), ct)).RequireAuthorization("Author");
    }

    private static void MapRead<T>(RouteGroupBuilder group, string resource) where T : class, ICatalogEntry
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
    }

    private static async Task<IResult> Update<T>(Guid id, long version, CatalogDbContext db, Action<T> apply, CancellationToken ct)
        where T : class, ICatalogEntry
    {
        var entity = await db.Set<T>().SingleOrDefaultAsync(x => x.Id == id, ct);
        if (entity is null) return Results.NotFound();
        if (entity.Version != version) return Results.Problem(statusCode: 409, title: "Catalog entry has changed; reload before saving");
        apply(entity);
        entity.Version = checked(entity.Version + 1);
        await db.SaveChangesAsync(ct);
        return Results.Ok(ToResponse(entity));
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

    private static string? Normalize(string? description) => string.IsNullOrWhiteSpace(description) ? null : description.Trim();

    private static EntryResponse ToResponse(ICatalogEntry x) => new(x.Id, x.Name, x.Slug, x.SortOrder, x.IsAvailable, x.Version,
        x switch { Category c => c.SubjectId, Topic t => t.SubjectId, _ => null },
        x is Topic topic ? topic.CategoryId : null, x is Level level ? level.ScaleId : null,
        x is Topic t2 ? t2.LevelId : null, x is LevelScale scale ? scale.Purpose : null, (x as Topic)?.Description);
}
