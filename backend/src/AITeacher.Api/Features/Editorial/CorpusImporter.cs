using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using AITeacher.Api.Features.Catalog;
using AITeacher.Modules.Curriculum.Publishing;
using Microsoft.EntityFrameworkCore;

namespace AITeacher.Api.Features.Editorial;

public sealed record CorpusRecord(string Id, string Topic, string Title, string Level, string Text, string Source, string[] Keywords);
public sealed record ImportCorpusRequest(CorpusRecord[] Records, Dictionary<string, Guid> TopicMappings);

public sealed class CorpusImporter(EditorialDbContext db, EditorialService editorial, ITopicCatalog catalog)
{
    public async Task<IResult> Import(ImportCorpusRequest request, ClaimsPrincipal user, CancellationToken ct)
    {
        if (request.Records is not { Length: > 0 and <= 500 } || request.TopicMappings is null ||
            request.Records.Any(x => x is null || !Text(x.Id, 150) || !Text(x.Topic, 150) || !Text(x.Title, 150) ||
                !Text(x.Level, 80) || !Text(x.Text, 100000) || !Text(x.Source, 1000) ||
                x.Keywords is not { Length: <= 200 } || x.Keywords.Any(k => !Text(k, 150))))
            return EditorialService.Invalid(["Invalid corpus; provide 1–500 records with all source fields."]);
        if (request.Records.Select(x => x.Id).Distinct(StringComparer.Ordinal).Count() != request.Records.Length)
            return EditorialService.Invalid(["Duplicate source IDs in import batch."]);
        foreach (var topic in request.Records.Select(x => x.Topic).Distinct(StringComparer.Ordinal))
            if (!request.TopicMappings.TryGetValue(topic, out var id) || !await catalog.ExistsAsync(id, ct))
                return EditorialService.Invalid([$"Missing or invalid topic mapping for {topic}."]);
        // All writes are committed in one SaveChanges transaction. A concurrent duplicate yields 409,
        // and retrying the same batch then skips already imported records.
        var keys = request.Records.Select(x => Key(x.Id)).ToArray();
        var existing = await db.Units.AsNoTracking().Where(x => keys.Contains(x.ImportKey!)).ToDictionaryAsync(x => x.ImportKey!, ct);
        var created = 0;
        var skipped = 0;
        var items = new List<object>();
        foreach (var record in request.Records)
        {
            var topicId = request.TopicMappings[record.Topic];
            var origin = JsonSerializer.Serialize(record, EditorialService.Json);
            var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(topicId.ToString("D") + "\n" + origin)));
            if (existing.TryGetValue(Key(record.Id), out var found))
            {
                if (found.ImportHash != hash) return Results.Problem(statusCode: 409,
                    title: "Imported source has changed; reconcile it through editorial revisions", detail: record.Id);
                skipped++;
                items.Add(new { sourceId = record.Id, unitId = found.Id });
                continue;
            }
            var unit = new EditorialUnit { TopicId = topicId, ImportKey = Key(record.Id), ImportHash = hash };
            var document = new UnitDocument(record.Title, [], [],
                [new UnitReading(Guid.NewGuid(), record.Title, record.Text, record.Source, [])], [], [], []);
            db.Units.Add(unit);
            db.Revisions.Add(editorial.NewRevision(unit, document, EditorialService.Actor(user), origin));
            items.Add(new { sourceId = record.Id, unitId = unit.Id });
            created++;
        }
        await db.SaveChangesAsync(ct);
        return Results.Ok(new { created, skipped, items });
    }

    private static string Key(string id) => "learning-content-v1:" + id;
    private static bool Text(string? value, int max) => !string.IsNullOrWhiteSpace(value) && value.Length <= max;
}
