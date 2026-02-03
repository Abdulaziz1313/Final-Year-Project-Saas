using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LearningPlatform.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddModerationFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "HiddenAt",
                table: "Courses",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "HiddenByUserId",
                table: "Courses",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "HiddenReason",
                table: "Courses",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsHidden",
                table: "Courses",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "HiddenAt",
                table: "Academies",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "HiddenByUserId",
                table: "Academies",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "HiddenReason",
                table: "Academies",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsHidden",
                table: "Academies",
                type: "bit",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "HiddenAt",
                table: "Courses");

            migrationBuilder.DropColumn(
                name: "HiddenByUserId",
                table: "Courses");

            migrationBuilder.DropColumn(
                name: "HiddenReason",
                table: "Courses");

            migrationBuilder.DropColumn(
                name: "IsHidden",
                table: "Courses");

            migrationBuilder.DropColumn(
                name: "HiddenAt",
                table: "Academies");

            migrationBuilder.DropColumn(
                name: "HiddenByUserId",
                table: "Academies");

            migrationBuilder.DropColumn(
                name: "HiddenReason",
                table: "Academies");

            migrationBuilder.DropColumn(
                name: "IsHidden",
                table: "Academies");
        }
    }
}
