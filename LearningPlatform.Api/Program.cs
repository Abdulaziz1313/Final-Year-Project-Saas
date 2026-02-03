using LearningPlatform.Api.Services;
using LearningPlatform.Infrastructure.Identity;
using LearningPlatform.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using System.Text;

var builder = WebApplication.CreateBuilder(args);

// SMTP
var smtpOpt = builder.Configuration.GetSection("Smtp").Get<SmtpOptions>()
             ?? throw new Exception("Missing Smtp config");
builder.Services.AddSingleton(smtpOpt);
builder.Services.AddScoped<IEmailSender, SmtpEmailSender>();

builder.Services.AddScoped<LearningPlatform.Api.Services.NotificationWriter>();

builder.Services.AddControllers();
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

// CORS (allow Angular dev servers)
builder.Services.AddCors(opt =>
{
    opt.AddPolicy("dev", p =>
        p.WithOrigins("http://localhost:4200", "http://localhost:4201")
         .AllowAnyHeader()
         .AllowAnyMethod());
});

// EF Core + SQL Server
builder.Services.AddDbContext<AppDbContext>(opt =>
    opt.UseSqlServer(builder.Configuration.GetConnectionString("Default")));

// Identity
builder.Services.AddIdentityCore<ApplicationUser>(opt =>
{
    opt.Password.RequiredLength = 6;
    opt.Password.RequireNonAlphanumeric = false;
    opt.User.RequireUniqueEmail = true;

    // Needed if you want lock/unlock to work properly
    opt.Lockout.AllowedForNewUsers = true;
})
.AddRoles<IdentityRole>()
.AddEntityFrameworkStores<AppDbContext>()
.AddSignInManager();

// JWT
var jwtKey = builder.Configuration["Jwt:Key"] ?? throw new Exception("Jwt:Key missing");
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

// Migrate + seed roles + seed admin user
using (var scope = app.Services.CreateScope())
{
    var sp = scope.ServiceProvider;

    var db = sp.GetRequiredService<AppDbContext>();
    await db.Database.MigrateAsync();

    // Seed roles
    var roleMgr = sp.GetRequiredService<RoleManager<IdentityRole>>();
    string[] roles = ["Admin", "Instructor", "Student", "Coordinator"];
    foreach (var r in roles)
        if (!await roleMgr.RoleExistsAsync(r))
            await roleMgr.CreateAsync(new IdentityRole(r));

    // ✅ Seed admin user from configuration
    await SeedAdminAsync(sp, builder.Configuration);
}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();
app.UseStaticFiles();
app.UseCors("dev");
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.Run();

static async Task SeedAdminAsync(IServiceProvider sp, IConfiguration config)
{
    var email = config["AdminSeed:Email"];
    var password = config["AdminSeed:Password"];
    var displayName = config["AdminSeed:DisplayName"] ?? "Alef Admin";

    // If not configured, do nothing.
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

    // Ensure Admin role
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
