import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  providerUserAgent,
  ProviderRequestError,
  readProviderTextBody,
} from "../provider-runtime.ts";

export const triggercmdApiBaseUrl = "https://www.triggercmd.com";

const listCommandsPath = "/api/command/list";

type TriggercmdRequestPhase = "validate" | "execute";
type TriggercmdContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type TriggercmdActionHandler = (
  input: Record<string, unknown>,
  context: TriggercmdContext,
) => Promise<Record<string, unknown>>;

interface TriggercmdRequestInput {
  apiKey: string;
  path: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  phase: TriggercmdRequestPhase;
  body?: Record<string, unknown>;
}

export const triggercmdActionHandlers: ProviderActionHandlers<"triggercmd", TriggercmdActionHandler> = {
  async list_commands(_input, context) {
    return requireResponseObject(
      await requestTriggercmdPayload({
        ...context,
        path: listCommandsPath,
        phase: "execute",
      }),
    );
  },

  async trigger_command(input, context) {
    const payload = await requestTriggercmdPayload({
      ...context,
      path: "/api/run/trigger",
      phase: "execute",
      body: compactObject({
        computer: input.computer,
        trigger: input.trigger,
        params: input.params,
      }),
    });
    const record = optionalRecord(payload);
    if (record) {
      return record;
    }
    if (typeof payload === "string" && payload.trim()) {
      return { message: payload.trim() };
    }
    throw new ProviderRequestError(502, "TRIGGERcmd returned an invalid trigger response");
  },
};

export async function validateTriggercmdCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = requireResponseObject(
    await requestTriggercmdPayload({
      apiKey,
      path: listCommandsPath,
      fetcher,
      signal,
      phase: "validate",
    }),
  );
  const records = requireCommandRecords(payload);

  return {
    profile: {
      displayName: "TRIGGERcmd API Token",
    },
    grantedScopes: [],
    metadata: {
      validationEndpoint: listCommandsPath,
      commandCount: records.length,
    },
  };
}

async function requestTriggercmdPayload(input: TriggercmdRequestInput): Promise<unknown> {
  const timeout = createProviderTimeout(input.signal);
  let response: Response;
  try {
    const headers: Record<string, string> = {
      accept: "application/json",
      authorization: `Bearer ${input.apiKey}`,
      "user-agent": providerUserAgent,
    };
    if (input.body !== undefined) {
      headers["content-type"] = "application/json";
    }

    response = await input.fetcher(new URL(input.path, triggercmdApiBaseUrl), {
      method: "POST",
      headers,
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
  } catch (error) {
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "TRIGGERcmd request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `TRIGGERcmd request failed: ${error.message}` : "TRIGGERcmd request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }

  const payload = await readTriggercmdPayload(response);
  if (!response.ok) {
    throw createTriggercmdError(response.status, payload, input.phase);
  }
  return payload;
}

async function readTriggercmdPayload(response: Response): Promise<unknown> {
  const text = await readProviderTextBody(response, "TRIGGERcmd response");
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(text) as unknown;
    } catch (error) {
      throw new ProviderRequestError(502, "TRIGGERcmd returned an invalid JSON response", error);
    }
  }

  return text.trim();
}

function createTriggercmdError(status: number, payload: unknown, phase: TriggercmdRequestPhase): ProviderRequestError {
  const message = readTriggercmdErrorMessage(payload) ?? `TRIGGERcmd request failed with status ${status}`;

  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(status || 502, message, payload);
}

function readTriggercmdErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return payload || undefined;
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  for (const field of ["message", "error"]) {
    const value = optionalString(record[field]);
    if (value?.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function requireCommandRecords(payload: Record<string, unknown>): unknown[] {
  if (!Array.isArray(payload.records)) {
    throw new ProviderRequestError(502, "TRIGGERcmd returned an invalid command list");
  }
  return payload.records;
}

function requireResponseObject(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "TRIGGERcmd returned an invalid response");
  }
  return record;
}
