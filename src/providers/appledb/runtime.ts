import type { ProviderActionHandlers, ProviderFetch } from "../provider-runtime.ts";

import { looseArray, objectArray, optionalBoolean, optionalInteger, optionalString } from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import {
  ProviderRequestError,
  providerResponseError,
  providerUserAgent,
  readProviderErrorTextBody,
  readProviderJsonBody,
  readProviderTextBody,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";

const appledbApiBaseUrl = "https://api.appledb.dev";
const appledbJsonMaxBytes = 2 * 1024 * 1024;
const appledbCalendarMaxBytes = 5 * 1024 * 1024;
const defaultSearchLimit = 20;

export interface AppleDbActionContext {
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

interface RankedDevice {
  device: Record<string, unknown>;
  rank: number;
  name: string;
}

interface AppleDbCalendarBuild {
  key: string;
  os: string;
  version: string;
  build: string;
  released: string;
  summary: string;
  url?: string;
  searchText: string;
}

/**
 * AppleDB handlers for exact device/build lookup and bounded catalog search.
 */
export const appledbActionHandlers: ProviderActionHandlers<
  "appledb",
  (input: Record<string, unknown>, context: AppleDbActionContext) => Promise<unknown>
> = {
  async get_device(input, context): Promise<unknown> {
    const key = requiredInputString(input.key, "key");
    const payload = await requestAppleDbJson(`/device/${encodePathSegment(key)}.json`, context, appledbJsonMaxBytes);
    return requiredResponseRecord(payload, "AppleDB device response");
  },

  async search_devices(input, context): Promise<unknown> {
    const query = requiredInputString(input.query, "query").toLocaleLowerCase();
    const type = optionalString(input.type)?.toLocaleLowerCase();
    const limit = optionalInteger(input.limit) ?? defaultSearchLimit;
    const payload = await requestAppleDbJson("/device/main.json", context, appledbJsonMaxBytes);
    const devices = objectArray(payload, "AppleDB device search response", providerResponseError);
    const matches: RankedDevice[] = [];

    for (const device of devices) {
      const deviceType = optionalString(device.type);
      if (type && deviceType?.toLocaleLowerCase() !== type) {
        continue;
      }
      const rank = deviceMatchRank(device, query);
      const name = optionalString(device.name);
      if (rank !== undefined && name && optionalString(device.key) && deviceType) {
        matches.push({ device, rank, name });
      }
    }

    matches.sort((left, right) => left.rank - right.rank || left.name.localeCompare(right.name));
    const results = matches.slice(0, limit).map(({ device }) => compactDeviceSearchResult(device));
    return {
      devices: results,
      count: results.length,
      total_matches: matches.length,
      truncated: matches.length > results.length,
    };
  },

  async get_os_build(input, context): Promise<unknown> {
    const os = requiredInputString(input.os, "os");
    const build = requiredInputString(input.build, "build");
    const key = `${os};${build}`;
    const payload = await requestAppleDbJson(`/ios/${encodePathSegment(key)}.json`, context, appledbJsonMaxBytes);
    const record = requiredResponseRecord(payload, "AppleDB operating system build response");
    if (optionalBoolean(input.include_sources) === true) {
      return record;
    }
    const { sources: _sources, ...compactRecord } = record;
    return compactRecord;
  },

  async search_os_builds(input, context): Promise<unknown> {
    const osType = requiredInputString(input.os_type, "os_type");
    const query = requiredInputString(input.query, "query").toLocaleLowerCase();
    const limit = optionalInteger(input.limit) ?? defaultSearchLimit;
    const calendar = await requestAppleDbCalendar(`/ios/${encodePathSegment(osType)}/main.ics`, context);
    const matches = parseAppleDbCalendar(calendar).filter((entry) => entry.searchText.includes(query));
    const results = matches.slice(0, limit).map(({ searchText: _searchText, ...entry }) => entry);
    return {
      builds: results,
      count: results.length,
      total_matches: matches.length,
      truncated: matches.length > results.length,
    };
  },
};

async function requestAppleDbJson(path: string, context: AppleDbActionContext, maxBytes: number): Promise<unknown> {
  return runProviderRequest({ signal: context.signal, label: "AppleDB" }, async (signal) => {
    const response = await context.fetcher(`${appledbApiBaseUrl}${path}`, {
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal,
    });
    if (!response.ok) {
      throw new ProviderRequestError(
        response.status,
        (await readProviderErrorTextBody(response, "AppleDB error response")) ||
          `AppleDB request failed with HTTP ${response.status}`,
      );
    }
    return readProviderJsonBody(response, {
      emptyBody: null,
      invalidJsonMessage: "AppleDB returned invalid JSON.",
      maxBytes,
    });
  });
}

async function requestAppleDbCalendar(path: string, context: AppleDbActionContext): Promise<string> {
  return runProviderRequest({ signal: context.signal, label: "AppleDB" }, async (signal) => {
    const response = await context.fetcher(`${appledbApiBaseUrl}${path}`, {
      headers: {
        accept: "text/calendar",
        "user-agent": providerUserAgent,
      },
      signal,
    });
    if (!response.ok) {
      throw new ProviderRequestError(
        response.status,
        (await readProviderErrorTextBody(response, "AppleDB calendar error response")) ||
          `AppleDB calendar request failed with HTTP ${response.status}`,
      );
    }
    return readProviderTextBody(response, "AppleDB calendar response", appledbCalendarMaxBytes);
  });
}

function deviceMatchRank(device: Record<string, unknown>, query: string): number | undefined {
  const values = [
    optionalString(device.key),
    optionalString(device.name),
    optionalString(device.type),
    optionalString(device.arch),
    ...looseArray(device.identifier).map(optionalString),
    ...looseArray(device.alias).map(optionalString),
    ...looseArray(device.model).map(optionalString),
    ...looseArray(device.board).map(optionalString),
    ...looseArray(device.soc).map(optionalString),
  ]
    .filter((value): value is string => value !== undefined)
    .map((value) => value.toLocaleLowerCase());

  if (values.some((value) => value === query)) {
    return 0;
  }
  if (values.some((value) => value.startsWith(query))) {
    return 1;
  }
  if (values.some((value) => value.includes(query))) {
    return 2;
  }
  return undefined;
}

function compactDeviceSearchResult(device: Record<string, unknown>): Record<string, unknown> {
  return {
    key: device.key,
    name: device.name,
    type: device.type,
    identifier: device.identifier,
    model: device.model,
    soc: device.soc,
    released: device.released,
    discontinued: device.discontinued,
  };
}

function parseAppleDbCalendar(calendar: string): AppleDbCalendarBuild[] {
  const lines = unfoldCalendarLines(calendar);
  const builds: AppleDbCalendarBuild[] = [];
  let event: Record<string, string> | undefined;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      event = {};
      continue;
    }
    if (line === "END:VEVENT") {
      if (event) {
        const build = calendarEventToBuild(event);
        if (build) {
          builds.push(build);
        }
      }
      event = undefined;
      continue;
    }
    if (!event) {
      continue;
    }
    const separatorIndex = line.indexOf(":");
    if (separatorIndex < 1) {
      continue;
    }
    const property = line.slice(0, separatorIndex).split(";", 1)[0]!;
    event[property] = unescapeCalendarValue(line.slice(separatorIndex + 1));
  }

  return builds;
}

function unfoldCalendarLines(calendar: string): string[] {
  const lines: string[] = [];
  for (const line of calendar.replaceAll("\r\n", "\n").split("\n")) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }
  return lines;
}

function calendarEventToBuild(event: Record<string, string>): AppleDbCalendarBuild | undefined {
  const uid = optionalString(event.UID);
  const summary = optionalString(event.SUMMARY);
  const released = calendarDate(optionalString(event.DTSTART));
  if (!uid || !summary || !released) {
    return undefined;
  }
  const uidParts = uid.split(";");
  if (uidParts.length < 4 || uidParts[0] !== "APPLEDB" || uidParts[1] !== "FIRMWARE") {
    return undefined;
  }
  const os = optionalString(uidParts[2]);
  const build = optionalString(uidParts.slice(3).join(";"));
  if (!os || !build) {
    return undefined;
  }
  const versionPrefix = `${os} `;
  const versionSuffix = ` (${build})`;
  const version =
    summary.startsWith(versionPrefix) && summary.endsWith(versionSuffix)
      ? summary.slice(versionPrefix.length, -versionSuffix.length)
      : summary;
  const description = event.DESCRIPTION ?? "";
  const url = description.match(/https:\/\/appledb\.dev\/firmware\/[^\s]+/u)?.[0];
  return {
    key: `${os};${build}`,
    os,
    version,
    build,
    released,
    summary,
    url,
    searchText: `${uid}\n${summary}\n${description}`.toLocaleLowerCase(),
  };
}

function calendarDate(value: string | undefined): string | undefined {
  if (!value || !/^\d{8}$/u.test(value)) {
    return undefined;
  }
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function unescapeCalendarValue(value: string): string {
  return value.replace(/\\([nN,;\\])/gu, (_match, escaped: string) => {
    if (escaped === "n" || escaped === "N") {
      return "\n";
    }
    return escaped;
  });
}
