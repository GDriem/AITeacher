using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AITeacher.Api.Features.Learning.Migrations
{
    /// <inheritdoc />
    public partial class InitialLearning : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "learning");

            migrationBuilder.CreateTable(
                name: "evidence",
                schema: "learning",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    StudentId = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    AttemptId = table.Column<Guid>(type: "uuid", nullable: false),
                    DefinitionRevisionId = table.Column<Guid>(type: "uuid", nullable: false),
                    QuestionRevisionId = table.Column<Guid>(type: "uuid", nullable: false),
                    UnitRevisionId = table.Column<Guid>(type: "uuid", nullable: false),
                    ConceptId = table.Column<Guid>(type: "uuid", nullable: false),
                    Fraction = table.Column<decimal>(type: "numeric", nullable: false),
                    Assistance = table.Column<string>(type: "text", nullable: false),
                    Source = table.Column<string>(type: "text", nullable: false),
                    ObservedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    PayloadJson = table.Column<string>(type: "jsonb", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_evidence", x => x.Id);
                    table.CheckConstraint("ck_learning_fraction", "\"Fraction\" >= 0 AND \"Fraction\" <= 1");
                });

            migrationBuilder.CreateTable(
                name: "reviews",
                schema: "learning",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    StudentId = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    RequestId = table.Column<Guid>(type: "uuid", nullable: false),
                    EvidenceId = table.Column<Guid>(type: "uuid", nullable: false),
                    DefinitionRevisionId = table.Column<Guid>(type: "uuid", nullable: false),
                    DueAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CompletedAttemptId = table.Column<Guid>(type: "uuid", nullable: true),
                    CompletedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_reviews", x => x.Id);
                    table.CheckConstraint("ck_learning_review", "\"DueAt\" > \"CreatedAt\" AND ((\"CompletedAt\" IS NULL AND \"CompletedAttemptId\" IS NULL) OR (\"CompletedAt\" IS NOT NULL AND \"CompletedAttemptId\" IS NOT NULL AND \"CompletedAt\" >= \"DueAt\"))");
                    table.ForeignKey(
                        name: "FK_reviews_evidence_EvidenceId",
                        column: x => x.EvidenceId,
                        principalSchema: "learning",
                        principalTable: "evidence",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_evidence_StudentId_UnitRevisionId_ConceptId",
                schema: "learning",
                table: "evidence",
                columns: new[] { "StudentId", "UnitRevisionId", "ConceptId" });

            migrationBuilder.CreateIndex(
                name: "IX_reviews_EvidenceId",
                schema: "learning",
                table: "reviews",
                column: "EvidenceId");

            migrationBuilder.CreateIndex(
                name: "IX_reviews_StudentId_CompletedAttemptId",
                schema: "learning",
                table: "reviews",
                columns: new[] { "StudentId", "CompletedAttemptId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_reviews_StudentId_RequestId",
                schema: "learning",
                table: "reviews",
                columns: new[] { "StudentId", "RequestId" },
                unique: true);
            migrationBuilder.Sql("""
                CREATE FUNCTION learning.protect_history() RETURNS trigger LANGUAGE plpgsql AS $$
                BEGIN
                    IF TG_TABLE_NAME = 'evidence' OR TG_OP = 'DELETE' THEN
                        RAISE EXCEPTION 'Learning evidence and history are immutable' USING ERRCODE = '23514';
                    END IF;
                    IF OLD."CompletedAt" IS NOT NULL OR
                       (to_jsonb(OLD) - 'CompletedAt' - 'CompletedAttemptId') IS DISTINCT FROM
                       (to_jsonb(NEW) - 'CompletedAt' - 'CompletedAttemptId') THEN
                        RAISE EXCEPTION 'Review schedule is immutable' USING ERRCODE = '23514';
                    END IF;
                    RETURN NEW;
                END $$;
                CREATE TRIGGER immutable_evidence BEFORE UPDATE OR DELETE ON learning.evidence FOR EACH ROW EXECUTE FUNCTION learning.protect_history();
                CREATE TRIGGER protect_review BEFORE UPDATE OR DELETE ON learning.reviews FOR EACH ROW EXECUTE FUNCTION learning.protect_history();
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "reviews",
                schema: "learning");

            migrationBuilder.DropTable(
                name: "evidence",
                schema: "learning");
            migrationBuilder.Sql("DROP FUNCTION learning.protect_history();");
        }
    }
}
