using LearningPlatform.Domain.Entities;
using LearningPlatform.Infrastructure.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using LearningPlatform.Application.Common.Interfaces;

namespace LearningPlatform.Infrastructure.Persistence;

public class AppDbContext : IdentityDbContext<ApplicationUser>, IAppDbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<Organization> Organizations => Set<Organization>();

    public DbSet<Academy> Academies => Set<Academy>();
    public DbSet<Course> Courses => Set<Course>();
    public DbSet<Module> Modules => Set<Module>();
    public DbSet<Lesson> Lessons => Set<Lesson>();
    public DbSet<Enrollment> Enrollments => Set<Enrollment>();
    public DbSet<LessonProgress> LessonProgress => Set<LessonProgress>();
    public DbSet<Notification> Notifications => Set<Notification>();
    public DbSet<PendingRegistration> PendingRegistrations => Set<PendingRegistration>();
    public DbSet<AdminAuditLog> AdminAuditLogs => Set<AdminAuditLog>();
    public DbSet<CourseReview> CourseReviews => Set<CourseReview>();
    public DbSet<AcademyReview> AcademyReviews => Set<AcademyReview>();
    public DbSet<Certificate> Certificates => Set<Certificate>();
    public DbSet<LessonAiSummary> LessonAiSummaries => Set<LessonAiSummary>();
    public DbSet<LessonAiFlashcard> LessonAiFlashcards => Set<LessonAiFlashcard>();

    public DbSet<Payment> Payments => Set<Payment>();
    public DbSet<AcademyPayoutSettings> AcademyPayoutSettings => Set<AcademyPayoutSettings>();
    public DbSet<InstructorEarning> InstructorEarnings => Set<InstructorEarning>();
    public DbSet<InstructorPayout> InstructorPayouts => Set<InstructorPayout>();
    public DbSet<InstructorPayoutRequest> InstructorPayoutRequests => Set<InstructorPayoutRequest>();

    public DbSet<Quiz> Quizzes => Set<Quiz>();
    public DbSet<QuizQuestion> QuizQuestions => Set<QuizQuestion>();
    public DbSet<QuizChoice> QuizChoices => Set<QuizChoice>();
    public DbSet<QuizAttempt> QuizAttempts => Set<QuizAttempt>();
    public DbSet<QuizAttemptAnswer> QuizAttemptAnswers => Set<QuizAttemptAnswer>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        builder.Entity<Organization>(e =>
        {
            e.HasKey(x => x.Id);

            e.Property(x => x.Name).HasMaxLength(200).IsRequired();
            e.Property(x => x.Slug).HasMaxLength(200).IsRequired();
            e.HasIndex(x => x.Slug).IsUnique();

            e.Property(x => x.Website).HasMaxLength(300);
            e.Property(x => x.PrimaryColor).HasMaxLength(32).IsRequired();

            e.Property(x => x.Description).HasMaxLength(4000);
            e.Property(x => x.LogoUrl).HasMaxLength(500);

            e.Property(x => x.InviteCode).HasMaxLength(64).IsRequired();

            e.Property(x => x.IsActive).HasDefaultValue(true);
        });

        builder.Entity<ApplicationUser>(e =>
        {
            e.HasIndex(x => x.OrganizationId);
            e.HasIndex(x => x.AcademyId);
        });

        builder.Entity<Academy>(e =>
        {
            e.HasKey(x => x.Id);

            e.Property(x => x.Name).HasMaxLength(200).IsRequired();
            e.Property(x => x.Slug).HasMaxLength(120).IsRequired();
            e.HasIndex(x => x.Slug).IsUnique();

            e.Property(x => x.Website).HasMaxLength(300);
            e.Property(x => x.PrimaryColor).HasMaxLength(20).IsRequired();

            e.Property(x => x.OwnerUserId).HasMaxLength(450).IsRequired();

            e.HasIndex(x => x.OrganizationId);
            e.HasOne(x => x.Organization)
                .WithMany(o => o.Academies)
                .HasForeignKey(x => x.OrganizationId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<Course>(e =>
        {
            e.HasKey(x => x.Id);

            e.Property(x => x.Title).HasMaxLength(200).IsRequired();
            e.Property(x => x.Currency).HasMaxLength(10).IsRequired();
            e.Property(x => x.TagsJson).IsRequired();
            e.Property(x => x.Price).HasPrecision(18, 2);
            e.Property(x => x.ShortDescription).HasMaxLength(1000);
            e.Property(x => x.FullDescription).HasMaxLength(20000);
            e.Property(x => x.Category).HasMaxLength(120);
            e.Property(x => x.ThumbnailUrl).HasMaxLength(500);
            e.Property(x => x.InstructorUserId).HasMaxLength(450);

            e.HasOne(x => x.Academy)
                .WithMany(a => a.Courses)
                .HasForeignKey(x => x.AcademyId)
                .OnDelete(DeleteBehavior.Cascade);

            e.HasIndex(x => new { x.AcademyId, x.Status });
            e.HasIndex(x => x.InstructorUserId);
        });

        builder.Entity<Module>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Title).HasMaxLength(200).IsRequired();
            e.HasIndex(x => new { x.CourseId, x.SortOrder });

            e.HasOne(x => x.Course)
                .WithMany(c => c.Modules)
                .HasForeignKey(x => x.CourseId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<Lesson>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Title).HasMaxLength(200).IsRequired();
            e.Property(x => x.ContentUrl).HasMaxLength(1000);
            e.HasIndex(x => new { x.ModuleId, x.SortOrder });

            e.HasOne(x => x.Module)
                .WithMany(m => m.Lessons)
                .HasForeignKey(x => x.ModuleId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<Enrollment>(e =>
        {
            e.HasKey(x => x.Id);

            e.Property(x => x.StudentUserId).HasMaxLength(450).IsRequired();
            e.Property(x => x.EnrolledAt).HasColumnType("datetimeoffset");
            e.Property(x => x.CompletedAt).HasColumnType("datetimeoffset");
            e.Property(x => x.LastActivityAt).HasColumnType("datetimeoffset");

            e.HasIndex(x => new { x.CourseId, x.StudentUserId }).IsUnique();

            e.HasOne(x => x.Course)
                .WithMany(c => c.Enrollments)
                .HasForeignKey(x => x.CourseId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<Payment>(e =>
        {
            e.HasKey(x => x.Id);

            e.Property(x => x.Provider).HasMaxLength(50).IsRequired();
            e.Property(x => x.Status).HasConversion<string>().HasMaxLength(30).IsRequired();

            e.Property(x => x.UserId).HasMaxLength(450).IsRequired();
            e.Property(x => x.Currency).HasMaxLength(10).IsRequired();
            e.Property(x => x.Amount).HasPrecision(18, 2);

            e.Property(x => x.CheckoutSessionId).HasMaxLength(255).IsRequired();
            e.Property(x => x.PaymentIntentId).HasMaxLength(255);
            e.Property(x => x.PaymentMethodType).HasMaxLength(100);
            e.Property(x => x.ProviderReference).HasMaxLength(255);
            e.Property(x => x.FailureReason).HasMaxLength(1000);

            e.Property(x => x.CreatedAt).HasColumnType("datetimeoffset");
            e.Property(x => x.PaidAt).HasColumnType("datetimeoffset");
            e.Property(x => x.UpdatedAt).HasColumnType("datetimeoffset");

            e.HasIndex(x => x.CheckoutSessionId).IsUnique();
            e.HasIndex(x => x.PaymentIntentId);
            e.HasIndex(x => new { x.CourseId, x.UserId, x.Status });

            e.HasOne(x => x.Course)
                .WithMany(c => c.Payments)
                .HasForeignKey(x => x.CourseId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<AcademyPayoutSettings>(e =>
        {
            e.HasKey(x => x.Id);

            e.Property(x => x.PlatformFeePercent).HasPrecision(5, 2);
            e.Property(x => x.OrganizationFeePercent).HasPrecision(5, 2);
            e.Property(x => x.InstructorFeePercent).HasPrecision(5, 2);
            e.Property(x => x.Currency).HasMaxLength(10).IsRequired();
            e.Property(x => x.CreatedAt).HasColumnType("datetimeoffset");
            e.Property(x => x.UpdatedAt).HasColumnType("datetimeoffset");

            e.HasIndex(x => x.AcademyId).IsUnique();

            e.HasOne(x => x.Academy)
                .WithOne(a => a.PayoutSettings)
                .HasForeignKey<AcademyPayoutSettings>(x => x.AcademyId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<InstructorEarning>(e =>
        {
            e.HasKey(x => x.Id);

            e.Property(x => x.InstructorUserId).HasMaxLength(450).IsRequired();
            e.Property(x => x.StudentUserId).HasMaxLength(450).IsRequired();

            e.Property(x => x.GrossAmount).HasPrecision(18, 2);
            e.Property(x => x.PlatformAmount).HasPrecision(18, 2);
            e.Property(x => x.OrganizationAmount).HasPrecision(18, 2);
            e.Property(x => x.InstructorAmount).HasPrecision(18, 2);

            e.Property(x => x.Currency).HasMaxLength(10).IsRequired();
            e.Property(x => x.EarnedAt).HasColumnType("datetimeoffset");
            e.Property(x => x.ReleasedAt).HasColumnType("datetimeoffset");
            e.Property(x => x.PaidOutAt).HasColumnType("datetimeoffset");

            e.HasIndex(x => x.PaymentId).IsUnique();
            e.HasIndex(x => new { x.AcademyId, x.InstructorUserId, x.IsReleasedForPayout, x.IsPaidOut });

            e.HasOne(x => x.Payment)
                .WithMany()
                .HasForeignKey(x => x.PaymentId)
                .OnDelete(DeleteBehavior.Cascade);

            e.HasOne(x => x.Course)
                .WithMany(c => c.InstructorEarnings)
                .HasForeignKey(x => x.CourseId)
                .OnDelete(DeleteBehavior.Restrict);

            e.HasOne(x => x.Academy)
                .WithMany(a => a.InstructorEarnings)
                .HasForeignKey(x => x.AcademyId)
                .OnDelete(DeleteBehavior.Restrict);

            e.HasOne(x => x.Payout)
                .WithMany(p => p.Earnings)
                .HasForeignKey(x => x.PayoutId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        builder.Entity<InstructorPayout>(e =>
        {
            e.HasKey(x => x.Id);

            e.Property(x => x.InstructorUserId).HasMaxLength(450).IsRequired();
            e.Property(x => x.Currency).HasMaxLength(10).IsRequired();
            e.Property(x => x.TotalAmount).HasPrecision(18, 2);

            e.Property(x => x.Status).HasMaxLength(30).IsRequired();
            e.Property(x => x.RequestNote).HasMaxLength(1000);
            e.Property(x => x.MessageToInstructor).HasMaxLength(500);
            e.Property(x => x.CreatedAt).HasColumnType("datetimeoffset");
            e.Property(x => x.RequestedAt).HasColumnType("datetimeoffset");
            e.Property(x => x.ApprovedAt).HasColumnType("datetimeoffset");
            e.Property(x => x.ProcessingAt).HasColumnType("datetimeoffset");
            e.Property(x => x.PaidAt).HasColumnType("datetimeoffset");

            e.HasIndex(x => new { x.AcademyId, x.InstructorUserId, x.Status });

            e.HasOne(x => x.Academy)
                .WithMany(a => a.InstructorPayouts)
                .HasForeignKey(x => x.AcademyId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        builder.Entity<InstructorPayoutRequest>(e =>
        {
            e.HasKey(x => x.Id);

            e.Property(x => x.InstructorUserId).HasMaxLength(450).IsRequired();
            e.Property(x => x.Currency).HasMaxLength(10).IsRequired();
            e.Property(x => x.RequestedAmount).HasPrecision(18, 2);

            e.Property(x => x.Status).HasMaxLength(30).IsRequired();
            e.Property(x => x.MessageToInstructor).HasMaxLength(500);
            e.Property(x => x.Note).HasMaxLength(1000);
            e.Property(x => x.CreatedAt).HasColumnType("datetimeoffset");
            e.Property(x => x.ResolvedAt).HasColumnType("datetimeoffset");

            e.HasIndex(x => new { x.AcademyId, x.InstructorUserId, x.Status });

            e.HasOne(x => x.Academy)
                .WithMany(a => a.InstructorPayoutRequests)
                .HasForeignKey(x => x.AcademyId)
                .OnDelete(DeleteBehavior.Restrict);

            e.HasOne(x => x.Payout)
                .WithMany()
                .HasForeignKey(x => x.PayoutId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        builder.Entity<LessonProgress>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.StudentUserId).IsRequired();
            e.HasIndex(x => new { x.LessonId, x.StudentUserId }).IsUnique();
        });

        builder.Entity<Notification>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.UserId).IsRequired();
            e.Property(x => x.Type).HasMaxLength(20).IsRequired();
            e.Property(x => x.Title).HasMaxLength(200).IsRequired();
            e.Property(x => x.Message).HasMaxLength(2000).IsRequired();
            e.Property(x => x.LinkUrl).HasMaxLength(300);
            e.HasIndex(x => new { x.UserId, x.IsRead, x.CreatedAt });
        });

        builder.Entity<PendingRegistration>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Email).HasMaxLength(256).IsRequired();
            e.HasIndex(x => x.Email).IsUnique();
            e.Property(x => x.Role).HasMaxLength(50).IsRequired();
            e.Property(x => x.CodeHash).IsRequired();
            e.Property(x => x.PasswordHash).IsRequired();
        });

        builder.Entity<Quiz>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Title).HasMaxLength(200).IsRequired();

            e.Property(x => x.CreatedAt)
                .HasColumnType("datetimeoffset")
                .HasDefaultValueSql("SYSDATETIMEOFFSET()");

            e.HasMany(x => x.Questions)
                .WithOne(x => x.Quiz)
                .HasForeignKey(x => x.QuizId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<QuizQuestion>(e =>
        {
            e.HasKey(x => x.Id);

            e.HasMany(x => x.Choices)
                .WithOne(x => x.Question)
                .HasForeignKey(x => x.QuestionId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<QuizChoice>(e =>
        {
            e.HasKey(x => x.Id);
        });

        builder.Entity<QuizAttempt>(e =>
        {
            e.HasKey(x => x.Id);

            e.HasOne(x => x.Quiz)
                .WithMany()
                .HasForeignKey(x => x.QuizId)
                .OnDelete(DeleteBehavior.Cascade);

            e.HasMany(x => x.Answers)
                .WithOne(x => x.Attempt)
                .HasForeignKey(x => x.AttemptId)
                .OnDelete(DeleteBehavior.Cascade);

            e.Property(x => x.StartedAt).HasColumnType("datetimeoffset");
            e.Property(x => x.UpdatedAt).HasColumnType("datetimeoffset");
            e.Property(x => x.SubmittedAt).HasColumnType("datetimeoffset");
        });

        builder.Entity<QuizAttemptAnswer>(e =>
        {
            e.HasKey(x => x.Id);

            e.HasOne(x => x.Attempt)
                .WithMany(a => a.Answers)
                .HasForeignKey(x => x.AttemptId)
                .OnDelete(DeleteBehavior.Cascade);

            e.HasOne<QuizQuestion>()
                .WithMany()
                .HasForeignKey(x => x.QuestionId)
                .OnDelete(DeleteBehavior.NoAction);
        });

        builder.Entity<Certificate>(b =>
        {
            b.HasKey(x => x.Id);

            b.Property(x => x.CertificateNumber).HasMaxLength(32).IsRequired();
            b.HasIndex(x => x.CertificateNumber).IsUnique();

            b.Property(x => x.UserId).HasMaxLength(450).IsRequired();
            b.HasIndex(x => new { x.CourseId, x.UserId }).IsUnique();

            b.Property(x => x.StudentName).HasMaxLength(200).IsRequired();
            b.Property(x => x.StudentEmail).HasMaxLength(256).IsRequired();
            b.Property(x => x.CourseTitle).HasMaxLength(200).IsRequired();
            b.Property(x => x.AcademyName).HasMaxLength(200).IsRequired();

            b.Property(x => x.CompletedAt).HasColumnType("datetimeoffset");
            b.Property(x => x.CreatedAt).HasColumnType("datetimeoffset");
        });

        builder.Entity<LessonAiSummary>(entity =>
        {
            entity.HasKey(x => x.Id);

            entity.Property(x => x.Summary)
                .HasMaxLength(4000);

            entity.Property(x => x.KeyPointsJson)
                .HasColumnType("nvarchar(max)");

            entity.Property(x => x.ImportantTermsJson)
                .HasColumnType("nvarchar(max)");

            entity.Property(x => x.CreatedAt)
                .HasColumnType("datetimeoffset");

            entity.Property(x => x.UpdatedAt)
                .HasColumnType("datetimeoffset");

            entity.HasOne(x => x.Lesson)
                .WithMany()
                .HasForeignKey(x => x.LessonId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(x => x.LessonId)
                .IsUnique();
        });

        builder.Entity<LessonAiFlashcard>(entity =>
        {
            entity.HasKey(x => x.Id);

            entity.Property(x => x.Question)
                .HasMaxLength(500)
                .IsRequired();

            entity.Property(x => x.Answer)
                .HasMaxLength(4000)
                .IsRequired();

            entity.Property(x => x.OrderIndex)
                .HasDefaultValue(0);

            entity.Property(x => x.IsPublished)
                .HasDefaultValue(false);

            entity.Property(x => x.CreatedAt)
                .HasColumnType("datetimeoffset");

            entity.Property(x => x.UpdatedAt)
                .HasColumnType("datetimeoffset");

            entity.HasOne(x => x.Lesson)
                .WithMany(x => x.AiFlashcards)
                .HasForeignKey(x => x.LessonId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(x => new { x.LessonId, x.OrderIndex });
        });
    }
}