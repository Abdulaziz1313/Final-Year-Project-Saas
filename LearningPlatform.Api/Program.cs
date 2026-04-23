using System.Text;
using Azure.Identity;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;

using LearningPlatform.Api.Services;
using LearningPlatform.Application;
using LearningPlatform.Application.Common.Interfaces;
using LearningPlatform.Infrastructure.Identity;
using LearningPlatform.Infrastructure.Persistence;
using LearningPlatform.Application.Features.Ai.Services;

using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;

using Stripe;


var builder = WebApplication.CreateBuilder(args);

// -------------------- Email --------------------
var emailOpt = builder.Configuration.GetSection("Email").Get<EmailOptions>() ?? new EmailOptions();
builder.Services.AddSingleton(emailOpt);

if ((emailOpt.Provider ?? "").Trim().Equals("Console", StringComparison.OrdinalIgnoreCase))
{
    builder.Services.AddScoped<LearningPlatform.Application.Common.Interfaces.IEmailSender, ConsoleEmailSender>();
}
else
{
    builder.Services.AddScoped<LearningPlatform.Application.Common.Interfaces.IEmailSender, SmtpEmailSender>();
}

// -------------------- SMS --------------------
var smsOpt = builder.Configuration.GetSection("Sms").Get<SmsOptions>() ?? new SmsOptions();
builder.Services.AddSingleton(smsOpt);

builder.Services.AddScoped<ISmsSender, TwilioSmsSender>();
builder.Services.AddScoped<AdminAuditWriter>();
builder.Services.AddScoped<NotificationWriter>();
builder.Services.AddSingleton<ICertificatePdfService, CertificatePdfService>();

builder.Services.Configure<AiOptions>(
    builder.Configuration.GetSection(AiOptions.SectionName));

builder.Services.AddHttpClient<IAiClient, OpenAiClient>();

builder.Services.AddScoped<IAiLessonService, AiLessonService>();

// -------------------- Stripe --------------------
var stripeSecretKey = builder.Configuration["Stripe:SecretKey"] ?? "";
var stripePublishableKey = builder.Configuration["Stripe:PublishableKey"] ?? "";
var stripeWebhookSecret = builder.Configuration["Stripe:WebhookSecret"] ?? "";
var stripeCurrency = builder.Configuration["Stripe:Currency"] ?? "EUR";

var stripeOpt = new StripeOptions
{
    SecretKey = stripeSecretKey,
    PublishableKey = stripePublishableKey,
    WebhookSecret = stripeWebhookSecret,
    Currency = stripeCurrency
};

builder.Services.AddSingleton(stripeOpt);

Console.WriteLine($"[Stripe] Secret key loaded: {!string.IsNullOrWhiteSpace(stripeOpt.SecretKey)}");
Console.WriteLine($"[Stripe] Publishable key loaded: {!string.IsNullOrWhiteSpace(stripeOpt.PublishableKey)}");
Console.WriteLine($"[Stripe] Webhook secret loaded: {!string.IsNullOrWhiteSpace(stripeOpt.WebhookSecret)}");

if (!string.IsNullOrWhiteSpace(stripeOpt.SecretKey))
{
    StripeConfiguration.ApiKey = stripeOpt.SecretKey;
}
else
{
    Console.WriteLine("[Stripe] Secret key is EMPTY.");
}

// -------------------- Storage / Blob --------------------
builder.Services.Configure<StorageOptions>(builder.Configuration.GetSection("Storage"));

builder.Services.AddSingleton(sp =>
{
    var cfg = sp.GetRequiredService<IConfiguration>();
    var storage = cfg.GetSection("Storage").Get<StorageOptions>() ?? new StorageOptions();

    if (!storage.UseBlob)
    {
        return new BlobServiceClient("UseDevelopmentStorage=true");
    }

    if (!string.IsNullOrWhiteSpace(storage.ConnectionString))
    {
        return new BlobServiceClient(storage.ConnectionString);
    }

    if (string.IsNullOrWhiteSpace(storage.BaseUrl))
        throw new InvalidOperationException("Storage:BaseUrl is required when blob storage is enabled.");

    return new BlobServiceClient(new Uri(storage.BaseUrl), new DefaultAzureCredential());
});

// -------------------- MVC / Swagger --------------------
builder.Services.AddControllers();
builder.Services.AddApplication();
builder.Services.AddEndpointsApiExplorer();

builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo { Title = "LearningPlatform API", Version = "v1" });

    c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = SecuritySchemeType.Http,
        Scheme = "Bearer",
        BearerFormat = "JWT",
        In = ParameterLocation.Header,
        Description = "Enter: Bearer {your JWT token}"
    });

    c.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference
                {
                    Type = ReferenceType.SecurityScheme,
                    Id = "Bearer"
                }
            },
            Array.Empty<string>()
        }
    });
});

// -------------------- CORS --------------------
builder.Services.AddCors(opt =>
{
    var origins = builder.Configuration.GetSection("AllowedOrigins").Get<string[]>()
                  ?? new[]
                  {
                      "http://localhost:4200",
                      "http://localhost:4201",
                      "http://127.0.0.1:4200",
                      "http://127.0.0.1:4201"
                  };

    opt.AddPolicy("dev", p =>
        p.WithOrigins(origins)
         .AllowAnyHeader()
         .AllowAnyMethod()
         .AllowCredentials());
});

// -------------------- DB --------------------
var cs = builder.Configuration.GetConnectionString("DefaultConnection");
if (string.IsNullOrWhiteSpace(cs))
    throw new InvalidOperationException("Missing connection string: ConnectionStrings:DefaultConnection");

builder.Services.AddDbContext<AppDbContext>(opt => opt.UseSqlServer(cs));

builder.Services.AddScoped<IAppDbContext>(sp => sp.GetRequiredService<AppDbContext>());
builder.Services.AddScoped<IIdentityUserLookupService, IdentityUserLookupService>();

builder.Services.AddIdentityCore<ApplicationUser>(opt =>
{
    opt.Password.RequiredLength = 6;
    opt.Password.RequireNonAlphanumeric = false;
    opt.User.RequireUniqueEmail = true;
    opt.Lockout.AllowedForNewUsers = true;
})
.AddRoles<IdentityRole>()
.AddEntityFrameworkStores<AppDbContext>()
.AddSignInManager();

// -------------------- JWT --------------------
var jwtKey = builder.Configuration["Jwt:Key"];
if (string.IsNullOrWhiteSpace(jwtKey))
    throw new Exception("Jwt:Key missing");

var jwtIssuer = builder.Configuration["Jwt:Issuer"] ?? "LearningPlatform";
var jwtAudience = builder.Configuration["Jwt:Audience"] ?? "LearningPlatform";

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(opt =>
    {
        opt.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwtIssuer,
            ValidAudience = jwtAudience,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
            ClockSkew = TimeSpan.FromMinutes(1)
        };
    });

builder.Services.AddAuthorization();

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var sp = scope.ServiceProvider;

    var db = sp.GetRequiredService<AppDbContext>();
    await db.Database.MigrateAsync();

    var roleMgr = sp.GetRequiredService<RoleManager<IdentityRole>>();
    string[] roles = ["Admin", "OrgAdmin", "Instructor", "Student", "Coordinator"];
    foreach (var r in roles)
    {
        if (!await roleMgr.RoleExistsAsync(r))
            await roleMgr.CreateAsync(new IdentityRole(r));
    }

    await EnsureBlobContainersAsync(sp);
    await SeedAdminAsync(sp, builder.Configuration);
}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();

EnsureUploadsFolder(app);
app.UseStaticFiles();

app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(app.Environment.WebRootPath),
    ServeUnknownFileTypes = false
});

app.UseCors("dev");

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapGet("/health", () => Results.Ok(new { ok = true, app = "Alef API" }));

app.Run();

static void EnsureUploadsFolder(WebApplication app)
{
    var webRoot = app.Environment.WebRootPath;
    if (string.IsNullOrWhiteSpace(webRoot))
        webRoot = Path.Combine(app.Environment.ContentRootPath, "wwwroot");

    Directory.CreateDirectory(webRoot);
    Directory.CreateDirectory(Path.Combine(webRoot, "uploads"));
}

static async Task EnsureBlobContainersAsync(IServiceProvider sp)
{
    var options = sp.GetRequiredService<IOptions<StorageOptions>>().Value;
    if (!options.UseBlob) return;

    var blobServiceClient = sp.GetRequiredService<BlobServiceClient>();

    var containers = new[]
    {
        options.AcademyAssetsContainer,
        options.CourseAssetsContainer,
        options.LessonFilesContainer,
        options.UserAvatarsContainer
    }
    .Where(x => !string.IsNullOrWhiteSpace(x))
    .Distinct(StringComparer.OrdinalIgnoreCase);

    foreach (var name in containers)
    {
        var container = blobServiceClient.GetBlobContainerClient(name!);
        await container.CreateIfNotExistsAsync(PublicAccessType.Blob);
    }
}

static async Task SeedAdminAsync(IServiceProvider sp, IConfiguration config)
{
    var email = config["AdminSeed:Email"];
    var password = config["AdminSeed:Password"];
    var displayName = config["AdminSeed:DisplayName"] ?? "Alef Admin";

    if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password))
        return;

    var userManager = sp.GetRequiredService<UserManager<ApplicationUser>>();

    var user = await userManager.FindByEmailAsync(email);
    if (user == null)
    {
        user = new ApplicationUser
        {
            UserName = email,
            Email = email,
            EmailConfirmed = true,
            DisplayName = displayName
        };

        var create = await userManager.CreateAsync(user, password);
        if (!create.Succeeded)
        {
            var msg = string.Join(", ", create.Errors.Select(e => e.Description));
            throw new Exception($"Failed to create admin user: {msg}");
        }
    }

    if (!await userManager.IsInRoleAsync(user, "Admin"))
    {
        var add = await userManager.AddToRoleAsync(user, "Admin");
        if (!add.Succeeded)
        {
            var msg = string.Join(", ", add.Errors.Select(e => e.Description));
            throw new Exception($"Failed to assign Admin role: {msg}");
        }
    }
}

public class StorageOptions
{
    public bool UseBlob { get; set; }
    public string? ConnectionString { get; set; }
    public string? AccountName { get; set; }
    public string? BaseUrl { get; set; }

    public string AcademyAssetsContainer { get; set; } = "academy-assets";
    public string CourseAssetsContainer { get; set; } = "course-assets";
    public string LessonFilesContainer { get; set; } = "lesson-files";
    public string UserAvatarsContainer { get; set; } = "user-avatars";
}