import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const ticketmasterDiscoveryBaseUrl = "https://app.ticketmaster.com/discovery/v2";
const ticketmasterPartnerBaseUrl = "https://app.ticketmaster.com/partners/v1";
const ticketmasterSeasonBaseUrl = "https://app.ticketmaster.com";
const defaultSeasonProduct = "sth-customer";
const defaultSeasonPollAttempts = 5;
const defaultSeasonPollDelayMs = 500;

type TicketmasterActionContext = {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
};

type TicketmasterActionHandler = (
  input: Record<string, unknown>,
  context: TicketmasterActionContext,
) => Promise<unknown>;

export const ticketmasterActionHandlers: ProviderActionHandlers<"ticketmaster", TicketmasterActionHandler> = {
  get_events(input: Record<string, unknown>, context: TicketmasterActionContext): Promise<unknown> {
    return getEvents(input, context);
  },
  get_event_details(input: Record<string, unknown>, context: TicketmasterActionContext): Promise<unknown> {
    return getEventDetails(input, context);
  },
  get_event_images(input: Record<string, unknown>, context: TicketmasterActionContext): Promise<unknown> {
    return getEventImages(input, context);
  },
  get_attractions(input: Record<string, unknown>, context: TicketmasterActionContext): Promise<unknown> {
    return getAttractions(input, context);
  },
  get_attraction_details(input: Record<string, unknown>, context: TicketmasterActionContext): Promise<unknown> {
    return getAttractionDetails(input, context);
  },
  get_venues(input: Record<string, unknown>, context: TicketmasterActionContext): Promise<unknown> {
    return getVenues(input, context);
  },
  get_venue_details(input: Record<string, unknown>, context: TicketmasterActionContext): Promise<unknown> {
    return getVenueDetails(input, context);
  },
  get_suggestions(input: Record<string, unknown>, context: TicketmasterActionContext): Promise<unknown> {
    return getSuggestions(input, context);
  },
  get_classifications(input: Record<string, unknown>, context: TicketmasterActionContext): Promise<unknown> {
    return getClassifications(input, context);
  },
  get_classification_details(input: Record<string, unknown>, context: TicketmasterActionContext): Promise<unknown> {
    return getClassificationDetails(input, context);
  },
  get_segment_details(input: Record<string, unknown>, context: TicketmasterActionContext): Promise<unknown> {
    return getSegmentDetails(input, context);
  },
  get_genre_details(input: Record<string, unknown>, context: TicketmasterActionContext): Promise<unknown> {
    return getGenreDetails(input, context);
  },
  get_subgenre_details(input: Record<string, unknown>, context: TicketmasterActionContext): Promise<unknown> {
    return getSubgenreDetails(input, context);
  },
  get_section_map_image(input: Record<string, unknown>, context: TicketmasterActionContext): Promise<unknown> {
    return getSectionMapImage(input, context);
  },
  execute_season_ticketing_command(
    input: Record<string, unknown>,
    context: TicketmasterActionContext,
  ): Promise<unknown> {
    return executeSeasonTicketingCommand(input, context);
  },
};

export async function validateTicketmasterCredential(
  input: { apiKey: string },
  options: { fetcher: typeof fetch; signal?: AbortSignal },
): Promise<CredentialValidationResult> {
  await ticketmasterGetJson(
    `${ticketmasterDiscoveryBaseUrl}/events.json`,
    {
      size: 1,
      page: 0,
    },
    input.apiKey,
    options.fetcher,
    options.signal,
  );

  return {
    profile: { accountId: "ticketmaster:api-key", displayName: "Ticketmaster API Key" },
    grantedScopes: [],
    metadata: {
      validationEndpoint: "/discovery/v2/events.json",
      apiBaseUrl: "https://app.ticketmaster.com",
    },
  };
}

async function getEvents(input: Record<string, unknown>, context: TicketmasterActionContext) {
  const payload = await ticketmasterGetJson(
    `${ticketmasterDiscoveryBaseUrl}/events.json`,
    {
      ...pickDefinedQueryParams(input, [
        "id",
        "keyword",
        "attractionId",
        "venueId",
        "postalCode",
        "latlong",
        "geoPoint",
        "radius",
        "unit",
        "locale",
        "source",
        "page",
        "size",
        "sort",
        "city",
        "stateCode",
        "countryCode",
        "dmaId",
        "marketId",
        "startDateTime",
        "endDateTime",
        "onsaleStartDateTime",
        "onsaleEndDateTime",
        "segmentId",
        "segmentName",
        "classificationId",
        "classificationName",
        "genreId",
        "subGenreId",
        "promoterId",
        "includeSpellcheck",
        "includeFamily",
        "typeId",
        "subTypeId",
      ]),
    },
    context.apiKey,
    context.fetcher,
  );

  return {
    events: mapEmbeddedCollection(payload, "events", mapEvent),
    page: mapPage(payload.page),
    links: mapObject(payload._links),
    spellcheck: mapObject(payload.spellcheck),
  };
}

async function getEventDetails(input: Record<string, unknown>, context: TicketmasterActionContext) {
  const payload = await ticketmasterGetJson(
    `${ticketmasterDiscoveryBaseUrl}/events/${encodeURIComponent(String(input.id))}.json`,
    pickDefinedQueryParams(input, ["locale", "domain"]),
    context.apiKey,
    context.fetcher,
  );

  return {
    event: mapEvent(payload),
  };
}

async function getEventImages(input: Record<string, unknown>, context: TicketmasterActionContext) {
  const payload = await ticketmasterGetJson(
    `${ticketmasterDiscoveryBaseUrl}/events/${encodeURIComponent(String(input.id))}/images.json`,
    pickDefinedQueryParams(input, ["locale", "domain"]),
    context.apiKey,
    context.fetcher,
  );

  return {
    eventId: asString(payload.id) ?? String(input.id),
    images: mapImages(payload.images),
    raw: payload,
  };
}

async function getAttractions(input: Record<string, unknown>, context: TicketmasterActionContext) {
  const payload = await ticketmasterGetJson(
    `${ticketmasterDiscoveryBaseUrl}/attractions.json`,
    {
      ...pickDefinedQueryParams(input, [
        "keyword",
        "source",
        "page",
        "size",
        "sort",
        "countryCode",
        "classificationName",
        "segmentId",
        "genreId",
        "subGenreId",
        "subSegmentId",
        "type",
      ]),
      ...(input.attractionId ? { id: String(input.attractionId) } : {}),
      ...(input.includeTest !== undefined ? { includeTest: normalizeIncludeTestValue(input.includeTest) } : {}),
    },
    context.apiKey,
    context.fetcher,
  );

  return {
    attractions: mapEmbeddedCollection(payload, "attractions", mapAttraction),
    page: mapPage(payload.page),
    links: mapObject(payload._links),
  };
}

async function getAttractionDetails(input: Record<string, unknown>, context: TicketmasterActionContext) {
  const payload = await ticketmasterGetJson(
    `${ticketmasterDiscoveryBaseUrl}/attractions/${encodeURIComponent(String(input.id))}.json`,
    pickDefinedQueryParams(input, ["locale", "domain"]),
    context.apiKey,
    context.fetcher,
  );

  return {
    attraction: mapAttraction(payload),
  };
}

async function getVenues(input: Record<string, unknown>, context: TicketmasterActionContext) {
  const payload = await ticketmasterGetJson(
    `${ticketmasterDiscoveryBaseUrl}/venues.json`,
    pickDefinedQueryParams(input, [
      "id",
      "keyword",
      "city",
      "stateCode",
      "countryCode",
      "postalCode",
      "latlong",
      "radius",
      "page",
      "size",
      "sort",
      "dmaId",
    ]),
    context.apiKey,
    context.fetcher,
  );

  return {
    venues: mapEmbeddedCollection(payload, "venues", mapVenue),
    page: mapPage(payload.page),
    links: mapObject(payload._links),
  };
}

async function getVenueDetails(input: Record<string, unknown>, context: TicketmasterActionContext) {
  const payload = await ticketmasterGetJson(
    `${ticketmasterDiscoveryBaseUrl}/venues/${encodeURIComponent(String(input.id))}.json`,
    pickDefinedQueryParams(input, ["locale", "domain"]),
    context.apiKey,
    context.fetcher,
  );

  return {
    venue: mapVenue(payload),
  };
}

async function getSuggestions(input: Record<string, unknown>, context: TicketmasterActionContext) {
  const payload = await ticketmasterGetJson(
    `${ticketmasterDiscoveryBaseUrl}/suggest`,
    pickDefinedQueryParams(input, [
      "keyword",
      "source",
      "locale",
      "countryCode",
      "latlong",
      "geoPoint",
      "radius",
      "unit",
      "size",
      "segmentId",
      "includeTBA",
      "includeTBD",
      "includeFuzzy",
      "includeSpellcheck",
      "clientVisibility",
      "domain",
    ]),
    context.apiKey,
    context.fetcher,
  );

  return {
    events: mapEmbeddedCollection(payload, "events", mapEvent),
    attractions: mapEmbeddedCollection(payload, "attractions", mapAttraction),
    venues: mapEmbeddedCollection(payload, "venues", mapVenue),
    page: mapPage(payload.page),
    links: mapObject(payload._links),
    spellcheck: mapObject(payload.spellcheck),
    raw: payload,
  };
}

async function getClassifications(input: Record<string, unknown>, context: TicketmasterActionContext) {
  const payload = await ticketmasterGetJson(
    `${ticketmasterDiscoveryBaseUrl}/classifications.json`,
    {
      ...pickDefinedQueryParams(input, ["countryCode", "locale", "domain", "page", "size"]),
      ...(input.classificationId ? { id: String(input.classificationId) } : {}),
    },
    context.apiKey,
    context.fetcher,
  );

  return {
    classifications: mapEmbeddedCollection(payload, "classifications", mapClassification),
    page: mapPage(payload.page),
    links: mapObject(payload._links),
  };
}

async function getClassificationDetails(input: Record<string, unknown>, context: TicketmasterActionContext) {
  const payload = await ticketmasterGetJson(
    `${ticketmasterDiscoveryBaseUrl}/classifications/${encodeURIComponent(String(input.id))}.json`,
    pickDefinedQueryParams(input, ["locale", "domain"]),
    context.apiKey,
    context.fetcher,
  );

  return {
    classification: mapClassification(payload),
  };
}

async function getSegmentDetails(input: Record<string, unknown>, context: TicketmasterActionContext) {
  const payload = await ticketmasterGetJson(
    `${ticketmasterDiscoveryBaseUrl}/segments/${encodeURIComponent(String(input.id))}.json`,
    pickDefinedQueryParams(input, ["locale", "domain"]),
    context.apiKey,
    context.fetcher,
  );

  return {
    segment: mapClassification(payload),
  };
}

async function getGenreDetails(input: Record<string, unknown>, context: TicketmasterActionContext) {
  const payload = await ticketmasterGetJson(
    `${ticketmasterDiscoveryBaseUrl}/genres/${encodeURIComponent(String(input.id))}.json`,
    pickDefinedQueryParams(input, ["locale", "domain"]),
    context.apiKey,
    context.fetcher,
  );

  return {
    genre: mapClassification(payload),
  };
}

async function getSubgenreDetails(input: Record<string, unknown>, context: TicketmasterActionContext) {
  const payload = await ticketmasterGetJson(
    `${ticketmasterDiscoveryBaseUrl}/subgenres/${encodeURIComponent(String(input.id))}.json`,
    pickDefinedQueryParams(input, ["locale", "domain"]),
    context.apiKey,
    context.fetcher,
  );

  return {
    subGenre: mapClassification(payload),
  };
}

async function getSectionMapImage(input: Record<string, unknown>, context: TicketmasterActionContext) {
  const url = new URL(
    `${ticketmasterPartnerBaseUrl}/events/${encodeURIComponent(String(input.eventId))}/images/${encodeURIComponent(String(input.systemId))}/map`,
  );
  url.searchParams.set("apikey", context.apiKey);
  appendQueryParams(url, {
    ...(input.placeId ? { placeId: String(input.placeId) } : {}),
    ...(input.domain ? { domain: String(input.domain) } : {}),
    ...(input.width !== undefined ? { width: input.width } : {}),
    ...(input.pinWidth !== undefined ? { pinWidth: input.pinWidth } : {}),
    ...(input.showLabels !== undefined ? { showLabels: input.showLabels } : {}),
    ...(Array.isArray(input.sectionNames) && input.sectionNames.length > 0
      ? { sectionNames: input.sectionNames.join(",") }
      : {}),
  });

  const response = await context.fetcher(url.toString(), {
    headers: {
      accept: "image/*, application/json",
      "user-agent": providerUserAgent,
    },
    signal: context.signal,
  });

  if (response.status === 204) {
    return {
      imageAvailable: false,
      contentType: null,
      imageBase64: null,
    };
  }

  if (!response.ok) {
    throw await createTicketmasterError(response, "ticketmaster section-map image request failed");
  }

  const arrayBuffer = await response.arrayBuffer();
  const imageBase64 = Buffer.from(arrayBuffer).toString("base64");

  return {
    imageAvailable: imageBase64.length > 0,
    contentType: response.headers.get("content-type"),
    imageBase64: imageBase64.length > 0 ? imageBase64 : null,
  };
}

async function executeSeasonTicketingCommand(input: Record<string, unknown>, context: TicketmasterActionContext) {
  const product = asString(input.product) ?? defaultSeasonProduct;
  const maxPollAttempts = asPositiveInteger(input.maxPollAttempts) ?? defaultSeasonPollAttempts;
  const pollDelayMs = asNonNegativeInteger(input.pollDelayMs) ?? defaultSeasonPollDelayMs;
  const requestHeader = mapSeasonRequestHeader(mapObject(input.header) ?? {});
  const requestCommand = mapSeasonRequestCommand(mapObject(input.command) ?? {});
  let cookieJar = mapStringRecord(input.cookies) ?? {};

  for (let attempt = 0; attempt < maxPollAttempts; attempt += 1) {
    const response = await context.fetcher(
      `${ticketmasterSeasonBaseUrl}/${encodeURIComponent(product)}/ticketing_services.aspx?dsn=${encodeURIComponent(requestCommand.dsn)}`,
      {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          apikey: context.apiKey,
          "user-agent": providerUserAgent,
          ...(Object.keys(cookieJar).length > 0 ? { cookie: buildCookieHeader(cookieJar) } : {}),
        },
        body: JSON.stringify({
          header: requestHeader,
          command1: requestCommand,
        }),
        signal: context.signal,
      },
    );

    const payload = await readJsonBody(response);
    const responseCookies = extractCookies(response.headers);
    for (const [name, value] of Object.entries(responseCookies)) {
      if (value === null) {
        delete cookieJar[name];
        continue;
      }
      cookieJar[name] = value;
    }

    if (response.status === 202) {
      if (attempt === maxPollAttempts - 1) {
        return mapSeasonResponse(payload, response.status, cookieJar, true);
      }
      await delay(pollDelayMs);
      continue;
    }

    if (!response.ok) {
      throw mapTicketmasterErrorFromPayload(response.status, payload, "ticketmaster season ticketing request failed");
    }

    return mapSeasonResponse(payload, response.status, cookieJar, false);
  }

  return mapSeasonResponse({}, 202, cookieJar, true);
}

async function ticketmasterGetJson(
  url: string,
  query: Record<string, unknown>,
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
) {
  const requestUrl = new URL(url);
  requestUrl.searchParams.set("apikey", apiKey);
  appendQueryParams(requestUrl, query);

  const response = await fetcher(requestUrl.toString(), {
    headers: {
      accept: "application/json",
      "user-agent": providerUserAgent,
    },
    signal,
  });

  if (!response.ok) {
    throw await createTicketmasterError(response, "ticketmaster request failed");
  }

  return readJsonBody(response);
}

async function createTicketmasterError(response: Response, fallbackMessage: string) {
  const payload = await readJsonBody(response);
  return mapTicketmasterErrorFromPayload(response.status, payload, fallbackMessage);
}

function mapTicketmasterErrorFromPayload(status: number, payload: Record<string, unknown>, fallbackMessage: string) {
  const message = extractTicketmasterErrorMessage(payload) ?? fallbackMessage;

  if (status === 429) {
    return ticketmasterError("rate_limited", message, 429);
  }

  if ([400, 401, 403, 404].includes(status)) {
    return ticketmasterError("invalid_input", message, status === 404 ? 400 : status);
  }

  return ticketmasterError("provider_error", message, status >= 500 ? 500 : status);
}

function ticketmasterError(_code: string, message: string, status = 500): ProviderRequestError {
  return new ProviderRequestError(status, message);
}

async function readJsonBody(response: Response) {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    const parsed = JSON.parse(text) as unknown;
    return mapObject(parsed) ?? { value: parsed };
  } catch {
    return {
      message: text,
    };
  }
}

function extractTicketmasterErrorMessage(payload: Record<string, unknown>) {
  const messageCandidates = [
    asString(payload.message),
    asString(payload.error),
    asString(payload.detail),
    asString(payload.description),
  ].filter(Boolean);
  if (messageCandidates.length > 0) {
    return messageCandidates[0];
  }

  const fault = mapObject(payload.fault);
  if (fault) {
    return (
      asString(fault.faultstring) ?? asString(fault.detail) ?? asString(mapObject(fault.error)?.message) ?? undefined
    );
  }

  const errors = Array.isArray(payload.errors) ? payload.errors : [];
  for (const entry of errors) {
    const errorObject = mapObject(entry);
    if (!errorObject) {
      continue;
    }
    const message = asString(errorObject.message) ?? asString(errorObject.detail) ?? asString(errorObject.code);
    if (message) {
      return message;
    }
  }

  return undefined;
}

function mapPage(value: unknown) {
  const page = mapObject(value);
  if (!page) {
    return undefined;
  }

  return {
    size: asNumber(page.size) ?? 0,
    totalElements: asNumber(page.totalElements) ?? 0,
    totalPages: asNumber(page.totalPages) ?? 0,
    number: asNumber(page.number) ?? 0,
  };
}

function mapEmbeddedCollection<T>(
  payload: Record<string, unknown>,
  key: string,
  mapper: (value: Record<string, unknown>) => T,
) {
  const embedded = mapObject(payload._embedded);
  if (!embedded) {
    return [];
  }

  const rawItems = Array.isArray(embedded[key]) ? embedded[key] : [];
  return rawItems
    .map((item) => mapObject(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => mapper(item));
}

function mapEvent(value: Record<string, unknown>) {
  return {
    id: asString(value.id) ?? "",
    name: asString(value.name) ?? null,
    type: asString(value.type) ?? null,
    url: asString(value.url) ?? null,
    locale: asString(value.locale) ?? null,
    info: asString(value.info) ?? null,
    pleaseNote: asString(value.pleaseNote) ?? null,
    dates: mapObject(value.dates) ?? null,
    sales: mapObject(value.sales) ?? null,
    priceRanges: mapObjectArray(value.priceRanges),
    images: mapImages(value.images),
    classifications: mapClassificationList(value.classifications),
    venues: mapEmbeddedReferences(value, "venues"),
    attractions: mapEmbeddedReferences(value, "attractions"),
    raw: value,
  };
}

function mapAttraction(value: Record<string, unknown>) {
  return {
    id: asString(value.id) ?? "",
    name: asString(value.name) ?? null,
    type: asString(value.type) ?? null,
    url: asString(value.url) ?? null,
    locale: asString(value.locale) ?? null,
    images: mapImages(value.images),
    upcomingEvents: mapObject(value.upcomingEvents) ?? null,
    classifications: mapClassificationList(value.classifications),
    externalLinks: mapObject(value.externalLinks) ?? null,
    raw: value,
  };
}

function mapVenue(value: Record<string, unknown>) {
  const city = mapObject(value.city);
  const state = mapObject(value.state);
  const country = mapObject(value.country);

  return {
    id: asString(value.id) ?? "",
    name: asString(value.name) ?? null,
    type: asString(value.type) ?? null,
    url: asString(value.url) ?? null,
    locale: asString(value.locale) ?? null,
    postalCode: asString(value.postalCode) ?? null,
    cityName: asString(city?.name) ?? null,
    stateCode: asString(state?.stateCode) ?? null,
    countryCode: asString(country?.countryCode) ?? null,
    address: mapObject(value.address) ?? null,
    location: mapObject(value.location) ?? null,
    images: mapImages(value.images),
    raw: value,
  };
}

function mapClassification(value: Record<string, unknown>) {
  return {
    id: asString(value.id) ?? "",
    name: asString(value.name) ?? null,
    locale: asString(value.locale) ?? null,
    primary: asBoolean(value.primary) ?? null,
    segment: mapEntityReference(value.segment),
    genre: mapEntityReference(value.genre),
    subGenre: mapEntityReference(value.subGenre),
    type: mapEntityReference(value.type),
    subType: mapEntityReference(value.subType),
    raw: value,
  };
}

function mapClassificationList(value: unknown) {
  const list = Array.isArray(value) ? value : [];
  return list
    .map((item) => mapObject(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => ({
      primary: asBoolean(item.primary) ?? null,
      segment: mapEntityReference(item.segment),
      genre: mapEntityReference(item.genre),
      subGenre: mapEntityReference(item.subGenre),
      type: mapEntityReference(item.type),
      subType: mapEntityReference(item.subType),
      raw: item,
    }));
}

function mapImages(value: unknown) {
  const list = Array.isArray(value) ? value : [];
  return list
    .map((item) => mapObject(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => ({
      url: asString(item.url) ?? "",
      ratio: asString(item.ratio) ?? null,
      width: asNumber(item.width) ?? null,
      height: asNumber(item.height) ?? null,
      fallback: asBoolean(item.fallback) ?? null,
      attribution: asString(item.attribution) ?? null,
    }));
}

function mapEmbeddedReferences(value: Record<string, unknown>, key: string) {
  const embedded = mapObject(value._embedded);
  if (!embedded) {
    return [];
  }

  const list = Array.isArray(embedded[key]) ? embedded[key] : [];
  return list
    .map((item) => mapObject(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => ({
      id: asString(item.id) ?? "",
      name: asString(item.name) ?? null,
      type: asString(item.type) ?? null,
    }));
}

function mapEntityReference(value: unknown) {
  const entity = mapObject(value);
  if (!entity) {
    return null;
  }

  return {
    id: asString(entity.id) ?? "",
    name: asString(entity.name) ?? null,
    type: asString(entity.type) ?? null,
  };
}

function mapSeasonResponse(
  payload: Record<string, unknown>,
  statusCode: number,
  cookies: Record<string, string>,
  queued: boolean,
) {
  return {
    statusCode,
    queued,
    status: asString(payload.status) ?? null,
    message: asString(payload.message) ?? null,
    errorCode: asString(payload.error_code) ?? null,
    cookies,
    data: mapObject(payload.data) ?? null,
    raw: payload,
  };
}

function mapSeasonRequestHeader(value: Record<string, unknown>) {
  return {
    ...(value.ver !== undefined ? { ver: asPositiveInteger(value.ver) ?? 1 } : {}),
    src_sys_name: asString(value.srcSysName) ?? "",
    ...(value.srcSysType !== undefined ? { src_sys_type: asPositiveInteger(value.srcSysType) ?? 2 } : {}),
    archtics_version: asString(value.archticsVersion) ?? "",
  };
}

function mapSeasonRequestCommand(value: Record<string, unknown>) {
  return {
    cmd: asString(value.cmd) ?? "",
    dsn: asString(value.dsn) ?? "",
    uid: asString(value.uid) ?? "",
    ...(value.additionalParams ? { additional_params: mapObject(value.additionalParams) ?? {} } : {}),
  };
}

function appendQueryParams(url: URL, query: Record<string, unknown>) {
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }

    if (Array.isArray(value)) {
      if (value.length === 0) {
        continue;
      }
      url.searchParams.set(key, value.map((item) => String(item)).join(","));
      continue;
    }

    url.searchParams.set(key, String(value));
  }
}

function pickDefinedQueryParams(input: Record<string, unknown>, keys: string[]) {
  const query: Record<string, unknown> = {};
  for (const key of keys) {
    if (input[key] === undefined) {
      continue;
    }
    query[key] = input[key];
  }
  return query;
}

function mapObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function mapObjectArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => mapObject(item)).filter((item): item is Record<string, unknown> => Boolean(item));
}

function mapStringRecord(value: unknown) {
  const record = mapObject(value);
  if (!record) {
    return undefined;
  }

  const result: Record<string, string> = {};
  for (const [key, child] of Object.entries(record)) {
    if (typeof child === "string") {
      result[key] = child;
    }
  }
  return result;
}

function asString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function asPositiveInteger(value: unknown) {
  const parsed = asInteger(value);
  if (parsed == null || parsed <= 0) {
    return undefined;
  }
  return parsed;
}

function asNonNegativeInteger(value: unknown) {
  const parsed = asInteger(value);
  if (parsed == null || parsed < 0) {
    return undefined;
  }
  return parsed;
}

function asInteger(value: unknown) {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return undefined;
  }
  return value;
}

function normalizeIncludeTestValue(value: unknown) {
  if (typeof value === "boolean") {
    return value ? "yes" : "no";
  }
  return typeof value === "string" ? value : undefined;
}

function extractCookies(headers: Headers) {
  const getSetCookie = headers as Headers & {
    getSetCookie?: () => string[];
  };
  const rawCookies =
    typeof getSetCookie.getSetCookie === "function"
      ? getSetCookie.getSetCookie()
      : headers.get("set-cookie")
        ? splitCombinedSetCookieHeader(headers.get("set-cookie")!)
        : [];

  const cookies: Record<string, string | null> = {};
  for (const rawCookie of rawCookies) {
    const firstSegment = rawCookie.split(";")[0] ?? "";
    const separatorIndex = firstSegment.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }
    const name = firstSegment.slice(0, separatorIndex).trim();
    const value = firstSegment.slice(separatorIndex + 1).trim();
    if (!name) {
      continue;
    }
    cookies[name] = value === "" ? null : value;
  }
  return cookies;
}

function splitCombinedSetCookieHeader(value: string) {
  const cookies: string[] = [];
  let segmentStart = 0;

  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== ",") {
      continue;
    }

    if (!looksLikeCookieBoundary(value, index + 1)) {
      continue;
    }

    const segment = value.slice(segmentStart, index).trim();
    if (segment) {
      cookies.push(segment);
    }
    segmentStart = index + 1;
  }

  const tail = value.slice(segmentStart).trim();
  if (tail) {
    cookies.push(tail);
  }

  return cookies;
}

function looksLikeCookieBoundary(value: string, startIndex: number) {
  let index = startIndex;
  while (index < value.length && value[index] === " ") {
    index += 1;
  }

  for (; index < value.length; index += 1) {
    const char = value[index];
    if (char === "=") {
      return true;
    }
    if (char === ";" || char === ",") {
      return false;
    }
  }

  return false;
}

function buildCookieHeader(cookies: Record<string, string>) {
  return Object.entries(cookies)
    .map(([key, value]) => `${key}=${value}`)
    .join("; ");
}

function delay(ms: number) {
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}
