import type { ExecutionContext, ResolvedCredential } from "../../core/types.ts";

import { exportPKCS8, generateKeyPair } from "jose";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { credentialValidators, executors, proxy } from "./executors.ts";

const keyId = "2X9R4HXF34";
const issuerId = "57246542-96fe-1a63-e053-0824d011072a";

let values: Record<string, string>;
let context: ExecutionContext;

beforeAll(async () => {
  const { privateKey } = await generateKeyPair("ES256", { extractable: true });
  values = { keyId, issuerId, privateKey: await exportPKCS8(privateKey) };
  const credential: ResolvedCredential = {
    authType: "custom_credential",
    values,
    profile: { accountId: issuerId, displayName: `App Store Connect key ${keyId}`, grantedScopes: [] },
    metadata: {},
  };
  context = { getCredential: async () => credential };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Record every outgoing request and answer each one from the given queue. */
function stubFetch(responses: Array<() => Response>): Request[] {
  const requests: Request[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push(input instanceof Request ? input : new Request(input, init));
    const next = responses[requests.length - 1];
    if (!next) {
      throw new Error(`unexpected request ${requests.length}`);
    }
    return next();
  });
  return requests;
}

function errorResponse(status: number, errors: Array<Record<string, string>>): Response {
  return Response.json({ errors }, { status });
}

describe("App Store Connect list pagination", () => {
  it("reads the next cursor out of the absolute links.next URL", async () => {
    const requests = stubFetch([
      () =>
        Response.json({
          data: [{ type: "apps", id: "6446901002", attributes: { name: "Demo", bundleId: "com.example.demo" } }],
          links: {
            self: "https://api.appstoreconnect.apple.com/v1/apps?limit=1",
            next: "https://api.appstoreconnect.apple.com/v1/apps?cursor=AoJ4g7mg6o4D.ANrJC88&limit=1",
          },
          meta: { paging: { total: 431, limit: 1 } },
        }),
    ]);

    const result = await executors["app_store_connect.list_apps"]!({ limit: 1 }, context);

    expect(result).toMatchObject({
      ok: true,
      output: {
        apps: [{ id: "6446901002", name: "Demo", bundleId: "com.example.demo" }],
        nextCursor: "AoJ4g7mg6o4D.ANrJC88",
        total: 431,
      },
    });
    expect(requests[0]?.url).toBe("https://api.appstoreconnect.apple.com/v1/apps?limit=1");
    expect(requests[0]?.headers.get("authorization")?.startsWith("Bearer ")).toBe(true);
  });

  it("falls back to the bare paging cursor and reports an absent total as null", async () => {
    stubFetch([
      () =>
        Response.json({
          data: [],
          links: { self: "https://api.appstoreconnect.apple.com/v1/apps" },
          meta: { paging: { limit: 200, nextCursor: "BARE.CURSOR" } },
        }),
    ]);

    const result = await executors["app_store_connect.list_apps"]!({}, context);

    expect(result).toMatchObject({ ok: true, output: { apps: [], nextCursor: "BARE.CURSOR", total: null } });
  });

  it("passes a caller cursor straight back to App Store Connect", async () => {
    const requests = stubFetch([
      () => Response.json({ data: [], links: { self: "https://api.appstoreconnect.apple.com/v1/apps" } }),
    ]);

    await executors["app_store_connect.list_apps"]!({ cursor: "AoJ4g7mg6o4D.ANrJC88" }, context);

    expect(new URL(requests[0]!.url).searchParams.get("cursor")).toBe("AoJ4g7mg6o4D.ANrJC88");
  });
});

describe("App Store Connect error mapping", () => {
  it("composes the message from the first error and counts the rest", async () => {
    stubFetch([
      () =>
        errorResponse(404, [
          { status: "404", code: "NOT_FOUND", title: "The resource does not exist", detail: "id 'missing' not found" },
          { status: "404", code: "NOT_FOUND", title: "Another problem", detail: "second detail" },
        ]),
    ]);

    const result = await executors["app_store_connect.get_app"]!({ appId: "missing" }, context);

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "invalid_input",
        // Apple's error code leads the message: it is the only part a caller can branch on.
        message: "NOT_FOUND: The resource does not exist: id 'missing' not found (+1 more)",
        details: { status: 404 },
      },
    });
  });

  it("keeps a title-only error message and the upstream status", async () => {
    stubFetch([() => errorResponse(429, [{ status: "429", code: "RATE_LIMIT_EXCEEDED", title: "Too many requests" }])]);

    const result = await executors["app_store_connect.list_apps"]!({}, context);

    expect(result).toMatchObject({
      ok: false,
      error: { code: "rate_limited", message: "RATE_LIMIT_EXCEEDED: Too many requests", details: { status: 429 } },
    });
  });

  it.each([401, 403])("reports an upstream %i as an authorization failure while executing", async (status) => {
    stubFetch([() => new Response("", { status })]);

    const result = await executors["app_store_connect.list_apps"]!({}, context);

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "authorization_failed",
        message: `App Store Connect request failed with HTTP ${status}`,
        details: { status },
      },
    });
  });

  it("falls back to the status when the body is not JSON", async () => {
    stubFetch([() => new Response("Not Acceptable", { status: 406, headers: { "content-type": "text/plain" } })]);

    const result = await executors["app_store_connect.list_apps"]!({}, context);

    expect(result).toMatchObject({
      ok: false,
      error: { message: "App Store Connect request failed with HTTP 406" },
    });
  });
});

describe("App Store Connect credential validation", () => {
  it("accepts a key that can list apps", async () => {
    const result = await credentialValidators.customCredential!(
      { values },
      { fetcher: async () => Response.json({ data: [], links: { self: "https://api.appstoreconnect.apple.com" } }) },
    );

    expect(result).toMatchObject({
      profile: { accountId: issuerId, displayName: `App Store Connect key ${keyId}` },
      metadata: { keyId, issuerId, keyKind: "team" },
    });
  });

  it("rejects a key that cannot list apps, because 403 also covers a revoked key", async () => {
    await expect(
      credentialValidators.customCredential!(
        { values },
        { fetcher: async () => errorResponse(403, [{ status: "403", code: "FORBIDDEN_ERROR", title: "Forbidden" }]) },
      ),
    ).rejects.toMatchObject({
      status: 400,
      message:
        "App Store Connect authenticated the key but refused to list apps. Grant the key a role that can read apps (for example Developer, App Manager or Admin), and check that the key has not been revoked.",
    });
  });

  it("reports a rejected key as a field error rather than a reconnect prompt", async () => {
    await expect(
      credentialValidators.customCredential!({ values }, { fetcher: async () => new Response("", { status: 401 }) }),
    ).rejects.toMatchObject({
      status: 400,
      message: "App Store Connect rejected the key. Check the Key ID, Issuer ID and private key.",
    });
  });

  it("labels a key without an issuer as an individual key", async () => {
    const result = await credentialValidators.customCredential!(
      { values: { keyId, privateKey: values.privateKey! } },
      { fetcher: async () => Response.json({ data: [], links: { self: "https://api.appstoreconnect.apple.com" } }) },
    );

    expect(result).toMatchObject({
      profile: { accountId: keyId },
      metadata: { keyKind: "individual", issuerId: null },
    });
  });
});

describe("App Store Connect no-content writes", () => {
  it.each([202, 204])("accepts the documented %i answer when removing a tester", async (status) => {
    stubFetch([() => new Response(null, { status })]);

    const result = await executors["app_store_connect.delete_beta_tester"]!({ betaTesterId: "T1" }, context);

    expect(result).toMatchObject({ ok: true, output: { id: "T1", deleted: true } });
  });

  it("refuses to report a deletion for any other success status", async () => {
    // A redirect the guarded fetch rewrites to GET answers 200 with the tester
    // still present, so "any 2xx" would report a deletion that never happened.
    stubFetch([() => Response.json({ data: { type: "betaTesters", id: "T1" } })]);

    const result = await executors["app_store_connect.delete_beta_tester"]!({ betaTesterId: "T1" }, context);

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "provider_error",
        message: "Removing the App Store Connect beta tester answered HTTP 200 instead of 202 or 204",
      },
    });
  });

  it("sends the linkage body on the relationship DELETE", async () => {
    const requests = stubFetch([() => new Response(null, { status: 204 })]);

    const result = await executors["app_store_connect.remove_beta_testers_from_group"]!(
      { betaGroupId: "G1", betaTesterIds: ["T1", "T2"] },
      context,
    );

    expect(result).toMatchObject({
      ok: true,
      output: { betaGroupId: "G1", betaTesterIds: ["T1", "T2"], removed: true },
    });
    expect(requests[0]?.method).toBe("DELETE");
    await expect(requests[0]!.json()).resolves.toEqual({
      data: [
        { type: "betaTesters", id: "T1" },
        { type: "betaTesters", id: "T2" },
      ],
    });
  });
});

describe("App Store Connect beta testers", () => {
  it("refuses to invite a tester that is assigned to no group and no build", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    const result = await executors["app_store_connect.create_beta_tester"]!({ email: "tester@example.com" }, context);

    expect(result).toMatchObject({
      ok: false,
      error: { code: "invalid_input", message: "betaGroupIds or buildIds must contain at least one identifier" },
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("App Store Connect test notes", () => {
  const localization = {
    type: "betaBuildLocalizations",
    id: "L1",
    attributes: { locale: "en-US", whatsNew: "Fixed a crash." },
  };

  it("patches the localization that already covers the locale", async () => {
    const requests = stubFetch([
      () =>
        Response.json({
          data: [{ type: "betaBuildLocalizations", id: "L1", attributes: { locale: "en-US", whatsNew: "Old." } }],
          links: { self: "https://api.appstoreconnect.apple.com" },
        }),
      () => Response.json({ data: localization, links: { self: "https://api.appstoreconnect.apple.com" } }),
    ]);

    const result = await executors["app_store_connect.update_build_test_notes"]!(
      { buildId: "B1", locale: "en-US", whatsNew: "Fixed a crash." },
      context,
    );

    expect(result).toMatchObject({
      ok: true,
      output: { id: "L1", locale: "en-US", whatsNew: "Fixed a crash.", created: false },
    });
    // The lookup asks the filterable collection for the one matching row rather
    // than paging the localizations of the build.
    const lookup = new URL(requests[0]!.url);
    expect(lookup.pathname).toBe("/v1/betaBuildLocalizations");
    expect(lookup.searchParams.get("filter[build]")).toBe("B1");
    expect(lookup.searchParams.get("filter[locale]")).toBe("en-US");
    expect(lookup.searchParams.get("limit")).toBe("1");
    expect(requests[1]?.method).toBe("PATCH");
    expect(requests[1]?.url).toBe("https://api.appstoreconnect.apple.com/v1/betaBuildLocalizations/L1");
  });

  it("rejects a build id that would collapse into a different path", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    const result = await executors["app_store_connect.update_build_test_notes"]!(
      { buildId: "..", locale: "en-US", whatsNew: "Fixed a crash." },
      context,
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "invalid_input", message: "buildId must not be . or ..", details: { status: 400 } },
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("creates a localization when the locale has no notes yet", async () => {
    const requests = stubFetch([
      () => Response.json({ data: [], links: { self: "https://api.appstoreconnect.apple.com" } }),
      () =>
        Response.json(
          { data: localization, links: { self: "https://api.appstoreconnect.apple.com" } },
          { status: 201 },
        ),
    ]);

    const result = await executors["app_store_connect.update_build_test_notes"]!(
      { buildId: "B1", locale: "en-US", whatsNew: "Fixed a crash." },
      context,
    );

    expect(result).toMatchObject({ ok: true, output: { id: "L1", created: true } });
    expect(requests[1]?.method).toBe("POST");
    expect(requests[1]?.url).toBe("https://api.appstoreconnect.apple.com/v1/betaBuildLocalizations");
    await expect(requests[1]!.json()).resolves.toMatchObject({
      data: {
        type: "betaBuildLocalizations",
        attributes: { locale: "en-US", whatsNew: "Fixed a crash." },
        relationships: { build: { data: { type: "builds", id: "B1" } } },
      },
    });
  });
});

describe("App Store Connect included relationships", () => {
  it("attaches the prerelease version each build belongs to", async () => {
    const requests = stubFetch([
      () =>
        Response.json({
          data: [
            {
              type: "builds",
              id: "B1",
              attributes: { version: "42", processingState: "VALID" },
              relationships: { preReleaseVersion: { data: { type: "preReleaseVersions", id: "P1" } } },
            },
            { type: "builds", id: "B2", attributes: { version: "41" } },
          ],
          included: [{ type: "preReleaseVersions", id: "P1", attributes: { version: "1.4.0", platform: "IOS" } }],
          links: { self: "https://api.appstoreconnect.apple.com" },
        }),
    ]);

    const result = await executors["app_store_connect.list_builds"]!(
      { appId: "A1", expired: false, platform: "IOS" },
      context,
    );

    expect(result).toMatchObject({
      ok: true,
      output: {
        builds: [
          { id: "B1", version: "42", preReleaseVersion: { id: "P1", version: "1.4.0", platform: "IOS" } },
          { id: "B2", preReleaseVersion: null },
        ],
      },
    });
    const query = new URL(requests[0]!.url).searchParams;
    expect(query.get("filter[app]")).toBe("A1");
    expect(query.get("filter[expired]")).toBe("false");
    expect(query.get("filter[preReleaseVersion.platform]")).toBe("IOS");
    expect(query.get("include")).toBe("preReleaseVersion");
  });
});

describe("App Store Connect app store versions", () => {
  it("drops the deprecated appStoreState and usesIdfa attributes", async () => {
    stubFetch([
      () =>
        Response.json({
          data: [
            {
              type: "appStoreVersions",
              id: "V1",
              attributes: {
                platform: "IOS",
                versionString: "2.0.1",
                appStoreState: "READY_FOR_SALE",
                appVersionState: "READY_FOR_DISTRIBUTION",
                earliestReleaseDate: null,
                usesIdfa: null,
              },
            },
          ],
          links: { self: "https://api.appstoreconnect.apple.com" },
        }),
    ]);

    const result = await executors["app_store_connect.list_app_store_versions"]!({ appId: "A1" }, context);

    expect(result).toMatchObject({
      ok: true,
      output: {
        appStoreVersions: [
          { id: "V1", versionString: "2.0.1", appVersionState: "READY_FOR_DISTRIBUTION", earliestReleaseDate: null },
        ],
      },
    });
    // Apple deprecated both attributes, so the record must not carry them even
    // though the attribute spread would otherwise pass them straight through.
    expect(result).not.toHaveProperty("output.appStoreVersions.0.appStoreState");
    expect(result).not.toHaveProperty("output.appStoreVersions.0.usesIdfa");
  });
});

describe("App Store Connect proxy", () => {
  it("signs the forwarded request", async () => {
    const requests = stubFetch([() => Response.json({ data: [] })]);

    const result = await proxy({ method: "GET", endpoint: "/v1/apps", query: { limit: "1" } }, context);

    expect(result.ok).toBe(true);
    expect(requests[0]?.url).toBe("https://api.appstoreconnect.apple.com/v1/apps?limit=1");
    expect(requests[0]?.headers.get("authorization")?.startsWith("Bearer ")).toBe(true);
  });

  it.each([
    ["/v1/../../etc/passwd", "endpoint must not contain path traversal segments"],
    ["/v1\\apps", "endpoint must not contain path traversal segments"],
    ["/etc/passwd", "endpoint is not supported for this provider"],
    ["/.well-known/openid-configuration", "endpoint is not supported for this provider"],
  ])("rejects %s before signing a token", async (endpoint, message) => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    const result = await proxy({ method: "GET", endpoint }, context);

    expect(result).toMatchObject({ ok: false, error: { message } });
    expect(fetch).not.toHaveBeenCalled();
  });
});
