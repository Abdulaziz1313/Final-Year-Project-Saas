using System;
using System.IO;
using LearningPlatform.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.Extensions.Configuration;

namespace LearningPlatform.Infrastructure.Persistence
{
    // This factory is used by EF Core tools at design-time (migrations, updates)
    public sealed class AppDbContextFactory : IDesignTimeDbContextFactory<AppDbContext>
    {
        public AppDbContext CreateDbContext(string[] args)
        {
            // When you run from solution root, base path should be the API project
            // so we can read appsettings.json connection string.
            var basePath = Path.Combine(Directory.GetCurrentDirectory(), "..", "LearningPlatform.Api");

            // Fallback: if you're already in the API folder
            if (!Directory.Exists(basePath))
                basePath = Directory.GetCurrentDirectory();

            var config = new ConfigurationBuilder()
                .SetBasePath(basePath)
                .AddJsonFile("appsettings.json", optional: false)
                .AddJsonFile("appsettings.Development.json", optional: true)
                .AddEnvironmentVariables()
                .Build();

            var cs = config.GetConnectionString("DefaultConnection");
            if (string.IsNullOrWhiteSpace(cs))
                throw new InvalidOperationException("Connection string 'DefaultConnection' was not found.");

            var options = new DbContextOptionsBuilder<AppDbContext>()
                .UseSqlServer(cs)
                .Options;

            return new AppDbContext(options);
        }
    }
}