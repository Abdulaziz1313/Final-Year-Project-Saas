using LearningPlatform.Domain.Entities;
using LearningPlatform.Infrastructure.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace LearningPlatform.Infrastructure.Persistence;

public class AppDbContext : IdentityDbContext<ApplicationUser>
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

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

    // ✅ Quizzes
    public DbSet<Quiz> Quizzes => Set<Quiz>();
    public DbSet<QuizQuestion> QuizQuestions => Set<QuizQuestion>();
    public DbSet<QuizChoice> QuizChoices => Set<QuizChoice>();
    public DbSet<QuizAttempt> QuizAttempts => Set<QuizAttempt>();
    public DbSet<QuizAttemptAnswer> QuizAttemptAnswers => Set<QuizAttemptAnswer>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        builder.Entity<Academy>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Name).HasMaxLength(200).IsRequired();
            e.Property(x => x.Slug).HasMaxLength(120).IsRequired();
            e.HasIndex(x => x.Slug).IsUnique();
            e.Property(x => x.Website).HasMaxLength(300);
            e.Property(x => x.PrimaryColor).HasMaxLength(20).IsRequired();
            e.Property(x => x.OwnerUserId).IsRequired();
        });

        builder.Entity<Course>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Title).HasMaxLength(200).IsRequired();
            e.Property(x => x.Currency).HasMaxLength(10).IsRequired();
            e.Property(x => x.TagsJson).IsRequired();
            e.Property(x => x.Price).HasPrecision(18, 2);

            e.HasOne(x => x.Academy)
                .WithMany()
                .HasForeignKey(x => x.AcademyId)
                .OnDelete(DeleteBehavior.Cascade);

            e.HasIndex(x => new { x.AcademyId, x.Status });
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
            e.HasIndex(x => new { x.ModuleId, x.SortOrder });

            e.HasOne(x => x.Module)
                .WithMany(m => m.Lessons)
                .HasForeignKey(x => x.ModuleId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<Enrollment>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.StudentUserId).IsRequired();
            e.HasIndex(x => new { x.CourseId, x.StudentUserId }).IsUnique();
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

        // ✅ Quiz mappings
        builder.Entity<Quiz>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Title).HasMaxLength(200).IsRequired();

            // IMPORTANT:
            // datetimeoffset column MUST use a datetimeoffset default.
            // SYSUTCDATETIME() returns datetime2 => can cause mismatches.
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

                b.Property(x => x.UserId).HasMaxLength(450).IsRequired(); // Identity user id length safe
                b.HasIndex(x => new { x.CourseId, x.UserId }).IsUnique();  // ✅ prevent duplicate certs

                b.Property(x => x.StudentName).HasMaxLength(200).IsRequired();
                b.Property(x => x.StudentEmail).HasMaxLength(256).IsRequired();
                b.Property(x => x.CourseTitle).HasMaxLength(200).IsRequired();
                b.Property(x => x.AcademyName).HasMaxLength(200).IsRequired();

                b.Property(x => x.CompletedAt).HasColumnType("datetimeoffset");
                b.Property(x => x.CreatedAt).HasColumnType("datetimeoffset");
            });
    }
}
