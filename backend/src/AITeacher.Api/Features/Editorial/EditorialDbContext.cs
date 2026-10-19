using Microsoft.EntityFrameworkCore;

namespace AITeacher.Api.Features.Editorial;

public sealed class EditorialUnit
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TopicId { get; set; }
    public long Version { get; set; } = 1;
    public int RevisionCount { get; set; } = 1;
    public Guid? PublishedRevisionId { get; set; }
    public string? ImportKey { get; set; }
    public string? ImportHash { get; set; }
}

public sealed class EditorialRevision
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UnitId { get; set; }
    public int Number { get; set; }
    public string DocumentJson { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; }
    public string CreatedBy { get; set; } = "";
    public string? OriginJson { get; set; }
}

public sealed class EditorialPublication
{
    public Guid RevisionId { get; set; }
    public DateTimeOffset PublishedAt { get; set; }
    public string PublishedBy { get; set; } = "";
}

public sealed class EditorialDbContext(DbContextOptions<EditorialDbContext> options) : DbContext(options)
{
    public DbSet<EditorialUnit> Units => Set<EditorialUnit>();
    public DbSet<EditorialRevision> Revisions => Set<EditorialRevision>();
    public DbSet<EditorialPublication> Publications => Set<EditorialPublication>();

    protected override void OnModelCreating(ModelBuilder model)
    {
        model.HasDefaultSchema("content");
        model.Entity<EditorialUnit>(b =>
        {
            b.ToTable("units", t =>
            {
                t.HasCheckConstraint("ck_unit_version", "\"Version\" > 0 AND \"RevisionCount\" > 0");
                t.HasCheckConstraint("ck_unit_import", "(\"ImportKey\" IS NULL) = (\"ImportHash\" IS NULL)");
                t.HasCheckConstraint("ck_unit_topic", "\"TopicId\" <> '00000000-0000-0000-0000-000000000000'");
            });
            b.HasKey(x => x.Id);
            b.Property(x => x.Version).IsConcurrencyToken();
            b.Property(x => x.ImportKey).HasMaxLength(250);
            b.Property(x => x.ImportHash).HasMaxLength(64);
            b.HasIndex(x => x.ImportKey).IsUnique();
            b.HasIndex(x => x.TopicId);
            b.HasOne<EditorialRevision>().WithMany().HasForeignKey(x => new { x.Id, x.PublishedRevisionId })
                .HasPrincipalKey(x => new { x.UnitId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        model.Entity<EditorialRevision>(b =>
        {
            b.ToTable("unit_revisions", t => t.HasCheckConstraint("ck_revision_number", "\"Number\" > 0"));
            b.HasKey(x => x.Id);
            b.HasAlternateKey(x => new { x.UnitId, x.Id });
            b.HasIndex(x => new { x.UnitId, x.Number }).IsUnique();
            b.HasOne<EditorialUnit>().WithMany().HasForeignKey(x => x.UnitId).OnDelete(DeleteBehavior.Restrict);
            b.Property(x => x.DocumentJson).HasColumnType("jsonb");
            b.Property(x => x.OriginJson).HasColumnType("jsonb");
            b.Property(x => x.CreatedBy).HasMaxLength(80);
        });
        model.Entity<EditorialPublication>(b =>
        {
            b.ToTable("publications");
            b.HasKey(x => x.RevisionId);
            b.HasOne<EditorialRevision>().WithMany().HasForeignKey(x => x.RevisionId).OnDelete(DeleteBehavior.Restrict);
            b.Property(x => x.PublishedBy).HasMaxLength(80);
        });
    }
}
