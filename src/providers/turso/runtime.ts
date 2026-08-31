import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
  requiredInputString,
} from "../provider-runtime.ts";

const tursoApiBaseUrl = "https://api.turso.tech";

type TursoPhase = "validate" | "execute";
type TursoMethod = "GET" | "POST" | "DELETE";
type TursoActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface TursoRequestInput {
  path: string;
  method: TursoMethod;
  phase: TursoPhase;
  body?: Record<string, unknown>;
}

export const tursoActionHandlers: ProviderActionHandlers<"turso", TursoActionHandler> = {
  async list_organizations(_input, context) {
    const payload = await requestTursoJson({ path: "/v1/organizations", method: "GET", phase: "execute" }, context);
    return { organizations: extractResourceList(payload, ["organizations"]) };
  },
  async get_organization(input, context) {
    const organizationSlug = requiredInputString(input.organizationSlug, "organizationSlug");
    const payload = await requestTursoJson(
      { path: `/v1/organizations/${encodeURIComponent(organizationSlug)}`, method: "GET", phase: "execute" },
      context,
    );
    return { organization: extractSingleResource(payload, ["organization"]) };
  },
  async list_locations(_input, context) {
    const payload = await requestTursoJson({ path: "/v1/locations", method: "GET", phase: "execute" }, context);
    return { locations: extractResourceList(payload, ["locations", "regions"]) };
  },
  async list_groups(input, context) {
    const organizationSlug = requiredInputString(input.organizationSlug, "organizationSlug");
    const payload = await requestTursoJson(
      {
        path: `/v1/organizations/${encodeURIComponent(organizationSlug)}/groups`,
        method: "GET",
        phase: "execute",
      },
      context,
    );
    return { groups: extractResourceList(payload, ["groups"]) };
  },
  async get_group(input, context) {
    const organizationSlug = requiredInputString(input.organizationSlug, "organizationSlug");
    const groupName = requiredInputString(input.name, "name");
    const payload = await requestTursoJson(
      {
        path: `/v1/organizations/${encodeURIComponent(organizationSlug)}/groups/${encodeURIComponent(groupName)}`,
        method: "GET",
        phase: "execute",
      },
      context,
    );
    return { group: extractSingleResource(payload, ["group"]) };
  },
  async create_group(input, context) {
    const organizationSlug = requiredInputString(input.organizationSlug, "organizationSlug");
    const payload = await requestTursoJson(
      {
        path: `/v1/organizations/${encodeURIComponent(organizationSlug)}/groups`,
        method: "POST",
        phase: "execute",
        body: compactObject({
          name: requiredInputString(input.name, "name"),
          location: requiredInputString(input.location, "location"),
          extensions: normalizeExtensions(input.extensions),
        }),
      },
      context,
    );
    return { group: extractSingleResource(payload, ["group"]) };
  },
  async list_databases(input, context) {
    const organizationSlug = requiredInputString(input.organizationSlug, "organizationSlug");
    const payload = await requestTursoJson(
      {
        path: `/v1/organizations/${encodeURIComponent(organizationSlug)}/databases`,
        method: "GET",
        phase: "execute",
      },
      context,
    );
    return { databases: extractResourceList(payload, ["databases"]) };
  },
  async get_database(input, context) {
    const organizationSlug = requiredInputString(input.organizationSlug, "organizationSlug");
    const databaseName = requiredInputString(input.name, "name");
    const payload = await requestTursoJson(
      {
        path: `/v1/organizations/${encodeURIComponent(organizationSlug)}/databases/${encodeURIComponent(databaseName)}`,
        method: "GET",
        phase: "execute",
      },
      context,
    );
    return { database: extractSingleResource(payload, ["database"]) };
  },
  async create_database(input, context) {
    const organizationSlug = requiredInputString(input.organizationSlug, "organizationSlug");
    const payload = await requestTursoJson(
      {
        path: `/v1/organizations/${encodeURIComponent(organizationSlug)}/databases`,
        method: "POST",
        phase: "execute",
        body: {
          name: requiredInputString(input.name, "name"),
          group: requiredInputString(input.group, "group"),
        },
      },
      context,
    );
    return { database: extractSingleResource(payload, ["database"]) };
  },
  async delete_database(input, context) {
    const organizationSlug = requiredInputString(input.organizationSlug, "organizationSlug");
    const databaseName = requiredInputString(input.name, "name");
    await requestTursoJson(
      {
        path: `/v1/organizations/${encodeURIComponent(organizationSlug)}/databases/${encodeURIComponent(databaseName)}`,
        method: "DELETE",
        phase: "execute",
      },
      context,
    );
    return { deleted: true };
  },
};

export async function validateTursoCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestTursoJson(
    { path: "/v1/auth/validate", method: "GET", phase: "validate" },
    { apiKey, fetcher, signal },
  );
  return {
    profile: {
      accountId: "turso-api-token",
      displayName: "Turso API Token",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: tursoApiBaseUrl,
      validationEndpoint: "/v1/auth/validate",
      expiresAt: normalizeExpiration(extractExpiration(payload)),
    }),
  };
}

async function requestTursoJson(
  input: TursoRequestInput,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
): Promise<unknown> {
  const timeout = createProviderTimeout(context.signal);
  try {
    const response = await context.fetcher(new URL(input.path, tursoApiBaseUrl), {
      method: input.method,
      headers: compactObject({
        authorization: `Bearer ${context.apiKey}`,
        accept: "application/json",
        "content-type": input.body ? "application/json" : undefined,
        "user-agent": providerUserAgent,
      }) as Record<string, string>,
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: timeout.signal,
    });
    const payload = await readTursoPayload(response);
    if (!response.ok) {
      throw createTursoError(response.status, payload, input.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    throw new ProviderRequestError(
      timeout.didTimeout() || isAbortLikeError(error) ? 504 : 502,
      error instanceof Error ? `Turso request failed: ${error.message}` : "Turso request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

async function readTursoPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function createTursoError(status: number, payload: unknown, phase: TursoPhase): ProviderRequestError {
  const message = extractErrorMessage(payload) ?? `Turso request failed with ${status}`;
  if (status === 429) return new ProviderRequestError(429, message, payload);
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : status, message, payload);
  }
  if ([400, 404, 409, 422].includes(status)) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status || 502, message, payload);
}

function normalizeExtensions(value: unknown): string | string[] | undefined {
  if (value === undefined) return undefined;
  if (value === "all") return "all";
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, "extensions must be 'all' or an array");
  }
  return value.map((item) => requiredInputString(item, "extensions"));
}

function extractResourceList(payload: unknown, keys: string[]): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) {
    return payload.flatMap((item) => {
      const record = optionalRecord(item);
      return record ? [normalizeResource(record)] : [];
    });
  }
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "Turso returned an invalid list response");
  }
  for (const key of [...keys, "data"]) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value.flatMap((item) => {
        const child = optionalRecord(item);
        return child ? [normalizeResource(child)] : [];
      });
    }
  }
  throw new ProviderRequestError(502, "Turso list response is missing items");
}

function extractSingleResource(payload: unknown, keys: string[]): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "Turso returned an invalid resource response");
  }
  for (const key of [...keys, "data"]) {
    const value = optionalRecord(record[key]);
    if (value) return normalizeResource(value);
  }
  return normalizeResource(record);
}

function normalizeResource(raw: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    slug: optionalString(raw.slug),
    name: optionalString(raw.name),
    type: optionalString(raw.type),
    location: optionalString(raw.location),
    uuid: optionalString(raw.uuid),
    group: optionalString(raw.group),
    hostname: optionalString(raw.hostname),
    code: optionalString(raw.code),
    raw,
  });
}

function extractExpiration(payload: unknown): number | undefined {
  const record = optionalRecord(payload);
  return (
    optionalNumber(record?.exp) ??
    optionalNumber(optionalRecord(record?.auth)?.exp) ??
    optionalNumber(optionalRecord(record?.token)?.exp)
  );
}

function normalizeExpiration(value: number | undefined): string | undefined {
  return value == null || value < 0 ? undefined : new Date(value * 1_000).toISOString();
}

function extractErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) return payload;
  const record = optionalRecord(payload);
  if (!record) return undefined;
  const nestedError = optionalRecord(record.error);
  return (
    optionalString(record.message) ??
    optionalString(record.error) ??
    optionalString(record.detail) ??
    optionalString(record.title) ??
    optionalString(nestedError?.message) ??
    optionalString(nestedError?.detail)
  );
}
