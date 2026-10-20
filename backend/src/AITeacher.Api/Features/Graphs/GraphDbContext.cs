using Microsoft.EntityFrameworkCore;

namespace AITeacher.Api.Features.Graphs;

public sealed class GraphRevision
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid GraphId { get; set; }
    public Guid TopicId { get; set; }
    public int Number { get; set; }
    public string Title { get; set; } = "";
    public string CreatedBy { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; }
}
public sealed class GraphNode
{
    public Guid RevisionId { get; set; }
    public Guid Id { get; set; }
    public Guid UnitId { get; set; }
    public Guid UnitRevisionId { get; set; }
    public Guid ConceptId { get; set; }
    public string Name { get; set; } = "";
}
public sealed class GraphRelation
{
    public Guid RevisionId { get; set; }
    public Guid FromNodeId { get; set; }
    public Guid ToNodeId { get; set; }
    public string Relation { get; set; } = "";
}
public sealed class GraphObservation
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string StudentId { get; set; } = "";
    public Guid ConversationId { get; set; }
    public Guid GraphRevisionId { get; set; }
    public Guid MessageId { get; set; }
    public string Origin { get; set; } = "student";
    public string? DeduplicationKey { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
public sealed class ObservationRevision
{
    public Guid ObservationId { get; set; }
    public int Version { get; set; }
    public Guid GraphRevisionId { get; set; }
    public Guid FromNodeId { get; set; }
    public Guid? ToNodeId { get; set; }
    public string? Relation { get; set; }
    public string Stage { get; set; } = "mention";
    public decimal Confidence { get; set; }
    public string Status { get; set; } = "pending";
    public string Reason { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; }
}
public sealed class GraphDbContext(DbContextOptions<GraphDbContext> options) : DbContext(options)
{
    public DbSet<GraphRevision> Revisions => Set<GraphRevision>();
    public DbSet<GraphNode> Nodes => Set<GraphNode>();
    public DbSet<GraphRelation> Relations => Set<GraphRelation>();
    public DbSet<GraphObservation> Observations => Set<GraphObservation>();
    public DbSet<ObservationRevision> Corrections => Set<ObservationRevision>();
    protected override void OnModelCreating(ModelBuilder m)
    {
        m.HasDefaultSchema("graphs");
        m.Entity<GraphRevision>(b => {
            b.ToTable("revisions", t => t.HasCheckConstraint("ck_graph_number", "\"Number\" > 0"));
            b.HasKey(x => x.Id); b.HasIndex(x => new { x.GraphId, x.Number }).IsUnique();
            b.HasIndex(x => new { x.TopicId, x.GraphId, x.Number });
            b.Property(x => x.Title).HasMaxLength(150); b.Property(x => x.CreatedBy).HasMaxLength(80);
        });
        m.Entity<GraphNode>(b => {
            b.ToTable("nodes"); b.HasKey(x => new { x.RevisionId, x.Id });
            b.HasOne<GraphRevision>().WithMany().HasForeignKey(x => x.RevisionId).OnDelete(DeleteBehavior.Restrict);
            b.HasIndex(x => new { x.RevisionId, x.UnitId, x.UnitRevisionId, x.ConceptId }).IsUnique();
            b.Property(x => x.Name).HasMaxLength(150);
        });
        m.Entity<GraphRelation>(b => {
            b.ToTable("relations", t => {
                t.HasCheckConstraint("ck_graph_relation", "\"Relation\" IN ('requires','explains','applies','differsFrom')");
                t.HasCheckConstraint("ck_graph_no_self", "\"FromNodeId\" <> \"ToNodeId\"");
            });
            b.HasKey(x => new { x.RevisionId, x.FromNodeId, x.ToNodeId, x.Relation });
            b.HasOne<GraphNode>().WithMany().HasForeignKey(x => new { x.RevisionId, x.FromNodeId }).OnDelete(DeleteBehavior.Restrict);
            b.HasOne<GraphNode>().WithMany().HasForeignKey(x => new { x.RevisionId, x.ToNodeId }).OnDelete(DeleteBehavior.Restrict);
        });
        m.Entity<GraphObservation>(b => {
            b.ToTable("observations", t => t.HasCheckConstraint("ck_observation_origin", "\"Origin\" IN ('student','name-match-v1')"));
            b.HasKey(x => x.Id); b.HasAlternateKey(x => new { x.Id, x.GraphRevisionId });
            b.Property(x => x.StudentId).HasMaxLength(80);
            b.HasIndex(x => new { x.StudentId, x.ConversationId, x.GraphRevisionId });
            b.HasIndex(x => x.DeduplicationKey).IsUnique();
            b.HasOne<GraphRevision>().WithMany().HasForeignKey(x => x.GraphRevisionId).OnDelete(DeleteBehavior.Restrict);
        });
        m.Entity<ObservationRevision>(b => {
            b.ToTable("observation_revisions", t => {
                t.HasCheckConstraint("ck_observation_version", "\"Version\" BETWEEN 1 AND 100");
                t.HasCheckConstraint("ck_observation_stage", "\"Stage\" IN ('mention','exploration','understanding')");
                t.HasCheckConstraint("ck_observation_status", "\"Status\" IN ('pending','accepted','rejected')");
                t.HasCheckConstraint("ck_observation_confidence", "\"Confidence\" BETWEEN 0 AND 1");
                t.HasCheckConstraint("ck_observation_relation", "(\"ToNodeId\" IS NULL AND \"Relation\" IS NULL) OR (\"ToNodeId\" IS NOT NULL AND \"Relation\" IS NOT NULL AND \"Relation\" IN ('requires','explains','applies','differsFrom') AND \"FromNodeId\" <> \"ToNodeId\")");
            });
            b.HasKey(x => new { x.ObservationId, x.Version });
            b.Property(x => x.Reason).HasMaxLength(2000);
            b.HasOne<GraphObservation>().WithMany().HasForeignKey(x => new { x.ObservationId, x.GraphRevisionId }).HasPrincipalKey(x => new { x.Id, x.GraphRevisionId }).OnDelete(DeleteBehavior.Restrict);
            b.HasOne<GraphNode>().WithMany().HasForeignKey(x => new { x.GraphRevisionId, x.FromNodeId }).OnDelete(DeleteBehavior.Restrict);
            b.HasOne<GraphNode>().WithMany().HasForeignKey(x => new { x.GraphRevisionId, x.ToNodeId }).OnDelete(DeleteBehavior.Restrict);
        });
    }
}
