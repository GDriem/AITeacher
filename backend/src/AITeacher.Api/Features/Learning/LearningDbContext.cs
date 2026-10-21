using Microsoft.EntityFrameworkCore;

namespace AITeacher.Api.Features.Learning;

public sealed class EvidenceRow
{
    public Guid Id { get; set; }
    public string StudentId { get; set; } = "";
    public Guid AttemptId { get; set; }
    public Guid DefinitionRevisionId { get; set; }
    public Guid QuestionRevisionId { get; set; }
    public Guid UnitRevisionId { get; set; }
    public Guid ConceptId { get; set; }
    public decimal Fraction { get; set; }
    public string Assistance { get; set; } = "";
    public string Source { get; set; } = "";
    public DateTimeOffset ObservedAt { get; set; }
    public string PayloadJson { get; set; } = "";
}
public sealed class ReviewRow
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string StudentId { get; set; } = "";
    public Guid RequestId { get; set; }
    public Guid EvidenceId { get; set; }
    public Guid DefinitionRevisionId { get; set; }
    public DateTimeOffset DueAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public Guid? CompletedAttemptId { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
}
public sealed class LearningDbContext(DbContextOptions<LearningDbContext> options) : DbContext(options)
{
    public DbSet<EvidenceRow> Evidence => Set<EvidenceRow>();
    public DbSet<ReviewRow> Reviews => Set<ReviewRow>();
    protected override void OnModelCreating(ModelBuilder model)
    {
        model.HasDefaultSchema("learning");
        model.Entity<EvidenceRow>(b =>
        {
            b.ToTable("evidence", t => t.HasCheckConstraint("ck_learning_fraction", "\"Fraction\" >= 0 AND \"Fraction\" <= 1"));
            b.HasKey(x => x.Id);
            b.Property(x => x.StudentId).HasMaxLength(80);
            b.Property(x => x.PayloadJson).HasColumnType("jsonb");
            b.HasIndex(x => new { x.StudentId, x.UnitRevisionId, x.ConceptId });
        });
        model.Entity<ReviewRow>(b =>
        {
            b.ToTable("reviews", t => t.HasCheckConstraint("ck_learning_review", "\"DueAt\" > \"CreatedAt\" AND ((\"CompletedAt\" IS NULL AND \"CompletedAttemptId\" IS NULL) OR (\"CompletedAt\" IS NOT NULL AND \"CompletedAttemptId\" IS NOT NULL AND \"CompletedAt\" >= \"DueAt\"))"));
            b.HasKey(x => x.Id);
            b.Property(x => x.StudentId).HasMaxLength(80);
            b.HasIndex(x => new { x.StudentId, x.RequestId }).IsUnique();
            b.HasIndex(x => new { x.StudentId, x.CompletedAttemptId }).IsUnique();
            b.HasOne<EvidenceRow>().WithMany().HasForeignKey(x => x.EvidenceId).OnDelete(DeleteBehavior.Restrict);
        });
    }
}
