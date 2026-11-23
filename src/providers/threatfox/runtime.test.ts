import { describe, expect, it } from "vitest";
import { threatfoxActionHandlers } from "./runtime.ts";

describe("ThreatFox lookup_ioc response validation", () => {
  it("normalizes matching IOC entries for a valid ok response", async () => {
    const result = await threatfoxActionHandlers.lookup_ioc(
      { ioc: "example.test" },
      {
        apiKey: "fixture",
        fetcher: async () =>
          Response.json({
            query_status: "ok",
            data: [
              {
                id: 12345,
                ioc: "example.test",
                threat_type: "botnet_cc",
                threat_type_desc: "Botnet C&C",
                ioc_type: "domain",
                ioc_type_desc: "Domain that is used for botnet C&C",
                malware: "win.vidar",
                malware_printable: "Vidar",
                confidence_level: 75,
                first_seen: "2026-01-01 00:00:00 UTC",
                last_seen: null,
                reporter: "abuse_ch",
                reference: null,
                tags: ["vidar"],
                malware_samples: [],
              },
            ],
          }),
      },
    );

    expect(result).toEqual({
      found: true,
      query_status: "ok",
      entries: [
        {
          id: "12345",
          ioc: "example.test",
          threat_type: "botnet_cc",
          threat_type_desc: "Botnet C&C",
          ioc_type: "domain",
          ioc_type_desc: "Domain that is used for botnet C&C",
          malware: "win.vidar",
          malware_printable: "Vidar",
          confidence_level: 75,
          first_seen: "2026-01-01 00:00:00 UTC",
          last_seen: null,
          reporter: "abuse_ch",
          reference: null,
          tags: ["vidar"],
          malware_samples: [],
        },
      ],
    });
  });

  it("returns found: false when ThreatFox reports no_result", async () => {
    const result = await threatfoxActionHandlers.lookup_ioc(
      { ioc: "example.test" },
      {
        apiKey: "fixture",
        fetcher: async () =>
          Response.json({ query_status: "no_result", data: "Your search did not yield any results" }),
      },
    );

    expect(result).toEqual({
      found: false,
      query_status: "no_result",
      entries: undefined,
    });
  });

  it.each([
    ["an empty data array", []],
    ["an entry missing ioc", [{}]],
    ["an entry with a blank ioc", [{ id: "1", ioc: "   " }]],
  ])("rejects query_status ok with %s as a 502 provider response error", async (_label, data) => {
    await expect(
      threatfoxActionHandlers.lookup_ioc(
        { ioc: "example.test" },
        {
          apiKey: "fixture",
          fetcher: async () => Response.json({ query_status: "ok", data }),
        },
      ),
    ).rejects.toMatchObject({
      status: 502,
      message: "ThreatFox returned ok without a usable IOC entry",
    });
  });

  it("filters out entries missing an ioc when at least one usable entry is present", async () => {
    const result = await threatfoxActionHandlers.lookup_ioc(
      { ioc: "44d88612fea8a8f36de82e1278abb02f" },
      {
        apiKey: "fixture",
        fetcher: async () =>
          Response.json({
            query_status: "ok",
            data: [
              { id: "1", ioc: "" },
              { id: "2", ioc: "example.test", confidence_level: 80 },
            ],
          }),
      },
    );

    expect(result).toMatchObject({
      found: true,
      query_status: "ok",
      entries: [{ id: "2", ioc: "example.test", confidence_level: 80 }],
    });
  });

  it("maps non-object items in data to a 502 provider response error instead of CastError", async () => {
    await expect(
      threatfoxActionHandlers.lookup_ioc(
        { ioc: "example.test" },
        {
          apiKey: "fixture",
          fetcher: async () => Response.json({ query_status: "ok", data: [1] }),
        },
      ),
    ).rejects.toMatchObject({
      status: 502,
      message: "ThreatFox entry must be an object",
    });
  });

  it("maps non-object items in malware_samples to a 502 provider response error instead of CastError", async () => {
    await expect(
      threatfoxActionHandlers.lookup_ioc(
        { ioc: "example.test" },
        {
          apiKey: "fixture",
          fetcher: async () =>
            Response.json({
              query_status: "ok",
              data: [{ id: "1", ioc: "example.test", malware_samples: [1] }],
            }),
        },
      ),
    ).rejects.toMatchObject({
      status: 502,
      message: "ThreatFox malware sample must be an object",
    });
  });
});
