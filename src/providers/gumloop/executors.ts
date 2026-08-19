import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import {
  compactObject,
  objectArray,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import {
  defineProviderExecutors,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "gumloop";
const gumloopApiBaseUrl = "https://api.gumloop.com/api/v1";
const gumloopValidationPath = "/list_saved_items";
const gumloopDefaultRequestTimeoutMs = 30_000;

type GumloopRequestPhase = "validate" | "execute";
type GumloopQueryValue = boolean | number | string | null | undefined;
type GumloopActionHandler = (input: Record<string, unknown>, context: GumloopActionContext) => Promise<unknown>;

interface GumloopActionContext {
  apiKey: string;
  storedUserId?: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface GumloopRequestOptions {
  apiKey: string;
  userId: string;
  path: string;
  fetcher: typeof fetch;
  phase: GumloopRequestPhase;
  signal?: AbortSignal;
  method?: string;
  query?: Record<string, GumloopQueryValue>;
  body?: unknown;
  notFoundAsInvalidInput?: boolean;
}

interface GumloopContext {
  userId: string;
  projectId?: string;
}

export const gumloopActionHandlers: ProviderActionHandlers<"gumloop", GumloopActionHandler> = {
  list_saved_flows(input, context) {
    return listGumloopSavedFlows(input, context);
  },
  list_workbooks(input, context) {
    return listGumloopWorkbooks(input, context);
  },
  get_input_schema(input, context) {
    return getGumloopInputSchema(input, context);
  },
  list_run_history(input, context) {
    return listGumloopRunHistory(input, context);
  },
  start_flow_run(input, context) {
    return startGumloopFlowRun(input, context);
  },
  get_run_details(input, context) {
    return getGumloopRunDetails(input, context);
  },
  kill_flow_run(input, context) {
    return killGumloopFlowRun(input, context);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<GumloopActionContext>({
  service,
  handlers: gumloopActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<GumloopActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      storedUserId: optionalString(credential.values.userId) ?? optionalString(credential.metadata.userId),
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const userId = requiredString(input.values.userId, "userId", providerInputError);
    const payload = await requestGumloopJson({
      apiKey: input.apiKey,
      userId,
      path: gumloopValidationPath,
      query: {
        user_id: userId,
      },
      fetcher,
      signal,
      phase: "validate",
    });
    const savedFlows = readArrayProperty(payload, "saved_items");
    const firstSavedFlow = optionalRecord(savedFlows[0]);

    return {
      profile: {
        accountId: `gumloop:user:${userId}`,
        displayName: `Gumloop ${userId}`,
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: gumloopApiBaseUrl,
        validationEndpoint: gumloopValidationPath,
        userId,
        savedFlowCount: savedFlows.length,
        firstSavedFlowName: optionalString(firstSavedFlow?.name),
      }),
    };
  },
};

async function listGumloopSavedFlows(input: Record<string, unknown>, context: GumloopActionContext): Promise<unknown> {
  const gumloopContext = resolveGumloopContext(input, context);
  const payload = await requestGumloopJson({
    apiKey: context.apiKey,
    userId: gumloopContext.userId,
    path: "/list_saved_items",
    query: buildContextQuery(gumloopContext),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    savedFlows: readArrayProperty(payload, "saved_items"),
    raw: payload,
  };
}

async function listGumloopWorkbooks(input: Record<string, unknown>, context: GumloopActionContext): Promise<unknown> {
  const gumloopContext = resolveGumloopContext(input, context);
  const payload = await requestGumloopJson({
    apiKey: context.apiKey,
    userId: gumloopContext.userId,
    path: "/list_workbooks",
    query: buildContextQuery(gumloopContext),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    workbooks: readArrayProperty(payload, "workbooks"),
    raw: payload,
  };
}

async function getGumloopInputSchema(input: Record<string, unknown>, context: GumloopActionContext): Promise<unknown> {
  const gumloopContext = resolveGumloopContext(input, context);
  const payload = await requestGumloopJson({
    apiKey: context.apiKey,
    userId: gumloopContext.userId,
    path: "/get_inputs",
    query: {
      saved_item_id: requiredString(input.savedItemId, "savedItemId", providerInputError),
      ...buildContextQuery(gumloopContext),
    },
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });

  return {
    inputs: readArrayProperty(payload, "inputs"),
    raw: payload,
  };
}

async function listGumloopRunHistory(input: Record<string, unknown>, context: GumloopActionContext): Promise<unknown> {
  const gumloopContext = resolveGumloopContext(input, context);
  if (!optionalString(input.workbookId) && !optionalString(input.savedItemId)) {
    throw new ProviderRequestError(400, "Either workbookId or savedItemId is required.");
  }
  const payload = await requestGumloopJson({
    apiKey: context.apiKey,
    userId: gumloopContext.userId,
    path: "/get_plrun_saved_item_map",
    query: {
      workbook_id: optionalString(input.workbookId),
      saved_item_id: optionalString(input.savedItemId),
      ...buildContextQuery(gumloopContext),
    },
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });

  return {
    runHistory: payload,
    raw: payload,
  };
}

async function startGumloopFlowRun(input: Record<string, unknown>, context: GumloopActionContext): Promise<unknown> {
  const gumloopContext = resolveGumloopContext(input, context);
  const payload = await requestGumloopJson({
    apiKey: context.apiKey,
    userId: gumloopContext.userId,
    path: "/start_pipeline",
    method: "POST",
    body: {
      ...readJsonInputValues(input.inputs),
      ...buildStartFlowRunContextBody(gumloopContext),
      saved_item_id: requiredString(input.savedItemId, "savedItemId", providerInputError),
    },
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return normalizeStartFlowRunOutput(payload);
}

async function getGumloopRunDetails(input: Record<string, unknown>, context: GumloopActionContext): Promise<unknown> {
  const gumloopContext = resolveGumloopContext(input, context);
  const payload = await requestGumloopJson({
    apiKey: context.apiKey,
    userId: gumloopContext.userId,
    path: "/get_pl_run",
    query: {
      run_id: requiredString(input.runId, "runId", providerInputError),
      ...buildContextQuery(gumloopContext),
    },
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });

  return normalizeRunDetailsOutput(payload);
}

async function killGumloopFlowRun(input: Record<string, unknown>, context: GumloopActionContext): Promise<unknown> {
  const gumloopContext = resolveGumloopContext(input, context);
  const payload = await requestGumloopJson({
    apiKey: context.apiKey,
    userId: gumloopContext.userId,
    path: "/kill_pipeline",
    method: "POST",
    body: {
      run_id: requiredString(input.runId, "runId", providerInputError),
      ...buildContextBody(gumloopContext),
    },
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  const runId = optionalString(payload.run_id);
  if (!runId) {
    throw new ProviderRequestError(502, "Gumloop kill response did not include run_id");
  }

  return {
    success: typeof payload.success === "boolean" ? payload.success : false,
    runId,
    raw: payload,
  };
}

async function requestGumloopJson(options: GumloopRequestOptions): Promise<Record<string, unknown>> {
  const hasJsonBody = options.body !== undefined;
  const timeoutSignal = AbortSignal.timeout(gumloopDefaultRequestTimeoutMs);
  const signal = options.signal ? AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal;

  try {
    const response = await options.fetcher(buildGumloopUrl(options.path, options.query), {
      method: options.method ?? "GET",
      headers: buildGumloopHeaders(options.apiKey, options.userId, hasJsonBody),
      body: hasJsonBody ? JSON.stringify(options.body) : undefined,
      signal,
    });
    const payload = await readGumloopPayload(response);

    if (!response.ok) {
      throw createGumloopError(response, payload, options.phase, options.notFoundAsInvalidInput);
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new ProviderRequestError(502, "Gumloop response body must be an object");
    }

    return payload as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Gumloop request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Gumloop request failed: ${error.message}` : "Gumloop request failed",
    );
  }
}

function buildGumloopUrl(path: string, query: Record<string, GumloopQueryValue> = {}): URL {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${gumloopApiBaseUrl}${normalizedPath}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

function buildGumloopHeaders(apiKey: string, userId: string, hasJsonBody: boolean): Record<string, string> {
  return compactObject({
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "x-auth-key": userId,
    "user-agent": providerUserAgent,
    "content-type": hasJsonBody ? "application/json" : undefined,
  }) as Record<string, string>;
}

async function readGumloopPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Gumloop returned invalid JSON");
  }
}

function createGumloopError(
  response: Response,
  payload: unknown,
  phase: GumloopRequestPhase,
  notFoundAsInvalidInput = false,
): ProviderRequestError {
  const message = extractGumloopErrorMessage(payload) ?? `Gumloop request failed with status ${response.status}`;
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (
    response.status === 400 ||
    response.status === 401 ||
    response.status === 403 ||
    (response.status === 404 && (notFoundAsInvalidInput || phase === "validate"))
  ) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(response.status || 502, message, payload);
}

function extractGumloopErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return optionalString(payload);
  }
  return optionalString(record.detail) ?? optionalString(record.message) ?? optionalString(record.error);
}

function resolveGumloopContext(input: Record<string, unknown>, context: GumloopActionContext): GumloopContext {
  const inputUserId = optionalString(input.userId);
  const userId = inputUserId || context.storedUserId;
  const projectId = optionalString(input.projectId);

  if (!userId && !projectId) {
    throw new ProviderRequestError(
      400,
      "gumloop action requires userId or projectId; connect with a userId or pass projectId in input",
    );
  }
  if (projectId) {
    return {
      userId: userId || projectId,
      projectId,
    };
  }
  return {
    userId: userId!,
  };
}

function buildContextQuery(context: GumloopContext): Record<string, string> {
  return context.projectId ? { project_id: context.projectId } : { user_id: context.userId };
}

function buildContextBody(context: GumloopContext): Record<string, string> {
  return context.projectId ? { project_id: context.projectId } : { user_id: context.userId };
}

function buildStartFlowRunContextBody(context: GumloopContext): Record<string, string> {
  return compactObject({
    user_id: context.userId,
    project_id: context.projectId,
  }) as Record<string, string>;
}

function readArrayProperty(payload: Record<string, unknown>, fieldName: string): Array<Record<string, unknown>> {
  return objectArray(payload[fieldName], fieldName, providerOutputError);
}

function readJsonInputValues(value: unknown): Record<string, unknown> {
  if (value === undefined) {
    return {};
  }
  return requiredRecord(value, "inputs", providerInputError);
}

function normalizeStartFlowRunOutput(payload: Record<string, unknown>): Record<string, unknown> {
  const runId = optionalString(payload.run_id);
  if (!runId) {
    throw new ProviderRequestError(502, "Gumloop start response did not include run_id");
  }

  return {
    runId,
    savedItemId: optionalString(payload.saved_item_id) ?? "",
    workbookId: optionalString(payload.workbook_id) ?? "",
    url: optionalString(payload.url) ?? "",
    raw: payload,
  };
}

function normalizeRunDetailsOutput(payload: Record<string, unknown>): Record<string, unknown> {
  const state = optionalString(payload.state);
  if (!state) {
    throw new ProviderRequestError(502, "Gumloop run response did not include state");
  }

  return compactObject({
    userId: optionalString(payload.user_id),
    state,
    outputs: optionalRecord(payload.outputs),
    createdTs: optionalString(payload.created_ts),
    finishedTs: optionalString(payload.finished_ts),
    log: Array.isArray(payload.log) ? payload.log.map((item) => String(item)) : undefined,
    raw: payload,
  });
}

function providerInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function providerOutputError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, message);
}

function isAbortLikeError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
