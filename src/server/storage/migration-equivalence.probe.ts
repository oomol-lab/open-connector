import { PGlite } from "@electric-sql/pglite";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import { defaultMigrationSource } from "./migration-source.ts";

interface Column {
  table: string;
  name: string;
  type: string;
  required: boolean;
  default: string | null;
  primary: number;
}

interface Index {
  table: string;
  unique: boolean;
  columns: string[];
  predicate: string | null;
}

// Deliberately conservative: this is not SQL semantic normalization. Verify complex
// dialect-specific expressions and pin exact exceptions instead of stripping meaningful parentheses.
function normalizeExpression(value: string | null): string | null {
  return (
    value
      ?.replaceAll(/::(?:text|integer|bigint)/g, "")
      .replace(/^\(([^()]*)\)$/, "$1")
      .trim() ?? null
  );
}

function sorted<T>(values: T[]): T[] {
  return values.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

it("keeps the final SQLite and PostgreSQL columns and indexes equivalent", async () => {
  const sqlite = new DatabaseSync(":memory:");
  const postgres = await PGlite.create();
  try {
    for (const migration of defaultMigrationSource.readMigrations("sqlite")) sqlite.exec(migration.sql);
    for (const migration of defaultMigrationSource.readMigrations("postgresql")) await postgres.exec(migration.sql);
    const tables = sqlite
      .prepare("select name from sqlite_master where type = 'table' and name not like 'sqlite_%' order by name")
      .all() as { name: string }[];
    const pgTables = await postgres.query<{ name: string }>(
      "select tablename as name from pg_tables where schemaname = 'public' order by tablename",
    );
    expect(pgTables.rows).toEqual(tables);
    const columns: Column[] = [];
    const indexes: Index[] = [];
    for (const { name: table } of tables) {
      const tableColumns = sqlite.prepare("select * from pragma_table_info(?)").all(table) as {
        name: string;
        type: string;
        notnull: number;
        pk: number;
        dflt_value: string | null;
      }[];
      for (const column of tableColumns) {
        columns.push({
          table,
          name: column.name,
          type: column.type.toLowerCase(),
          required: Boolean(column.notnull || column.pk),
          default: normalizeExpression(column.dflt_value),
          primary: column.pk,
        });
      }
      const tableIndexes = sqlite.prepare("select * from pragma_index_list(?)").all(table) as {
        name: string;
        unique: number;
        origin: string;
      }[];
      for (const index of tableIndexes) {
        if (index.origin === "pk") continue;
        const fields = sqlite
          .prepare("select * from pragma_index_xinfo(?) where key = 1 order by seqno")
          .all(index.name) as { name: string; desc: number }[];
        const definition = sqlite
          .prepare("select sql from sqlite_master where type = 'index' and name = ?")
          .get(index.name) as { sql: string | null };
        indexes.push({
          table,
          unique: Boolean(index.unique),
          columns: fields.map((field) => field.name + (field.desc ? " DESC" : "")),
          predicate: normalizeExpression(definition.sql?.match(/\bwhere\s+(.+)$/is)?.[1] ?? null),
        });
      }
    }
    const pgColumns = await postgres.query<Column>(`
      select c.table_name as "table", c.column_name as name, c.data_type as type,
        c.is_nullable = 'NO' as required, c.column_default as "default",
        coalesce((select k.ordinal_position from information_schema.table_constraints t
          join information_schema.key_column_usage k using (constraint_catalog, constraint_schema, constraint_name)
          where t.constraint_type = 'PRIMARY KEY' and t.table_schema = c.table_schema
          and t.table_name = c.table_name and k.column_name = c.column_name), 0) as "primary"
      from information_schema.columns c where c.table_schema = 'public'
    `);
    // SQLite's incremental migrations retain these historical declarations. Pin
    // each difference before normalization so a changed exception also fails CI.
    const legacyColumns = [
      { table: "connections", name: "revision", field: "default", sqlite: "''", postgres: null },
      { table: "runs", name: "service", field: "required", sqlite: false, postgres: true },
      { table: "runs", name: "caller", field: "required", sqlite: false, postgres: true },
      { table: "provider_preferences", name: "enabled", field: "type", sqlite: "integer", postgres: "boolean" },
    ];
    for (const difference of legacyColumns) {
      const local = columns.find((column) => column.table === difference.table && column.name === difference.name)!;
      const remote = pgColumns.rows.find(
        (column) => column.table === difference.table && column.name === difference.name,
      )!;
      expect(local).toHaveProperty(difference.field, difference.sqlite);
      expect(remote).toHaveProperty(difference.field, difference.postgres);
      Object.assign(local, { [difference.field]: difference.postgres });
    }
    expect(
      sorted(pgColumns.rows.map((column) => ({ ...column, default: normalizeExpression(column.default) }))),
    ).toEqual(sorted(columns));
    const pgIndexes = await postgres.query<Index>(`
      select t.relname as "table", i.indisunique as "unique",
        array(select pg_get_indexdef(i.indexrelid, n, true) || case when (i.indoption[n - 1] & 1) = 1 then ' DESC' else '' end from generate_series(1, i.indnkeyatts) n) as columns,
        pg_get_expr(i.indpred, i.indrelid) as predicate
      from pg_index i join pg_class t on t.oid = i.indrelid
      join pg_namespace ns on ns.oid = t.relnamespace
      where ns.nspname = 'public' and not i.indisprimary
    `);
    expect(
      sorted(pgIndexes.rows.map((index) => ({ ...index, predicate: normalizeExpression(index.predicate) }))),
    ).toEqual(sorted(indexes));
  } finally {
    sqlite.close();
    await postgres.close();
  }
}, 30_000);
