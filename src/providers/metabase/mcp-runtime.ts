import type { ProviderActionHandlerSubset, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { MetabaseContext } from "./runtime.ts";
import type { Client } from "@modelcontextprotocol/client";

import { SdkError, SdkErrorCode, SdkHttpError, UnauthorizedError } from "@modelcontextprotocol/client";
import {
  compactObject,
  integer,
  objectArray,
  optionalInteger,
  optionalRecord,
  optionalString,
  positiveInteger,
  requiredBoolean,
  requiredRawString,
  requiredString,
} from "../../core/cast.ts";
import { withMcpClient } from "../mcp-client.ts";
import {
  providerInputError,
  providerResponseError,
  providerUserAgent,
  ProviderRequestError,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";

const requestTimeoutMs = 60_000;

/**
 * Metabase handles are caller-scoped across sessions. Close only the transport;
 * never DELETE the session, which would also destroy its stored query handles.
 */
export async function runMetabaseMcp<T>(
  context: MetabaseContext,
  run: (client: Client, signal: AbortSignal) => Promise<T>,
): Promise<T> {
  return runProviderRequest({ signal: context.signal, label: "Metabase MCP", timeoutMs: requestTimeoutMs }, (signal) =>
    withMcpClient(
      {
        endpoint: new URL(`${context.apiBaseUrl}/metabase-mcp`),
        transport: "streamable_http",
        headers: { "x-api-key": context.apiKey, "user-agent": providerUserAgent },
        redirect: "error",
        fetcher: context.fetcher,
        signal,
        mapError(error) {
          if (signal.aborted) return signal.reason;
          if (error instanceof SdkError && error.code === SdkErrorCode.RequestTimeout)
            return new ProviderRequestError(504, "Metabase MCP request timed out");
          if (error instanceof UnauthorizedError)
            return new ProviderRequestError(401, "Metabase MCP credential is invalid or expired");
          if (error instanceof SdkHttpError)
            return new ProviderRequestError(
              error.status >= 400 && error.status < 500 ? error.status : 502,
              `Metabase MCP HTTP ${error.status}`,
            );
          return error;
        },
      },
      (client) => run(client, signal),
    ),
  );
}

const requestOptions = (signal: AbortSignal) => ({ signal, timeout: requestTimeoutMs });

interface MetabaseToolPayload {
  body: Record<string, unknown>;
  raw: Record<string, unknown>;
}

async function callMetabaseTool(
  context: MetabaseContext,
  name: string,
  args: Record<string, unknown>,
): Promise<MetabaseToolPayload> {
  const result = await runMetabaseMcp(context, (client, signal) =>
    client.callTool({ name, arguments: compactObject(args) }, requestOptions(signal)),
  );
  const raw = requiredResponseRecord(result, `Metabase MCP ${name}`);
  const text = objectArray(raw.content, "Metabase MCP content", providerResponseError)
    .filter((block) => block.type === "text")
    .map((block) => requiredRawString(block.text, "Metabase MCP text", providerResponseError))
    .join("\n");
  if (raw.isError === true) {
    const structured = optionalRecord(raw.structuredContent);
    throw new ProviderRequestError(
      502,
      optionalString(structured?.error) ??
        optionalString(structured?.message) ??
        optionalString(text) ??
        `Metabase MCP ${name} failed`,
      raw,
    );
  }
  let payload: unknown = raw.structuredContent;
  if (payload === undefined) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      throw providerResponseError(`Metabase MCP ${name} returned malformed JSON text`);
    }
  }
  const body = requiredResponseRecord(payload, `Metabase MCP ${name} payload`);
  if (body.status === "failed") {
    throw new ProviderRequestError(
      502,
      optionalString(body.error) ?? optionalString(body.message) ?? `Metabase MCP ${name} query failed`,
      raw,
    );
  }
  return { body, raw };
}

function queryResults({ body, raw }: MetabaseToolPayload): Record<string, unknown> {
  if (body.status !== "completed") throw providerResponseError("Metabase MCP query did not return a completed status");
  const data = requiredResponseRecord(body.data, "Metabase MCP query data");
  if (!Array.isArray(data.rows) || data.rows.some((row) => !Array.isArray(row))) {
    throw providerResponseError("Metabase MCP query rows must be an array of arrays");
  }
  for (const field of ["row_count", "running_time"]) {
    if (body[field] !== undefined && (optionalInteger(body[field]) === undefined || Number(body[field]) < 0)) {
      throw providerResponseError(`Metabase MCP ${field} must be a nonnegative integer`);
    }
  }
  if (body.continuation_token != null && !optionalString(body.continuation_token)) {
    throw providerResponseError("Metabase MCP continuation_token must be a nonempty string");
  }
  return {
    status: "completed",
    columns: objectArray(data.cols, "Metabase MCP columns", providerResponseError).map((column) => ({
      name: requiredRawString(column.name, "column name", providerResponseError),
      displayName: requiredRawString(column.display_name, "column display_name", providerResponseError),
      baseType: requiredRawString(column.base_type, "column base_type", providerResponseError),
      effectiveType:
        column.effective_type == null
          ? column.effective_type
          : requiredRawString(column.effective_type, "column effective_type", providerResponseError),
    })),
    rows: data.rows,
    rowCount: optionalInteger(body.row_count),
    runningTime: optionalInteger(body.running_time),
    continuationToken: optionalString(body.continuation_token),
    raw,
  };
}

function constructedQuery({ body, raw }: MetabaseToolPayload): Record<string, unknown> {
  const queryHandle = requiredString(body.query_handle, "Metabase MCP query_handle", providerResponseError);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(queryHandle)) {
    throw providerResponseError("Metabase MCP query_handle must be a UUID");
  }
  return { queryHandle, raw };
}

// Create/update manifests declare native `query`, not `query_handle`. Metabase resolves
// UUIDs in `query` too; map the public handle there rather than inventing manifest fields.
function cardArguments(input: Record<string, unknown>): Record<string, unknown> {
  return {
    id: input.id,
    name: input.name,
    query: input.queryHandle,
    display: input.display,
    description: input.description,
    collection_id: input.collectionId,
    visualization_settings: input.visualizationSettings,
    archived: input.archived,
  };
}

function savedEntity(body: Record<string, unknown>): Record<string, unknown> {
  return {
    id: positiveInteger(body.id, "Metabase entity id", providerResponseError),
    name: requiredString(body.name, "Metabase entity name", providerResponseError),
    collectionId:
      body.collection_id === null
        ? null
        : positiveInteger(body.collection_id, "Metabase collection_id", providerResponseError),
    collectionPath: requiredRawString(body.collection_path, "Metabase collection_path", providerResponseError),
    description:
      body.description === null
        ? null
        : requiredRawString(body.description, "Metabase description", providerResponseError),
  };
}

function savedCard(payload: MetabaseToolPayload, update: boolean): Record<string, unknown> {
  const { body, raw } = payload;
  const output = {
    ...savedEntity(body),
    display: requiredRawString(body.display, "Metabase display", providerResponseError),
    raw,
  };
  return update
    ? { ...output, archived: requiredBoolean(body.archived, "Metabase archived", providerResponseError) }
    : { ...output, url: requiredRawString(body.url, "Metabase url", providerResponseError) };
}

function savedDashboard({ body, raw }: MetabaseToolPayload, update: boolean): Record<string, unknown> {
  if (!Array.isArray(body.dashcard_ids)) throw providerResponseError("Metabase dashcard_ids must be an array");
  const output = {
    ...savedEntity(body),
    dashcardIds: body.dashcard_ids.map((value) =>
      positiveInteger(value, "Metabase dashcard ID", providerResponseError),
    ),
    raw,
  };
  return update
    ? { ...output, archived: requiredBoolean(body.archived, "Metabase archived", providerResponseError) }
    : { ...output, url: requiredRawString(body.url, "Metabase url", providerResponseError) };
}

export const metabaseMcpHandlers: ProviderActionHandlerSubset<"metabase", ProviderRuntimeHandler<MetabaseContext>> = {
  async search_content(input, context) {
    const { body, raw } = await callMetabaseTool(context, "search", {
      term_queries: input.termQueries,
      semantic_queries: input.semanticQueries,
    });
    const results = objectArray(body.data, "Metabase MCP search data", providerResponseError).map((item) => {
      const type = requiredString(item.type, "Metabase search type", providerResponseError);
      if (!["table", "metric", "model", "question", "dashboard", "collection"].includes(type))
        throw providerResponseError(`Unknown Metabase search type: ${type}`);
      return {
        id: integer(item.id, "Metabase search id", providerResponseError),
        type,
        name: requiredString(item.name, "Metabase search name", providerResponseError),
        displayName:
          item.display_name == null
            ? item.display_name
            : requiredRawString(item.display_name, "search display_name", providerResponseError),
        description:
          item.description == null
            ? item.description
            : requiredRawString(item.description, "search description", providerResponseError),
        databaseId:
          item.database_id == null
            ? item.database_id
            : integer(item.database_id, "search database_id", providerResponseError),
        databaseSchema:
          item.database_schema == null
            ? item.database_schema
            : requiredRawString(item.database_schema, "search database_schema", providerResponseError),
      };
    });
    const totalCount = integer(body.total_count, "Metabase search total_count", providerResponseError);
    if (totalCount < 0) throw providerResponseError("Metabase search total_count must be nonnegative");
    return { results, totalCount, raw };
  },
  async read_resource(input, context) {
    const { body, raw } = await callMetabaseTool(context, "read_resource", { uris: input.uris });
    return {
      resources: objectArray(body.resources, "Metabase resources", providerResponseError).map((resource) => {
        const error =
          resource.error == null
            ? undefined
            : requiredRawString(resource.error, "Metabase resource error", providerResponseError);
        if (!("content" in resource) && error === undefined)
          throw providerResponseError("Metabase resource must contain content or error");
        return {
          uri: requiredString(resource.uri, "Metabase resource URI", providerResponseError),
          content: resource.content,
          error,
        };
      }),
      output: requiredRawString(body.output, "Metabase resource output", providerResponseError),
      raw,
    };
  },
  async construct_query(input, context) {
    return constructedQuery(
      await callMetabaseTool(context, "construct_query", { query: input.query, prompt: input.prompt }),
    );
  },
  async construct_native_query(input, context) {
    return constructedQuery(
      await callMetabaseTool(context, "construct_native_query", { database_id: input.databaseId, sql: input.sql }),
    );
  },
  async query(input, context) {
    if ([input.query, input.queryHandle, input.continuationToken].filter((value) => value !== undefined).length !== 1)
      throw providerInputError("Supply exactly one of query, queryHandle, or continuationToken");
    return queryResults(
      await callMetabaseTool(context, "query", {
        query: input.query,
        query_handle: input.queryHandle,
        continuation_token: input.continuationToken,
      }),
    );
  },
  async execute_query(input, context) {
    if ([input.query, input.queryHandle].filter((value) => value !== undefined).length !== 1)
      throw providerInputError("Supply exactly one of query or queryHandle");
    return queryResults(
      await callMetabaseTool(context, "execute_query", { query: input.query, query_handle: input.queryHandle }),
    );
  },
  async execute_sql(input, context) {
    return queryResults(
      await callMetabaseTool(context, "execute_sql", { database_id: input.databaseId, sql: input.sql }),
    );
  },
  async execute_question(input, context) {
    return queryResults(await callMetabaseTool(context, "execute_question", { id: input.id }));
  },
  async create_question(input, context) {
    return savedCard(await callMetabaseTool(context, "create_question", cardArguments(input)), false);
  },
  async update_question(input, context) {
    return savedCard(await callMetabaseTool(context, "update_question", cardArguments(input)), true);
  },
  async create_metric(input, context) {
    return savedCard(await callMetabaseTool(context, "create_metric", cardArguments(input)), false);
  },
  async update_metric(input, context) {
    return savedCard(await callMetabaseTool(context, "update_metric", cardArguments(input)), true);
  },
  async create_dashboard(input, context) {
    return savedDashboard(
      await callMetabaseTool(context, "create_dashboard", {
        name: input.name,
        description: input.description,
        collection_id: input.collectionId,
        question_ids: input.questionIds,
      }),
      false,
    );
  },
  async update_dashboard(input, context) {
    const dashcards =
      input.dashcards === undefined
        ? undefined
        : objectArray(input.dashcards, "dashcards", providerInputError).map((mutation) =>
            compactObject({
              action: mutation.action,
              card_id: mutation.cardId,
              dashcard_id: mutation.dashcardId,
              display_size: mutation.displaySize,
              position: mutation.position,
            }),
          );
    return savedDashboard(
      await callMetabaseTool(context, "update_dashboard", {
        id: input.id,
        name: input.name,
        description: input.description,
        collection_id: input.collectionId,
        archived: input.archived,
        dashcards,
      }),
      true,
    );
  },
  async create_collection(input, context) {
    const { body, raw } = await callMetabaseTool(context, "create_collection", {
      name: input.name,
      description: input.description,
      parent_collection_id: input.parentCollectionId,
    });
    return {
      id: positiveInteger(body.id, "Metabase collection id", providerResponseError),
      name: requiredString(body.name, "Metabase collection name", providerResponseError),
      parentId:
        body.parent_id === null ? null : positiveInteger(body.parent_id, "Metabase parent_id", providerResponseError),
      location: requiredString(body.location, "Metabase collection location", providerResponseError),
      description:
        body.description === null
          ? null
          : requiredRawString(body.description, "Metabase collection description", providerResponseError),
      raw,
    };
  },
  async list_mcp_tools(_input, context) {
    const raw = await runMetabaseMcp(context, (client, signal) => client.listTools({}, requestOptions(signal)));
    return {
      tools: raw.tools.map((tool) => ({
        name: tool.name,
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
        annotations: tool.annotations,
      })),
      raw,
    };
  },
  async list_mcp_resources(_input, context) {
    const raw = await runMetabaseMcp(context, (client, signal) => client.listResources({}, requestOptions(signal)));
    return {
      resources: raw.resources.map((resource) => ({
        uri: resource.uri,
        name: resource.name,
        title: resource.title,
        description: resource.description,
        mimeType: resource.mimeType,
      })),
      raw,
    };
  },
  async read_mcp_resource(input, context) {
    const uri = requiredInputString(input.uri, "uri");
    if (!uri.startsWith("metabase://docs/"))
      throw providerInputError("Only metabase://docs/ documentation resources are supported");
    const raw = await runMetabaseMcp(context, (client, signal) => client.readResource({ uri }, requestOptions(signal)));
    return {
      contents: raw.contents.map((content) => ({
        uri: content.uri,
        mimeType: content.mimeType,
        text: requiredRawString(
          "text" in content ? content.text : undefined,
          "Metabase documentation text",
          providerResponseError,
        ),
      })),
      raw,
    };
  },
};
