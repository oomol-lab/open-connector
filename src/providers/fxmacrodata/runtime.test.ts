import { describe, expect, it } from "vitest";
import { createProviderFetch } from "../provider-runtime.ts";
import { fxmacrodataActionHandlers, readFxmacrodataError, validateFxmacrodataCredential } from "./runtime.ts";

interface RecordedRequest {
  url: string;
  apiKey: string | null;
}

function recordingFetcher(response: () => Response): { fetcher: typeof fetch; requests: RecordedRequest[] } {
  const requests: RecordedRequest[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    requests.push({ url: String(input), apiKey: new Headers(init?.headers).get("x-api-key") });
    return response();
  };
  return { fetcher, requests };
}

const keyRequired = (): Response =>
  Response.json(
    { detail: "This endpoint requires an Individual or Business API key.", code: "api_key_required" },
    { status: 401 },
  );

describe("FXMacroData runtime", () => {
  it("reads keyless USD releases with a normalized path and date window", async () => {
    const { fetcher, requests } = recordingFetcher(() =>
      Response.json({ currency: "USD", indicator: "inflation", data: [{ date: "2026-08-31", val: 3.4 }] }),
    );

    const result = await fxmacrodataActionHandlers.get_announcements(
      { currency: "USD", indicator: "inflation", startDate: "2026-01-01", limit: 12 },
      { fetcher },
    );

    expect(requests).toEqual([
      {
        url: "https://api.fxmacrodata.com/v1/announcements/usd/inflation?start_date=2026-01-01&limit=12",
        apiKey: null,
      },
    ]);
    expect(result).toMatchObject({ indicator: "inflation", data: [{ val: 3.4 }] });
  });

  it("sends the key in the X-API-Key header", async () => {
    const { fetcher, requests } = recordingFetcher(() => Response.json({ data: [] }));

    await fxmacrodataActionHandlers.get_forex({ base: "eur", quote: "usd" }, { apiKey: "test-key", fetcher });

    expect(requests).toEqual([{ url: "https://api.fxmacrodata.com/v1/forex/eur/usd", apiKey: "test-key" }]);
  });

  it("passes the optional indicator filter to the release calendar", async () => {
    const { fetcher, requests } = recordingFetcher(() => Response.json({ currency: "USD", data: [] }));

    await fxmacrodataActionHandlers.get_release_calendar(
      { currency: "usd", indicator: "non_farm_payrolls" },
      { fetcher },
    );

    expect(requests[0]?.url).toBe("https://api.fxmacrodata.com/v1/calendar/usd?indicator=non_farm_payrolls");
  });

  it("reports a keyless request for paid data as invalid input rather than a bad credential", async () => {
    const { fetcher } = recordingFetcher(keyRequired);

    await expect(fxmacrodataActionHandlers.get_cot({ currency: "eur" }, { fetcher })).rejects.toMatchObject({
      status: 400,
      message: "This endpoint requires an Individual or Business API key.",
    });
  });

  it("reports a rejected key as an authorization failure during execution", async () => {
    const { fetcher } = recordingFetcher(() =>
      Response.json({ detail: "API key not recognised.", code: "invalid_api_key" }, { status: 401 }),
    );

    await expect(
      fxmacrodataActionHandlers.get_latest_announcements({ currency: "eur" }, { apiKey: "revoked", fetcher }),
    ).rejects.toMatchObject({ status: 401, message: "API key not recognised." });
  });

  it("preserves an ambiguous authentication status during validation", async () => {
    const { fetcher, requests } = recordingFetcher(() =>
      Response.json({ detail: "API key not recognised.", code: "invalid_api_key" }, { status: 401 }),
    );

    await expect(validateFxmacrodataCredential({ apiKey: "wrong" }, { fetcher })).rejects.toMatchObject({
      status: 401,
    });
    expect(requests).toEqual([{ url: "https://api.fxmacrodata.com/v1/data_catalogue/usd", apiKey: "wrong" }]);
  });

  it("keeps an unknown indicator as a not-found result", async () => {
    const { fetcher } = recordingFetcher(() =>
      Response.json({ detail: "Unsupported currency (USD) or indicator (cpi_core)." }, { status: 404 }),
    );

    await expect(
      fxmacrodataActionHandlers.get_announcements({ currency: "usd", indicator: "cpi_core" }, { fetcher }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("maps a keyless proxy 401 to invalid input and keeps a rejected key as a 401", async () => {
    await expect(readFxmacrodataError(keyRequired())).resolves.toMatchObject({ status: 400 });
    await expect(
      readFxmacrodataError(
        Response.json({ detail: "API key not recognised.", code: "invalid_api_key" }, { status: 401 }),
      ),
    ).resolves.toMatchObject({ status: 401 });
  });

  it("refuses a key that is not a valid header value without echoing it", async () => {
    const { fetcher, requests } = recordingFetcher(() => Response.json({ data: [] }));

    const error = await fxmacrodataActionHandlers
      .get_forex({ base: "eur", quote: "usd" }, { apiKey: "abc\nsecret-value", fetcher })
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({ status: 400 });
    expect(String((error as Error).message)).not.toContain("secret-value");
    expect(requests).toEqual([]);
  });

  it.each(["test-key-123", 'test-"quoted-key', "test-\\backslash-key"])(
    "removes key %j from an upstream error",
    async (apiKey) => {
      const { fetcher } = recordingFetcher(() =>
        Response.json({ detail: `Key ${apiKey} is not active.`, key: apiKey }, { status: 403 }),
      );

      const error = await fxmacrodataActionHandlers
        .get_cot({ currency: "eur" }, { apiKey, fetcher })
        .catch((caught: unknown) => caught);

      expect(error).toMatchObject({ status: 403, message: "Key [REDACTED] is not active." });
      expect(JSON.stringify((error as { details?: unknown }).details)).not.toContain(
        JSON.stringify(apiKey).slice(1, -1),
      );
    },
  );

  it.each([
    ["another origin", "https://elsewhere.example/v1/forex/eur/usd"],
    ["plain http on the same host", "http://api.fxmacrodata.com/v1/forex/eur/usd"],
  ])("does not forward the key when a redirect moves to %s", async (_description, location) => {
    const hops: RecordedRequest[] = [];
    const transport: typeof fetch = async (input, init) => {
      hops.push({ url: String(input), apiKey: new Headers(init?.headers).get("x-api-key") });
      return hops.length === 1
        ? new Response(null, { status: 302, headers: { location } })
        : Response.json({ data: [] });
    };
    const fetcher = createProviderFetch({ fetch: transport, skipDnsValidation: true });

    await fxmacrodataActionHandlers
      .get_forex({ base: "eur", quote: "usd" }, { apiKey: "test-key", fetcher })
      .catch(() => undefined);

    expect(hops[0]?.apiKey).toBe("test-key");
    expect(hops.slice(1).every((hop) => hop.apiKey === null)).toBe(true);
  });

  it.each([
    ["a currency that is not three letters", { currency: "usdx", indicator: "inflation" }],
    ["an indicator with a path separator", { currency: "usd", indicator: "../latest" }],
  ])("rejects %s before any request", async (_description, input) => {
    const { fetcher, requests } = recordingFetcher(() => Response.json({}));

    await expect(fxmacrodataActionHandlers.get_announcements(input, { fetcher })).rejects.toMatchObject({
      status: 400,
    });
    expect(requests).toEqual([]);
  });
});
