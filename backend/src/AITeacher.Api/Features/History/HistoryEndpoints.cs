using System.Security.Claims;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;

namespace AITeacher.Api.Features.History;

public static class HistoryEndpoints
{
    public static void MapHistory(this WebApplication app)
    {
        var group = app.MapGroup("/api/history").RequireAuthorization();
        group.AddEndpointFilter(async (context, next) =>
        {
            context.HttpContext.Response.Headers.CacheControl = "no-store";
            return await next(context);
        });
        group.MapGet("/conversations", (int? offset, int? limit, ClaimsPrincipal u, HistoryDbContext db, CancellationToken ct) =>
            List("conversation", offset ?? 0, limit ?? 50, u, db, ct));
        group.MapGet("/progress", (int? offset, int? limit, ClaimsPrincipal u, HistoryDbContext db, CancellationToken ct) =>
            List("progress", offset ?? 0, limit ?? 50, u, db, ct));
        group.MapGet("/conversations/{id:guid}", async (Guid id, ClaimsPrincipal u, HistoryDbContext db, CancellationToken ct) =>
        {
            var row = await Owned(db, u).SingleOrDefaultAsync(x => x.Id == id && x.Kind == "conversation", ct);
            return row is null ? Results.NotFound() : Results.Ok(Summary(row));
        });
        group.MapGet("/conversations/{id:guid}/messages", async (Guid id, int? offset, int? limit, ClaimsPrincipal u, HistoryDbContext db, CancellationToken ct) =>
        {
            var start = offset ?? 0; var size = limit ?? 50;
            if (!Page(start, size)) return Results.Problem(statusCode: 400, title: "Invalid pagination");
            var row = await Owned(db, u).SingleOrDefaultAsync(x => x.Id == id && x.Kind == "conversation", ct);
            if (row is null) return Results.NotFound();
            using var doc = JsonDocument.Parse(row.Payload);
            var all = doc.RootElement.GetProperty("messages").EnumerateArray().ToArray();
            // An explicit projection never exposes pending quizzes or cached private answers.
            var messages = all.Skip(start).Take(size).Select(m => new
            {
                id = m.GetProperty("id").Clone(), role = m.GetProperty("role").Clone(), content = m.GetProperty("content").Clone(),
                label = Optional(m, "label"), sources = Optional(m, "sources"), note = Optional(m, "note"),
                createdAt = Optional(m, "created_at")
            }).ToArray();
            return Results.Ok(new { items = messages, total = all.Length, offset = start, limit = size });
        });
    }
    private static IQueryable<HistoryDocument> Owned(HistoryDbContext db, ClaimsPrincipal u) =>
        db.Documents.AsNoTracking().Where(x => x.StudentId == u.FindFirstValue(ClaimTypes.NameIdentifier));
    private static bool Page(int offset, int limit) => offset >= 0 && limit is >= 1 and <= 100;
    private static JsonElement? Optional(JsonElement root, string key) => root.TryGetProperty(key, out var value) ? value.Clone() : null;
    private static object Summary(HistoryDocument row)
    {
        using var doc = JsonDocument.Parse(row.Payload);
        var p = doc.RootElement;
        return new { row.Id, row.Source, row.SourceId, readOnly = true, title = p.GetProperty("title").Clone(),
            topic = Optional(p, "topic"), createdAt = Optional(p, "created_at"), updatedAt = Optional(p, "updated_at"),
            archivedAt = Optional(p, "archived_at"), messageCount = p.GetProperty("messages").GetArrayLength() };
    }
    private static async Task<IResult> List(string kind, int offset, int limit, ClaimsPrincipal u, HistoryDbContext db, CancellationToken ct)
    {
        if (!Page(offset, limit)) return Results.Problem(statusCode: 400, title: "Invalid pagination");
        var query = Owned(db, u).Where(x => x.Kind == kind);
        var total = await query.CountAsync(ct);
        var rows = await query.OrderBy(x => x.Id).Skip(offset).Take(limit).ToListAsync(ct);
        var items = rows.Select(row => kind == "conversation" ? Summary(row) : (object)new
        {
            row.Id, row.Source, row.SourceId, readOnly = true, status = "legacyUncalibrated",
            payload = JsonSerializer.Deserialize<JsonElement>(row.Payload)
        }).ToArray();
        return Results.Ok(new { items, total, offset, limit });
    }
}
