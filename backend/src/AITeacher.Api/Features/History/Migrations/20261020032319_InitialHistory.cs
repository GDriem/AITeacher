using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AITeacher.Api.Features.History.Migrations
{
    /// <inheritdoc />
    public partial class InitialHistory : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "history");

            migrationBuilder.CreateTable(
                name: "batches",
                schema: "history",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Source = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    Hash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    State = table.Column<string>(type: "text", nullable: false),
                    ImportedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_batches", x => x.Id);
                    table.CheckConstraint("ck_history_state", "\"State\" IN ('active','rolledBack')");
                });

            migrationBuilder.CreateTable(
                name: "documents",
                schema: "history",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    BatchId = table.Column<Guid>(type: "uuid", nullable: false),
                    Source = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    Kind = table.Column<string>(type: "text", nullable: false),
                    SourceId = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    StudentId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Hash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Payload = table.Column<string>(type: "jsonb", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_documents", x => x.Id);
                    table.CheckConstraint("ck_history_kind", "\"Kind\" IN ('conversation','progress')");
                    table.ForeignKey(
                        name: "FK_documents_batches_BatchId",
                        column: x => x.BatchId,
                        principalSchema: "history",
                        principalTable: "batches",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.Sql("""
                CREATE FUNCTION history.prevent_document_update() RETURNS trigger LANGUAGE plpgsql AS $$
                BEGIN RAISE EXCEPTION 'Historical documents are immutable'; END; $$;
                CREATE TRIGGER history_document_immutable BEFORE UPDATE ON history.documents
                FOR EACH ROW EXECUTE FUNCTION history.prevent_document_update();
                """);

            migrationBuilder.CreateIndex(
                name: "IX_documents_BatchId",
                schema: "history",
                table: "documents",
                column: "BatchId");

            migrationBuilder.CreateIndex(
                name: "IX_documents_Source_Kind_SourceId",
                schema: "history",
                table: "documents",
                columns: new[] { "Source", "Kind", "SourceId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_documents_StudentId_Kind_Id",
                schema: "history",
                table: "documents",
                columns: new[] { "StudentId", "Kind", "Id" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "documents",
                schema: "history");

            migrationBuilder.Sql("DROP FUNCTION history.prevent_document_update();");
            migrationBuilder.DropTable(
                name: "batches",
                schema: "history");
        }
    }
}
