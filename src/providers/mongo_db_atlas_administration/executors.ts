import type { CastErrorFactory } from "../../core/cast.ts";
import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderFetch } from "../provider-runtime.ts";
import type { MongoDbAtlasAdministrationActionName } from "./actions.ts";

import { createHash } from "node:crypto";
import { optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { jsonObject } from "../../core/request.ts";
import {
  createProviderProxyUrl,
  createProviderTimeout,
  defineProviderExecutors,
  isAbortLikeError,
  normalizeProviderProxyHeaders,
  providerUserAgent,
  ProviderRequestError,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  toProviderProxyError,
} from "../provider-runtime.ts";

const service = "mongo_db_atlas_administration";
const mongoDbAtlasAdministrationApiBaseUrl = "https://cloud.mongodb.com/api/atlas/v2";
const atlasAcceptHeader = "application/vnd.atlas.2024-08-05+json";
const defaultRequestTimeoutMs = 30_000;

type AtlasPhase = "validate" | "execute";

interface DigestChallenge {
  realm: string;
  nonce: string;
  qop?: string;
  opaque?: string;
  algorithm?: string;
}

interface AtlasActionContext {
  publicKey: string;
  privateKey: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

type AtlasActionHandler = (input: Record<string, unknown>, context: AtlasActionContext) => Promise<unknown>;

export const mongoDbAtlasAdministrationActionHandlers: Record<
  MongoDbAtlasAdministrationActionName,
  AtlasActionHandler
> = {
  async list_projects(input, context): Promise<unknown> {
    const payload = await requestAtlasJson({
      path: "/groups",
      query: readPaginationQuery(input),
      context,
      phase: "execute",
    });
    return {
      projects: normalizeProjects(payload.results),
      meta: normalizeListMeta(payload),
    };
  },
  async get_project(input, context): Promise<unknown> {
    const payload = await requestAtlasJson({
      path: `/groups/${encodeURIComponent(requiredAtlasInputString(input.groupId, "groupId"))}`,
      context,
      phase: "execute",
    });
    return {
      project: normalizeProject(payload),
    };
  },
  async list_clusters(input, context): Promise<unknown> {
    const payload = await requestAtlasJson({
      path: `/groups/${encodeURIComponent(requiredAtlasInputString(input.groupId, "groupId"))}/clusters`,
      query: readPaginationQuery(input),
      context,
      phase: "execute",
    });
    return {
      clusters: normalizeClusters(payload.results),
      meta: normalizeListMeta(payload),
    };
  },
  async get_cluster(input, context): Promise<unknown> {
    const groupId = requiredAtlasInputString(input.groupId, "groupId");
    const name = requiredAtlasInputString(input.name, "name");
    const payload = await requestAtlasJson({
      path: `/groups/${encodeURIComponent(groupId)}/clusters/${encodeURIComponent(name)}`,
      context,
      phase: "execute",
    });
    return {
      cluster: normalizeCluster(payload),
    };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<AtlasActionContext>({
  service,
  handlers: mongoDbAtlasAdministrationActionHandlers,
  async createContext(context: ExecutionContext, fetcher: ProviderFetch): Promise<AtlasActionContext> {
    const credential = await context.getCredential(service);
    if (credential?.authType !== "api_key") {
      throw new ProviderRequestError(401, "Configure mongo_db_atlas_administration API key credentials first.");
    }
    return {
      publicKey: credential.apiKey,
      privateKey: readPrivateKey(credential.values),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    const credential = await context.getCredential(service);
    if (credential?.authType !== "api_key") {
      throw new ProviderRequestError(401, "Configure mongo_db_atlas_administration API key credentials first.");
    }

    const url = createProviderProxyUrl(mongoDbAtlasAdministrationApiBaseUrl, input.endpoint, input.query);
    const privateKey = readPrivateKey(credential.values);
    const headers = normalizeProviderProxyHeaders(input.headers);
    for (const [name, value] of Object.entries(buildAtlasHeaders())) {
      headers.set(name, value);
    }
    const body =
      input.body === undefined ? undefined : typeof input.body === "string" ? input.body : JSON.stringify(input.body);
    const init: RequestInit = {
      method: input.method,
      headers,
      body,
      signal: context.signal,
    };

    const unauthenticatedResponse = await fetch(url, init);
    if (unauthenticatedResponse.status !== 401) {
      if (!unauthenticatedResponse.ok) {
        const text = await unauthenticatedResponse.text().catch(() => "");
        throw new ProviderRequestError(
          unauthenticatedResponse.status,
          text || `MongoDB Atlas request failed with HTTP ${unauthenticatedResponse.status}`,
        );
      }
      return { ok: true, response: await readProviderProxyResponse(unauthenticatedResponse) };
    }

    const challenge = parseDigestChallenge(unauthenticatedResponse.headers.get("www-authenticate"));
    const authorizedHeaders = new Headers(headers);
    authorizedHeaders.set(
      "authorization",
      buildDigestAuthorization({
        challenge,
        method: input.method,
        url,
        username: credential.apiKey,
        password: privateKey,
      }),
    );

    const response = await fetch(url, {
      ...init,
      headers: authorizedHeaders,
    });
    if (!response.ok) {
      const text = await readProviderProxyErrorMessage(response, "");
      throw new ProviderRequestError(
        response.status,
        text || `MongoDB Atlas request failed with HTTP ${response.status}`,
      );
    }

    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "MongoDB Atlas request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const context: AtlasActionContext = {
      publicKey: input.apiKey,
      privateKey: readPrivateKey(input.values),
      fetcher,
      signal,
    };
    const payload = await requestAtlasJson({
      path: "/groups",
      query: {
        itemsPerPage: "1",
        includeCount: "true",
      },
      context,
      phase: "validate",
    });

    const projects = normalizeProjects(payload.results);
    const firstProject = projects[0];
    return {
      profile: {
        accountId: firstProject?.id ? `mongodb-atlas:${firstProject.id}` : `mongodb-atlas:${input.apiKey.slice(-6)}`,
        displayName: firstProject?.name ? `MongoDB Atlas: ${firstProject.name}` : "MongoDB Atlas API Key",
      },
      grantedScopes: [],
      metadata: jsonObject({
        apiBaseUrl: mongoDbAtlasAdministrationApiBaseUrl,
        validationEndpoint: "/groups",
        projectCount: readNullableInteger(payload.totalCount),
        firstProjectId: firstProject?.id,
        firstProjectName: firstProject?.name,
      }),
    };
  },
};

async function requestAtlasJson(input: {
  path: string;
  context: AtlasActionContext;
  phase: AtlasPhase;
  query?: Record<string, string | undefined>;
}): Promise<Record<string, unknown>> {
  const timeout = createProviderTimeout(input.context.signal, defaultRequestTimeoutMs);
  const url = buildAtlasUrl(input.path, input.query);

  try {
    const unauthenticatedResponse = await input.context.fetcher(url, {
      method: "GET",
      headers: buildAtlasHeaders(),
      signal: timeout.signal,
    });

    if (unauthenticatedResponse.status !== 401) {
      const payload = await readAtlasPayload(unauthenticatedResponse);
      if (!unauthenticatedResponse.ok) {
        throw createAtlasError(unauthenticatedResponse.status, payload, input.phase);
      }
      return requireObjectPayload(payload);
    }

    const challenge = parseDigestChallenge(unauthenticatedResponse.headers.get("www-authenticate"));
    const response = await input.context.fetcher(url, {
      method: "GET",
      headers: {
        ...buildAtlasHeaders(),
        authorization: buildDigestAuthorization({
          challenge,
          method: "GET",
          url,
          username: input.context.publicKey,
          password: input.context.privateKey,
        }),
      },
      signal: timeout.signal,
    });
    const payload = await readAtlasPayload(response);

    if (!response.ok) {
      throw createAtlasError(response.status, payload, input.phase);
    }

    return requireObjectPayload(payload);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "MongoDB Atlas request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `MongoDB Atlas request failed: ${error.message}` : "MongoDB Atlas request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function readPrivateKey(values: Record<string, unknown> | undefined): string {
  return requiredString(values?.privateKey, "privateKey", providerRequestInputError);
}

function providerRequestInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function buildAtlasUrl(path: string, query: Record<string, string | undefined> = {}): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${mongoDbAtlasAdministrationApiBaseUrl}/`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

function buildAtlasHeaders(): Record<string, string> {
  return {
    accept: atlasAcceptHeader,
    "content-type": "application/json",
    "user-agent": providerUserAgent,
  };
}

async function readAtlasPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "MongoDB Atlas returned invalid JSON");
  }
}

function requireObjectPayload(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "MongoDB Atlas returned an invalid payload");
  }
  return record;
}

function createAtlasError(status: number, payload: unknown, phase: AtlasPhase): ProviderRequestError {
  const message = readAtlasErrorMessage(payload) ?? `MongoDB Atlas request failed with status ${status}`;
  const mappedStatus = phase === "validate" && (status === 401 || status === 403) ? 400 : status;
  return new ProviderRequestError(mappedStatus || 502, message, payload);
}

function readAtlasErrorMessage(payload: unknown): string | undefined {
  const body = optionalRecord(payload);
  if (!body) {
    return typeof payload === "string" && payload.trim() ? payload : undefined;
  }

  return (
    optionalString(body.detail) ??
    optionalString(body.error) ??
    optionalString(body.reason) ??
    optionalString(body.message)
  );
}

function parseDigestChallenge(value: string | null): DigestChallenge {
  if (!value?.toLowerCase().startsWith("digest ")) {
    throw new ProviderRequestError(502, "MongoDB Atlas did not return a Digest challenge");
  }

  const parameters = new Map<string, string>();
  for (const part of splitDigestParameters(value.slice("Digest ".length))) {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }
    const key = part.slice(0, separatorIndex).trim().toLowerCase();
    const rawValue = part.slice(separatorIndex + 1).trim();
    parameters.set(key, unquoteDigestValue(rawValue));
  }

  const realm = parameters.get("realm");
  const nonce = parameters.get("nonce");
  if (!realm || !nonce) {
    throw new ProviderRequestError(502, "MongoDB Atlas Digest challenge is incomplete");
  }

  return {
    realm,
    nonce,
    qop: parameters.get("qop"),
    opaque: parameters.get("opaque"),
    algorithm: parameters.get("algorithm"),
  };
}

function splitDigestParameters(value: string): string[] {
  const parts: string[] = [];
  let current = "";
  let insideQuotes = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === '"' && value[index - 1] !== "\\") {
      insideQuotes = !insideQuotes;
    }
    if (character === "," && !insideQuotes) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += character;
  }
  if (current.trim()) {
    parts.push(current.trim());
  }
  return parts;
}

function unquoteDigestValue(value: string): string {
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).split('\\"').join('"');
  }
  return value;
}

function buildDigestAuthorization(input: {
  challenge: DigestChallenge;
  method: string;
  url: URL;
  username: string;
  password: string;
}): string {
  const algorithm = (input.challenge.algorithm ?? "MD5").toUpperCase();
  if (algorithm !== "MD5") {
    throw new ProviderRequestError(502, `unsupported MongoDB Atlas Digest algorithm: ${algorithm}`);
  }

  const qop = chooseDigestQop(input.challenge.qop);
  const nc = "00000001";
  const cnonce = createHash("sha256")
    .update(`${input.username}:${input.challenge.nonce}:${input.url.toString()}`)
    .digest("hex")
    .slice(0, 16);
  const uri = `${input.url.pathname}${input.url.search}`;
  const ha1 = md5(`${input.username}:${input.challenge.realm}:${input.password}`);
  const ha2 = md5(`${input.method.toUpperCase()}:${uri}`);
  const response = qop
    ? md5(`${ha1}:${input.challenge.nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
    : md5(`${ha1}:${input.challenge.nonce}:${ha2}`);

  const segments = [
    `username="${escapeDigestQuotedValue(input.username)}"`,
    `realm="${escapeDigestQuotedValue(input.challenge.realm)}"`,
    `nonce="${escapeDigestQuotedValue(input.challenge.nonce)}"`,
    `uri="${escapeDigestQuotedValue(uri)}"`,
    `response="${response}"`,
    "algorithm=MD5",
  ];
  if (input.challenge.opaque) {
    segments.push(`opaque="${escapeDigestQuotedValue(input.challenge.opaque)}"`);
  }
  if (qop) {
    segments.push(`qop=${qop}`, `nc=${nc}`, `cnonce="${cnonce}"`);
  }

  return `Digest ${segments.join(", ")}`;
}

function chooseDigestQop(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const options = value.split(",").map((part) => part.trim().toLowerCase());
  if (options.includes("auth")) {
    return "auth";
  }
  throw new ProviderRequestError(502, `unsupported MongoDB Atlas Digest qop: ${value}`);
}

function escapeDigestQuotedValue(value: string): string {
  return value.split("\\").join("\\\\").split('"').join('\\"');
}

function md5(value: string): string {
  return createHash("md5").update(value).digest("hex");
}

function readPaginationQuery(input: Record<string, unknown>): Record<string, string | undefined> {
  return jsonObject({
    pageNum: optionalIntegerString(input.pageNum, "pageNum"),
    itemsPerPage: optionalIntegerString(input.itemsPerPage, "itemsPerPage"),
    includeCount: typeof input.includeCount === "boolean" ? String(input.includeCount) : undefined,
  }) as Record<string, string | undefined>;
}

function optionalIntegerString(value: unknown, fieldName: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = optionalInteger(value);
  if (parsed === undefined) {
    throw new ProviderRequestError(400, `${fieldName} must be an integer`);
  }
  return String(parsed);
}

function requiredAtlasInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, providerRequestInputError as CastErrorFactory);
}

function normalizeProjects(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => normalizeProject(item));
}

function normalizeProject(value: unknown): Record<string, unknown> {
  const record = requireObjectPayload(value);
  return {
    id: requiredPayloadString(record.id, "project id"),
    name: nullableString(record.name),
    orgId: nullableString(record.orgId),
    createdAt: nullableString(record.created),
    regionUsageRestrictions: nullableString(record.regionUsageRestrictions),
    raw: record,
  };
}

function normalizeClusters(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => normalizeCluster(item));
}

function normalizeCluster(value: unknown): Record<string, unknown> {
  const record = requireObjectPayload(value);
  const replicationSpecs = Array.isArray(record.replicationSpecs) ? record.replicationSpecs : [];
  const firstReplicationSpec = optionalRecord(replicationSpecs[0]);
  const regionConfigs = Array.isArray(firstReplicationSpec?.regionConfigs) ? firstReplicationSpec.regionConfigs : [];
  const firstRegionConfig = optionalRecord(regionConfigs[0]);
  const electableSpecs = optionalRecord(firstRegionConfig?.electableSpecs);

  return {
    id: nullableString(record.id),
    name: requiredPayloadString(record.name, "cluster name"),
    groupId: nullableString(record.groupId),
    clusterType: nullableString(record.clusterType),
    mongoDBVersion: nullableString(record.mongoDBVersion),
    stateName: nullableString(record.stateName),
    paused: typeof record.paused === "boolean" ? record.paused : null,
    providerName: nullableString(firstRegionConfig?.providerName ?? record.providerName),
    backingProviderName: nullableString(firstRegionConfig?.backingProviderName),
    instanceSizeName: nullableString(electableSpecs?.instanceSize ?? record.instanceSizeName),
    regionName: nullableString(firstRegionConfig?.regionName ?? record.regionName),
    raw: record,
  };
}

function normalizeListMeta(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    links: Array.isArray(payload.links) ? payload.links.filter(isRecord) : [],
    totalCount: readNullableInteger(payload.totalCount),
  };
}

function requiredPayloadString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ProviderRequestError(502, `MongoDB Atlas returned an invalid ${label}`);
  }
  return value;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readNullableInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
