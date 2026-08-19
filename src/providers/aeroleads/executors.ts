import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "aeroleads";
const aeroleadsApiBaseUrl = "https://aeroleads.com";
const linkedinDetailsPath = "/api/get_linkedin_details";

interface AeroleadsActionContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type AeroleadsActionHandler = (input: Record<string, unknown>, context: AeroleadsActionContext) => Promise<unknown>;

export const aeroleadsActionHandlers: ProviderActionHandlers<"aeroleads", AeroleadsActionHandler> = {
  get_details_from_linkedin_url(input, context) {
    return getDetailsFromLinkedinUrl(input, context);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<AeroleadsActionContext>({
  service,
  handlers: aeroleadsActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<AeroleadsActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input) {
    if (!input.apiKey.trim()) {
      throw new ProviderRequestError(400, "aeroleads api_key is required");
    }

    return {
      profile: {
        accountId: "api_key",
        displayName: "AeroLeads API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: aeroleadsApiBaseUrl,
        validationMode: "format_only",
      },
    };
  },
};

async function getDetailsFromLinkedinUrl(
  input: Record<string, unknown>,
  context: AeroleadsActionContext,
): Promise<unknown> {
  const linkedinUrl = optionalString(input.linkedin_url);
  if (!linkedinUrl) {
    throw new ProviderRequestError(400, "linkedin_url is required");
  }

  const url = new URL(linkedinDetailsPath, aeroleadsApiBaseUrl);
  url.searchParams.set("api_key", context.apiKey);
  url.searchParams.set("linkedin_url", linkedinUrl);

  const payload = await requestAeroleads(url, context);
  return normalizeLinkedinDetailsPayload(payload);
}

async function requestAeroleads(url: URL, context: AeroleadsActionContext): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await context.fetcher(url.toString(), {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      `AeroLeads request failed: ${error instanceof Error ? error.message : "Unknown transport error"}`,
    );
  }

  const payload = await readAeroleadsPayload(response);
  if (!response.ok) {
    throw mapAeroleadsError(response.status, readAeroleadsMessage(payload));
  }

  const message = readAeroleadsMessage(payload);
  if (isFailurePayload(payload)) {
    throw mapAeroleadsError(400, message);
  }

  return payload;
}

async function readAeroleadsPayload(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    const payload = JSON.parse(text) as unknown;
    return optionalRecord(payload) ?? {};
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, "AeroLeads returned malformed JSON");
    }
    return { message: text };
  }
}

function normalizeLinkedinDetailsPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const data = readPayloadData(payload);
  const successful = readSuccessful(payload);
  return {
    data,
    successful,
    ...(typeof payload.message === "string" ? { message: payload.message } : {}),
  };
}

function readPayloadData(payload: Record<string, unknown>): Record<string, unknown> {
  const data = optionalRecord(payload.data);
  return data ?? payload;
}

function readSuccessful(payload: Record<string, unknown>): boolean {
  if (payload.successful !== undefined) {
    return readStatusFlag(payload.successful) === true;
  }
  if (payload.status !== undefined) {
    return readStatusFlag(payload.status) === true;
  }
  return true;
}

function isFailurePayload(payload: Record<string, unknown>): boolean {
  if (payload.successful !== undefined && readStatusFlag(payload.successful) !== true) {
    return true;
  }
  if (payload.status !== undefined && readStatusFlag(payload.status) !== true) {
    return true;
  }
  return false;
}

function readStatusFlag(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "success" || normalized === "ok") {
    return true;
  }
  if (
    normalized === "false" ||
    normalized === "error" ||
    normalized === "failed" ||
    normalized === "failure" ||
    normalized === "no"
  ) {
    return false;
  }
  return undefined;
}

function readAeroleadsMessage(payload: Record<string, unknown>): string {
  if (typeof payload.message === "string") {
    return payload.message;
  }
  if (typeof payload.error === "string") {
    return payload.error;
  }
  if (Array.isArray(payload.errors) && typeof payload.errors[0] === "string") {
    return payload.errors[0];
  }
  return "AeroLeads request failed";
}

function mapAeroleadsError(status: number, message: string): ProviderRequestError {
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(status, message);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(502, message);
}
