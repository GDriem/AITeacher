using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using AITeacher.Api.Features.History;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;
using Npgsql;

namespace AITeacher.Api.Tests;

public sealed class HistoryApiTests(ApiFixture fixture) : IClassFixture<ApiFixture>
{
    private static string Student(string credential = "student-a") => "google-" +
        Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(credential + "-sub")))[..32];
    private static HistorySnapshot Snapshot(string? source = null)
    {
        var owner = Student(); var id = "python-session-" + Guid.NewGuid();
        var payload = JsonSerializer.SerializeToElement(new
        {
            id, student_id = owner, title = "Conversación histórica ágil", topic = "embeddings",
            messages = new[] { new { id = "message-original", role = "user", content = "Explícame vectores", sources = new[] { "original.json" }, note = "nota original", created_at = "2025-01-01T00:00:00Z" } },
            pending_evaluation = new { student_id = owner, quiz = new { expected_keywords = new[] { "PRIVATE-QUIZ" } } },
            completed_chat_requests = new { secret = "PRIVATE-CACHE" }
        });
        var progress = JsonSerializer.SerializeToElement(new
        {
            student_id = owner, level = "advanced", assessments = new[] { new { topic = "embeddings", score = 87.5m, feedback = "Original" } }
        });
        return new(1, Guid.NewGuid(), source ?? "test-" + Guid.NewGuid(), [new("conversation", id, owner, payload), new("progress", owner, owner, progress)]);
    }
    private async Task<HistoryReconciliation> Import(HistorySnapshot snapshot)
    {
        using var scope = fixture.Host.Services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<HistoryMigration>().Import(snapshot, default);
    }
    private async Task<HttpClient> Login(string credential)
    {
        var client = fixture.Host.CreateClient();
        var csrf = await client.GetFromJsonAsync<JsonObject>("/api/auth/csrf");
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", csrf!["requestToken"]!.GetValue<string>());
        (await client.PostAsJsonAsync("/api/auth/google", new { credential })).EnsureSuccessStatusCode();
        return client;
    }
    [Fact]
    public async Task Import_replay_reconcile_conflict_and_rollback_preserve_other_batches()
    {
        var snapshot = Snapshot(); var other = Snapshot();
        Assert.True((await Import(snapshot)).Matches);
        Assert.Equal(new HistoryCounts(2, 1, 1, 1, 1), (await Import(snapshot)).Actual);
        await Import(other);
        using var scope = fixture.Host.Services.CreateScope();
        var service = scope.ServiceProvider.GetRequiredService<HistoryMigration>();
        var db = scope.ServiceProvider.GetRequiredService<HistoryDbContext>();
        var originalIds = await db.Documents.Where(x => x.BatchId == snapshot.BatchId).Select(x => x.Id).ToArrayAsync();
        Assert.True((await service.Reconcile(snapshot, default)).Matches);
        await Assert.ThrowsAsync<PostgresException>(() => db.Database.ExecuteSqlInterpolatedAsync(
            $"UPDATE history.documents SET \"StudentId\" = 'other' WHERE \"BatchId\" = {snapshot.BatchId}"));
        var conflict = snapshot with { BatchId = Guid.NewGuid() };
        await Assert.ThrowsAsync<InvalidDataException>(() => Import(conflict));
        Assert.False(await db.Batches.AnyAsync(x => x.Id == conflict.BatchId));
        var changed = snapshot with { Source = "changed" };
        await Assert.ThrowsAsync<InvalidDataException>(() => Import(changed));
        Assert.Equal(originalIds.Order(), (await db.Documents.Where(x => x.BatchId == snapshot.BatchId).Select(x => x.Id).ToArrayAsync()).Order());
        await service.Rollback(snapshot.BatchId, default);
        await service.Rollback(snapshot.BatchId, default);
        Assert.False((await service.Reconcile(snapshot, default)).Matches);
        Assert.True((await service.Reconcile(other, default)).Matches);
        await Assert.ThrowsAsync<InvalidDataException>(() => Import(snapshot));
        Assert.Empty(await db.Documents.Where(x => x.BatchId == snapshot.BatchId).ToArrayAsync());
        Assert.Equal("rolledBack", (await db.Batches.SingleAsync(x => x.Id == snapshot.BatchId)).State);
    }
    [Fact]
    public async Task History_is_private_persistent_paginated_and_never_exposes_pending_keys()
    {
        var snapshot = Snapshot(); await Import(snapshot);
        using var scope = fixture.Host.Services.CreateScope();
        var row = await scope.ServiceProvider.GetRequiredService<HistoryDbContext>().Documents.SingleAsync(x => x.BatchId == snapshot.BatchId && x.Kind == "conversation");
        using var anonymous = fixture.Host.CreateClient();
        using var a = await Login("student-a"); using var b = await Login("student-b"); using var author = await Login("author");
        var path = $"/api/history/conversations/{row.Id}";
        foreach (var route in new[] { "/api/history/conversations", "/api/history/progress", path, path + "/messages" })
            Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync(route)).StatusCode);
        foreach (var user in new[] { b, author })
        {
            Assert.Equal(HttpStatusCode.NotFound, (await user.GetAsync(path)).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await user.GetAsync(path + "/messages")).StatusCode);
            Assert.DoesNotContain(row.SourceId, await user.GetStringAsync("/api/history/conversations"));
            Assert.DoesNotContain(snapshot.Source, await user.GetStringAsync("/api/history/progress"));
        }
        foreach (var route in new[] { path, path + "/messages", "/api/history/conversations" })
        {
            var response = await a.GetAsync(route); response.EnsureSuccessStatusCode();
            Assert.Equal("no-store", response.Headers.CacheControl!.ToString());
            var text = await response.Content.ReadAsStringAsync();
            Assert.DoesNotContain("PRIVATE-", text);
            Assert.DoesNotContain("expected_keywords", text);
        }
        var page = await a.GetFromJsonAsync<JsonObject>(path + "/messages?offset=0&limit=1");
        Assert.Equal(1, page!["total"]!.GetValue<int>());
        Assert.Equal("message-original", page["items"]![0]!["id"]!.GetValue<string>());
        Assert.Equal("nota original", page["items"]![0]!["note"]!.GetValue<string>());
        Assert.Empty((await a.GetFromJsonAsync<JsonObject>(path + "/messages?offset=10"))!["items"]!.AsArray());
        foreach (var route in new[] { "/api/history/conversations?limit=101", "/api/history/progress?offset=-1", path + "/messages?limit=0" })
            Assert.Equal(HttpStatusCode.BadRequest, (await a.GetAsync(route)).StatusCode);
        using var restarted = new ApiHost(fixture.Connection, fixture.Clock);
        using var restartScope = restarted.Services.CreateScope();
        Assert.True((await restartScope.ServiceProvider.GetRequiredService<HistoryMigration>().Reconcile(snapshot, default)).Matches);
        var progress = await a.GetStringAsync("/api/history/progress");
        Assert.Contains("legacyUncalibrated", progress);
        Assert.Contains("87.5", progress);
    }
    [Fact]
    public async Task Invalid_owner_duplicate_and_tampered_data_do_not_pass_reconciliation()
    {
        var snapshot = Snapshot();
        var invalid = snapshot with { Documents = [snapshot.Documents[0] with { StudentId = Student("student-b") }, snapshot.Documents[1]] };
        await Assert.ThrowsAsync<InvalidDataException>(() => Import(invalid));
        await Assert.ThrowsAsync<InvalidDataException>(() => Import(snapshot with { Documents = [snapshot.Documents[0], snapshot.Documents[0]] }));
        using var scope = fixture.Host.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<HistoryDbContext>();
        Assert.False(await db.Batches.AnyAsync(x => x.Id == snapshot.BatchId));
        await Import(snapshot);
        await db.Documents.Where(x => x.BatchId == snapshot.BatchId && x.Kind == "progress").ExecuteDeleteAsync();
        Assert.False((await scope.ServiceProvider.GetRequiredService<HistoryMigration>().Reconcile(snapshot, default)).Matches);
        await Assert.ThrowsAsync<InvalidDataException>(() => Import(snapshot));
    }
    [Fact]
    public async Task Concurrent_imports_are_deduplicated_and_conflicting_batch_is_atomic()
    {
        var snapshot = Snapshot();
        Assert.All(await Task.WhenAll(Import(snapshot), Import(snapshot)), r => Assert.True(r.Matches));
        var conflict = Snapshot(snapshot.Source) with { Documents = [Snapshot().Documents[0], snapshot.Documents[1]] };
        await Assert.ThrowsAsync<InvalidDataException>(() => Import(conflict));
        using var scope = fixture.Host.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<HistoryDbContext>();
        Assert.False(await db.Documents.AnyAsync(x => x.BatchId == conflict.BatchId));
        Assert.False(await db.Batches.AnyAsync(x => x.Id == conflict.BatchId));
    }
}
