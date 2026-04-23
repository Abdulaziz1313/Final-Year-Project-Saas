namespace LearningPlatform.Api.Services;

public class AiOptions
{
    public const string SectionName = "Ai";

    public string Provider { get; set; } = "OpenAI";
    public string ApiKey { get; set; } = string.Empty;
    public string Model { get; set; } = "gpt-4o-mini";
    public string BaseUrl { get; set; } = "https://api.openai.com/v1/";
}