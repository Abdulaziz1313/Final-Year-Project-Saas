using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LearningPlatform.Infrastructure.Migrations
{
    public partial class AddOrganizations : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // 1) Create Organizations table
            migrationBuilder.CreateTable(
                name: "Organizations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Slug = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Website = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: true),
                    PrimaryColor = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(4000)", maxLength: 4000, nullable: true),
                    LogoUrl = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    InviteCode = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Organizations", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Organizations_Slug",
                table: "Organizations",
                column: "Slug",
                unique: true);

            // 2) Add OrganizationId to AspNetUsers (nullable)
            migrationBuilder.AddColumn<Guid>(
                name: "OrganizationId",
                table: "AspNetUsers",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_AspNetUsers_OrganizationId",
                table: "AspNetUsers",
                column: "OrganizationId");

            // 3) Add OrganizationId to Academies as NULLABLE first (important!)
            migrationBuilder.AddColumn<Guid>(
                name: "OrganizationId",
                table: "Academies",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Academies_OrganizationId",
                table: "Academies",
                column: "OrganizationId");

            // 4) Insert a default organization and backfill existing academies
            var defaultOrgId = new Guid("11111111-1111-1111-1111-111111111111");

            migrationBuilder.Sql($@"
IF NOT EXISTS (SELECT 1 FROM dbo.Organizations WHERE Id = '{defaultOrgId}')
BEGIN
    INSERT INTO dbo.Organizations (Id, Name, Slug, Website, PrimaryColor, Description, LogoUrl, InviteCode, CreatedAt)
    VALUES (
        '{defaultOrgId}',
        'Default Organization',
        'default-org',
        NULL,
        '#7c3aed',
        'Auto-created during migration',
        NULL,
        'default-invite',
        SYSDATETIMEOFFSET()
    );
END
");

            migrationBuilder.Sql($@"
UPDATE dbo.Academies
SET OrganizationId = '{defaultOrgId}'
WHERE OrganizationId IS NULL
");

            // 5) Now make OrganizationId NOT NULL (after backfill)
            migrationBuilder.AlterColumn<Guid>(
                name: "OrganizationId",
                table: "Academies",
                type: "uniqueidentifier",
                nullable: false,
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier",
                oldNullable: true);

            // 6) Add FK constraint
            migrationBuilder.AddForeignKey(
                name: "FK_Academies_Organizations_OrganizationId",
                table: "Academies",
                column: "OrganizationId",
                principalTable: "Organizations",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Academies_Organizations_OrganizationId",
                table: "Academies");

            migrationBuilder.DropIndex(
                name: "IX_Academies_OrganizationId",
                table: "Academies");

            migrationBuilder.DropColumn(
                name: "OrganizationId",
                table: "Academies");

            migrationBuilder.DropIndex(
                name: "IX_AspNetUsers_OrganizationId",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "OrganizationId",
                table: "AspNetUsers");

            migrationBuilder.DropTable(
                name: "Organizations");
        }
    }
}