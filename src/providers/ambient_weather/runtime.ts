import type { CredentialValidationResult } from "../../core/types.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const ambientWeatherApiBaseUrl = "https://rt.ambientweather.net";

type AmbientWeatherPhase = "validate" | "execute";

interface AmbientWeatherContext {
  apiKey: string;
  applicationKey: string;
  defaultDeviceMacAddress?: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type AmbientWeatherDevice = {
  macAddress: string;
  info: Record<string, unknown>;
  lastData: Record<string, unknown>;
};

type AmbientWeatherActionHandler = (
  input: Record<string, unknown>,
  context: AmbientWeatherContext,
) => Promise<unknown>;

export const ambientWeatherActionHandlers: Record<string, AmbientWeatherActionHandler> = {
  list_devices(_input, context) {
    return listAmbientWeatherDevices(context);
  },
  get_latest_device_data(input, context) {
    return getLatestAmbientWeatherDeviceData(input, context);
  },
  get_device_history(input, context) {
    return getAmbientWeatherDeviceHistory(input, context);
  },
};

export async function validateAmbientWeatherCredential(
  input: { apiKey: string; values: Record<string, string> },
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context: AmbientWeatherContext = {
    apiKey: requiredString(input.apiKey, "apiKey", providerInputError),
    applicationKey: requiredString(input.values.applicationKey, "applicationKey", providerInputError),
    fetcher,
    signal,
  };
  const devices = await fetchAmbientWeatherDevices(context, "validate");
  const firstDevice = devices[0];
  const firstDeviceName = readAmbientWeatherDeviceName(firstDevice);

  return {
    profile: {
      accountId: firstDevice?.macAddress ?? "ambient_weather",
      displayName: "Ambient Weather API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      applicationKey: context.applicationKey,
      validationEndpoint: "/v1/devices",
      deviceCount: devices.length,
      defaultDeviceMacAddress: devices.length === 1 ? firstDevice?.macAddress : undefined,
      firstDeviceName,
    }),
  };
}

async function listAmbientWeatherDevices(context: AmbientWeatherContext) {
  return {
    devices: await fetchAmbientWeatherDevices(context, "execute"),
  };
}

async function getLatestAmbientWeatherDeviceData(input: Record<string, unknown>, context: AmbientWeatherContext) {
  const device = await resolveAmbientWeatherDevice(input, context);
  const records = await fetchAmbientWeatherDeviceRecords(
    device.macAddress,
    {
      limit: 1,
    },
    context,
    "execute",
  );
  const record = records[0];
  if (!record) {
    throw new ProviderRequestError(502, `Ambient Weather returned no observation records for device ${device.macAddress}`);
  }

  return {
    device,
    record,
  };
}

async function getAmbientWeatherDeviceHistory(input: Record<string, unknown>, context: AmbientWeatherContext) {
  const device = await resolveAmbientWeatherDevice(input, context);
  const records = await fetchAmbientWeatherDeviceRecords(
    device.macAddress,
    {
      limit: optionalInteger(input.limit),
      endDate: normalizeAmbientWeatherEndDate(input.endDate),
    },
    context,
    "execute",
  );
  return {
    device,
    records,
  };
}

async function fetchAmbientWeatherDevices(
  context: AmbientWeatherContext,
  phase: AmbientWeatherPhase,
): Promise<AmbientWeatherDevice[]> {
  const payload = await requestAmbientWeatherJson(
    {
      path: "/v1/devices",
    },
    context,
    phase,
  );

  return normalizeAmbientWeatherDeviceArray(payload);
}

async function fetchAmbientWeatherDeviceRecords(
  macAddress: string,
  query: Record<string, string | number | undefined>,
  context: AmbientWeatherContext,
  phase: AmbientWeatherPhase,
) {
  const payload = await requestAmbientWeatherJson(
    {
      path: `/v1/devices/${encodeURIComponent(macAddress)}`,
      query,
    },
    context,
    phase,
  );

  return normalizeAmbientWeatherRecordArray(payload);
}

async function requestAmbientWeatherJson(
  input: {
    path: string;
    query?: Record<string, string | number | undefined>;
  },
  context: AmbientWeatherContext,
  phase: AmbientWeatherPhase,
) {
  const url = buildAmbientWeatherUrl(input.path, context, input.query);
  let response: Response;
  try {
    response = await context.fetcher(url, {
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal: context.signal,
    });
  } catch (error) {
    throw createAmbientWeatherTransportError(error);
  }
  const payload = await readAmbientWeatherResponsePayload(response);

  if (!response.ok) {
    throw createAmbientWeatherError(response, payload, phase);
  }

  return payload;
}

function buildAmbientWeatherUrl(
  path: string,
  context: Pick<AmbientWeatherContext, "apiKey" | "applicationKey">,
  query?: Record<string, string | number | undefined>,
) {
  const url = new URL(path, ambientWeatherApiBaseUrl);
  url.searchParams.set("apiKey", context.apiKey);
  url.searchParams.set("applicationKey", context.applicationKey);

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value != null) {
      url.searchParams.set(key, String(value));
    }
  }

  return url;
}

async function readAmbientWeatherResponsePayload(response: Response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createAmbientWeatherError(response: Response, payload: unknown, phase: AmbientWeatherPhase) {
  const message = readAmbientWeatherErrorMessage(payload) ?? "Ambient Weather request failed";

  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : response.status, message);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }

  return new ProviderRequestError(response.status || 500, message);
}

function createAmbientWeatherTransportError(error: unknown) {
  return new ProviderRequestError(
    error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError") ? 504 : 502,
    error instanceof Error
      ? `Ambient Weather request failed: ${error.message}`
      : "Ambient Weather request failed",
  );
}

function readAmbientWeatherErrorMessage(payload: unknown) {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.description);
}

function normalizeAmbientWeatherDeviceArray(payload: unknown): AmbientWeatherDevice[] {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "Ambient Weather devices response must be an array");
  }

  return payload.map((item, index) =>
    normalizeAmbientWeatherDevice(item, `Ambient Weather devices[${index}]`),
  );
}

function normalizeAmbientWeatherRecordArray(payload: unknown) {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "Ambient Weather device history response must be an array");
  }

  return payload.map((item, index) => ({
    ...requireAmbientWeatherObject(item, `Ambient Weather records[${index}]`),
  }));
}

function normalizeAmbientWeatherDevice(payload: unknown, label: string): AmbientWeatherDevice {
  const record = requireAmbientWeatherObject(payload, label);
  const macAddress = optionalString(record.macAddress);
  if (!macAddress) {
    throw new ProviderRequestError(502, `${label}.macAddress is required`);
  }

  return {
    macAddress,
    info: optionalRecord(record.info) ?? {},
    lastData: optionalRecord(record.lastData) ?? {},
  };
}

function requireAmbientWeatherObject(payload: unknown, label: string) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ProviderRequestError(502, `${label} must be an object`);
  }

  return payload as Record<string, unknown>;
}

function readAmbientWeatherDeviceName(device?: AmbientWeatherDevice) {
  return device ? optionalString(device.info.name) : undefined;
}

async function resolveAmbientWeatherDevice(
  input: Record<string, unknown>,
  context: AmbientWeatherContext,
): Promise<AmbientWeatherDevice> {
  const devices = await fetchAmbientWeatherDevices(context, "execute");
  const explicitMacAddress = optionalString(input.macAddress);
  if (explicitMacAddress) {
    const device = devices.find((candidate) => candidate.macAddress === explicitMacAddress);
    if (!device) {
      throw new ProviderRequestError(404, `Ambient Weather device not found: ${explicitMacAddress}`);
    }
    return device;
  }

  if (context.defaultDeviceMacAddress) {
    const device = devices.find((candidate) => candidate.macAddress === context.defaultDeviceMacAddress);
    if (device) {
      return device;
    }
  }

  if (devices.length === 1) {
    const device = devices[0];
    if (device) {
      return device;
    }
  }

  if (devices.length === 0) {
    throw new ProviderRequestError(400, "No Ambient Weather devices are available");
  }

  throw new ProviderRequestError(400, "macAddress is required when multiple Ambient Weather devices are connected");
}

function normalizeAmbientWeatherEndDate(value: unknown) {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      throw new ProviderRequestError(400, "endDate must be a valid ISO 8601 timestamp or Unix millisecond timestamp");
    }

    return value;
  }

  const endDate = optionalString(value);
  if (!endDate) {
    return undefined;
  }

  const timestamp = Date.parse(endDate);
  if (!Number.isFinite(timestamp)) {
    throw new ProviderRequestError(400, "endDate must be a valid ISO 8601 timestamp or Unix millisecond timestamp");
  }

  return timestamp;
}

function providerInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
