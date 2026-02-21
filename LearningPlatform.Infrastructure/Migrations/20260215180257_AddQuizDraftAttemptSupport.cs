using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LearningPlatform.Infrastructure.Migrations
{
    public partial class AddQuizDraftAttemptSupport : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // 1) Make SubmittedAt nullable (draft attempts)
            migrationBuilder.AlterColumn<DateTimeOffset>(
                name: "SubmittedAt",
                table: "QuizAttempts",
                type: "datetimeoffset",
                nullable: true,
                oldClrType: typeof(DateTimeOffset),
                oldType: "datetimeoffset");

            // 2) Add UpdatedAt (for autosave / draft updates)
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "UpdatedAt",
                table: "QuizAttempts",
                type: "datetimeoffset",
                nullable: false,
                defaultValueSql: "SYSUTCDATETIME()");

            // ✅ DO NOT add StartedAt here because it already exists in your DB/table.
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "UpdatedAt",
                table: "QuizAttempts");

            migrationBuilder.AlterColumn<DateTimeOffset>(
                name: "SubmittedAt",
                table: "QuizAttempts",
                type: "datetimeoffset",
                nullable: false,
                defaultValueSql: "SYSUTCDATETIME()",
                oldClrType: typeof(DateTimeOffset),
                oldType: "datetimeoffset",
                oldNullable: true);
        }
    }
}
