import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "fellow";
const fellowValidationPath = "/api/v1/me";
const fellowAppHostSuffix = ".fellow.app";

type FellowPhase = "validate" | "execute";

interface FellowActionContext {
  apiKey: string;
  baseUrl: string;
  fetcher: typeof fetch;
  phase: FellowPhase;
  signal?: AbortSignal;
}

type FellowActionHandler = (input: Record<string, unknown>, context: FellowActionContext) => Promise<unknown>;

export const fellowActionHandlers: ProviderActionHandlers<"fellow", FellowActionHandler> = {
  get_current_user(_input, context) {
    return requestFellowJson({
      context,
      method: "GET",
      path: fellowValidationPath,
    });
  },
  async list_notes(input, context) {
    return {
      notes: readRecordField(
        await requestFellowJson({
          context,
          method: "POST",
          path: "/api/v1/notes",
          body: compactObject(input),
        }),
        "notes",
        "Fellow notes response",
      ),
    };
  },
  async get_note(input, context) {
    return {
      note: readRecordField(
        await requestFellowJson({
          context,
          method: "GET",
          path: `/api/v1/note/${encodeURIComponent(requiredInputString(input.note_id, "note_id"))}`,
        }),
        "note",
        "Fellow note response",
      ),
    };
  },
  async list_action_items(input, context) {
    return {
      action_items: readRecordField(
        await requestFellowJson({
          context,
          method: "POST",
          path: "/api/v1/action_items",
          body: compactObject(input),
        }),
        "action_items",
        "Fellow action items response",
      ),
    };
  },
  async get_action_item(input, context) {
    return {
      action_item: readRecordField(
        await requestFellowJson({
          context,
          method: "GET",
          path: `/api/v1/action_item/${encodeURIComponent(requiredInputString(input.action_item_id, "action_item_id"))}`,
        }),
        "action_item",
        "Fellow action item response",
      ),
    };
  },
  async mark_action_item_complete(input, context) {
    return {
      action_item: readRecordField(
        await requestFellowJson({
          context,
          method: "POST",
          path: `/api/v1/action_item/${encodeURIComponent(requiredInputString(input.action_item_id, "action_item_id"))}/complete`,
          body: {
            completed: input.completed,
          },
        }),
        "action_item",
        "Fellow action item response",
      ),
    };
  },
  async archive_action_item(input, context) {
    return {
      action_item: readRecordField(
        await requestFellowJson({
          context,
          method: "POST",
          path: `/api/v1/action_item/${encodeURIComponent(requiredInputString(input.action_item_id, "action_item_id"))}/archive`,
        }),
        "action_item",
        "Fellow action item response",
      ),
    };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<FellowActionContext>({
  service,
  handlers: fellowActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<FellowActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      baseUrl: resolveFellowBaseUrl(credential.values, credential.metadata),
      fetcher,
      phase: "execute",
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const subdomain = normalizeFellowSubdomain(input.values.subdomain);
    const baseUrl = buildFellowBaseUrl(subdomain);
    const payload = await requestFellowJson({
      context: {
        apiKey: input.apiKey,
        baseUrl,
        fetcher,
        phase: "validate",
        signal,
      },
      method: "GET",
      path: fellowValidationPath,
    });

    const user = readRecordField(payload, "user", "Fellow authenticated user response");
    const workspace = readRecordField(payload, "workspace", "Fellow authenticated user response");
    const userId = optionalString(user.id);
    const userEmail = optionalString(user.email);
    const userFullName = optionalString(user.full_name);
    const workspaceId = optionalString(workspace.id);
    const workspaceName = optionalString(workspace.name);
    const workspaceSubdomain = optionalString(workspace.subdomain);
    const storedSubdomain = workspaceSubdomain ? normalizeFellowSubdomain(workspaceSubdomain) : subdomain;

    return {
      profile: {
        accountId: workspaceId && userId ? `fellow:${workspaceId}:user:${userId}` : `fellow:${storedSubdomain}`,
        displayName: buildAccountLabel(userFullName, userEmail, workspaceName, storedSubdomain),
      },
      grantedScopes: [],
      metadata: compactObject({
        subdomain: storedSubdomain,
        baseUrl: buildFellowBaseUrl(storedSubdomain),
        validationEndpoint: fellowValidationPath,
        userId,
        userEmail,
        userFullName,
        workspaceId,
        workspaceName,
      }),
    };
  },
};

function resolveFellowBaseUrl(values: Record<string, string>, metadata: Record<string, unknown>): string {
  const metadataBaseUrl = optionalString(metadata.baseUrl);
  if (metadataBaseUrl) {
    return normalizeFellowBaseUrl(metadataBaseUrl);
  }

  const metadataSubdomain = optionalString(metadata.subdomain);
  const valueSubdomain = optionalString(values.subdomain);
  return buildFellowBaseUrl(normalizeFellowSubdomain(metadataSubdomain ?? valueSubdomain));
}

function buildAccountLabel(
  userFullName: string | undefined,
  userEmail: string | undefined,
  workspaceName: string | undefined,
  subdomain: string,
): string {
  const userLabel = userFullName ?? userEmail;
  const workspaceLabel = workspaceName ?? subdomain;
  return userLabel ? `${userLabel} @ ${workspaceLabel}` : workspaceLabel;
}

function buildFellowBaseUrl(subdomain: string): string {
  return `https://${subdomain}.fellow.app`;
}

function normalizeFellowBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ProviderRequestError(400, "Fellow baseUrl must be a valid URL");
  }

  if (url.protocol !== "https:") {
    throw new ProviderRequestError(400, "Fellow baseUrl must use https");
  }

  const host = url.hostname.toLowerCase();
  if (!host.endsWith(fellowAppHostSuffix)) {
    throw new ProviderRequestError(400, "Fellow baseUrl must end with .fellow.app");
  }

  const subdomain = host.slice(0, host.length - fellowAppHostSuffix.length);
  return buildFellowBaseUrl(normalizeFellowSubdomain(subdomain));
}

function normalizeFellowSubdomain(value: unknown): string {
  if (typeof value !== "string") {
    throw new ProviderRequestError(400, "Fellow subdomain is required");
  }

  const subdomain = value.trim().toLowerCase();
  if (!subdomain || subdomain.length > 63 || subdomain.startsWith("-") || subdomain.endsWith("-")) {
    throw new ProviderRequestError(400, "Fellow subdomain must be a single workspace subdomain label");
  }

  for (const char of subdomain) {
    const code = char.charCodeAt(0);
    const isDigit = code >= 48 && code <= 57;
    const isLowercaseLetter = code >= 97 && code <= 122;
    if (!isDigit && !isLowercaseLetter && char !== "-") {
      throw new ProviderRequestError(400, "Fellow subdomain must be a single workspace subdomain label");
    }
  }

  return subdomain;
}

async function requestFellowJson(input: {
  context: FellowActionContext;
  method: "GET" | "POST";
  path: string;
  body?: unknown;
}): Promise<Record<string, unknown>> {
  const url = new URL(input.path, `${input.context.baseUrl}/`);
  let response: Response;
  let payload: Record<string, unknown>;
  try {
    response = await input.context.fetcher(url, {
      method: input.method,
      headers: {
        accept: "application/json",
        "x-api-key": input.context.apiKey,
        ...(input.body === undefined ? {} : { "content-type": "application/json" }),
        "user-agent": providerUserAgent,
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: input.context.signal,
    });
    payload = await readFellowPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Fellow request failed: ${error.message}` : "Fellow request failed",
      error,
    );
  }

  if (!response.ok) {
    throw createFellowError(response, payload, input.context.phase);
  }

  return payload;
}

async function readFellowPayload(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text.trim()) {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, "Fellow returned invalid JSON");
    }
    return { message: text };
  }

  const record = optionalRecord(parsed);
  if (!record) {
    if (response.ok) {
      throw new ProviderRequestError(502, "Fellow returned a non-object JSON payload", parsed);
    }
    return { message: text };
  }
  return record;
}

function createFellowError(
  response: Response,
  payload: Record<string, unknown>,
  phase: FellowPhase,
): ProviderRequestError {
  const message = readFellowErrorMessage(payload) ?? `Fellow request failed with ${response.status}`;

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (response.status === 400) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 401) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 403, message, payload);
  }
  if (response.status === 404) {
    return new ProviderRequestError(404, message, payload);
  }
  if (response.status >= 500) {
    return new ProviderRequestError(502, message, payload);
  }
  return new ProviderRequestError(response.status >= 400 ? response.status : 500, message, payload);
}

function readFellowErrorMessage(payload: Record<string, unknown>): string | undefined {
  const direct =
    optionalString(payload.detail) ??
    optionalString(payload.message) ??
    optionalString(payload.error) ??
    optionalString(payload.code);
  if (direct) {
    return direct;
  }

  const error = optionalRecord(payload.error);
  if (!error) {
    return undefined;
  }

  return (
    optionalString(error.detail) ??
    optionalString(error.message) ??
    optionalString(error.title) ??
    optionalString(error.code)
  );
}

function readRecordField(payload: unknown, key: string, context: string): Record<string, unknown> {
  const record = optionalRecord(payload);
  const child = record ? optionalRecord(record[key]) : undefined;
  if (!child) {
    throw new ProviderRequestError(502, `${context} is invalid`, payload);
  }
  return child;
}

function requiredInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}
