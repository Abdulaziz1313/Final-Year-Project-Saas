using LearningPlatform.Domain.Entities;
using LearningPlatform.Infrastructure.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using LearningPlatform.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace LearningPlatform.Infrastructure.Persistence;

public class AppDbContext : IdentityDbContext<ApplicationUser>
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) {}

    public DbSet<Academy> Academies => Set<Academy>();
    public DbSet<Course> Courses => Set<Course>();
    public DbSet<Module> Modules => Set<Module>();
    public DbSet<Lesson> Lessons => Set<Lesson>();
    public DbSet<Enrollment> Enrollments => Set<Enrollment>();
    public DbSet<LessonProgress> LessonProgress => Set<LessonProgress>();
    public DbSet<LearningPlatform.Domain.Entities.Notification> Notifications => Set<LearningPlatform.Domain.Entities.Notification>();
    public DbSet<PendingRegistration> PendingRegistrations => Set<PendingRegistration>();




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

    builder.Entity<LearningPlatform.Domain.Entities.Notification>(e =>
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


    }
}
