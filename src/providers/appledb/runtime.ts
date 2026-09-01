import type { ProviderActionHandlers, ProviderFetch, ReadProviderJsonBodyOptions } from "../provider-runtime.ts";

import { looseArray, objectArray, optionalBoolean, optionalInteger, optionalString } from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import {
  ProviderRequestError,
  providerInputError,
  providerResponseError,
  providerUserAgent,
  readProviderJsonBody,
  readProviderTextBody,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";

const appledbApiBaseUrl = "https://api.appledb.dev";
/**
 * A per-key build file lists every OTA delta ever published for that build and
 * only grows. The largest measured in 2026-09 is `/ios/iPadOS;23E261.json` at
 * 1.43 MiB, and the cap applies before `sources` is dropped, so a compact
 * result still has to read the whole file.
 */
const appledbJsonMaxBytes = 8 * 1024 * 1024;
/**
 * Calendars are served uncompressed and only ever gain events. The largest
 * measured in 2026-09 is the macOS calendar at 3.86 MB.
 */
const appledbCalendarMaxBytes = 16 * 1024 * 1024;
const appledbJsonBodyOptions: ReadProviderJsonBodyOptions = {
  emptyBody: null,
  invalidJsonMessage: "AppleDB returned invalid JSON.",
  maxBytes: appledbJsonMaxBytes,
};
const defaultSearchLimit = 20;
const appledbFirmwarePageUrlPattern = /https:\/\/appledb\.dev\/firmware\/[^\s]+/u;

export interface AppleDbActionContext {
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

interface AppleDbRequest<T> {
  /** Path under the AppleDB API origin, with every caller-supplied segment already guarded. */
  path: string;
  accept: string;
  readBody: (response: Response) => Promise<T>;
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
}

/** A calendar build together with the lowercased text `search_os_builds` matches against. */
interface CalendarSearchEntry {
  build: AppleDbCalendarBuild;
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
    const payload = await requestAppleDb(context, {
      path: `/device/${appledbPathSegment(key, "key")}.json`,
      accept: "application/json",
      readBody: (response) => readProviderJsonBody(response, appledbJsonBodyOptions),
    });
    return requiredResponseRecord(payload, "AppleDB device response");
  },

  async search_devices(input, context): Promise<unknown> {
    const query = requiredInputString(input.query, "query").toLowerCase();
    const type = optionalString(input.type)?.toLowerCase();
    const limit = optionalInteger(input.limit) ?? defaultSearchLimit;
    const payload = await requestAppleDb(context, {
      path: "/device/main.json",
      accept: "application/json",
      readBody: (response) => readProviderJsonBody(response, appledbJsonBodyOptions),
    });
    const devices = objectArray(payload, "AppleDB device search response", providerResponseError);
    const matches: RankedDevice[] = [];

    for (const device of devices) {
      const deviceType = optionalString(device.type);
      if (type && deviceType?.toLowerCase() !== type) {
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
    const payload = await requestAppleDb(context, {
      path: `/ios/${appledbPathSegment(`${os};${build}`, "os and build")}.json`,
      accept: "application/json",
      readBody: (response) => readProviderJsonBody(response, appledbJsonBodyOptions),
    });
    const record = requiredResponseRecord(payload, "AppleDB operating system build response");
    if (optionalBoolean(input.include_sources) === true) {
      return record;
    }
    const { sources: _sources, ...compactRecord } = record;
    return compactRecord;
  },

  async search_os_builds(input, context): Promise<unknown> {
    const osType = requiredInputString(input.os_type, "os_type");
    const query = requiredInputString(input.query, "query").toLowerCase();
    const limit = optionalInteger(input.limit) ?? defaultSearchLimit;
    const calendar = await requestAppleDb(context, {
      path: `/ios/${appledbPathSegment(osType, "os_type")}/main.ics`,
      accept: "text/calendar",
      readBody: (response) => readProviderTextBody(response, "AppleDB calendar response", appledbCalendarMaxBytes),
    });
    const matches = parseAppleDbCalendar(calendar).filter((entry) => entry.searchText.includes(query));
    // AppleDB publishes calendar events in neither ascending nor descending
    // order, so the result limit would otherwise drop the newest builds.
    matches.sort(
      (left, right) =>
        right.build.released.localeCompare(left.build.released) || left.build.key.localeCompare(right.build.key),
    );
    const results = matches.slice(0, limit).map((entry) => entry.build);
    return {
      builds: results,
      count: results.length,
      total_matches: matches.length,
      truncated: matches.length > results.length,
    };
  },
};

/**
 * AppleDB is served from static hosting that decodes %2F and collapses dot
 * segments before resolving a file, so encoding alone cannot keep a lookup
 * inside its /device/ or /ios/ prefix.
 */
function appledbPathSegment(value: string, fieldName: string): string {
  if (value === "." || value === ".." || value.includes("/") || value.includes("\\")) {
    throw providerInputError(`${fieldName} must not contain path separators or dot segments.`);
  }
  return encodePathSegment(value);
}

async function requestAppleDb<T>(context: AppleDbActionContext, request: AppleDbRequest<T>): Promise<T> {
  return runProviderRequest({ signal: context.signal, label: "AppleDB" }, async (signal) => {
    const response = await context.fetcher(`${appledbApiBaseUrl}${request.path}`, {
      headers: {
        accept: request.accept,
        "user-agent": providerUserAgent,
      },
      signal,
    });
    if (!response.ok) {
      // AppleDB is a static site, so every error body is a full HTML error page
      // rather than a message worth forwarding.
      await response.body?.cancel().catch(() => undefined);
      if (response.status === 404) {
        throw new ProviderRequestError(404, `AppleDB has no record at ${request.path}`);
      }
      // AppleDB takes no credentials, so a 401 or 403 can only be a bot or WAF
      // block; forwarding it would ask clients to reconnect an account that
      // does not exist.
      if (response.status === 401 || response.status === 403) {
        throw new ProviderRequestError(502, `AppleDB refused the request with HTTP ${response.status}`);
      }
      throw new ProviderRequestError(response.status, `AppleDB request failed with HTTP ${response.status}`);
    }
    return request.readBody(response);
  });
}

function deviceMatchRank(device: Record<string, unknown>, query: string): number | undefined {
  const values = [
    optionalString(device.key),
    optionalString(device.name),
    optionalString(device.type),
    optionalString(device.arch),
    optionalString(device.identifier),
    ...looseArray(device.identifier).map(optionalString),
    ...looseArray(device.alias).map(optionalString),
    optionalString(device.model),
    ...looseArray(device.model).map(optionalString),
    optionalString(device.board),
    ...looseArray(device.board).map(optionalString),
    optionalString(device.soc),
    ...looseArray(device.soc).map(optionalString),
  ]
    .filter((value): value is string => value !== undefined)
    .map((value) => value.toLowerCase());

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

function parseAppleDbCalendar(calendar: string): CalendarSearchEntry[] {
  const lines = unfoldCalendarLines(calendar);
  const entries: CalendarSearchEntry[] = [];
  let event: Record<string, string> | undefined;
  // RFC 5545 lets a VEVENT hold nested components such as VALARM, whose own
  // SUMMARY and DESCRIPTION describe the alarm rather than the build.
  let nestedDepth = 0;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      event = {};
      nestedDepth = 0;
      continue;
    }
    if (!event) {
      continue;
    }
    if (line === "END:VEVENT") {
      const entry = calendarEventToEntry(event);
      if (entry) {
        entries.push(entry);
      }
      event = undefined;
      continue;
    }
    if (line.startsWith("BEGIN:")) {
      nestedDepth += 1;
      continue;
    }
    if (line.startsWith("END:")) {
      nestedDepth = Math.max(0, nestedDepth - 1);
      continue;
    }
    if (nestedDepth > 0) {
      continue;
    }
    const separatorIndex = line.indexOf(":");
    if (separatorIndex < 1) {
      continue;
    }
    const property = line.slice(0, separatorIndex).split(";", 1)[0]!;
    event[property] = unescapeCalendarValue(line.slice(separatorIndex + 1));
  }

  return entries;
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

function calendarEventToEntry(event: Record<string, string>): CalendarSearchEntry | undefined {
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
  const version = calendarVersion(summary, os);
  const description = event.DESCRIPTION ?? "";
  const url = description.match(appledbFirmwarePageUrlPattern)?.[0];
  return {
    build: { key: `${os};${build}`, os, version, build, released, summary, url },
    // The UID prefix and the trailing AppleDB page URL are identical on every
    // event, so indexing them would make queries such as "firmware" or "https"
    // match the whole calendar.
    searchText: [os, version, build, summary, url ? description.replace(url, "") : description]
      .join("\n")
      .toLowerCase(),
  };
}

/**
 * Read the version out of a calendar summary. AppleDB writes the summary as
 * `<osStr> <version>` plus the plain Apple build in parentheses, while the UID
 * carries the build key, which may add a `-RC`, `-sim`, or `-SDK` suffix or be
 * a bare version for accessory firmware, so the build cannot be matched against
 * the summary directly.
 */
function calendarVersion(summary: string, os: string): string {
  const withoutOs = summary.startsWith(`${os} `) ? summary.slice(os.length + 1) : summary;
  return withoutOs.replace(/\s*\([^()]*\)$/u, "") || withoutOs;
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
