import type { ProviderActionHandlers, ProviderRuntimeHandler } from "../provider-executors.ts";

import { optionalNumber, optionalString, requiredNumber, requiredRawString } from "../../core/cast.ts";
import { assertPublicHttpUrl, encodePathSegment, isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import {
  basicAuthorizationHeader,
  parseProviderJsonBodyText,
  ProviderRequestError,
  providerInputError,
  providerResponseError,
  providerUserAgent,
  readProviderTextBody,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";
import { assertReadOnlyQuery } from "./sql.ts";

interface DorisContext {
  baseUrl: string;
  username: string;
  authorization: string;
  defaultDatabase?: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface QueryResult {
  columns: { name: string; type: string }[];
  rows: unknown[][];
  rowCount: number;
  executionTimeMs: number;
  truncated: boolean;
}

export function createDorisContext(
  values: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): DorisContext {
  const url = assertPublicHttpUrl(requiredInputString(values.baseUrl, "baseUrl"), {
    fieldName: "baseUrl",
    createError: providerInputError,
    allowPrivateNetwork: isPrivateNetworkAccessAllowed(),
  });
  if (url.search || url.hash) throw providerInputError("Doris baseUrl must not contain a query or fragment");
  const username = requiredInputString(values.username, "username");
  if (username.includes(":")) throw providerInputError("Doris username must not contain a colon");
  const password = requiredRawString(values.password, "password", providerInputError);
  return {
    baseUrl: url.toString().replace(/\/$/, ""),
    username,
    authorization: basicAuthorizationHeader(`${username}:${password}`),
    defaultDatabase: optionalString(values.defaultDatabase),
    fetcher,
    signal,
  };
}

export const dorisActionHandlers: ProviderActionHandlers<"doris", ProviderRuntimeHandler<DorisContext>> = {
  execute_query(input, context) {
    const query = requiredInputString(input.query, "query");
    assertReadOnlyQuery(query);
    return requestDoris(
      query,
      optionalString(input.database) ?? context.defaultDatabase ?? "information_schema",
      input.maxRows,
      context,
    );
  },
  list_databases(input, context) {
    return requestDoris("SHOW DATABASES", context.defaultDatabase ?? "information_schema", input.maxRows, context);
  },
  list_tables(input, context) {
    const database = requiredInputString(
      input.database ?? context.defaultDatabase,
      "database (or defaultDatabase on the connection)",
    );
    return requestDoris("SHOW TABLES", database, input.maxRows, context);
  },
  get_table_schema(input, context) {
    const database = requiredInputString(
      input.database ?? context.defaultDatabase,
      "database (or defaultDatabase on the connection)",
    );
    const table = requiredInputString(input.table, "table");
    if (/[\\\p{Cc}]/u.test(table))
      throw providerInputError("Doris table names must not contain backslashes or control characters");
    return requestDoris(`DESCRIBE \`${table.replaceAll("`", "``")}\``, database, input.maxRows, context);
  },
};

export async function requestDoris(
  query: string,
  database: string,
  rowLimit: unknown,
  context: DorisContext,
  validating = false,
): Promise<QueryResult> {
  const maxRows = rowLimit === undefined ? 1000 : requiredNumber(rowLimit, "maxRows", providerInputError);
  if (!Number.isInteger(maxRows) || maxRows < 1 || maxRows > 10000) {
    throw providerInputError("maxRows must be an integer between 1 and 10000");
  }
  if (database === "." || database === ".." || /[\\/\p{Cc}]/u.test(database)) {
    throw providerInputError("Invalid Doris database name");
  }
  const url = `${context.baseUrl}/api/query/default_cluster/${encodePathSegment(database)}`;
  return runProviderRequest({ label: "Doris", signal: context.signal }, async (signal) => {
    const response = await context.fetcher(url, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: context.authorization,
        "content-type": "application/json",
        "user-agent": providerUserAgent,
        "x-doris-stream": "false",
      },
      body: JSON.stringify({ stmt: query, is_sync: true, limit: maxRows + 1 }),
      signal,
    });
    const text = await readProviderTextBody(response, "Doris response (use a smaller LIMIT)", 8 * 1024 * 1024, signal);
    if (!response.ok) {
      const status = validating && (response.status === 401 || response.status === 403) ? 400 : response.status;
      throw new ProviderRequestError(status, `Doris HTTP ${response.status}: ${text || response.statusText}`);
    }
    const payload = requiredResponseRecord(
      parseProviderJsonBodyText(text, {
        emptyBody: null,
        invalidJsonMessage: "Doris returned invalid JSON",
      }),
      "Doris response",
    );
    const code = requiredNumber(payload.code, "Doris response code", providerResponseError);
    if (code !== 0) {
      const status = code === 401 || code === 403 ? (validating ? 400 : code) : 502;
      throw new ProviderRequestError(status, optionalString(payload.msg) ?? `Doris query failed with code ${code}`, {
        dorisCode: code,
      });
    }
    const data = requiredResponseRecord(payload.data, "Doris result");
    if (data.type !== "result_set")
      throw providerResponseError(`Doris returned ${String(data.type)} instead of a read-only result set`);
    if (!Array.isArray(data.meta) || !Array.isArray(data.data))
      throw providerResponseError("Doris result must contain column metadata and rows");
    const columns = data.meta.map((value: unknown) => {
      const column = requiredResponseRecord(value, "Doris column");
      return {
        name: requiredRawString(column.name, "Doris column name", providerResponseError),
        type: requiredRawString(column.type, "Doris column type", providerResponseError),
      };
    });
    const rows: unknown[][] = data.data.map((value: unknown) => {
      if (!Array.isArray(value) || value.length !== columns.length)
        throw providerResponseError("Doris row width does not match its column metadata");
      return value;
    });
    const executionTimeMs = optionalNumber(data.time);
    if (executionTimeMs === undefined || !Number.isInteger(executionTimeMs) || executionTimeMs < 0)
      throw providerResponseError("Doris result is missing a valid execution time");
    const truncated = rows.length > maxRows;
    return {
      columns,
      rows: truncated ? rows.slice(0, maxRows) : rows,
      rowCount: Math.min(rows.length, maxRows),
      executionTimeMs,
      truncated,
    };
  });
}
