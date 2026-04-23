using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using LearningPlatform.Application.Common.Interfaces;
using Microsoft.Extensions.Options;

namespace LearningPlatform.Api.Services;

public class OpenAiClient : IAiClient
{
    private readonly HttpClient _httpClient;
    private readonly AiOptions _options;

    public OpenAiClient(HttpClient httpClient, IOptions<AiOptions> options)
    {
        _httpClient = httpClient;
        _options = options.Value;

        if (!string.IsNullOrWhiteSpace(_options.BaseUrl))
        {
            _httpClient.BaseAddress = new Uri(_options.BaseUrl);
        }
    }

    public async Task<string> GenerateJsonAsync(string prompt, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(_options.ApiKey))
            throw new InvalidOperationException("AI API key is not configured.");

        _httpClient.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", _options.ApiKey);

        var requestBody = new
        {
            model = _options.Model,
            response_format = new { type = "json_object" },
            messages = new object[]
            {
                new
                {
                    role = "system",
                    content = "You are an educational assistant. Return valid JSON only."
                },
                new
                {
                    role = "user",
                    content = prompt
                }
            },
            temperature = 0.4
        };

        var json = JsonSerializer.Serialize(requestBody);
        using var content = new StringContent(json, Encoding.UTF8, "application/json");

        using var response = await _httpClient.PostAsync("chat/completions", content, ct);
        var responseText = await response.Content.ReadAsStringAsync(ct);

        if (!response.IsSuccessStatusCode)
            throw new InvalidOperationException($"AI request failed: {response.StatusCode} - {responseText}");

        using var doc = JsonDocument.Parse(responseText);

        var result = doc.RootElement
            .GetProperty("choices")[0]
            .GetProperty("message")
            .GetProperty("content")
            .GetString();

        if (string.IsNullOrWhiteSpace(result))
            throw new InvalidOperationException("AI returned empty content.");

        return result;
    }
}