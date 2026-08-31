import {
  compactObject,
  optionalBoolean,
  optionalNumber,
  optionalRawString,
  optionalRecord,
  optionalString,
} from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const v0ApiBaseUrl = "https://api.v0.dev";

interface V0RequestOptions {
  apiKey: string;
  path: string;
  fetcher: typeof fetch;
  method?: string;
  query?: Record<string, string | undefined>;
  body?: Record<string, unknown>;
  notFoundCode?: "app_not_found" | "invalid_input";
  mode?: "validate" | "execute";
}

export interface V0ActionInput {
  apiKey: string;
  actionName?: string;
  input: Record<string, unknown>;
}

export async function requestV0Json<T>({
  apiKey,
  path,
  fetcher,
  method = "GET",
  query,
  body,
  notFoundCode,
  mode = "execute",
}: V0RequestOptions): Promise<T> {
  const url = new URL(path, v0ApiBaseUrl);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) {
        continue;
      }
      url.searchParams.set(key, value);
    }
  }

  const headers = new Headers({
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
  });
  if (body) {
    headers.set("content-type", "application/json");
  }

  let response: Response;
  try {
    response = await fetcher(url.toString(), {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    throw new ProviderRequestError(
      error instanceof Error && error.name === "AbortError" ? 504 : 502,
      error instanceof Error ? `v0 request failed: ${error.message}` : "v0 request failed",
    );
  }

  if (!response.ok) {
    throw await createV0RequestError(response, { mode, notFoundCode });
  }

  if (response.status === 204) {
    return {} as T;
  }

  const text = await response.text();
  if (!text) {
    return {} as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ProviderRequestError(502, "invalid v0 response: expected json");
  }
}

export function requireInputString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return value;
}

export function optionalInputString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function requireAtLeastOneInputField(input: Record<string, unknown>, fieldNames: readonly string[]): void {
  if (fieldNames.some((fieldName) => input[fieldName] !== undefined)) {
    return;
  }

  throw new ProviderRequestError(400, "at least one field to update is required");
}

export function optionalInputNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

export function optionalInputBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

export function requireInputBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== "boolean") {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return value;
}

export function optionalInputObject(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

export function optionalInputStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.map((item) => String(item));
}

export function requireInputObjectArray(value: unknown, fieldName: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new ProviderRequestError(400, `${fieldName} must contain objects`);
    }
    return item as Record<string, unknown>;
  });
}

export function requireInputStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return value.map((item) => String(item));
}

export function normalizeListData(payload: unknown): unknown[] {
  const record = asRecord(payload);
  return Array.isArray(record.data) ? record.data : [];
}

export function normalizeObjectData(payload: unknown): Record<string, unknown> {
  const record = asRecord(payload);
  const data = record.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return record;
}

export function normalizePagination(payload: unknown): Record<string, unknown> | undefined {
  const record = asRecord(payload);
  const pagination = optionalRecord(record.pagination);
  if (!pagination) {
    return undefined;
  }

  const normalized = compactObject({
    hasMore: optionalBoolean(pagination.hasMore),
    nextCursor: optionalString(pagination.nextCursor),
    nextUrl: optionalString(pagination.nextUrl),
    offset: optionalNumber(pagination.offset),
    total: optionalNumber(pagination.total),
    count: optionalNumber(pagination.count),
  });

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

export function normalizeUser(payload: unknown): Record<string, unknown> {
  const record = normalizeObjectData(payload);

  return compactObject({
    id: requireResponseString(record.id, "user.id"),
    object: optionalString(record.object),
    name: optionalString(record.name),
    email: optionalString(record.email),
    avatar: optionalString(record.avatar),
    createdAt: optionalString(record.createdAt),
    updatedAt: optionalString(record.updatedAt),
  });
}

export function normalizeProject(payload: unknown): Record<string, unknown> {
  const record = normalizeObjectData(payload);

  return compactObject({
    id: requireResponseString(record.id, "project.id"),
    object: optionalRawString(record.object),
    name: optionalRawString(record.name),
    description: optionalRawString(record.description),
    instructions: optionalRawString(record.instructions),
    icon: optionalRawString(record.icon),
    privacy: optionalRawString(record.privacy),
    vercelProjectId: optionalRawString(record.vercelProjectId),
    createdAt: optionalRawString(record.createdAt),
    updatedAt: optionalRawString(record.updatedAt),
    apiUrl: optionalRawString(record.apiUrl),
    webUrl: optionalRawString(record.webUrl),
    chats: normalizeOptionalArray(record.chats, normalizeChat),
  });
}

export function normalizeEnvVar(payload: unknown): Record<string, unknown> {
  const record = normalizeObjectData(payload);

  return compactObject({
    id: requireResponseString(record.id, "environment_variable.id"),
    object: optionalRawString(record.object),
    key: optionalRawString(record.key),
    value: optionalRawString(record.value),
    decrypted: optionalBoolean(record.decrypted),
    createdAt: asOptionalNumber(record.createdAt),
    updatedAt: asOptionalNumber(record.updatedAt),
    deleted: optionalBoolean(record.deleted),
  });
}

export function normalizeChat(payload: unknown): Record<string, unknown> {
  const record = normalizeObjectData(payload);

  return compactObject({
    id: requireResponseString(record.id, "chat.id"),
    object: optionalRawString(record.object),
    name: optionalRawString(record.name),
    privacy: optionalRawString(record.privacy),
    favorite: optionalBoolean(record.favorite),
    authorId: optionalRawString(record.authorId),
    projectId: optionalRawString(record.projectId),
    vercelProjectId: optionalRawString(record.vercelProjectId),
    createdAt: optionalRawString(record.createdAt),
    updatedAt: optionalRawString(record.updatedAt),
    apiUrl: optionalRawString(record.apiUrl),
    webUrl: optionalRawString(record.webUrl),
    metadata: asOptionalRecord(record.metadata),
    latestVersion: normalizeOptionalObject(record.latestVersion, normalizeVersion),
    messages: normalizeOptionalArray(record.messages, normalizeMessage),
  });
}

export function normalizeMessage(payload: unknown): Record<string, unknown> {
  const record = normalizeObjectData(payload);

  return compactObject({
    id: requireResponseString(record.id, "message.id"),
    object: optionalRawString(record.object),
    chatId: optionalRawString(record.chatId),
    role: optionalRawString(record.role),
    type: optionalRawString(record.type),
    content: optionalRawString(record.content),
    finishReason: optionalRawString(record.finishReason),
    createdAt: optionalRawString(record.createdAt),
    updatedAt: optionalRawString(record.updatedAt),
    apiUrl: optionalRawString(record.apiUrl),
    modelConfiguration: asOptionalRecord(record.modelConfiguration),
    attachments: normalizeOptionalArray(record.attachments, normalizeAttachment),
    experimentalContent: record.experimentalContent ?? record.experimental_content ?? undefined,
  });
}

export function normalizeVersion(payload: unknown): Record<string, unknown> {
  const record = normalizeObjectData(payload);

  return compactObject({
    id: requireResponseString(record.id, "version.id"),
    object: optionalRawString(record.object),
    status: optionalRawString(record.status),
    demoUrl: optionalRawString(record.demoUrl),
    screenshotUrl: optionalRawString(record.screenshotUrl),
    createdAt: optionalRawString(record.createdAt),
    updatedAt: optionalRawString(record.updatedAt),
    files: normalizeOptionalArray(record.files, normalizeFile),
  });
}

export function normalizeDeployment(payload: unknown): Record<string, unknown> {
  const record = normalizeObjectData(payload);

  return compactObject({
    id: requireResponseString(record.id, "deployment.id"),
    object: optionalRawString(record.object),
    inspectorUrl: optionalRawString(record.inspectorUrl),
    chatId: optionalRawString(record.chatId),
    projectId: optionalRawString(record.projectId),
    versionId: optionalRawString(record.versionId),
    apiUrl: optionalRawString(record.apiUrl),
    webUrl: optionalRawString(record.webUrl),
  });
}

export function normalizeDeploymentLog(payload: unknown): Record<string, unknown> {
  const record = normalizeObjectData(payload);

  return compactObject({
    id: requireResponseString(record.id, "deployment_log.id"),
    object: optionalRawString(record.object),
    deploymentId: optionalRawString(record.deploymentId),
    createdAt: optionalRawString(record.createdAt),
    text: optionalRawString(record.text),
    type: optionalRawString(record.type),
    level: optionalRawString(record.level),
  });
}

export function normalizeDeploymentErrors(payload: unknown): Record<string, unknown> {
  const record = normalizeObjectData(payload);

  return compactObject({
    error: optionalRawString(record.error),
    fullErrorText: optionalRawString(record.fullErrorText),
    errorType: optionalRawString(record.errorType),
    formattedError: optionalRawString(record.formattedError),
  });
}

export function normalizeAssignment(payload: unknown): Record<string, unknown> {
  const record = normalizeObjectData(payload);

  return compactObject({
    id: requireResponseString(record.id, "assignment.id"),
    object: optionalRawString(record.object),
    assigned: optionalBoolean(record.assigned),
  });
}

export function normalizeDeletedResource(payload: unknown, resourceName: string): Record<string, unknown> {
  const record = normalizeObjectData(payload);

  return compactObject({
    id: requireResponseString(record.id, `${resourceName}.id`),
    object: optionalRawString(record.object),
    deleted: optionalBoolean(record.deleted),
  });
}

export function normalizeFavoriteStatus(payload: unknown): Record<string, unknown> {
  const record = normalizeObjectData(payload);

  return compactObject({
    id: requireResponseString(record.id, "favorite.id"),
    object: optionalRawString(record.object),
    favorited: optionalBoolean(record.favorited),
  });
}

export function normalizeHook(payload: unknown): Record<string, unknown> {
  const record = normalizeObjectData(payload);
  const events = Array.isArray(record.events)
    ? record.events.map((item) => String(item))
    : typeof record.event === "string"
      ? [record.event]
      : undefined;

  return compactObject({
    id: requireResponseString(record.id, "hook.id"),
    object: optionalRawString(record.object),
    name: optionalRawString(record.name),
    events,
    chatId: optionalRawString(record.chatId ?? record.chat_id),
    projectId: optionalRawString(record.projectId ?? record.project_id),
    url: optionalRawString(record.url),
    createdAt: optionalRawString(record.createdAt ?? record.created_at),
    updatedAt: optionalRawString(record.updatedAt ?? record.updated_at),
    description: optionalRawString(record.description),
    active: optionalBoolean(record.active),
  });
}

export function normalizeRateLimit(payload: unknown): Record<string, unknown> {
  const record = normalizeObjectData(payload);
  const dailyLimit = asOptionalRecord(record.dailyLimit);

  return compactObject({
    limit: requireResponseNumber(record.limit, "rate_limit.limit"),
    remaining: asOptionalNumber(record.remaining),
    reset: asOptionalNumber(record.reset),
    dailyLimit: dailyLimit
      ? compactObject({
          limit: requireResponseNumber(dailyLimit.limit, "rate_limit.dailyLimit.limit"),
          remaining: asOptionalNumber(dailyLimit.remaining),
          reset: asOptionalNumber(dailyLimit.reset),
          isWithinGracePeriod: optionalBoolean(dailyLimit.isWithinGracePeriod),
        })
      : undefined,
  });
}

export function normalizeBilling(payload: unknown): Record<string, unknown> {
  const wrapper = asRecord(payload);
  const record = normalizeObjectData(payload);
  const data = asOptionalRecord(wrapper.data) ?? asOptionalRecord(record.data);
  const remaining =
    asOptionalNumber(wrapper.remaining) ?? asOptionalNumber(record.remaining) ?? asOptionalNumber(data?.remaining);
  const reset = asOptionalNumber(wrapper.reset) ?? asOptionalNumber(record.reset) ?? asOptionalNumber(data?.reset);
  const limit = asOptionalNumber(wrapper.limit) ?? asOptionalNumber(record.limit) ?? asOptionalNumber(data?.limit);

  return compactObject({
    billingType: optionalRawString(wrapper.billingType) ?? optionalRawString(record.billingType),
    data,
    remaining,
    reset,
    limit,
  });
}

export function normalizePlan(payload: unknown): Record<string, unknown> {
  const record = normalizeObjectData(payload);
  const billingCycle = asOptionalRecord(record.billingCycle);
  const balance = asOptionalRecord(record.balance);

  return compactObject({
    object: optionalRawString(record.object),
    plan: requireResponseString(record.plan, "plan.plan"),
    billingCycle: billingCycle
      ? compactObject({
          start: requireResponseNumber(billingCycle.start, "plan.billingCycle.start"),
          end: requireResponseNumber(billingCycle.end, "plan.billingCycle.end"),
        })
      : undefined,
    balance: balance
      ? compactObject({
          remaining: requireResponseNumber(balance.remaining, "plan.balance.remaining"),
          total: requireResponseNumber(balance.total, "plan.balance.total"),
        })
      : undefined,
  });
}

export function normalizeScope(payload: unknown): Record<string, unknown> {
  if (typeof payload === "string") {
    return {
      id: payload,
    };
  }

  const record = normalizeObjectData(payload);
  return compactObject({
    id: requireResponseString(record.id, "scope.id"),
    object: optionalRawString(record.object),
    name: optionalRawString(record.name),
  });
}

export function normalizeUsageEvent(payload: unknown): Record<string, unknown> {
  const record = normalizeObjectData(payload);
  const user = asOptionalRecord(record.user);

  return compactObject({
    id: requireResponseString(record.id, "usage_event.id"),
    object: optionalRawString(record.object),
    type: optionalRawString(record.type),
    promptCost: optionalRawString(record.promptCost),
    completionCost: optionalRawString(record.completionCost),
    totalCost: optionalRawString(record.totalCost),
    chatId: optionalRawString(record.chatId),
    messageId: optionalRawString(record.messageId),
    userId: optionalRawString(record.userId),
    user: user
      ? compactObject({
          id: optionalRawString(user.id),
          object: optionalRawString(user.object),
          name: optionalRawString(user.name),
          email: optionalRawString(user.email),
        })
      : undefined,
    createdAt: optionalRawString(record.createdAt),
  });
}

export function normalizeUsageMeta(payload: unknown): Record<string, unknown> | undefined {
  const record = normalizeObjectData(payload);
  const meta = asOptionalRecord(record.meta);
  if (!meta) {
    return undefined;
  }

  return compactObject({
    totalCount: requireResponseNumber(meta.totalCount, "usage_meta.totalCount"),
  });
}

export function normalizeVercelProject(payload: unknown): Record<string, unknown> {
  const record = normalizeObjectData(payload);

  return compactObject({
    id: requireResponseString(record.id, "vercel_project.id"),
    object: optionalRawString(record.object),
    name: optionalRawString(record.name),
  });
}

export function toQueryString(value: string | number | boolean | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return String(value);
}

function normalizeAttachment(payload: unknown) {
  const record = normalizeObjectData(payload);

  return compactObject({
    url: optionalRawString(record.url),
    name: optionalRawString(record.name),
    contentType: optionalRawString(record.contentType),
    size: asOptionalNumber(record.size),
    content: optionalRawString(record.content),
    type: optionalRawString(record.type),
  });
}

function normalizeFile(payload: unknown) {
  const record = normalizeObjectData(payload);

  return compactObject({
    object: optionalRawString(record.object),
    name: optionalRawString(record.name),
    content: optionalRawString(record.content),
    locked: optionalBoolean(record.locked),
    origin: optionalRawString(record.origin),
    language: optionalRawString(record.language),
    metadata: asOptionalRecord(record.metadata),
  });
}

function normalizeOptionalArray<T>(value: unknown, mapper: (item: unknown) => T) {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.map((item) => mapper(item));
}

function normalizeOptionalObject<T>(value: unknown, mapper: (item: unknown) => T) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return mapper(value);
}

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function asOptionalRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function asOptionalNumber(value: unknown) {
  return typeof value === "number" ? value : undefined;
}

function requireResponseString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || value.length === 0) {
    throw new ProviderRequestError(502, `invalid v0 response: ${fieldName} is missing`);
  }
  return value;
}

function requireResponseNumber(value: unknown, fieldName: string) {
  if (typeof value !== "number") {
    throw new ProviderRequestError(502, `invalid v0 response: ${fieldName} is missing`);
  }
  return value;
}

async function createV0RequestError(
  response: Response,
  input: {
    mode: "validate" | "execute";
    notFoundCode?: "app_not_found" | "invalid_input";
  },
) {
  const payload = await parseErrorPayload(response);
  const message = extractErrorMessage(payload, response.status);

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (input.notFoundCode && response.status === 404) {
    return new ProviderRequestError(404, message, payload);
  }

  if (response.status === 400 || response.status === 422) {
    return new ProviderRequestError(response.status, message, payload);
  }

  if (input.mode === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(response.status, message, payload);
}

async function parseErrorPayload(response: Response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function extractErrorMessage(payload: unknown, status: number) {
  if (typeof payload === "string" && payload.length > 0) {
    return payload;
  }

  const record = asOptionalRecord(payload);
  if (!record) {
    return `v0 request failed with status ${status}`;
  }

  const error = asOptionalRecord(record.error);
  const message =
    optionalRawString(error?.message) ?? optionalRawString(record.message) ?? optionalRawString(record.errorMessage);

  if (message) {
    return message;
  }

  return `v0 request failed with status ${status}`;
}
