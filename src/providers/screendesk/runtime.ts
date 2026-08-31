import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
  requiredInputString,
} from "../provider-runtime.ts";

export const screendeskApiBaseUrl = "https://app.screendesk.io/api/v2";

export interface ScreendeskContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface ScreendeskRequestInput {
  context: ScreendeskContext;
  path: string;
  phase: "validate" | "execute";
  method?: "GET" | "PATCH";
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
}

type ScreendeskHandler = (input: Record<string, unknown>, context: ScreendeskContext) => Promise<unknown>;

export const screendeskActionHandlers: Record<string, ScreendeskHandler> = {
  list_recordings(input, context) {
    return requestScreendesk({
      context,
      path: "/recordings",
      phase: "execute",
      query: { page: input.page, ticket_id: input.ticketId, provider: input.provider },
    });
  },
  get_recording(input, context) {
    return requestScreendesk({
      context,
      path: `/recordings/${encodeURIComponent(requiredInputString(input.recordingUuid, "recordingUuid"))}`,
      phase: "execute",
    });
  },
  update_recording(input, context) {
    const recording = compactObject({
      title: input.title,
      summary: input.summary,
      description: input.description,
    });
    if (Object.keys(recording).length === 0) {
      throw new ProviderRequestError(400, "title, summary, or description is required");
    }
    return requestScreendesk({
      context,
      path: `/recordings/${encodeURIComponent(requiredInputString(input.recordingUuid, "recordingUuid"))}`,
      phase: "execute",
      method: "PATCH",
      body: { recording },
    });
  },
  get_recording_transcript(input, context) {
    return requestScreendesk({
      context,
      path: `/recordings/${encodeURIComponent(requiredInputString(input.recordingUuid, "recordingUuid"))}/transcript`,
      phase: "execute",
      query: { page: input.page },
    });
  },
  list_users(input, context) {
    return requestScreendesk({ context, path: "/users", phase: "execute", query: { page: input.page } });
  },
  search_user(input, context) {
    return requestScreendesk({
      context,
      path: "/users/search",
      phase: "execute",
      query: { email: requiredInputString(input.email, "email") },
    });
  },
};

export async function validateScreendeskCredential(context: ScreendeskContext): Promise<void> {
  await requestScreendesk({
    context,
    path: "/recordings",
    phase: "validate",
    query: { page: 1 },
  });
}

async function requestScreendesk(input: ScreendeskRequestInput): Promise<unknown> {
  const timeout = createProviderTimeout(input.context.signal);
  try {
    const relativePath = input.path.startsWith("/") ? input.path.slice(1) : input.path;
    const url = new URL(relativePath, `${screendeskApiBaseUrl}/`);
    for (const [key, value] of Object.entries(input.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    const response = await input.context.fetcher(url, {
      method: input.method ?? "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.context.apiKey}`,
        "user-agent": providerUserAgent,
        ...(input.body ? { "content-type": "application/json" } : {}),
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: timeout.signal,
    });
    const payload = await readPayload(response);
    if (!response.ok) throw createScreendeskError(response.status, payload, input.phase);
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Screendesk request timed out");
    }
    throw new ProviderRequestError(502, "Screendesk request failed");
  } finally {
    timeout.cleanup();
  }
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createScreendeskError(status: number, payload: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const message = readScreendeskErrorMessage(payload) ?? `Screendesk request failed with status ${status}`;
  if (status === 401 || (status === 403 && phase === "validate")) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (status === 429) return new ProviderRequestError(429, message, payload);
  return new ProviderRequestError(status >= 400 ? status : 502, message, payload);
}

function readScreendeskErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") return payload.trim() || undefined;
  const record = optionalRecord(payload);
  if (!record) return undefined;
  if (typeof record.error === "string") return record.error;
  return optionalString(optionalRecord(record.error)?.message) ?? optionalString(record.message);
}
