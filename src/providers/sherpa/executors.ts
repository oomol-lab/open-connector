import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "sherpa";
const apiBaseUrl = "https://requirements-api.joinsherpa.com";
interface TripInput {
  locale?: string;
  currency?: string;
  passports: unknown[];
  travelNodes: unknown[];
}

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  service,
  {
    get_trip_details: (input, context) => runTrip(input, context, "/v3/trips"),
    get_trip_summary: (input, context) => runTrip(input, context, "/v3/trips/llm?accept=json"),
  },
  { skipDnsValidation: true },
);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, context) {
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    await request(
      input.apiKey,
      "/v3/trips/llm?accept=json",
      tripBody({
        passports: ["USA"],
        travelNodes: [
          { type: "ORIGIN", locationCode: "USA", departure: { date: tomorrow, time: "12:00", travelMode: "AIR" } },
          { type: "DESTINATION", locationCode: "CAN", arrival: { date: tomorrow, time: "14:00", travelMode: "AIR" } },
        ],
      }),
      "validate",
      context.fetcher,
      context.signal,
    );
    return {
      profile: { accountId: "sherpa", displayName: "Sherpa API Key" },
      grantedScopes: [],
      metadata: { apiBaseUrl, validationEndpoint: "/v3/trips/llm" },
    };
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: apiBaseUrl,
  auth: { type: "api_key_header", name: "x-api-key" },
  skipDnsValidation: true,
});

function runTrip(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
  path: string,
): Promise<Record<string, unknown>> {
  validateTrip(input);
  return request(
    context.apiKey,
    path,
    tripBody(input as unknown as TripInput),
    "execute",
    context.fetcher,
    context.signal,
  );
}

function validateTrip(input: Record<string, unknown>): void {
  const nodes = Array.isArray(input.travelNodes)
    ? input.travelNodes.filter(
        (value): value is Record<string, unknown> =>
          Boolean(value) && typeof value == "object" && !Array.isArray(value),
      )
    : [];
  if (!nodes.some((node) => node.type == "ORIGIN"))
    throw new ProviderRequestError(400, "travelNodes must include an ORIGIN");
  if (!nodes.some((node) => node.type == "DESTINATION"))
    throw new ProviderRequestError(400, "travelNodes must include a DESTINATION");
  for (const node of nodes) {
    if (node.type == "ORIGIN" && !node.departure)
      throw new ProviderRequestError(400, "ORIGIN travel nodes require departure details");
    if (node.type != "ORIGIN" && !node.arrival)
      throw new ProviderRequestError(400, `${String(node.type)} travel nodes require arrival details`);
  }
}

function tripBody(input: TripInput): Record<string, unknown> {
  return {
    data: {
      type: "TRIP",
      attributes: {
        locale: input.locale ?? "en-US",
        traveller: { passports: input.passports },
        currency: input.currency ?? "USD",
        travelNodes: input.travelNodes,
      },
    },
  };
}

async function request(
  apiKey: string,
  path: string,
  body: Record<string, unknown>,
  phase: "validate" | "execute",
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const timeout = createProviderTimeout(signal, 30_000);
  try {
    const response = await fetcher(`${apiBaseUrl}${path}`, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/vnd.api+json", "x-api-key": apiKey },
      body: JSON.stringify(body),
      signal: timeout.signal,
    });
    const text = await response.text();
    let payload: unknown = {};
    try {
      payload = text ? (JSON.parse(text) as unknown) : {};
    } catch {
      throw new ProviderRequestError(502, "Sherpa returned invalid JSON");
    }
    const record = optionalRecord(payload);
    if (!record) throw new ProviderRequestError(502, "Sherpa returned a non-object response");
    if (!response.ok) {
      const first = Array.isArray(record.errors) ? optionalRecord(record.errors[0]) : undefined;
      const message =
        optionalString(first?.detail) ??
        optionalString(first?.title) ??
        optionalString(record.message) ??
        `Sherpa request failed with HTTP ${response.status}`;
      if (phase == "validate" && (response.status == 401 || response.status == 403))
        throw new ProviderRequestError(400, message, record);
      throw new ProviderRequestError(response.status, message, record);
    }
    return record;
  } finally {
    timeout.cleanup();
  }
}
