import type { ExecutionContext, ResolvedCredential } from "../../core/types.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { setDefaultGuardedFetchDnsLookup } from "../../core/guarded-fetch.ts";
import { executors } from "./executors.ts";

const credential: Extract<ResolvedCredential, { authType: "api_key" }> = {
  authType: "api_key",
  apiKey: "test-wavespeed-key",
  values: { apiKey: "test-wavespeed-key" },
  profile: { accountId: "api_key", displayName: "WaveSpeedAI API Key", grantedScopes: [] },
  metadata: {},
};

const context: ExecutionContext = {
  getCredential: async () => credential,
};

const catalog = {
  code: 200,
  message: "success",
  data: [
    {
      model_id: "bytedance/seedream-v5.0-pro",
      name: "Seedream 5.0 Pro",
      type: "text-to-image",
      description: "Text to image model",
      base_price: 0.03,
      api_schema: {
        api_schemas: [
          {
            type: "model_run",
            request_schema: { properties: { prompt: { type: "string" } }, required: ["prompt"] },
          },
        ],
      },
    },
    {
      model_id: "google/veo3.1-fast/text-to-video",
      name: "Veo 3.1 Fast",
      type: "text-to-video",
      description: "Fast text to video model",
      base_price: 1.2,
    },
  ],
};

afterEach(() => {
  setDefaultGuardedFetchDnsLookup(undefined);
  vi.unstubAllGlobals();
});

function stubFetch(handler: (request: Request) => Response | Promise<Response>) {
  const calls: Request[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    calls.push(request);
    return handler(request);
  });
  setDefaultGuardedFetchDnsLookup(async () => [{ address: "93.184.216.34", family: 4 }]);
  return calls;
}

describe("wavespeed.run_model", () => {
  it("posts the input to the model path with the bearer key and returns the prediction", async () => {
    const calls = stubFetch(() =>
      Response.json({ code: 200, message: "success", data: { id: "pred-1", status: "created", outputs: [] } }),
    );

    const result = await executors["wavespeed.run_model"]!(
      { modelId: "google/veo3.1-fast/text-to-video", input: { prompt: "a paper boat" } },
      context,
    );

    expect(result).toMatchObject({
      ok: true,
      output: { prediction: { id: "pred-1", status: "created", outputs: [], error: null } },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.url).toBe("https://api.wavespeed.ai/api/v3/google/veo3.1-fast/text-to-video");
    expect(calls[0]!.headers.get("authorization")).toBe("Bearer test-wavespeed-key");
    expect(await calls[0]!.json()).toEqual({ prompt: "a paper boat" });
  });

  it("rejects a model id that is not a model path before any request is sent", async () => {
    const calls = stubFetch(() => Response.json({}));

    const result = await executors["wavespeed.run_model"]!(
      { modelId: "../predictions/abc/result", input: { prompt: "x" } },
      context,
    );

    expect(result).toMatchObject({ ok: false });
    expect(calls).toHaveLength(0);
  });

  it("reports an error carried in the JSON envelope of an HTTP 200 response", async () => {
    stubFetch(() => Response.json({ code: 400, message: "Insufficient credits." }));

    const result = await executors["wavespeed.run_model"]!(
      { modelId: "bytedance/seedream-v5.0-pro", input: { prompt: "x" } },
      context,
    );

    expect(result).toMatchObject({ ok: false, error: { message: "Insufficient credits." } });
  });
});

describe("wavespeed.get_prediction", () => {
  it("reads the result endpoint and returns the output URLs", async () => {
    const calls = stubFetch(() =>
      Response.json({
        code: 200,
        message: "success",
        data: { id: "pred-1", status: "completed", outputs: ["https://cdn.example.com/out.mp4"] },
      }),
    );

    const result = await executors["wavespeed.get_prediction"]!({ predictionId: "pred-1" }, context);

    expect(result).toMatchObject({
      ok: true,
      output: { prediction: { id: "pred-1", status: "completed", outputs: ["https://cdn.example.com/out.mp4"] } },
    });
    expect(calls[0]!.url).toBe("https://api.wavespeed.ai/api/v3/predictions/pred-1/result");
  });
});

describe("wavespeed.list_models", () => {
  it("filters by every query word and by type, and omits input schemas", async () => {
    stubFetch(() => Response.json(catalog));

    const result = await executors["wavespeed.list_models"]!({ query: "veo fast", type: "text-to-video" }, context);

    expect(result).toMatchObject({
      ok: true,
      output: {
        total: 1,
        models: [
          {
            modelId: "google/veo3.1-fast/text-to-video",
            name: "Veo 3.1 Fast",
            type: "text-to-video",
            description: "Fast text to video model",
            basePrice: 1.2,
          },
        ],
      },
    });
  });
});

describe("wavespeed.get_model", () => {
  it("returns the run input schema from the catalog entry", async () => {
    stubFetch(() => Response.json(catalog));

    const result = await executors["wavespeed.get_model"]!({ modelId: "bytedance/seedream-v5.0-pro" }, context);

    expect(result).toMatchObject({
      ok: true,
      output: {
        model: { modelId: "bytedance/seedream-v5.0-pro", basePrice: 0.03 },
        inputSchema: { properties: { prompt: { type: "string" } }, required: ["prompt"] },
      },
    });
  });

  it("fails when the model is not in the catalog", async () => {
    stubFetch(() => Response.json(catalog));

    const result = await executors["wavespeed.get_model"]!({ modelId: "nobody/no-such-model" }, context);

    expect(result).toMatchObject({ ok: false });
  });
});

describe("wavespeed.get_balance", () => {
  it("returns the numeric balance", async () => {
    stubFetch(() => Response.json({ code: 200, message: "success", data: { balance: 50.25 } }));

    const result = await executors["wavespeed.get_balance"]!({}, context);

    expect(result).toMatchObject({ ok: true, output: { balance: 50.25 } });
  });
});
