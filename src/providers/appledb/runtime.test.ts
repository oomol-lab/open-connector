import { describe, expect, it } from "vitest";
import { appledbActionHandlers } from "./runtime.ts";

/** Four devices that match "A17" at every rank, deliberately out of rank order. */
const rankedDevices = [
  { key: "D", name: "Delta", type: "iPhone", model: ["xa17y"] },
  { key: "B", name: "Bravo", type: "iPhone", model: ["A17 Pro"] },
  { key: "A", name: "Alpha", type: "iPhone", soc: "A17" },
  { key: "C", name: "Charlie", type: "iPhone", board: ["A17 Bionic"] },
];

describe("AppleDB runtime", () => {
  it("looks up a device with an encoded case-sensitive key", async () => {
    const requests: string[] = [];
    const fetcher: typeof fetch = async (input) => {
      requests.push(String(input));
      return Response.json({ key: "iPhone17,1", name: "iPhone 16 Pro", type: "iPhone" });
    };

    const result = await appledbActionHandlers.get_device({ key: "iPhone17,1" }, { fetcher });

    expect(requests).toEqual(["https://api.appledb.dev/device/iPhone17%2C1.json"]);
    expect(result).toMatchObject({ key: "iPhone17,1", name: "iPhone 16 Pro" });
  });

  it("orders device matches by exactness and reports omitted matches", async () => {
    const fetcher: typeof fetch = async () => Response.json(rankedDevices);

    const result = await appledbActionHandlers.search_devices({ query: "A17", limit: 2 }, { fetcher });

    expect(result).toEqual({
      devices: [
        { key: "A", name: "Alpha", type: "iPhone", soc: "A17" },
        { key: "B", name: "Bravo", type: "iPhone", model: ["A17 Pro"] },
      ],
      count: 2,
      total_matches: 4,
      truncated: true,
    });
  });

  it("filters device matches by category", async () => {
    const fetcher: typeof fetch = async () =>
      Response.json([...rankedDevices, { key: "E", name: "Echo", type: "Accessory", model: ["A17 Case"] }]);

    const filtered = await appledbActionHandlers.search_devices({ query: "A17", type: "iphone" }, { fetcher });
    const unfiltered = await appledbActionHandlers.search_devices({ query: "A17" }, { fetcher });

    expect(filtered).toMatchObject({
      devices: [{ key: "A" }, { key: "B" }, { key: "C" }, { key: "D" }],
      total_matches: 4,
    });
    expect(unfiltered).toMatchObject({
      devices: [{ key: "A" }, { key: "B" }, { key: "C" }, { key: "E" }, { key: "D" }],
      total_matches: 5,
    });
  });

  it("searches string-valued device fields", async () => {
    const fetcher: typeof fetch = async () =>
      Response.json([
        {
          key: "AirPods1,1-left",
          name: "AirPods (1st generation), left",
          type: "AirPods",
          identifier: ["AirPods1,1-left"],
          soc: "W1",
        },
      ]);

    const result = await appledbActionHandlers.search_devices({ query: "W1" }, { fetcher });

    expect(result).toMatchObject({
      devices: [{ key: "AirPods1,1-left", soc: "W1" }],
      count: 1,
      total_matches: 1,
      truncated: false,
    });
  });

  it("omits build sources by default and includes them on request", async () => {
    const requests: string[] = [];
    const fetcher: typeof fetch = async (input) => {
      requests.push(String(input));
      return Response.json({
        key: "iOS;22A3354",
        osStr: "iOS",
        version: "18.0",
        build: "22A3354",
        sources: [{ type: "ipsw", links: [{ url: "https://example.com/restore.ipsw", active: true }] }],
      });
    };

    const compact = await appledbActionHandlers.get_os_build({ os: "iOS", build: "22A3354" }, { fetcher });
    const complete = await appledbActionHandlers.get_os_build(
      { os: "iOS", build: "22A3354", include_sources: true },
      { fetcher },
    );

    expect(requests).toEqual([
      "https://api.appledb.dev/ios/iOS%3B22A3354.json",
      "https://api.appledb.dev/ios/iOS%3B22A3354.json",
    ]);
    expect(compact).not.toHaveProperty("sources");
    expect(complete).toHaveProperty("sources");
  });

  it("searches folded AppleDB calendar events by version and device identifier", async () => {
    const calendar = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "SUMMARY:iOS 18.0 (22A3354)",
      "DTSTART;VALUE=DATE:20240916",
      "UID:APPLEDB\\;FIRMWARE\\;iOS\\;22A3354",
      "DESCRIPTION:iOS 18.0 (22A3354)\\n\\nSupported devices:\\niPhone16\\,1\\, iPho",
      " ne17\\,1\\n\\nhttps://appledb.dev/firmware/iOS/22A3354",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const fetcher: typeof fetch = async () => new Response(calendar, { headers: { "content-type": "text/calendar" } });

    const result = await appledbActionHandlers.search_os_builds({ os_type: "iOS", query: "iPhone17,1" }, { fetcher });

    expect(result).toEqual({
      builds: [
        {
          key: "iOS;22A3354",
          os: "iOS",
          version: "18.0",
          build: "22A3354",
          released: "2024-09-16",
          summary: "iOS 18.0 (22A3354)",
          url: "https://appledb.dev/firmware/iOS/22A3354",
        },
      ],
      count: 1,
      total_matches: 1,
      truncated: false,
    });
  });

  it("reads a version from a variant build summary", async () => {
    const calendar = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "SUMMARY:iPadOS 18.7.9 RC (22H355)",
      "DTSTART;VALUE=DATE:20250915",
      "UID:APPLEDB\\;FIRMWARE\\;iPadOS\\;22H355-RC",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "SUMMARY:iOS 26.3 (a) (23D770890b)",
      "DTSTART;VALUE=DATE:20260210",
      "UID:APPLEDB\\;FIRMWARE\\;iOS\\;23D770890b",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const fetcher: typeof fetch = async () => new Response(calendar, { headers: { "content-type": "text/calendar" } });

    const releaseCandidate = await appledbActionHandlers.search_os_builds(
      { os_type: "iOS", query: "22H355-RC" },
      { fetcher },
    );
    const rapidSecurityResponse = await appledbActionHandlers.search_os_builds(
      { os_type: "iOS", query: "26.3 (a)" },
      { fetcher },
    );

    expect(releaseCandidate).toMatchObject({
      builds: [
        {
          key: "iPadOS;22H355-RC",
          os: "iPadOS",
          version: "18.7.9 RC",
          build: "22H355-RC",
          summary: "iPadOS 18.7.9 RC (22H355)",
        },
      ],
      total_matches: 1,
    });
    expect(rapidSecurityResponse).toMatchObject({
      builds: [{ key: "iOS;23D770890b", os: "iOS", version: "26.3 (a)", build: "23D770890b" }],
      total_matches: 1,
    });
  });

  it("does not match calendar boilerplate", async () => {
    const calendar = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "SUMMARY:iOS 18.0 (22A3354)",
      "DTSTART;VALUE=DATE:20240916",
      "UID:APPLEDB\\;FIRMWARE\\;iOS\\;22A3354",
      "DESCRIPTION:iOS 18.0 (22A3354)\\n\\nSupported devices:\\niPhone16\\,1\\, iPhone17\\,1\\n\\nhttps://appledb.dev/firmware/iOS/22A3354",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const fetcher: typeof fetch = async () => new Response(calendar, { headers: { "content-type": "text/calendar" } });

    const boilerplate = await appledbActionHandlers.search_os_builds(
      { os_type: "iOS", query: "firmware" },
      { fetcher },
    );
    const device = await appledbActionHandlers.search_os_builds({ os_type: "iOS", query: "iPhone17,1" }, { fetcher });

    expect(boilerplate).toMatchObject({ builds: [], total_matches: 0 });
    expect(device).toMatchObject({ total_matches: 1 });
  });

  it("returns newest builds first", async () => {
    const calendar = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "SUMMARY:iOS 18.0 (22A3354)",
      "DTSTART;VALUE=DATE:20240916",
      "UID:APPLEDB\\;FIRMWARE\\;iOS\\;22A3354",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "SUMMARY:iOS 17.0 (21A329)",
      "DTSTART;VALUE=DATE:20230918",
      "UID:APPLEDB\\;FIRMWARE\\;iOS\\;21A329",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "SUMMARY:iOS 26.0 (23A340)",
      "DTSTART;VALUE=DATE:20250915",
      "UID:APPLEDB\\;FIRMWARE\\;iOS\\;23A340",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const fetcher: typeof fetch = async () => new Response(calendar, { headers: { "content-type": "text/calendar" } });

    const result = await appledbActionHandlers.search_os_builds({ os_type: "iOS", query: "iOS" }, { fetcher });

    expect(result).toMatchObject({
      builds: [
        { build: "23A340", released: "2025-09-15" },
        { build: "22A3354", released: "2024-09-16" },
        { build: "21A329", released: "2023-09-18" },
      ],
      total_matches: 3,
    });
  });

  it("ignores properties of nested calendar components", async () => {
    const calendar = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "SUMMARY:iOS 18.0 (22A3354)",
      "DTSTART;VALUE=DATE:20240916",
      "UID:APPLEDB\\;FIRMWARE\\;iOS\\;22A3354",
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "TRIGGER:-PT1H",
      "SUMMARY:Reminder",
      "DESCRIPTION:Alarm text",
      "END:VALARM",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const fetcher: typeof fetch = async () => new Response(calendar, { headers: { "content-type": "text/calendar" } });

    const result = await appledbActionHandlers.search_os_builds({ os_type: "iOS", query: "22A3354" }, { fetcher });

    expect(result).toMatchObject({
      builds: [{ version: "18.0", summary: "iOS 18.0 (22A3354)" }],
      total_matches: 1,
    });
  });

  it("preserves an AppleDB not-found status", async () => {
    const fetcher: typeof fetch = async () =>
      new Response("<!DOCTYPE html><html><head><title>404</title></head><body>Not Found</body></html>", {
        status: 404,
        headers: { "content-type": "text/html" },
      });

    await expect(appledbActionHandlers.get_device({ key: "missing" }, { fetcher })).rejects.toMatchObject({
      status: 404,
      message: "AppleDB has no record at /device/missing.json",
    });
  });

  it("reports a bot block as a provider error", async () => {
    const fetcher: typeof fetch = async () =>
      new Response("<!DOCTYPE html><html><body>Attention Required!</body></html>", {
        status: 403,
        headers: { "content-type": "text/html" },
      });

    await expect(appledbActionHandlers.get_device({ key: "iPhone17,1" }, { fetcher })).rejects.toMatchObject({
      status: 502,
      message: "AppleDB refused the request with HTTP 403",
    });
  });
});

describe("AppleDB path segments", () => {
  const requests: string[] = [];
  const fetcher: typeof fetch = async (input) => {
    requests.push(String(input));
    throw new Error("a rejected path must never reach AppleDB");
  };

  it.each([
    [
      "a device key that escapes the device prefix",
      () => appledbActionHandlers.get_device({ key: "../ios/iOS;22A3354" }, { fetcher }),
    ],
    ["a device key with a path separator", () => appledbActionHandlers.get_device({ key: "a/b" }, { fetcher })],
    [
      "a build lookup whose operating system escapes the build prefix",
      () => appledbActionHandlers.get_os_build({ os: "../device", build: "22A3354" }, { fetcher }),
    ],
    [
      "a calendar named by a single dot segment",
      () => appledbActionHandlers.search_os_builds({ os_type: ".", query: "x" }, { fetcher }),
    ],
    [
      "a calendar named by a parent dot segment",
      () => appledbActionHandlers.search_os_builds({ os_type: "..", query: "x" }, { fetcher }),
    ],
    [
      "a calendar name with a path separator",
      () => appledbActionHandlers.search_os_builds({ os_type: "iOS/..", query: "x" }, { fetcher }),
    ],
  ])("rejects %s", async (_description, lookUp) => {
    await expect(lookUp()).rejects.toMatchObject({ status: 400 });
    expect(requests).toEqual([]);
  });
});
