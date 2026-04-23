using LearningPlatform.Application.Common.Interfaces;

namespace LearningPlatform.Api.Services;

public class ConsoleSmsSender : ISmsSender
{
    public Task SendAsync(string toPhoneE164, string message, CancellationToken cancellationToken = default)
    {
        Console.WriteLine($"[SMS] To: {toPhoneE164} | {message}");
        return Task.CompletedTask;
    }
}