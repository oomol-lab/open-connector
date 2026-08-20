import type { Client } from "@modelcontextprotocol/client";

import { UnauthorizedError } from "@modelcontextprotocol/client";
import { SdkHttpError } from "@modelcontextprotocol/client";
import { ProtocolError } from "@modelcontextprotocol/client";
import { createHash } from "node:crypto";
import { compactObject } from "../../core/cast.ts";
import { withMcpClient } from "../mcp-client.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

interface OAuthClientConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

interface TokenSet {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresAt: string;
  providerScopes: string[];
}

class HubspotRequestError extends ProviderRequestError {
  readonly code: string;

  constructor(code: string, message: string, status = 500, details?: unknown) {
    super(status, message, details);
    this.code = code;
  }
}

type HubspotMcpToolResult = Awaited<ReturnType<Client["callTool"]>>;

export const hubspotMcpEndpoint = "https://mcp.hubspot.com/";
export const hubspotMcpAuthorizeUrl = "https://mcp.hubspot.com/oauth/authorize/user";
const hubspotMcpTokenUrl = "https://mcp.hubspot.com/oauth/v3/token";
const hubspotMcpRequestTimeoutMs = 30_000;

interface HubspotTokenPayload {
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  expiresIn: number;
  providerScopes: string[];
}

interface HubspotActionContext {
  accessToken: string;
  fetcher: typeof fetch;
}

interface ExecuteHubspotActionInput {
  actionName: string;
  input: Record<string, unknown>;
  accessToken: string;
}

interface HubspotMcpToolCallInput {
  accessToken: string;
  fetcher: typeof fetch;
  toolName: string;
  arguments: Record<string, unknown>;
}

interface HubspotAccountProfile {
  providerAccountId: string;
  accountLabel: string;
  providerMetadata: Record<string, unknown>;
}

interface HubspotCurrentAccount extends HubspotAccountProfile {
  providerMetadata: Record<string, unknown>;
}

const actionSpecs = new Map([
  ["search_contacts", { objectType: "contacts", operation: "search" }],
  ["get_contact", { objectType: "contacts", operation: "get" }],
  ["create_contact", { objectType: "contacts", operation: "create" }],
  ["update_contact", { objectType: "contacts", operation: "update" }],
  ["search_companies", { objectType: "companies", operation: "search" }],
  ["get_company", { objectType: "companies", operation: "get" }],
  ["create_company", { objectType: "companies", operation: "create" }],
  ["update_company", { objectType: "companies", operation: "update" }],
  ["search_deals", { objectType: "deals", operation: "search" }],
  ["get_deal", { objectType: "deals", operation: "get" }],
  ["create_deal", { objectType: "deals", operation: "create" }],
  ["update_deal", { objectType: "deals", operation: "update" }],
]);

const directMcpToolNames = new Set([
  "search_crm_objects",
  "get_crm_objects",
  "manage_crm_objects",
  "search_properties",
  "get_properties",
  "search_owners",
  "get_campaign_contacts_by_type",
  "get_campaign_analytics",
  "get_campaign_asset_types",
  "get_campaign_asset_metrics",
  "submit_feedback",
]);

export async function exchangeHubspotCode(
  input: {
    code: string;
    clientConfig: OAuthClientConfig;
    codeVerifier: string;
  },
  fetcher: typeof fetch,
): Promise<TokenSet> {
  const response = await fetcher(hubspotMcpTokenUrl, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: input.clientConfig.clientId,
      client_secret: input.clientConfig.clientSecret,
      code: input.code,
      code_verifier: input.codeVerifier,
      grant_type: "authorization_code",
      redirect_uri: input.clientConfig.redirectUri,
    }),
  });

  return normalizeHubspotTokenResponse(response);
}

export async function refreshHubspotAccessToken(
  input: {
    refreshToken: string;
    clientConfig: OAuthClientConfig;
    previousProviderScopes?: string[];
  },
  fetcher: typeof fetch,
): Promise<TokenSet> {
  const response = await fetcher(hubspotMcpTokenUrl, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: input.clientConfig.clientId,
      client_secret: input.clientConfig.clientSecret,
      grant_type: "refresh_token",
      refresh_token: input.refreshToken,
    }),
  });

  const tokenSet = await normalizeHubspotTokenResponse(response);
  return {
    ...tokenSet,
    refreshToken: tokenSet.refreshToken || input.refreshToken,
    providerScopes: tokenSet.providerScopes.length > 0 ? tokenSet.providerScopes : (input.previousProviderScopes ?? []),
  };
}

export async function fetchHubspotCurrentAccount(
  accessToken: string,
  fetcher: typeof fetch,
): Promise<HubspotCurrentAccount> {
  await listHubspotMcpTools({ accessToken, fetcher });
  const tokenHash = hashHubspotToken(accessToken);
  const providerAccountId = `hubspot-mcp:${tokenHash}`;
  return {
    providerAccountId,
    accountLabel: `HubSpot MCP · ${tokenHash.slice(-6)}`,
    providerMetadata: {
      mcpEndpoint: hubspotMcpEndpoint,
    },
  };
}

export async function executeHubspotAction(input: ExecuteHubspotActionInput, fetcher: typeof fetch): Promise<unknown> {
  const context = {
    accessToken: input.accessToken,
    fetcher,
  };

  if (input.actionName === "get_user_details") {
    return {
      userDetails: await callHubspotMcpTool({
        ...context,
        toolName: "get_user_details",
        arguments: {},
      }),
    };
  }

  if (directMcpToolNames.has(input.actionName)) {
    return callDirectHubspotMcpTool(input.actionName, input.input, context);
  }

  if (input.actionName === "list_properties") {
    return listHubspotProperties(input.input, context);
  }
  if (input.actionName === "get_property") {
    return getHubspotProperty(input.input, context);
  }

  const spec = actionSpecs.get(input.actionName);
  if (!spec) {
    throw new HubspotRequestError("invalid_input", `unknown hubspot action: ${input.actionName}`, 400);
  }

  if (spec.operation === "search") {
    return searchHubspotRecords(spec.objectType, input.input, context);
  }
  if (spec.operation === "get") {
    return getHubspotRecord(spec.objectType, input.input, context);
  }
  if (spec.operation === "create") {
    return createHubspotRecord(spec.objectType, input.input, context);
  }
  if (spec.operation === "update") {
    return updateHubspotRecord(spec.objectType, input.input, context);
  }

  throw new HubspotRequestError("invalid_input", `unknown hubspot action: ${input.actionName}`, 400);
}

async function callDirectHubspotMcpTool(
  toolName: string,
  input: Record<string, unknown>,
  context: HubspotActionContext,
) {
  const output = await callHubspotMcpTool({
    ...context,
    toolName,
    arguments: buildDirectHubspotMcpArguments(toolName, input),
  });

  return {
    result: output,
  };
}

function buildDirectHubspotMcpArguments(toolName: string, input: Record<string, unknown>) {
  if (toolName === "get_crm_objects") {
    return compactObject({
      ...input,
      objectIds: asHubspotObjectIds(input.objectIds, {
        coerceCanonicalNumericStrings: !asString(input.idProperty),
      }),
    });
  }

  if (toolName === "search_owners") {
    return compactObject({
      ...input,
      ownerIds: asHubspotObjectIds(input.ownerIds, {
        coerceCanonicalNumericStrings: true,
      }),
    });
  }

  if (toolName === "manage_crm_objects") {
    return buildManageCrmObjectsArguments(input);
  }

  if (toolName === "get_campaign_contacts_by_type") {
    return compactObject({
      ...input,
      campaignId: asHubspotObjectId(input.campaignId, {
        coerceCanonicalNumericStrings: true,
      }),
    });
  }

  if (toolName === "get_campaign_analytics") {
    return compactObject({
      ...input,
      campaignIds: asHubspotObjectIds(input.campaignIds, {
        coerceCanonicalNumericStrings: true,
      }),
    });
  }

  if (toolName === "get_campaign_asset_metrics") {
    return compactObject({
      ...input,
      campaignId: asHubspotObjectId(input.campaignId, {
        coerceCanonicalNumericStrings: true,
      }),
      objectIds: asHubspotObjectIds(input.objectIds, {
        coerceCanonicalNumericStrings: true,
      }),
    });
  }

  return compactObject({ ...input });
}

function buildManageCrmObjectsArguments(input: Record<string, unknown>) {
  if (asObject(input.createRequest) || asObject(input.updateRequest)) {
    return compactObject({ ...input });
  }

  const objectType = asString(input.objectType);
  const operation = asString(input.operation);
  if (objectType && operation === "create") {
    return {
      createRequest: {
        objects: [
          compactObject({
            objectType,
            properties: asRecord(input.properties),
            associations: Array.isArray(input.associations) ? input.associations : undefined,
          }),
        ],
      },
    };
  }

  if (objectType && operation === "update") {
    const recordId = asString(input.recordId) ?? asString(input.id);
    const idProperty = asString(input.idProperty);
    return {
      updateRequest: {
        objects: [
          compactObject({
            objectType,
            objectId: recordId ? toHubspotObjectId(recordId, { idProperty }) : undefined,
            idProperty: idProperty ?? undefined,
            properties: asRecord(input.properties),
          }),
        ],
      },
    };
  }

  return compactObject({ ...input });
}

async function searchHubspotRecords(objectType: string, input: Record<string, unknown>, context: HubspotActionContext) {
  const output = await callHubspotMcpTool({
    ...context,
    toolName: "search_crm_objects",
    arguments: compactObject({
      objectType,
      query: asString(input.query) ?? undefined,
      filterGroups: Array.isArray(input.filterGroups) ? input.filterGroups : undefined,
      sorts: Array.isArray(input.sorts) ? input.sorts : undefined,
      properties: asStringArray(input.properties),
      propertiesWithHistory: asStringArray(input.propertiesWithHistory),
      associations: asStringArray(input.associations),
      limit: typeof input.limit === "number" ? input.limit : undefined,
      after: asString(input.after) ?? undefined,
    }),
  });

  return normalizeSearchOutput(output);
}

async function getHubspotRecord(objectType: string, input: Record<string, unknown>, context: HubspotActionContext) {
  const recordId = requireNonEmptyString(input.recordId, "recordId");
  const output = await callHubspotMcpTool({
    ...context,
    toolName: "get_crm_objects",
    arguments: compactObject({
      objectType,
      objectIds: [toHubspotObjectId(recordId, { idProperty: asString(input.idProperty) })],
      idProperty: asString(input.idProperty) ?? undefined,
      properties: asStringArray(input.properties),
      propertiesWithHistory: asStringArray(input.propertiesWithHistory),
      associations: asStringArray(input.associations),
    }),
  });

  return {
    record: normalizeSingleRecord(output),
  };
}

async function createHubspotRecord(objectType: string, input: Record<string, unknown>, context: HubspotActionContext) {
  const output = await callHubspotMcpTool({
    ...context,
    toolName: "manage_crm_objects",
    arguments: {
      createRequest: {
        objects: [
          compactObject({
            objectType,
            properties: asRecord(input.properties),
            associations: Array.isArray(input.associations) ? input.associations : undefined,
          }),
        ],
      },
    },
  });

  return {
    record: normalizeSingleRecord(output),
  };
}

async function updateHubspotRecord(objectType: string, input: Record<string, unknown>, context: HubspotActionContext) {
  const recordId = requireNonEmptyString(input.recordId, "recordId");
  const idProperty = asString(input.idProperty);
  const output = await callHubspotMcpTool({
    ...context,
    toolName: "manage_crm_objects",
    arguments: {
      updateRequest: {
        objects: [
          compactObject({
            objectType,
            objectId: toHubspotObjectId(recordId, { idProperty }),
            idProperty: idProperty ?? undefined,
            properties: asRecord(input.properties),
          }),
        ],
      },
    },
  });

  return {
    record: normalizeSingleRecord(output),
  };
}

async function listHubspotProperties(input: Record<string, unknown>, context: HubspotActionContext) {
  const objectType = requireNonEmptyString(input.objectType, "objectType");
  const propertyNames = asStringArray(input.propertyNames);
  const keywords = asStringArray(input.keywords);
  const toolName = propertyNames ? "get_properties" : keywords ? "search_properties" : "get_properties";
  const output = await callHubspotMcpTool({
    ...context,
    toolName,
    arguments: compactObject({
      objectType,
      propertyNames,
      keywords,
    }),
  });

  return {
    properties: normalizePropertyList(output),
  };
}

async function getHubspotProperty(input: Record<string, unknown>, context: HubspotActionContext) {
  const objectType = requireNonEmptyString(input.objectType, "objectType");
  const propertyName = requireNonEmptyString(input.propertyName, "propertyName");
  const output = await callHubspotMcpTool({
    ...context,
    toolName: "get_properties",
    arguments: {
      objectType,
      propertyNames: [propertyName],
    },
  });

  return {
    property: normalizePropertyList(output)[0] ?? normalizeSingleRecord(output),
  };
}

async function listHubspotMcpTools(input: { accessToken: string; fetcher: typeof fetch }): Promise<void> {
  const headers = new Headers();
  headers.set("authorization", `Bearer ${input.accessToken}`);
  headers.set("user-agent", providerUserAgent);
  return withMcpClient(
    {
      endpoint: new URL(hubspotMcpEndpoint),
      transport: "streamable_http",
      fetcher: input.fetcher,
      headers,
      mapError: (error) => mapHubspotMcpError("hubspot", error),
    },
    async (client) => {
      const result = await client.listTools({}, { timeout: hubspotMcpRequestTimeoutMs });
      if (!result.tools.some((tool) => directMcpToolNames.has(tool.name) || tool.name === "get_user_details")) {
        throw new ProviderRequestError(502, "hubspot MCP did not advertise any supported tools");
      }
    },
  );
}

async function callHubspotMcpTool(input: HubspotMcpToolCallInput) {
  try {
    const output = await callStreamableHttpMcpTool({
      endpoint: hubspotMcpEndpoint,
      bearerToken: input.accessToken,
      service: "hubspot",
      fetcher: input.fetcher,
      requestTimeoutMs: hubspotMcpRequestTimeoutMs,
      toolName: input.toolName,
      arguments: input.arguments,
    });
    return unwrapHubspotMcpOutput(output);
  } catch (error) {
    if (error instanceof HubspotRequestError && error.status === 401) {
      throw new HubspotRequestError("credential_expired", error.message, 409);
    }
    throw error;
  }
}

async function callStreamableHttpMcpTool(input: {
  endpoint: string;
  bearerToken: string;
  service: string;
  fetcher: typeof fetch;
  requestTimeoutMs: number;
  toolName: string;
  arguments: Record<string, unknown>;
}): Promise<HubspotMcpToolResult> {
  const headers = new Headers();
  headers.set("authorization", `Bearer ${input.bearerToken}`);
  headers.set("user-agent", providerUserAgent);

  return withMcpClient(
    {
      endpoint: new URL(input.endpoint),
      transport: "streamable_http",
      fetcher: input.fetcher,
      headers,
      mapError: (error) => mapHubspotMcpError(input.service, error),
    },
    (client) =>
      client.callTool(
        {
          name: input.toolName,
          arguments: input.arguments,
        },
        {
          timeout: input.requestTimeoutMs,
        },
      ),
  );
}

function mapHubspotMcpError(service: string, error: unknown): ProviderRequestError {
  if (error instanceof ProviderRequestError) {
    return error;
  }
  if (error instanceof UnauthorizedError) {
    return new HubspotRequestError("credential_expired", `${service} MCP token is invalid or expired`, 401, error);
  }
  if (error instanceof SdkHttpError) {
    const status = error.status;
    return new ProviderRequestError(
      status === 401 || status === 403 ? 401 : status && status >= 400 && status < 500 ? 400 : 502,
      `${service} MCP request failed: ${error.message}`,
      error,
    );
  }
  if (error instanceof ProtocolError) {
    return new ProviderRequestError(502, `${service} MCP request failed: ${error.message}`, error);
  }
  return new ProviderRequestError(
    502,
    error instanceof Error ? `${service} MCP request failed: ${error.message}` : `${service} MCP request failed`,
    error,
  );
}

function unwrapHubspotMcpOutput(output: unknown) {
  const body = asObject(output);
  const content = Array.isArray(body?.content) ? body.content : [];
  const firstText = content
    .map((item) => asObject(item))
    .map((item) => (item?.type === "text" ? asString(item.text) : undefined))
    .find(Boolean);
  if (!firstText) {
    return output;
  }

  try {
    return JSON.parse(firstText);
  } catch {
    return output;
  }
}

async function normalizeHubspotTokenResponse(response: Response): Promise<TokenSet> {
  const payload = parseHubspotTokenPayload(await readHubspotJson(response), response.status);

  return {
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken ?? "",
    tokenType: payload.tokenType,
    expiresAt: new Date(Date.now() + payload.expiresIn * 1000).toISOString(),
    providerScopes: payload.providerScopes,
  };
}

async function readHubspotJson(response: Response): Promise<unknown> {
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw toHubspotError(response.status, payload);
  }

  return payload;
}

function parseHubspotTokenPayload(payload: unknown, status: number): HubspotTokenPayload {
  const body = asObject(payload);
  if (!body) {
    throw new HubspotRequestError("provider_error", `malformed hubspot token response (${status})`);
  }

  const accessToken = asString(body.access_token);
  if (!accessToken) {
    throw new HubspotRequestError("provider_error", "malformed hubspot token response: access_token");
  }

  const tokenType = asString(body.token_type);
  if (!tokenType) {
    throw new HubspotRequestError("provider_error", "malformed hubspot token response: token_type");
  }

  const expiresIn = asPositiveFiniteNumber(body.expires_in);
  if (expiresIn == null) {
    throw new HubspotRequestError("provider_error", "malformed hubspot token response: expires_in");
  }

  return {
    accessToken,
    refreshToken: asString(body.refresh_token) ?? undefined,
    tokenType,
    expiresIn,
    providerScopes: parseHubspotProviderScopes(body),
  };
}

function parseHubspotProviderScopes(body: Record<string, unknown>) {
  const scope = body.scope;
  if (typeof scope === "string") {
    return scope
      .split(" ")
      .map((item) => item.trim())
      .filter(Boolean)
      .sort();
  }

  const scopes = body.scopes;
  if (Array.isArray(scopes)) {
    return scopes
      .map((item) => asString(item))
      .filter((item): item is string => Boolean(item))
      .sort();
  }

  return [];
}

function normalizeSearchOutput(output: unknown) {
  const body = asObject(output);
  const results = readArrayProperty(body ?? undefined, ["results", "records", "objects", "items"]).map(
    normalizeSingleRecord,
  );
  const nextAfter =
    asString(asObject(asObject(body?.paging)?.next)?.after) ??
    asString(asObject(body?.paging)?.nextAfter) ??
    asString(body?.nextAfter) ??
    asString(body?.after);

  return {
    results,
    ...(nextAfter ? { paging: { nextAfter } } : {}),
    ...(body ? {} : { raw: output }),
  };
}

function normalizeSingleRecord(output: unknown) {
  const body = asObject(output);
  if (!body) {
    return {};
  }

  const record =
    asObject(body.record) ??
    asObject(body.object) ??
    asObject(body.result) ??
    asObject(body.createdObject) ??
    asObject(body.updatedObject) ??
    readFirstManagedObject(body);
  if (record) {
    return normalizeRecordObject(record);
  }

  for (const key of ["records", "objects", "results", "items"]) {
    const items = body[key];
    if (Array.isArray(items) && items[0] != null) {
      return normalizeRecordObject(asObject(items[0]) ?? {});
    }
  }

  return normalizeRecordObject(body);
}

function normalizeRecordObject(record: Record<string, unknown>) {
  const id = asString(record.id);
  return {
    ...record,
    ...(id ? { id } : {}),
  };
}

function readFirstManagedObject(body: Record<string, unknown>) {
  for (const key of ["createResults", "updateResults"]) {
    const result = asObject(body[key]);
    const items = Array.isArray(result?.results) ? result.results : [];
    const first = asObject(items[0]);
    const object = asObject(first?.object);
    if (object) {
      return object;
    }
  }

  return null;
}

function normalizePropertyList(output: unknown) {
  const body = asObject(output);
  if (!body) {
    return [];
  }

  const properties = readArrayProperty(body, ["properties", "results", "items"]);
  if (properties.length > 0) {
    return properties.map((item) => asObject(item) ?? {});
  }

  const property = asObject(body.property);
  if (property) {
    return [property];
  }

  return hasPropertyDefinitionShape(body) ? [body] : [];
}

function hasPropertyDefinitionShape(body: Record<string, unknown>) {
  return typeof body.name === "string" && typeof body.label === "string";
}

function readArrayProperty(body: Record<string, unknown> | undefined, keys: string[]) {
  if (!body) {
    return [];
  }
  for (const key of keys) {
    const value = body[key];
    if (Array.isArray(value)) {
      return value;
    }
  }
  return [];
}

function toHubspotError(status: number, payload: unknown) {
  const message = extractHubspotErrorMessage(payload) ?? `hubspot request failed with status ${status}`;

  if (status === 401) {
    return new HubspotRequestError("credential_expired", message, 409);
  }
  if (status === 400 || status === 404) {
    return new HubspotRequestError("invalid_input", message, status);
  }
  if (status === 429) {
    return new HubspotRequestError("rate_limited", message, 429);
  }

  return new HubspotRequestError("provider_error", message, status || 500);
}

function extractHubspotErrorMessage(payload: unknown): string | null {
  const body = asObject(payload);
  if (!body) {
    return null;
  }

  const errorDescription = asString(body.error_description);
  if (errorDescription) {
    return errorDescription;
  }

  const message = asString(body.message);
  if (message) {
    return message;
  }

  const error = asString(body.error);
  if (error) {
    return error;
  }

  return null;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return asObject(value) ?? {};
}

function asString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim() !== "") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

function asPositiveFiniteNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const values = value.map((item) => asString(item)).filter((item): item is string => Boolean(item));

  return values.length > 0 ? values : undefined;
}

function requireNonEmptyString(value: unknown, field: string): string {
  const stringValue = asString(value);
  if (!stringValue) {
    throw new HubspotRequestError("invalid_input", `${field} is required`, 400);
  }

  return stringValue;
}

function toHubspotObjectId(value: string, input: { idProperty?: string | undefined } = {}) {
  if (input.idProperty) {
    return value;
  }
  return toCanonicalNumericHubspotId(value);
}

function toCanonicalNumericHubspotId(value: string) {
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) && String(numeric) === value ? numeric : value;
}

function asHubspotObjectId(value: unknown, options: { coerceCanonicalNumericStrings?: boolean } = {}) {
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    return options.coerceCanonicalNumericStrings ? toCanonicalNumericHubspotId(value) : value;
  }

  return undefined;
}

function asHubspotObjectIds(value: unknown, options: { coerceCanonicalNumericStrings?: boolean } = {}) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const ids = value
    .map((item) => asHubspotObjectId(item, options))
    .filter((item): item is string | number => item != null);

  return ids.length > 0 ? ids : undefined;
}

function hashHubspotToken(token: string) {
  return createHash("sha256").update(token).digest("hex").slice(0, 16);
}
