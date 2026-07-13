import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { describe, expect, it } from "vitest";
import { speechmaticsActionHandlers, validateSpeechmaticsCredential } from "./runtime.ts";

interface RecordedRequest {
  url: string;
  init?: RequestInit;
}

describe("Speechmatics runtime", () => {
  it("uses Bearer token authentication for Management API project requests", async () => {
    const requests: RecordedRequest[] = [];
    const context = createContext(requests, [
      {
        project_id: 7,
        name: "Production",
        is_default: true,
      },
    ]);

    await expect(speechmaticsActionHandlers.list_projects!({}, context)).resolves.toEqual({
      projects: [{ project_id: 7, name: "Production", is_default: true }],
    });
    expect(requests[0]?.url).toBe("https://mp.api.speechmatics.com/v1/projects");
    expect(new Headers(requests[0]?.init?.headers).get("authorization")).toBe("Bearer test-token");
  });

  it("routes Discovery API queries to the selected region without sending the management token", async () => {
    const requests: RecordedRequest[] = [];
    const context = createContext(requests, { metadata: {}, batch: {} });

    await expect(speechmaticsActionHandlers.get_service_capabilities!({ region: "au1" }, context)).resolves.toEqual({
      region: "au1",
      endpoint: "https://au1.asr.api.speechmatics.com/v1/discovery/features",
      capabilities: { metadata: {}, batch: {} },
    });
    expect(new Headers(requests[0]?.init?.headers).has("authorization")).toBe(false);
  });

  it("rejects unsupported Discovery API regions", async () => {
    const requests: RecordedRequest[] = [];
    const context = createContext(requests, {});

    await expect(
      speechmaticsActionHandlers.get_service_capabilities!({ region: "invalid" }, context),
    ).rejects.toMatchObject({
      status: 400,
      message: "Unsupported Speechmatics region: invalid",
    });
    expect(requests).toEqual([]);
  });

  it("filters documented deployments by processing mode", async () => {
    const context = createContext([], {});
    const output = (await speechmaticsActionHandlers.list_deployments!({ mode: "realtime" }, context)) as {
      deployments: Array<Record<string, unknown>>;
    };

    expect(output.deployments).toHaveLength(2);
    expect(output.deployments.every((deployment) => deployment.mode === "realtime")).toBe(true);
    expect(output.deployments.map((deployment) => deployment.endpoint)).toEqual([
      "eu.rt.speechmatics.com",
      "us.rt.speechmatics.com",
    ]);
    expect(output.deployments.map((deployment) => deployment.region)).toEqual(["eu1", "us1"]);
  });

  it("validates Management Tokens through the projects endpoint", async () => {
    const requests: RecordedRequest[] = [];
    const fetcher = createFetcher(requests, []);

    await expect(validateSpeechmaticsCredential("management-token", fetcher)).resolves.toMatchObject({
      profile: { displayName: "Speechmatics Management Token" },
      grantedScopes: ["View projects"],
    });
    expect(new Headers(requests[0]?.init?.headers).get("authorization")).toBe("Bearer management-token");
  });
});

function createContext(requests: RecordedRequest[], payload: unknown): ApiKeyProviderContext {
  return {
    apiKey: "test-token",
    fetcher: createFetcher(requests, payload),
  };
}

function createFetcher(requests: RecordedRequest[], payload: unknown): typeof fetch {
  return async (input, init): Promise<Response> => {
    requests.push({
      url: input instanceof Request ? input.url : String(input),
      init,
    });
    return Response.json(payload);
  };
}
