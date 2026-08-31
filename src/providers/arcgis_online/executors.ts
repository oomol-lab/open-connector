import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
  readProviderJsonBody,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "arcgis_online";
const arcgisOnlineApiBaseUrl = "https://geocode-api.arcgis.com/arcgis/rest/services/World/GeocodeServer";
const arcgisOnlineValidationPath = "/suggest";

type ArcgisOnlineQueryValue = string | number | boolean | undefined;
type ArcgisOnlineActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const arcgisOnlineActionHandlers: ProviderActionHandlers<"arcgis_online", ArcgisOnlineActionHandler> = {
  suggest(input, context) {
    return requestArcgisOnline({
      path: "/suggest",
      query: compactObject({
        text: optionalString(input.text),
        location: serializeOptionalCoordinate(input.location),
        searchExtent: optionalString(input.searchExtent),
        category: optionalString(input.category),
        sourceCountry: optionalString(input.sourceCountry),
        preferredLabelValues: optionalString(input.preferredLabelValues),
        countryCode: optionalString(input.countryCode),
        maxSuggestions: optionalNumber(input.maxSuggestions),
        returnCollections: optionalBoolean(input.returnCollections),
      }),
      context,
    });
  },
  find_address_candidates(input, context) {
    return requestArcgisOnline({
      path: "/findAddressCandidates",
      query: compactObject({
        SingleLine: optionalString(input.singleLine),
        location: serializeOptionalCoordinate(input.location),
        searchExtent: optionalString(input.searchExtent),
        category: optionalString(input.category),
        sourceCountry: optionalString(input.sourceCountry),
        preferredLabelValues: optionalString(input.preferredLabelValues),
        magicKey: optionalString(input.magicKey),
        outFields: optionalString(input.outFields),
        outSR: optionalNumber(input.outSr),
        maxLocations: optionalNumber(input.maxLocations),
        forStorage: optionalBoolean(input.forStorage),
        locationType: optionalString(input.locationType),
      }),
      context,
    });
  },
  reverse_geocode(input, context) {
    return requestArcgisOnline({
      path: "/reverseGeocode",
      query: compactObject({
        location: serializeCoordinate(input.longitude, input.latitude),
        outSR: optionalNumber(input.outSr),
        langCode: optionalString(input.langCode),
        forStorage: optionalBoolean(input.forStorage),
        featureTypes: optionalString(input.featureTypes),
        locationType: optionalString(input.locationType),
        preferredLabelValues: optionalString(input.preferredLabelValues),
        outFields: optionalString(input.outFields),
        returnInputLocation: optionalBoolean(input.returnInputLocation),
      }),
      context,
    });
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, arcgisOnlineActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: arcgisOnlineApiBaseUrl,
  auth: { type: "none" },
  skipDnsValidation: true,
  async customizeRequest({ context, headers }) {
    const credential = await requireApiKeyCredential(context, service);
    headers.set("X-Esri-Authorization", `Bearer ${credential.apiKey}`);
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await requestArcgisOnline({
      path: arcgisOnlineValidationPath,
      query: { text: "Berlin", maxSuggestions: 1 },
      context: { apiKey: input.apiKey, fetcher, signal },
    });
    return {
      profile: {
        accountId: "api_key",
        displayName: "ArcGIS Online API Key",
      },
      grantedScopes: [],
      metadata: {
        validationEndpoint: arcgisOnlineValidationPath,
        apiBaseUrl: arcgisOnlineApiBaseUrl,
        requiredPrivilege: "premium:user:geocode",
      },
    };
  },
};

async function requestArcgisOnline(input: {
  path: string;
  query: Record<string, ArcgisOnlineQueryValue>;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
}): Promise<unknown> {
  const timeout = createProviderTimeout(input.context.signal);
  try {
    const response = await input.context.fetcher(buildArcgisOnlineUrl(input.path, input.query, input.context.apiKey), {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
    const payload = await readProviderJsonBody(response, {
      emptyBody: {},
      invalidJsonMessage: "ArcGIS Online returned invalid JSON",
      invalidJsonFallback: (text) => ({ message: text }),
    });
    const embeddedError = extractArcgisOnlineError(payload);
    if (embeddedError) {
      throw createArcgisOnlineError(response.status, embeddedError);
    }
    if (!response.ok) {
      throw createArcgisOnlineError(response.status, payload);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "ArcGIS Online request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `ArcGIS Online request failed: ${error.message}` : "ArcGIS Online request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildArcgisOnlineUrl(path: string, query: Record<string, ArcgisOnlineQueryValue>, apiKey: string): URL {
  const url = new URL(`${arcgisOnlineApiBaseUrl}${path}`);
  url.searchParams.set("f", "json");
  url.searchParams.set("token", apiKey);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

function extractArcgisOnlineError(payload: unknown): Record<string, unknown> | undefined {
  return optionalRecord(optionalRecord(payload)?.error);
}

function createArcgisOnlineError(status: number, payload: unknown): ProviderRequestError {
  const record = optionalRecord(payload);
  const message =
    optionalString(record?.message) ??
    optionalString(record?.error) ??
    `ArcGIS Online request failed with ${status || 500}`;
  const upstreamCode = optionalNumber(record?.code) ?? status;
  if (status === 429 || upstreamCode === 429) {
    return new ProviderRequestError(429, message);
  }
  if (isCredentialFailure(status, upstreamCode)) {
    return new ProviderRequestError(401, message);
  }
  if (status === 400 || upstreamCode === 400) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(status >= 500 ? status : 502, message);
}

function isCredentialFailure(status: number, upstreamCode: number): boolean {
  return (
    status === 401 ||
    status === 403 ||
    upstreamCode === 401 ||
    upstreamCode === 403 ||
    upstreamCode === 498 ||
    upstreamCode === 499
  );
}

function serializeOptionalCoordinate(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(400, "location must be an object");
  }
  return serializeCoordinate(record.longitude, record.latitude);
}

function serializeCoordinate(longitude: unknown, latitude: unknown): string {
  if (typeof longitude !== "number" || typeof latitude !== "number") {
    throw new ProviderRequestError(400, "longitude and latitude must be numbers");
  }
  return `${longitude},${latitude}`;
}
