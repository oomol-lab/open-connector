import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderFetch } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "lattice";
const latticeUsApiBaseUrl = "https://api.latticehq.com";
const latticeEmeaApiBaseUrl = "https://api.emea.latticehq.com";
const latticeValidationPath = "/v1/me";

type LatticeDataResidency = "us" | "emea";
type LatticeListKey = "users" | "departments" | "tags" | "goals";

interface LatticeActionContext {
  apiKey: string;
  apiBaseUrl: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

interface LatticeRequestOptions {
  method: "GET";
  path: string;
  context: LatticeActionContext;
  phase: "validate" | "execute";
  query?: Record<string, unknown>;
}

type LatticeActionHandler = (input: Record<string, unknown>, context: LatticeActionContext) => Promise<unknown>;

export const latticeActionHandlers: ProviderActionHandlers<"lattice", LatticeActionHandler> = {
  get_current_user(_input, context) {
    return getSingleLatticeResource("user", latticeValidationPath, context);
  },
  list_users(input, context) {
    return listLatticeResource("users", "/v1/users", input, context, {
      status: normalizeLatticeStatus(input.status),
    });
  },
  get_user(input, context) {
    return getSingleLatticeResource(
      "user",
      `/v1/user/${encodeURIComponent(readInputString(input.userId, "userId"))}`,
      context,
    );
  },
  list_departments(input, context) {
    return listLatticeResource("departments", "/v1/departments", input, context);
  },
  get_department(input, context) {
    return getSingleLatticeResource(
      "department",
      `/v1/department/${encodeURIComponent(readInputString(input.departmentId, "departmentId"))}`,
      context,
    );
  },
  list_tags(input, context) {
    return listLatticeResource("tags", "/v1/tags", input, context);
  },
  list_goals(input, context) {
    return listLatticeResource("goals", "/v1/goals", input, context, {
      state: optionalString(input.state),
    });
  },
  get_goal(input, context) {
    return getSingleLatticeResource(
      "goal",
      `/v1/goal/${encodeURIComponent(readInputString(input.goalId, "goalId"))}`,
      context,
    );
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<LatticeActionContext>({
  service,
  handlers: latticeActionHandlers,
  async createContext(context: ExecutionContext, fetcher: ProviderFetch): Promise<LatticeActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      apiBaseUrl: resolveLatticeApiBaseUrl(credential.metadata, credential.values.dataResidency),
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const dataResidency = normalizeLatticeDataResidency(input.values.dataResidency);
    const apiBaseUrl = buildLatticeApiBaseUrl(dataResidency);
    const context: LatticeActionContext = {
      apiKey: input.apiKey,
      apiBaseUrl,
      fetcher,
      signal,
    };
    const user = readObject(
      await latticeRequest({
        method: "GET",
        path: latticeValidationPath,
        context,
        phase: "validate",
      }),
      "lattice validation response",
    );
    const userId = optionalString(user.id);
    const email = optionalString(user.email);
    const name = optionalString(user.name) ?? optionalString(user.preferredName);

    return {
      profile: {
        accountId: userId ? `lattice:${dataResidency}:${userId}` : `lattice:${dataResidency}:api_key`,
        displayName: name ?? email ?? `Lattice ${dataResidency.toUpperCase()} API Key`,
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl,
        dataResidency,
        validationEndpoint: latticeValidationPath,
        userId,
        email,
        name,
      }),
    };
  },
};

async function listLatticeResource(
  outputKey: LatticeListKey,
  path: string,
  input: Record<string, unknown>,
  context: LatticeActionContext,
  extraQuery: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const payload = await latticeRequest({
    method: "GET",
    path,
    context,
    phase: "execute",
    query: {
      limit: input.limit,
      startingAfter: input.startingAfter,
      ...extraQuery,
    },
  });
  const list = readObject(payload, `lattice ${outputKey} list response`);
  const data = Array.isArray(list.data) ? list.data : [];

  return {
    [outputKey]: data,
    meta: {
      hasMore: list.hasMore === true,
      endingCursor: typeof list.endingCursor === "string" ? list.endingCursor : null,
    },
    raw: list,
  };
}

async function getSingleLatticeResource(
  outputKey: "user" | "department" | "goal",
  path: string,
  context: LatticeActionContext,
): Promise<Record<string, unknown>> {
  const resource = readObject(
    await latticeRequest({
      method: "GET",
      path,
      context,
      phase: "execute",
    }),
    `lattice ${outputKey} response`,
  );

  return {
    [outputKey]: resource,
    raw: resource,
  };
}

async function latticeRequest(input: LatticeRequestOptions): Promise<unknown> {
  let response: Response;
  try {
    response = await input.context.fetcher(buildLatticeUrl(input.context.apiBaseUrl, input.path, input.query), {
      method: input.method,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.context.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal: input.context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Lattice API request failed: ${error.message}` : "Lattice API request failed",
    );
  }

  const payload = await readLatticeJson(response);
  if (!response.ok) {
    throw mapLatticeError(response.status, payload, input.phase);
  }

  return payload;
}

function buildLatticeUrl(baseUrl: string, path: string, query: Record<string, unknown> = {}): string {
  const url = new URL(path, `${baseUrl}/`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function readLatticeJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Lattice API returned invalid JSON");
  }
}

function mapLatticeError(status: number, payload: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const message = readLatticeErrorMessage(payload) ?? `Lattice API request failed with ${status}`;
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : status, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status || 502, message, payload);
}

function readLatticeErrorMessage(payload: unknown): string | undefined {
  const object = optionalRecord(payload);
  return optionalString(object?.error) ?? optionalString(object?.message);
}

function readObject(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `invalid ${label}`);
  }
  return record;
}

function normalizeLatticeStatus(value: unknown): string | undefined {
  return value === "null_string" ? "null" : optionalString(value);
}

function normalizeLatticeDataResidency(value: unknown): LatticeDataResidency {
  const normalized = optionalString(value)?.toLowerCase();
  if (!normalized || normalized === "us") {
    return "us";
  }
  if (normalized === "emea") {
    return "emea";
  }
  throw new ProviderRequestError(400, "Lattice dataResidency must be us or emea");
}

function buildLatticeApiBaseUrl(dataResidency: LatticeDataResidency): string {
  return dataResidency === "emea" ? latticeEmeaApiBaseUrl : latticeUsApiBaseUrl;
}

function resolveLatticeApiBaseUrl(metadata: Record<string, unknown>, dataResidency: unknown): string {
  const storedBaseUrl = optionalString(metadata.apiBaseUrl);
  if (storedBaseUrl === latticeUsApiBaseUrl || storedBaseUrl === latticeEmeaApiBaseUrl) {
    return storedBaseUrl;
  }

  return buildLatticeApiBaseUrl(normalizeLatticeDataResidency(metadata.dataResidency ?? dataResidency));
}

function readInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}
