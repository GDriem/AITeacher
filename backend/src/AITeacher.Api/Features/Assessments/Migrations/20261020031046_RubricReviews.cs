using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AITeacher.Api.Features.Assessments.Migrations
{
    /// <inheritdoc />
    public partial class RubricReviews : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "reviews",
                schema: "assessments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    AttemptId = table.Column<Guid>(type: "uuid", nullable: false),
                    RequestId = table.Column<Guid>(type: "uuid", nullable: false),
                    ReviewerId = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    GradesJson = table.Column<string>(type: "jsonb", nullable: false),
                    ScoresJson = table.Column<string>(type: "jsonb", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_reviews", x => x.Id);
                    table.ForeignKey(
                        name: "FK_reviews_attempts_AttemptId",
                        column: x => x.AttemptId,
                        principalSchema: "assessments",
                        principalTable: "attempts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_reviews_AttemptId",
                schema: "assessments",
                table: "reviews",
                column: "AttemptId",
                unique: true);
            migrationBuilder.Sql("CREATE TRIGGER immutable_review BEFORE UPDATE OR DELETE ON assessments.reviews FOR EACH ROW EXECUTE FUNCTION assessments.reject_snapshot_change();");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "reviews",
                schema: "assessments");
        }
    }
}
