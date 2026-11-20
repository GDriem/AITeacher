using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AITeacher.Api.Features.Learning.Migrations
{
    /// <inheritdoc />
    public partial class CoursesAndCertificates : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "certificates",
                schema: "learning",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    StudentId = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    SubjectId = table.Column<Guid>(type: "uuid", nullable: false),
                    Code = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    StudentName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    CourseName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    UnitCount = table.Column<int>(type: "integer", nullable: false),
                    AverageFraction = table.Column<decimal>(type: "numeric", nullable: false),
                    IssuedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_certificates", x => x.Id);
                    table.CheckConstraint("ck_learning_certificate", "\"UnitCount\" > 0 AND \"AverageFraction\" >= 0 AND \"AverageFraction\" <= 1");
                });

            migrationBuilder.CreateTable(
                name: "enrollments",
                schema: "learning",
                columns: table => new
                {
                    StudentId = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    SubjectId = table.Column<Guid>(type: "uuid", nullable: false),
                    EnrolledAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_enrollments", x => new { x.StudentId, x.SubjectId });
                });

            migrationBuilder.CreateIndex(
                name: "IX_certificates_Code",
                schema: "learning",
                table: "certificates",
                column: "Code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_certificates_StudentId_SubjectId",
                schema: "learning",
                table: "certificates",
                columns: new[] { "StudentId", "SubjectId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "certificates",
                schema: "learning");

            migrationBuilder.DropTable(
                name: "enrollments",
                schema: "learning");
        }
    }
}
