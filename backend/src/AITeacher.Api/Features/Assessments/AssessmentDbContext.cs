using Microsoft.EntityFrameworkCore;

namespace AITeacher.Api.Features.Assessments;

public sealed class AssessmentRevision
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ResourceId { get; set; }
    public int Number { get; set; }
    public string Kind { get; set; } = "";
    public string DocumentJson { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; }
    public string CreatedBy { get; set; } = "";
}
public sealed class AssessmentAttempt
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string StudentId { get; set; } = "";
    public Guid RequestId { get; set; }
    public Guid DefinitionId { get; set; }
    public Guid DefinitionRevisionId { get; set; }
    public DateTimeOffset StartedAt { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? SubmittedAt { get; set; }
    public string? AnswersJson { get; set; }
    public string? ScoresJson { get; set; }
}
public sealed class AssessmentEvidenceEvent
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid AttemptId { get; set; }
    public Guid QuestionRevisionId { get; set; }
    public Guid ConceptId { get; set; }
    public string PayloadJson { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; }
}
public sealed class EvidenceReceipt { public Guid Id { get; set; } }
public sealed class AssessmentReview
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid AttemptId { get; set; }
    public Guid RequestId { get; set; }
    public string ReviewerId { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; }
    public string GradesJson { get; set; } = "";
    public string ScoresJson { get; set; } = "";
}
public sealed class AssessmentDbContext(DbContextOptions<AssessmentDbContext> options) : DbContext(options)
{
    public DbSet<EvidenceReceipt> EvidenceReceipts => Set<EvidenceReceipt>();
    public DbSet<AssessmentReview> Reviews => Set<AssessmentReview>();
    public DbSet<AssessmentRevision> Revisions => Set<AssessmentRevision>();
    public DbSet<AssessmentAttempt> Attempts => Set<AssessmentAttempt>();
    public DbSet<AssessmentEvidenceEvent> EvidenceEvents => Set<AssessmentEvidenceEvent>();
    protected override void OnModelCreating(ModelBuilder model)
    {
        model.HasDefaultSchema("assessments");
        model.Entity<EvidenceReceipt>(b => { b.ToTable("evidence_receipts"); b.HasKey(x => x.Id);
            b.HasOne<AssessmentEvidenceEvent>().WithMany().HasForeignKey(x => x.Id).OnDelete(DeleteBehavior.Restrict); });
        model.Entity<AssessmentReview>(b =>
        {
            b.ToTable("reviews");
            b.HasKey(x => x.Id);
            b.HasIndex(x => x.AttemptId).IsUnique();
            b.Property(x => x.ReviewerId).HasMaxLength(80);
            b.Property(x => x.GradesJson).HasColumnType("jsonb");
            b.Property(x => x.ScoresJson).HasColumnType("jsonb");
            b.HasOne<AssessmentAttempt>().WithMany().HasForeignKey(x => x.AttemptId).OnDelete(DeleteBehavior.Restrict);
        });
        model.Entity<AssessmentRevision>(b =>
        {
            b.ToTable("revisions", t => t.HasCheckConstraint("ck_assessment_revision", "\"Number\" > 0 AND \"Kind\" IN ('question','definition')"));
            b.HasKey(x => x.Id);
            b.HasIndex(x => new { x.Kind, x.ResourceId, x.Number }).IsUnique();
            b.Property(x => x.DocumentJson).HasColumnType("jsonb");
            b.Property(x => x.CreatedBy).HasMaxLength(80);
        });
        model.Entity<AssessmentAttempt>(b =>
        {
            b.ToTable("attempts", t => {
                t.HasCheckConstraint("ck_attempt_times", "\"ExpiresAt\" > \"StartedAt\"");
                t.HasCheckConstraint("ck_attempt_submission", "(\"SubmittedAt\" IS NULL AND \"AnswersJson\" IS NULL AND \"ScoresJson\" IS NULL) OR (\"SubmittedAt\" IS NOT NULL AND \"AnswersJson\" IS NOT NULL AND \"ScoresJson\" IS NOT NULL)");
            });
            b.HasKey(x => x.Id);
            b.HasIndex(x => new { x.StudentId, x.RequestId }).IsUnique();
            b.HasIndex(x => new { x.StudentId, x.DefinitionId });
            b.Property(x => x.StudentId).HasMaxLength(80);
            b.Property(x => x.AnswersJson).HasColumnType("jsonb");
            b.Property(x => x.ScoresJson).HasColumnType("jsonb");
            b.HasOne<AssessmentRevision>().WithMany().HasForeignKey(x => x.DefinitionRevisionId).OnDelete(DeleteBehavior.Restrict);
        });
        model.Entity<AssessmentEvidenceEvent>(b =>
        {
            b.ToTable("evidence_outbox");
            b.HasKey(x => x.Id);
            b.HasIndex(x => new { x.AttemptId, x.QuestionRevisionId, x.ConceptId }).IsUnique();
            b.Property(x => x.PayloadJson).HasColumnType("jsonb");
            b.HasOne<AssessmentAttempt>().WithMany().HasForeignKey(x => x.AttemptId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne<AssessmentRevision>().WithMany().HasForeignKey(x => x.QuestionRevisionId).OnDelete(DeleteBehavior.Restrict);
        });
    }
}
