import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { FfhubActionName } from "./actions.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredRecord,
} from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "ffhub";
const ffhubApiBaseUrl = "https://api.ffhub.io/v1/";
const ffhubValidationPath = "/status";
const ffhubDefaultTimeoutMs = 30_000;

type FfhubRequestPhase = "validate" | "execute";
type FfhubActionContext = ApiKeyProviderContext;
type FfhubQuery = Record<string, string | number | boolean | undefined>;
type FfhubActionHandler = (input: Record<string, unknown>, context: FfhubActionContext) => Promise<unknown>;

interface FfhubRequestSignal {
  signal: AbortSignal;
  cleanup: () => void;
}

export const ffhubActionHandlers: Record<FfhubActionName, FfhubActionHandler> = {
  async create_ffmpeg_task(input, context): Promise<unknown> {
    const payload = await requestFfhub({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      path: "/tasks",
      method: "POST",
      body: compactObject({
        command: readRequiredInputString(input.command, "command"),
        webhook: optionalString(input.webhook),
        with_metadata: optionalBoolean(input.withMetadata),
      }),
    });

    const body = readBodyObject(payload, "ffhub create_ffmpeg_task");
    return {
      taskId: readRequiredProviderString(body.task_id, "ffhub create_ffmpeg_task task_id"),
    };
  },
  async get_ffmpeg_task(input, context): Promise<unknown> {
    const taskId = readRequiredInputString(input.taskId, "taskId");
    const payload = await requestFfhub({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      path: `/tasks/${encodeURIComponent(taskId)}`,
    });

    return {
      task: normalizeTask(payload, "ffhub get_ffmpeg_task"),
    };
  },
  async list_ffmpeg_tasks(input, context): Promise<unknown> {
    const payload = await requestFfhub({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      path: "/tasks",
      query: compactObject({
        user_id: optionalString(input.userId),
        status: optionalString(input.status),
        limit: optionalInteger(input.limit),
        offset: optionalInteger(input.offset),
      }),
    });

    const body = readBodyObject(payload, "ffhub list_ffmpeg_tasks");
    if (!Array.isArray(body.tasks)) {
      throw new ProviderRequestError(502, "ffhub list_ffmpeg_tasks response.tasks is invalid");
    }

    return {
      tasks: body.tasks.map((task, index) => normalizeTask(task, `ffhub list_ffmpeg_tasks task ${index}`)),
      total: readRequiredProviderInteger(body.total, "ffhub list_ffmpeg_tasks total"),
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, ffhubActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await requestFfhub({
      apiKey: input.apiKey,
      fetcher,
      signal,
      phase: "validate",
      path: ffhubValidationPath,
    });

    return {
      profile: {
        accountId: "api_key",
        displayName: "FFHub API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: "https://api.ffhub.io/v1",
        validationEndpoint: ffhubValidationPath,
      },
    };
  },
};

async function requestFfhub(input: {
  apiKey: string;
  fetcher: typeof fetch;
  phase: FfhubRequestPhase;
  path: string;
  method?: string;
  query?: FfhubQuery;
  body?: Record<string, unknown>;
  signal?: AbortSignal;
}): Promise<unknown> {
  const relativePath = input.path.startsWith("/") ? input.path.slice(1) : input.path;
  const url = new URL(relativePath, ffhubApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const requestSignal = createFfhubRequestSignal(input.signal);
  try {
    const response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers: createFfhubHeaders(input.apiKey, input.body != null),
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: requestSignal.signal,
    });
    const payload = await readJsonBody(response);
    if (!response.ok) {
      throw createFfhubError(response, payload, input.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (isAbortError(error)) {
      throw new ProviderRequestError(504, `ffhub ${input.path} request timed out after 30 seconds`);
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `ffhub ${input.path} request failed: ${error.message}`
        : `ffhub ${input.path} request failed`,
    );
  } finally {
    requestSignal.cleanup();
  }
}

async function readJsonBody(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createFfhubError(response: Response, payload: unknown, phase: FfhubRequestPhase): ProviderRequestError {
  const body = optionalRecord(payload);
  const message =
    optionalString(body?.message) ?? optionalString(body?.error) ?? response.statusText ?? "ffhub request failed";

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(401, message, payload);
  }
  if (response.status === 400 || response.status === 404) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(response.status || 502, message, payload);
}

function createFfhubHeaders(apiKey: string, hasJsonBody: boolean): Headers {
  const headers = new Headers({
    Accept: "application/json",
    Authorization: `Bearer ${apiKey}`,
    "User-Agent": providerUserAgent,
  });
  if (hasJsonBody) {
    headers.set("Content-Type", "application/json");
  }
  return headers;
}

function normalizeTask(value: unknown, label: string): Record<string, unknown> {
  const task = readBodyObject(value, label);
  return {
    taskId: readRequiredProviderString(task.task_id, `${label} task_id`),
    userId: readNullableString(task.user_id),
    status: readRequiredProviderString(task.status, `${label} status`),
    progress: readNullableInteger(task.progress),
    error: readNullableString(task.error),
    elapsed: readNullableString(task.elapsed),
    totalElapsed: readNullableString(task.total_elapsed),
    createdAt: readNullableString(task.created_at),
    finishedAt: readNullableString(task.finished_at),
    outputs: normalizeOutputFiles(task.outputs, label),
  };
}

function normalizeOutputFiles(value: unknown, label: string): Array<Record<string, unknown>> {
  if (value == null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${label} outputs is invalid`);
  }

  return value.map((item, index) => {
    const file = readBodyObject(item, `${label} output ${index}`);
    return {
      filename: readRequiredProviderString(file.filename, `${label} output ${index} filename`),
      url: readRequiredProviderString(file.url, `${label} output ${index} url`),
      size: readNullableInteger(file.size),
      metadata: optionalRecord(file.metadata) ?? null,
    };
  });
}

function readBodyObject(value: unknown, label: string): Record<string, unknown> {
  return requiredRecord(value, `${label} response`, (message) => new ProviderRequestError(502, message));
}

function readRequiredInputString(value: unknown, fieldName: string): string {
  const text = optionalString(value);
  if (text) {
    return text;
  }
  throw new ProviderRequestError(400, `${fieldName} is required`);
}

function readRequiredProviderString(value: unknown, label: string): string {
  const text = optionalString(value);
  if (text) {
    return text;
  }
  throw new ProviderRequestError(502, `${label} is missing`);
}

function readRequiredProviderInteger(value: unknown, label: string): number {
  const number = optionalInteger(value);
  if (number !== undefined) {
    return number;
  }
  throw new ProviderRequestError(502, `${label} is missing`);
}

function readNullableString(value: unknown): string | null {
  return value == null ? null : (optionalString(value) ?? null);
}

function readNullableInteger(value: unknown): number | null {
  return value == null ? null : (optionalInteger(value) ?? null);
}

function createFfhubRequestSignal(parent?: AbortSignal): FfhubRequestSignal {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ffhubDefaultTimeoutMs);
  const abortFromParent = (): void => controller.abort(parent?.reason);
  if (parent?.aborted) {
    controller.abort(parent.reason);
  } else {
    parent?.addEventListener("abort", abortFromParent, { once: true });
  }

  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timeout);
      parent?.removeEventListener("abort", abortFromParent);
    },
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}
