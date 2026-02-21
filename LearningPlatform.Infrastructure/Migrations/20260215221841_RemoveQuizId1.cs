using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LearningPlatform.Infrastructure.Migrations
{
    public partial class RemoveQuizId1 : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
-- 1) Drop ANY FK that uses QuizId1 (even if the name is different)
DECLARE @fkName sysname;

SELECT TOP(1) @fkName = fk.name
FROM sys.foreign_keys fk
JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
JOIN sys.columns col ON col.object_id = fkc.parent_object_id AND col.column_id = fkc.parent_column_id
WHERE fk.parent_object_id = OBJECT_ID(N'[QuizQuestions]')
  AND col.name = N'QuizId1';

IF @fkName IS NOT NULL
BEGIN
    EXEC(N'ALTER TABLE [QuizQuestions] DROP CONSTRAINT [' + @fkName + '];');
END

-- 2) Drop index if it exists
IF EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = N'IX_QuizQuestions_QuizId1'
      AND object_id = OBJECT_ID(N'[QuizQuestions]')
)
BEGIN
    DROP INDEX [IX_QuizQuestions_QuizId1] ON [QuizQuestions];
END

-- 3) Drop column if it exists
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
            migrationBuilder.Sql(@"
-- Recreate QuizId1 only if missing
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

-- Recreate index only if missing
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = N'IX_QuizQuestions_QuizId1'
      AND object_id = OBJECT_ID(N'[QuizQuestions]')
)
BEGIN
    CREATE INDEX [IX_QuizQuestions_QuizId1] ON [QuizQuestions]([QuizId1]);
END

-- Recreate FK only if missing
IF NOT EXISTS (
    SELECT 1
    FROM sys.foreign_keys
    WHERE name = N'FK_QuizQuestions_Quizzes_QuizId1'
      AND parent_object_id = OBJECT_ID(N'[QuizQuestions]')
)
BEGIN
    ALTER TABLE [QuizQuestions]
    ADD CONSTRAINT [FK_QuizQuestions_Quizzes_QuizId1]
    FOREIGN KEY ([QuizId1]) REFERENCES [Quizzes]([Id]) ON DELETE NO ACTION;
END
");
        }
    }
}
