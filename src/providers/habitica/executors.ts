import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { ProviderProxyExecutor } from "../../core/types.ts";
import type { HabiticaActionName } from "./actions.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalRawString,
  optionalString,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import {
  createProviderProxyUrl,
  defineProviderExecutors,
  normalizeProviderProxyHeaders,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";

const service = "habitica";
const habiticaApiBaseUrl = "https://habitica.com/api/v3";
const habiticaDefaultRequestTimeoutMs = 30_000;

type HabiticaRequestPhase = "validate" | "execute";
type HabiticaMethod = "GET" | "POST" | "PUT" | "DELETE";
type HabiticaActionHandler = (input: Record<string, unknown>, context: HabiticaActionContext) => Promise<unknown>;

interface HabiticaCredential {
  apiKey: string;
  userId: string;
  xClient: string;
}

interface HabiticaActionContext extends HabiticaCredential {
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface HabiticaRequestOptions {
  credential: HabiticaCredential;
  path: string;
  fetcher: typeof fetch;
  phase: HabiticaRequestPhase;
  signal?: AbortSignal;
  method?: HabiticaMethod;
  query?: Record<string, string | undefined>;
  body?: unknown;
}

interface HabiticaEnvelope {
  success?: boolean;
  data?: unknown;
  notifications?: unknown;
  message?: unknown;
  error?: unknown;
}

export const habiticaActionHandlers: Record<HabiticaActionName, HabiticaActionHandler> = {
  get_user_profile(input, context) {
    return getUserProfile(input, context);
  },
  list_my_tasks(input, context) {
    return listMyTasks(input, context);
  },
  get_task(input, context) {
    return getTask(input, context);
  },
  create_task(input, context) {
    return createTask(input, context);
  },
  update_task(input, context) {
    return updateTask(input, context);
  },
  delete_task(input, context) {
    return deleteTask(input, context);
  },
  score_task(input, context) {
    return scoreTask(input, context);
  },
  list_tags(input, context) {
    return listTags(input, context);
  },
  create_tag(input, context) {
    return createTag(input, context);
  },
  update_tag(input, context) {
    return updateTag(input, context);
  },
  delete_tag(input, context) {
    return deleteTag(input, context);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<HabiticaActionContext>({
  service,
  handlers: habiticaActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<HabiticaActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      userId: readCredentialString(credential.values.userId ?? credential.metadata.userId, "userId"),
      xClient: readCredentialString(credential.values.xClient ?? credential.metadata.xClient, "xClient"),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    const credential = await requireApiKeyCredential(context, service);
    const habiticaCredential: HabiticaCredential = {
      apiKey: credential.apiKey,
      userId: readCredentialString(credential.values.userId ?? credential.metadata.userId, "userId"),
      xClient: readCredentialString(credential.values.xClient ?? credential.metadata.xClient, "xClient"),
    };
    const url = createProviderProxyUrl(habiticaApiBaseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    for (const [key, value] of Object.entries(buildHabiticaHeaders(habiticaCredential, input.body !== undefined))) {
      headers.set(key, value);
    }

    const init: RequestInit = {
      method: input.method,
      headers,
      signal: context.signal,
    };
    if (input.body !== undefined) {
      init.body = typeof input.body === "string" ? input.body : JSON.stringify(input.body);
    }

    const response = await fetch(url, init);
    const payload = await readHabiticaPayload(response);
    if (!response.ok) {
      throw createHabiticaError(response.status, payload, "execute");
    }

    return {
      ok: true,
      response: {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        data: payload,
      },
    };
  } catch (error) {
    return toProviderProxyError(error, "Habitica request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const credential = resolveHabiticaCredential({
      apiKey: input.apiKey,
      ...input.values,
    });
    const payload = await requestHabitica({
      credential,
      path: "/user",
      fetcher,
      signal,
      phase: "validate",
    });
    const user = requiredRecord(payload.data, "Habitica user response", providerOutputError);
    const profile = optionalRecord(user.profile);
    const stats = optionalRecord(user.stats);
    const party = optionalRecord(user.party);
    const providerAccountId = nullableString(user.id) ?? nullableString(user._id) ?? credential.userId;
    const profileName = nullableString(profile?.name);

    return {
      profile: {
        accountId: providerAccountId,
        displayName: profileName ?? `Habitica ${providerAccountId}`,
      },
      grantedScopes: [],
      metadata: compactObject({
        userId: providerAccountId,
        xClient: credential.xClient,
        apiBaseUrl: habiticaApiBaseUrl,
        validationEndpoint: "/user",
        profileName,
        level: nullableInteger(stats?.lvl),
        class: nullableString(stats?.class),
        partyId: nullableString(party?._id),
      }),
    };
  },
};

async function getUserProfile(input: Record<string, unknown>, context: HabiticaActionContext): Promise<unknown> {
  const payload = await requestHabitica({
    credential: context,
    path: "/user",
    query: compactObject({
      userFields: optionalString(input.userFields),
    }) as Record<string, string | undefined>,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    user: normalizeUser(payload.data),
  };
}

async function listMyTasks(input: Record<string, unknown>, context: HabiticaActionContext): Promise<unknown> {
  const payload = await requestHabitica({
    credential: context,
    path: "/tasks/user",
    query: compactObject({
      type: optionalString(input.type),
      dueDate: optionalString(input.dueDate),
    }) as Record<string, string | undefined>,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    tasks: normalizeTaskList(payload.data),
  };
}

async function getTask(input: Record<string, unknown>, context: HabiticaActionContext): Promise<unknown> {
  const taskId = requiredString(input.taskId, "taskId", providerInputError);
  const payload = await requestHabitica({
    credential: context,
    path: `/tasks/${encodeURIComponent(taskId)}`,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    task: normalizeTask(payload.data),
  };
}

async function createTask(input: Record<string, unknown>, context: HabiticaActionContext): Promise<unknown> {
  const payload = await requestHabitica({
    credential: context,
    path: "/tasks/user",
    method: "POST",
    body: buildTaskMutationBody(input, { includeType: true }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    task: normalizeTask(payload.data),
  };
}

async function updateTask(input: Record<string, unknown>, context: HabiticaActionContext): Promise<unknown> {
  const taskId = requiredString(input.taskId, "taskId", providerInputError);
  const payload = await requestHabitica({
    credential: context,
    path: `/tasks/${encodeURIComponent(taskId)}`,
    method: "PUT",
    body: buildTaskMutationBody(input, { includeType: false }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    task: normalizeTask(payload.data),
  };
}

async function deleteTask(input: Record<string, unknown>, context: HabiticaActionContext): Promise<unknown> {
  const taskId = requiredString(input.taskId, "taskId", providerInputError);
  await requestHabitica({
    credential: context,
    path: `/tasks/${encodeURIComponent(taskId)}`,
    method: "DELETE",
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    deleted: true,
    taskId,
  };
}

async function scoreTask(input: Record<string, unknown>, context: HabiticaActionContext): Promise<unknown> {
  const taskId = requiredString(input.taskId, "taskId", providerInputError);
  const direction = requiredString(input.direction, "direction", providerInputError);
  const payload = await requestHabitica({
    credential: context,
    path: `/tasks/${encodeURIComponent(taskId)}/score/${encodeURIComponent(direction)}`,
    method: "POST",
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    scoreResult: normalizeScoreResult(payload.data),
  };
}

async function listTags(_input: Record<string, unknown>, context: HabiticaActionContext): Promise<unknown> {
  const payload = await requestHabitica({
    credential: context,
    path: "/tags",
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    tags: normalizeTagList(payload.data),
  };
}

async function createTag(input: Record<string, unknown>, context: HabiticaActionContext): Promise<unknown> {
  const payload = await requestHabitica({
    credential: context,
    path: "/tags",
    method: "POST",
    body: {
      name: requiredString(input.name, "name", providerInputError),
    },
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    tag: normalizeTag(payload.data),
  };
}

async function updateTag(input: Record<string, unknown>, context: HabiticaActionContext): Promise<unknown> {
  const tagId = requiredString(input.tagId, "tagId", providerInputError);
  const payload = await requestHabitica({
    credential: context,
    path: `/tags/${encodeURIComponent(tagId)}`,
    method: "PUT",
    body: {
      name: requiredString(input.name, "name", providerInputError),
    },
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    tag: normalizeTag(payload.data),
  };
}

async function deleteTag(input: Record<string, unknown>, context: HabiticaActionContext): Promise<unknown> {
  const tagId = requiredString(input.tagId, "tagId", providerInputError);
  await requestHabitica({
    credential: context,
    path: `/tags/${encodeURIComponent(tagId)}`,
    method: "DELETE",
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    deleted: true,
    tagId,
  };
}

async function requestHabitica(input: HabiticaRequestOptions): Promise<HabiticaEnvelope> {
  const timeoutSignal = AbortSignal.timeout(habiticaDefaultRequestTimeoutMs);
  const signal = input.signal ? AbortSignal.any([input.signal, timeoutSignal]) : timeoutSignal;

  try {
    const response = await input.fetcher(buildHabiticaUrl(input.path, input.query), {
      method: input.method ?? "GET",
      headers: buildHabiticaHeaders(input.credential, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal,
    });
    const payload = await readHabiticaPayload(response);

    if (!response.ok) {
      throw createHabiticaError(response.status, payload, input.phase);
    }

    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Habitica request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Habitica request failed: ${error.message}` : "Habitica request failed",
    );
  }
}

function buildHabiticaUrl(path: string, query?: Record<string, string | undefined>): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${habiticaApiBaseUrl}/`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

function buildHabiticaHeaders(credential: HabiticaCredential, hasJsonBody: boolean): Record<string, string> {
  return compactObject({
    accept: "application/json",
    "content-type": hasJsonBody ? "application/json" : undefined,
    "user-agent": providerUserAgent,
    "x-api-key": credential.apiKey,
    "x-api-user": credential.userId,
    "x-client": credential.xClient,
  }) as Record<string, string>;
}

async function readHabiticaPayload(response: Response): Promise<HabiticaEnvelope> {
  const text = await response.text();
  if (!text.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new ProviderRequestError(502, "Habitica returned an invalid payload");
    }
    return parsed as HabiticaEnvelope;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(502, "Habitica returned invalid JSON");
  }
}

function createHabiticaError(
  status: number,
  payload: HabiticaEnvelope,
  phase: HabiticaRequestPhase,
): ProviderRequestError {
  const message = extractHabiticaErrorMessage(payload) ?? `Habitica request failed with status ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(status, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status || 502, message, payload);
}

function extractHabiticaErrorMessage(payload: HabiticaEnvelope): string | undefined {
  return nullableString(payload.message) ?? nullableString(payload.error) ?? undefined;
}

function buildTaskMutationBody(
  input: Record<string, unknown>,
  options: { includeType: boolean },
): Record<string, unknown> {
  return compactObject({
    text: optionalString(input.text),
    type: options.includeType ? optionalString(input.type) : undefined,
    tags: optionalStringArray(input.tags),
    alias: optionalString(input.alias),
    attribute: optionalString(input.attribute),
    checklist: optionalChecklistItems(input.checklist),
    collapseChecklist: optionalBoolean(input.collapseChecklist),
    notes: optionalRawString(input.notes),
    date: optionalString(input.date),
    priority: optionalNumber(input.priority),
    frequency: optionalString(input.frequency),
    repeat: optionalRecord(input.repeat),
    everyX: optionalInteger(input.everyX),
    streak: optionalInteger(input.streak),
    daysOfMonth: optionalIntegerArray(input.daysOfMonth),
    weeksOfMonth: optionalIntegerArray(input.weeksOfMonth),
    startDate: optionalString(input.startDate),
    up: optionalBoolean(input.up),
    down: optionalBoolean(input.down),
    value: optionalNumber(input.value),
    completed: optionalBoolean(input.completed),
  });
}

function normalizeUser(value: unknown): Record<string, unknown> {
  const record = requiredRecord(value, "Habitica user", providerOutputError);
  const profile = optionalRecord(record.profile);
  const stats = optionalRecord(record.stats);
  const party = optionalRecord(record.party);

  return {
    id: nullableString(record.id) ?? nullableString(record._id),
    profileName: nullableString(profile?.name),
    level: nullableInteger(stats?.lvl),
    class: nullableString(stats?.class),
    partyId: nullableString(party?._id),
    raw: record,
  };
}

function normalizeTaskList(value: unknown): Array<Record<string, unknown>> {
  return requiredArray(value, "Habitica task list").map((task) => normalizeTask(task));
}

function normalizeTask(value: unknown): Record<string, unknown> {
  const record = requiredRecord(value, "Habitica task", providerOutputError);
  return {
    id: nullableString(record.id) ?? nullableString(record._id),
    text: nullableString(record.text),
    alias: nullableString(record.alias),
    type: nullableString(record.type),
    notes: nullableString(record.notes),
    completed: nullableBoolean(record.completed),
    priority: nullableNumber(record.priority),
    value: nullableNumber(record.value),
    attribute: nullableString(record.attribute),
    date: nullableString(record.date),
    tags: optionalStringArray(record.tags) ?? [],
    checklist: normalizeChecklistList(record.checklist),
    raw: record,
  };
}

function normalizeChecklistList(value: unknown): Array<Record<string, unknown>> {
  return optionalArray(value).map((item) => {
    const record = requiredRecord(item, "Habitica checklist item", providerOutputError);
    return {
      id: nullableString(record.id) ?? nullableString(record._id),
      text: nullableString(record.text),
      completed: nullableBoolean(record.completed),
      raw: record,
    };
  });
}

function normalizeScoreResult(value: unknown): Record<string, unknown> {
  const record = requiredRecord(value, "Habitica score result", providerOutputError);
  return {
    delta: nullableNumber(record.delta),
    hp: nullableNumber(record.hp),
    mp: nullableNumber(record.mp),
    exp: nullableNumber(record.exp),
    gp: nullableNumber(record.gp),
    lvl: nullableInteger(record.lvl),
    class: nullableString(record.class),
    points: nullableInteger(record.points),
    str: nullableNumber(record.str),
    con: nullableNumber(record.con),
    int: nullableNumber(record.int),
    per: nullableNumber(record.per),
    tmp: optionalRecord(record._tmp) ?? {},
    raw: record,
  };
}

function normalizeTagList(value: unknown): Array<Record<string, unknown>> {
  return requiredArray(value, "Habitica tag list").map((tag) => normalizeTag(tag));
}

function normalizeTag(value: unknown): Record<string, unknown> {
  const record = requiredRecord(value, "Habitica tag", providerOutputError);
  return {
    id: nullableString(record.id) ?? nullableString(record._id),
    name: nullableString(record.name),
    challenge: nullableString(record.challenge),
    raw: record,
  };
}

function resolveHabiticaCredential(input: Record<string, unknown>): HabiticaCredential {
  return {
    apiKey: readCredentialString(input.apiKey, "apiKey"),
    userId: readCredentialString(input.userId, "userId"),
    xClient: readCredentialString(input.xClient, "xClient"),
  };
}

function readCredentialString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function requiredArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${label} is missing or invalid`);
  }
  return value;
}

function optionalArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function optionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.filter((item): item is string => typeof item === "string" && item !== "");
}

function optionalIntegerArray(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const numbers = value.filter((item): item is number => typeof item === "number" && Number.isInteger(item));
  return numbers.length > 0 ? numbers : [];
}

function optionalChecklistItems(value: unknown): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.map((item, index) => {
    const record = requiredRecord(item, `checklist[${index}]`, providerInputError);
    return compactObject({
      text: requiredString(record.text, `checklist[${index}].text`, providerInputError),
      completed: optionalBoolean(record.completed),
    });
  });
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nullableInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function nullableBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function providerInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function providerOutputError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, message);
}

function isAbortLikeError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.message.toLowerCase().includes("abort"));
}
