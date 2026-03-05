using LearningPlatform.Domain.Entities;
using LearningPlatform.Infrastructure.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace LearningPlatform.Infrastructure.Persistence;

public class AppDbContext : IdentityDbContext<ApplicationUser>
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    // Organizations
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

    // Quizzes
    public DbSet<Quiz> Quizzes => Set<Quiz>();
    public DbSet<QuizQuestion> QuizQuestions => Set<QuizQuestion>();
    public DbSet<QuizChoice> QuizChoices => Set<QuizChoice>();
    public DbSet<QuizAttempt> QuizAttempts => Set<QuizAttempt>();
    public DbSet<QuizAttemptAnswer> QuizAttemptAnswers => Set<QuizAttemptAnswer>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        // ---------------- ORGANIZATIONS ----------------
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

        // ---------------- USERS (Identity) ----------------
        builder.Entity<ApplicationUser>(e =>
        {
            // OrganizationId is nullable; index helps filtering instructors by org
            e.HasIndex(x => x.OrganizationId);
        });

        // ---------------- ACADEMIES ----------------
        builder.Entity<Academy>(e =>
        {
            e.HasKey(x => x.Id);

            e.Property(x => x.Name).HasMaxLength(200).IsRequired();
            e.Property(x => x.Slug).HasMaxLength(120).IsRequired();
            e.HasIndex(x => x.Slug).IsUnique();

            e.Property(x => x.Website).HasMaxLength(300);
            e.Property(x => x.PrimaryColor).HasMaxLength(20).IsRequired();

            // keep required for now (matches your existing model)
            e.Property(x => x.OwnerUserId).IsRequired();

            // ✅ New: org ownership
            e.HasIndex(x => x.OrganizationId);
            e.HasOne(x => x.Organization)
                .WithMany(o => o.Academies)
                .HasForeignKey(x => x.OrganizationId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // ---------------- COURSES ----------------
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

        // ---------------- MODULES ----------------
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

        // ---------------- LESSONS ----------------
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

        // ---------------- ENROLLMENTS ----------------
        builder.Entity<Enrollment>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.StudentUserId).IsRequired();
            e.HasIndex(x => new { x.CourseId, x.StudentUserId }).IsUnique();
        });

        // ---------------- LESSON PROGRESS ----------------
        builder.Entity<LessonProgress>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.StudentUserId).IsRequired();
            e.HasIndex(x => new { x.LessonId, x.StudentUserId }).IsUnique();
        });

        // ---------------- NOTIFICATIONS ----------------
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

        // ---------------- PENDING REGISTRATION ----------------
        builder.Entity<PendingRegistration>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Email).HasMaxLength(256).IsRequired();
            e.HasIndex(x => x.Email).IsUnique();
            e.Property(x => x.Role).HasMaxLength(50).IsRequired();
            e.Property(x => x.CodeHash).IsRequired();
            e.Property(x => x.PasswordHash).IsRequired();
        });

        // ---------------- QUIZZES ----------------
        builder.Entity<Quiz>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Title).HasMaxLength(200).IsRequired();

            // datetimeoffset MUST use datetimeoffset default
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

        // ---------------- CERTIFICATES ----------------
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
    }
}