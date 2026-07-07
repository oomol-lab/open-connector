import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildLongbridgeAuthorizationStartBody,
  isLongbridgeConnectionReady,
  normalizeLongbridgeRuntimeOrigin,
  readLongbridgeOAuthConfig,
} from "./authorize-oauth.ts";
import { buildLongbridgeOAuthRegistrationBody, readRegisteredLongbridgeOAuthClient } from "./register-oauth-client.ts";
import {
  buildLongbridgeRuntimeActionRequest,
  classifyLongbridgeVerificationResponse,
  findLongbridgeEmptyOutputKeys,
  selectLongbridgeVerificationActionNames,
  verifyLongbridgeActions,
} from "./verify-actions.ts";

describe("Longbridge OAuth client registration verification", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("builds the Dynamic Client Registration request expected by Longbridge", () => {
    expect(
      buildLongbridgeOAuthRegistrationBody({
        redirectUri: "http://localhost:3000/oauth/callback",
        clientName: " My Longbridge OpenAPI ",
      }),
    ).toEqual({
      redirect_uris: ["http://localhost:3000/oauth/callback"],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      client_name: "My Longbridge OpenAPI",
    });
  });

  it("reads direct or enveloped Longbridge registration responses", () => {
    expect(readRegisteredLongbridgeOAuthClient({ client_id: "client-1" })).toEqual({
      clientId: "client-1",
      clientSecret: "",
    });
    expect(
      readRegisteredLongbridgeOAuthClient({
        data: {
          client_id: "client-2",
          client_secret: "secret-2",
        },
      }),
    ).toEqual({
      clientId: "client-2",
      clientSecret: "secret-2",
    });
  });

  it("normalizes the runtime origin used by the one-shot authorization script", () => {
    expect(normalizeLongbridgeRuntimeOrigin(undefined)).toBe("http://localhost:3000");
    expect(normalizeLongbridgeRuntimeOrigin(" http://localhost:60355/// ")).toBe("http://localhost:60355");
  });

  it("builds the OpenConnector authorization start body", () => {
    expect(buildLongbridgeAuthorizationStartBody()).toEqual({ service: "longbridge" });
    expect(buildLongbridgeAuthorizationStartBody(" verified ")).toEqual({
      service: "longbridge",
      connectionName: "verified",
    });
  });

  it("finds the Longbridge OAuth config and detects completed connections", () => {
    expect(
      readLongbridgeOAuthConfig([
        {
          service: "longbridge",
          expectedRedirectUri: "http://localhost:60355/callback",
        },
      ]),
    ).toEqual({
      service: "longbridge",
      expectedRedirectUri: "http://localhost:60355/callback",
    });
    expect(() => readLongbridgeOAuthConfig([])).toThrow("Longbridge OAuth config");

    expect(
      isLongbridgeConnectionReady(
        [
          {
            service: "longbridge",
            configured: true,
          },
        ],
        undefined,
      ),
    ).toBe(true);
    expect(
      isLongbridgeConnectionReady(
        [
          {
            service: "longbridge",
            connectionName: "verification",
            configured: true,
          },
        ],
        "verification",
      ),
    ).toBe(true);
    expect(
      isLongbridgeConnectionReady(
        [
          {
            service: "longbridge",
            connectionName: "other",
            configured: true,
          },
        ],
        "verification",
      ),
    ).toBe(false);
  });

  it("selects readonly Longbridge actions by default for endpoint verification", () => {
    const names = selectLongbridgeVerificationActionNames({});

    expect(names.length).toBeGreaterThan(50);
    expect(names).toContain("dividend");
    expect(names).toContain("finance_calendar");
    expect(names).toContain("screener_search");
    expect(names).not.toContain("list_account_cash");
    expect(selectLongbridgeVerificationActionNames({ actions: ["dividend", "anomaly"] })).toEqual([
      "dividend",
      "anomaly",
    ]);
    expect(selectLongbridgeVerificationActionNames({ includeExisting: true })).toContain("list_account_cash");
  });

  it("builds runtime action requests for Longbridge verification", () => {
    expect(
      buildLongbridgeRuntimeActionRequest("http://localhost:3000/", "dividend", {
        symbol: "AAPL.US",
      }),
    ).toEqual({
      url: "http://localhost:3000/v1/actions/longbridge.dividend",
      body: {
        input: {
          symbol: "AAPL.US",
        },
      },
    });
  });

  it("classifies runtime verification responses and empty outputs", () => {
    expect(
      classifyLongbridgeVerificationResponse({
        actionName: "dividend",
        status: 200,
        body: {
          success: true,
          data: {
            dividends: [],
            raw: {
              code: 0,
            },
          },
        },
      }),
    ).toEqual({
      actionName: "dividend",
      ok: true,
      status: 200,
      emptyOutputKeys: ["dividends"],
    });

    expect(
      classifyLongbridgeVerificationResponse({
        actionName: "dividend",
        status: 400,
        body: {
          success: false,
          message: "bad request",
          errorCode: "provider_error",
        },
      }),
    ).toMatchObject({
      actionName: "dividend",
      ok: false,
      status: 400,
      errorCode: "provider_error",
      message: "bad request",
    });

    expect(
      findLongbridgeEmptyOutputKeys({
        raw: {},
        dividends: [],
        profile: {},
        count: 0,
      }),
    ).toEqual(["dividends", "profile"]);
  });

  it("continues batch action verification after a request failure", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              news: [{ title: "Longbridge verification" }],
              raw: { code: 0 },
            },
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const report = await verifyLongbridgeActions({
      actions: ["dividend", "news"],
      delayMs: 0,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(report).toMatchObject({
      actionCount: 2,
      passed: 1,
      failed: 1,
      empty: 0,
    });
    expect(report.results[0]).toMatchObject({
      actionName: "dividend",
      ok: false,
      status: 0,
      errorCode: "request_failed",
      message: "network down",
    });
    expect(report.results[1]).toMatchObject({
      actionName: "news",
      ok: true,
      status: 200,
      emptyOutputKeys: [],
    });
  });
});
