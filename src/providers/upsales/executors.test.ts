import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { describe, expect, it } from "vitest";
import { ProviderRequestError } from "../provider-runtime.ts";
import { upsalesActionHandlers } from "./executors.ts";

function contextCapturing(urls: string[], payload: unknown): ApiKeyProviderContext {
  return {
    apiKey: "test-token",
    fetcher: async (input: string | URL | Request): Promise<Response> => {
      urls.push(String(input));
      return Response.json({ data: payload });
    },
  } as ApiKeyProviderContext;
}

function queryOf(url: string): URLSearchParams {
  return new URL(url).searchParams;
}

describe("Upsales list filters", () => {
  it("sends declared filters as query parameters", async () => {
    const urls: string[] = [];
    await upsalesActionHandlers.list_companies!(
      { limit: 10, offset: 20, filters: { "user.id": 7, name: "acme", active: true } },
      contextCapturing(urls, []),
    );

    const query = queryOf(urls[0]!);
    expect(query.get("limit")).toBe("10");
    expect(query.get("offset")).toBe("20");
    expect(query.get("user.id")).toBe("7");
    expect(query.get("name")).toBe("acme");
    expect(query.get("active")).toBe("true");
  });

  it.each(["token", "limit", "offset", "isExternal"])(
    'rejects a filter that would overwrite the reserved "%s" query parameter',
    async (key) => {
      const urls: string[] = [];
      await expect(
        upsalesActionHandlers.list_companies!({ filters: { [key]: "other" } }, contextCapturing(urls, [])),
      ).rejects.toThrow(ProviderRequestError);
      expect(urls).toEqual([]);
    },
  );

  it("rejects a filter value that cannot be sent as a query parameter", async () => {
    const urls: string[] = [];
    await expect(
      upsalesActionHandlers.list_contacts!({ filters: { "user.id": { nested: true } } }, contextCapturing(urls, [])),
    ).rejects.toThrow('filters."user.id" must be a string, number, or boolean');
    expect(urls).toEqual([]);
  });
});

describe("Upsales record identifiers", () => {
  it("accepts the positive integer IDs the action schemas declare", async () => {
    const urls: string[] = [];
    const context = contextCapturing(urls, {});

    await upsalesActionHandlers.get_company!({ id: 42 }, context);
    await upsalesActionHandlers.get_contact!({ id: 7 }, context);

    expect(urls.map((url) => new URL(url).pathname)).toEqual(["/api/v2/accounts/42", "/api/v2/contacts/7"]);
  });

  it("rejects an identifier that is not a positive integer", async () => {
    const urls: string[] = [];
    await expect(upsalesActionHandlers.get_company!({ id: 0 }, contextCapturing(urls, {}))).rejects.toThrow(
      "id must be a positive integer",
    );
    expect(urls).toEqual([]);
  });
});

describe("Upsales contact name handling", () => {
  it("forwards the declared first/last name flag", async () => {
    const urls: string[] = [];
    await upsalesActionHandlers.create_contact!(
      { contact: { firstName: "Ada", lastName: "Lovelace" }, usingFirstnameLastname: true },
      contextCapturing(urls, {}),
    );

    expect(queryOf(urls[0]!).get("usingFirstnameLastname")).toBe("true");
  });

  it("omits the flag when it is not requested", async () => {
    const urls: string[] = [];
    await upsalesActionHandlers.update_contact!({ id: 1, contact: { name: "Ada" } }, contextCapturing(urls, {}));

    expect(queryOf(urls[0]!).has("usingFirstnameLastname")).toBe(false);
  });
});
