import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const service = "anthropic_admin";
const anthropicAdminApiBaseUrl = "https://api.anthropic.com";
const anthropicAdminApiVersion = "2023-06-01";
const anthropicAdminValidationPath = "/v1/organizations/me";

type AnthropicAdminRequestPhase = "validate" | "execute";
type AnthropicAdminActionHandler = (
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
) => Promise<unknown>;

export const anthropicAdminActionHandlers: Record<string, AnthropicAdminActionHandler> = {
  get_organization(_input, context) {
    return anthropicAdminRequest({ path: anthropicAdminValidationPath }, context);
  },
  list_users(input, context) {
    return anthropicAdminRequest(
      { path: buildAnthropicAdminPath("/v1/organizations/users", input) },
      context,
    );
  },
  list_workspaces(input, context) {
    return anthropicAdminRequest(
      { path: buildAnthropicAdminPath("/v1/organizations/workspaces", input) },
      context,
    );
  },
  list_api_keys(input, context) {
    return anthropicAdminRequest(
      { path: buildAnthropicAdminPath("/v1/organizations/api_keys", input) },
      context,
    );
  },
  list_workspace_members(input, context) {
    const workspaceId = requiredString(input.workspace_id, "workspace_id", providerInputError);
    const queryInput = { ...input };
    delete queryInput.workspace_id;
    return anthropicAdminRequest(
      {
        path: buildAnthropicAdminPath(
          `/v1/organizations/workspaces/${encodeURIComponent(workspaceId)}/members`,
          queryInput,
        ),
      },
      context,
    );
  },
  list_invites(input, context) {
    return anthropicAdminRequest(
      { path: buildAnthropicAdminPath("/v1/organizations/invites", input) },
      context,
    );
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, anthropicAdminActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const context = {
      apiKey: input.apiKey,
      fetcher,
      signal,
    };
    const payload = optionalRecord(
      await anthropicAdminRequest(
        { path: anthropicAdminValidationPath, phase: "validate" },
        context,
      ),
    );
    const organizationId = optionalString(payload?.id);
    const organizationName = optionalString(payload?.name);

    return {
      profile: {
        accountId: organizationId ?? "anthropic_admin_api_key",
        displayName: organizationName ?? "Anthropic Admin",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: anthropicAdminApiBaseUrl,
        organizationId: organizationId ?? null,
        organizationName: organizationName ?? null,
        validationEndpoint: anthropicAdminValidationPath,
      },
    };
  },
};

function buildAnthropicAdminPath(path: string, input: Record<string, unknown>) {
  const searchParams = new URLSearchParams();
  for (const key of ["workspace_id", "before_id", "after_id", "limit"]) {
    const value = input[key];
    if (value !== undefined) {
      searchParams.set(key, String(value));
    }
  }

  const query = searchParams.toString();
  return query ? `${path}?${query}` : path;
}

async function anthropicAdminRequest(
  request: {
    path: string;
    phase?: AnthropicAdminRequestPhase;
  },
  context: ApiKeyProviderContext,
) {
  const response = await context.fetcher(`${anthropicAdminApiBaseUrl}${request.path}`, {
    method: "GET",
    headers: anthropicAdminHeaders(context.apiKey),
    signal: context.signal,
  });

  await assertAnthropicAdminResponse(response, request.phase ?? "execute");
  try {
    return await response.json();
  } catch {
    throw new ProviderRequestError(502, "anthropic_admin returned malformed JSON");
  }
}

function anthropicAdminHeaders(apiKey: string) {
  return {
    "anthropic-version": anthropicAdminApiVersion,
    "content-type": "application/json",
    "user-agent": providerUserAgent,
    "x-api-key": apiKey,
  };
}

async function assertAnthropicAdminResponse(response: Response, phase: AnthropicAdminRequestPhase) {
  if (response.ok) {
    return;
  }

  const error = await readAnthropicAdminError(response);

  if (response.status === 429) {
    throw new ProviderRequestError(429, error.message);
  }
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    throw new ProviderRequestError(400, error.message);
  }
  if (phase === "execute" && (response.status === 401 || response.status === 403)) {
    throw new ProviderRequestError(response.status, error.message);
  }
  if (response.status === 400 || response.status === 422) {
    throw new ProviderRequestError(400, error.message);
  }

  throw new ProviderRequestError(response.status || 500, error.message);
}

async function readAnthropicAdminError(response: Response) {
  const raw = await response.text().catch(() => "");
  try {
    const payload = optionalRecord(JSON.parse(raw));
    const nestedError = optionalRecord(payload?.error);

    return {
      type: optionalString(nestedError?.type) ?? optionalString(payload?.type) ?? "error",
      message:
        optionalString(nestedError?.message) ??
        optionalString(payload?.message) ??
        (raw || `anthropic_admin request failed with ${response.status}`),
    };
  } catch {
    return {
      type: "error",
      message: raw || `anthropic_admin request failed with ${response.status}`,
    };
  }
}

function providerInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
