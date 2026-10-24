import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers } from "../provider-executors.ts";

import {
  compactObject,
  looseArray,
  optionalInteger,
  optionalRawString,
  optionalRecord,
  optionalString,
} from "../../core/cast.ts";
import {
  ProviderRequestError,
  providerResponseError,
  providerUserAgent,
  readProviderJsonBody,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";

export const assuredPlatformApiBaseUrl = "https://prod-backend.withassured.com";
const currentUserPath = "/api/v1/users/logged-in-user-details/";
const tasksPath = "/api/v1/task-management/tasks/";

type AssuredPlatformHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const assuredPlatformActionHandlers: ProviderActionHandlers<"assured_platform", AssuredPlatformHandler> = {
  async get_current_user(_input, context) {
    return {
      user: requiredResponseRecord(
        await requestAssuredPlatformJson(currentUserPath, context),
        "Assured Platform current user",
      ),
    };
  },
  async list_tasks(input, context) {
    const payload = requiredResponseRecord(
      await requestAssuredPlatformJson(
        tasksPath,
        context,
        compactObject({
          limit: optionalInteger(input.limit),
          offset: optionalInteger(input.offset),
          search: optionalString(input.search),
          status: optionalString(input.status),
          task_type: optionalString(input.taskType),
          assignee: optionalString(input.assigneeId),
          client: optionalString(input.clientId),
          facility: optionalString(input.facilityId),
          created_at_after: optionalString(input.createdAtAfter),
          created_at_before: optionalString(input.createdAtBefore),
          due_on_after: optionalString(input.dueOnAfter),
          due_on_before: optionalString(input.dueOnBefore),
          ordering: optionalString(input.ordering),
        }),
      ),
      "Assured Platform task list",
    );
    const count = payload.count;
    const tasks = looseArray(payload.results);
    if (!Number.isInteger(count)) throw providerResponseError("Assured Platform task count must be an integer");
    if (!tasks.every((task) => optionalRecord(task))) {
      throw providerResponseError("Assured Platform tasks must be an array of objects");
    }
    return {
      count,
      next: nullableString(payload.next, "Assured Platform next page"),
      previous: nullableString(payload.previous, "Assured Platform previous page"),
      tasks,
    };
  },
  async get_task(input, context) {
    const taskId = requiredInputString(input.taskId, "taskId");
    return {
      task: requiredResponseRecord(
        await requestAssuredPlatformJson(`${tasksPath}${encodeURIComponent(taskId)}/`, context),
        "Assured Platform task",
      ),
    };
  },
};

export async function validateAssuredPlatformCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const user = requiredResponseRecord(
    await requestAssuredPlatformJson(currentUserPath, { apiKey, fetcher, signal }),
    "Assured Platform current user",
  );
  return {
    profile: {
      accountId: optionalString(user.id),
      displayName: accountLabel(user),
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: assuredPlatformApiBaseUrl,
      validationEndpoint: currentUserPath,
    },
  };
}

async function requestAssuredPlatformJson(
  path: string,
  context: ApiKeyProviderContext,
  query?: Record<string, unknown>,
): Promise<unknown> {
  return runProviderRequest({ label: "Assured Platform", signal: context.signal }, async (signal) => {
    const url = new URL(path, assuredPlatformApiBaseUrl);
    for (const [name, value] of Object.entries(query ?? {})) {
      if (value !== undefined) url.searchParams.set(name, String(value));
    }
    const response = await context.fetcher(url, {
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
        "x-api-key": context.apiKey,
      },
      signal,
    });
    const payload = await readProviderJsonBody(response, {
      emptyBody: null,
      invalidJsonMessage: "Assured Platform returned invalid JSON",
      invalidJsonFallback: response.ok ? undefined : (text) => text.trim(),
    });
    if (!response.ok) {
      const record = optionalRecord(payload);
      const message =
        optionalRawString(payload) ??
        optionalString(record?.detail) ??
        optionalString(record?.message) ??
        optionalString(record?.error) ??
        `Assured Platform request failed with status ${response.status}`;
      throw new ProviderRequestError(response.status || 502, message);
    }
    return payload;
  });
}

function nullableString(value: unknown, label: string): string | null {
  if (value == null) return null;
  const text = optionalString(value);
  if (text == null) throw providerResponseError(`${label} must be a string or null`);
  return text;
}

function accountLabel(user: Record<string, unknown>): string {
  const fullName = [optionalString(user.first_name)?.trim(), optionalString(user.last_name)?.trim()]
    .filter(Boolean)
    .join(" ");
  return fullName || optionalString(user.email) || "Assured Platform API Key";
}
