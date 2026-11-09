import type { ApiKeyProviderContext } from "../provider-executors.ts";
import type { AisaSemicolonResponse } from "./routes.ts";

import { looseArray, optionalNumber, optionalRawString, optionalRecord } from "../../core/cast.ts";
import { randomUUIDv7 } from "../../core/uuid-v7.ts";
import {
  ProviderRequestError,
  providerUserAgent,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";
import { normalizeAisaOnPageTask } from "./dataforseo-onpage-runtime.ts";
import { dataForSeoReferencePaths } from "./dataforseo-reference-actions.ts";
import { normalizeAisaDataForSeoTask } from "./dataforseo-task-runtime.ts";
import { normalizeAisaInput } from "./input-normalization.ts";
import { aisaActionRoutes, buildAisaBody, buildAisaPath, buildAisaQuery } from "./routes.ts";

const aisaApiOrigin = "https://api.aisa.one";

export async function executeAisaAction(
  actionName: string,
  values: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const route = aisaActionRoutes[actionName];
  if (!route) {
    throw new ProviderRequestError(400, `unknown AIsa action: ${actionName}`, undefined, "invalid_input");
  }

  if (route.dataForSeoTask || route.onPageTask) {
    const callbackFields = [
      "pingbackUrl",
      "pingback_url",
      "postbackUrl",
      "postback_url",
      "postbackData",
      "postback_data",
    ];
    if (callbackFields.some((field) => values[field] !== undefined)) {
      throw new ProviderRequestError(
        400,
        "DataForSEO callbacks are not supported by these task actions; poll the matching result action",
        undefined,
        "invalid_input",
      );
    }
  }

  const normalized = normalizeAisaInput(actionName, values);
  if (actionName === "search_brave_rich") {
    const search = await executeAisaAction("search_brave_web", { ...normalized, enableRichCallback: true }, context);
    const rich = optionalRecord(optionalRecord(search)?.rich);
    const callbackKey = optionalRawString(optionalRecord(rich?.hint)?.callback_key);
    if (!callbackKey) return { search, rich: null, partial: false, error: null };
    try {
      const result = await executeAisaAction(
        "get_brave_rich",
        {
          callbackKey,
          apiVersion: normalized.apiVersion,
          cacheControl: normalized.cacheControl,
        },
        context,
      );

      return { search, rich: result, partial: false, error: null };
    } catch (error) {
      return {
        search,
        rich: null,
        partial: true,
        error: {
          code: error instanceof ProviderRequestError ? error.code : "provider_error",
          message: error instanceof Error ? error.message : "Brave rich follow-up failed",
          status: error instanceof ProviderRequestError ? error.status : 502,
        },
      };
    }
  }

  const headers: Record<string, string> = {};
  for (const [inputName, headerName] of Object.entries(route.headers ?? {})) {
    const value = normalized[inputName];
    if (value != null) headers[headerName] = String(value);
  }

  if (route.asyncJob === "submit") {
    headers["Idempotency-Key"] = randomUUIDv7();
    const maxPriceUsd = optionalRawString(normalized.maxPriceUsd);
    if (maxPriceUsd !== undefined) headers["X-AISA-Max-Price-USD"] = maxPriceUsd;
  }

  const payload = await requestAisa(
    buildAisaPath(
      actionName === "get_dataforseo_reference_data"
        ? `${route.path}/${dataForSeoReferencePaths[String(normalized.resource)]}`
        : route.path,
      normalized,
      route.pathParams,
    ),
    buildAisaQuery(
      normalized,
      route.query,
      route.commaSeparated ?? [],
      route.joined ?? {},
      route.fixedQuery ?? {},
      route.omitQueryDefaults ?? {},
    ),
    context,
    "execute",
    route.method ?? "GET",
    buildAisaBody(normalized, route),
    route.response,
    route.timeoutMs,
    headers,
  );

  if (route.onPageTask) {
    return normalizeAisaOnPageTask(payload, route.onPageTask, optionalRawString(normalized.taskId));
  }

  if (route.dataForSeoTask) {
    return normalizeAisaDataForSeoTask(payload, route.dataForSeoTask, optionalRawString(normalized.taskId));
  }

  if (!route.asyncJob) return payload;
  const job = requiredResponseRecord(payload, "AIsa job");
  const id = optionalRawString(job.id);
  if (!id || (route.asyncJob !== "submit" && !optionalRawString(job.status)))
    throw new ProviderRequestError(502, "AIsa returned an invalid job handle or state", undefined, "provider_error");

  if (route.asyncJob !== "submit" && id !== normalized.taskId)
    throw new ProviderRequestError(502, "AIsa returned a different job", undefined, "provider_error");

  if (route.asyncJob === "submit") return { taskId: id };
  const { id: _id, object: _object, ...result } = job;
  return { ...result, taskId: id };
}

export async function requestAisa(
  path: string,
  query: URLSearchParams,
  context: ApiKeyProviderContext,
  phase: "validate" | "execute",
  method: "GET" | "POST" = "GET",
  body?: unknown,
  responseFormat?: AisaSemicolonResponse,
  timeoutMs?: number,
  extraHeaders?: Record<string, string>,
): Promise<unknown> {
  return runProviderRequest({ label: "AIsa", timeoutMs, signal: context.signal }, async (signal) => {
    const url = new URL(path, aisaApiOrigin);
    url.search = query.toString();
    const headers: Record<string, string> = {
      ...extraHeaders,
      accept: responseFormat?.type === "semicolon" ? "text/plain, application/json;q=0.9" : "application/json",
      "user-agent": providerUserAgent,
    };
    if (body) {
      headers["content-type"] = "application/json";
    }

    const request: RequestInit = {
      method,
      headers,
      signal,
    };
    if (body) {
      request.body = JSON.stringify(body);
    }

    headers.authorization = `Bearer ${context.apiKey}`;
    const response = await context.fetcher(url, request);
    const payload = await readAisaPayload(response, responseFormat);
    if (!response.ok) {
      throw createAisaError(response, payload, phase);
    }

    return payload;
  });
}

async function readAisaPayload(response: Response, responseFormat: AisaSemicolonResponse | undefined) {
  const text = await response.text();
  if (text.trim() === "") {
    return response.ok && responseFormat?.type === "semicolon" ? createSemicolonOutput(text, responseFormat) : null;
  }

  if (response.ok && responseFormat?.type === "semicolon") {
    return createSemicolonOutput(text, responseFormat);
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (!response.ok) {
      return text;
    }

    throw new ProviderRequestError(502, "AIsa returned invalid JSON", undefined, "provider_error");
  }
}

function createSemicolonOutput(rawText: string, responseFormat: AisaSemicolonResponse) {
  const records = isEmptySemrushReport(rawText) ? [] : parseSemicolonRecords(rawText);
  const columns = responseFormat.header === "required" ? (records.shift() ?? []) : [...(responseFormat.columns ?? [])];
  const acceptedHeaders = [columns, ...(responseFormat.headerAliases ?? [])];
  if (
    responseFormat.header === "optional" &&
    records[0] &&
    acceptedHeaders.some((header) => columnsMatch(records[0]!, header))
  ) {
    records.shift();
  }

  return { rawText, columns, rows: records };
}

function isEmptySemrushReport(rawText: string): boolean {
  const message = rawText.trim();
  if (!message.startsWith("ERROR ")) {
    return false;
  }

  const separatorIndex = message.indexOf(" :: ");
  const code = separatorIndex === -1 ? undefined : message.slice(6, separatorIndex).trim();
  if (code === "50") return true;
  const detail = separatorIndex === -1 ? message : message.slice(separatorIndex + 4).trim();
  throw new ProviderRequestError(
    502,
    code ? `Semrush error ${code}: ${detail}` : `Semrush error: ${detail}`,
    undefined,
    "provider_error",
  );
}

function columnsMatch(values: readonly string[], columns: readonly string[]) {
  return (
    values.length === columns.length &&
    values.every((value, index) => normalizeColumnName(value) === normalizeColumnName(columns[index]!))
  );
}

function normalizeColumnName(value: string) {
  let output = "";
  for (const character of value.toLowerCase()) {
    const code = character.charCodeAt(0);
    if ((code >= 48 && code <= 57) || (code >= 97 && code <= 122)) {
      output += character;
    }
  }

  return output;
}

function parseSemicolonRecords(text: string) {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  const commitField = () => {
    record.push(field);
    field = "";
  };
  const commitRecord = () => {
    commitField();
    records.push(record);
    record = [];
  };
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (quoted) {
      if (character !== '"') {
        field += character;
        continue;
      }

      if (text[index + 1] === '"') {
        field += '"';
        index += 1;
        continue;
      }

      quoted = false;
      continue;
    }

    if (character === '"' && field === "") {
      quoted = true;
    } else if (character === ";") {
      commitField();
    } else if (character === "\n") {
      commitRecord();
    } else if (character !== "\r") {
      field += character;
    }
  }
  commitRecord();
  while (records.length > 0 && records.at(-1)?.every((value) => value === "")) {
    records.pop();
  }
  if (records[0]?.[0]?.charCodeAt(0) === 0xfeff) {
    records[0]![0] = records[0]![0]!.slice(1);
  }

  return records;
}

function createAisaError(response: Response, payload: unknown, phase: "validate" | "execute") {
  const payloadObject = optionalRecord(payload);
  const errorValue = payloadObject?.error;
  const error = optionalRecord(errorValue);
  const code = optionalRawString(error?.code);
  const failedTask = looseArray(payloadObject?.tasks)
    .map(optionalRecord)
    .find((task) => (optionalNumber(task?.status_code) ?? 0) >= 40000 && optionalRawString(task?.status_message));
  const taskMessage = failedTask
    ? `DataForSEO task ${String(failedTask.status_code)}: ${String(failedTask.status_message)}`
    : undefined;
  const summary =
    optionalRawString(error?.message) ??
    optionalRawString(errorValue) ??
    optionalRawString(payloadObject?.message) ??
    taskMessage ??
    optionalRawString(payload) ??
    `AIsa request failed with status ${response.status}`;
  const details = looseArray(payloadObject?.details).flatMap((value) => {
    const detail = optionalRecord(value);
    const message = optionalRawString(detail?.message);
    if (!message) return [];
    const path = looseArray(detail?.path)
      .filter((part) => typeof part === "string" || typeof part === "number")
      .join(".");

    return [path ? `${path}: ${message}` : message];
  });
  const message = [summary, ...details].join("; ");
  if (response.status === 429) {
    return new ProviderRequestError(429, message, undefined, "rate_limited");
  }

  if (response.status === 402) {
    return new ProviderRequestError(402, message, undefined, "insufficient_credit");
  }

  if (phase === "validate" && isCredentialErrorCode(code)) {
    return new ProviderRequestError(400, message, undefined, "invalid_input");
  }

  if (phase === "execute" && isCredentialErrorCode(code)) {
    return new ProviderRequestError(409, message, undefined, "authorization_failed");
  }

  if (response.status === 400 || response.status === 422) {
    return new ProviderRequestError(400, message, undefined, "invalid_input");
  }

  return new ProviderRequestError(response.status, message, undefined, "provider_error");
}

function isCredentialErrorCode(code: string | undefined) {
  return code === "missing_api_key" || code === "invalid_api_key" || code === "revoked_api_key";
}
