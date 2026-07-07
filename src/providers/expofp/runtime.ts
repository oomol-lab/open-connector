import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { ExpofpActionName } from "./actions.ts";

import { compactObject, optionalBoolean, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

export const expofpApiBaseUrl = "https://app.expofp.com/api/v1";
const expofpDefaultRequestTimeoutMs = 30_000;

type ExpofpPhase = "validate" | "execute";
type ExpofpActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

export const expofpActionHandlers: Record<ExpofpActionName, ExpofpActionHandler> = {
  async list_expos(_input, context) {
    return {
      expos: normalizeExpoList(await requestExpofpJson("/list-events", {}, context, "execute")),
    };
  },
  async list_exhibitors(input, context) {
    return {
      exhibitors: normalizeExhibitorInfoList(
        await requestExpofpJson(
          "/list-exhibitors",
          {
            eventId: readRequiredPositiveInteger(input.eventId, "eventId"),
          },
          context,
          "execute",
        ),
      ),
    };
  },
  async get_exhibitor(input, context) {
    return {
      exhibitor: normalizeExhibitor(
        await requestExpofpJson(
          "/get-exhibitor",
          {
            id: readRequiredPositiveInteger(input.id, "id"),
          },
          context,
          "execute",
        ),
      ),
    };
  },
  async get_exhibitor_id(input, context) {
    return normalizeIdResponse(
      await requestExpofpJson(
        "/get-exhibitor-id",
        {
          eventId: readRequiredPositiveInteger(input.eventId, "eventId"),
          externalId: readRequiredString(input.externalId, "externalId"),
        },
        context,
        "execute",
      ),
    );
  },
  async add_exhibitor(input, context) {
    return normalizeIdResponse(
      await requestExpofpJson(
        "/add-exhibitor",
        compactObject({
          eventId: readRequiredPositiveInteger(input.eventId, "eventId"),
          ...buildWritableExhibitorPayload(input),
        }),
        context,
        "execute",
      ),
    );
  },
  async update_exhibitor(input, context) {
    await requestExpofpJson(
      "/update-exhibitor",
      compactObject({
        id: readRequiredPositiveInteger(input.id, "id"),
        ...buildWritableExhibitorPayload(input),
      }),
      context,
      "execute",
    );
    return { success: true };
  },
  async delete_exhibitor(input, context) {
    await requestExpofpJson(
      "/delete-exhibitor",
      {
        id: readRequiredPositiveInteger(input.id, "id"),
      },
      context,
      "execute",
    );
    return { success: true };
  },
};

export async function validateExpofpCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const expos = normalizeExpoList(
    await requestExpofpJson(
      "/list-events",
      {},
      {
        apiKey,
        fetcher,
        signal,
      },
      "validate",
    ),
  );
  const firstExpo = expos[0];
  return {
    profile: {
      accountId: "expofp:api-token",
      displayName: firstExpo ? `ExpoFP ${firstExpo.name}` : "ExpoFP API Token",
    },
    grantedScopes: [],
    metadata: compactObject({
      validationEndpoint: "/list-events",
      apiBaseUrl: expofpApiBaseUrl,
      expoCount: expos.length,
      firstExpoId: firstExpo?.id,
      firstExpoName: firstExpo?.name,
    }),
  };
}

async function requestExpofpJson(
  path: string,
  payload: Record<string, unknown>,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: ExpofpPhase,
): Promise<unknown> {
  const timeout = createProviderTimeout(context.signal, expofpDefaultRequestTimeoutMs);
  try {
    const response = await context.fetcher(new URL(path.replace(/^\//, ""), `${expofpApiBaseUrl}/`), {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: JSON.stringify({
        token: context.apiKey,
        ...payload,
      }),
      signal: timeout.signal,
    });
    const parsed = await readExpofpPayload(response);
    if (!response.ok) {
      throw createExpofpError(response.status, parsed, phase);
    }
    return parsed;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "ExpoFP request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `ExpoFP request failed: ${error.message}` : "ExpoFP request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

async function readExpofpPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "ExpoFP returned invalid JSON");
  }
}

function createExpofpError(status: number, payload: unknown, phase: ExpofpPhase): ProviderRequestError {
  const message = extractExpofpMessage(payload) ?? `ExpoFP request failed with status ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message);
  }
  if (phase === "execute" && status === 401) {
    return new ProviderRequestError(401, message);
  }
  if (phase === "execute" && status >= 400 && status < 500) {
    return new ProviderRequestError(status, message);
  }
  return new ProviderRequestError(status || 500, message);
}

function extractExpofpMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    return trimmed === "" ? undefined : trimmed;
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  return optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.errorMessage);
}

function normalizeExpoList(payload: unknown): Array<{ id: number; key: string; name: string }> {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "ExpoFP returned an invalid expo list");
  }
  return payload.map((item) => {
    const record = requireRecord(item, "expo");
    return {
      id: readRequiredPositiveInteger(record.id, "id"),
      key: readRequiredString(record.key, "key"),
      name: readRequiredString(record.name, "name"),
    };
  });
}

function normalizeExhibitorInfoList(payload: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "ExpoFP returned an invalid exhibitor list");
  }
  return payload.map((item) => {
    const record = requireRecord(item, "exhibitor");
    return {
      id: readRequiredPositiveInteger(record.id, "id"),
      name: readRequiredString(record.name, "name"),
      booths: readStringArray(record.booths),
      categories: readStringArray(record.categories),
      tags: readStringArray(record.tags),
      extras: readStringArray(record.extras),
    };
  });
}

function normalizeExhibitor(payload: unknown): Record<string, unknown> {
  const record = requireRecord(payload, "exhibitor");
  return compactObject({
    id: readRequiredPositiveInteger(record.id, "id"),
    name: optionalString(record.name),
    description: optionalString(record.description),
    featured: optionalBoolean(record.featured),
    advertised: optionalBoolean(record.advertised),
    country: optionalString(record.country),
    address: optionalString(record.address),
    address2: optionalString(record.address2),
    city: optionalString(record.city),
    state: optionalString(record.state),
    zip: optionalString(record.zip),
    phone1: optionalString(record.phone1),
    phone2: optionalString(record.phone2),
    publicEmail: optionalString(record.publicEmail),
    privateEmail: optionalString(record.privateEmail),
    vatNumber: optionalString(record.vatNumber),
    website: optionalString(record.website),
    facebook: optionalString(record.facebook),
    instagram: optionalString(record.instagram),
    linkedin: optionalString(record.linkedin),
    twitter: optionalString(record.twitter),
    googlePlus: optionalString(record.googlePlus),
    xing: optionalString(record.xing),
    youtube: optionalString(record.youtube),
    videoUrl: optionalString(record.videoUrl),
    contactName: optionalString(record.contactName),
    contactPhone: optionalString(record.contactPhone),
    adminNotes: optionalString(record.adminNotes),
    externalId: optionalString(record.externalId),
    autoLoginUrl: optionalString(record.autoLoginUrl),
    categories: readResourceModelArray(record.categories),
    tags: readStringArray(record.tags),
    metadata: readMetadataArray(record.metadata),
    booths: readStringArray(record.booths),
    images: readStringArray(record.images),
    logoFileUrl: record.logoFileUrl === null ? null : optionalString(record.logoFileUrl),
    updatedAt: optionalString(record.updatedAt),
  });
}

function normalizeIdResponse(payload: unknown): { id: number } {
  const record = requireRecord(payload, "id response");
  return {
    id: readRequiredPositiveInteger(record.id, "id"),
  };
}

function buildWritableExhibitorPayload(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    name: optionalString(input.name),
    description: optionalString(input.description),
    featured: optionalBoolean(input.featured),
    advertised: optionalBoolean(input.advertised),
    country: optionalString(input.country),
    address: optionalString(input.address),
    address2: optionalString(input.address2),
    city: optionalString(input.city),
    state: optionalString(input.state),
    zip: optionalString(input.zip),
    phone1: optionalString(input.phone1),
    phone2: optionalString(input.phone2),
    publicEmail: optionalString(input.publicEmail),
    privateEmail: optionalString(input.privateEmail),
    vatNumber: optionalString(input.vatNumber),
    website: optionalString(input.website),
    facebook: optionalString(input.facebook),
    instagram: optionalString(input.instagram),
    linkedin: optionalString(input.linkedin),
    twitter: optionalString(input.twitter),
    googlePlus: optionalString(input.googlePlus),
    xing: optionalString(input.xing),
    youtube: optionalString(input.youtube),
    videoUrl: optionalString(input.videoUrl),
    contactName: optionalString(input.contactName),
    contactPhone: optionalString(input.contactPhone),
    adminNotes: optionalString(input.adminNotes),
    externalId: optionalString(input.externalId),
    autoLoginUrl: optionalString(input.autoLoginUrl),
    categories: normalizeWritableResourceModelArray(input.categories),
    tags: normalizeWritableStringArray(input.tags),
    metadata: normalizeWritableMetadataArray(input.metadata),
  });
}

function normalizeWritableResourceModelArray(value: unknown): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.map((item) => {
    const record = requireRecord(item, "category");
    return compactObject({
      id: readOptionalPositiveInteger(record.id),
      name: optionalString(record.name),
    });
  });
}

function normalizeWritableMetadataArray(value: unknown): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.map((item) => {
    const record = requireRecord(item, "metadata");
    return compactObject({
      key: optionalString(record.key),
      value: optionalString(record.value),
    });
  });
}

function normalizeWritableStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.map((item) => optionalString(item)).filter((item): item is string => item !== undefined);
}

function readResourceModelArray(value: unknown): Array<{ id: number; name: string }> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.map((item) => {
    const record = requireRecord(item, "resource");
    return {
      id: readRequiredPositiveInteger(record.id, "id"),
      name: readRequiredString(record.name, "name"),
    };
  });
}

function readMetadataArray(value: unknown): Array<{ key: string; value: string }> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.map((item) => {
    const record = requireRecord(item, "metadata");
    return {
      key: readRequiredString(record.key, "key"),
      value: readRequiredString(record.value, "value"),
    };
  });
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => optionalString(item)).filter((item): item is string => item !== undefined);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `ExpoFP returned an invalid ${label} payload`);
  }
  return record;
}

function readRequiredString(value: unknown, fieldName: string): string {
  const parsed = optionalString(value);
  if (!parsed) {
    throw new ProviderRequestError(502, `ExpoFP response is missing ${fieldName}`);
  }
  return parsed;
}

function readRequiredPositiveInteger(value: unknown, fieldName: string): number {
  const parsed = readOptionalPositiveInteger(value);
  if (parsed === undefined) {
    throw new ProviderRequestError(502, `ExpoFP response is missing ${fieldName}`);
  }
  return parsed;
}

function readOptionalPositiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}
