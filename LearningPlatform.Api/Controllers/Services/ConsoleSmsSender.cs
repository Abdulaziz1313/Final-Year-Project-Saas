namespace LearningPlatform.Api.Services;

public class ConsoleSmsSender : ISmsSender
{
    public Task SendAsync(string phone, string message)
    {
        Console.WriteLine($"[SMS] To: {phone} | {message}");
        return Task.CompletedTask;
    }
}

