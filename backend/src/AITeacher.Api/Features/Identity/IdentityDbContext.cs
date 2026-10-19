using Microsoft.EntityFrameworkCore;

namespace AITeacher.Api.Features.Identity;

public sealed class Student
{
    public string Id { get; set; } = "";
    public string GoogleSubject { get; set; } = "";
    public string Email { get; set; } = "";
    public string DisplayName { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset LastLoginAt { get; set; }
}

public sealed class AuthSession
{
    public string TokenHash { get; set; } = "";
    public string StudentId { get; set; } = "";
    public DateTimeOffset ExpiresAt { get; set; }
}

public sealed class IdentityDbContext(DbContextOptions<IdentityDbContext> options) : DbContext(options)
{
    public DbSet<Student> Students => Set<Student>();
    public DbSet<AuthSession> Sessions => Set<AuthSession>();

    protected override void OnModelCreating(ModelBuilder model)
    {
        model.HasDefaultSchema("identity");
        model.Entity<Student>(b =>
        {
            b.ToTable("students");
            b.HasKey(x => x.Id);
            b.Property(x => x.Id).HasMaxLength(39);
            b.Property(x => x.GoogleSubject).HasMaxLength(255);
            b.HasIndex(x => x.GoogleSubject).IsUnique();
            b.Property(x => x.Email).HasMaxLength(320);
            b.Property(x => x.DisplayName).HasMaxLength(100);
        });
        model.Entity<AuthSession>(b =>
        {
            b.ToTable("sessions");
            b.HasKey(x => x.TokenHash);
            b.Property(x => x.TokenHash).HasMaxLength(64);
            b.HasOne<Student>().WithMany().HasForeignKey(x => x.StudentId).OnDelete(DeleteBehavior.Cascade);
            b.HasIndex(x => x.ExpiresAt);
        });
    }
}
