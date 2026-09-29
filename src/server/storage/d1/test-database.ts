import type { D1DatabaseBinding, D1PreparedStatementBinding } from "../../cloudflare/cloudflare-bindings.ts";

import { DatabaseSync } from "node:sqlite";
import { defaultMigrationSource } from "../migration-source.ts";

export class SqliteD1Database implements D1DatabaseBinding {
  private readonly database = new DatabaseSync(":memory:");

  constructor() {
    for (const migration of defaultMigrationSource.readMigrations("sqlite")) {
      this.database.exec(migration.sql);
    }
  }

  async batch(statements: D1PreparedStatementBinding[]): Promise<{ results: Record<string, unknown>[] | null }[]> {
    this.database.exec("begin immediate");
    try {
      const results = statements.map((statement) => {
        const rows = (statement as SqliteD1PreparedStatement).readRows();
        return { results: rows.length ? rows : null };
      });
      this.database.exec("commit");
      return results;
    } catch (error) {
      this.database.exec("rollback");
      throw error;
    }
  }

  prepare(query: string): D1PreparedStatementBinding {
    return new SqliteD1PreparedStatement(this.database, query);
  }

  close(): void {
    this.database.close();
  }

  exec(sql: string): void {
    this.database.exec(sql);
  }

  value(
    table: "connections" | "oauth_client_configs" | "oauth_states" | "idempotency_records",
    keyColumn: "service" | "state" | "key_hash",
    key: string,
    valueColumn: "value" | "response_value" = "value",
  ): string {
    const row = this.database.prepare(`select ${valueColumn} from ${table} where ${keyColumn} = ?`).get(key) as
      | Record<string, string>
      | undefined;
    return row?.[valueColumn] ?? "";
  }
}

class SqliteD1PreparedStatement implements D1PreparedStatementBinding {
  private readonly database: DatabaseSync;
  private readonly query: string;
  private readonly values: unknown[];

  constructor(database: DatabaseSync, query: string, values: unknown[] = []) {
    this.database = database;
    this.query = query;
    this.values = values;
  }

  bind(...values: unknown[]): D1PreparedStatementBinding {
    return new SqliteD1PreparedStatement(this.database, this.query, values);
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    return (this.database.prepare(this.query).get(...toSqlValues(this.values)) as T | undefined) ?? null;
  }

  readRows(): Record<string, unknown>[] {
    return this.database.prepare(this.query).all(...toSqlValues(this.values));
  }

  async all<T = Record<string, unknown>>(): Promise<{ results: T[] }> {
    return { results: this.readRows() as T[] };
  }

  async run(): Promise<{ success: boolean; meta: { changes?: number } }> {
    const result = this.database.prepare(this.query).run(...toSqlValues(this.values));
    return { success: true, meta: { changes: Number(result.changes) } };
  }
}

function toSqlValues(values: unknown[]): Array<string | number | bigint | null | Uint8Array> {
  return values.map((value) => (value === undefined ? null : (value as string | number | bigint | null | Uint8Array)));
}
