using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using AITeacher.Api.Features.Catalog;
using AITeacher.Modules.Curriculum.Catalog;
using AITeacher.Modules.Curriculum.Publishing;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

namespace AITeacher.Api.Features.Editorial;

public sealed record SourceEntry(string Slug, string Name, string? Subject = null);
public sealed record SourceTopic(string Slug, string Name, string Subject, string Category, string[] Prerequisites);
public sealed record SourceCurriculum(int SchemaVersion, string Source, SourceEntry[] Subjects, SourceEntry[] Categories,
    SourceEntry[] Levels, SourceTopic[] Topics, CorpusRecord[] Records)
{
    public static SourceCurriculum Load()
    {
        using var stream = typeof(SourceCurriculum).Assembly.GetManifestResourceStream(
            "AITeacher.Api.Features.Editorial.source-curriculum.json")!;
        return JsonSerializer.Deserialize<SourceCurriculum>(stream, EditorialService.Json)!;
    }
}

// Administrative command, never an HTTP authentication bypass. Uses the same import,
// validation, immutable revisions, publication and optimistic concurrency services.
public sealed class CurriculumMigration(CatalogDbContext catalog, EditorialDbContext content,
    CorpusImporter importer, EditorialService editorial)
{
    private static readonly ClaimsPrincipal Actor = new(new ClaimsIdentity([
        new Claim(ClaimTypes.NameIdentifier, "curriculum-migration-v1"), new Claim(ClaimTypes.Role, "Author")], "administrative-command"));

    public async Task<object> Run(string mode, CancellationToken ct)
    {
        if (mode is not ("inspect" or "apply" or "reconcile")) throw new InvalidDataException("Unknown curriculum operation.");
        var source = SourceCurriculum.Load();
        // A single connection/transaction spans both owned schemas. Never touch learner schemas.
        content.Database.SetDbConnection(catalog.Database.GetDbConnection());
        await using var transaction = await catalog.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, ct);
        await content.Database.UseTransactionAsync(transaction.GetDbTransaction(), ct);
        var before = new { subjects = await catalog.Subjects.CountAsync(ct), categories = await catalog.Categories.CountAsync(ct),
            scales = await catalog.Scales.CountAsync(ct), levels = await catalog.Levels.CountAsync(ct), topics = await catalog.Topics.CountAsync(ct),
            units = await content.Units.CountAsync(ct), published = await content.Units.CountAsync(x => x.PublishedRevisionId != null, ct) };
        var conflicts = new List<string>();
        var createdCatalog = 0;
        var subjects = new Dictionary<string, Guid>();
        var categories = new Dictionary<string, Guid>();
        var mappings = new Dictionary<string, Guid>();
        var rows = await catalog.Subjects.ToListAsync(ct);
        foreach (var (item, index) in source.Subjects.Select((x, i) => (x, i)))
        {
            var row = rows.SingleOrDefault(x => x.Slug == item.Slug);
            if (row is null) { row = new Subject { Name = item.Name, Slug = item.Slug, SortOrder = index }; catalog.Subjects.Add(row); createdCatalog++; }
            else Check(row, item.Name);
            subjects[item.Slug] = row.Id;
        }
        var categoryRows = await catalog.Categories.ToListAsync(ct);
        foreach (var (item, index) in source.Categories.Select((x, i) => (x, i)))
        {
            var parent = subjects[item.Subject!];
            var row = categoryRows.SingleOrDefault(x => x.Slug == item.Slug && x.SubjectId == parent);
            if (row is null) { row = new Category { Name = item.Name, Slug = item.Slug, SubjectId = parent, SortOrder = index }; catalog.Categories.Add(row); createdCatalog++; }
            else Check(row, item.Name);
            categories[item.Subject + "/" + item.Slug] = row.Id;
        }
        const string scaleSlug = "legacy-reading-difficulty";
        const string scaleName = "Nivel de lectura del catálogo original";
        var scale = await catalog.Scales.SingleOrDefaultAsync(x => x.Slug == scaleSlug, ct);
        if (scale is null) { scale = new LevelScale { Name = scaleName, Slug = scaleSlug, Purpose = "difficulty" }; catalog.Scales.Add(scale); createdCatalog++; }
        else { Check(scale, scaleName); if (scale.Purpose != "difficulty") conflicts.Add("Scale purpose: " + scale.Id); }
        var levelRows = await catalog.Levels.ToListAsync(ct);
        foreach (var (item, index) in source.Levels.Select((x, i) => (x, i)))
        {
            var row = levelRows.SingleOrDefault(x => x.ScaleId == scale.Id && x.Slug == item.Slug);
            if (row is null) { catalog.Levels.Add(new Level { ScaleId = scale.Id, Slug = item.Slug, Name = item.Name, SortOrder = index }); createdCatalog++; }
            else Check(row, item.Name);
        }
        var topicRows = await catalog.Topics.ToListAsync(ct);
        foreach (var (item, index) in source.Topics.Select((x, i) => (x, i)))
        {
            var parent = categories[item.Subject + "/" + item.Category];
            var sameSlug = topicRows.Where(x => x.Slug == item.Slug).ToArray();
            var row = sameSlug.SingleOrDefault(x => x.CategoryId == parent);
            if (sameSlug.Any(x => x.CategoryId != parent)) conflicts.Add("Topic slug has another parent: " + item.Slug);
            if (row is null) { row = new Topic { SubjectId = subjects[item.Subject], CategoryId = parent, Name = item.Name, Slug = item.Slug, SortOrder = index }; catalog.Topics.Add(row); createdCatalog++; }
            else { Check(row, item.Name); if (row.LevelId != null) conflicts.Add("Topic has a single editorial level: " + row.Id); }
            mappings[item.Slug] = row.Id;
        }
        var keys = source.Records.Select(x => "learning-content-v1:" + x.Id).ToArray();
        var units = await content.Units.Where(x => keys.Contains(x.ImportKey!)).ToListAsync(ct);
        var ids = units.Select(x => x.Id).ToArray();
        var revisions = await content.Revisions.AsNoTracking().Where(x => ids.Contains(x.UnitId)).ToListAsync(ct);
        var pending = 0;
        foreach (var record in source.Records)
        {
            var unit = units.SingleOrDefault(x => x.ImportKey == "learning-content-v1:" + record.Id);
            if (unit is null) { pending++; continue; }
            var origin = JsonSerializer.Serialize(record, EditorialService.Json);
            var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(mappings[record.Topic].ToString("D") + "\n" + origin)));
            var revision = revisions.Single(x => x.UnitId == unit.Id && x.Number == unit.RevisionCount);
            var document = JsonSerializer.Deserialize<UnitDocument>(revision.DocumentJson, EditorialService.Json)!;
            var originalRevision = revisions.Single(x => x.UnitId == unit.Id && x.Number == 1);
            if (unit.Version != unit.RevisionCount + (unit.PublishedRevisionId != null ? 1 : 0) ||
                unit.TopicId != mappings[record.Topic] || unit.ImportHash != hash ||
                originalRevision.OriginJson is null || !JsonElement.DeepEquals(JsonSerializer.Deserialize<JsonElement>(origin), JsonSerializer.Deserialize<JsonElement>(originalRevision.OriginJson)) ||
                !Matches(document, record) || !(unit.RevisionCount == 1 || (unit.RevisionCount == 2 && revision.CreatedBy == "curriculum-migration-v1" && document.Kind == "reading")) ||
                (unit.PublishedRevisionId != null && unit.PublishedRevisionId != revision.Id))
                conflicts.Add("Imported content requires editorial reconciliation: " + record.Id);
            if (unit.PublishedRevisionId == null) pending++;
        }
        if (mode == "apply" && conflicts.Count == 0)
        {
            await catalog.SaveChangesAsync(ct);
            RequireSuccess(await importer.Import(new(source.Records, mappings), Actor, ct));
            units = await content.Units.Where(x => keys.Contains(x.ImportKey!)).ToListAsync(ct);
            foreach (var unit in units)
            {
                var revision = await content.Revisions.AsNoTracking().SingleAsync(x => x.UnitId == unit.Id && x.Number == unit.RevisionCount, ct);
                if (unit.PublishedRevisionId == revision.Id) continue;
                var document = JsonSerializer.Deserialize<UnitDocument>(revision.DocumentJson, EditorialService.Json)!;
                // Old importer drafts need an explicit immutable revision to become reading material.
                if (document.Kind != "reading")
                {
                    var record = source.Records.Single(x => "learning-content-v1:" + x.Id == unit.ImportKey);
                    RequireSuccess(await editorial.Revise(unit.Id, new(unit.Version, document with {
                        Kind = "reading", ReadingProvenance = new(record.Id, record.Topic, record.Level, record.Keywords) }), Actor, ct));
                    revision = await content.Revisions.AsNoTracking().SingleAsync(x => x.UnitId == unit.Id && x.Number == unit.RevisionCount, ct);
                }
                RequireSuccess(await editorial.Publish(unit.Id, revision.Id, new(unit.Version), Actor, ct));
            }
            await transaction.CommitAsync(ct);
        }
        var published = units.Count(x => x.PublishedRevisionId != null);
        var report = new { mode, source = source.Source, sourceReadings = source.Records.Length, sourceTopics = source.Topics.Length,
            before, catalogEntriesToCreate = createdCatalog, readingsToImportOrPublish = pending,
            imported = units.Count, published, conflicts, matches = conflicts.Count == 0 && units.Count == source.Records.Length &&
                published == source.Records.Length && (mode == "apply" || createdCatalog == 0),
            items = source.Records.Select(r => new { sourceId = r.Id, topicId = mappings[r.Topic],
                unitId = units.SingleOrDefault(x => x.ImportKey == "learning-content-v1:" + r.Id)?.Id }),
            prerequisiteEdges = source.Topics.Sum(x => x.Prerequisites.Length) };
        return report;

        void Check(ICatalogEntry row, string name)
        {
            if (row.Name != name || !row.IsAvailable) conflicts.Add("Catalog conflict (preserved): " + row.Id + " / " + row.Slug);
        }
    }

    private static bool Matches(UnitDocument d, CorpusRecord r) => d.Title == r.Title && d.Readings.Length == 1 &&
        d.Readings[0].Title == r.Title && d.Readings[0].Text == r.Text && d.Readings[0].Source == r.Source &&
        d.Readings[0].ObjectiveIds.Length == 0 && d.Objectives.Length == 0 && d.Concepts.Length == 0 &&
        d.Exercises.Length == 0 && d.Assessments.Length == 0 && d.Prerequisites.Length == 0 &&
        (d.Kind == "learningUnit" || (d.Kind == "reading" && d.ReadingProvenance is { } p &&
            p.SourceId == r.Id && p.Topic == r.Topic && p.Level == r.Level && p.Keywords.SequenceEqual(r.Keywords)));

    private static void RequireSuccess(IResult result)
    {
        if (result is not IStatusCodeHttpResult { StatusCode: >= 200 and < 300 })
            throw new InvalidDataException("Curriculum service rejected migration; transaction rolled back.");
    }
}
