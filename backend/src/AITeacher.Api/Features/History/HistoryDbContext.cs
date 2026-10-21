using Microsoft.EntityFrameworkCore;

namespace AITeacher.Api.Features.History;

public sealed class HistoryBatch
{
    public Guid Id { get; set; }
    public string Source { get; set; } = "";
    public string Hash { get; set; } = "";
    public string State { get; set; } = "active";
    public DateTimeOffset ImportedAt { get; set; }
}
public sealed class HistoryDocument
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid BatchId { get; set; }
    public string Source { get; set; } = "";
    public string Kind { get; set; } = "";
    public string SourceId { get; set; } = "";
    public string StudentId { get; set; } = "";
    public string Hash { get; set; } = "";
    public string Payload { get; set; } = "{}";
}
public sealed class HistoryDbContext(DbContextOptions<HistoryDbContext> options) : DbContext(options)
{
    public DbSet<HistoryBatch> Batches => Set<HistoryBatch>();
    public DbSet<HistoryDocument> Documents => Set<HistoryDocument>();
    protected override void OnModelCreating(ModelBuilder model)
    {
        model.HasDefaultSchema("history");
        model.Entity<HistoryBatch>(b =>
        {
            b.ToTable("batches", t => t.HasCheckConstraint("ck_history_state", "\"State\" IN ('active','rolledBack')"));
            b.HasKey(x => x.Id);
            b.Property(x => x.Source).HasMaxLength(120);
            b.Property(x => x.Hash).HasMaxLength(64);
        });
        model.Entity<HistoryDocument>(b =>
        {
            b.ToTable("documents", t => t.HasCheckConstraint("ck_history_kind", "\"Kind\" IN ('conversation','progress')"));
            b.HasKey(x => x.Id);
            b.Property(x => x.Source).HasMaxLength(120);
            b.Property(x => x.SourceId).HasMaxLength(200);
            b.Property(x => x.StudentId).HasMaxLength(100);
            b.Property(x => x.Hash).HasMaxLength(64);
            b.Property(x => x.Payload).HasColumnType("jsonb");
            b.HasIndex(x => new { x.Source, x.Kind, x.SourceId }).IsUnique();
            b.HasIndex(x => new { x.StudentId, x.Kind, x.Id });
            b.HasOne<HistoryBatch>().WithMany().HasForeignKey(x => x.BatchId).OnDelete(DeleteBehavior.Restrict);
        });
    }
}
