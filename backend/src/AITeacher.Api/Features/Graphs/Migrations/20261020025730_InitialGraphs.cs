using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AITeacher.Api.Features.Graphs.Migrations
{
    /// <inheritdoc />
    public partial class InitialGraphs : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "graphs");

            migrationBuilder.CreateTable(
                name: "revisions",
                schema: "graphs",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    GraphId = table.Column<Guid>(type: "uuid", nullable: false),
                    TopicId = table.Column<Guid>(type: "uuid", nullable: false),
                    Number = table.Column<int>(type: "integer", nullable: false),
                    Title = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    CreatedBy = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_revisions", x => x.Id);
                    table.CheckConstraint("ck_graph_number", "\"Number\" > 0");
                });

            migrationBuilder.CreateTable(
                name: "nodes",
                schema: "graphs",
                columns: table => new
                {
                    RevisionId = table.Column<Guid>(type: "uuid", nullable: false),
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UnitId = table.Column<Guid>(type: "uuid", nullable: false),
                    UnitRevisionId = table.Column<Guid>(type: "uuid", nullable: false),
                    ConceptId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_nodes", x => new { x.RevisionId, x.Id });
                    table.ForeignKey(
                        name: "FK_nodes_revisions_RevisionId",
                        column: x => x.RevisionId,
                        principalSchema: "graphs",
                        principalTable: "revisions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "observations",
                schema: "graphs",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    StudentId = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    ConversationId = table.Column<Guid>(type: "uuid", nullable: false),
                    GraphRevisionId = table.Column<Guid>(type: "uuid", nullable: false),
                    MessageId = table.Column<Guid>(type: "uuid", nullable: false),
                    Origin = table.Column<string>(type: "text", nullable: false),
                    DeduplicationKey = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_observations", x => x.Id);
                    table.UniqueConstraint("AK_observations_Id_GraphRevisionId", x => new { x.Id, x.GraphRevisionId });
                    table.CheckConstraint("ck_observation_origin", "\"Origin\" IN ('student','name-match-v1')");
                    table.ForeignKey(
                        name: "FK_observations_revisions_GraphRevisionId",
                        column: x => x.GraphRevisionId,
                        principalSchema: "graphs",
                        principalTable: "revisions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "relations",
                schema: "graphs",
                columns: table => new
                {
                    RevisionId = table.Column<Guid>(type: "uuid", nullable: false),
                    FromNodeId = table.Column<Guid>(type: "uuid", nullable: false),
                    ToNodeId = table.Column<Guid>(type: "uuid", nullable: false),
                    Relation = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_relations", x => new { x.RevisionId, x.FromNodeId, x.ToNodeId, x.Relation });
                    table.CheckConstraint("ck_graph_no_self", "\"FromNodeId\" <> \"ToNodeId\"");
                    table.CheckConstraint("ck_graph_relation", "\"Relation\" IN ('requires','explains','applies','differsFrom')");
                    table.ForeignKey(
                        name: "FK_relations_nodes_RevisionId_FromNodeId",
                        columns: x => new { x.RevisionId, x.FromNodeId },
                        principalSchema: "graphs",
                        principalTable: "nodes",
                        principalColumns: new[] { "RevisionId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_relations_nodes_RevisionId_ToNodeId",
                        columns: x => new { x.RevisionId, x.ToNodeId },
                        principalSchema: "graphs",
                        principalTable: "nodes",
                        principalColumns: new[] { "RevisionId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "observation_revisions",
                schema: "graphs",
                columns: table => new
                {
                    ObservationId = table.Column<Guid>(type: "uuid", nullable: false),
                    Version = table.Column<int>(type: "integer", nullable: false),
                    GraphRevisionId = table.Column<Guid>(type: "uuid", nullable: false),
                    FromNodeId = table.Column<Guid>(type: "uuid", nullable: false),
                    ToNodeId = table.Column<Guid>(type: "uuid", nullable: true),
                    Relation = table.Column<string>(type: "text", nullable: true),
                    Stage = table.Column<string>(type: "text", nullable: false),
                    Confidence = table.Column<decimal>(type: "numeric", nullable: false),
                    Status = table.Column<string>(type: "text", nullable: false),
                    Reason = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_observation_revisions", x => new { x.ObservationId, x.Version });
                    table.CheckConstraint("ck_observation_confidence", "\"Confidence\" BETWEEN 0 AND 1");
                    table.CheckConstraint("ck_observation_relation", "(\"ToNodeId\" IS NULL AND \"Relation\" IS NULL) OR (\"ToNodeId\" IS NOT NULL AND \"Relation\" IS NOT NULL AND \"Relation\" IN ('requires','explains','applies','differsFrom') AND \"FromNodeId\" <> \"ToNodeId\")");
                    table.CheckConstraint("ck_observation_stage", "\"Stage\" IN ('mention','exploration','understanding')");
                    table.CheckConstraint("ck_observation_status", "\"Status\" IN ('pending','accepted','rejected')");
                    table.CheckConstraint("ck_observation_version", "\"Version\" BETWEEN 1 AND 100");
                    table.ForeignKey(
                        name: "FK_observation_revisions_nodes_GraphRevisionId_FromNodeId",
                        columns: x => new { x.GraphRevisionId, x.FromNodeId },
                        principalSchema: "graphs",
                        principalTable: "nodes",
                        principalColumns: new[] { "RevisionId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_observation_revisions_nodes_GraphRevisionId_ToNodeId",
                        columns: x => new { x.GraphRevisionId, x.ToNodeId },
                        principalSchema: "graphs",
                        principalTable: "nodes",
                        principalColumns: new[] { "RevisionId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_observation_revisions_observations_ObservationId_GraphRevis~",
                        columns: x => new { x.ObservationId, x.GraphRevisionId },
                        principalSchema: "graphs",
                        principalTable: "observations",
                        principalColumns: new[] { "Id", "GraphRevisionId" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_nodes_RevisionId_UnitId_UnitRevisionId_ConceptId",
                schema: "graphs",
                table: "nodes",
                columns: new[] { "RevisionId", "UnitId", "UnitRevisionId", "ConceptId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_observation_revisions_GraphRevisionId_FromNodeId",
                schema: "graphs",
                table: "observation_revisions",
                columns: new[] { "GraphRevisionId", "FromNodeId" });

            migrationBuilder.CreateIndex(
                name: "IX_observation_revisions_GraphRevisionId_ToNodeId",
                schema: "graphs",
                table: "observation_revisions",
                columns: new[] { "GraphRevisionId", "ToNodeId" });

            migrationBuilder.CreateIndex(
                name: "IX_observation_revisions_ObservationId_GraphRevisionId",
                schema: "graphs",
                table: "observation_revisions",
                columns: new[] { "ObservationId", "GraphRevisionId" });

            migrationBuilder.CreateIndex(
                name: "IX_observations_DeduplicationKey",
                schema: "graphs",
                table: "observations",
                column: "DeduplicationKey",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_observations_GraphRevisionId",
                schema: "graphs",
                table: "observations",
                column: "GraphRevisionId");

            migrationBuilder.CreateIndex(
                name: "IX_observations_StudentId_ConversationId_GraphRevisionId",
                schema: "graphs",
                table: "observations",
                columns: new[] { "StudentId", "ConversationId", "GraphRevisionId" });

            migrationBuilder.CreateIndex(
                name: "IX_relations_RevisionId_ToNodeId",
                schema: "graphs",
                table: "relations",
                columns: new[] { "RevisionId", "ToNodeId" });

            migrationBuilder.CreateIndex(
                name: "IX_revisions_GraphId_Number",
                schema: "graphs",
                table: "revisions",
                columns: new[] { "GraphId", "Number" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_revisions_TopicId_GraphId_Number",
                schema: "graphs",
                table: "revisions",
                columns: new[] { "TopicId", "GraphId", "Number" });
            migrationBuilder.Sql("""
                CREATE FUNCTION graphs.reject_mutation() RETURNS trigger AS $$
                BEGIN RAISE EXCEPTION 'Graph snapshots and observation history are immutable' USING ERRCODE = '23514'; END;
                $$ LANGUAGE plpgsql;
                CREATE TRIGGER immutable_graphs BEFORE UPDATE OR DELETE ON graphs.revisions
                    FOR EACH ROW EXECUTE FUNCTION graphs.reject_mutation();
                CREATE TRIGGER immutable_nodes BEFORE UPDATE OR DELETE ON graphs.nodes
                    FOR EACH ROW EXECUTE FUNCTION graphs.reject_mutation();
                CREATE TRIGGER immutable_relations BEFORE UPDATE OR DELETE ON graphs.relations
                    FOR EACH ROW EXECUTE FUNCTION graphs.reject_mutation();
                CREATE TRIGGER immutable_observations BEFORE UPDATE OR DELETE ON graphs.observations
                    FOR EACH ROW EXECUTE FUNCTION graphs.reject_mutation();
                CREATE TRIGGER immutable_corrections BEFORE UPDATE OR DELETE ON graphs.observation_revisions
                    FOR EACH ROW EXECUTE FUNCTION graphs.reject_mutation();
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "observation_revisions",
                schema: "graphs");

            migrationBuilder.DropTable(
                name: "relations",
                schema: "graphs");

            migrationBuilder.DropTable(
                name: "observations",
                schema: "graphs");

            migrationBuilder.DropTable(
                name: "nodes",
                schema: "graphs");

            migrationBuilder.DropTable(
                name: "revisions",
                schema: "graphs");
            migrationBuilder.Sql("DROP FUNCTION graphs.reject_mutation();");
        }
    }
}
