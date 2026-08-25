import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
  ProxyExecutionResult,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { optionalInteger, optionalRawString, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderFetch,
  createProviderProxyUrl,
  providerUserAgent,
  createProviderTimeout,
  defineProviderExecutors,
  normalizeProviderProxyHeaders,
  ProviderRequestError,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  readProviderTextBody,
  requireCustomCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";

const service = "gagelist";
const gagelistApiBaseUrl = "https://gagelist.net/GageList/api";
const gagelistTokenUrl = "https://gagelist.net/api/token";

const gagelistRequestTimeoutMs = 30_000;
const gagelistMaxResponseBytes = 10 * 1024 * 1024;
const gagelistFetch = createProviderFetch({ skipDnsValidation: true });

interface GagelistCredential {
  readonly clientId: string;
  readonly clientSecret: string;
}

type GagelistPhase = "validate" | "execute";

interface GagelistActionContext {
  readonly credential: GagelistCredential;
  readonly fetcher: typeof fetch;
  readonly signal?: AbortSignal;
}

interface GagelistActionHandler {
  (input: Record<string, unknown>, context: GagelistActionContext): Promise<unknown>;
}

interface GagelistRequestInput {
  readonly accessToken: string;
  readonly path: string;
  readonly fetcher: typeof fetch;
  readonly operation: string;
  readonly method?: "GET" | "POST";
  readonly query?: Record<string, string | number | undefined>;
  readonly body?: Record<string, unknown>;
  readonly signal?: AbortSignal;
}

export const gagelistActionHandlers: ProviderActionHandlers<"gagelist", GagelistActionHandler> = {
  async get_account_status(_input, context) {
    const accessToken = await exchangeGagelistAccessToken(
      context.credential,
      context.fetcher,
      "execute",
      context.signal,
    );
    return normalizeAccountStatus(
      await requestGagelistJson({
        accessToken,
        path: "/Account/Status",
        fetcher: context.fetcher,
        operation: "get account status",
        signal: context.signal,
      }),
    );
  },
  async get_account_settings(_input, context) {
    const accessToken = await exchangeGagelistAccessToken(
      context.credential,
      context.fetcher,
      "execute",
      context.signal,
    );
    const payload = readEnvelope(
      await requestGagelistJson({
        accessToken,
        path: "/Account/Settings",
        fetcher: context.fetcher,
        operation: "get account settings",
        signal: context.signal,
      }),
      "account settings",
    );
    return {
      success: payload.success,
      message: payload.message,
      settings: requireObject(payload.data, "GageList account settings response is missing data"),
      raw: payload.raw,
    };
  },
  async list_manufacturers(_input, context) {
    const accessToken = await exchangeGagelistAccessToken(
      context.credential,
      context.fetcher,
      "execute",
      context.signal,
    );
    const payload = readListEnvelope(
      await requestGagelistJson({
        accessToken,
        path: "/Manufacturer/List",
        method: "POST",
        fetcher: context.fetcher,
        operation: "list manufacturers",
        signal: context.signal,
      }),
      "manufacturer list",
    );
    return {
      total: payload.total,
      count: payload.count,
      manufacturers: payload.items.map(normalizeManufacturer),
      success: payload.success,
      message: payload.message,
      raw: payload.raw,
    };
  },
  async create_manufacturer(input, context) {
    const accessToken = await exchangeGagelistAccessToken(
      context.credential,
      context.fetcher,
      "execute",
      context.signal,
    );
    const payload = readEnvelope(
      await requestGagelistJson({
        accessToken,
        path: "/Manufacturer/Create",
        method: "POST",
        body: {
          Id: 0,
          ...buildManufacturerBody(input),
        },
        fetcher: context.fetcher,
        operation: "create manufacturer",
        signal: context.signal,
      }),
      "create manufacturer",
    );
    return {
      id: nullableInteger(payload.data),
      success: payload.success,
      message: payload.message,
      raw: payload.raw,
    };
  },
  async update_manufacturer(input, context) {
    const accessToken = await exchangeGagelistAccessToken(
      context.credential,
      context.fetcher,
      "execute",
      context.signal,
    );
    const payload = readEnvelope(
      await requestGagelistJson({
        accessToken,
        path: "/Manufacturer/Update",
        method: "POST",
        body: {
          Id: requiredPositiveInteger(input.id, "id"),
          ...buildManufacturerBody(input),
        },
        fetcher: context.fetcher,
        operation: "update manufacturer",
        signal: context.signal,
      }),
      "update manufacturer",
    );
    return {
      id: nullableInteger(payload.data),
      success: payload.success,
      message: payload.message,
      raw: payload.raw,
    };
  },
  async delete_manufacturer(input, context) {
    const accessToken = await exchangeGagelistAccessToken(
      context.credential,
      context.fetcher,
      "execute",
      context.signal,
    );
    const id = requiredPositiveInteger(input.id, "id");
    const payload = readEnvelope(
      await requestGagelistJson({
        accessToken,
        path: `/Manufacturer/Delete/${encodeURIComponent(String(id))}`,
        method: "POST",
        fetcher: context.fetcher,
        operation: "delete manufacturer",
        signal: context.signal,
      }),
      "delete manufacturer",
    );
    return {
      id: nullableInteger(payload.data),
      success: payload.success,
      message: payload.message,
      raw: payload.raw,
    };
  },
  async list_gage_records(input, context) {
    const accessToken = await exchangeGagelistAccessToken(
      context.credential,
      context.fetcher,
      "execute",
      context.signal,
    );
    const payload = readListEnvelope(
      await requestGagelistJson({
        accessToken,
        path: "/Gage/List",
        method: "POST",
        query: listQuery(input),
        fetcher: context.fetcher,
        operation: "list gage records",
        signal: context.signal,
      }),
      "gage record list",
    );
    return {
      total: payload.total,
      count: payload.count,
      gageRecords: payload.items.map(normalizeGageRecord),
      success: payload.success,
      message: payload.message,
      raw: payload.raw,
    };
  },
  async get_gage_record(input, context) {
    const accessToken = await exchangeGagelistAccessToken(
      context.credential,
      context.fetcher,
      "execute",
      context.signal,
    );
    const id = requiredPositiveInteger(input.id, "id");
    const payload = readEnvelope(
      await requestGagelistJson({
        accessToken,
        path: `/Gage/Detail/${encodeURIComponent(String(id))}`,
        fetcher: context.fetcher,
        operation: "get gage record",
        signal: context.signal,
      }),
      "gage record detail",
    );
    return {
      gageRecord: normalizeGageRecord(requireObject(payload.data, "GageList gage record response is missing data")),
      success: payload.success,
      message: payload.message,
      raw: payload.raw,
    };
  },
  async list_calibration_records(input, context) {
    const accessToken = await exchangeGagelistAccessToken(
      context.credential,
      context.fetcher,
      "execute",
      context.signal,
    );
    const payload = readListEnvelope(
      await requestGagelistJson({
        accessToken,
        path: "/Calibration/List",
        method: "POST",
        query: listQuery(input),
        fetcher: context.fetcher,
        operation: "list calibration records",
        signal: context.signal,
      }),
      "calibration record list",
    );
    return {
      total: payload.total,
      count: payload.count,
      calibrationRecords: payload.items.map(normalizeCalibrationRecord),
      success: payload.success,
      message: payload.message,
      raw: payload.raw,
    };
  },
  async get_calibration_record(input, context) {
    const accessToken = await exchangeGagelistAccessToken(
      context.credential,
      context.fetcher,
      "execute",
      context.signal,
    );
    const id = requiredPositiveInteger(input.id, "id");
    const payload = readEnvelope(
      await requestGagelistJson({
        accessToken,
        path: `/Calibration/Detail/${encodeURIComponent(String(id))}`,
        fetcher: context.fetcher,
        operation: "get calibration record",
        signal: context.signal,
      }),
      "calibration record detail",
    );
    return {
      calibrationRecord: normalizeCalibrationRecord(
        requireObject(payload.data, "GageList calibration record response is missing data"),
      ),
      success: payload.success,
      message: payload.message,
      raw: payload.raw,
    };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<GagelistActionContext>({
  service,
  handlers: gagelistActionHandlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher): Promise<GagelistActionContext> {
    const credential = await requireCustomCredential(context, service);
    return {
      credential: readGagelistCredential(credential.values),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = async (input, context): Promise<ProxyExecutionResult> => {
  try {
    const credential = await requireCustomCredential(context, service);
    const accessToken = await exchangeGagelistAccessToken(
      readGagelistCredential(credential.values),
      gagelistFetch,
      "execute",
      context.signal,
    );
    const url = createProviderProxyUrl(gagelistApiBaseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("accept", "application/json");
    headers.set("authorization", `Bearer ${accessToken}`);
    headers.set("user-agent", providerUserAgent);
    if (input.body !== undefined && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    const response = await gagelistFetch(url, {
      method: input.method,
      headers,
      body:
        input.body === undefined ? undefined : typeof input.body === "string" ? input.body : JSON.stringify(input.body),
      signal: context.signal,
    });
    if (!response.ok) {
      const text = await readProviderProxyErrorMessage(response, "");
      throw new ProviderRequestError(response.status, text || `provider request failed with HTTP ${response.status}`);
    }
    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "provider request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  async customCredential(input, { fetcher, signal }) {
    const credential = readGagelistCredential(input.values);
    const accessToken = await exchangeGagelistAccessToken(credential, fetcher, "validate", signal);
    const status = normalizeAccountStatus(
      await requestGagelistJson({
        accessToken,
        path: "/Account/Status",
        fetcher,
        operation: "get account status",
        phase: "validate",
        signal,
      }),
    );
    const accountLabel = status.siteName ?? status.enterpriseName ?? "GageList API Client";
    return {
      profile: {
        accountId: `gagelist:${credential.clientId}`,
        displayName: accountLabel,
      },
      grantedScopes: status.roles,
      metadata: {
        apiBaseUrl: gagelistApiBaseUrl,
        tokenEndpoint: gagelistTokenUrl,
        siteName: status.siteName,
        enterpriseName: status.enterpriseName,
      },
    };
  },
};

async function exchangeGagelistAccessToken(
  credential: GagelistCredential,
  fetcher: typeof fetch,
  phase: GagelistPhase,
  signal?: AbortSignal,
) {
  const form = new URLSearchParams({
    grant_type: "password",
    client_id: credential.clientId,
    client_secret: credential.clientSecret,
  });
  const response = await fetchGagelistResponse({
    fetcher,
    url: gagelistTokenUrl,
    init: {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": providerUserAgent,
      },
      body: form.toString(),
    },
    operation: "exchange access token",
    signal,
  });
  const payload = await readGagelistPayload(response, "access token");
  if (!response.ok) {
    throw createGagelistError(response.status, payload, phase, "access token exchange");
  }
  const tokenResponse = optionalRecord(payload);
  const accessToken = optionalString(tokenResponse?.access_token)?.trim();
  if (!accessToken) {
    throw new ProviderRequestError(502, "GageList access token is missing");
  }
  return accessToken;
}

function readGagelistCredential(input: Record<string, string>): GagelistCredential {
  return {
    clientId: requiredString(input.clientId, "clientId"),
    clientSecret: requiredString(input.clientSecret, "clientSecret"),
  };
}

async function requestGagelistJson(input: GagelistRequestInput & { phase?: GagelistPhase }) {
  const url = new URL(`${gagelistApiBaseUrl}${input.path}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value != null) {
      url.searchParams.set(key, String(value));
    }
  }

  const headers = new Headers({
    accept: "application/json",
    authorization: `Bearer ${input.accessToken}`,
    "user-agent": providerUserAgent,
  });
  if (input.body != null) {
    headers.set("content-type", "application/json; charset=utf-8");
  }

  const response = await fetchGagelistResponse({
    fetcher: input.fetcher,
    url,
    init: {
      method: input.method ?? "GET",
      headers,
      body: input.body == null ? undefined : JSON.stringify(input.body),
    },
    operation: input.operation,
    signal: input.signal,
  });
  const payload = await readGagelistPayload(response, input.operation);
  if (!response.ok) {
    throw createGagelistError(response.status, payload, input.phase ?? "execute", input.operation);
  }
  return payload;
}

async function fetchGagelistResponse(input: {
  readonly fetcher: typeof fetch;
  readonly url: string | URL;
  readonly init: RequestInit;
  readonly operation: string;
  readonly signal?: AbortSignal;
}) {
  const timeout = createProviderTimeout(input.signal, gagelistRequestTimeoutMs);
  try {
    return await input.fetcher(input.url, { ...input.init, signal: timeout.signal });
  } catch (error) {
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, `GageList ${input.operation} request timed out`);
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new ProviderRequestError(502, `GageList ${input.operation} request failed: ${message}`);
  } finally {
    timeout.cleanup();
  }
}

async function readGagelistPayload(response: Response, operation: string) {
  const text = await readProviderTextBody(response, "GageList response", gagelistMaxResponseBytes);
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, `GageList ${operation} returned malformed JSON`);
    }
    return text;
  }
}

function readEnvelope(payload: unknown, operation: string) {
  const raw = requireObject(payload, `GageList ${operation} returned an invalid response`);
  const success = raw.success;
  if (success !== true) {
    throw new ProviderRequestError(502, optionalRawString(raw.message) ?? `GageList ${operation} was not successful`);
  }
  return {
    success,
    message: optionalRawString(raw.message) ?? null,
    data: raw.data,
    raw,
  };
}

function readListEnvelope(payload: unknown, operation: string) {
  const envelope = readEnvelope(payload, operation);
  if (!Array.isArray(envelope.data)) {
    throw new ProviderRequestError(502, `GageList ${operation} response is missing data`);
  }
  return {
    ...envelope,
    total: nullableInteger(envelope.raw.total),
    count: nullableInteger(envelope.raw.count),
    items: envelope.data.map((item) => requireObject(item, `GageList ${operation} response contains an invalid item`)),
  };
}

function normalizeAccountStatus(payload: unknown) {
  const envelope = readEnvelope(payload, "account status");
  const accountStatus = requireObject(envelope.data, "GageList account status response is missing data");
  const requestedSite = optionalRecord(accountStatus.RequestedSite);
  const enterpriseInfo = optionalRecord(accountStatus.EnterpriseInfo);
  const roles = Array.isArray(accountStatus.Roles) ? accountStatus.Roles.map((role) => String(role)) : [];
  return {
    success: envelope.success,
    message: envelope.message,
    siteName: optionalRawString(requestedSite?.Name) ?? null,
    enterpriseName: optionalRawString(enterpriseInfo?.Name) ?? null,
    roles,
    accountStatus,
    raw: envelope.raw,
  };
}

function normalizeManufacturer(input: Record<string, unknown>) {
  return {
    id: nullableInteger(input.Id),
    name: optionalRawString(input.Name) ?? null,
    address: optionalRawString(input.Address) ?? null,
    phone: optionalRawString(input.Phone) ?? null,
    fax: optionalRawString(input.Fax) ?? null,
    website: optionalRawString(input.Website) ?? null,
    isDeleted: typeof input.IsDeleted == "boolean" ? input.IsDeleted : null,
    updatedDate: optionalRawString(input.UpdatedDate) ?? null,
    raw: input,
  };
}

function normalizeGageRecord(input: Record<string, unknown>) {
  return {
    id: nullableInteger(input.Id),
    serialNumber: optionalRawString(input.SerialNumber) ?? null,
    controlNumber: optionalRawString(input.ControlNumber) ?? null,
    status: optionalRawString(input.Status) ?? null,
    manufacturer: optionalRawString(input.Manufacturer) ?? null,
    model: optionalRawString(input.Model) ?? null,
    calibrationDueDate: optionalRawString(input.CalibrationDueDate) ?? null,
    raw: input,
  };
}

function normalizeCalibrationRecord(input: Record<string, unknown>) {
  return {
    id: nullableInteger(input.Id),
    recordNumber: optionalRawString(input.RecordNumber) ?? null,
    equipmentRefId: nullableInteger(input.EquipmentRefId),
    serialNumber: optionalRawString(input.SerialNumber) ?? null,
    controlNumber: optionalRawString(input.ControlNumber) ?? null,
    calibrationDate: optionalRawString(input.CalibrationDate) ?? null,
    nextCalibrationDue: optionalRawString(input.NextCalibrationDue) ?? null,
    raw: input,
  };
}

function buildManufacturerBody(input: Record<string, unknown>) {
  return {
    Name: requiredString(input.name, "name"),
    Address: optionalString(input.address),
    Phone: optionalString(input.phone),
    Fax: optionalString(input.fax),
    Website: optionalString(input.website),
  };
}

function listQuery(input: Record<string, unknown>) {
  return {
    start: optionalInteger(input.start) ?? 0,
    record_number: optionalInteger(input.recordNumber) ?? 25,
  };
}

function requireObject(value: unknown, message: string) {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, message);
  }
  return object;
}

function requiredString(value: unknown, fieldName: string) {
  const text = optionalRawString(value)?.trim();
  if (!text) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return text;
}

function requiredPositiveInteger(value: unknown, fieldName: string) {
  const parsed = optionalInteger(value);
  if (parsed == null || parsed <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return parsed;
}

function nullableInteger(value: unknown) {
  return optionalInteger(value) ?? null;
}

function createGagelistError(status: number, payload: unknown, phase: GagelistPhase, operation: string) {
  const body = optionalRecord(payload);
  const message =
    optionalRawString(body?.error_description) ??
    optionalRawString(body?.error) ??
    optionalRawString(body?.message) ??
    `GageList ${operation} failed with HTTP ${status}`;
  if (phase == "validate" && (status == 400 || status == 401 || status == 403)) {
    return new ProviderRequestError(400, message);
  }
  if (status == 401 || status == 403) {
    return new ProviderRequestError(status, message);
  }
  return new ProviderRequestError(status >= 400 ? status : 502, message);
}
