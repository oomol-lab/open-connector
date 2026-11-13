import type { QueryValue } from "../../core/request.ts";
import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderRequestPhase } from "../http-json-runtime.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers, ProviderRuntimeHandler } from "../provider-executors.ts";

import {
  optionalBoolean,
  optionalInteger,
  optionalNumber,
  optionalString,
  optionalStringArray,
  stringArray,
} from "../../core/cast.ts";
import { arrayPayload, objectPayload, requestJson } from "../http-json-runtime.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  providerInputError,
  requiredInputNumber,
  requiredInputString,
  runProviderRequest,
} from "../provider-runtime.ts";

const service = "odds_api_io";
const apiBaseUrl = "https://api.odds-api.io/v3";

type Handler = ProviderRuntimeHandler<ApiKeyProviderContext>;

const oddsApiIoActionHandlers: ProviderActionHandlers<"odds_api_io", Handler> = {
  async list_sports(_input, context) {
    return { sports: arrayPayload(await oddsApiIoRequest("/sports", context), "Odds-API.io list_sports") };
  },
  async list_bookmakers(_input, context) {
    return { bookmakers: arrayPayload(await oddsApiIoRequest("/bookmakers", context), "Odds-API.io list_bookmakers") };
  },
  async list_leagues(input, context) {
    return {
      leagues: arrayPayload(
        await oddsApiIoRequest("/leagues", context, {
          sport: requiredInputString(input.sport, "sport"),
          all: optionalBoolean(input.all),
        }),
        "Odds-API.io list_leagues",
      ),
    };
  },
  async list_events(input, context) {
    return {
      events: arrayPayload(
        await oddsApiIoRequest("/events", context, {
          sport: requiredInputString(input.sport, "sport"),
          league: optionalString(input.league),
          participantId: optionalInteger(input.participantId),
          status: optionalStringArray(input.status)?.join(","),
          from: optionalString(input.from),
          to: optionalString(input.to),
          bookmaker: optionalString(input.bookmaker),
          limit: optionalInteger(input.limit),
          skip: optionalInteger(input.skip),
        }),
        "Odds-API.io list_events",
      ),
    };
  },
  async get_event(input, context) {
    const eventId = requiredInputNumber(input.eventId, "eventId");
    return objectPayload(await oddsApiIoRequest(`/events/${eventId}`, context), "Odds-API.io get_event");
  },
  async get_odds(input, context) {
    return objectPayload(
      await oddsApiIoRequest("/odds", context, {
        eventId: requiredInputNumber(input.eventId, "eventId"),
        bookmakers: commaList(input.bookmakers, "bookmakers"),
        markets: optionalStringArray(input.markets)?.join(","),
      }),
      "Odds-API.io get_odds",
    );
  },
  async get_multi_odds(input, context) {
    return {
      events: arrayPayload(
        await oddsApiIoRequest("/odds/multi", context, {
          eventIds: commaList(input.eventIds, "eventIds"),
          bookmakers: commaList(input.bookmakers, "bookmakers"),
          markets: optionalStringArray(input.markets)?.join(","),
        }),
        "Odds-API.io get_multi_odds",
      ),
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, oddsApiIoActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: apiBaseUrl,
  auth: { type: "api_key_query", name: "apiKey" },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const selection = objectPayload(
      await oddsApiIoRequest("/bookmakers/selected", { apiKey: input.apiKey, fetcher, signal }, {}, "validate"),
      "Odds-API.io selected bookmakers",
    );
    return {
      profile: { accountId: "odds_api_io:api-key", displayName: "Odds-API.io API Key" },
      metadata: {
        apiBaseUrl,
        validationEndpoint: "/bookmakers/selected",
        selectedBookmakers: optionalNumber(selection.count),
      },
    };
  },
};

function oddsApiIoRequest(
  path: string,
  context: ApiKeyProviderContext,
  query: Record<string, QueryValue> = {},
  phase: ProviderRequestPhase = "execute",
): Promise<unknown> {
  return runProviderRequest({ label: "Odds-API.io", signal: context.signal }, (signal) =>
    requestJson({
      providerName: "Odds-API.io",
      baseUrl: apiBaseUrl,
      path,
      fetcher: context.fetcher,
      signal,
      query: { ...query, apiKey: context.apiKey },
      phase,
    }),
  );
}

function commaList(value: unknown, fieldName: string): string {
  const items = stringArray(value, fieldName, providerInputError);
  if (items.length === 0) {
    throw providerInputError(`${fieldName} must contain at least one value`);
  }
  return items.join(",");
}
