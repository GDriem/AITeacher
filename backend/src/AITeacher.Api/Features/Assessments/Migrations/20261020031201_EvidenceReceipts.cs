using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AITeacher.Api.Features.Assessments.Migrations
{
    /// <inheritdoc />
    public partial class EvidenceReceipts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "evidence_receipts",
                schema: "assessments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_evidence_receipts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_evidence_receipts_evidence_outbox_Id",
                        column: x => x.Id,
                        principalSchema: "assessments",
                        principalTable: "evidence_outbox",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "evidence_receipts",
                schema: "assessments");
        }
    }
}
