namespace LearningPlatform.Api.Services;

public interface ISmsSender
{
    Task SendAsync(string toPhoneE164, string message);
}
