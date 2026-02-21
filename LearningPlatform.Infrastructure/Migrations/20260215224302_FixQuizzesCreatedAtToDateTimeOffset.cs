using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LearningPlatform.Infrastructure.Migrations
{
    public partial class FixQuizzesCreatedAtToDateTimeOffset : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
DECLARE @type NVARCHAR(128);

SELECT @type = t.name
FROM sys.columns c
JOIN sys.types t ON c.user_type_id = t.user_type_id
WHERE c.object_id = OBJECT_ID(N'[Quizzes]')
  AND c.name = N'CreatedAt';

-- Only convert if the column exists AND is not datetimeoffset already
IF (@type IS NOT NULL AND @type <> N'datetimeoffset')
BEGIN
    -- Drop default constraint on CreatedAt if it exists
    DECLARE @df sysname;
    SELECT @df = d.name
    FROM sys.default_constraints d
    JOIN sys.columns c ON d.parent_object_id = c.object_id AND d.parent_column_id = c.column_id
    WHERE c.object_id = OBJECT_ID(N'[Quizzes]')
      AND c.name = N'CreatedAt';

    IF @df IS NOT NULL
        EXEC(N'ALTER TABLE [Quizzes] DROP CONSTRAINT [' + @df + '];');

    -- Add temp column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM sys.columns
        WHERE name = N'CreatedAt_tmp'
          AND object_id = OBJECT_ID(N'[Quizzes]')
    )
    BEGIN
        ALTER TABLE [Quizzes]
        ADD [CreatedAt_tmp] datetimeoffset NOT NULL
            CONSTRAINT [DF_Quizzes_CreatedAt_tmp] DEFAULT (SYSUTCDATETIME());
    END

    -- Use dynamic SQL so SQL Server doesn't fail compilation
    EXEC(N'
        UPDATE [Quizzes]
        SET [CreatedAt_tmp] = TODATETIMEOFFSET(CAST([CreatedAt] AS datetime2), ''+00:00'');
    ');

    EXEC(N'ALTER TABLE [Quizzes] DROP COLUMN [CreatedAt];');

    EXEC(N'EXEC sp_rename N''Quizzes.CreatedAt_tmp'', N''CreatedAt'', ''COLUMN'';');

    -- Add default for new CreatedAt if missing
    IF NOT EXISTS (
        SELECT 1
        FROM sys.default_constraints d
        JOIN sys.columns c ON d.parent_object_id = c.object_id AND d.parent_column_id = c.column_id
        WHERE c.object_id = OBJECT_ID(N'[Quizzes]')
          AND c.name = N'CreatedAt'
    )
    BEGIN
        EXEC(N'ALTER TABLE [Quizzes] ADD CONSTRAINT [DF_Quizzes_CreatedAt] DEFAULT (SYSUTCDATETIME()) FOR [CreatedAt];');
    END
END
");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
DECLARE @type NVARCHAR(128);

SELECT @type = t.name
FROM sys.columns c
JOIN sys.types t ON c.user_type_id = t.user_type_id
WHERE c.object_id = OBJECT_ID(N'[Quizzes]')
  AND c.name = N'CreatedAt';

-- Only convert back if it's datetimeoffset
IF (@type IS NOT NULL AND @type = N'datetimeoffset')
BEGIN
    -- Drop default constraint on CreatedAt if it exists
    DECLARE @df sysname;
    SELECT @df = d.name
    FROM sys.default_constraints d
    JOIN sys.columns c ON d.parent_object_id = c.object_id AND d.parent_column_id = c.column_id
    WHERE c.object_id = OBJECT_ID(N'[Quizzes]')
      AND c.name = N'CreatedAt';

    IF @df IS NOT NULL
        EXEC(N'ALTER TABLE [Quizzes] DROP CONSTRAINT [' + @df + '];');

    -- Add temp datetime2 column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM sys.columns
        WHERE name = N'CreatedAt_tmp'
          AND object_id = OBJECT_ID(N'[Quizzes]')
    )
    BEGIN
        ALTER TABLE [Quizzes]
        ADD [CreatedAt_tmp] datetime2 NOT NULL
            CONSTRAINT [DF_Quizzes_CreatedAt_tmp2] DEFAULT (SYSUTCDATETIME());
    END

    -- dynamic SQL (same compile-time issue otherwise)
    EXEC(N'
        UPDATE [Quizzes]
        SET [CreatedAt_tmp] = CAST(SWITCHOFFSET([CreatedAt], ''+00:00'') AS datetime2);
    ');

    EXEC(N'ALTER TABLE [Quizzes] DROP COLUMN [CreatedAt];');

    EXEC(N'EXEC sp_rename N''Quizzes.CreatedAt_tmp'', N''CreatedAt'', ''COLUMN'';');

    IF NOT EXISTS (
        SELECT 1
        FROM sys.default_constraints d
        JOIN sys.columns c ON d.parent_object_id = c.object_id AND d.parent_column_id = c.column_id
        WHERE c.object_id = OBJECT_ID(N'[Quizzes]')
          AND c.name = N'CreatedAt'
    )
    BEGIN
        EXEC(N'ALTER TABLE [Quizzes] ADD CONSTRAINT [DF_Quizzes_CreatedAt2] DEFAULT (SYSUTCDATETIME()) FOR [CreatedAt];');
    END
END
");
        }
    }
}
