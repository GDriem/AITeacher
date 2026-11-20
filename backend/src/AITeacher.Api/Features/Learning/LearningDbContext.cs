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
public sealed class EnrollmentRow
{
    public string StudentId { get; set; } = "";
    public Guid SubjectId { get; set; }
    public DateTimeOffset EnrolledAt { get; set; }
}
public sealed class CertificateRow
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string StudentId { get; set; } = "";
    public Guid SubjectId { get; set; }
    public string Code { get; set; } = "";
    // Snapshots: a diploma keeps the names it was issued with, even if the profile or catalog changes later.
    public string StudentName { get; set; } = "";
    public string CourseName { get; set; } = "";
    public int UnitCount { get; set; }
    public decimal AverageFraction { get; set; }
    public DateTimeOffset IssuedAt { get; set; }
}
public sealed class LearningDbContext(DbContextOptions<LearningDbContext> options) : DbContext(options)
{
    public DbSet<EvidenceRow> Evidence => Set<EvidenceRow>();
    public DbSet<ReviewRow> Reviews => Set<ReviewRow>();
    public DbSet<EnrollmentRow> Enrollments => Set<EnrollmentRow>();
    public DbSet<CertificateRow> Certificates => Set<CertificateRow>();
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
        model.Entity<EnrollmentRow>(b =>
        {
            b.ToTable("enrollments");
            b.HasKey(x => new { x.StudentId, x.SubjectId });
            b.Property(x => x.StudentId).HasMaxLength(80);
        });
        model.Entity<CertificateRow>(b =>
        {
            b.ToTable("certificates", t => t.HasCheckConstraint("ck_learning_certificate", "\"UnitCount\" > 0 AND \"AverageFraction\" >= 0 AND \"AverageFraction\" <= 1"));
            b.HasKey(x => x.Id);
            b.Property(x => x.StudentId).HasMaxLength(80);
            b.Property(x => x.Code).HasMaxLength(20);
            b.Property(x => x.StudentName).HasMaxLength(100);
            b.Property(x => x.CourseName).HasMaxLength(150);
            b.HasIndex(x => x.Code).IsUnique();
            b.HasIndex(x => new { x.StudentId, x.SubjectId }).IsUnique();
        });
    }
}
