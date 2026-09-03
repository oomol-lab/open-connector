import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDirectoryMigrationSource, defaultMigrationSource } from "./migration-source.ts";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("createDirectoryMigrationSource", () => {
  it("reads sqlite migrations from the directory and postgresql migrations from its subdirectory", async () => {
    const directory = await createMigrationDirectory();
    await writeFile(join(directory, "0001_sqlite.sql"), "create table sqlite_only (id integer);");
    await writeFile(join(directory, "postgresql", "0001_postgres.sql"), "create table postgres_only (id integer);");

    const source = createDirectoryMigrationSource(directory);
    expect(source.readMigrations("sqlite")).toEqual([
      { name: "0001_sqlite.sql", sql: "create table sqlite_only (id integer);" },
    ]);
    expect(source.readMigrations("postgresql")).toEqual([
      { name: "0001_postgres.sql", sql: "create table postgres_only (id integer);" },
    ]);
  });

  it("keeps only numbered .sql files and ignores other entries and directories", async () => {
    const directory = await createMigrationDirectory();
    await writeFile(join(directory, "0001_runtime.sql"), "select 1;");
    await writeFile(join(directory, "README.md"), "# migrations");
    await writeFile(join(directory, "notes.sql"), "select 2;");
    await writeFile(join(directory, "0002_backup.sql.bak"), "select 3;");
    await mkdir(join(directory, "archive"));

    expect(createDirectoryMigrationSource(directory).readMigrations("sqlite")).toEqual([
      { name: "0001_runtime.sql", sql: "select 1;" },
    ]);
  });

  it("sorts migrations by file name using string order", async () => {
    const directory = await createMigrationDirectory();
    await writeFile(join(directory, "0010_second.sql"), "select 10;");
    await writeFile(join(directory, "0002_first.sql"), "select 2;");
    await writeFile(join(directory, "10_last.sql"), "select 3;");

    expect(
      createDirectoryMigrationSource(directory)
        .readMigrations("sqlite")
        .map((migration) => migration.name),
    ).toEqual(["0002_first.sql", "0010_second.sql", "10_last.sql"]);
  });

  it("reads migration bodies as utf8", async () => {
    const directory = await createMigrationDirectory();
    const sql = "-- 运行时表\ncreate table runtime (name text);\n";
    await writeFile(join(directory, "0001_runtime.sql"), sql, "utf8");

    expect(createDirectoryMigrationSource(directory).readMigrations("sqlite")).toEqual([
      { name: "0001_runtime.sql", sql },
    ]);
  });

  it("defers filesystem errors to readMigrations", async () => {
    const directory = await createMigrationDirectory();
    await writeFile(join(directory, "0001_runtime.sql"), "select 1;");
    await rm(join(directory, "postgresql"), { recursive: true });

    const missing = createDirectoryMigrationSource(join(directory, "missing"));
    expect(() => missing.readMigrations("sqlite")).toThrow(/ENOENT/);
    expect(() => missing.readMigrations("postgresql")).toThrow(/ENOENT/);

    const withoutPostgres = createDirectoryMigrationSource(directory);
    expect(withoutPostgres.readMigrations("sqlite")).toEqual([{ name: "0001_runtime.sql", sql: "select 1;" }]);
    expect(() => withoutPostgres.readMigrations("postgresql")).toThrow(/ENOENT/);
  });
});

describe("defaultMigrationSource", () => {
  it("resolves the repository migrations directory", () => {
    const sqlite = defaultMigrationSource.readMigrations("sqlite");
    expect(sqlite[0]).toMatchObject({ name: "0001_runtime.sql" });
    expect(sqlite[0]?.sql).toContain("create table");
    expect(sqlite.every((migration) => migration.name.endsWith(".sql"))).toBe(true);

    const postgresql = defaultMigrationSource.readMigrations("postgresql");
    expect(postgresql[0]).toMatchObject({ name: "0010_runtime.sql" });
    expect(postgresql.map((migration) => migration.name)).not.toContain("0001_runtime.sql");
  });
});

async function createMigrationDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "oomol-connect-migrations-"));
  tempDirs.push(directory);
  await mkdir(join(directory, "postgresql"));
  return directory;
}
