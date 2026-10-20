using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;

namespace AITeacher.Api.Features.History;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record HistorySnapshot(int SchemaVersion, Guid BatchId, string Source, HistoryInput[] Documents);
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record HistoryInput(string Kind, string Id, string StudentId, JsonElement Payload);
public sealed record HistoryCounts(int Documents, int Conversations, int Messages, int Progress, int Assessments);
public sealed record HistoryReconciliation(Guid BatchId, bool Matches, HistoryCounts Expected, HistoryCounts Actual);

public sealed class HistoryMigration(HistoryDbContext db, TimeProvider clock)
{
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    public static string Hash(JsonElement value)
    {
        using var stream = new MemoryStream();
        using (var writer = new Utf8JsonWriter(stream)) WriteCanonical(writer, value);
        return Convert.ToHexStringLower(SHA256.HashData(stream.ToArray()));
    }
    private static void WriteCanonical(Utf8JsonWriter writer, JsonElement value)
    {
        if (value.ValueKind == JsonValueKind.Object)
        {
            writer.WriteStartObject();
            var names = new HashSet<string>(StringComparer.Ordinal);
            foreach (var p in value.EnumerateObject().OrderBy(x => x.Name, StringComparer.Ordinal))
            {
                if (!names.Add(p.Name)) throw new InvalidDataException("Duplicate JSON property.");
                writer.WritePropertyName(p.Name); WriteCanonical(writer, p.Value);
            }
            writer.WriteEndObject();
        }
        else if (value.ValueKind == JsonValueKind.Array)
        {
            writer.WriteStartArray();
            foreach (var item in value.EnumerateArray()) WriteCanonical(writer, item);
            writer.WriteEndArray();
        }
        else if (value.ValueKind == JsonValueKind.Number)
            writer.WriteNumberValue(value.GetDecimal());
        else value.WriteTo(writer);
    }
    public static void Validate(HistorySnapshot snapshot)
    {
        if (snapshot.SchemaVersion != 1 || snapshot.BatchId == Guid.Empty || !Text(snapshot.Source, 120) ||
            snapshot.Documents is null || snapshot.Documents.Length is < 1 or > 100000)
            throw new InvalidDataException("Invalid snapshot header or document count.");
        var keys = new HashSet<(string, string)>();
        foreach (var d in snapshot.Documents)
        {
            if (d is null || d.Kind is not ("conversation" or "progress") || !Text(d.Id, 200) || !Text(d.StudentId, 100) ||
                !keys.Add((d.Kind, d.Id)) || d.Payload.ValueKind != JsonValueKind.Object ||
                RequiredText(d.Payload, "student_id", 100) != d.StudentId)
                throw new InvalidDataException("Invalid document identity or duplicate source ID.");
            _ = Hash(d.Payload);
            if (d.Kind == "conversation")
            {
                if (RequiredText(d.Payload, "id", 200) != d.Id) throw new InvalidDataException("Conversation ID mismatch.");
                _ = RequiredText(d.Payload, "title", 100);
                var messages = Array(d.Payload, "messages");
                var ids = new HashSet<string>();
                foreach (var m in messages.EnumerateArray())
                {
                    if (!ids.Add(RequiredText(m, "id", 200)) || RequiredText(m, "role", 20) is not ("user" or "assistant"))
                        throw new InvalidDataException("Invalid or duplicate message.");
                    _ = RequiredText(m, "content", 12000);
                }
                if (d.Payload.TryGetProperty("pending_evaluation", out var pending) &&
                    RequiredText(pending, "student_id", 100) != d.StudentId)
                    throw new InvalidDataException("Pending activity owner mismatch.");
            }
            else
            {
                if (d.Id != d.StudentId) throw new InvalidDataException("Progress ID mismatch.");
                foreach (var a in Array(d.Payload, "assessments").EnumerateArray())
                {
                    if (!a.TryGetProperty("score", out var score) || !score.TryGetDecimal(out var number) || number is < 0 or > 100)
                        throw new InvalidDataException("Invalid historical score.");
                }
            }
        }
    }
    private static bool Text(string? s, int max) => !string.IsNullOrWhiteSpace(s) && s.Length <= max && s == s.Trim();
    private static string RequiredText(JsonElement p, string key, int max) =>
        p.TryGetProperty(key, out var v) && v.ValueKind == JsonValueKind.String && Text(v.GetString(), max)
            ? v.GetString()! : throw new InvalidDataException("Missing or invalid historical field.");
    private static JsonElement Array(JsonElement p, string key) =>
        p.TryGetProperty(key, out var v) && v.ValueKind == JsonValueKind.Array ? v
            : throw new InvalidDataException("Missing historical array.");
    private static string SnapshotHash(HistorySnapshot s) => Hash(JsonSerializer.SerializeToElement(s with
    {
        Documents = s.Documents.OrderBy(x => x.Kind, StringComparer.Ordinal).ThenBy(x => x.Id, StringComparer.Ordinal).ToArray()
    }, Json));
    private static HistoryCounts Counts(IEnumerable<HistoryInput> docs)
    {
        var all = docs.ToArray();
        return new(all.Length, all.Count(x => x.Kind == "conversation"),
            all.Where(x => x.Kind == "conversation").Sum(x => Array(x.Payload, "messages").GetArrayLength()),
            all.Count(x => x.Kind == "progress"),
            all.Where(x => x.Kind == "progress").Sum(x => Array(x.Payload, "assessments").GetArrayLength()));
    }
    // The same transaction-scoped lock serializes import, reconciliation and rollback.
    private Task Lock(CancellationToken ct) => db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(71420931)", ct);
    public async Task<HistoryReconciliation> Import(HistorySnapshot snapshot, CancellationToken ct)
    {
        Validate(snapshot);
        var hash = SnapshotHash(snapshot);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await Lock(ct);
        var existing = await db.Batches.SingleOrDefaultAsync(x => x.Id == snapshot.BatchId, ct);
        if (existing is not null)
        {
            if (existing.State != "active" || existing.Hash != hash) throw new InvalidDataException("Batch already exists with different content or was rolled back.");
            var replay = await Compare(snapshot, ct);
            if (!replay.Matches) throw new InvalidDataException("Stored batch failed reconciliation.");
            await tx.CommitAsync(ct);
            return replay;
        }
        var occupied = (await db.Documents.AsNoTracking().Where(x => x.Source == snapshot.Source)
            .Select(x => new { x.Kind, x.SourceId }).ToListAsync(ct)).Select(x => (x.Kind, x.SourceId)).ToHashSet();
        if (snapshot.Documents.Any(d => occupied.Contains((d.Kind, d.Id))))
            throw new InvalidDataException("Source document already belongs to another batch.");
        db.Batches.Add(new HistoryBatch { Id = snapshot.BatchId, Source = snapshot.Source, Hash = hash, ImportedAt = clock.GetUtcNow() });
        db.Documents.AddRange(snapshot.Documents.Select(d => new HistoryDocument
        {
            BatchId = snapshot.BatchId, Source = snapshot.Source, SourceId = d.Id, Kind = d.Kind,
            StudentId = d.StudentId, Payload = d.Payload.GetRawText(), Hash = Hash(d.Payload)
        }));
        await db.SaveChangesAsync(ct);
        var result = await Compare(snapshot, ct);
        if (!result.Matches) throw new InvalidDataException("Import failed reconciliation.");
        await tx.CommitAsync(ct);
        return result;
    }
    public async Task<HistoryReconciliation> Reconcile(HistorySnapshot snapshot, CancellationToken ct)
    {
        Validate(snapshot);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await Lock(ct);
        var result = await Compare(snapshot, ct);
        await tx.CommitAsync(ct);
        return result;
    }
    private async Task<HistoryReconciliation> Compare(HistorySnapshot snapshot, CancellationToken ct)
    {
        var batch = await db.Batches.AsNoTracking().SingleOrDefaultAsync(x => x.Id == snapshot.BatchId, ct);
        var rows = await db.Documents.AsNoTracking().Where(x => x.BatchId == snapshot.BatchId).ToListAsync(ct);
        var expected = snapshot.Documents.ToDictionary(x => (x.Kind, x.Id));
        var actual = rows.Select(x => new HistoryInput(x.Kind, x.SourceId, x.StudentId, JsonSerializer.Deserialize<JsonElement>(x.Payload))).ToArray();
        var matches = batch?.State == "active" && batch.Source == snapshot.Source && batch.Hash == SnapshotHash(snapshot) &&
            rows.Count == expected.Count && rows.All(r => expected.TryGetValue((r.Kind, r.SourceId), out var d) &&
                r.Source == snapshot.Source && r.StudentId == d.StudentId && r.Hash == Hash(d.Payload) &&
                r.Hash == Hash(JsonSerializer.Deserialize<JsonElement>(r.Payload)));
        return new(snapshot.BatchId, matches, Counts(snapshot.Documents), Counts(actual));
    }
    public async Task Rollback(Guid batchId, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await Lock(ct);
        var batch = await db.Batches.SingleOrDefaultAsync(x => x.Id == batchId, ct)
            ?? throw new InvalidDataException("Unknown batch.");
        await db.Documents.Where(x => x.BatchId == batchId).ExecuteDeleteAsync(ct);
        batch.State = "rolledBack";
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
    }
}
