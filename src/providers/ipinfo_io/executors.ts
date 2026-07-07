import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { IpinfoIoActionName } from "./actions.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
} from "../../core/cast.ts";
import {
  createProviderProxyUrl,
  defineApiKeyProviderExecutors,
  normalizeProviderProxyEndpoint,
  normalizeProviderProxyHeaders,
  providerUserAgent,
  ProviderRequestError,
  readProviderProxyResponse,
  requireApiKeyCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";

const service = "ipinfo_io";
const ipinfoLegacyBaseUrl = "https://ipinfo.io";
const ipinfoLiteBaseUrl = "https://api.ipinfo.io/lite";
const ipinfoLookupBaseUrl = "https://api.ipinfo.io/lookup";
const ipinfoBatchLiteBaseUrl = "https://api.ipinfo.io";

const coreObjectFields = new Set(["geo", "as"]);
const coreNumberFields = new Set(["geo/latitude", "geo/longitude"]);
const coreBooleanFields = new Set(["is_anonymous", "is_anycast", "is_hosting", "is_mobile", "is_satellite"]);
const plusObjectFields = new Set(["geo", "as", "mobile", "anonymous"]);
const plusNumberFields = new Set(["geo/latitude", "geo/longitude", "geo/geoname_id", "geo/radius"]);
const plusBooleanFields = new Set([
  "anonymous/is_proxy",
  "anonymous/is_relay",
  "anonymous/is_tor",
  "anonymous/is_vpn",
  "is_anonymous",
  "is_anycast",
  "is_hosting",
  "is_mobile",
  "is_satellite",
]);

type IpinfoIoRequestPhase = "validate" | "execute";
type IpinfoIoActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type IpinfoIoActionHandler = (input: Record<string, unknown>, context: IpinfoIoActionContext) => Promise<unknown>;

export const ipinfoIoActionHandlers: Record<IpinfoIoActionName, IpinfoIoActionHandler> = {
  get_ip_info(input, context) {
    return getLiteIpInfo(input, context);
  },
  get_current_ip(_input, context) {
    return getLegacyTextFieldOutput("ip", "ip", "me", context);
  },
  get_current_ip_info(_input, context) {
    return getComprehensiveIpInfo("me", context);
  },
  get_current_loc(_input, context) {
    return getLegacyTextFieldOutput("location", "loc", "me", context);
  },
  get_current_region(_input, context) {
    return getLegacyTextFieldOutput("region", "region", "me", context);
  },
  get_ip_by_ip(input, context) {
    return getLegacyTextFieldOutput("ip", "ip", requireIp(input), context);
  },
  get_ip_info_by_ip(input, context) {
    return getComprehensiveIpInfo(requireIp(input), context);
  },
  get_location_by_ip(input, context) {
    return getLegacyTextFieldOutput("location", "loc", requireIp(input), context);
  },
  get_geo_by_ip(input, context) {
    return getGeoByIp(requireIp(input), context);
  },
  get_city_by_ip(input, context) {
    return getLegacyTextFieldOutput("city", "city", requireIp(input), context);
  },
  get_region_by_ip(input, context) {
    return getLegacyTextFieldOutput("region", "region", requireIp(input), context);
  },
  get_country_by_ip(input, context) {
    return getLegacyTextFieldOutput("country_code", "country", requireIp(input), context);
  },
  get_postal_by_ip(input, context) {
    return getLegacyTextFieldOutput("postal", "postal", requireIp(input), context);
  },
  get_timezone_by_ip(input, context) {
    return getLegacyTextFieldOutput("timezone", "timezone", requireIp(input), context);
  },
  get_hostname_by_ip(input, context) {
    return getLegacyTextFieldOutput("hostname", "hostname", requireIp(input), context);
  },
  get_org_by_ip(input, context) {
    return getLegacyTextFieldOutput("org", "org", requireIp(input), context);
  },
  get_company_info(input, context) {
    return getCompanyInfo(requireIp(input), context);
  },
  get_carrier_info(input, context) {
    return getCarrierInfo(requireIp(input), context);
  },
  get_privacy_details(input, context) {
    return getPrivacyDetails(requireIp(input), context);
  },
  get_abuse_contact(input, context) {
    return getAbuseContact(requireIp(input), context);
  },
  get_lite_field_by_ip(input, context) {
    return getLiteFieldByIp(input, context);
  },
  get_core_field_by_me(input, context) {
    return getCoreFieldByMe(input, context);
  },
  get_plus_field_by_me(input, context) {
    return getPlusFieldByMe(input, context);
  },
  batch_lookup(input, context) {
    return batchLookup(input, context);
  },
  batch_lite_lookup(input, context) {
    return batchLiteLookup(input, context);
  },
  map_ips(input, context) {
    return mapIps(input, context);
  },
  get_token_info(_input, context) {
    return getTokenInfo(context, "execute");
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, ipinfoIoActionHandlers);

export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    const credential = await requireApiKeyCredential(context, service);
    const endpoint = normalizeProviderProxyEndpoint(input.endpoint);
    const { baseUrl, endpoint: proxiedEndpoint, authInQuery } = resolveIpinfoProxyTarget(endpoint);
    const url = createProviderProxyUrl(baseUrl, proxiedEndpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("user-agent", providerUserAgent);
    if (authInQuery) {
      url.searchParams.set("token", credential.apiKey);
    } else {
      headers.set("authorization", `Bearer ${credential.apiKey}`);
    }

    const init: RequestInit = {
      method: input.method,
      headers,
      signal: context.signal,
    };
    if (input.body !== undefined) {
      init.body = typeof input.body === "string" ? input.body : JSON.stringify(input.body);
      if (!headers.has("content-type") && typeof input.body !== "string") {
        headers.set("content-type", "application/json");
      }
    }

    const response = await fetch(url, init);
    if (!response.ok) {
      throw createIpinfoError(response, await readIpinfoPayload(response, true), "execute");
    }

    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "ipinfo request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const tokenInfo = await getTokenInfo(
      {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      "validate",
    );
    const requests = optionalRecord(tokenInfo.requests);
    return {
      profile: {
        accountId: "api_key",
        displayName: optionalString(tokenInfo.name) ?? optionalString(tokenInfo.email) ?? "IPinfo API Token",
      },
      grantedScopes: [],
      metadata: compactObject({
        validationEndpoint: "/me",
        apiBaseUrl: ipinfoLegacyBaseUrl,
        requestsDay: optionalInteger(requests?.day),
        requestsMonth: optionalInteger(requests?.month),
        requestsLimit: optionalInteger(requests?.limit),
        requestsRemaining: optionalInteger(requests?.remaining),
        features: optionalRecord(tokenInfo.features),
      }),
    };
  },
};

function resolveIpinfoProxyTarget(endpoint: string): { baseUrl: string; endpoint: string; authInQuery?: boolean } {
  if (endpoint === "/me") {
    return { baseUrl: ipinfoLegacyBaseUrl, endpoint, authInQuery: true };
  }
  if (endpoint === "/lite" || endpoint.startsWith("/lite/")) {
    return { baseUrl: ipinfoLiteBaseUrl, endpoint: endpoint.slice("/lite".length) || "/" };
  }
  if (endpoint === "/lookup" || endpoint.startsWith("/lookup/")) {
    return { baseUrl: ipinfoLookupBaseUrl, endpoint: endpoint.slice("/lookup".length) || "/" };
  }
  if (endpoint === "/batch/lite" || endpoint.startsWith("/batch/lite/")) {
    return { baseUrl: ipinfoBatchLiteBaseUrl, endpoint };
  }
  return { baseUrl: ipinfoLegacyBaseUrl, endpoint };
}

async function getLiteIpInfo(
  input: Record<string, unknown>,
  context: IpinfoIoActionContext,
): Promise<Record<string, unknown>> {
  const ip = optionalString(input.ip) ?? "me";
  const liteInfo = await lookupLiteInfo(ip, context);
  if (liteInfo.bogon === true) {
    return liteInfo;
  }

  const legacyProfile = await lookupLegacyIpProfile(ip, context, false);
  return compactObject({
    ...liteInfo,
    hostname: optionalString(legacyProfile.hostname),
  });
}

async function getComprehensiveIpInfo(ip: string, context: IpinfoIoActionContext): Promise<Record<string, unknown>> {
  const legacyProfile = await lookupLegacyIpProfile(ip, context, true);
  return normalizeComprehensiveInfo(legacyProfile);
}

async function getGeoByIp(ip: string, context: IpinfoIoActionContext): Promise<Record<string, unknown>> {
  const payload = await ipinfoRequest({
    baseUrl: ipinfoLookupBaseUrl,
    pathSegments: [ip, "geo"],
    context,
    phase: "execute",
    expectJson: true,
  });

  return normalizeGeoPayload(requireRecord(payload, "ipinfo geo response"));
}

async function getCompanyInfo(ip: string, context: IpinfoIoActionContext): Promise<Record<string, unknown>> {
  const legacyProfile = await lookupLegacyIpProfile(ip, context, false);
  return normalizeCompanyPayload(optionalRecord(legacyProfile.company));
}

async function getCarrierInfo(ip: string, context: IpinfoIoActionContext): Promise<Record<string, unknown>> {
  const legacyProfile = await lookupLegacyIpProfile(ip, context, false);
  return {
    carrier: normalizeCarrierPayload(optionalRecord(legacyProfile.carrier)),
  };
}

async function getPrivacyDetails(ip: string, context: IpinfoIoActionContext): Promise<Record<string, unknown>> {
  const legacyProfile = await lookupLegacyIpProfile(ip, context, false);
  return normalizePrivacyPayload(optionalRecord(legacyProfile.privacy));
}

async function getAbuseContact(ip: string, context: IpinfoIoActionContext): Promise<Record<string, unknown>> {
  const legacyProfile = await lookupLegacyIpProfile(ip, context, false);
  return {
    abuse: normalizeAbusePayload(optionalRecord(legacyProfile.abuse)),
  };
}

async function getLiteFieldByIp(
  input: Record<string, unknown>,
  context: IpinfoIoActionContext,
): Promise<Record<string, unknown>> {
  const value = await getLiteFieldValue(requireIp(input), requireField(input), context);
  return { value };
}

async function getCoreFieldByMe(
  input: Record<string, unknown>,
  context: IpinfoIoActionContext,
): Promise<Record<string, unknown>> {
  const field = requireField(input);
  const value =
    field === "hostname"
      ? await legacyTextField("me", "hostname", context)
      : await getLookupFieldValue("me", field, "core", context);
  return { value };
}

async function getPlusFieldByMe(
  input: Record<string, unknown>,
  context: IpinfoIoActionContext,
): Promise<Record<string, unknown>> {
  const value = await getLookupFieldValue("me", requireField(input), "plus", context);
  return { value };
}

async function batchLookup(input: Record<string, unknown>, context: IpinfoIoActionContext): Promise<unknown> {
  const ips = readStringArray(input.ips, "ips");
  const filter = optionalBoolean(input.filter);
  const payload = await ipinfoRequest({
    baseUrl: ipinfoLegacyBaseUrl,
    pathSegments: ["batch"],
    context,
    phase: "execute",
    expectJson: true,
    method: "POST",
    body: ips,
    query: compactObject({
      filter: filter === true ? 1 : undefined,
    }),
  });

  return requireRecord(payload, "ipinfo batch response");
}

async function batchLiteLookup(input: Record<string, unknown>, context: IpinfoIoActionContext): Promise<unknown> {
  const payload = await ipinfoRequest({
    baseUrl: ipinfoBatchLiteBaseUrl,
    pathSegments: ["batch", "lite"],
    context,
    phase: "execute",
    expectJson: true,
    method: "POST",
    body: readStringArray(input.queries, "queries"),
  });

  return requireRecord(payload, "ipinfo lite batch response");
}

async function mapIps(
  input: Record<string, unknown>,
  context: IpinfoIoActionContext,
): Promise<Record<string, unknown>> {
  const payload = await ipinfoRequest({
    baseUrl: ipinfoLegacyBaseUrl,
    pathSegments: ["tools", "map"],
    context,
    phase: "execute",
    expectJson: true,
    method: "POST",
    body: resolveMapIpAddresses(input),
    query: {
      cli: optionalInteger(input.cli) ?? 1,
    },
  });

  const record = requireRecord(payload, "ipinfo map response");
  const status = optionalString(record.status);
  const reportUrl = optionalString(record.reportUrl);
  if (!status || !reportUrl) {
    throw new ProviderRequestError(502, "ipinfo map response is missing required fields", payload);
  }

  return {
    status,
    reportUrl,
  };
}

async function getTokenInfo(
  context: IpinfoIoActionContext,
  phase: IpinfoIoRequestPhase,
): Promise<Record<string, unknown>> {
  const payload = await ipinfoRequest({
    baseUrl: ipinfoLegacyBaseUrl,
    pathSegments: ["me"],
    context,
    phase,
    expectJson: true,
    authInQuery: true,
  });

  return requireRecord(payload, "ipinfo token response");
}

async function lookupLiteInfo(ip: string, context: IpinfoIoActionContext): Promise<Record<string, unknown>> {
  const payload = await ipinfoRequest({
    baseUrl: ipinfoLiteBaseUrl,
    pathSegments: [ip],
    context,
    phase: "execute",
    expectJson: true,
  });

  const record = requireRecord(payload, "ipinfo lite response");
  return compactObject({
    ip: optionalString(record.ip) ?? ip,
    bogon: optionalBoolean(record.bogon),
    asn: optionalString(record.asn),
    as_name: optionalString(record.as_name),
    as_domain: optionalString(record.as_domain),
    country: optionalString(record.country),
    country_code: optionalString(record.country_code),
    continent: optionalString(record.continent),
    continent_code: optionalString(record.continent_code),
  });
}

async function lookupLegacyIpProfile(
  ip: string,
  context: IpinfoIoActionContext,
  enrichAsn: boolean,
): Promise<Record<string, unknown>> {
  const payload = await ipinfoRequest({
    baseUrl: ipinfoLegacyBaseUrl,
    pathSegments: [ip, "json"],
    context,
    phase: "execute",
    expectJson: true,
  });

  const record = requireRecord(payload, "ipinfo legacy response");
  if (!enrichAsn) {
    return record;
  }

  const asnSummary = optionalRecord(record.asn);
  const asnId = optionalString(asnSummary?.asn);
  if (!asnSummary || !asnId) {
    return record;
  }

  const asnPayload = await ipinfoRequest({
    baseUrl: ipinfoLegacyBaseUrl,
    pathSegments: [asnId, "json"],
    context,
    phase: "execute",
    expectJson: true,
  });

  return {
    ...record,
    asn: {
      ...requireRecord(asnPayload, "ipinfo ASN response"),
      route: optionalString(asnSummary.route),
    },
  };
}

async function getLiteFieldValue(ip: string, field: string, context: IpinfoIoActionContext): Promise<string> {
  return ipinfoTextRequest({
    baseUrl: ipinfoLiteBaseUrl,
    pathSegments: [ip, field],
    context,
    phase: "execute",
  });
}

async function getLookupFieldValue(
  ip: string,
  field: string,
  apiFamily: "core" | "plus",
  context: IpinfoIoActionContext,
): Promise<unknown> {
  const value = await ipinfoRequest({
    baseUrl: ipinfoLookupBaseUrl,
    pathSegments: [ip, ...field.split("/")],
    context,
    phase: "execute",
    expectJson: false,
  });

  if (typeof value !== "string") {
    return value;
  }

  const normalizedField = field.trim();
  const trimmedValue = value.trim();
  if (isLookupObjectField(normalizedField, apiFamily)) {
    return parseJsonValue(trimmedValue);
  }
  if (isLookupNumberField(normalizedField, apiFamily)) {
    const parsed = Number(trimmedValue);
    if (Number.isNaN(parsed)) {
      throw new ProviderRequestError(502, `ipinfo field ${normalizedField} did not return a numeric value`, value);
    }
    return parsed;
  }
  if (isLookupBooleanField(normalizedField, apiFamily)) {
    if (trimmedValue === "true") {
      return true;
    }
    if (trimmedValue === "false") {
      return false;
    }
    throw new ProviderRequestError(502, `ipinfo field ${normalizedField} did not return a boolean value`, value);
  }
  return trimmedValue;
}

async function getLegacyTextFieldOutput(
  outputKey: string,
  field: string,
  ip: string,
  context: IpinfoIoActionContext,
): Promise<Record<string, unknown>> {
  return {
    [outputKey]: await legacyTextField(ip, field, context),
  };
}

async function legacyTextField(ip: string, field: string, context: IpinfoIoActionContext): Promise<string> {
  return ipinfoTextRequest({
    baseUrl: ipinfoLegacyBaseUrl,
    pathSegments: [ip, field],
    context,
    phase: "execute",
  });
}

function normalizeGeoPayload(record: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    city: optionalString(record.city),
    region: optionalString(record.region),
    region_code: optionalString(record.region_code),
    country: optionalString(record.country),
    country_code: optionalString(record.country_code),
    continent: optionalString(record.continent),
    continent_code: optionalString(record.continent_code),
    latitude: optionalNumber(record.latitude),
    longitude: optionalNumber(record.longitude),
    timezone: optionalString(record.timezone),
    postal_code: optionalString(record.postal_code),
    dma_code: optionalString(record.dma_code),
    geoname_id: optionalInteger(record.geoname_id),
    radius: optionalInteger(record.radius),
    last_changed: optionalString(record.last_changed),
  });
}

function normalizeComprehensiveInfo(record: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    ip: optionalString(record.ip),
    hostname: optionalString(record.hostname),
    bogon: optionalBoolean(record.bogon),
    anycast: optionalBoolean(record.anycast),
    city: optionalString(record.city),
    region: optionalString(record.region),
    country: optionalString(record.country),
    loc: optionalString(record.loc),
    org: optionalString(record.org),
    postal: optionalString(record.postal),
    timezone: optionalString(record.timezone),
    asn: normalizeAsnPayload(optionalRecord(record.asn)),
    company: undefinedIfEmptyObject(normalizeCompanyPayload(optionalRecord(record.company))),
    carrier: undefinedIfEmptyObject(normalizeCarrierPayload(optionalRecord(record.carrier))),
    privacy: undefinedIfEmptyObject(normalizePrivacyPayload(optionalRecord(record.privacy))),
    abuse: undefinedIfEmptyObject(normalizeAbusePayload(optionalRecord(record.abuse))),
    domains: normalizeDomainsPayload(optionalRecord(record.domains)),
  });
}

function normalizeAsnPayload(record: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!record) {
    return undefined;
  }

  return compactObject({
    asn: optionalString(record.asn),
    name: optionalString(record.name),
    domain: optionalString(record.domain),
    route: optionalString(record.route),
    type: optionalString(record.type),
    country: optionalString(record.country),
    allocated: optionalString(record.allocated),
    registry: optionalString(record.registry),
    num_ips: optionalInteger(record.num_ips),
    prefixes: Array.isArray(record.prefixes) ? record.prefixes : undefined,
    prefixes6: Array.isArray(record.prefixes6) ? record.prefixes6 : undefined,
    peers: Array.isArray(record.peers) ? record.peers.map((item) => String(item)) : undefined,
    upstreams: Array.isArray(record.upstreams) ? record.upstreams.map((item) => String(item)) : undefined,
    downstreams: Array.isArray(record.downstreams) ? record.downstreams.map((item) => String(item)) : undefined,
  });
}

function normalizeCompanyPayload(record: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!record) {
    return {};
  }

  return compactObject({
    name: optionalString(record.name),
    domain: optionalString(record.domain),
    type: optionalString(record.type),
  });
}

function normalizeCarrierPayload(record: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!record) {
    return {};
  }

  return compactObject({
    name: optionalString(record.name),
    mcc: optionalString(record.mcc),
    mnc: optionalString(record.mnc),
  });
}

function normalizePrivacyPayload(record: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!record) {
    return {};
  }

  return compactObject({
    vpn: optionalBoolean(record.vpn),
    proxy: optionalBoolean(record.proxy),
    tor: optionalBoolean(record.tor),
    relay: optionalBoolean(record.relay),
    hosting: optionalBoolean(record.hosting),
    service: optionalString(record.service),
  });
}

function normalizeAbusePayload(record: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!record) {
    return {};
  }

  return compactObject({
    address: optionalString(record.address),
    country: optionalString(record.country),
    email: optionalString(record.email),
    name: optionalString(record.name),
    network: optionalString(record.network),
    phone: optionalString(record.phone),
  });
}

function normalizeDomainsPayload(record: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!record) {
    return undefined;
  }

  return compactObject({
    ip: optionalString(record.ip),
    total: optionalInteger(record.total),
    domains: Array.isArray(record.domains) ? record.domains.map((item) => String(item)) : undefined,
  });
}

function undefinedIfEmptyObject(value: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!value) {
    return undefined;
  }

  return Object.keys(value).length === 0 ? undefined : value;
}

async function ipinfoTextRequest(input: {
  baseUrl: string;
  pathSegments: string[];
  context: IpinfoIoActionContext;
  phase: IpinfoIoRequestPhase;
}): Promise<string> {
  const payload = await ipinfoRequest({
    ...input,
    expectJson: false,
  });

  if (typeof payload !== "string") {
    if (typeof payload === "number" || typeof payload === "boolean") {
      return String(payload);
    }
    throw new ProviderRequestError(502, "ipinfo text response returned JSON data", payload);
  }

  return payload.trim();
}

async function ipinfoRequest(input: {
  baseUrl: string;
  pathSegments: string[];
  context: IpinfoIoActionContext;
  phase: IpinfoIoRequestPhase;
  expectJson: boolean;
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  authInQuery?: boolean;
}): Promise<unknown> {
  const url = buildIpinfoUrl(
    input.baseUrl,
    input.pathSegments,
    input.query,
    input.authInQuery ? input.context.apiKey : undefined,
  );
  const response = await input.context.fetcher(url, {
    method: input.method ?? "GET",
    headers: buildIpinfoHeaders(input.context.apiKey, input.expectJson, input.body !== undefined, input.authInQuery),
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
    signal: input.context.signal,
  });

  const payload = await readIpinfoPayload(response, input.expectJson);
  if (!response.ok) {
    throw createIpinfoError(response, payload, input.phase);
  }

  return payload;
}

function buildIpinfoUrl(
  baseUrl: string,
  pathSegments: string[],
  query: Record<string, string | number | boolean | undefined> = {},
  queryToken?: string,
): URL {
  const url = new URL(baseUrl);
  if (pathSegments.length > 0) {
    const prefix = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
    url.pathname = `${prefix}${pathSegments.map((segment) => encodeURIComponent(segment)).join("/")}`;
  }

  if (queryToken) {
    url.searchParams.set("token", queryToken);
  }

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  return url;
}

function buildIpinfoHeaders(
  apiKey: string,
  expectJson: boolean,
  hasBody: boolean,
  authInQuery = false,
): Record<string, string> {
  const headers: Record<string, string> = {
    accept: expectJson ? "application/json" : "text/plain",
    "user-agent": providerUserAgent,
  };

  if (!authInQuery) {
    headers.authorization = `Bearer ${apiKey}`;
  }

  if (hasBody) {
    headers["content-type"] = "application/json";
  }

  return headers;
}

async function readIpinfoPayload(response: Response, expectJson: boolean): Promise<unknown> {
  const text = await response.text();
  if (text === "") {
    return expectJson ? {} : "";
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return parseJsonValue(text);
  }

  if (!expectJson) {
    return text;
  }

  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return parseJsonValue(trimmed);
  }
  return text;
}

function parseJsonValue(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new ProviderRequestError(502, "ipinfo returned invalid JSON");
  }
}

function createIpinfoError(response: Response, payload: unknown, phase: IpinfoIoRequestPhase): ProviderRequestError {
  const message =
    extractIpinfoErrorMessage(payload) ?? response.statusText ?? `ipinfo request failed with status ${response.status}`;

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && response.status === 401) {
    return new ProviderRequestError(401, message, payload);
  }
  if (response.status === 400 || response.status === 404) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 403) {
    return new ProviderRequestError(403, message, payload);
  }
  return new ProviderRequestError(response.status || 500, message, payload);
}

function extractIpinfoErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload.trim();
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return (
    optionalString(record.error) ??
    optionalString(record.message) ??
    optionalString(record.detail) ??
    optionalString(record.error_message)
  );
}

function requireIp(input: Record<string, unknown>): string {
  const ip = optionalString(input.ip);
  if (!ip) {
    throw new ProviderRequestError(400, "ip is required");
  }
  return ip;
}

function requireField(input: Record<string, unknown>): string {
  const field = optionalString(input.field);
  if (!field) {
    throw new ProviderRequestError(400, "field is required");
  }
  return field;
}

function resolveMapIpAddresses(input: Record<string, unknown>): string[] {
  return readStringArray(input.ipAddresses, "ipAddresses");
}

function readStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, `${fieldName} must be an array`);
  }
  return value.map((item) => String(item));
}

function requireRecord(value: unknown, context: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${context} did not return an object`, value);
  }
  return record;
}

function isLookupObjectField(field: string, apiFamily: "core" | "plus"): boolean {
  return (apiFamily === "core" ? coreObjectFields : plusObjectFields).has(field);
}

function isLookupNumberField(field: string, apiFamily: "core" | "plus"): boolean {
  return (apiFamily === "core" ? coreNumberFields : plusNumberFields).has(field);
}

function isLookupBooleanField(field: string, apiFamily: "core" | "plus"): boolean {
  return (apiFamily === "core" ? coreBooleanFields : plusBooleanFields).has(field);
}
