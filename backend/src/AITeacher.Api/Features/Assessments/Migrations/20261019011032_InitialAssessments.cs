using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AITeacher.Api.Features.Assessments.Migrations
{
    /// <inheritdoc />
    public partial class InitialAssessments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "assessments");

            migrationBuilder.CreateTable(
                name: "revisions",
                schema: "assessments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ResourceId = table.Column<Guid>(type: "uuid", nullable: false),
                    Number = table.Column<int>(type: "integer", nullable: false),
                    Kind = table.Column<string>(type: "text", nullable: false),
                    DocumentJson = table.Column<string>(type: "jsonb", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_revisions", x => x.Id);
                    table.CheckConstraint("ck_assessment_revision", "\"Number\" > 0 AND \"Kind\" IN ('question','definition')");
                });

            migrationBuilder.CreateTable(
                name: "attempts",
                schema: "assessments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    StudentId = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    RequestId = table.Column<Guid>(type: "uuid", nullable: false),
                    DefinitionId = table.Column<Guid>(type: "uuid", nullable: false),
                    DefinitionRevisionId = table.Column<Guid>(type: "uuid", nullable: false),
                    StartedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ExpiresAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    SubmittedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    AnswersJson = table.Column<string>(type: "jsonb", nullable: true),
                    ScoresJson = table.Column<string>(type: "jsonb", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_attempts", x => x.Id);
                    table.CheckConstraint("ck_attempt_submission", "(\"SubmittedAt\" IS NULL AND \"AnswersJson\" IS NULL AND \"ScoresJson\" IS NULL) OR (\"SubmittedAt\" IS NOT NULL AND \"AnswersJson\" IS NOT NULL AND \"ScoresJson\" IS NOT NULL)");
                    table.CheckConstraint("ck_attempt_times", "\"ExpiresAt\" > \"StartedAt\"");
                    table.ForeignKey(
                        name: "FK_attempts_revisions_DefinitionRevisionId",
                        column: x => x.DefinitionRevisionId,
                        principalSchema: "assessments",
                        principalTable: "revisions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "evidence_outbox",
                schema: "assessments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    AttemptId = table.Column<Guid>(type: "uuid", nullable: false),
                    QuestionRevisionId = table.Column<Guid>(type: "uuid", nullable: false),
                    ConceptId = table.Column<Guid>(type: "uuid", nullable: false),
                    PayloadJson = table.Column<string>(type: "jsonb", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_evidence_outbox", x => x.Id);
                    table.ForeignKey(
                        name: "FK_evidence_outbox_attempts_AttemptId",
                        column: x => x.AttemptId,
                        principalSchema: "assessments",
                        principalTable: "attempts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_evidence_outbox_revisions_QuestionRevisionId",
                        column: x => x.QuestionRevisionId,
                        principalSchema: "assessments",
                        principalTable: "revisions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_attempts_DefinitionRevisionId",
                schema: "assessments",
                table: "attempts",
                column: "DefinitionRevisionId");

            migrationBuilder.CreateIndex(
                name: "IX_attempts_StudentId_DefinitionId",
                schema: "assessments",
                table: "attempts",
                columns: new[] { "StudentId", "DefinitionId" });

            migrationBuilder.CreateIndex(
                name: "IX_attempts_StudentId_RequestId",
                schema: "assessments",
                table: "attempts",
                columns: new[] { "StudentId", "RequestId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_evidence_outbox_AttemptId_QuestionRevisionId_ConceptId",
                schema: "assessments",
                table: "evidence_outbox",
                columns: new[] { "AttemptId", "QuestionRevisionId", "ConceptId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_evidence_outbox_QuestionRevisionId",
                schema: "assessments",
                table: "evidence_outbox",
                column: "QuestionRevisionId");

            migrationBuilder.CreateIndex(
                name: "IX_revisions_Kind_ResourceId_Number",
                schema: "assessments",
                table: "revisions",
                columns: new[] { "Kind", "ResourceId", "Number" },
                unique: true);
            migrationBuilder.Sql("""
                CREATE FUNCTION assessments.reject_snapshot_change() RETURNS trigger LANGUAGE plpgsql AS $$
                BEGIN RAISE EXCEPTION 'Assessment snapshots are immutable' USING ERRCODE = '23514'; END $$;
                CREATE TRIGGER immutable_revision BEFORE UPDATE OR DELETE ON assessments.revisions
                    FOR EACH ROW EXECUTE FUNCTION assessments.reject_snapshot_change();
                CREATE TRIGGER immutable_evidence BEFORE UPDATE OR DELETE ON assessments.evidence_outbox
                    FOR EACH ROW EXECUTE FUNCTION assessments.reject_snapshot_change();
                CREATE FUNCTION assessments.protect_attempt() RETURNS trigger LANGUAGE plpgsql AS $$
                BEGIN
                    IF TG_OP = 'DELETE' THEN
                        RAISE EXCEPTION 'Attempts cannot be deleted' USING ERRCODE = '23514';
                    END IF;
                    IF OLD."SubmittedAt" IS NOT NULL OR
                       (to_jsonb(OLD) - 'SubmittedAt' - 'AnswersJson' - 'ScoresJson') IS DISTINCT FROM
                       (to_jsonb(NEW) - 'SubmittedAt' - 'AnswersJson' - 'ScoresJson') THEN
                        RAISE EXCEPTION 'Attempt snapshot is immutable' USING ERRCODE = '23514';
                    END IF;
                    IF NEW."SubmittedAt" < NEW."StartedAt" OR NEW."SubmittedAt" >= NEW."ExpiresAt" THEN
                        RAISE EXCEPTION 'Submission outside attempt window' USING ERRCODE = '23514';
                    END IF;
                    RETURN NEW;
                END $$;
                CREATE TRIGGER protect_attempt BEFORE UPDATE OR DELETE ON assessments.attempts
                    FOR EACH ROW EXECUTE FUNCTION assessments.protect_attempt();
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "evidence_outbox",
                schema: "assessments");

            migrationBuilder.DropTable(
                name: "attempts",
                schema: "assessments");

            migrationBuilder.DropTable(
                name: "revisions",
                schema: "assessments");
            migrationBuilder.Sql("DROP FUNCTION assessments.reject_snapshot_change(); DROP FUNCTION assessments.protect_attempt();");
        }
    }
}
