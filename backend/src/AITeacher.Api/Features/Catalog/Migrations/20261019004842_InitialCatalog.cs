using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AITeacher.Api.Features.Catalog.Migrations
{
    /// <inheritdoc />
    public partial class InitialCatalog : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "curriculum");

            migrationBuilder.CreateTable(
                name: "level_scales",
                schema: "curriculum",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    Slug = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    IsAvailable = table.Column<bool>(type: "boolean", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false),
                    Purpose = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_level_scales", x => x.Id);
                    table.CheckConstraint("ck_level_scales_name", "length(btrim(\"Name\")) > 0");
                    table.CheckConstraint("ck_level_scales_order", "\"SortOrder\" >= 0");
                    table.CheckConstraint("ck_level_scales_slug", "\"Slug\" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'");
                    table.CheckConstraint("ck_level_scales_version", "\"Version\" > 0");
                    table.CheckConstraint("ck_scale_purpose", "\"Purpose\" IN ('difficulty', 'proficiency', 'mastery')");
                });

            migrationBuilder.CreateTable(
                name: "subjects",
                schema: "curriculum",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    Slug = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    IsAvailable = table.Column<bool>(type: "boolean", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_subjects", x => x.Id);
                    table.CheckConstraint("ck_subjects_name", "length(btrim(\"Name\")) > 0");
                    table.CheckConstraint("ck_subjects_order", "\"SortOrder\" >= 0");
                    table.CheckConstraint("ck_subjects_slug", "\"Slug\" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'");
                    table.CheckConstraint("ck_subjects_version", "\"Version\" > 0");
                });

            migrationBuilder.CreateTable(
                name: "levels",
                schema: "curriculum",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    Slug = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    IsAvailable = table.Column<bool>(type: "boolean", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false),
                    ScaleId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_levels", x => x.Id);
                    table.CheckConstraint("ck_levels_name", "length(btrim(\"Name\")) > 0");
                    table.CheckConstraint("ck_levels_order", "\"SortOrder\" >= 0");
                    table.CheckConstraint("ck_levels_slug", "\"Slug\" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'");
                    table.CheckConstraint("ck_levels_version", "\"Version\" > 0");
                    table.ForeignKey(
                        name: "FK_levels_level_scales_ScaleId",
                        column: x => x.ScaleId,
                        principalSchema: "curriculum",
                        principalTable: "level_scales",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "categories",
                schema: "curriculum",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    Slug = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    IsAvailable = table.Column<bool>(type: "boolean", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false),
                    SubjectId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_categories", x => x.Id);
                    table.UniqueConstraint("AK_categories_SubjectId_Id", x => new { x.SubjectId, x.Id });
                    table.CheckConstraint("ck_categories_name", "length(btrim(\"Name\")) > 0");
                    table.CheckConstraint("ck_categories_order", "\"SortOrder\" >= 0");
                    table.CheckConstraint("ck_categories_slug", "\"Slug\" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'");
                    table.CheckConstraint("ck_categories_version", "\"Version\" > 0");
                    table.ForeignKey(
                        name: "FK_categories_subjects_SubjectId",
                        column: x => x.SubjectId,
                        principalSchema: "curriculum",
                        principalTable: "subjects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "topics",
                schema: "curriculum",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    Slug = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    IsAvailable = table.Column<bool>(type: "boolean", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false),
                    SubjectId = table.Column<Guid>(type: "uuid", nullable: false),
                    CategoryId = table.Column<Guid>(type: "uuid", nullable: false),
                    LevelId = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_topics", x => x.Id);
                    table.CheckConstraint("ck_topics_name", "length(btrim(\"Name\")) > 0");
                    table.CheckConstraint("ck_topics_order", "\"SortOrder\" >= 0");
                    table.CheckConstraint("ck_topics_slug", "\"Slug\" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'");
                    table.CheckConstraint("ck_topics_version", "\"Version\" > 0");
                    table.ForeignKey(
                        name: "FK_topics_categories_SubjectId_CategoryId",
                        columns: x => new { x.SubjectId, x.CategoryId },
                        principalSchema: "curriculum",
                        principalTable: "categories",
                        principalColumns: new[] { "SubjectId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_topics_levels_LevelId",
                        column: x => x.LevelId,
                        principalSchema: "curriculum",
                        principalTable: "levels",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_categories_SubjectId_Slug",
                schema: "curriculum",
                table: "categories",
                columns: new[] { "SubjectId", "Slug" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_level_scales_Slug",
                schema: "curriculum",
                table: "level_scales",
                column: "Slug",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_levels_ScaleId_Slug",
                schema: "curriculum",
                table: "levels",
                columns: new[] { "ScaleId", "Slug" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_subjects_Slug",
                schema: "curriculum",
                table: "subjects",
                column: "Slug",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_topics_CategoryId_Slug",
                schema: "curriculum",
                table: "topics",
                columns: new[] { "CategoryId", "Slug" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_topics_LevelId",
                schema: "curriculum",
                table: "topics",
                column: "LevelId");

            migrationBuilder.CreateIndex(
                name: "IX_topics_SubjectId_CategoryId",
                schema: "curriculum",
                table: "topics",
                columns: new[] { "SubjectId", "CategoryId" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "topics",
                schema: "curriculum");

            migrationBuilder.DropTable(
                name: "categories",
                schema: "curriculum");

            migrationBuilder.DropTable(
                name: "levels",
                schema: "curriculum");

            migrationBuilder.DropTable(
                name: "subjects",
                schema: "curriculum");

            migrationBuilder.DropTable(
                name: "level_scales",
                schema: "curriculum");
        }
    }
}
