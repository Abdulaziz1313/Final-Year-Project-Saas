using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LearningPlatform.Infrastructure.Migrations
{
    public partial class ResetQuizzes : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Drop in dependency order (children first, then parents)
            migrationBuilder.DropTable(
                name: "QuizAttemptAnswers");

            migrationBuilder.DropTable(
                name: "QuizChoices");

            migrationBuilder.DropTable(
                name: "QuizAttempts");

            migrationBuilder.DropTable(
                name: "QuizQuestions");

            migrationBuilder.DropTable(
                name: "Quizzes");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Intentionally left empty.
            // This migration is a reset step. Recreating old schema is not required.
        }
    }
}
