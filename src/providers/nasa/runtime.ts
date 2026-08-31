import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const nasaApiBaseUrl = "https://api.nasa.gov";

type QueryValue = string | number | boolean | undefined;
type NasaRequestPhase = "validate" | "execute";
type NasaActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type NasaActionHandler = (input: Record<string, unknown>, context: NasaActionContext) => Promise<unknown>;
type EpicImageKind = "natural" | "enhanced" | "aerosol" | "cloud";

export const nasaActionHandlers: ProviderActionHandlers<"nasa", NasaActionHandler> = {
  get_apod(input, context) {
    return executeGetApod(input, context);
  },
  browse_neo(input, context) {
    return executeBrowseNeo(input, context);
  },
  get_neo_lookup(input, context) {
    return executeGetNeoLookup(input, context);
  },
  search_near_earth_objects(input, context) {
    return executeSearchNearEarthObjects(input, context);
  },
  get_donki_cme(input, context) {
    return executeDonkiList("/DONKI/CME", input, context);
  },
  get_donki_cme_analysis(input, context) {
    return executeDonkiList("/DONKI/CMEAnalysis", input, context);
  },
  get_donki_gst(input, context) {
    return executeDonkiList("/DONKI/GST", input, context);
  },
  get_donki_ips(input, context) {
    return executeDonkiList("/DONKI/IPS", input, context);
  },
  get_donki_solar_flares(input, context) {
    return executeDonkiList("/DONKI/FLR", input, context);
  },
  get_donki_sep(input, context) {
    return executeDonkiList("/DONKI/SEP", input, context);
  },
  get_donki_mpc(input, context) {
    return executeDonkiList("/DONKI/MPC", input, context);
  },
  get_donki_rbe(input, context) {
    return executeDonkiList("/DONKI/RBE", input, context);
  },
  get_donki_hss(input, context) {
    return executeDonkiList("/DONKI/HSS", input, context);
  },
  get_donki_wsa_enlil(input, context) {
    return executeDonkiList("/DONKI/WSAEnlilSimulations", input, context);
  },
  get_donki_notifications(input, context) {
    return executeDonkiList("/DONKI/notifications", input, context);
  },
  get_epic_natural(_input, context) {
    return executeEpicImages("natural", undefined, context);
  },
  get_epic_natural_date(input, context) {
    return executeEpicImages("natural", readInputString(input.date, "date"), context);
  },
  list_epic_natural_dates(_input, context) {
    return executeEpicDateList("natural", context);
  },
  get_epic_enhanced(_input, context) {
    return executeEpicImages("enhanced", undefined, context);
  },
  get_epic_enhanced_date(input, context) {
    return executeEpicImages("enhanced", readInputString(input.date, "date"), context);
  },
  list_epic_enhanced_dates(_input, context) {
    return executeEpicDateList("enhanced", context);
  },
  get_epic_aerosol(_input, context) {
    return executeEpicImages("aerosol", undefined, context);
  },
  get_epic_aerosol_date(input, context) {
    return executeEpicImages("aerosol", readInputString(input.date, "date"), context);
  },
  list_epic_aerosol_dates(_input, context) {
    return executeEpicDateList("aerosol", context);
  },
  get_epic_cloud(_input, context) {
    return executeEpicImages("cloud", undefined, context);
  },
  get_epic_cloud_date(input, context) {
    return executeEpicImages("cloud", readInputString(input.date, "date"), context);
  },
  list_epic_cloud_dates(_input, context) {
    return executeEpicDateList("cloud", context);
  },
};

export async function validateNasaCredential(
  input: { apiKey: string },
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  await nasaGetJson(
    "/neo/rest/v1/neo/browse",
    {
      page: 0,
      size: 1,
    },
    {
      apiKey: input.apiKey,
      fetcher,
      signal,
    },
    "validate",
  );

  return {
    profile: {
      accountId: "api_key",
      displayName: "NASA API Key",
    },
    grantedScopes: [],
    metadata: {
      validationEndpoint: "/neo/rest/v1/neo/browse",
      apiBaseUrl: nasaApiBaseUrl,
    },
  };
}

async function executeGetApod(input: Record<string, unknown>, context: NasaActionContext): Promise<unknown> {
  const payload = readResponseObject(
    await nasaGetJson(
      "/planetary/apod",
      compactObject({
        date: optionalString(input.date),
        hd: optionalBoolean(input.hd),
        thumbs: optionalBoolean(input.thumbs),
      }),
      context,
      "execute",
    ),
    "apod response",
  );

  return {
    date: readRequiredString(payload.date, "date"),
    title: readRequiredString(payload.title, "title"),
    explanation: readRequiredString(payload.explanation, "explanation"),
    url: readRequiredString(payload.url, "url"),
    mediaType: readRequiredString(payload.media_type, "media_type"),
    serviceVersion: readRequiredString(payload.service_version, "service_version"),
    hdUrl: readOptionalString(payload.hdurl),
    thumbnailUrl: readOptionalString(payload.thumbnail_url),
    copyright: readOptionalString(payload.copyright),
    concepts: readOptionalObject(payload.concepts),
  };
}

async function executeBrowseNeo(input: Record<string, unknown>, context: NasaActionContext): Promise<unknown> {
  const payload = readResponseObject(
    await nasaGetJson(
      "/neo/rest/v1/neo/browse",
      compactObject({
        page: optionalInteger(input.page),
        size: optionalInteger(input.size),
      }),
      context,
      "execute",
    ),
    "browse_neo response",
  );

  return {
    links: normalizeLinks(payload.links),
    page: normalizePage(readResponseObject(payload.page, "page")),
    nearEarthObjects: readResponseArray(payload.near_earth_objects, "near_earth_objects").map((item) =>
      normalizeNearEarthObject(readResponseObject(item, "near_earth_objects[]")),
    ),
  };
}

async function executeGetNeoLookup(input: Record<string, unknown>, context: NasaActionContext): Promise<unknown> {
  const asteroidId = encodeURIComponent(readInputString(input.asteroidId, "asteroidId"));
  const payload = readResponseObject(
    await nasaGetJson(`/neo/rest/v1/neo/${asteroidId}`, {}, context, "execute"),
    "get_neo_lookup response",
  );

  return {
    nearEarthObject: normalizeNearEarthObject(payload),
  };
}

async function executeSearchNearEarthObjects(
  input: Record<string, unknown>,
  context: NasaActionContext,
): Promise<unknown> {
  const startDate = readInputString(input.startDate, "startDate");
  const endDate = optionalString(input.endDate);
  validateNeoSearchWindow(startDate, endDate);
  const payload = readResponseObject(
    await nasaGetJson(
      "/neo/rest/v1/feed",
      compactObject({
        start_date: startDate,
        end_date: endDate,
      }),
      context,
      "execute",
    ),
    "search_near_earth_objects response",
  );

  const grouped = readResponseObject(payload.near_earth_objects, "near_earth_objects");
  const nearEarthObjectsByDate = Object.fromEntries(
    Object.entries(grouped).map(([date, items]) => [
      date,
      readResponseArray(items, `near_earth_objects.${date}`).map((item) =>
        normalizeNearEarthObject(readResponseObject(item, `near_earth_objects.${date}[]`)),
      ),
    ]),
  );

  return {
    links: normalizeLinks(payload.links),
    elementCount: readRequiredNumber(payload.element_count, "element_count"),
    nearEarthObjectsByDate,
  };
}

async function executeDonkiList(
  path: string,
  input: Record<string, unknown>,
  context: NasaActionContext,
): Promise<unknown> {
  const payload = readResponseArray(
    await nasaGetJson(path, buildDonkiQuery(input), context, "execute"),
    `${path} response`,
  );

  return {
    items: payload.map((item, index) => readResponseObject(item, `${path}[${index}]`)),
  };
}

async function executeEpicImages(
  kind: EpicImageKind,
  date: string | undefined,
  context: NasaActionContext,
): Promise<unknown> {
  const path = date ? `/EPIC/api/${kind}/date/${date}` : `/EPIC/api/${kind}`;
  const payload = readResponseArray(await nasaGetJson(path, {}, context, "execute"), `${path} response`);

  return {
    images: payload.map((item, index) => normalizeEpicImage(readResponseObject(item, `${path}[${index}]`), kind)),
  };
}

async function executeEpicDateList(kind: EpicImageKind, context: NasaActionContext): Promise<unknown> {
  try {
    const payload = readResponseArray(
      await nasaGetJson(`/EPIC/api/${kind}/all`, {}, context, "execute"),
      `/EPIC/api/${kind}/all response`,
    );

    return {
      dates: normalizeEpicDates(payload),
    };
  } catch (error) {
    if (!(error instanceof ProviderRequestError) || error.status !== 404) {
      throw error;
    }

    const fallbackPayload = readResponseArray(
      await nasaGetJson(`/EPIC/api/${kind}/available`, {}, context, "execute"),
      `/EPIC/api/${kind}/available response`,
    );

    return {
      dates: normalizeEpicDates(fallbackPayload),
    };
  }
}

function buildDonkiQuery(input: Record<string, unknown>): Record<string, QueryValue> {
  return compactObject({
    startDate: optionalString(input.startDate),
    endDate: optionalString(input.endDate),
    mostAccurateOnly: optionalBoolean(input.mostAccurateOnly),
    completeEntryOnly: optionalBoolean(input.completeEntryOnly),
    speed: optionalInteger(input.speed),
    halfAngle: optionalInteger(input.halfAngle),
    catalog: optionalString(input.catalog),
    keyword: optionalString(input.keyword),
    location: optionalString(input.location),
    type: optionalString(input.type),
  });
}

async function nasaGetJson(
  path: string,
  query: Record<string, QueryValue>,
  context: NasaActionContext,
  phase: NasaRequestPhase,
): Promise<unknown> {
  const url = new URL(path, nasaApiBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  url.searchParams.set("api_key", context.apiKey);

  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal: context.signal,
    });
    payload = await readNasaPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `NASA request failed: ${error.message}` : "NASA request failed",
    );
  }

  if (!response.ok) {
    throw normalizeNasaError(response, payload, phase);
  }

  return payload;
}

async function readNasaPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function normalizeNasaError(response: Response, payload: unknown, phase: NasaRequestPhase): ProviderRequestError {
  const message = extractNasaErrorMessage(payload) ?? response.statusText ?? "NASA request failed";

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }

  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(response.status, message, payload);
  }

  if (response.status === 400 || response.status === 404) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(response.status || 502, message, payload);
}

function extractNasaErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    return trimmed || undefined;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return firstNonEmptyString(record.msg, record.error, record.message, record.error_message, record.detail);
}

function normalizePage(payload: Record<string, unknown>) {
  return {
    size: readRequiredNumber(payload.size, "page.size"),
    totalElements: readRequiredNumber(payload.total_elements, "page.total_elements"),
    totalPages: readRequiredNumber(payload.total_pages, "page.total_pages"),
    number: readRequiredNumber(payload.number, "page.number"),
  };
}

function normalizeLinks(payload: unknown) {
  const record = readResponseObject(payload, "links");
  return {
    self: readRequiredString(record.self, "links.self"),
    next: readOptionalString(record.next),
    previous: readOptionalString(record.previous),
    prev: readOptionalString(record.prev),
  };
}

function normalizeNearEarthObject(payload: Record<string, unknown>) {
  return {
    id: readRequiredString(payload.id, "id"),
    neoReferenceId: readRequiredString(payload.neo_reference_id, "neo_reference_id"),
    name: readRequiredString(payload.name, "name"),
    nameLimited: readOptionalString(payload.name_limited),
    designation: readOptionalString(payload.designation),
    nasaJplUrl: readRequiredString(payload.nasa_jpl_url, "nasa_jpl_url"),
    absoluteMagnitudeH: readRequiredNumber(payload.absolute_magnitude_h, "absolute_magnitude_h"),
    estimatedDiameter: normalizeEstimatedDiameter(readResponseObject(payload.estimated_diameter, "estimated_diameter")),
    isPotentiallyHazardousAsteroid: readRequiredBoolean(
      payload.is_potentially_hazardous_asteroid,
      "is_potentially_hazardous_asteroid",
    ),
    closeApproachData: readResponseArray(payload.close_approach_data, "close_approach_data").map((item, index) =>
      normalizeCloseApproach(
        readResponseObject(item, `close_approach_data[${index}]`),
        `close_approach_data[${index}]`,
      ),
    ),
    orbitalData: readOptionalObject(payload.orbital_data),
    links: payload.links ? normalizeLinks(payload.links) : undefined,
    isSentryObject: optionalBoolean(payload.is_sentry_object),
    sentryDataUrl: readOptionalString(payload.sentry_data),
  };
}

function normalizeEstimatedDiameter(payload: Record<string, unknown>) {
  return {
    kilometers: normalizeDiameterRange(
      readResponseObject(payload.kilometers, "estimated_diameter.kilometers"),
      "estimated_diameter.kilometers",
    ),
    meters: normalizeDiameterRange(
      readResponseObject(payload.meters, "estimated_diameter.meters"),
      "estimated_diameter.meters",
    ),
    miles: normalizeDiameterRange(
      readResponseObject(payload.miles, "estimated_diameter.miles"),
      "estimated_diameter.miles",
    ),
    feet: normalizeDiameterRange(
      readResponseObject(payload.feet, "estimated_diameter.feet"),
      "estimated_diameter.feet",
    ),
  };
}

function normalizeDiameterRange(payload: Record<string, unknown>, fieldName: string) {
  return {
    estimatedDiameterMin: readRequiredNumber(payload.estimated_diameter_min, `${fieldName}.estimated_diameter_min`),
    estimatedDiameterMax: readRequiredNumber(payload.estimated_diameter_max, `${fieldName}.estimated_diameter_max`),
  };
}

function normalizeCloseApproach(payload: Record<string, unknown>, fieldName: string) {
  return {
    closeApproachDate: readRequiredString(payload.close_approach_date, `${fieldName}.close_approach_date`),
    closeApproachDateFull: readOptionalString(payload.close_approach_date_full),
    epochDateCloseApproach: readOptionalNumber(payload.epoch_date_close_approach),
    relativeVelocity: payload.relative_velocity
      ? normalizeRelativeVelocity(
          readResponseObject(payload.relative_velocity, `${fieldName}.relative_velocity`),
          `${fieldName}.relative_velocity`,
        )
      : undefined,
    missDistance: payload.miss_distance
      ? normalizeMissDistance(
          readResponseObject(payload.miss_distance, `${fieldName}.miss_distance`),
          `${fieldName}.miss_distance`,
        )
      : undefined,
    orbitingBody: readRequiredString(payload.orbiting_body, `${fieldName}.orbiting_body`),
  };
}

function normalizeRelativeVelocity(payload: Record<string, unknown>, fieldName: string) {
  return {
    kilometersPerSecond: readRequiredString(payload.kilometers_per_second, `${fieldName}.kilometers_per_second`),
    kilometersPerHour: readRequiredString(payload.kilometers_per_hour, `${fieldName}.kilometers_per_hour`),
    milesPerHour: readRequiredString(payload.miles_per_hour, `${fieldName}.miles_per_hour`),
  };
}

function normalizeMissDistance(payload: Record<string, unknown>, fieldName: string) {
  return {
    astronomical: readRequiredString(payload.astronomical, `${fieldName}.astronomical`),
    lunar: readRequiredString(payload.lunar, `${fieldName}.lunar`),
    kilometers: readRequiredString(payload.kilometers, `${fieldName}.kilometers`),
    miles: readRequiredString(payload.miles, `${fieldName}.miles`),
  };
}

function normalizeEpicImage(payload: Record<string, unknown>, kind: EpicImageKind) {
  const image = readRequiredString(payload.image, "image");
  const date = readRequiredString(payload.date, "date");

  return {
    identifier: readRequiredString(payload.identifier, "identifier"),
    caption: readRequiredString(payload.caption, "caption"),
    image,
    version: readOptionalString(payload.version),
    date,
    archivePath: buildEpicArchivePath(kind, image, date),
    centroidCoordinates: payload.centroid_coordinates
      ? normalizeEpicCoordinate(
          readResponseObject(payload.centroid_coordinates, "centroid_coordinates"),
          "centroid_coordinates",
        )
      : undefined,
    dscovrJ2000Position: payload.dscovr_j2000_position
      ? normalizeEpicPosition(
          readResponseObject(payload.dscovr_j2000_position, "dscovr_j2000_position"),
          "dscovr_j2000_position",
        )
      : undefined,
    lunarJ2000Position: payload.lunar_j2000_position
      ? normalizeEpicPosition(
          readResponseObject(payload.lunar_j2000_position, "lunar_j2000_position"),
          "lunar_j2000_position",
        )
      : undefined,
    sunJ2000Position: payload.sun_j2000_position
      ? normalizeEpicPosition(
          readResponseObject(payload.sun_j2000_position, "sun_j2000_position"),
          "sun_j2000_position",
        )
      : undefined,
    attitudeQuaternions: payload.attitude_quaternions
      ? normalizeEpicAttitude(
          readResponseObject(payload.attitude_quaternions, "attitude_quaternions"),
          "attitude_quaternions",
        )
      : undefined,
    coords: payload.coords ? normalizeEpicCoords(readResponseObject(payload.coords, "coords")) : undefined,
  };
}

function normalizeEpicDates(payload: unknown[]) {
  return payload.map((item, index) => {
    if (typeof item === "string") {
      return item;
    }

    const record = readResponseObject(item, `epic_dates[${index}]`);
    return readRequiredString(record.date, `epic_dates[${index}].date`);
  });
}

function normalizeEpicCoords(payload: Record<string, unknown>) {
  return {
    centroidCoordinates: payload.centroid_coordinates
      ? normalizeEpicCoordinate(
          readResponseObject(payload.centroid_coordinates, "coords.centroid_coordinates"),
          "coords.centroid_coordinates",
        )
      : undefined,
    dscovrJ2000Position: payload.dscovr_j2000_position
      ? normalizeEpicPosition(
          readResponseObject(payload.dscovr_j2000_position, "coords.dscovr_j2000_position"),
          "coords.dscovr_j2000_position",
        )
      : undefined,
    lunarJ2000Position: payload.lunar_j2000_position
      ? normalizeEpicPosition(
          readResponseObject(payload.lunar_j2000_position, "coords.lunar_j2000_position"),
          "coords.lunar_j2000_position",
        )
      : undefined,
    sunJ2000Position: payload.sun_j2000_position
      ? normalizeEpicPosition(
          readResponseObject(payload.sun_j2000_position, "coords.sun_j2000_position"),
          "coords.sun_j2000_position",
        )
      : undefined,
    attitudeQuaternions: payload.attitude_quaternions
      ? normalizeEpicAttitude(
          readResponseObject(payload.attitude_quaternions, "coords.attitude_quaternions"),
          "coords.attitude_quaternions",
        )
      : undefined,
  };
}

function normalizeEpicCoordinate(payload: Record<string, unknown>, fieldName: string) {
  return {
    lat: readRequiredNumber(payload.lat, `${fieldName}.lat`),
    lon: readRequiredNumber(payload.lon, `${fieldName}.lon`),
  };
}

function normalizeEpicPosition(payload: Record<string, unknown>, fieldName: string) {
  return {
    x: readRequiredNumber(payload.x, `${fieldName}.x`),
    y: readRequiredNumber(payload.y, `${fieldName}.y`),
    z: readRequiredNumber(payload.z, `${fieldName}.z`),
  };
}

function normalizeEpicAttitude(payload: Record<string, unknown>, fieldName: string) {
  return {
    q0: readRequiredNumber(payload.q0, `${fieldName}.q0`),
    q1: readRequiredNumber(payload.q1, `${fieldName}.q1`),
    q2: readRequiredNumber(payload.q2, `${fieldName}.q2`),
    q3: readRequiredNumber(payload.q3, `${fieldName}.q3`),
  };
}

function buildEpicArchivePath(kind: EpicImageKind, image: string, date: string) {
  const [year, month, day] = date.slice(0, 10).split("-");
  return `/EPIC/archive/${kind}/${year}/${month}/${day}/png/${image}.png`;
}

function validateNeoSearchWindow(startDate: string, endDate: string | undefined): void {
  if (!endDate) {
    return;
  }

  const startTime = new Date(`${startDate}T00:00:00.000Z`).getTime();
  const endTime = new Date(`${endDate}T00:00:00.000Z`).getTime();
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) {
    throw new ProviderRequestError(400, "startDate and endDate must be valid dates.");
  }

  const diffDays = (endTime - startTime) / 86_400_000;
  if (diffDays < 0) {
    throw new ProviderRequestError(400, "endDate must be on or after startDate.");
  }
  if (diffDays > 7) {
    throw new ProviderRequestError(400, "NASA NeoWs searches cannot exceed 7 days.");
  }
}

function readResponseObject(value: unknown, fieldName: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, `NASA response missing object field: ${fieldName}`);
  }

  return object;
}

function readResponseArray(value: unknown, fieldName: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `NASA response missing array field: ${fieldName}`);
  }

  return value;
}

function readRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value === "") {
    throw new ProviderRequestError(502, `NASA response missing string field: ${fieldName}`);
  }

  return value;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function readRequiredNumber(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new ProviderRequestError(502, `NASA response missing numeric field: ${fieldName}`);
  }

  return value;
}

function readOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && !Number.isNaN(value) ? value : undefined;
}

function readRequiredBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== "boolean") {
    throw new ProviderRequestError(502, `NASA response missing boolean field: ${fieldName}`);
  }

  return value;
}

function readOptionalObject(value: unknown): Record<string, unknown> | undefined {
  return optionalRecord(value);
}

function readInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function firstNonEmptyString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim() !== "") {
      return value;
    }
  }

  return undefined;
}
