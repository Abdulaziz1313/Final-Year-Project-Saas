namespace LearningPlatform.Application.Common.Interfaces;

public interface ISmsSender
{
    Task SendAsync(string toPhoneE164, string message, CancellationToken cancellationToken = default);
}