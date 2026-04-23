namespace LearningPlatform.Application.Common.Interfaces;

public interface IAiClient
{
    Task<string> GenerateJsonAsync(string prompt, CancellationToken ct = default);
}