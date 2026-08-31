import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalRecord, optionalString } from "../../core/cast.ts";
import { createProviderTimeout, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export type StannpRegion = "eu" | "us";

export interface StannpActionContext {
  apiKey: string;
  region: StannpRegion;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type StannpRequestPhase = "validate" | "execute";

const stannpBaseUrlByRegion: Record<StannpRegion, string> = {
  eu: "https://api-eu1.stannp.com",
  us: "https://api-us1.stannp.com",
};

export const stannpActionHandlers: ProviderActionHandlers<"stannp", ProviderRuntimeHandler<StannpActionContext>> = {
  async get_account_balance(_input, context) {
    const data = await stannpGetJson("/v1/accounts/balance", {}, context, "execute");
    const payload = objectFromStannp(data, "stannp account balance response data");
    return {
      balance: stringFrom(payload.balance),
      raw: data,
    };
  },
  async list_recipients(input, context) {
    const data = await stannpGetJson(
      "/v1/recipients/list",
      compactObject({
        group_id: input.groupId,
        offset: input.offset,
        limit: input.limit,
      }),
      context,
      "execute",
    );
    return {
      recipients: arrayFrom(data, "stannp recipients list response data"),
      raw: data,
    };
  },
  async get_recipient(input, context) {
    const recipientId = readPathId(input.recipientId, "recipientId");
    const data = await stannpGetJson(`/v1/recipients/get/${encodeURIComponent(recipientId)}`, {}, context, "execute");
    return {
      recipient: objectFromStannp(data, "stannp recipient response data"),
      raw: data,
    };
  },
  async create_recipient(input, context) {
    const data = await stannpPostForm("/v1/recipients/new", recipientFormFields(input), context, "execute");
    const payload = objectFromStannp(data, "stannp recipient creation response data");
    return {
      recipientId: stringFrom(payload.id),
      valid: nullableBoolean(payload.valid),
      created: nullableString(payload.created),
      raw: data,
    };
  },
  async delete_recipient(input, context) {
    const data = await stannpPostForm("/v1/recipients/delete", { id: input.recipientId }, context, "execute");
    return {
      deleted: booleanFromStannp(data),
      raw: data,
    };
  },
  async list_groups(input, context) {
    const data = await stannpGetJson(
      "/v1/groups/list",
      compactObject({
        offset: input.offset,
        limit: input.limit,
      }),
      context,
      "execute",
    );
    return {
      groups: arrayFrom(data, "stannp groups list response data"),
      raw: data,
    };
  },
  async create_group(input, context) {
    const data = await stannpPostForm(
      "/v1/groups/new",
      { name: readOptionalTrimmedString(input.name) },
      context,
      "execute",
    );
    return {
      groupId: stringFrom(data),
      raw: data,
    };
  },
  async add_recipients_to_group(input, context) {
    const groupId = readPathId(input.groupId, "groupId");
    const data = await stannpPostForm(
      `/v1/groups/add/${encodeURIComponent(groupId)}`,
      { recipients: joinRecipientIds(input.recipientIds) },
      context,
      "execute",
    );
    return {
      addedCount: nullableInteger(data),
      raw: data,
    };
  },
  async remove_recipients_from_group(input, context) {
    const groupId = readPathId(input.groupId, "groupId");
    const data = await stannpPostForm(
      `/v1/groups/remove/${encodeURIComponent(groupId)}`,
      { recipients: joinRecipientIds(input.recipientIds) },
      context,
      "execute",
    );
    return {
      removedCount: nullableInteger(data),
      raw: data,
    };
  },
  async delete_group(input, context) {
    const data = await stannpPostForm(
      "/v1/groups/delete",
      compactObject({
        id: input.groupId,
        delete_recipients: optionalBoolean(input.deleteRecipients),
      }),
      context,
      "execute",
    );
    return {
      deleted: booleanFromStannp(data),
      raw: data,
    };
  },
  async validate_address(input, context) {
    const data = await stannpPostForm(
      "/v1/addresses/validate",
      compactObject({
        company: readOptionalTrimmedString(input.company),
        address1: readOptionalTrimmedString(input.address1),
        address2: readOptionalTrimmedString(input.address2),
        address3: readOptionalTrimmedString(input.address3),
        city: readOptionalTrimmedString(input.city),
        postcode: readOptionalTrimmedString(input.postcode),
        country: readOptionalTrimmedString(input.country),
        state: readOptionalTrimmedString(input.state),
        province: readOptionalTrimmedString(input.province),
        zipcode: readOptionalTrimmedString(input.zipcode),
      }),
      context,
      "execute",
    );
    const address = objectFromStannp(data, "stannp address validation response data");
    return {
      isValid: booleanFromStannp(address.is_valid),
      address,
      raw: data,
    };
  },
};

export function buildStannpApiBaseUrl(region: StannpRegion): string {
  return stannpBaseUrlByRegion[region];
}

export function readStannpRegion(input: unknown): StannpRegion {
  const region = typeof input === "string" ? input.trim().toLowerCase() : "";
  if (region === "eu" || region === "uk") {
    return "eu";
  }
  if (region === "us" || region === "ca") {
    return "us";
  }
  throw new ProviderRequestError(400, "region must be eu or us");
}

export async function validateStannpCredential(
  apiKey: string,
  regionInput: unknown,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const region = readStannpRegion(regionInput);
  const apiBaseUrl = buildStannpApiBaseUrl(region);
  const data = await stannpGetJson("/v1/accounts/balance", {}, { apiKey, region, fetcher, signal }, "validate");
  const balance = stringFrom(objectFromStannp(data, "stannp account balance response data").balance);
  return {
    profile: {
      accountId: `stannp:${region}`,
      displayName: `Stannp ${region.toUpperCase()} Account`,
    },
    grantedScopes: [],
    metadata: {
      region,
      apiBaseUrl,
      balance,
    },
  };
}

async function stannpGetJson(
  path: string,
  query: Record<string, unknown>,
  context: StannpActionContext,
  phase: StannpRequestPhase,
): Promise<unknown> {
  const url = buildStannpUrl(path, context.region, query);
  return stannpRequest(url, context, { method: "GET" }, phase);
}

async function stannpPostForm(
  path: string,
  fields: Record<string, unknown>,
  context: StannpActionContext,
  phase: StannpRequestPhase,
): Promise<unknown> {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    appendFormField(body, key, value);
  }
  return stannpRequest(
    buildStannpUrl(path, context.region, {}),
    context,
    {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
      },
      body,
    },
    phase,
  );
}

async function stannpRequest(
  url: URL,
  context: StannpActionContext,
  init: RequestInit,
  phase: StannpRequestPhase,
): Promise<unknown> {
  const timeout = createProviderTimeout(context.signal);
  try {
    const response = await context.fetcher(url, {
      ...init,
      headers: stannpHeaders(context.apiKey, init.headers),
      signal: timeout.signal,
    });
    const payload = await readStannpPayload(response);
    if (!response.ok) {
      throw createStannpError(response.status, payload, phase);
    }
    const wrapper = optionalRecord(payload);
    if (!wrapper || wrapper.success !== true) {
      throw createStannpError(502, payload, phase);
    }
    return wrapper.data;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "stannp request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `stannp request failed: ${error.message}` : "stannp request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildStannpUrl(path: string, region: StannpRegion, query: Record<string, unknown>): URL {
  const url = new URL(path, buildStannpApiBaseUrl(region));
  for (const [key, value] of Object.entries(query)) {
    appendQueryField(url.searchParams, key, value);
  }
  return url;
}

function stannpHeaders(apiKey: string, extraHeaders?: HeadersInit): Record<string, string> {
  return {
    authorization: `Basic ${btoa(`${apiKey}:`)}`,
    accept: "application/json",
    "user-agent": providerUserAgent,
    ...Object.fromEntries(new Headers(extraHeaders).entries()),
  };
}

async function readStannpPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "stannp returned invalid JSON");
  }
}

function createStannpError(status: number, payload: unknown, phase: StannpRequestPhase): ProviderRequestError {
  const message = extractStannpErrorMessage(payload) ?? `stannp request failed with status ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message);
  }
  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(401, message);
  }
  if (phase === "execute" && status >= 400 && status < 500) {
    return new ProviderRequestError(status || 400, message);
  }
  return new ProviderRequestError(status || 500, message);
}

function extractStannpErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }
  const object = optionalRecord(payload);
  if (!object) {
    return undefined;
  }
  return optionalString(object.error) ?? optionalString(object.message);
}

function appendQueryField(params: URLSearchParams, key: string, value: unknown): void {
  if (value == null || value === "") {
    return;
  }
  params.set(key, String(value));
}

function appendFormField(body: URLSearchParams, key: string, value: unknown): void {
  if (value == null) {
    return;
  }
  if (typeof value === "object") {
    throw new ProviderRequestError(400, `${key} must be a scalar value`);
  }
  body.set(key, String(value));
}

function recipientFormFields(input: Record<string, unknown>): Record<string, unknown> {
  const fields: Record<string, unknown> = compactObject({
    group_id: input.groupId,
    title: readOptionalTrimmedString(input.title),
    firstname: readOptionalTrimmedString(input.firstname),
    lastname: readOptionalTrimmedString(input.lastname),
    company: readOptionalTrimmedString(input.company),
    job_title: readOptionalTrimmedString(input.jobTitle),
    address1: readOptionalTrimmedString(input.address1),
    address2: readOptionalTrimmedString(input.address2),
    address3: readOptionalTrimmedString(input.address3),
    city: readOptionalTrimmedString(input.city),
    county: readOptionalTrimmedString(input.county),
    postcode: readOptionalTrimmedString(input.postcode),
    country: readOptionalTrimmedString(input.country),
    email: readOptionalTrimmedString(input.email),
    phone_number: readOptionalTrimmedString(input.phoneNumber),
    ref_id: readOptionalTrimmedString(input.refId),
    on_duplicate: input.onDuplicate,
    test_level: input.testLevel,
  });
  const customFields = optionalRecord(input.customFields);
  if (customFields) {
    for (const [key, value] of Object.entries(customFields)) {
      if (value != null && typeof value === "object") {
        throw new ProviderRequestError(400, `customFields.${key} must be a scalar value`);
      }
      fields[key] = value;
    }
  }
  const recipientFieldCount = Object.entries(fields).filter(
    ([key, value]) => key !== "group_id" && value != null && value !== "",
  ).length;
  if (recipientFieldCount === 0) {
    throw new ProviderRequestError(400, "create_recipient requires recipient fields");
  }
  return fields;
}

function arrayFrom(value: unknown, fieldName: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${fieldName} must be an array`);
  }
  return value.map((item) => objectFromStannp(item, fieldName));
}

function objectFromStannp(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${fieldName} must be an object`);
  }
  return record;
}

function readPathId(value: unknown, fieldName: string): string {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return String(value);
}

function joinRecipientIds(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ProviderRequestError(400, "recipientIds must contain at least one ID");
  }
  return value.map((id) => readPathId(id, "recipientIds")).join(",");
}

function stringFrom(value: unknown): string {
  if (value == null) {
    return "";
  }
  return String(value);
}

function nullableString(value: unknown): string | null {
  return value == null ? null : String(value);
}

function nullableBoolean(value: unknown): boolean | null {
  if (value == null) {
    return null;
  }
  return booleanFromStannp(value);
}

function nullableInteger(value: unknown): number | null {
  if (value == null || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function booleanFromStannp(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes";
  }
  return false;
}

function readOptionalTrimmedString(value: unknown): string | undefined {
  return optionalString(value);
}
