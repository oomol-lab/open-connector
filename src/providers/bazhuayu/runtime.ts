import type { ProviderFetch } from "../provider-runtime.ts";

import { createHash } from "node:crypto";
import { optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  ProviderRequestError,
  readProviderJsonBody,
  readProviderTextBody,
} from "../provider-runtime.ts";

export const bazhuayuApiBaseUrl = "https://openapi.bazhuayu.com";
export const bazhuayuApiDocsUrl = "https://openapi.bazhuayu.com/zh-CN/";

export const maximumBazhuayuResponseBytes: number = 10 * 1024 * 1024;
const tokenRefreshLeewayMs = 60_000;
const maximumTokenCacheEntries = 1_024;

export interface BazhuayuCredential {
  username: string;
  password: string;
}

export interface BazhuayuRuntimeContext {
  credential: BazhuayuCredential;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

interface BazhuayuToken {
  accessToken: string;
  refreshToken: string;
  refreshAt: number;
}

interface BazhuayuTokenCacheEntry {
  token?: BazhuayuToken;
  pending?: Promise<BazhuayuToken>;
}

const tokenCache = new Map<string, BazhuayuTokenCacheEntry>();

export function readBazhuayuCredential(values: Record<string, string>): BazhuayuCredential {
  return {
    username: requireCredentialValue(values.username, "username"),
    password: requireCredentialValue(values.password, "password", false),
  };
}

export async function validateBazhuayuCredential(
  values: Record<string, string>,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<{ accountId: string; displayName: string }> {
  const credential = readBazhuayuCredential(values);
  await requestAccessToken(credential, fetcher, "validate", signal);
  const accountHash = createHash("sha256").update(credential.username).digest("hex").slice(0, 16);
  return {
    accountId: `bazhuayu:account:${accountHash}`,
    displayName: `Bazhuayu · ${credential.username}`,
  };
}

export function getBazhuayuAccessToken(
  credential: BazhuayuCredential,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<string> {
  return requestAccessToken(credential, fetcher, "execute", signal);
}

export function expireBazhuayuAccessToken(credential: BazhuayuCredential, rejectedAccessToken?: string): void {
  const key = tokenCacheKey(credential);
  const cached = tokenCache.get(key);
  if (!cached?.token) {
    if (!cached?.pending) tokenCache.delete(key);
    return;
  }
  if (rejectedAccessToken && cached.token.accessToken !== rejectedAccessToken) return;
  setTokenCacheEntry(key, {
    token: { ...cached.token, refreshAt: 0 },
    pending: cached.pending,
  });
}

export async function executeBazhuayuAction(
  actionName: string,
  input: Record<string, unknown>,
  context: BazhuayuRuntimeContext,
): Promise<unknown> {
  input = normalizeBazhuayuInput(input);
  switch (actionName) {
    case "list_task_groups":
      return listResult(await requestApi("GET", "/taskGroup", {}, context), "taskGroups");
    case "list_tasks":
      return listResult(await requestApi("GET", "/task/search", { taskGroupId: input.taskGroupId }, context), "tasks");
    case "get_task_actions":
      return listResult(
        await requestApi(
          "POST",
          "/task/getActions",
          { taskIds: input.taskIds, actionTypes: input.actionTypes },
          context,
        ),
        "tasks",
      );
    case "copy_task": {
      const envelope = await requestApi(
        "POST",
        "/task/copy",
        { taskId: input.taskId, taskGroupId: input.taskGroupId },
        context,
        "query",
      );
      const data = requireRecord(envelope.data, "data");
      return {
        taskId: requireString(data.taskId, "data.taskId"),
        taskName: optionalString(data.taskName),
        requestId: requireString(envelope.requestId, "requestId"),
      };
    }
    case "update_task_parameters": {
      const envelope = await requestApi(
        "POST",
        "/task/updateTaskParameters",
        { taskId: input.taskId, actions: input.actions, loopItems: input.loopItems },
        context,
      );
      const data = requireRecord(envelope.data, "data");
      return {
        taskId: requireString(data.taskId, "data.taskId"),
        updatedParameters: requireRecord(data.updatedParameters, "data.updatedParameters"),
        requestId: requireString(envelope.requestId, "requestId"),
      };
    }
    case "update_loop_items": {
      const envelope = await requestApi("POST", "/task/updateLoopItems", input, context);
      return {
        message: requireString(requireRecord(envelope.data, "data").message, "data.message"),
        requestId: requireString(envelope.requestId, "requestId"),
      };
    }
    case "start_task": {
      const envelope = await requestApi("POST", "/cloudextraction/start", { taskId: input.taskId }, context);
      const data = requireRecord(envelope.data, "data");
      return {
        lotNo: requireString(data.lotNo, "data.lotNo"),
        status: requireString(data.status, "data.status"),
        requestId: requireString(envelope.requestId, "requestId"),
      };
    }
    case "stop_task":
      return emptyResult(await requestApi("POST", "/cloudextraction/stop", { taskId: input.taskId }, context));
    case "get_task_statuses": {
      const envelope = await requestApi("POST", "/cloudextraction/statuses/v2", { taskIds: input.taskIds }, context);
      return {
        tasks: requireObjectArray(envelope.data, "data").map(normalizeTaskStatus),
        requestId: requireString(envelope.requestId, "requestId"),
      };
    }
    case "get_task_stats": {
      const envelope = await requestApi("GET", "/cloudextraction/task/stats", {}, context);
      const data = requireRecord(envelope.data, "data");
      return {
        stats: {
          ...data,
          extractingCount: requireInteger(data.extractingCount, "data.extractingCount"),
          waitingCount: requireInteger(data.waitingCount, "data.waitingCount"),
          finishedCount: requireInteger(data.finishedCount, "data.finishedCount"),
          waitingSubTaskCount: requireInteger(data.waitingSubTaskCount, "data.waitingSubTaskCount"),
          executingSubTaskCount: requireInteger(data.executingSubTaskCount, "data.executingSubTaskCount"),
        },
        requestId: requireString(envelope.requestId, "requestId"),
      };
    }
    case "list_subtask_statuses":
      return listResult(
        await requestApi(
          "GET",
          "/cloudextraction/task/subtasks",
          { taskId: input.taskId, page: input.page, size: input.size },
          context,
        ),
        "subtasks",
      );
    case "start_subtasks":
      return emptyResult(
        await requestApi(
          "POST",
          "/cloudextraction/subtasks:start",
          { taskId: input.taskId, subTaskIds: input.subTaskIds },
          context,
        ),
      );
    case "stop_subtasks":
      return emptyResult(
        await requestApi(
          "POST",
          "/cloudextraction/subtasks:stop",
          { taskId: input.taskId, subTaskIds: input.subTaskIds },
          context,
        ),
      );
    case "get_task_data":
      return normalizeTaskData(
        await requestApi("GET", "/data/all", { taskId: input.taskId, offset: input.offset, size: input.size }, context),
      );
    case "get_task_batch_data":
      return normalizeTaskData(
        await requestApi(
          "GET",
          "/data/lotno/all",
          { taskId: input.taskId, lotno: input.lotNo, offset: input.offset, size: input.size },
          context,
        ),
      );
    case "get_unexported_data": {
      const envelope = await requestApi(
        "GET",
        "/data/notexported",
        { taskId: input.taskId, size: input.size },
        context,
      );
      const data = requireRecord(envelope.data, "data");
      return {
        records: requireObjectArray(data.data, "data.data"),
        total: requireInteger(data.total, "data.total"),
        current: requireInteger(data.current, "data.current"),
        requestId: requireString(envelope.requestId, "requestId"),
      };
    }
    case "mark_data_exported":
      return emptyResult(await requestApi("POST", "/data/markexported", { taskId: input.taskId }, context));
    case "query_task_analytics": {
      const envelope = await requestApi("POST", "/taskanalytics/queries", input, context);
      const data = requireRecord(envelope.data, "data");
      return {
        items: requireObjectArray(data.data, "data.data"),
        total: requireInteger(data.total, "data.total"),
        requestId: requireString(envelope.requestId, "requestId"),
      };
    }
    default:
      throw new ProviderRequestError(400, `unknown Bazhuayu action: ${actionName}`);
  }
}

function normalizeBazhuayuInput(input: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...input };
  for (const field of ["taskId", "actionId", "lotNo"]) {
    if (typeof normalized[field] === "string") normalized[field] = normalized[field].trim();
  }
  for (const field of ["taskIds", "subTaskIds"]) {
    if (Array.isArray(normalized[field])) {
      normalized[field] = normalized[field].map((value) => (typeof value === "string" ? value.trim() : value));
    }
  }
  if (Array.isArray(normalized.actions)) {
    normalized.actions = normalized.actions.map((value) => normalizeActionUpdate(value));
  }
  if (Array.isArray(normalized.loopItems) && normalized.loopItems.every((value) => optionalRecord(value))) {
    normalized.loopItems = normalized.loopItems.map((value) => normalizeLoopUpdate(value));
  }
  return normalized;
}

function normalizeActionUpdate(value: unknown): unknown {
  const action = optionalRecord(value);
  if (!action) return value;
  const normalized = { ...action };
  if (typeof normalized.actionId === "string") normalized.actionId = normalized.actionId.trim();
  if (Array.isArray(normalized.properties)) {
    normalized.properties = normalized.properties.map((propertyValue) => {
      const property = optionalRecord(propertyValue);
      if (!property) return propertyValue;
      return {
        ...property,
        ...(typeof property.name === "string" ? { name: property.name.trim() } : {}),
      };
    });
  }
  return normalized;
}

function normalizeLoopUpdate(value: unknown): unknown {
  const update = optionalRecord(value);
  if (!update) return value;
  return {
    ...update,
    ...(typeof update.actionId === "string" ? { actionId: update.actionId.trim() } : {}),
  };
}

async function requestApi(
  method: "GET" | "POST",
  path: string,
  parameters: Record<string, unknown>,
  context: BazhuayuRuntimeContext,
  parameterLocation: "body" | "query" = method === "GET" ? "query" : "body",
): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const accessToken = await requestAccessToken(context.credential, context.fetcher, "execute", context.signal);
    try {
      return await requestApiWithToken(method, path, accessToken, parameters, context, parameterLocation);
    } catch (error) {
      if (attempt === 0 && error instanceof ProviderRequestError && error.status === 401) {
        expireBazhuayuAccessToken(context.credential, accessToken);
        continue;
      }
      throw error;
    }
  }
  throw new ProviderRequestError(401, "Bazhuayu credentials are no longer valid");
}

async function requestApiWithToken(
  method: "GET" | "POST",
  path: string,
  accessToken: string,
  parameters: Record<string, unknown>,
  context: BazhuayuRuntimeContext,
  parameterLocation: "body" | "query",
): Promise<Record<string, unknown>> {
  const url = new URL(path, bazhuayuApiBaseUrl);
  const headers = new Headers({ accept: "application/json", authorization: `Bearer ${accessToken}` });
  const init: RequestInit = { method, redirect: "error", headers };
  if (parameterLocation === "query") {
    for (const [key, value] of Object.entries(parameters)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  } else {
    headers.set("content-type", "application/json");
    init.body = JSON.stringify(parameters);
  }
  return requestJson(url, init, context.fetcher, "execute", context.signal);
}

async function requestAccessToken(
  credential: BazhuayuCredential,
  fetcher: ProviderFetch,
  phase: "validate" | "execute",
  signal?: AbortSignal,
): Promise<string> {
  const key = tokenCacheKey(credential);
  if (phase === "validate") {
    const token = await requestNewToken(credential, fetcher, phase, signal);
    setTokenCacheEntry(key, { token });
    return token.accessToken;
  }
  const cached = tokenCache.get(key);
  if (cached?.token && Date.now() < cached.token.refreshAt) {
    setTokenCacheEntry(key, cached);
    return cached.token.accessToken;
  }
  if (cached?.pending) return (await waitForToken(cached.pending, signal)).accessToken;
  const pending = renewToken(credential, cached?.token, fetcher);
  cachePendingToken(key, pending, cached?.token);
  return (await waitForToken(pending, signal)).accessToken;
}

async function renewToken(
  credential: BazhuayuCredential,
  token: BazhuayuToken | undefined,
  fetcher: ProviderFetch,
): Promise<BazhuayuToken> {
  if (token?.refreshToken) {
    try {
      return await requestToken(
        { refresh_token: token.refreshToken, grant_type: "refresh_token" },
        fetcher,
        "execute",
        undefined,
        token.refreshToken,
      );
    } catch (error) {
      if (!(error instanceof ProviderRequestError && error.status === 401)) throw error;
    }
  }
  return requestNewToken(credential, fetcher, "execute");
}

function requestNewToken(
  credential: BazhuayuCredential,
  fetcher: ProviderFetch,
  phase: "validate" | "execute",
  signal?: AbortSignal,
): Promise<BazhuayuToken> {
  return requestToken(
    { username: credential.username, password: credential.password, grant_type: "password" },
    fetcher,
    phase,
    signal,
  );
}

async function requestToken(
  body: Record<string, string>,
  fetcher: ProviderFetch,
  phase: "validate" | "execute",
  signal?: AbortSignal,
  fallbackRefreshToken = "",
): Promise<BazhuayuToken> {
  const envelope = await requestJson(
    new URL("/token", bazhuayuApiBaseUrl),
    {
      method: "POST",
      redirect: "error",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify(body),
    },
    fetcher,
    phase,
    signal,
  );
  const data = requireRecord(envelope.data, "data");
  const expiresInSeconds = Number(data.expires_in);
  if (!Number.isFinite(expiresInSeconds) || expiresInSeconds <= 0) {
    throw new ProviderRequestError(502, "Bazhuayu returned an invalid token lifetime");
  }
  const expiresInMs = expiresInSeconds * 1_000;
  return {
    accessToken: requireString(data.access_token, "data.access_token"),
    refreshToken: optionalString(data.refresh_token) ?? fallbackRefreshToken,
    refreshAt: Date.now() + expiresInMs - Math.min(tokenRefreshLeewayMs, expiresInMs / 10),
  };
}

export async function requestBazhuayuJson(
  url: URL,
  init: RequestInit,
  fetcher: ProviderFetch,
  phase: "validate" | "execute",
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  return requestJson(url, init, fetcher, phase, signal);
}

async function requestJson(
  url: URL,
  init: RequestInit,
  fetcher: ProviderFetch,
  phase: "validate" | "execute",
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const timeout = createProviderTimeout(signal);
  try {
    const response = await fetcher(url, { ...init, signal: timeout.signal });
    const payload = await readProviderJsonBody(response, {
      emptyBody: {},
      invalidJsonMessage: "Bazhuayu returned a non-JSON response",
      maxBytes: maximumBazhuayuResponseBytes,
    });
    if (!response.ok) throw mapApiError(response.status, payload, phase);
    return requireRecord(payload, "response");
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    throw new ProviderRequestError(
      timeout.didTimeout() ? 504 : 502,
      timeout.didTimeout() ? "Bazhuayu request timed out" : "Bazhuayu request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

export async function readBazhuayuProxyError(response: Response): Promise<ProviderRequestError> {
  const text = await readProviderTextBody(response, "Bazhuayu proxy response", maximumBazhuayuResponseBytes);
  let payload: unknown = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = {};
  }
  return mapApiError(response.status, payload, "execute");
}

function mapApiError(status: number, payload: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const envelope = optionalRecord(payload);
  const providerError = optionalRecord(envelope?.error);
  const code = optionalString(providerError?.code);
  const requestId = optionalString(envelope?.requestId);
  const message = optionalString(providerError?.message) ?? `Bazhuayu API returned HTTP ${status}`;
  const details = { providerCode: code, requestId };
  if (status === 429) return new ProviderRequestError(429, message, details);
  if (status === 401 || code === "InvalidGrant" || code === "Invalid.Grant") {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, details);
  }
  if (status === 403) return new ProviderRequestError(403, message, details);
  if (status === 400) return new ProviderRequestError(400, message, details);
  return new ProviderRequestError(502, message, details);
}

function cachePendingToken(key: string, pending: Promise<BazhuayuToken>, token?: BazhuayuToken): void {
  setTokenCacheEntry(key, { token, pending });
  void pending.then(
    (nextToken) => {
      if (tokenCache.get(key)?.pending === pending) setTokenCacheEntry(key, { token: nextToken });
    },
    () => {
      const cached = tokenCache.get(key);
      if (cached?.pending !== pending) return;
      if (cached.token) setTokenCacheEntry(key, { token: cached.token });
      else tokenCache.delete(key);
    },
  );
}

function waitForToken(pending: Promise<BazhuayuToken>, signal?: AbortSignal): Promise<BazhuayuToken> {
  if (!signal) return pending;
  return new Promise((resolve, reject) => {
    const onAbort = (): void => reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    if (signal.aborted) return onAbort();
    signal.addEventListener("abort", onAbort, { once: true });
    void pending.then(
      (token) => {
        signal.removeEventListener("abort", onAbort);
        resolve(token);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

function tokenCacheKey(credential: BazhuayuCredential): string {
  return createHash("sha256").update(credential.username).update("\0").update(credential.password).digest("hex");
}

function setTokenCacheEntry(key: string, entry: BazhuayuTokenCacheEntry): void {
  tokenCache.delete(key);
  tokenCache.set(key, entry);
  if (tokenCache.size <= maximumTokenCacheEntries) return;
  const oldestKey = tokenCache.keys().next().value;
  if (oldestKey !== undefined) tokenCache.delete(oldestKey);
}

function listResult(envelope: Record<string, unknown>, field: string): Record<string, unknown> {
  return {
    [field]: requireObjectArray(envelope.data, "data"),
    requestId: requireString(envelope.requestId, "requestId"),
  };
}

function emptyResult(envelope: Record<string, unknown>): Record<string, unknown> {
  return { requestId: requireString(envelope.requestId, "requestId") };
}

function normalizeTaskData(envelope: Record<string, unknown>): Record<string, unknown> {
  const data = requireRecord(envelope.data, "data");
  return {
    records: requireObjectArray(data.data, "data.data"),
    offset: requireInteger(data.offset, "data.offset"),
    total: requireInteger(data.total, "data.total"),
    remaining: requireInteger(data.restTotal, "data.restTotal"),
    requestId: requireString(envelope.requestId, "requestId"),
  };
}

function normalizeTaskStatus(status: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...status };
  if (normalized.executingTime === undefined && normalized.ExecutingTime !== undefined) {
    normalized.executingTime = normalized.ExecutingTime;
  }
  for (const field of ["currentTotalExtractCount", "executedTimes", "subTaskCount"]) {
    if (normalized[field] !== undefined) normalized[field] = requireInteger(normalized[field], field);
  }
  if (normalized.startExecuteTimeSeconds !== undefined) {
    normalized.startExecuteTimeSeconds = requireFiniteNumber(
      normalized.startExecuteTimeSeconds,
      "startExecuteTimeSeconds",
    );
  }
  return normalized;
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) throw new ProviderRequestError(502, `Bazhuayu returned invalid ${field}`);
  return record;
}

function requireObjectArray(value: unknown, field: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) throw new ProviderRequestError(502, `Bazhuayu returned invalid ${field}`);
  return value.map((item, index) => requireRecord(item, `${field}[${index}]`));
}

function requireString(value: unknown, field: string): string {
  const result = optionalString(value);
  if (!result) throw new ProviderRequestError(502, `Bazhuayu returned invalid ${field}`);
  return result;
}

function requireCredentialValue(value: unknown, field: string, trim = true): string {
  if (typeof value !== "string") throw new ProviderRequestError(400, `Bazhuayu ${field} is required`);
  const result = trim ? value.trim() : value;
  if (!result) throw new ProviderRequestError(400, `Bazhuayu ${field} is required`);
  return result;
}

function requireInteger(value: unknown, field: string): number {
  const result = Number(value);
  if ((typeof value !== "number" && typeof value !== "string") || !Number.isInteger(result)) {
    throw new ProviderRequestError(502, `Bazhuayu returned invalid ${field}`);
  }
  return result;
}

function requireFiniteNumber(value: unknown, field: string): number {
  const result = Number(value);
  if ((typeof value !== "number" && typeof value !== "string") || !Number.isFinite(result)) {
    throw new ProviderRequestError(502, `Bazhuayu returned invalid ${field}`);
  }
  return result;
}
