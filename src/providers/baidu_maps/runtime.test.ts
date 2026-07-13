import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  baiduMapsActionHandlers,
  baiduMapsApiBaseUrl,
  baiduMapsValidationPath,
  computeBaiduMapsSnForTest,
  validateBaiduMapsCredential,
} from "./runtime.ts";

interface RecordedRequest {
  url: string;
  init?: RequestInit;
}

describe("Baidu Maps runtime", () => {
  it("computes a deterministic SN over sorted query parameters", () => {
    const query = {
      query: "咖啡厅",
      region: "北京",
      output: "json",
      ak: "ak123",
    };
    const first = computeBaiduMapsSnForTest("/place/v2/search", query, "sk123");
    const second = computeBaiduMapsSnForTest("/place/v2/search", query, "sk123");
    expect(first).toBe(second);

    const reordered = computeBaiduMapsSnForTest(
      "/place/v2/search",
      { region: "北京", query: "咖啡厅", output: "json", ak: "ak123" },
      "sk123",
    );
    expect(first).toBe(reordered);

    const withoutAk = { query: "咖啡厅", region: "北京", output: "json" };
    const expectedSigningString =
      "/place/v2/search?output=json&query=%E5%92%96%E5%95%A1%E5%8E%85&region=%E5%8C%97%E4%BA%ACsk123";
    const expected = createHash("md5").update(expectedSigningString, "utf8").digest("hex");
    expect(computeBaiduMapsSnForTest("/place/v2/search", withoutAk, "sk123")).toBe(expected);
    expect(first).toBe(expected);
    const withAk = computeBaiduMapsSnForTest("/place/v2/search", { ...withoutAk, ak: "ak123" }, "sk123");
    expect(withAk).toBe(expected);
  });

  it("validates the AK against reverse_geocoding/v3 and returns a credential profile", async () => {
    const requests: RecordedRequest[] = [];
    const fetcher = createFetcher(requests, { status: 0, message: "ok" });

    const result = await validateBaiduMapsCredential({
      apiKey: "ak123",
      fetcher,
    });

    expect(result.profile?.accountId).toBe("baidu_ak");
    expect(result.grantedScopes).toEqual([]);
    expect(result.metadata).toMatchObject({
      apiBaseUrl: baiduMapsApiBaseUrl,
      validationEndpoint: baiduMapsValidationPath,
    });
    const recordedUrl = new URL(requests[0]!.url);
    expect(recordedUrl.pathname).toBe(baiduMapsValidationPath);
    expect(recordedUrl.searchParams.get("ak")).toBe("ak123");
    expect(recordedUrl.searchParams.get("output")).toBe("json");
    expect(recordedUrl.searchParams.get("coordtype")).toBe("bd09ll");
  });

  it("surfaces Baidu Maps auth failures as a ProviderRequestError", async () => {
    const requests: RecordedRequest[] = [];
    const fetcher = createFetcher(requests, { status: 240, message: "APP不存在" });

    await expect(validateBaiduMapsCredential({ apiKey: "ak-broken", fetcher })).rejects.toMatchObject({
      status: 400,
      message: "APP不存在",
    });
    expect(requests).toHaveLength(1);
  });

  it("passes ak and output through geocode without signing when SK is missing", async () => {
    const requests: RecordedRequest[] = [];
    const fetcher = createFetcher(requests, {
      status: 0,
      message: "ok",
      result: {
        location: { lat: 39.915, lng: 116.404 },
        confidence: 80,
      },
    });

    await baiduMapsActionHandlers.geocode(
      { address: "北京市海淀区中关村南大街27号", city: "北京市" },
      { apiKey: "ak-geo", fetcher },
    );

    const url = new URL(requests[0]!.url);
    expect(url.origin).toBe(baiduMapsApiBaseUrl);
    expect(url.pathname).toBe("/geocoding/v3/");
    expect(url.searchParams.get("ak")).toBe("ak-geo");
    expect(url.searchParams.get("output")).toBe("json");
    expect(url.searchParams.get("address")).toBe("北京市海淀区中关村南大街27号");
    expect(url.searchParams.get("city")).toBe("北京市");
    expect(url.searchParams.has("sn")).toBe(false);
    expect(url.searchParams.has("timestamp")).toBe(false);
  });

  it("adds sn and timestamp to signed endpoints when an SK is configured", async () => {
    const requests: RecordedRequest[] = [];
    const fetcher = createFetcher(requests, { status: 0, message: "ok", total: 1, results: [] });

    await baiduMapsActionHandlers.search_places(
      { query: "咖啡厅", region: "北京" },
      { apiKey: "ak-signed", sk: "sk-signed", fetcher },
    );

    const url = new URL(requests[0]!.url);
    expect(url.pathname).toBe("/place/v2/search");
    expect(url.searchParams.get("ak")).toBe("ak-signed");
    expect(url.searchParams.get("query")).toBe("咖啡厅");
    expect(url.searchParams.get("region")).toBe("北京");

    const sn = url.searchParams.get("sn");
    const timestamp = url.searchParams.get("timestamp");
    expect(sn).not.toBeNull();
    expect(timestamp).not.toBeNull();
    expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);

    // The signing input uses the same key order as the request URL so that
    // Baidu's server, which re-parses the URL, hashes the same string.
    expect(url.search.slice(1)).toMatch(/^output=json&query=.*&region=.*&ak=ak-signed&sn=[a-f0-9]{32}&timestamp=/);

    const expectedSigningString =
      "/place/v2/search?output=json&query=%E5%92%96%E5%95%A1%E5%8E%85&region=%E5%8C%97%E4%BA%ACsk-signed";
    const expected = createHash("md5").update(expectedSigningString, "utf8").digest("hex");
    expect(sn).toBe(expected);
  });

  it("serializes geocode result.location when the API returns a {lat, lng} object", async () => {
    const requests: RecordedRequest[] = [];
    const fetcher = createFetcher(requests, {
      status: 0,
      message: "ok",
      result: {
        location: { lat: 39.915, lng: 116.404 },
        precise: 1,
        confidence: 90,
        comprehension: 1,
      },
    });

    const output = (await baiduMapsActionHandlers.geocode(
      { address: "北京市海淀区中关村南大街27号" },
      { apiKey: "ak-geo", fetcher },
    )) as { location?: string };

    expect(output.location).toBe("39.915,116.404");
    expect(requests).toHaveLength(1);
  });

  it("reads ip_locate response from the top-level address and content fields", async () => {
    const requests: RecordedRequest[] = [];
    const fetcher = createFetcher(requests, {
      status: 0,
      message: "ok",
      address: "北京市",
      content: {
        address: "北京市",
        point: { x: 116.404, y: 39.915 },
        address_detail: { city: "北京市", city_code: 131, province: "北京市" },
      },
    });

    const output = (await baiduMapsActionHandlers.ip_locate(
      {},
      { apiKey: "ak-ip", fetcher },
    )) as {
      address?: string;
      content?: {
        point?: { x?: number; y?: number };
        address_detail?: { city?: string; city_code?: number };
      };
    };

    expect(output.address).toBe("北京市");
    expect(output.content?.point).toEqual({ x: 116.404, y: 39.915 });
    expect(output.content?.address_detail).toEqual({ city: "北京市", city_code: 131, province: "北京市" });
    expect(requests).toHaveLength(1);
  });
});

function createFetcher(requests: RecordedRequest[], payload: unknown): typeof fetch {
  return (async (input, init) => {
    requests.push({
      url: input instanceof Request ? input.url : String(input),
      init,
    });
    return Response.json(payload as never);
  }) as typeof fetch;
}
