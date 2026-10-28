import type { BotFrameworkSigningKey } from "./teams-bot-event-verification.ts";

import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyTeamsBotEventRequest } from "./teams-bot-event-verification.ts";

const appId = "00000000-0000-0000-0000-000000000001";
const issuer = "https://api.botframework.com";
const serviceUrl = "https://smba.trafficmanager.net/teams/";
const now = 1_700_000_000_000;
const { privateKey, publicKey } = await generateKeyPair("RS256");
const otherKeys = await generateKeyPair("RS256");

interface TokenOptions {
  kid?: string;
  iss?: string;
  aud?: string;
  exp?: number | null;
  claimServiceUrl?: string;
  key?: CryptoKey;
}

async function token(options: TokenOptions = {}): Promise<string> {
  const jwt = new SignJWT({ serviceurl: options.claimServiceUrl ?? serviceUrl })
    .setProtectedHeader({ alg: "RS256", kid: options.kid ?? "key-1" })
    .setIssuer(options.iss ?? issuer)
    .setAudience(options.aud ?? appId);
  if (options.exp !== null) jwt.setExpirationTime(options.exp ?? now / 1000 + 600);
  return jwt.sign(options.key ?? privateKey);
}

function activity(overrides: Record<string, unknown> = {}): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      id: "activity-1",
      type: "message",
      serviceUrl,
      channelId: "msteams",
      conversation: { id: "conversation-1", tenantId: "tenant-1" },
      from: { id: "29:user-1", aadObjectId: "aad-object-1" },
      ...overrides,
    }),
  );
}

async function verify(
  tokenOptions: TokenOptions = {},
  body: Uint8Array = activity(),
  endorsements: string[] = ["msteams"],
) {
  const signingKey: BotFrameworkSigningKey = { key: publicKey, endorsements };
  return verifyTeamsBotEventRequest({
    authorization: `Bearer ${await token(tokenOptions)}`,
    rawBody: body,
    appId,
    now,
    resolveKey: async (_cloud, keyId) => (keyId === "key-1" ? signingKey : undefined),
  });
}

describe("Teams bot inbound activity verification", () => {
  it("accepts a token for the bot and returns trusted activity identifiers", async () => {
    await expect(verify()).resolves.toEqual({
      valid: true,
      appId,
      tenantId: "tenant-1",
      serviceUrl,
      activityId: "activity-1",
      conversationId: "conversation-1",
      aadObjectId: "aad-object-1",
      channelId: "msteams",
    });
  });

  it("uses channelData tenant when the conversation has no tenant", async () => {
    await expect(
      verify(
        {},
        activity({
          conversation: { id: "conversation-1" },
          channelData: { tenant: { id: "tenant-from-channel-data" } },
        }),
      ),
    ).resolves.toMatchObject({ valid: true, tenantId: "tenant-from-channel-data" });
  });

  it.each([
    "https://smba.trafficmanager.net/teams/",
    "https://smba.infra.gcc.teams.microsoft.com/",
    "https://smba.infra.gov.teams.microsoft.us/",
    "https://smba.infra.dod.teams.microsoft.us/",
  ])("accepts the documented Bot Connector host %s", async (allowedServiceUrl) => {
    await expect(
      verify({ claimServiceUrl: allowedServiceUrl }, activity({ serviceUrl: allowedServiceUrl })),
    ).resolves.toMatchObject({ valid: true, serviceUrl: allowedServiceUrl });
  });

  it.each([
    "https://user@smba.trafficmanager.net/teams/",
    "https://:password@smba.trafficmanager.net/teams/",
    "https://smba.trafficmanager.net/teams/#fragment",
    "https://attacker.example/teams/",
    "https://smba.trafficmanager.net.evil.example/teams/",
    "http://smba.trafficmanager.net/teams/",
    "https://smba.trafficmanager.net:8443/teams/",
    "https://smba.trafficmanager.net/teams/?redirect=attacker",
  ])("rejects the unsafe serviceUrl %s", async (disallowedServiceUrl) => {
    await expect(
      verify({ claimServiceUrl: disallowedServiceUrl }, activity({ serviceUrl: disallowedServiceUrl })),
    ).resolves.toEqual({ valid: false, reason: "service_url" });
  });

  it("rejects a token signed by another key", async () => {
    await expect(verify({ key: otherKeys.privateKey })).resolves.toEqual({ valid: false, reason: "token" });
  });

  it("rejects an unknown issuer and a token meant for another bot", async () => {
    await expect(verify({ iss: "https://attacker.example" })).resolves.toEqual({ valid: false, reason: "token" });
    await expect(verify({ aud: "other-bot" })).resolves.toEqual({ valid: false, reason: "app" });
  });

  it("rejects an expired token beyond the clock tolerance", async () => {
    await expect(verify({ exp: now / 1000 - 600 })).resolves.toEqual({ valid: false, reason: "timestamp" });
  });

  it("rejects a signed token that carries no expiry", async () => {
    await expect(verify({ exp: null })).resolves.toEqual({ valid: false, reason: "token" });
  });

  it("binds the token to the activity serviceUrl", async () => {
    await expect(verify({}, activity({ serviceUrl: "https://smba.trafficmanager.net/amer/" }))).resolves.toEqual({
      valid: false,
      reason: "service_url",
    });
  });

  it("requires the signing key to be endorsed for the activity channel", async () => {
    await expect(verify({}, activity(), ["webchat"])).resolves.toEqual({ valid: false, reason: "channel" });
    await expect(verify({}, activity({ channelId: undefined }), ["webchat"])).resolves.toMatchObject({ valid: true });
  });

  it("reports a malformed body only after the token is trusted", async () => {
    await expect(verify({}, new TextEncoder().encode("not json"))).resolves.toEqual({
      valid: false,
      reason: "payload",
    });
    await expect(
      verifyTeamsBotEventRequest({ authorization: "Bearer nope", rawBody: new Uint8Array(), appId, now }),
    ).resolves.toEqual({ valid: false, reason: "token" });
  });
});

describe("Bot Framework published signing keys", () => {
  let verifier: typeof import("./teams-bot-event-verification.ts");
  let keysDocument: unknown;
  const fetcher = vi.fn(async (url: string) =>
    Response.json(url.endsWith("openidconfiguration") ? { jwks_uri: "https://keys.example/jwks" } : keysDocument),
  );

  beforeEach(async () => {
    vi.resetModules();
    verifier = await import("./teams-bot-event-verification.ts");
    vi.spyOn(Date, "now").mockReturnValue(now);
    fetcher.mockClear();
    keysDocument = { keys: [{ ...(await exportJWK(publicKey)), kid: "key-1", endorsements: ["msteams"] }] };
    vi.stubGlobal("fetch", fetcher);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function verifyPublished(kid = "key-1") {
    return verifier.verifyTeamsBotEventRequest({
      authorization: `Bearer ${await token({ kid })}`,
      rawBody: activity(),
      appId,
      now,
    });
  }

  it("keeps cached keys usable but reports unavailable unknown keys after a failed refresh", async () => {
    await expect(verifyPublished()).resolves.toMatchObject({ valid: true });
    vi.mocked(Date.now).mockReturnValue(now + 3_600_001);
    fetcher.mockRejectedValueOnce(new Error("Network unavailable"));

    await expect(verifyPublished("new-key")).rejects.toBeInstanceOf(verifier.BotFrameworkKeysUnavailableError);
    await expect(verifyPublished()).resolves.toMatchObject({ valid: true });
    await expect(verifyPublished("new-key")).rejects.toBeInstanceOf(verifier.BotFrameworkKeysUnavailableError);
    expect(fetcher).toHaveBeenCalledTimes(3);

    keysDocument = { keys: [{ ...(await exportJWK(publicKey)), kid: "new-key", endorsements: ["msteams"] }] };
    vi.mocked(Date.now).mockReturnValue(now + 3_900_002);
    await expect(verifyPublished("new-key")).resolves.toMatchObject({ valid: true });
    await expect(verifyPublished("unknown-key")).resolves.toEqual({ valid: false, reason: "token" });
    expect(fetcher).toHaveBeenCalledTimes(5);
  });

  it.each([null, {}, { keys: {} }, { keys: [] }, { keys: [{ kid: "unused", kty: "EC" }] }, { error: "unavailable" }])(
    "preserves cached keys when the JWKS response is malformed: %j",
    async (document) => {
      await expect(verifyPublished()).resolves.toMatchObject({ valid: true });
      vi.mocked(Date.now).mockReturnValue(now + 3_600_001);
      keysDocument = document;

      await expect(verifyPublished()).resolves.toMatchObject({ valid: true });
      await expect(verifyPublished("new-key")).rejects.toBeInstanceOf(verifier.BotFrameworkKeysUnavailableError);
      expect(fetcher).toHaveBeenCalledTimes(4);
    },
  );

  it("reports malformed JWKS as unavailable when no cache exists", async () => {
    keysDocument = {};
    await expect(verifyPublished()).rejects.toBeInstanceOf(verifier.BotFrameworkKeysUnavailableError);
  });

  it("rejects an unknown key after successfully fetching a valid JWKS", async () => {
    await expect(verifyPublished("unknown-key")).resolves.toEqual({ valid: false, reason: "token" });
  });
  it("rejects oversized published key documents", async () => {
    keysDocument = { padding: "x".repeat(1024 * 1024 + 1) };
    await expect(verifyPublished()).rejects.toBeInstanceOf(verifier.BotFrameworkKeysUnavailableError);
  });
});
