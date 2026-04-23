using LearningPlatform.Application.Common.Interfaces;

namespace LearningPlatform.Api.Services;

public class ConsoleEmailSender : IEmailSender
{
    public Task SendAsync(string to, string subject, string htmlBody, CancellationToken cancellationToken = default)
    {
        Console.WriteLine("=== EMAIL (DEV) ===");
        Console.WriteLine($"To: {to}");
        Console.WriteLine($"Subject: {subject}");
        Console.WriteLine(htmlBody);
        Console.WriteLine("===================");
        return Task.CompletedTask;
    }
}