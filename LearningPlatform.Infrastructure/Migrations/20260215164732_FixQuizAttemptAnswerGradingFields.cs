using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LearningPlatform.Infrastructure.Migrations
{
    public partial class FixQuizAttemptAnswerGradingFields : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Add EarnedPoints if it doesn't exist
            migrationBuilder.Sql(@"
IF COL_LENGTH('dbo.QuizAttemptAnswers', 'EarnedPoints') IS NULL
BEGIN
    ALTER TABLE dbo.QuizAttemptAnswers
    ADD EarnedPoints int NOT NULL CONSTRAINT DF_QuizAttemptAnswers_EarnedPoints DEFAULT(0);
END
");

            // Add IsCorrect if it doesn't exist
            migrationBuilder.Sql(@"
IF COL_LENGTH('dbo.QuizAttemptAnswers', 'IsCorrect') IS NULL
BEGIN
    ALTER TABLE dbo.QuizAttemptAnswers
    ADD IsCorrect bit NULL;
END
");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Remove columns only if they exist (avoid errors)
            migrationBuilder.Sql(@"
IF COL_LENGTH('dbo.QuizAttemptAnswers', 'IsCorrect') IS NOT NULL
BEGIN
    ALTER TABLE dbo.QuizAttemptAnswers DROP COLUMN IsCorrect;
END
");

            migrationBuilder.Sql(@"
IF COL_LENGTH('dbo.QuizAttemptAnswers', 'EarnedPoints') IS NOT NULL
BEGIN
    -- Drop default constraint if present (name might vary)
    DECLARE @dfName nvarchar(128);
    SELECT @dfName = dc.name
    FROM sys.default_constraints dc
    INNER JOIN sys.columns c
        ON c.default_object_id = dc.object_id
    INNER JOIN sys.tables t
        ON t.object_id = c.object_id
    WHERE t.name = 'QuizAttemptAnswers' AND c.name = 'EarnedPoints';

    IF @dfName IS NOT NULL
        EXEC('ALTER TABLE dbo.QuizAttemptAnswers DROP CONSTRAINT ' + @dfName);

    ALTER TABLE dbo.QuizAttemptAnswers DROP COLUMN EarnedPoints;
END
");
        }
    }
}
