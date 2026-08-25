import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

export const xataApiBaseUrl = "https://api.xata.tech";
const xataValidationPath = "/organizations";
const xataTimeoutMs = 30_000;

export interface XataContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type XataPhase = "validate" | "execute";
type XataActionHandler = ProviderRuntimeHandler<XataContext>;

export const xataActionHandlers: ProviderActionHandlers<"xata", XataActionHandler> = {
  async list_organizations(_input, context) {
    return {
      organizations: readArrayField(
        await requestXataJson(context, "/organizations", "execute"),
        "organizations",
        "Xata organizations response",
      ).map(normalizeOrganization),
    };
  },
  async get_organization(input, context) {
    const organizationID = readRequiredInputString(input.organizationID, "organizationID");
    return {
      organization: normalizeOrganization(
        await requestXataJson(context, `/organizations/${encodeURIComponent(organizationID)}`, "execute"),
      ),
    };
  },
  async list_projects(input, context) {
    const organizationID = readRequiredInputString(input.organizationID, "organizationID");
    return {
      projects: readArrayField(
        await requestXataJson(context, `/organizations/${encodeURIComponent(organizationID)}/projects`, "execute"),
        "projects",
        "Xata projects response",
      ).map(normalizeProject),
    };
  },
  async get_project(input, context) {
    const organizationID = readRequiredInputString(input.organizationID, "organizationID");
    const projectID = readRequiredInputString(input.projectID, "projectID");
    return {
      project: normalizeProject(
        await requestXataJson(
          context,
          `/organizations/${encodeURIComponent(organizationID)}/projects/${encodeURIComponent(projectID)}`,
          "execute",
        ),
      ),
    };
  },
  async list_branches(input, context) {
    const organizationID = readRequiredInputString(input.organizationID, "organizationID");
    const projectID = readRequiredInputString(input.projectID, "projectID");
    return {
      branches: readArrayField(
        await requestXataJson(
          context,
          `/organizations/${encodeURIComponent(organizationID)}/projects/${encodeURIComponent(projectID)}/branches`,
          "execute",
        ),
        "branches",
        "Xata branches response",
      ).map(normalizeBranchListItem),
    };
  },
  async get_branch(input, context) {
    const organizationID = readRequiredInputString(input.organizationID, "organizationID");
    const projectID = readRequiredInputString(input.projectID, "projectID");
    const branchID = readRequiredInputString(input.branchID, "branchID");
    return {
      branch: normalizeBranch(
        await requestXataJson(
          context,
          `/organizations/${encodeURIComponent(organizationID)}/projects/${encodeURIComponent(projectID)}/branches/${encodeURIComponent(branchID)}`,
          "execute",
        ),
      ),
    };
  },
  async list_available_regions(input, context) {
    const organizationID = readRequiredInputString(input.organizationID, "organizationID");
    return {
      regions: readArrayField(
        await requestXataJson(context, `/organizations/${encodeURIComponent(organizationID)}/regions`, "execute"),
        "regions",
        "Xata regions response",
      ).map(normalizeRegion),
    };
  },
};

export async function validateXataCredential(
  apiKeyInput: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const apiKey = readRequiredInputString(apiKeyInput, "apiKey");
  const context = { apiKey, fetcher, signal };
  const organizations = readArrayField(
    await requestXataJson(context, xataValidationPath, "validate"),
    "organizations",
    "Xata organizations response",
  );
  const firstOrganization = optionalRecord(organizations[0]);
  const firstOrganizationName = optionalString(firstOrganization?.name);
  const firstOrganizationID = optionalString(firstOrganization?.id);

  return {
    profile: {
      accountId: firstOrganizationID ?? "xata:api_key",
      displayName: firstOrganizationName ?? "Xata API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: xataApiBaseUrl,
      validationEndpoint: xataValidationPath,
      organizationCount: organizations.length,
      firstOrganizationID,
    }),
  };
}

async function requestXataJson(context: XataContext, path: string, phase: XataPhase): Promise<unknown> {
  const timeout = createProviderTimeout(context.signal, xataTimeoutMs);
  let response: Response;
  try {
    response = await context.fetcher(new URL(path, xataApiBaseUrl), {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${context.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
  } catch (error) {
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Xata request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Xata request failed: ${error.message}` : "Xata request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }

  const payload = await readXataPayload(response);
  if (!response.ok) {
    throw createXataError(response.status, payload, phase);
  }
  return payload;
}

async function readXataPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function createXataError(status: number, payload: unknown, phase: XataPhase): ProviderRequestError {
  const message = optionalString(optionalRecord(payload)?.message) ?? `Xata request failed with status ${status}`;
  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(401, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if ([400, 404, 422].includes(status)) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status || 502, message, payload);
}

function normalizeOrganization(value: unknown): Record<string, unknown> {
  const raw = readObject(value);
  return {
    id: readRequiredOutputString(raw.id, "organization.id"),
    name: readRequiredOutputString(raw.name, "organization.name"),
    status: readRequiredOutputObject(raw.status, "organization.status"),
    marketplace: optionalString(raw.marketplace) ?? null,
    raw,
  };
}

function normalizeProject(value: unknown): Record<string, unknown> {
  const raw = readObject(value);
  return {
    id: readRequiredOutputString(raw.id, "project.id"),
    name: readRequiredOutputString(raw.name, "project.name"),
    createdAt: readRequiredOutputString(raw.createdAt, "project.createdAt"),
    updatedAt: readRequiredOutputString(raw.updatedAt, "project.updatedAt"),
    configuration: readRequiredOutputObject(raw.configuration, "project.configuration"),
    raw,
  };
}

function normalizeBranchListItem(value: unknown): Record<string, unknown> {
  const raw = readObject(value);
  return {
    id: readRequiredOutputString(raw.id, "branch.id"),
    name: readRequiredOutputString(raw.name, "branch.name"),
    createdAt: readRequiredOutputString(raw.createdAt, "branch.createdAt"),
    updatedAt: readRequiredOutputString(raw.updatedAt, "branch.updatedAt"),
    region: readRequiredOutputString(raw.region, "branch.region"),
    publicAccess: readRequiredOutputBoolean(raw.publicAccess, "branch.publicAccess"),
    backupsEnabled: readRequiredOutputBoolean(raw.backupsEnabled, "branch.backupsEnabled"),
    description: optionalString(raw.description) ?? null,
    parentID: optionalString(raw.parentID) ?? null,
    raw,
  };
}

function normalizeBranch(value: unknown): Record<string, unknown> {
  const raw = readObject(value);
  return {
    ...normalizeBranchListItem(raw),
    connectionString:
      raw.connectionString === null ? null : readRequiredOutputString(raw.connectionString, "branch.connectionString"),
    status: readRequiredOutputObject(raw.status, "branch.status"),
    scaleToZero: readRequiredOutputObject(raw.scaleToZero, "branch.scaleToZero"),
    configuration: readRequiredOutputObject(raw.configuration, "branch.configuration"),
    raw,
  };
}

function normalizeRegion(value: unknown): Record<string, unknown> {
  const raw = readObject(value);
  return {
    id: readRequiredOutputString(raw.id, "region.id"),
    publicAccess: readRequiredOutputBoolean(raw.publicAccess, "region.publicAccess"),
    backupsEnabled: readRequiredOutputBoolean(raw.backupsEnabled, "region.backupsEnabled"),
    provider: readRequiredOutputString(raw.provider, "region.provider"),
    organizationId: optionalString(raw.organizationId) ?? null,
    raw,
  };
}

function readArrayField(payload: unknown, fieldName: string, context: string): unknown[] {
  const body = readObject(payload);
  const value = body[fieldName];
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${context} is missing ${fieldName}`);
  }
  return value;
}

function readObject(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, "Xata returned an invalid object payload");
  }
  return record;
}

function readRequiredInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message)).trim();
}

function readRequiredOutputString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ProviderRequestError(502, `Xata returned an invalid ${fieldName}`);
  }
  return value;
}

function readRequiredOutputObject(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `Xata returned an invalid ${fieldName}`);
  }
  return record;
}

function readRequiredOutputBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== "boolean") {
    throw new ProviderRequestError(502, `Xata returned an invalid ${fieldName}`);
  }
  return value;
}
