using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LearningPlatform.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddInstructorPayouts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "InstructorUserId",
                table: "Courses",
                type: "nvarchar(450)",
                maxLength: 450,
                nullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "OwnerUserId",
                table: "Academies",
                type: "nvarchar(450)",
                maxLength: 450,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(max)");

            migrationBuilder.CreateTable(
                name: "AcademyPayoutSettings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AcademyId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PlatformFeePercent = table.Column<decimal>(type: "decimal(5,2)", precision: 5, scale: 2, nullable: false),
                    OrganizationFeePercent = table.Column<decimal>(type: "decimal(5,2)", precision: 5, scale: 2, nullable: false),
                    InstructorFeePercent = table.Column<decimal>(type: "decimal(5,2)", precision: 5, scale: 2, nullable: false),
                    WeeklyAutoReleaseEnabled = table.Column<bool>(type: "bit", nullable: false),
                    WeeklyReleaseDay = table.Column<int>(type: "int", nullable: false),
                    Currency = table.Column<string>(type: "nvarchar(10)", maxLength: 10, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AcademyPayoutSettings", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AcademyPayoutSettings_Academies_AcademyId",
                        column: x => x.AcademyId,
                        principalTable: "Academies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "InstructorPayouts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AcademyId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    InstructorUserId = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false),
                    TotalAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    Currency = table.Column<string>(type: "nvarchar(10)", maxLength: 10, nullable: false),
                    Status = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: false),
                    IsInstantRequest = table.Column<bool>(type: "bit", nullable: false),
                    RequestNote = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    MessageToInstructor = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    RequestedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ApprovedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ProcessingAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    PaidAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InstructorPayouts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_InstructorPayouts_Academies_AcademyId",
                        column: x => x.AcademyId,
                        principalTable: "Academies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "InstructorEarnings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PaymentId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CourseId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AcademyId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    InstructorUserId = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false),
                    StudentUserId = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false),
                    GrossAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    PlatformAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    OrganizationAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    InstructorAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    Currency = table.Column<string>(type: "nvarchar(10)", maxLength: 10, nullable: false),
                    IsReleasedForPayout = table.Column<bool>(type: "bit", nullable: false),
                    IsPaidOut = table.Column<bool>(type: "bit", nullable: false),
                    PayoutId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    EarnedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    ReleasedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    PaidOutAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InstructorEarnings", x => x.Id);
                    table.ForeignKey(
                        name: "FK_InstructorEarnings_Academies_AcademyId",
                        column: x => x.AcademyId,
                        principalTable: "Academies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_InstructorEarnings_Courses_CourseId",
                        column: x => x.CourseId,
                        principalTable: "Courses",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_InstructorEarnings_InstructorPayouts_PayoutId",
                        column: x => x.PayoutId,
                        principalTable: "InstructorPayouts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_InstructorEarnings_Payments_PaymentId",
                        column: x => x.PaymentId,
                        principalTable: "Payments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "InstructorPayoutRequests",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AcademyId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    InstructorUserId = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false),
                    RequestedAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    Currency = table.Column<string>(type: "nvarchar(10)", maxLength: 10, nullable: false),
                    Status = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: false),
                    MessageToInstructor = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    Note = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    PayoutId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    ResolvedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InstructorPayoutRequests", x => x.Id);
                    table.ForeignKey(
                        name: "FK_InstructorPayoutRequests_Academies_AcademyId",
                        column: x => x.AcademyId,
                        principalTable: "Academies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_InstructorPayoutRequests_InstructorPayouts_PayoutId",
                        column: x => x.PayoutId,
                        principalTable: "InstructorPayouts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Courses_InstructorUserId",
                table: "Courses",
                column: "InstructorUserId");

            migrationBuilder.CreateIndex(
                name: "IX_AcademyPayoutSettings_AcademyId",
                table: "AcademyPayoutSettings",
                column: "AcademyId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_InstructorEarnings_AcademyId_InstructorUserId_IsReleasedForPayout_IsPaidOut",
                table: "InstructorEarnings",
                columns: new[] { "AcademyId", "InstructorUserId", "IsReleasedForPayout", "IsPaidOut" });

            migrationBuilder.CreateIndex(
                name: "IX_InstructorEarnings_CourseId",
                table: "InstructorEarnings",
                column: "CourseId");

            migrationBuilder.CreateIndex(
                name: "IX_InstructorEarnings_PaymentId",
                table: "InstructorEarnings",
                column: "PaymentId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_InstructorEarnings_PayoutId",
                table: "InstructorEarnings",
                column: "PayoutId");

            migrationBuilder.CreateIndex(
                name: "IX_InstructorPayoutRequests_AcademyId_InstructorUserId_Status",
                table: "InstructorPayoutRequests",
                columns: new[] { "AcademyId", "InstructorUserId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_InstructorPayoutRequests_PayoutId",
                table: "InstructorPayoutRequests",
                column: "PayoutId");

            migrationBuilder.CreateIndex(
                name: "IX_InstructorPayouts_AcademyId_InstructorUserId_Status",
                table: "InstructorPayouts",
                columns: new[] { "AcademyId", "InstructorUserId", "Status" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AcademyPayoutSettings");

            migrationBuilder.DropTable(
                name: "InstructorEarnings");

            migrationBuilder.DropTable(
                name: "InstructorPayoutRequests");

            migrationBuilder.DropTable(
                name: "InstructorPayouts");

            migrationBuilder.DropIndex(
                name: "IX_Courses_InstructorUserId",
                table: "Courses");

            migrationBuilder.DropColumn(
                name: "InstructorUserId",
                table: "Courses");

            migrationBuilder.AlterColumn<string>(
                name: "OwnerUserId",
                table: "Academies",
                type: "nvarchar(max)",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(450)",
                oldMaxLength: 450);
        }
    }
}
