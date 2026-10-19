using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AITeacher.Api.Features.Editorial.Migrations
{
    /// <inheritdoc />
    public partial class InitialEditorial : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "content");

            migrationBuilder.CreateTable(
                name: "publications",
                schema: "content",
                columns: table => new
                {
                    RevisionId = table.Column<Guid>(type: "uuid", nullable: false),
                    PublishedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    PublishedBy = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_publications", x => x.RevisionId);
                });

            migrationBuilder.CreateTable(
                name: "unit_revisions",
                schema: "content",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UnitId = table.Column<Guid>(type: "uuid", nullable: false),
                    Number = table.Column<int>(type: "integer", nullable: false),
                    DocumentJson = table.Column<string>(type: "jsonb", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    OriginJson = table.Column<string>(type: "jsonb", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_unit_revisions", x => x.Id);
                    table.UniqueConstraint("AK_unit_revisions_UnitId_Id", x => new { x.UnitId, x.Id });
                    table.CheckConstraint("ck_revision_number", "\"Number\" > 0");
                });

            migrationBuilder.CreateTable(
                name: "units",
                schema: "content",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TopicId = table.Column<Guid>(type: "uuid", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false),
                    RevisionCount = table.Column<int>(type: "integer", nullable: false),
                    PublishedRevisionId = table.Column<Guid>(type: "uuid", nullable: true),
                    ImportKey = table.Column<string>(type: "character varying(250)", maxLength: 250, nullable: true),
                    ImportHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_units", x => x.Id);
                    table.CheckConstraint("ck_unit_import", "(\"ImportKey\" IS NULL) = (\"ImportHash\" IS NULL)");
                    table.CheckConstraint("ck_unit_topic", "\"TopicId\" <> '00000000-0000-0000-0000-000000000000'");
                    table.CheckConstraint("ck_unit_version", "\"Version\" > 0 AND \"RevisionCount\" > 0");
                    table.ForeignKey(
                        name: "FK_units_unit_revisions_Id_PublishedRevisionId",
                        columns: x => new { x.Id, x.PublishedRevisionId },
                        principalSchema: "content",
                        principalTable: "unit_revisions",
                        principalColumns: new[] { "UnitId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_unit_revisions_UnitId_Number",
                schema: "content",
                table: "unit_revisions",
                columns: new[] { "UnitId", "Number" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_units_Id_PublishedRevisionId",
                schema: "content",
                table: "units",
                columns: new[] { "Id", "PublishedRevisionId" });

            migrationBuilder.CreateIndex(
                name: "IX_units_ImportKey",
                schema: "content",
                table: "units",
                column: "ImportKey",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_units_TopicId",
                schema: "content",
                table: "units",
                column: "TopicId");

            migrationBuilder.AddForeignKey(
                name: "FK_publications_unit_revisions_RevisionId",
                schema: "content",
                table: "publications",
                column: "RevisionId",
                principalSchema: "content",
                principalTable: "unit_revisions",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_unit_revisions_units_UnitId",
                schema: "content",
                table: "unit_revisions",
                column: "UnitId",
                principalSchema: "content",
                principalTable: "units",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
            // Snapshots and first-publication provenance are append-only, including direct SQL writes.
            migrationBuilder.Sql("""
                CREATE FUNCTION content.reject_editorial_mutation() RETURNS trigger
                LANGUAGE plpgsql AS $$
                BEGIN
                    RAISE EXCEPTION 'Editorial snapshots are immutable' USING ERRCODE = '23514';
                END;
                $$;
                CREATE TRIGGER immutable_unit_revision BEFORE UPDATE OR DELETE ON content.unit_revisions
                    FOR EACH ROW EXECUTE FUNCTION content.reject_editorial_mutation();
                CREATE TRIGGER immutable_publication BEFORE UPDATE OR DELETE ON content.publications
                    FOR EACH ROW EXECUTE FUNCTION content.reject_editorial_mutation();
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_units_unit_revisions_Id_PublishedRevisionId",
                schema: "content",
                table: "units");

            migrationBuilder.DropTable(
                name: "publications",
                schema: "content");

            migrationBuilder.DropTable(
                name: "unit_revisions",
                schema: "content");

            migrationBuilder.DropTable(
                name: "units",
                schema: "content");
            migrationBuilder.Sql("DROP FUNCTION content.reject_editorial_mutation();");
        }
    }
}
