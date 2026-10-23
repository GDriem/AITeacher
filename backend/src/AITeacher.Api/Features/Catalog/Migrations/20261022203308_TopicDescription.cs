using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AITeacher.Api.Features.Catalog.Migrations
{
    /// <inheritdoc />
    public partial class TopicDescription : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Description",
                schema: "curriculum",
                table: "topics",
                type: "character varying(600)",
                maxLength: 600,
                nullable: true);

            migrationBuilder.AddCheckConstraint(
                name: "ck_topics_description",
                schema: "curriculum",
                table: "topics",
                sql: "\"Description\" IS NULL OR length(btrim(\"Description\")) > 0");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_topics_description",
                schema: "curriculum",
                table: "topics");

            migrationBuilder.DropColumn(
                name: "Description",
                schema: "curriculum",
                table: "topics");
        }
    }
}
