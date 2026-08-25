import type { ChengxinActionName } from "./actions.ts";

import {
  compactObject,
  optionalRecord as asOptionalObject,
  optionalString as asOptionalString,
} from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

function requiredApiKey(input: { apiKey?: string }): string {
  if (input.apiKey?.trim()) return input.apiKey.trim();
  throw new ProviderRequestError(400, "apiKey is required");
}

export const chengxinApiBaseUrl = "https://wx.17u.cn/skills/gateway/api/v1/gateway";
export const chengxinApiVersion = "0.9.0";

const chengxinRequestTimeoutMs = 20_000;
const chengxinMaxResponseBytes = 10 * 1024 * 1024;
const chengxinChannel = "webchat";
const chengxinSurface = "webchat";
const chengxinGroupDescriptionField = "__chengxinGroupDescription";

type ChengxinRequestPhase = "validate" | "execute";

const chengxinPathByAction = {
  search_flights: "/flightResource",
  search_trains: "/trainResource",
  search_hotels: "/hotelResource",
  search_attractions: "/sceneryResource",
  search_travel: "/travelResource",
  search_transport: "/trafficResource",
  search_buses: "/busResource",
} as const satisfies Record<ChengxinActionName, string>;

export async function validateChengxinCredential(
  input: { apiKey?: string },
  fetcher: typeof fetch,
): Promise<{
  accountLabel: string;
  providerScopes: string[];
  providerMetadata: Record<string, unknown>;
}> {
  const apiKey = requireChengxinApiKey(input);
  await requestChengxin(
    "/hotelResource",
    {
      destination: "苏州",
    },
    apiKey,
    fetcher,
    "validate",
  );

  return {
    accountLabel: "Tongcheng Chengxin API Key",
    providerScopes: [],
    providerMetadata: {
      apiBaseUrl: chengxinApiBaseUrl,
      apiVersion: chengxinApiVersion,
      validationEndpoint: "/hotelResource",
    },
  };
}

export function requireChengxinApiKey(input: { apiKey?: string }): string {
  const apiKey = requiredApiKey(input);
  if (apiKey.length > 4096 || hasControlCharacters(apiKey)) {
    throw new ProviderRequestError(400, "Chengxin API key has an invalid format");
  }
  return apiKey;
}

export async function executeChengxinAction(
  actionName: ChengxinActionName,
  input: Record<string, unknown>,
  apiKey: string,
  fetcher: typeof fetch,
): Promise<unknown> {
  const data = await requestChengxin(
    chengxinPathByAction[actionName],
    buildChengxinRequestBody(actionName, input),
    apiKey,
    fetcher,
    "execute",
  );

  return normalizeChengxinOutput(actionName, data);
}

function buildChengxinRequestBody(actionName: ChengxinActionName, input: Record<string, unknown>) {
  const common = {
    extra: input.extra,
  };

  switch (actionName) {
    case "search_flights":
      return compactObject({
        departure: input.departure,
        destination: input.destination,
        flightNumber: input.flightNumber,
        lowPrice: input.lowPrice ?? false,
        ...common,
      });
    case "search_trains":
      return compactObject({
        departure: input.departure,
        destination: input.destination,
        departureStation: input.departureStation,
        arrivalStation: input.arrivalStation,
        trainNumber: input.trainNumber,
        ...common,
      });
    case "search_buses":
      return compactObject({
        departure: input.departure,
        destination: input.destination,
        departureStation: input.departureStation,
        arrivalStation: input.arrivalStation,
        ...common,
      });
    case "search_hotels":
    case "search_attractions":
      return compactObject({
        destination: input.destination,
        ...common,
      });
    case "search_travel":
    case "search_transport":
      return compactObject({
        departure: input.departure,
        destination: input.destination,
        ...common,
      });
    default:
      return assertUnreachableAction(actionName);
  }
}

async function requestChengxin(
  path: string,
  body: Record<string, unknown>,
  apiKey: string,
  fetcher: typeof fetch,
  phase: ChengxinRequestPhase,
) {
  const timeoutSignal = AbortSignal.timeout(chengxinRequestTimeoutMs);

  try {
    const response = await fetcher(new URL(`${chengxinApiBaseUrl}${path}`), {
      method: "POST",
      headers: {
        accept: "application/json, text/plain, */*",
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        origin: "https://www.ly.com",
        referer: "https://www.ly.com/",
        "user-agent": providerUserAgent,
      },
      body: JSON.stringify({
        ...body,
        channel: chengxinChannel,
        surface: chengxinSurface,
        version: chengxinApiVersion,
      }),
      signal: timeoutSignal,
    });
    const payload = await readChengxinPayload(response);
    if (!response.ok) {
      throw createChengxinError({
        phase,
        status: response.status,
        code: readCode(payload),
        message: readMessage(payload),
      });
    }

    return unwrapChengxinData(payload, phase);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    if (timeoutSignal.aborted || isAbortError(error)) {
      throw new ProviderRequestError(504, "Tongcheng Chengxin request timed out");
    }

    throw new ProviderRequestError(502, "Tongcheng Chengxin request failed");
  }
}

async function readChengxinPayload(response: Response) {
  const text = await readChengxinResponseText(response);
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (!response.ok) {
      return null;
    }
    throw new ProviderRequestError(502, "Tongcheng Chengxin returned invalid JSON");
  }
}

async function readChengxinResponseText(response: Response) {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > chengxinMaxResponseBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw chengxinResponseTooLargeError();
  }
  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) {
        break;
      }
      totalBytes += chunk.value.byteLength;
      if (totalBytes > chengxinMaxResponseBytes) {
        await reader.cancel().catch(() => undefined);
        throw chengxinResponseTooLargeError();
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function chengxinResponseTooLargeError() {
  return new ProviderRequestError(413, `Tongcheng Chengxin response exceeds ${chengxinMaxResponseBytes} bytes`);
}

function unwrapChengxinData(payload: unknown, phase: ChengxinRequestPhase) {
  let current = asOptionalObject(payload);
  if (!current) {
    throw new ProviderRequestError(502, "Tongcheng Chengxin returned an empty response");
  }

  let unwrappedSuccessfulEnvelope = false;

  for (let depth = 0; depth < 4; depth += 1) {
    const code = readCode(current);
    if (code === undefined) {
      if (unwrappedSuccessfulEnvelope) {
        return current;
      }
      throw new ProviderRequestError(502, "Tongcheng Chengxin response did not include a result code");
    }

    if (code === "1") {
      return {};
    }

    if (code !== "0") {
      throw createChengxinError({
        phase,
        status: numericStatus(code),
        code,
        message: readMessage(current),
      });
    }

    unwrappedSuccessfulEnvelope = true;
    const next = asOptionalObject(current.data);
    if (!next) {
      throw new ProviderRequestError(502, "Tongcheng Chengxin success response did not include object data");
    }
    current = next;
  }

  throw new ProviderRequestError(502, "Tongcheng Chengxin response envelope is nested too deeply");
}

function createChengxinError(input: { phase: ChengxinRequestPhase; status: number; code?: string; message?: string }) {
  const message =
    input.message ??
    (input.code
      ? `Tongcheng Chengxin request failed with code ${input.code}`
      : `Tongcheng Chengxin request failed with status ${input.status}`);

  if (input.status === 429 || input.code === "429") {
    return new ProviderRequestError(429, message);
  }

  if (
    input.status === 401 ||
    input.status === 403 ||
    input.code === "3" ||
    input.code === "401" ||
    input.code === "403"
  ) {
    return input.phase === "validate" ? new ProviderRequestError(400, message) : new ProviderRequestError(409, message);
  }

  if (input.status >= 400 && input.status < 500) {
    return new ProviderRequestError(400, message);
  }

  return new ProviderRequestError(input.status || 502, message);
}

function normalizeChengxinOutput(actionName: ChengxinActionName, data: Record<string, unknown>) {
  const answer = text(data.answer);
  const flights = readFlightRecords(data);
  const trains = readResourceRecords(data, "trainDataList", "trainList").map(normalizeTrain);
  const buses = readResourceRecords(data, "busDataList", "busList").map(normalizeBus);
  const supplementalTransport = readSupplementalTransport(data);
  const hotels = readResourceRecords(data, "hotelDataList", "hotelList").map(normalizeHotel);
  const attractions = readResourceRecords(data, "sceneryDataList", "sceneryList").map(normalizeScenery);

  switch (actionName) {
    case "search_flights":
      return { answer, flights, supplementalTransport };
    case "search_trains":
      return { answer, trains };
    case "search_buses":
      return { answer, buses };
    case "search_hotels":
      return { answer, hotels };
    case "search_attractions":
      return { answer, attractions };
    case "search_transport":
      return {
        answer,
        flights,
        trains,
        buses,
        supplementalTransport,
        transitRoutes: normalizeTransitRoutes(data.transitRoute),
      };
    case "search_travel":
      return {
        answer,
        flights,
        trains,
        buses,
        supplementalTransport,
        hotels,
        attractions,
        products: readResourceRecords(data, "tripDataList", "tripList").map(normalizeTravelProduct),
        plans: readPlanRecords(data),
        articles: readResourceRecords(data, "ugcDataList", "ugcList").map(normalizeArticle),
      };
    default:
      return assertUnreachableAction(actionName);
  }
}

function readFlightRecords(data: Record<string, unknown>) {
  const flights: ReturnType<typeof normalizeFlight>[] = [];
  for (const [groupIndex, groupValue] of asArray(data.flightDataList).entries()) {
    const group = asOptionalObject(groupValue);
    if (!group) {
      continue;
    }

    pushNormalizedFlights(flights, group.flightList, groupIndex, text(group.desc));
  }
  return flights;
}

function pushNormalizedFlights(
  target: ReturnType<typeof normalizeFlight>[],
  value: unknown,
  groupIndex: number,
  groupDescription: string | null,
) {
  for (const item of asArray(value)) {
    const record = asOptionalObject(item);
    if (record) {
      target.push(normalizeFlight(record, groupIndex, groupDescription));
    }
  }
}

function readSupplementalTransport(data: Record<string, unknown>) {
  const segments: ReturnType<typeof normalizeSupplementalTransport>[] = [];
  for (const [groupIndex, groupValue] of asArray(data.flightDataList).entries()) {
    const group = asOptionalObject(groupValue);
    if (!group) {
      continue;
    }

    pushSupplementalTransport(segments, group, groupIndex, text(group.desc));
  }
  return segments;
}

function pushSupplementalTransport(
  target: ReturnType<typeof normalizeSupplementalTransport>[],
  container: Record<string, unknown>,
  groupIndex: number,
  groupDescription: string | null,
) {
  const beforeDeparture = target.length;
  pushNormalizedSupplementalTransport(
    target,
    container.supplementDepartTrafficList,
    "to_departure_airport",
    groupIndex,
    groupDescription,
  );
  const hasCurrentDeparture = target.length > beforeDeparture;

  const beforeDestination = target.length;
  pushNormalizedSupplementalTransport(
    target,
    container.supplementDestTrafficList,
    "from_arrival_airport",
    groupIndex,
    groupDescription,
  );
  const hasCurrentDestination = target.length > beforeDestination;

  const legacyType = text(container.supplementTrafficType);
  const legacyDirection = legacySupplementDirection(legacyType);
  if (
    (legacyDirection === "to_departure_airport" && hasCurrentDeparture) ||
    (legacyDirection === "from_arrival_airport" && hasCurrentDestination) ||
    (legacyDirection === null && (hasCurrentDeparture || hasCurrentDestination))
  ) {
    return;
  }
  pushNormalizedSupplementalTransport(
    target,
    container.supplementTrafficList,
    legacyDirection,
    groupIndex,
    groupDescription,
  );
}

function pushNormalizedSupplementalTransport(
  target: ReturnType<typeof normalizeSupplementalTransport>[],
  value: unknown,
  direction: "to_departure_airport" | "from_arrival_airport" | null,
  groupIndex: number,
  groupDescription: string | null,
) {
  for (const item of asArray(value)) {
    const record = asOptionalObject(item);
    if (record) {
      target.push(normalizeSupplementalTransport(record, direction, groupIndex, groupDescription));
    }
  }
}

function legacySupplementDirection(value: string | null) {
  if (value === "pre") {
    return "to_departure_airport" as const;
  }
  if (value === "suffix") {
    return "from_arrival_airport" as const;
  }
  return null;
}

function readResourceRecords(data: Record<string, unknown>, dataListKey: string, listKey: string) {
  const records: Record<string, unknown>[] = [];
  for (const groupValue of asArray(data[dataListKey])) {
    const group = asOptionalObject(groupValue);
    if (!group) {
      continue;
    }

    for (const item of asArray(group[listKey])) {
      const record = asOptionalObject(item);
      if (record) {
        records.push({
          ...record,
          [chengxinGroupDescriptionField]: text(group.desc),
        });
      }
    }
  }
  return records;
}

function readPlanRecords(data: Record<string, unknown>) {
  return asArray(data.tripPlanDataList)
    .map((value) => asOptionalObject(value))
    .filter((value): value is Record<string, unknown> => Boolean(value));
}

function pushObjects(target: Record<string, unknown>[], value: unknown) {
  for (const item of asArray(value)) {
    const record = asOptionalObject(item);
    if (record) {
      target.push(record);
    }
  }
}

function normalizeFlight(record: Record<string, unknown>, groupIndex: number, groupDescription: string | null) {
  return {
    groupIndex,
    groupDescription,
    flightNumber: text(record.flightNo ?? record.flightNumber),
    departureName: text(record.depName ?? record.departureName),
    arrivalName: text(record.arrName ?? record.arrivalName),
    week: text(record.week),
    airline: text(record.airlineName ?? record.airline),
    departureAirport: text(record.depAirportName ?? record.departureAirport),
    departureTerminal: text(record.depAirportTerminal ?? record.departureTerminal),
    arrivalAirport: text(record.arrAirportName ?? record.arrivalAirport),
    arrivalTerminal: text(record.arrAirportTerminal ?? record.arrivalTerminal),
    departureDate: text(record.depDate ?? record.departureDate),
    departureTime: text(record.depTime ?? record.departureTime),
    arrivalDate: text(record.arrDate ?? record.arrivalDate),
    arrivalTime: text(record.arrTime ?? record.arrivalTime),
    duration: text(record.runTime ?? record.duration),
    price: text(record.price),
    discount: text(record.discount),
    originalPrice: text(record.originPrice ?? record.originalPrice),
    tripType: text(record.tripType),
    segments: normalizeTransferSegments(record.segmentList),
    transfers: normalizeTransferInfo(record.transferInfoList),
    bookingUrl: bookingUrl(record),
  };
}

function normalizeTrain(record: Record<string, unknown>) {
  const tickets = normalizeTickets(record.ticketList);

  return {
    groupDescription: text(record[chengxinGroupDescriptionField]),
    trainNumber: text(record.trainNo ?? record.trafficNo ?? record.trainNumber),
    trainType: text(record.trainType ?? record.segmentType),
    departureStation: text(record.depStationName ?? record.departureStation),
    arrivalStation: text(record.arrStationName ?? record.arrivalStation),
    departureDate: text(record.depDate ?? record.departureDate),
    departureTime: text(record.depTime ?? record.departureTime),
    arrivalDate: text(record.arrDate ?? record.arrivalDate),
    arrivalTime: text(record.arrTime ?? record.arrivalTime),
    duration: text(record.runTime ?? record.duration),
    price: text(record.price ?? tickets[0]?.price),
    tickets,
    tripType: text(record.tripType),
    segments: normalizeTransferSegments(record.segmentList),
    transfers: normalizeTransferInfo(record.transferInfoList),
    bookingUrl: bookingUrl(record),
  };
}

function normalizeSupplementalTransport(
  record: Record<string, unknown>,
  direction: "to_departure_airport" | "from_arrival_airport" | null,
  groupIndex: number,
  groupDescription: string | null,
) {
  const tickets = normalizeTickets(record.ticketList);
  return {
    groupIndex,
    groupDescription,
    direction,
    type: text(record.segmentType ?? record.type),
    number: text(record.trafficNo ?? record.trainNo ?? record.coachNo),
    departureStation: text(record.depStationName ?? record.departureStation),
    arrivalStation: text(record.arrStationName ?? record.arrivalStation),
    departureDate: text(record.depDate ?? record.departureDate),
    departureTime: text(record.depTime ?? record.departureTime),
    arrivalDate: text(record.arrDate ?? record.arrivalDate),
    arrivalTime: text(record.arrTime ?? record.arrivalTime),
    duration: text(record.runTime ?? record.duration),
    price: text(record.price ?? tickets[0]?.price),
    tickets,
    bookingUrl: bookingUrl(record),
  };
}

function normalizeTickets(value: unknown) {
  return asArray(value)
    .map((item) => asOptionalObject(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((ticket) => ({
      type: text(ticket.ticketType ?? ticket.type),
      price: text(ticket.ticketPrice ?? ticket.price),
      remaining: text(ticket.ticketLeft ?? ticket.remaining),
    }));
}

function normalizeTransferSegments(value: unknown) {
  return asArray(value)
    .map((item) => asOptionalObject(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((segment) => ({
      type: text(segment.segmentType),
      number: text(segment.trafficNo ?? segment.trainCode ?? segment.flightNo),
      departureStation: text(segment.depStationName),
      departureTerminal: text(segment.depAirportTerminal),
      arrivalStation: text(segment.arrStationName),
      arrivalTerminal: text(segment.arrAirportTerminal),
      departureDate: text(segment.depDate),
      departureTime: text(segment.depTime),
      arrivalDate: text(segment.arrDate),
      arrivalTime: text(segment.arrTime),
      durationMinutes: integer(segment.runTimeMinutes),
      seat: text(segment.seatName),
      price: text(segment.price),
    }));
}

function normalizeTransferInfo(value: unknown) {
  return asArray(value)
    .map((item) => asOptionalObject(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((transfer) => ({
      city: text(transfer.transferCityName),
      waitDuration: text(transfer.intervalTimeDesc),
    }));
}

function normalizeTransitRoutes(value: unknown) {
  const transitRoute = asOptionalObject(value);
  if (!transitRoute) {
    return [];
  }

  return asArray(transitRoute.routes)
    .map((item) => asOptionalObject(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((route) => ({
      departure: text(route.departName),
      destination: text(route.destName),
      arrivalTime: text(route.arriveTime),
      durationSeconds: numeric(route.duration),
      distanceMeters: numeric(route.distance),
      price: nonNegativeNumber(route.price),
      steps: normalizeTransitSteps(route.steps),
    }));
}

function normalizeTransitSteps(value: unknown) {
  const steps: Record<string, unknown>[] = [];
  for (const group of asArray(value)) {
    if (Array.isArray(group)) {
      pushObjects(steps, group);
      continue;
    }
    const step = asOptionalObject(group);
    if (step) {
      steps.push(step);
    }
  }

  return steps.map((step) => {
    const vehicle = asOptionalObject(step.vehicleInfo);
    const detail = asOptionalObject(vehicle?.detail);
    return {
      type: text(step.stepType),
      instructions: text(step.instructions),
      distanceMeters: numeric(step.distance),
      durationSeconds: numeric(step.duration),
      vehicleType: integer(vehicle?.type),
      lineName: text(detail?.name),
      direction: text(detail?.directText),
      departureStation: text(detail?.onStation ?? detail?.departureStation),
      arrivalStation: text(detail?.offStation ?? detail?.arriveStation),
      stopCount: integer(detail?.stopNum),
      firstDepartureTime: text(detail?.firstTime),
      lastDepartureTime: text(detail?.lastTime),
    };
  });
}

function normalizeBus(record: Record<string, unknown>) {
  return {
    groupDescription: text(record[chengxinGroupDescriptionField]),
    coachNumber: text(record.coachNo ?? record.busNo),
    coachType: text(record.coachType ?? record.busType),
    departureCity: text(record.depCityName ?? record.departureCity),
    arrivalCity: text(record.arrCityName ?? record.arrivalCity),
    departureStation: text(record.depStationName ?? record.departureStation),
    arrivalStation: text(record.arrStationName ?? record.arrivalStation),
    departureDate: text(record.depDate ?? record.departureDate),
    departureTime: text(record.depTime ?? record.departureTime),
    arrivalDate: text(record.arrDate ?? record.arrivalDate),
    arrivalTime: text(record.arrTime ?? record.arrivalTime),
    durationMinutes: integer(record.runTimeMinutes ?? record.durationMinutes),
    duration: text(record.runTimeDesc ?? record.runTime ?? record.duration),
    price: text(record.price),
    remainingTickets: text(record.leftTicketNum ?? record.remainingTickets),
    tripType: text(record.tripType),
    segments: normalizeTransferSegments(record.segmentList),
    transfers: normalizeTransferInfo(record.transferInfoList),
    bookingUrl: bookingUrl(record),
  };
}

function normalizeHotel(record: Record<string, unknown>) {
  return {
    groupDescription: text(record[chengxinGroupDescriptionField]),
    id: text(record.resourceId ?? record.hotelId ?? record.id),
    name: text(record.name ?? record.hotelName),
    price: text(record.price),
    star: text(record.star),
    starLevel: text(record.starLevel),
    score: text(record.score),
    reviewCount: text(record.commentNum ?? record.reviewCount),
    description: text(record.describe ?? record.description),
    address: text(record.address),
    city: text(record.cityName ?? record.city),
    district: text(record.countyName ?? record.district),
    businessDistrict: text(record.bdName ?? record.businessDistrict),
    imageUrl: text(record.image ?? record.imageUrl),
    bookingUrl: bookingUrl(record),
  };
}

function normalizeScenery(record: Record<string, unknown>) {
  return {
    groupDescription: text(record[chengxinGroupDescriptionField]),
    id: text(record.resourceId ?? record.sceneryId ?? record.id),
    name: text(record.name),
    city: text(record.cityName ?? record.city),
    star: text(record.star),
    score: text(record.score),
    reviewCount: text(record.commentNum ?? record.reviewCount),
    price: text(record.price),
    description: text(record.describe ?? record.description),
    address: text(record.address),
    theme: text(record.theme),
    openTime: text(record.fullOpenTimeString ?? record.openTime),
    bestPlayTime: text(record.bestPlayTime ?? record.playTime),
    rankTitle: text(record.rankTitle),
    facilities: stringArray(record.facilityList ?? record.facilities),
    imageUrl: text(record.image ?? record.imageUrl),
    bookingUrl: bookingUrl(record),
  };
}

function normalizeTravelProduct(record: Record<string, unknown>) {
  return {
    groupDescription: text(record[chengxinGroupDescriptionField]),
    id: text(record.resourceId ?? record.tripId ?? record.id),
    name: text(record.name),
    price: text(record.price),
    score: text(record.score),
    reviewCount: text(record.commentNum ?? record.reviewCount),
    labels: stringArray(record.labelList ?? record.labels),
    destinations: stringArray(record.destList ?? record.destinations),
    imageUrl: text(record.image ?? record.imageUrl),
    bookingUrl: bookingUrl(record),
  };
}

function normalizeArticle(record: Record<string, unknown>) {
  return {
    name: text(record.name ?? record.title),
    author: text(record.nickName ?? record.author),
    url: text(record.clawRedirectUrl ?? record.redirectUrl ?? record.link ?? record.url),
  };
}

function bookingUrl(record: Record<string, unknown>) {
  return text(record.clawRedirectUrl ?? record.redirectUrl ?? record.pcRedirectUrl ?? record.wakeLyRedirectUrl);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringArray(value: unknown) {
  return asArray(value)
    .map((item) => text(item))
    .filter((item): item is string => item !== null);
}

function text(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return String(value);
  }
  return null;
}

function integer(value: unknown): number | null {
  const parsed = numeric(value);
  return parsed !== null && Number.isInteger(parsed) ? parsed : null;
}

function numeric(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const input = asOptionalString(value)?.trim();
  if (!input) {
    return null;
  }
  const parsed = Number(input);
  return Number.isFinite(parsed) ? parsed : null;
}

function nonNegativeNumber(value: unknown) {
  const parsed = numeric(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
}

function readCode(value: unknown) {
  const record = asOptionalObject(value);
  const code = record?.code;
  if (typeof code === "number" || typeof code === "string") {
    return String(code);
  }
  return undefined;
}

function readMessage(value: unknown) {
  const record = asOptionalObject(value);
  return asOptionalString(record?.message) ?? asOptionalString(record?.msg);
}

function numericStatus(code: string) {
  const status = Number(code);
  return Number.isInteger(status) && status >= 100 && status <= 599 ? status : 502;
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function hasControlCharacters(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 32 || code === 127) {
      return true;
    }
  }
  return false;
}

function assertUnreachableAction(actionName: never): never {
  throw new ProviderRequestError(500, `Tongcheng Chengxin action mapping is missing for ${String(actionName)}`);
}
