using AITeacher.Modules.Curriculum.Catalog;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AITeacher.Api.Features.Catalog;

public sealed class CatalogDbContext(DbContextOptions<CatalogDbContext> options) : DbContext(options)
{
    public DbSet<Subject> Subjects => Set<Subject>();
    public DbSet<Category> Categories => Set<Category>();
    public DbSet<LevelScale> Scales => Set<LevelScale>();
    public DbSet<Level> Levels => Set<Level>();
    public DbSet<Topic> Topics => Set<Topic>();

    protected override void OnModelCreating(ModelBuilder model)
    {
        model.HasDefaultSchema("curriculum");
        Configure(model.Entity<Subject>(), "subjects");
        Configure(model.Entity<Category>(), "categories");
        Configure(model.Entity<LevelScale>(), "level_scales");
        Configure(model.Entity<Level>(), "levels");
        Configure(model.Entity<Topic>(), "topics");
        model.Entity<Subject>().HasIndex(x => x.Slug).IsUnique();
        model.Entity<Category>(b =>
        {
            b.HasIndex(x => new { x.SubjectId, x.Slug }).IsUnique();
            b.HasAlternateKey(x => new { x.SubjectId, x.Id });
            b.HasOne<Subject>().WithMany().HasForeignKey(x => x.SubjectId).OnDelete(DeleteBehavior.Restrict);
        });
        model.Entity<LevelScale>(b =>
        {
            b.HasIndex(x => x.Slug).IsUnique();
            b.Property(x => x.Purpose).HasMaxLength(32);
            b.ToTable(t => t.HasCheckConstraint("ck_scale_purpose", "\"Purpose\" IN ('difficulty', 'proficiency', 'mastery')"));
        });
        model.Entity<Level>(b =>
        {
            b.HasIndex(x => new { x.ScaleId, x.Slug }).IsUnique();
            b.HasOne<LevelScale>().WithMany().HasForeignKey(x => x.ScaleId).OnDelete(DeleteBehavior.Restrict);
        });
        model.Entity<Topic>(b =>
        {
            b.HasIndex(x => new { x.CategoryId, x.Slug }).IsUnique();
            // Composite FK prevents attaching a topic to another subject's category, even outside HTTP.
            b.HasOne<Category>().WithMany().HasForeignKey(x => new { x.SubjectId, x.CategoryId })
                .HasPrincipalKey(x => new { x.SubjectId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            b.HasOne<Level>().WithMany().HasForeignKey(x => x.LevelId).OnDelete(DeleteBehavior.Restrict);
        });
    }

    private static void Configure<T>(EntityTypeBuilder<T> b, string table) where T : class, ICatalogEntry
    {
        b.ToTable(table, t =>
        {
            t.HasCheckConstraint($"ck_{table}_name", "length(btrim(\"Name\")) > 0");
            t.HasCheckConstraint($"ck_{table}_slug", "\"Slug\" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'");
            t.HasCheckConstraint($"ck_{table}_order", "\"SortOrder\" >= 0");
            t.HasCheckConstraint($"ck_{table}_version", "\"Version\" > 0");
        });
        b.HasKey(x => x.Id);
        b.Property(x => x.Name).HasMaxLength(150);
        b.Property(x => x.Slug).HasMaxLength(80);
        b.Property(x => x.Version).IsConcurrencyToken();
    }
}
