using Microsoft.AspNetCore.Http;

namespace LearningPlatform.Api.Dto;

public class UploadFileRequest
{
    public IFormFile File { get; set; } = null!;
}