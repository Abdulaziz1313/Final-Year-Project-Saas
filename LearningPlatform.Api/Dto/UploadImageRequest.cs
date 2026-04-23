using Microsoft.AspNetCore.Http;

namespace LearningPlatform.Api.Dto;

public class UploadImageRequest
{
    public IFormFile File { get; set; } = null!;
}