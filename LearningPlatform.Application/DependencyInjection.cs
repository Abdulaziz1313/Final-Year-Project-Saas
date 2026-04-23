using LearningPlatform.Application.Features.Reviews.Services;
using Microsoft.Extensions.DependencyInjection;

namespace LearningPlatform.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        services.AddScoped<IReviewsService, ReviewsService>();
        return services;
    }
}