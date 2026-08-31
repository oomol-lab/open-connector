import type { CredentialValidationResult, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  providerInputError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const pipedreamApiBaseUrl = "https://api.pipedream.com/v1";

type PipedreamActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;
type PipedreamQueryValue = string | number | undefined;

export const pipedreamActionHandlers: ProviderActionHandlers<"pipedream", PipedreamActionHandler> = {
  async get_current_user(_input, context) {
    return { user: normalizeUser(await pipedreamGet("/users/me", {}, context, "execute")) };
  },
  async list_apps(input, context) {
    const payload = await pipedreamGet(
      "/apps",
      {
        q: optionalString(input.q),
        has_components: booleanFlag(input.hasComponents),
        has_actions: booleanFlag(input.hasActions),
        has_triggers: booleanFlag(input.hasTriggers),
        limit: optionalNumber(input.limit),
        after: optionalString(input.after),
        before: optionalString(input.before),
      },
      context,
      "execute",
    );
    const page = requiredRecord(payload, "Pipedream apps page");
    return {
      apps: objectArray(page.data).map(normalizeApp),
      pageInfo: normalizePageInfo(page.page_info),
    };
  },
  async get_app(input, context) {
    return {
      app: normalizeApp(
        unwrapData(
          await pipedreamGet(
            `/apps/${encodeURIComponent(requiredString(input.appId, "appId", providerInputError))}`,
            {},
            context,
            "execute",
          ),
        ),
      ),
    };
  },
  async get_workflow(input, context) {
    const workflowId = requiredString(input.workflowId, "workflowId", providerInputError);
    return {
      workflow: normalizeWorkflow(
        unwrapData(
          await pipedreamGet(
            `/workflows/${encodeURIComponent(workflowId)}`,
            { org_id: optionalString(input.orgId) },
            context,
            "execute",
          ),
        ),
        workflowId,
      ),
    };
  },
  async get_workflow_emits(input, context) {
    const payload = await pipedreamGet(
      `/workflows/${encodeURIComponent(requiredString(input.workflowId, "workflowId", providerInputError))}/event_summaries`,
      {
        expand: input.expandEvent === true ? "event" : undefined,
        limit: optionalNumber(input.limit),
        after: optionalString(input.after),
        before: optionalString(input.before),
      },
      context,
      "execute",
    );
    const page = requiredRecord(payload, "Pipedream workflow emits page");
    return {
      emits: objectArray(page.data).map(normalizeWorkflowEmit),
      pageInfo: normalizePageInfo(page.page_info),
    };
  },
  async get_workspace(input, context) {
    return {
      workspace: normalizeWorkspace(
        unwrapData(
          await pipedreamGet(
            `/workspaces/${encodeURIComponent(requiredString(input.workspaceId, "workspaceId", providerInputError))}`,
            {},
            context,
            "execute",
          ),
        ),
      ),
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors("pipedream", pipedreamActionHandlers);

export async function validatePipedreamCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(401, message));
  const user = normalizeUser(await pipedreamGet("/users/me", {}, { apiKey, fetcher }, "validate"));
  return {
    profile: {
      accountId: user.id,
      displayName: user.email ?? user.username ?? user.id,
      grantedScopes: [],
    },
    metadata: compactObject({
      validationEndpoint: "/users/me",
      apiBaseUrl: pipedreamApiBaseUrl,
      username: user.username,
      email: user.email,
      workspaceCount: user.workspaces.length,
    }),
  };
}

async function pipedreamGet(
  path: string,
  query: Record<string, PipedreamQueryValue>,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: "validate" | "execute",
) {
  const url = new URL(path, pipedreamApiBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  try {
    response = await context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${context.apiKey}`,
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Pipedream request failed: ${error.message}` : "Pipedream request failed",
    );
  }

  const payload = await readPipedreamPayload(response);
  if (!response.ok) {
    throw createPipedreamError(response, payload, phase);
  }
  return payload;
}

async function readPipedreamPayload(response: Response) {
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

function createPipedreamError(response: Response, payload: unknown, phase: "validate" | "execute") {
  const message = extractPipedreamErrorMessage(payload) ?? "Pipedream request failed";
  if (response.status === 429) return new ProviderRequestError(429, message, payload);
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && response.status === 401) return new ProviderRequestError(401, message, payload);
  if (response.status === 404) return new ProviderRequestError(400, message, payload);
  return new ProviderRequestError(response.status >= 500 ? 502 : response.status || 500, message, payload);
}

function extractPipedreamErrorMessage(payload: unknown) {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }
  const record = optionalRecord(payload);
  return optionalString(record?.message) ?? optionalString(record?.error);
}

function unwrapData(payload: unknown) {
  const record = requiredRecord(payload, "Pipedream response");
  return "data" in record ? record.data : payload;
}

function normalizeUser(payload: unknown) {
  const user = requiredRecord(unwrapData(payload), "Pipedream user");
  return {
    id: requiredString(user.id, "user.id", pipedreamResponseError),
    username: optionalString(user.username) ?? null,
    email: optionalString(user.email) ?? null,
    workspaces: Array.isArray(user.orgs) ? objectArray(user.orgs).map(normalizeWorkspace) : [],
    raw: user,
  };
}

function normalizeWorkspace(payload: unknown) {
  const workspace = requiredRecord(payload, "Pipedream workspace");
  return {
    id: requiredString(workspace.id, "workspace.id", pipedreamResponseError),
    name: optionalString(workspace.name) ?? null,
    orgname: optionalString(workspace.orgname) ?? null,
    email: optionalString(workspace.email) ?? null,
    dailyCreditsQuota: optionalNumber(workspace.daily_credits_quota) ?? null,
    dailyCreditsUsed: optionalNumber(workspace.daily_credits_used) ?? null,
    raw: workspace,
  };
}

function normalizeApp(payload: unknown) {
  const app = requiredRecord(payload, "Pipedream app");
  return {
    id: requiredString(app.id, "app.id", pipedreamResponseError),
    nameSlug: optionalString(app.name_slug) ?? null,
    name: optionalString(app.name) ?? null,
    authType: optionalString(app.auth_type) ?? null,
    description: optionalString(app.description) ?? null,
    imageUrl: optionalString(app.img_src) ?? null,
    categories: Array.isArray(app.categories)
      ? app.categories.filter((category): category is string => typeof category === "string")
      : [],
    raw: app,
  };
}

function normalizeWorkflow(payload: unknown, fallbackId?: string) {
  const workflow = requiredRecord(payload, "Pipedream workflow");
  return {
    id: optionalString(workflow.id) ?? fallbackId ?? requiredString(workflow.id, "workflow.id", pipedreamResponseError),
    name: optionalString(workflow.name) ?? null,
    active: typeof workflow.active === "boolean" ? workflow.active : null,
    raw: workflow,
  };
}

function normalizeWorkflowEmit(payload: unknown) {
  const emit = requiredRecord(payload, "Pipedream workflow emit");
  return {
    id: requiredString(emit.id, "emit.id", pipedreamResponseError),
    indexedAtMs: optionalNumber(emit.indexed_at_ms) ?? null,
    event: emit.event ?? null,
    metadata: optionalRecord(emit.metadata) ?? {},
    raw: emit,
  };
}

function normalizePageInfo(payload: unknown) {
  const pageInfo = optionalRecord(payload) ?? {};
  return {
    totalCount: optionalNumber(pageInfo.total_count) ?? null,
    count: optionalNumber(pageInfo.count) ?? null,
    startCursor: optionalString(pageInfo.start_cursor) ?? null,
    endCursor: optionalString(pageInfo.end_cursor) ?? null,
    raw: pageInfo,
  };
}

function objectArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => requiredRecord(item, "Pipedream array item")) : [];
}

function booleanFlag(value: unknown) {
  return value === true ? 1 : undefined;
}

function pipedreamResponseError(message: string) {
  return new ProviderRequestError(502, `Pipedream response missing string field: ${message}`);
}
