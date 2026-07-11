import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { describe, expect, it } from "vitest";
import { revenueCatActionHandlers } from "./executors.ts";

describe("RevenueCat executors", () => {
  it("sends bearer authentication and normalizes paginated customer responses", async () => {
    let requestUrl = "";
    let requestHeaders: Headers | undefined;
    const context = createContext(async (input, init) => {
      requestUrl = String(input);
      requestHeaders = new Headers(init?.headers);
      return new Response(
        JSON.stringify({
          object: "list",
          items: [{ id: "customer_1" }],
          next_page: "/v2/projects/proj_1/customers?starting_after=customer_1",
          url: "/v2/projects/proj_1/customers",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    const output = await revenueCatActionHandlers.list_customers(
      {
        projectId: "proj/1",
        startingAfter: "cursor_1",
        limit: 2,
        search: "person@example.com",
      },
      context,
    );

    expect(requestUrl).toBe(
      "https://api.revenuecat.com/v2/projects/proj%2F1/customers?starting_after=cursor_1&limit=2&search=person%40example.com",
    );
    expect(requestHeaders?.get("authorization")).toBe("Bearer secret-key");
    expect(output).toEqual({
      object: "list",
      items: [{ id: "customer_1" }],
      nextPage: "/v2/projects/proj_1/customers?starting_after=customer_1",
      url: "/v2/projects/proj_1/customers",
    });
  });

  it("serializes expandable customer fields as repeated query parameters", async () => {
    let requestUrl = "";
    const context = createContext(async (input) => {
      requestUrl = String(input);
      return new Response(JSON.stringify({ id: "customer_1", attributes: { items: [] } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    await revenueCatActionHandlers.get_customer(
      { projectId: "proj_1", customerId: "customer/1", expand: ["attributes"] },
      context,
    );

    expect(requestUrl).toBe("https://api.revenuecat.com/v2/projects/proj_1/customers/customer%2F1?expand=attributes");
  });
});

function createContext(fetcher: typeof fetch): ApiKeyProviderContext {
  return {
    apiKey: "secret-key",
    fetcher,
  };
}
