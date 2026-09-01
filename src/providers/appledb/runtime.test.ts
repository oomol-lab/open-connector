import { describe, expect, it } from "vitest";
import { appledbActionHandlers } from "./runtime.ts";

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

  it("ranks and bounds device search results", async () => {
    const fetcher: typeof fetch = async () =>
      Response.json([
        {
          key: "iPhone17,2",
          name: "iPhone 16 Pro Max",
          type: "iPhone",
          identifier: ["iPhone17,2"],
          model: ["A3295"],
        },
        {
          key: "iPhone17,1",
          name: "iPhone 16 Pro",
          type: "iPhone",
          identifier: ["iPhone17,1"],
          model: ["A3293"],
        },
        {
          key: "Case",
          name: "iPhone 16 Pro Case",
          type: "Accessory",
          identifier: [],
        },
      ]);

    const result = await appledbActionHandlers.search_devices(
      { query: "iPhone17,1", type: "iphone", limit: 1 },
      { fetcher },
    );

    expect(result).toEqual({
      devices: [
        {
          key: "iPhone17,1",
          name: "iPhone 16 Pro",
          type: "iPhone",
          identifier: ["iPhone17,1"],
          model: ["A3293"],
          soc: undefined,
          released: undefined,
          discontinued: undefined,
        },
      ],
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

  it("preserves an AppleDB not-found status", async () => {
    const fetcher: typeof fetch = async () => new Response("not found", { status: 404 });

    await expect(appledbActionHandlers.get_device({ key: "missing" }, { fetcher })).rejects.toMatchObject({
      status: 404,
      message: "not found",
    });
  });
});
