using Microsoft.EntityFrameworkCore;

namespace AITeacher.Api.Features.Tutor;

public sealed class Conversation
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string StudentId { get; set; } = "";
    public Guid UnitId { get; set; }
    public Guid RevisionId { get; set; }
    public string Mode { get; set; } = "chat";
    public Guid? ActivityId { get; set; }
    public long Version { get; set; } = 1;
    public Guid? ActiveTurnId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class TutorTurn
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ConversationId { get; set; }
    public string StudentId { get; set; } = "";
    public Guid RequestId { get; set; }
    public string InputHash { get; set; } = "";
    public long ReservedVersion { get; set; }
    public string State { get; set; } = "pending";
    public Guid LeaseToken { get; set; }
    public DateTimeOffset LeaseUntil { get; set; }
    public string ProviderJson { get; set; } = "{}";
    public string ManifestJson { get; set; } = "{}";
    public int? InputTokens { get; set; }
    public int? OutputTokens { get; set; }
    public long? LatencyMs { get; set; }
}

public sealed class TutorMessage
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ConversationId { get; set; }
    public Guid TurnId { get; set; }
    public long Sequence { get; set; }
    public string Role { get; set; } = "user";
    public string Text { get; set; } = "";
    public string SourcesJson { get; set; } = "[]";
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class StudentNote
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string StudentId { get; set; } = "";
    public string Kind { get; set; } = "student";
    public string Text { get; set; } = "";
    public Guid? ConversationId { get; set; }
    public Guid? MessageId { get; set; }
    public string OriginJson { get; set; } = "{}";
    public long Version { get; set; } = 1;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

public sealed class TutorDbContext(DbContextOptions<TutorDbContext> options) : DbContext(options)
{
    public DbSet<Conversation> Conversations => Set<Conversation>();
    public DbSet<TutorTurn> Turns => Set<TutorTurn>();
    public DbSet<TutorMessage> Messages => Set<TutorMessage>();
    public DbSet<StudentNote> Notes => Set<StudentNote>();

    protected override void OnModelCreating(ModelBuilder model)
    {
        model.HasDefaultSchema("conversations");
        model.Entity<Conversation>(b =>
        {
            b.ToTable("conversations", t => {
                t.HasCheckConstraint("ck_conversation_mode", "\"Mode\" IN ('chat','reading','practice')");
                t.HasCheckConstraint("ck_conversation_version", "\"Version\" > 0");
            });
            b.HasKey(x => x.Id);
            b.HasAlternateKey(x => new { x.StudentId, x.Id });
            b.Property(x => x.StudentId).HasMaxLength(80);
            b.Property(x => x.Version).IsConcurrencyToken();
            b.HasIndex(x => new { x.StudentId, x.CreatedAt, x.Id });
        });
        model.Entity<TutorTurn>(b =>
        {
            b.ToTable("turns", t => t.HasCheckConstraint("ck_turn_state", "\"State\" IN ('pending','completed','failed')"));
            b.HasKey(x => x.Id);
            b.HasAlternateKey(x => new { x.ConversationId, x.Id });
            b.Property(x => x.StudentId).HasMaxLength(80);
            b.Property(x => x.InputHash).HasMaxLength(64);
            b.HasIndex(x => new { x.StudentId, x.RequestId }).IsUnique();
            b.HasOne<Conversation>().WithMany().HasForeignKey(x => new { x.StudentId, x.ConversationId })
                .HasPrincipalKey(x => new { x.StudentId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            b.Property(x => x.ProviderJson).HasColumnType("jsonb");
            b.Property(x => x.ManifestJson).HasColumnType("jsonb");
        });
        model.Entity<TutorMessage>(b =>
        {
            b.ToTable("messages", t => {
                t.HasCheckConstraint("ck_message_role", "\"Role\" IN ('user','assistant')");
                t.HasCheckConstraint("ck_message_text", "length(\"Text\") BETWEEN 1 AND 12000");
            });
            b.HasKey(x => x.Id);
            b.HasIndex(x => new { x.ConversationId, x.Sequence }).IsUnique();
            b.HasIndex(x => new { x.TurnId, x.Role }).IsUnique();
            b.HasAlternateKey(x => new { x.ConversationId, x.Id });
            b.HasOne<TutorTurn>().WithMany().HasForeignKey(x => new { x.ConversationId, x.TurnId })
                .HasPrincipalKey(x => new { x.ConversationId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            b.Property(x => x.SourcesJson).HasColumnType("jsonb");
        });
        model.Entity<StudentNote>(b =>
        {
            b.ToTable("notes", t => {
                t.HasCheckConstraint("ck_note_kind", "\"Kind\" IN ('student','savedMessage','summary')");
                t.HasCheckConstraint("ck_note_text", "length(\"Text\") BETWEEN 1 AND 12000");
                t.HasCheckConstraint("ck_note_version", "\"Version\" > 0");
            });
            b.HasKey(x => x.Id);
            b.Property(x => x.StudentId).HasMaxLength(80);
            b.Property(x => x.Version).IsConcurrencyToken();
            b.Property(x => x.OriginJson).HasColumnType("jsonb");
            b.HasIndex(x => new { x.StudentId, x.CreatedAt, x.Id });
            b.HasOne<Conversation>().WithMany().HasForeignKey(x => new { x.StudentId, x.ConversationId })
                .HasPrincipalKey(x => new { x.StudentId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            b.HasOne<TutorMessage>().WithMany().HasForeignKey(x => new { x.ConversationId, x.MessageId })
                .HasPrincipalKey(x => new { x.ConversationId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
    }
}
