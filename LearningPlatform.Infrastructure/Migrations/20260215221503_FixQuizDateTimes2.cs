using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LearningPlatform.Infrastructure.Migrations
{
    public partial class FixQuizDateTimes2 : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Drop index if it exists
            migrationBuilder.Sql(@"
IF EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = N'IX_QuizQuestions_QuizId1'
      AND object_id = OBJECT_ID(N'[QuizQuestions]')
)
BEGIN
    DROP INDEX [IX_QuizQuestions_QuizId1] ON [QuizQuestions];
END
");

            // Drop column if it exists
            migrationBuilder.Sql(@"
IF EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE name = N'QuizId1'
      AND object_id = OBJECT_ID(N'[QuizQuestions]')
)
BEGIN
    ALTER TABLE [QuizQuestions] DROP COLUMN [QuizId1];
END
");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Re-add the column only if it does not exist
            migrationBuilder.Sql(@"
IF NOT EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE name = N'QuizId1'
      AND object_id = OBJECT_ID(N'[QuizQuestions]')
)
BEGIN
    ALTER TABLE [QuizQuestions]
    ADD [QuizId1] uniqueidentifier NOT NULL
        CONSTRAINT [DF_QuizQuestions_QuizId1] DEFAULT ('00000000-0000-0000-0000-000000000000');
END
");

            // Re-create the index only if it does not exist
            migrationBuilder.Sql(@"
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = N'IX_QuizQuestions_QuizId1'
      AND object_id = OBJECT_ID(N'[QuizQuestions]')
)
BEGIN
    CREATE INDEX [IX_QuizQuestions_QuizId1] ON [QuizQuestions]([QuizId1]);
END
");
        }
    }
}
