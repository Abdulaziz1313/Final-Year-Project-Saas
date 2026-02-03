namespace LearningPlatform.Api.Services;

public class ConsoleEmailSender : IEmailSender
{
    public Task SendAsync(string toEmail, string subject, string htmlBody)
    {
        Console.WriteLine("=== EMAIL (DEV) ===");
        Console.WriteLine($"To: {toEmail}");
        Console.WriteLine($"Subject: {subject}");
        Console.WriteLine(htmlBody);
        Console.WriteLine("===================");
        return Task.CompletedTask;
    }
}
