using LearningPlatform.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace LearningPlatform.Application.Common.Interfaces;

public interface IAppDbContext
{
    DbSet<Organization> Organizations { get; }
    DbSet<Academy> Academies { get; }
    DbSet<Course> Courses { get; }
    DbSet<Module> Modules { get; }
    DbSet<Lesson> Lessons { get; }
    DbSet<Enrollment> Enrollments { get; }
    DbSet<LessonProgress> LessonProgress { get; }
    DbSet<Notification> Notifications { get; }
    DbSet<PendingRegistration> PendingRegistrations { get; }
    DbSet<AdminAuditLog> AdminAuditLogs { get; }
    DbSet<CourseReview> CourseReviews { get; }
    DbSet<AcademyReview> AcademyReviews { get; }
    DbSet<Certificate> Certificates { get; }
    DbSet<LessonAiSummary> LessonAiSummaries { get; }
    DbSet<LessonAiFlashcard> LessonAiFlashcards { get; }

    DbSet<Payment> Payments { get; }
    DbSet<AcademyPayoutSettings> AcademyPayoutSettings { get; }
    DbSet<InstructorEarning> InstructorEarnings { get; }
    DbSet<InstructorPayout> InstructorPayouts { get; }
    DbSet<InstructorPayoutRequest> InstructorPayoutRequests { get; }

    DbSet<Quiz> Quizzes { get; }
    DbSet<QuizQuestion> QuizQuestions { get; }
    DbSet<QuizChoice> QuizChoices { get; }
    DbSet<QuizAttempt> QuizAttempts { get; }
    DbSet<QuizAttemptAnswer> QuizAttemptAnswers { get; }

    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}