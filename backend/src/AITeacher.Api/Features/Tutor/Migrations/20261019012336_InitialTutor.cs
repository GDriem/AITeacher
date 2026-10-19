using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AITeacher.Api.Features.Tutor.Migrations
{
    /// <inheritdoc />
    public partial class InitialTutor : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "conversations");

            migrationBuilder.CreateTable(
                name: "conversations",
                schema: "conversations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    StudentId = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    UnitId = table.Column<Guid>(type: "uuid", nullable: false),
                    RevisionId = table.Column<Guid>(type: "uuid", nullable: false),
                    Mode = table.Column<string>(type: "text", nullable: false),
                    ActivityId = table.Column<Guid>(type: "uuid", nullable: true),
                    Version = table.Column<long>(type: "bigint", nullable: false),
                    ActiveTurnId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_conversations", x => x.Id);
                    table.UniqueConstraint("AK_conversations_StudentId_Id", x => new { x.StudentId, x.Id });
                    table.CheckConstraint("ck_conversation_mode", "\"Mode\" IN ('chat','reading','practice')");
                    table.CheckConstraint("ck_conversation_version", "\"Version\" > 0");
                });

            migrationBuilder.CreateTable(
                name: "turns",
                schema: "conversations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ConversationId = table.Column<Guid>(type: "uuid", nullable: false),
                    StudentId = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    RequestId = table.Column<Guid>(type: "uuid", nullable: false),
                    InputHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    ReservedVersion = table.Column<long>(type: "bigint", nullable: false),
                    State = table.Column<string>(type: "text", nullable: false),
                    LeaseToken = table.Column<Guid>(type: "uuid", nullable: false),
                    LeaseUntil = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ProviderJson = table.Column<string>(type: "jsonb", nullable: false),
                    ManifestJson = table.Column<string>(type: "jsonb", nullable: false),
                    InputTokens = table.Column<int>(type: "integer", nullable: true),
                    OutputTokens = table.Column<int>(type: "integer", nullable: true),
                    LatencyMs = table.Column<long>(type: "bigint", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_turns", x => x.Id);
                    table.UniqueConstraint("AK_turns_ConversationId_Id", x => new { x.ConversationId, x.Id });
                    table.CheckConstraint("ck_turn_state", "\"State\" IN ('pending','completed','failed')");
                    table.ForeignKey(
                        name: "FK_turns_conversations_StudentId_ConversationId",
                        columns: x => new { x.StudentId, x.ConversationId },
                        principalSchema: "conversations",
                        principalTable: "conversations",
                        principalColumns: new[] { "StudentId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "messages",
                schema: "conversations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ConversationId = table.Column<Guid>(type: "uuid", nullable: false),
                    TurnId = table.Column<Guid>(type: "uuid", nullable: false),
                    Sequence = table.Column<long>(type: "bigint", nullable: false),
                    Role = table.Column<string>(type: "text", nullable: false),
                    Text = table.Column<string>(type: "text", nullable: false),
                    SourcesJson = table.Column<string>(type: "jsonb", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_messages", x => x.Id);
                    table.UniqueConstraint("AK_messages_ConversationId_Id", x => new { x.ConversationId, x.Id });
                    table.CheckConstraint("ck_message_role", "\"Role\" IN ('user','assistant')");
                    table.CheckConstraint("ck_message_text", "length(\"Text\") BETWEEN 1 AND 12000");
                    table.ForeignKey(
                        name: "FK_messages_turns_ConversationId_TurnId",
                        columns: x => new { x.ConversationId, x.TurnId },
                        principalSchema: "conversations",
                        principalTable: "turns",
                        principalColumns: new[] { "ConversationId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "notes",
                schema: "conversations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    StudentId = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    Kind = table.Column<string>(type: "text", nullable: false),
                    Text = table.Column<string>(type: "text", nullable: false),
                    ConversationId = table.Column<Guid>(type: "uuid", nullable: true),
                    MessageId = table.Column<Guid>(type: "uuid", nullable: true),
                    OriginJson = table.Column<string>(type: "jsonb", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_notes", x => x.Id);
                    table.CheckConstraint("ck_note_kind", "\"Kind\" IN ('student','savedMessage','summary')");
                    table.CheckConstraint("ck_note_text", "length(\"Text\") BETWEEN 1 AND 12000");
                    table.CheckConstraint("ck_note_version", "\"Version\" > 0");
                    table.ForeignKey(
                        name: "FK_notes_conversations_StudentId_ConversationId",
                        columns: x => new { x.StudentId, x.ConversationId },
                        principalSchema: "conversations",
                        principalTable: "conversations",
                        principalColumns: new[] { "StudentId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_notes_messages_ConversationId_MessageId",
                        columns: x => new { x.ConversationId, x.MessageId },
                        principalSchema: "conversations",
                        principalTable: "messages",
                        principalColumns: new[] { "ConversationId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_conversations_StudentId_CreatedAt_Id",
                schema: "conversations",
                table: "conversations",
                columns: new[] { "StudentId", "CreatedAt", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_messages_ConversationId_Sequence",
                schema: "conversations",
                table: "messages",
                columns: new[] { "ConversationId", "Sequence" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_messages_ConversationId_TurnId",
                schema: "conversations",
                table: "messages",
                columns: new[] { "ConversationId", "TurnId" });

            migrationBuilder.CreateIndex(
                name: "IX_messages_TurnId_Role",
                schema: "conversations",
                table: "messages",
                columns: new[] { "TurnId", "Role" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_notes_ConversationId_MessageId",
                schema: "conversations",
                table: "notes",
                columns: new[] { "ConversationId", "MessageId" });

            migrationBuilder.CreateIndex(
                name: "IX_notes_StudentId_ConversationId",
                schema: "conversations",
                table: "notes",
                columns: new[] { "StudentId", "ConversationId" });

            migrationBuilder.CreateIndex(
                name: "IX_notes_StudentId_CreatedAt_Id",
                schema: "conversations",
                table: "notes",
                columns: new[] { "StudentId", "CreatedAt", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_turns_StudentId_ConversationId",
                schema: "conversations",
                table: "turns",
                columns: new[] { "StudentId", "ConversationId" });

            migrationBuilder.CreateIndex(
                name: "IX_turns_StudentId_RequestId",
                schema: "conversations",
                table: "turns",
                columns: new[] { "StudentId", "RequestId" },
                unique: true);
            migrationBuilder.Sql("""
                CREATE FUNCTION conversations.reject_message_mutation() RETURNS trigger AS $$
                BEGIN RAISE EXCEPTION 'Conversation messages are immutable' USING ERRCODE = '23514'; END;
                $$ LANGUAGE plpgsql;
                CREATE TRIGGER immutable_messages BEFORE UPDATE OR DELETE ON conversations.messages
                    FOR EACH ROW EXECUTE FUNCTION conversations.reject_message_mutation();
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "notes",
                schema: "conversations");

            migrationBuilder.DropTable(
                name: "messages",
                schema: "conversations");

            migrationBuilder.DropTable(
                name: "turns",
                schema: "conversations");

            migrationBuilder.DropTable(
                name: "conversations",
                schema: "conversations");
            migrationBuilder.Sql("DROP FUNCTION conversations.reject_message_mutation();");
        }
    }
}
