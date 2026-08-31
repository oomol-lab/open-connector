import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalRawString, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const timecampApiBaseUrl = "https://app.timecamp.com/third_party/api";

type TimecampPhase = "validate" | "execute";
type TimecampQueryValue = string | number | boolean | readonly (string | number)[] | undefined;
type TimecampActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

export const timecampActionHandlers: ProviderActionHandlers<"timecamp", TimecampActionHandler> = {
  async get_current_user(_input, context): Promise<unknown> {
    const payload = await requestTimecampJson({
      path: "/me",
      method: "GET",
      context,
      phase: "execute",
    });

    return {
      user: normalizeUser(payload),
    };
  },

  async list_users(input, context): Promise<unknown> {
    const payload = await requestTimecampJson({
      path: "/users",
      method: "GET",
      context,
      params: compactObject({
        active_only: readOptionalBooleanString(input.activeOnly),
      }),
      phase: "execute",
    });

    return {
      users: readRecordArray(payload).map(normalizeUser),
    };
  },

  async list_tasks(input, context): Promise<unknown> {
    const payload = await requestTimecampJson({
      path: "/tasks",
      method: "GET",
      context,
      params: compactObject({
        task_id: readOptionalIdList(input.taskIds),
        external_task_id: optionalString(input.externalTaskId),
        perms: readOptionalStringList(input.permissions),
        status: optionalString(input.status),
        minimal: readOptionalFlag(input.minimal),
        ignoreAdminRights: readOptionalBooleanString(input.ignoreAdminRights),
      }),
      phase: "execute",
    });

    return {
      tasks: readTaskRecords(payload).map(normalizeTask),
      raw: payload,
    };
  },

  async list_time_entries(input, context): Promise<unknown> {
    assertHasDateRange(input);
    const payload = await requestTimecampJson({
      path: "/entries",
      method: "GET",
      context,
      params: compactObject({
        from: optionalString(input.from),
        to: optionalString(input.to),
        billable: readOptionalBooleanString(input.billable),
        modify_from: optionalString(input.modifyFrom),
        modify_to: optionalString(input.modifyTo),
        "tags_filter[items][][tag]": readOptionalIdArray(input.tagIds),
        approvalMode: readOptionalBooleanString(input.approvalMode),
        opt_fields: optionalString(input.optionalFields),
        include_project: readOptionalBooleanString(input.includeProject),
        include_rates: readOptionalBooleanString(input.includeRates),
        with_subtasks: readOptionalBooleanString(input.withSubtasks),
        ignoreInvoiced: readOptionalBooleanString(input.ignoreInvoiced),
        round_duration: readOptionalBooleanString(input.roundDuration),
        active_only: readOptionalBooleanString(input.activeOnly),
        user_ids: readOptionalStringList(input.userIds),
      }),
      phase: "execute",
    });

    return {
      timeEntries: readTimeEntryRecords(payload).map(normalizeTimeEntry),
      raw: payload,
    };
  },

  async create_time_entry(input, context): Promise<unknown> {
    assertCreatableTimeEntry(input);
    const payload = await requestTimecampJson({
      path: "/entries",
      method: "POST",
      context,
      body: compactObject({
        date: optionalString(input.date),
        start_time: optionalString(input.startTime),
        end_time: optionalString(input.endTime),
        duration: readOptionalNumber(input.duration),
        user_id: readOptionalIdValue(input.userId),
        task_id: readOptionalIdValue(input.taskId),
        tags: readOptionalTagInput(input.tags),
        note: optionalString(input.note),
        description: optionalString(input.description),
        billable: typeof input.billable === "boolean" ? input.billable : undefined,
      }),
      phase: "execute",
    });

    const record = optionalRecord(payload) ?? {};
    return {
      entryId: readOptionalId(record.entry_id) ?? null,
      raw: record,
    };
  },

  async update_time_entry(input, context): Promise<unknown> {
    assertUpdatableTimeEntry(input);
    const payload = await requestTimecampJson({
      path: "/entries",
      method: "PUT",
      context,
      body: compactObject({
        id: readRequiredIdValue(input.entryId, "entryId"),
        start_time: optionalString(input.startTime),
        end_time: optionalString(input.endTime),
        duration: readOptionalNumber(input.duration),
        date: optionalString(input.date),
        note: optionalString(input.note),
        description: optionalString(input.description),
        invoiceId: readOptionalIdValue(input.invoiceId),
        task_id: readOptionalIdValue(input.taskId),
        billable: typeof input.billable === "boolean" ? input.billable : undefined,
      }),
      phase: "execute",
    });

    return {
      timeEntry: normalizeTimeEntry(payload),
    };
  },

  async get_timer_status(_input, context): Promise<unknown> {
    return requestTimerAction({ action: "status" }, context);
  },

  async start_timer(input, context): Promise<unknown> {
    return requestTimerAction(
      compactObject({
        action: "start",
        task_id: readOptionalIdValue(input.taskId),
        started_at: optionalString(input.startedAt),
      }),
      context,
    );
  },

  async stop_timer(input, context): Promise<unknown> {
    return requestTimerAction(
      compactObject({
        action: "stop",
        stopped_at: optionalString(input.stoppedAt),
      }),
      context,
    );
  },
};

export async function validateTimecampCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestTimecampJson({
    path: "/me",
    method: "GET",
    context: {
      apiKey,
      fetcher,
      signal,
    },
    phase: "validate",
  });
  const user = normalizeUser(payload);
  const accountLabel = optionalString(user.displayName) ?? optionalString(user.email) ?? "TimeCamp API Key";
  const providerAccountId = optionalString(user.userId) ?? optionalString(user.email) ?? accountLabel;

  return {
    profile: {
      accountId: providerAccountId,
      displayName: accountLabel,
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: timecampApiBaseUrl,
      validationEndpoint: "/me",
      userId: optionalString(user.userId),
      email: optionalString(user.email),
      rootGroupId: optionalString(user.rootGroupId),
    }),
  };
}

async function requestTimerAction(
  body: Record<string, unknown>,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
): Promise<unknown> {
  const payload = await requestTimecampJson({
    path: "/timer",
    method: "POST",
    context,
    body,
    phase: "execute",
  });

  return {
    timer: normalizeTimer(payload),
  };
}

async function requestTimecampJson(input: {
  path: string;
  method: "GET" | "POST" | "PUT";
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  params?: Record<string, TimecampQueryValue>;
  body?: Record<string, unknown>;
  phase: TimecampPhase;
}): Promise<unknown> {
  const timeout = createProviderTimeout(input.context.signal);

  try {
    const response = await input.context.fetcher(buildTimecampUrl(input.path, input.params ?? {}), {
      method: input.method,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.context.apiKey}`,
        "user-agent": providerUserAgent,
        ...(input.body ? { "content-type": "application/json" } : {}),
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: timeout.signal,
    });
    const payload = await readTimecampPayload(response);

    if (!response.ok) {
      throw createTimecampError(response.status, payload, input.phase);
    }

    return payload ?? {};
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "TimeCamp request timed out");
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `TimeCamp request failed: ${error.message}` : "TimeCamp request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildTimecampUrl(path: string, params: Record<string, TimecampQueryValue>): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${timecampApiBaseUrl}/`);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, String(item));
      }
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  return url;
}

async function readTimecampPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "TimeCamp returned invalid JSON");
  }
}

function createTimecampError(status: number, payload: unknown, phase: TimecampPhase): ProviderRequestError {
  const message = extractTimecampErrorMessage(payload) ?? `TimeCamp request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message);
  }

  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message);
  }

  if (phase === "execute" && status === 401) {
    return new ProviderRequestError(401, message);
  }

  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message);
  }

  return new ProviderRequestError(status || 502, message);
}

function extractTimecampErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload.trim();
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const message = optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.detail);
  if (message) {
    return message;
  }

  for (const value of Object.values(record)) {
    if (Array.isArray(value)) {
      const firstString = value.find((item) => typeof item === "string" && item.trim() !== "");
      if (typeof firstString === "string") {
        return firstString.trim();
      }
    }
  }

  return undefined;
}

function normalizeUser(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value) ?? {};
  return {
    userId: readOptionalId(record.user_id) ?? readOptionalId(record.id) ?? null,
    email: optionalString(record.email) ?? null,
    displayName: optionalString(record.display_name) ?? null,
    groupId: readOptionalId(record.group_id) ?? null,
    rootGroupId: readOptionalId(record.root_group_id) ?? null,
    registerTime: optionalString(record.register_time) ?? null,
    loginTime: optionalString(record.login_time) ?? null,
    syncTime: optionalString(record.synch_time) ?? optionalString(record.sync_time) ?? null,
    permissions: optionalRecord(record.permissions) ?? {},
    raw: record,
  };
}

function normalizeTask(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value) ?? {};
  return {
    taskId: readOptionalId(record.task_id) ?? readOptionalId(record.id) ?? null,
    parentId: readOptionalId(record.parent_id) ?? null,
    assignedBy: readOptionalId(record.assigned_by) ?? null,
    name: optionalString(record.name) ?? null,
    externalTaskId: optionalString(record.external_task_id) ?? null,
    externalParentId: optionalString(record.external_parent_id) ?? null,
    level: readOptionalNumber(record.level) ?? null,
    archived: readOptionalBooleanFlag(record.archived) ?? null,
    billable: readOptionalBooleanFlag(record.billable) ?? null,
    color: optionalString(record.color) ?? null,
    note: optionalRawString(record.note) ?? null,
    addDate: optionalString(record.add_date) ?? null,
    modifyTime: optionalString(record.modify_time) ?? null,
    users: optionalRecord(record.users) ?? {},
    raw: record,
  };
}

function normalizeTimeEntry(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value) ?? {};
  return {
    entryId: readOptionalId(record.id) ?? readOptionalId(record.entry_id) ?? null,
    duration: readOptionalNumber(record.duration) ?? readOptionalNumber(record.time_span) ?? null,
    userId: readOptionalId(record.user_id) ?? null,
    userName: optionalString(record.user_name) ?? null,
    taskId: readOptionalId(record.task_id) ?? null,
    taskName: optionalString(record.name) ?? null,
    date: optionalString(record.date) ?? null,
    startTime: optionalString(record.start_time) ?? optionalString(record.start_time_hour) ?? null,
    endTime: optionalString(record.end_time) ?? optionalString(record.end_time_hour) ?? null,
    lastModify: optionalString(record.last_modify) ?? null,
    locked: readOptionalBooleanFlag(record.locked) ?? null,
    billable: readOptionalBooleanFlag(record.billable) ?? null,
    invoiceId: readOptionalId(record.invoiceId) ?? null,
    note: optionalRawString(record.note) ?? optionalRawString(record.description) ?? null,
    color: optionalString(record.color) ?? null,
    tags: readRecordArray(record.tags).map(normalizeEntryTag),
    hasEntryLocationHistory: readOptionalBooleanFlag(record.hasEntryLocationHistory) ?? null,
    raw: record,
  };
}

function normalizeEntryTag(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value) ?? {};
  return {
    tagListName: optionalString(record.tagListName) ?? null,
    tagListId: readOptionalId(record.tagListId) ?? null,
    tagId: readOptionalId(record.tagId) ?? null,
    name: optionalString(record.name) ?? null,
    mandatory: readOptionalBooleanFlag(record.mandatory) ?? null,
    raw: record,
  };
}

function normalizeTimer(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value) ?? {};
  return {
    isTimerRunning: readOptionalBooleanFlag(record.isTimerRunning) ?? null,
    elapsed: readOptionalNumber(record.elapsed) ?? null,
    entryId: readOptionalId(record.entry_id) ?? null,
    timerId: readOptionalId(record.timer_id) ?? null,
    newTimerId: readOptionalId(record.new_timer_id) ?? null,
    startTime: optionalString(record.start_time) ?? null,
    entryTime: readOptionalNumber(record.entry_time) ?? null,
    raw: record,
  };
}

function readTaskRecords(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.flatMap((item) => {
      const record = optionalRecord(item);
      return record ? [record] : [];
    });
  }

  const record = optionalRecord(payload);
  if (!record) {
    return [];
  }

  if (record.task_id !== undefined || record.id !== undefined) {
    return [record];
  }

  return Object.values(record).flatMap((item) => {
    const task = optionalRecord(item);
    return task ? [task] : [];
  });
}

function readTimeEntryRecords(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.flatMap((item) => {
      const record = optionalRecord(item);
      return record ? [record] : [];
    });
  }

  const record = optionalRecord(payload);
  if (!record) {
    return [];
  }

  if (record.id !== undefined || record.entry_id !== undefined) {
    return [record];
  }

  return Object.values(record).flatMap((item) => {
    const entry = optionalRecord(item);
    return entry ? [entry] : [];
  });
}

function readRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const record = optionalRecord(item);
    return record ? [record] : [];
  });
}

function readOptionalTagInput(value: unknown): Array<{ tagId: string | number }> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const tags = value.flatMap((item) => {
    const tagId = readOptionalId(item);
    return tagId ? [{ tagId: Number.isNaN(Number(tagId)) ? tagId : Number(tagId) }] : [];
  });
  return tags.length > 0 ? tags : undefined;
}

function readOptionalStringList(value: unknown): string | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items = value.flatMap((item) => {
    const text = optionalString(item);
    return text ? [text] : [];
  });
  return items.length > 0 ? items.join(",") : undefined;
}

function readOptionalIdList(value: unknown): string | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items = value.flatMap((item) => {
    const id = readOptionalId(item);
    return id ? [id] : [];
  });
  return items.length > 0 ? items.join(",") : undefined;
}

function readOptionalIdArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items = value.flatMap((item) => {
    const id = readOptionalId(item);
    return id ? [id] : [];
  });
  return items.length > 0 ? items : undefined;
}

function readOptionalBooleanString(value: unknown): string | undefined {
  return typeof value === "boolean" ? String(value) : undefined;
}

function readOptionalFlag(value: unknown): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  return value === true ? 1 : 0;
}

function readOptionalId(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

function readOptionalIdValue(value: unknown): string | number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return readOptionalId(value);
}

function readRequiredIdValue(value: unknown, fieldName: string): string | number {
  const id = readOptionalIdValue(value);
  if (id !== undefined) {
    return id;
  }
  throw new ProviderRequestError(400, `${fieldName} is required`);
}

function readOptionalNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readOptionalBooleanFlag(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (value === 1) {
      return true;
    }
    if (value === 0) {
      return false;
    }
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "1" || normalized === "true") {
      return true;
    }
    if (normalized === "0" || normalized === "false") {
      return false;
    }
  }
  return undefined;
}

function assertHasDateRange(input: Record<string, unknown>): void {
  const hasDateRange = input.from !== undefined && input.to !== undefined;
  const hasModifyRange = input.modifyFrom !== undefined && input.modifyTo !== undefined;
  if (!hasDateRange && !hasModifyRange) {
    throw new ProviderRequestError(400, "Either from and to, or modifyFrom and modifyTo, are required.");
  }
}

function assertCreatableTimeEntry(input: Record<string, unknown>): void {
  const hasDuration = input.duration !== undefined;
  const hasStartAndEnd = input.startTime !== undefined && input.endTime !== undefined;
  if (!hasDuration && !hasStartAndEnd) {
    throw new ProviderRequestError(400, "Either duration or both startTime and endTime are required.");
  }
}

function assertUpdatableTimeEntry(input: Record<string, unknown>): void {
  const updateFields = [
    "startTime",
    "endTime",
    "duration",
    "date",
    "note",
    "description",
    "invoiceId",
    "taskId",
    "billable",
  ];
  if (updateFields.every((field) => input[field] === undefined)) {
    throw new ProviderRequestError(
      400,
      "At least one of startTime, endTime, duration, date, note, description, invoiceId, taskId, or billable is required.",
    );
  }
}
