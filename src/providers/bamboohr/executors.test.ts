import { describe, expect, it, vi } from "vitest";
import { bamboohrActionHandlers, credentialValidators } from "./executors.ts";

describe("BambooHR authentication", () => {
  it("validates OAuth credentials against the configured company", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(input.toString()).toBe("https://acme.bamboohr.com/api/v1/company_information");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer bamboohr-access-token");
      return Response.json({ displayName: "Acme" });
    });

    const result = await credentialValidators.oauth2!(
      {
        authType: "oauth2",
        accessToken: "bamboohr-access-token",
        tokenType: "Bearer",
        profile: {
          accountId: "oauth2",
          displayName: "OAuth Credential",
          grantedScopes: [],
        },
        metadata: {
          scope: "company:info employee",
          oauthClientExtra: {
            companyDomain: "acme",
          },
        },
      },
      { fetcher },
    );

    expect(result).toMatchObject({
      profile: {
        accountId: "acme",
        displayName: "Acme",
      },
      grantedScopes: ["company:info", "employee"],
      metadata: {
        companyDomain: "acme",
        apiBaseUrl: "https://acme.bamboohr.com",
      },
    });
  });

  it("executes OAuth actions with Bearer authentication", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(input.toString()).toBe("https://acme.bamboohr.com/api/v1/employees?page%5Blimit%5D=1");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer bamboohr-access-token");
      return Response.json({ data: [], meta: {}, _links: {} });
    });

    const result = await bamboohrActionHandlers.list_employees(
      { limit: 1 },
      {
        authorization: "Bearer bamboohr-access-token",
        companyDomain: "acme",
        fetcher,
      },
    );

    expect(result).toMatchObject({
      employees: [],
      meta: {},
      links: {},
    });
  });
});
