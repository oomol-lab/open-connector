import { describe, expect, it } from "vitest";
import { validateActionInput } from "../../core/validation.ts";
import { provider as baiduMapsProvider } from "./definition.ts";
import {
  baiduMapsActionHandlers,
  baiduMapsApiBaseUrl,
  baiduMapsValidationPath,
  computeBaiduMapsSnForTest,
  signBaiduMapsProxyUrl,
  validateBaiduMapsCredential,
} from "./runtime.ts";

interface RecordedRequest {
  url: string;
  init?: RequestInit;
}

describe("Baidu Maps runtime", () => {
  it("computes the Baidu SN over the full query (including ak) with the outer urlencode", () => {
    const query = {
      query: "咖啡厅",
      region: "北京",
      output: "json",
      ak: "ak123",
    };
    const first = computeBaiduMapsSnForTest("/place/v2/search", query, "sk123");
    const second = computeBaiduMapsSnForTest("/place/v2/search", query, "sk123");
    expect(first).toBe(second);

    // Known-good vector, cross-checked byte-for-byte against Baidu's reference
    // algorithm md5(urlencode(path + "?" + http_build_query(query_incl_ak) + sk))
    // (official PHP `urlencode` / Python `quote_plus` implementations).
    expect(first).toBe("902805b2791ab40e127bcbdb4af60f2e");

    // `ak` is part of the signed string: dropping it changes the signature.
    const withoutAk = computeBaiduMapsSnForTest(
      "/place/v2/search",
      { query: "咖啡厅", region: "北京", output: "json" },
      "sk123",
    );
    expect(withoutAk).not.toBe(first);
    expect(withoutAk).toBe("bb02d138a7853034b468af9c42819db6");

    // Parameter order is significant — Baidu re-hashes the received order.
    const reordered = computeBaiduMapsSnForTest(
      "/place/v2/search",
      { region: "北京", query: "咖啡厅", output: "json", ak: "ak123" },
      "sk123",
    );
    expect(reordered).not.toBe(first);
  });

  it("matches Baidu's own published SN reference vector", () => {
    // The exact example from Baidu's official appendix (Java/PHP sample):
    // path=/geocoder/v2/, params address=百度大厦&output=json&ak=yourak, sk=yoursk.
    // Baidu's docs print this digest; reproducing it byte-for-byte proves the
    // whole algorithm shape (ak included, outer urlencode, no timestamp, order).
    expect(
      computeBaiduMapsSnForTest("/geocoder/v2/", { address: "百度大厦", output: "json", ak: "yourak" }, "yoursk"),
    ).toBe("7de5a22212ffaa9e326444c75a58f9a0");
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

  it("signs signed endpoints with sn + Unix-seconds timestamp when an SK is configured", async () => {
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
    // Signed requests carry a Unix-seconds timestamp (required by some endpoints).
    expect(timestamp).toMatch(/^\d{10}$/);

    // ak + timestamp are signed inside the query and sn is appended last, in the
    // exact order Baidu re-hashes from the received URL.
    expect(url.search.slice(1)).toMatch(/^query=.*&region=.*&output=json&ak=ak-signed&timestamp=\d+&sn=[a-f0-9]{32}$/);
    expect(sn).toBe(
      computeBaiduMapsSnForTest(
        "/place/v2/search",
        { query: "咖啡厅", region: "北京", output: "json", ak: "ak-signed", timestamp: timestamp! },
        "sk-signed",
      ),
    );
  });

  it("sends the SN-signed query byte-for-byte (e.g. '*' → %2A) so Baidu re-hashes the same string", async () => {
    const requests: RecordedRequest[] = [];
    const fetcher = createFetcher(requests, { status: 0, message: "ok", total: 0, results: [] });

    await baiduMapsActionHandlers.search_places(
      { query: "a*b", region: "北京" },
      { apiKey: "ak-x", sk: "sk-x", fetcher },
    );

    const url = new URL(requests[0]!.url);
    // The `*` must be percent-encoded on the wire (URLSearchParams would leave
    // it literal), matching the RFC-1738 bytes that were signed.
    expect(url.search).toContain("query=a%2Ab");
    const timestamp = url.searchParams.get("timestamp")!;
    const expected = computeBaiduMapsSnForTest(
      "/place/v2/search",
      { query: "a*b", region: "北京", output: "json", ak: "ak-x", timestamp },
      "sk-x",
    );
    expect(url.searchParams.get("sn")).toBe(expected);
  });

  it("signs the validation request with sn when an SK is configured", async () => {
    const requests: RecordedRequest[] = [];
    const fetcher = createFetcher(requests, { status: 0, message: "ok" });

    await validateBaiduMapsCredential({ apiKey: "ak123", sk: "sk123", fetcher });

    const url = new URL(requests[0]!.url);
    expect(url.pathname).toBe(baiduMapsValidationPath);
    expect(url.searchParams.get("ak")).toBe("ak123");
    const sn = url.searchParams.get("sn");
    const timestamp = url.searchParams.get("timestamp");
    expect(sn).not.toBeNull();
    expect(timestamp).toMatch(/^\d{10}$/);
    expect(sn).toBe(
      computeBaiduMapsSnForTest(
        baiduMapsValidationPath,
        {
          ak: "ak123",
          output: "json",
          coordtype: "bd09ll",
          location: "39.915,116.404",
          timestamp: timestamp!,
        },
        "sk123",
      ),
    );
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

    const output = (await baiduMapsActionHandlers.ip_locate({}, { apiKey: "ak-ip", fetcher })) as {
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

  it("surfaces weather forecasts, hourly forecast, alerts and life indexes (array fields)", async () => {
    const requests: RecordedRequest[] = [];
    const fetcher = createFetcher(requests, {
      status: 0,
      message: "success",
      result: {
        location: { country: "中国", province: "北京市", city: "北京市", name: "北京", id: "110100" },
        now: { text: "晴", temp: 30 },
        forecasts: [{ date: "2026-07-14", text_day: "晴", high: 34, low: 24 }],
        forecast_hours: [{ data_time: "2026-07-14 12:00:00", temp_fc: 33 }],
        // Real Baidu response key is `alerts` (plural), not the `alert` data_type token.
        alerts: [{ type: "高温", level: "黄色", title: "高温黄色预警" }],
        indexes: [{ name: "紫外线指数", brief: "强", detail: "涂防晒霜" }],
      },
    });

    const output = (await baiduMapsActionHandlers.weather(
      { location: "116.404,39.915", data_type: "all" },
      { apiKey: "ak-weather", fetcher },
    )) as {
      result?: {
        location?: { city?: string };
        now?: { text?: string };
        forecasts?: unknown[];
        forecast_hours?: unknown[];
        alerts?: unknown[];
        indexes?: unknown[];
      };
    };

    expect(output.result?.location?.city).toBe("北京市");
    expect(output.result?.now).toEqual({ text: "晴", temp: 30 });
    expect(output.result?.forecasts).toHaveLength(1);
    expect(output.result?.forecast_hours).toHaveLength(1);
    expect(output.result?.alerts).toHaveLength(1);
    expect(output.result?.indexes).toHaveLength(1);
  });

  it("signs a proxy URL for signed endpoints when an SK is present", () => {
    const url = new URL(`${baiduMapsApiBaseUrl}/place/v2/search?query=咖啡厅&region=北京&output=json&ak=ak-signed`);
    signBaiduMapsProxyUrl(url, "sk-signed");
    const timestamp = url.searchParams.get("timestamp")!;
    expect(timestamp).toMatch(/^\d{10}$/);
    // Proxy and action-handler paths compute the identical signature.
    expect(url.searchParams.get("sn")).toBe(
      computeBaiduMapsSnForTest(
        "/place/v2/search",
        { query: "咖啡厅", region: "北京", output: "json", ak: "ak-signed", timestamp },
        "sk-signed",
      ),
    );
  });

  it("leaves proxy URLs unsigned without an SK, but signs any endpoint once an SK is present", () => {
    // No SK configured (AK does not use SN verification) → never sign.
    const missingSk = new URL(`${baiduMapsApiBaseUrl}/place/v2/search?query=x&ak=a`);
    signBaiduMapsProxyUrl(missingSk, undefined);
    expect(missingSk.searchParams.has("sn")).toBe(false);

    // SN is an AK-level toggle, so with an SK we sign EVERY endpoint — no
    // per-path allowlist to forget (a future endpoint stays covered).
    const anyPath = new URL(`${baiduMapsApiBaseUrl}/some/future/endpoint?ak=a`);
    signBaiduMapsProxyUrl(anyPath, "sk-signed");
    expect(anyPath.searchParams.get("sn")).not.toBeNull();
  });

  it("queries /api_region_search/v1/, signs it, and surfaces the districts array", async () => {
    const requests: RecordedRequest[] = [];
    // Baidu returns the divisions under top-level `districts`, not `result`.
    const fetcher = createFetcher(requests, {
      status: 0,
      result_size: 1,
      districts: [{ code: 131, name: "北京市", level: "province", districts: [] }],
    });
    const output = (await baiduMapsActionHandlers.district_search(
      { keyword: "北京市", sub_admin: 1 },
      { apiKey: "ak-d", sk: "sk-d", fetcher },
    )) as { result_size?: number; districts?: Array<{ name?: string }> };
    const url = new URL(requests[0]!.url);
    expect(url.pathname).toBe("/api_region_search/v1/");
    expect(url.searchParams.get("keyword")).toBe("北京市");
    expect(url.searchParams.get("sub_admin")).toBe("1");
    expect(url.searchParams.get("sn")).not.toBeNull();
    expect(output.result_size).toBe(1);
    expect(output.districts).toHaveLength(1);
    expect(output.districts?.[0]?.name).toBe("北京市");
  });

  it("requires either location or district_id for weather", async () => {
    const fetcher = createFetcher([], { status: 0 });
    await expect(
      baiduMapsActionHandlers.weather({ data_type: "now" }, { apiKey: "ak-w", fetcher }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("sends weather coordtype (one word) and accepts district_id", async () => {
    const requests: RecordedRequest[] = [];
    const fetcher = createFetcher(requests, { status: 0, message: "ok", result: {} });
    await baiduMapsActionHandlers.weather({ district_id: "222405", coordtype: "gcj02" }, { apiKey: "ak-w", fetcher });
    const url = new URL(requests[0]!.url);
    expect(url.pathname).toBe("/weather/v1/");
    expect(url.searchParams.get("district_id")).toBe("222405");
    expect(url.searchParams.get("coordtype")).toBe("gcj02");
    expect(url.searchParams.has("coord_type")).toBe(false);
  });

  it("forwards the weather location param when given", async () => {
    const requests: RecordedRequest[] = [];
    const fetcher = createFetcher(requests, { status: 0, result: {} });
    await baiduMapsActionHandlers.weather({ location: "116.404,39.915" }, { apiKey: "ak-w", fetcher });
    const url = new URL(requests[0]!.url);
    expect(url.searchParams.get("location")).toBe("116.404,39.915");
  });

  it("returns the input_tips suggestion list (array result)", async () => {
    const requests: RecordedRequest[] = [];
    const fetcher = createFetcher(requests, {
      status: 0,
      message: "ok",
      result: [{ name: "中关村", location: { lng: 116.3, lat: 39.9 }, uid: "abc" }],
    });
    const output = (await baiduMapsActionHandlers.input_tips({ query: "中关" }, { apiKey: "ak-s", fetcher })) as {
      result?: unknown[];
    };
    expect(new URL(requests[0]!.url).pathname).toBe("/place/v2/suggestion");
    expect(output.result).toHaveLength(1);
  });

  it("maps reverse_geocode output fields from result", async () => {
    const requests: RecordedRequest[] = [];
    const fetcher = createFetcher(requests, {
      status: 0,
      result: {
        formatted_address: "北京市海淀区",
        addressComponent: { city: "北京市", district: "海淀区" },
        pois: [{ name: "中关村" }],
        sematic_description: "中关村附近",
        cityCode: 131,
      },
    });
    const output = (await baiduMapsActionHandlers.reverse_geocode(
      { location: "39.9,116.4" },
      { apiKey: "ak-r", fetcher },
    )) as { formatted_address?: string; addressComponent?: { city?: string }; pois?: unknown[]; cityCode?: number };
    expect(new URL(requests[0]!.url).pathname).toBe("/reverse_geocoding/v3/");
    expect(output.formatted_address).toBe("北京市海淀区");
    expect(output.addressComponent?.city).toBe("北京市");
    expect(output.pois).toHaveLength(1);
    expect(output.cityCode).toBe(131);
  });

  it("routes bicycling to /directionlite/v1/riding (mode token mapping)", async () => {
    const requests: RecordedRequest[] = [];
    const fetcher = createFetcher(requests, { status: 0, result: { routes: [] } });
    await baiduMapsActionHandlers.route_bicycling(
      { origin: "40.0,116.0", destination: "40.1,116.1" },
      { apiKey: "ak-rt", fetcher },
    );
    expect(new URL(requests[0]!.url).pathname).toBe("/directionlite/v1/riding");
  });

  it("routes driving/walking/transit to their directionlite paths and surfaces routes", async () => {
    for (const [name, mode] of [
      ["route_driving", "driving"],
      ["route_walking", "walking"],
      ["route_transit", "transit"],
    ] as const) {
      const requests: RecordedRequest[] = [];
      const fetcher = createFetcher(requests, { status: 0, result: { routes: [{ distance: 100 }] } });
      const output = (await baiduMapsActionHandlers[name](
        { origin: "40.0,116.0", destination: "40.1,116.1" },
        { apiKey: "ak-rt", fetcher },
      )) as { result?: { routes?: unknown[] } };
      expect(new URL(requests[0]!.url).pathname).toBe(`/directionlite/v1/${mode}`);
      expect(output.result?.routes).toHaveLength(1);
    }
  });

  it("search_places_around requires location and sends around-variant params", async () => {
    const requests: RecordedRequest[] = [];
    const fetcher = createFetcher(requests, { status: 0, results: [] });
    await baiduMapsActionHandlers.search_places_around(
      { query: "咖啡厅", location: "40.0,116.0", radius: 1000 },
      { apiKey: "ak-a", fetcher },
    );
    const url = new URL(requests[0]!.url);
    expect(url.searchParams.get("location")).toBe("40.0,116.0");
    expect(url.searchParams.get("radius")).toBe("1000");

    const noLocation = createFetcher([], { status: 0 });
    await expect(
      baiduMapsActionHandlers.search_places_around({ query: "咖啡厅" }, { apiKey: "ak-a", fetcher: noLocation }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("search_places_polygon requires bounds and sends it", async () => {
    const requests: RecordedRequest[] = [];
    const fetcher = createFetcher(requests, { status: 0, results: [] });
    await baiduMapsActionHandlers.search_places_polygon(
      { query: "咖啡厅", bounds: "39.9,116.0,40.0,116.5" },
      { apiKey: "ak-p", fetcher },
    );
    expect(new URL(requests[0]!.url).searchParams.get("bounds")).toBe("39.9,116.0,40.0,116.5");

    const noBounds = createFetcher([], { status: 0 });
    await expect(
      baiduMapsActionHandlers.search_places_polygon({ query: "咖啡厅" }, { apiKey: "ak-p", fetcher: noBounds }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("coerces ip_locate point coordinates from strings to numbers", async () => {
    const requests: RecordedRequest[] = [];
    const fetcher = createFetcher(requests, {
      status: 0,
      address: "北京市",
      content: { address: "北京市", point: { x: "116.404", y: "39.915" }, address_detail: { city: "北京市" } },
    });
    const output = (await baiduMapsActionHandlers.ip_locate({}, { apiKey: "ak-ip", fetcher })) as {
      content?: { point?: { x?: number; y?: number } };
    };
    expect(output.content?.point).toEqual({ x: 116.404, y: 39.915 });
  });

  it("maps execute-phase auth status to 401 and quota/rate-limit to 429", async () => {
    const authFetcher = createFetcher([], { status: 240, message: "APP不存在" });
    await expect(
      baiduMapsActionHandlers.geocode({ address: "x" }, { apiKey: "ak", fetcher: authFetcher }),
    ).rejects.toMatchObject({ status: 401 });

    const quotaFetcher = createFetcher([], { status: 302, message: "天配额超限" });
    await expect(
      baiduMapsActionHandlers.geocode({ address: "x" }, { apiKey: "ak", fetcher: quotaFetcher }),
    ).rejects.toMatchObject({ status: 429 });
  });

  it("maps an unclassified non-zero Baidu status (HTTP 200) to 502, not a client error", async () => {
    const fetcher = createFetcher([], { status: 301, message: "永久超出配额" });
    await expect(baiduMapsActionHandlers.geocode({ address: "x" }, { apiKey: "ak", fetcher })).rejects.toMatchObject({
      status: 429,
    });
    // 301 is now in the rate-limit set; an entirely unknown code falls through to 502.
    const unknown = createFetcher([], { status: 99999, message: "weird" });
    await expect(
      baiduMapsActionHandlers.geocode({ address: "x" }, { apiKey: "ak", fetcher: unknown }),
    ).rejects.toMatchObject({ status: 502 });
  });

  it("parses a JSON body even when the content-type is not application/json", async () => {
    const requests: RecordedRequest[] = [];
    const fetcher = createTextFetcher(
      requests,
      JSON.stringify({ status: 0, result: { location: { lat: 1, lng: 2 } } }),
      "text/html",
    );
    const output = (await baiduMapsActionHandlers.geocode({ address: "x" }, { apiKey: "ak", fetcher })) as {
      location?: string;
    };
    expect(output.location).toBe("1,2");
  });

  it("signs proxy '*' byte-for-byte so the wire matches the digest", () => {
    const url = new URL(`${baiduMapsApiBaseUrl}/place/v2/search?query=a*b&region=北京&output=json&ak=ak-x`);
    signBaiduMapsProxyUrl(url, "sk-x");
    // Wire must carry %2A, matching the RFC-1738 bytes that were signed.
    expect(url.search).toContain("query=a%2Ab");
    const timestamp = url.searchParams.get("timestamp")!;
    const expected = computeBaiduMapsSnForTest(
      "/place/v2/search",
      { query: "a*b", region: "北京", output: "json", ak: "ak-x", timestamp },
      "sk-x",
    );
    expect(url.searchParams.get("sn")).toBe(expected);
  });

  // Regression: Baidu's `scope` parameter is documented as a numeric enum but
  // many callers (and Baidu's own JS SDK) serialize it as a string. The
  // previous stringEnum-only schema rejected numeric input with a confusing
  // "Instance type 'number' is invalid. Expected 'string'." error.
  describe("scope accepts both string and integer forms", () => {
    const searchPlaces = baiduMapsProvider.actions.find((a) => a.id === "baidu_maps.search_places")!;
    const getDetail = baiduMapsProvider.actions.find((a) => a.id === "baidu_maps.get_place_detail")!;

    it("search_places schema accepts scope='2'", () => {
      const r = validateActionInput(searchPlaces, { query: "咖啡", region: "北京", scope: "2" });
      expect(r.valid).toBe(true);
    });

    it("search_places schema accepts scope=2", () => {
      const r = validateActionInput(searchPlaces, { query: "咖啡", region: "北京", scope: 2 });
      expect(r.valid).toBe(true);
    });

    it("search_places schema rejects scope=3 (not in enum)", () => {
      const r = validateActionInput(searchPlaces, { query: "咖啡", region: "北京", scope: 3 });
      expect(r.valid).toBe(false);
    });

    it("search_places schema keeps scope optional (accepts input without scope)", () => {
      const r = validateActionInput(searchPlaces, { query: "咖啡", region: "北京" });
      expect(r.valid).toBe(true);
    });

    it("get_place_detail schema accepts scope=2", () => {
      const r = validateActionInput(getDetail, { uid: "abc", scope: 2 });
      expect(r.valid).toBe(true);
    });

    it("search_places handler forwards scope=2 to the wire", async () => {
      const requests: RecordedRequest[] = [];
      const fetcher = createFetcher(requests, { status: 0, results: [] });
      await baiduMapsActionHandlers.search_places(
        { query: "咖啡", region: "北京", scope: 2 },
        { apiKey: "ak-s", fetcher },
      );
      expect(new URL(requests[0]!.url).searchParams.get("scope")).toBe("2");
    });

    it("search_places handler forwards scope='1' to the wire", async () => {
      const requests: RecordedRequest[] = [];
      const fetcher = createFetcher(requests, { status: 0, results: [] });
      await baiduMapsActionHandlers.search_places(
        { query: "咖啡", region: "北京", scope: "1" },
        { apiKey: "ak-s", fetcher },
      );
      expect(new URL(requests[0]!.url).searchParams.get("scope")).toBe("1");
    });

    it("get_place_detail handler forwards scope=2 to the wire", async () => {
      const requests: RecordedRequest[] = [];
      const fetcher = createFetcher(requests, { status: 0, result: {} });
      await baiduMapsActionHandlers.get_place_detail({ uid: "u-1", scope: 2 }, { apiKey: "ak-d", fetcher });
      expect(new URL(requests[0]!.url).searchParams.get("scope")).toBe("2");
    });
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

function createTextFetcher(requests: RecordedRequest[], body: string, contentType: string): typeof fetch {
  return (async (input, init) => {
    requests.push({ url: input instanceof Request ? input.url : String(input), init });
    return new Response(body, { status: 200, headers: { "content-type": contentType } });
  }) as typeof fetch;
}
