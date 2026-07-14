import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { describe, expect, it } from "vitest";
import { duneActionHandlers } from "./runtime.ts";

interface RecordedRequest {
  url: string;
  init?: RequestInit;
}

describe("Dune runtime", () => {
  it("executes a saved query with parameters and a performance tier", async () => {
    const requests: RecordedRequest[] = [];
    const context = createContext(
      requests,
      Response.json({ execution_id: "execution-1", state: "QUERY_STATE_PENDING" }),
    );

    await expect(
      duneActionHandlers.execute_query!(
        {
          queryId: 42,
          queryParameters: { blockchain: "ethereum", days: 7 },
          performance: "large",
        },
        context,
      ),
    ).resolves.toEqual({ execution_id: "execution-1", state: "QUERY_STATE_PENDING" });

    expect(requests[0]?.url).toBe("https://api.dune.com/api/v1/query/42/execute");
    expect(requests[0]?.init?.method).toBe("POST");
    expect(new Headers(requests[0]?.init?.headers).get("x-dune-api-key")).toBe("test-api-key");
    expect(new Headers(requests[0]?.init?.headers).get("content-type")).toBe("application/json");
    expect(JSON.parse(String(requests[0]?.init?.body))).toEqual({
      query_parameters: { blockchain: "ethereum", days: 7 },
      performance: "large",
    });
  });

  it("maps result filters and sorting to Dune query parameters", async () => {
    const requests: RecordedRequest[] = [];
    const context = createContext(requests, Response.json({ execution_id: "execution-1" }));

    await duneActionHandlers.get_execution_result!(
      {
        executionId: "execution-1",
        limit: 25,
        offset: 50,
        columns: "project,volume",
        filters: "volume > 1000",
        sortBy: "volume desc",
        allowPartialResults: true,
        ignoreMaxCreditsPerRequest: false,
      },
      context,
    );

    expect(requests[0]?.url).toBe(
      "https://api.dune.com/api/v1/execution/execution-1/results?limit=25&offset=50&columns=project%2Cvolume&filters=volume+%3E+1000&sort_by=volume+desc&allow_partial_results=true&ignore_max_credits_per_request=false",
    );
  });

  it("uses a useful fallback when Dune returns an empty status text", async () => {
    const context = createContext([], new Response("{}", { status: 500, statusText: "" }));

    await expect(
      duneActionHandlers.get_execution_status!({ executionId: "execution-1" }, context),
    ).rejects.toMatchObject({
      status: 500,
      message: "Dune request failed with status 500",
    });
  });
});

function createContext(requests: RecordedRequest[], response: Response): ApiKeyProviderContext {
  return {
    apiKey: "test-api-key",
    fetcher: async (input, init): Promise<Response> => {
      requests.push({
        url: input instanceof Request ? input.url : String(input),
        init,
      });
      return response;
    },
  };
}
