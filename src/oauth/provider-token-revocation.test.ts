import type { OAuthTokenRevokeInput, ProviderOAuthRuntime } from "../oauth/oauth-token.ts";

import { describe, expect, it, vi } from "vitest";
import { revokeAccessToken as boxRevoke } from "../providers/box/revocation.ts";
import { oauth as calendlyOAuth } from "../providers/calendly/executors.ts";
import { oauth as canvaOAuth } from "../providers/canva/executors.ts";
import { oauth as discordOAuth } from "../providers/discord/executors.ts";
import { revokeAccessToken as dropboxRevoke } from "../providers/dropbox/revocation.ts";
import { revokeAccessToken as googleRevoke } from "../providers/gmail/shared/revocation.ts";
import { revokeAccessToken as intercomRevoke } from "../providers/intercom/revocation.ts";
import { revokeAccessToken as linearRevoke } from "../providers/linear/revocation.ts";
import { oauth as quickbooksOAuth } from "../providers/quickbooks/oauth.ts";
import { oauth as salesforceOAuth } from "../providers/salesforce/oauth.ts";
import { revokeAccessToken as slackRevoke } from "../providers/slack/revocation.ts";
import { revokeAccessToken as twitterRevoke } from "../providers/twitter/revocation.ts";
import { oauth as xeroOAuth } from "../providers/xero/executors.ts";
import { oauth as zendeskOAuth } from "../providers/zendesk/executors.ts";
import { revokeAccessToken as zoomRevoke } from "../providers/zoom/revocation.ts";

const accessToken = "access+token/with=characters";
const refreshToken = "refresh+token/with=characters";
const clientConfig = {
  service: "test",
  secretExtra: {},
  clientId: "test-client",
  clientSecret: "test-secret",
  redirectUri: "https://connector.example/oauth/callback",
  extra: { loginUrl: "https://test.salesforce.com" },
};

type RevocationCase = {
  label: string;
  revoke: (input: OAuthTokenRevokeInput) => Promise<void>;
  url: string;
  method?: "POST" | "DELETE";
  headers?: Record<string, string>;
  form?: Record<string, string>;
  json?: Record<string, string>;
  fallbackJson?: Record<string, string>;
  fallbackForm?: Record<string, string>;
  success: () => Response;
  expired?: () => Response;
  authenticationFailure?: () => Response;
};

const formHeaders = { "content-type": "application/x-www-form-urlencoded" };
const basicHeaders = {
  ...formHeaders,
  authorization: "Basic dGVzdC1jbGllbnQ6dGVzdC1zZWNyZXQ=",
};

const emptySuccess = () => new Response("unused");
const clientFields = { client_id: clientConfig.clientId, client_secret: clientConfig.clientSecret };
const intercomInvalidToken = () =>
  Response.json(
    { type: "error.list", errors: [{ code: "unauthorized", message: "Access Token Invalid" }] },
    { status: 401 },
  );

const cases: RevocationCase[] = [
  {
    label: "Box",
    revoke: boxRevoke,
    url: "https://api.box.com/oauth2/revoke",
    form: { token: refreshToken, ...clientFields },
    fallbackForm: { token: accessToken, ...clientFields },
    success: emptySuccess,
    expired: () =>
      Response.json({ error: "invalid_token", error_description: "The supplied token is invalid" }, { status: 400 }),
    authenticationFailure: () => Response.json({ error: "invalid_client" }, { status: 400 }),
  },
  {
    label: "Calendly",
    revoke: requireRevoke(calendlyOAuth),
    url: "https://auth.calendly.com/oauth/revoke",
    form: { token: refreshToken, ...clientFields },
    fallbackForm: { token: accessToken, ...clientFields },
    success: emptySuccess,
    authenticationFailure: () => Response.json({ error: "unauthorized_client" }, { status: 403 }),
  },
  {
    label: "Canva",
    revoke: requireRevoke(canvaOAuth),
    url: "https://api.canva.com/rest/v1/oauth/revoke",
    headers: basicHeaders,
    form: { token: refreshToken },
    fallbackForm: { token: accessToken },
    success: () => Response.json({}),
    authenticationFailure: () =>
      Response.json({ code: "invalid_access_token", message: "Client secret is invalid" }, { status: 401 }),
  },
  {
    label: "QuickBooks",
    revoke: requireRevoke(quickbooksOAuth),
    url: "https://developer.api.intuit.com/v2/oauth2/tokens/revoke",
    headers: {
      "accept": "application/json",
      "content-type": "application/json",
      "authorization": basicHeaders.authorization,
    },
    json: { token: refreshToken },
    fallbackJson: { token: accessToken },
    success: emptySuccess,
    authenticationFailure: () => Response.json({ error: "invalid_client" }, { status: 400 }),
  },
  {
    label: "Xero",
    revoke: requireRevoke(xeroOAuth),
    url: "https://identity.xero.com/connect/revocation",
    headers: basicHeaders,
    form: { token: refreshToken },
    success: emptySuccess,
    authenticationFailure: () => Response.json({ error: "invalid_client" }, { status: 401 }),
  },
  {
    label: "Zendesk",
    revoke: requireRevoke(zendeskOAuth),
    url: "https://issued.zendesk.com/api/v2/oauth/tokens/current",
    method: "DELETE",
    headers: { authorization: `Bearer ${accessToken}` },
    success: () => new Response(null, { status: 204 }),
    authenticationFailure: () => Response.json({ error: "Couldn't authenticate you" }, { status: 401 }),
  },
  {
    label: "Intercom",
    revoke: intercomRevoke,
    url: "https://api.intercom.io/auth/uninstall",
    headers: {
      "accept": "application/json",
      "authorization": `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    success: emptySuccess,
    expired: intercomInvalidToken,
    authenticationFailure: () =>
      Response.json(
        { type: "error.list", errors: [{ code: "unauthorized", message: "Access Denied" }] },
        { status: 401 },
      ),
  },

  {
    label: "Slack",
    revoke: slackRevoke,
    url: "https://slack.com/api/auth.revoke",
    form: { token: accessToken },
    success: () => Response.json({ ok: true, revoked: true }),
    expired: () => Response.json({ ok: false, error: "token_revoked" }),
  },
  {
    label: "X",
    revoke: twitterRevoke,
    url: "https://api.x.com/2/oauth2/revoke",
    headers: basicHeaders,
    form: { token: refreshToken },
    fallbackForm: { token: accessToken },
    success: emptySuccess,
    expired: () => Response.json({ error: "invalid_token" }, { status: 400 }),
  },
  {
    label: "Dropbox",
    revoke: dropboxRevoke,
    url: "https://api.dropboxapi.com/2/auth/token/revoke",
    headers: { authorization: `Bearer ${accessToken}` },
    success: emptySuccess,
    expired: () => Response.json({ error: { ".tag": "invalid_access_token" } }, { status: 401 }),
  },
  {
    label: "Linear",
    revoke: linearRevoke,
    url: "https://api.linear.app/oauth/revoke",
    form: { token: refreshToken, token_type_hint: "refresh_token" },
    fallbackForm: { token: accessToken, token_type_hint: "access_token" },
    success: emptySuccess,
    expired: () => Response.json({ error: "Token not found" }, { status: 401 }),
  },

  {
    label: "Zoom",
    revoke: zoomRevoke,
    url: "https://zoom.us/oauth/revoke",
    headers: basicHeaders,
    form: { token: accessToken },
    success: () => Response.json({ status: "success" }),
    expired: () => Response.json({ code: 4741 }, { status: 400 }),
  },
  {
    label: "Discord",
    revoke: requireRevoke(discordOAuth),
    url: "https://discord.com/api/v10/oauth2/token/revoke",
    headers: basicHeaders,
    form: { token: refreshToken, token_type_hint: "refresh_token" },
    fallbackForm: { token: accessToken, token_type_hint: "access_token" },
    success: emptySuccess,
    expired: () => new Response(),
  },
  {
    label: "Salesforce",
    revoke: requireRevoke(salesforceOAuth),
    url: "https://test.salesforce.com/services/oauth2/revoke",
    form: { token: refreshToken },
    fallbackForm: { token: accessToken },
    success: emptySuccess,
    expired: () => Response.json({ error: "invalid_token" }, { status: 400 }),
  },
];

const credential = {
  accessToken,
  refreshToken,
  clientConfig,
  providerMetadata: { subdomain: "issued" },
};

for (const item of cases) {
  describe(item.label, () => {
    it("sends the endpoint-specific revocation protocol and consumes the response", async () => {
      const response = item.success();
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);
      await item.revoke({ ...credential, fetcher, createError: (message) => new Error(message) });
      expect(fetcher).toHaveBeenCalledTimes(1);
      const [url, init] = fetcher.mock.calls[0]!;
      expect(String(url)).toBe(item.url);
      expect(init?.method).toBe(item.method ?? "POST");
      expect(init?.redirect).toBe("manual");
      const headers = new Headers(init?.headers);
      for (const [key, value] of Object.entries(item.headers ?? formHeaders)) expect(headers.get(key)).toBe(value);
      if (item.form) expect(Object.fromEntries(new URLSearchParams(String(init?.body)))).toEqual(item.form);
      if (item.json) expect(JSON.parse(String(init?.body))).toEqual(item.json);
      if (response.body) expect(response.bodyUsed).toBe(true);
    });
    if (item.fallbackForm || item.fallbackJson)
      it("revokes the access token when no refresh token was issued", async () => {
        const fetcher = vi.fn<typeof fetch>().mockResolvedValue(item.success());
        await item.revoke({
          ...credential,
          refreshToken: undefined,
          fetcher,
          createError: (message) => new Error(message),
        });
        expect(fetcher).toHaveBeenCalledTimes(1);
        const body = fetcher.mock.calls[0]?.[1]?.body;
        if (item.fallbackForm) expect(Object.fromEntries(new URLSearchParams(String(body)))).toEqual(item.fallbackForm);
        if (item.fallbackJson) expect(JSON.parse(String(body))).toEqual(item.fallbackJson);
      });
    if (item.expired)
      it("accepts documented already-revoked responses", async () => {
        await expect(
          item.revoke({
            ...credential,
            fetcher: vi.fn<typeof fetch>().mockResolvedValue(item.expired!()),
            createError: (message) => new Error(message),
          }),
        ).resolves.toBeUndefined();
      });
    it("does not expose credentials in transport errors", async () => {
      await expect(
        item.revoke({
          ...credential,
          fetcher: vi.fn<typeof fetch>().mockRejectedValue(new Error("secret-access secret-refresh secret-client")),
          createError: (message) => new Error(message),
        }),
      ).rejects.toThrow(/request failed$/);
    });
    if (item.authenticationFailure)
      it("rejects client authentication failures", async () => {
        await expect(
          item.revoke({
            ...credential,
            fetcher: vi.fn<typeof fetch>().mockResolvedValue(item.authenticationFailure!()),
            createError: (message) => new Error(message),
          }),
        ).rejects.toThrow(/failed/);
      });
  });
}

it("revokes Google refresh tokens without client authentication and accepts invalid_token only", async () => {
  for (const status of [200, 400]) {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () =>
        status === 200 ? new Response() : Response.json({ error: "invalid_token" }, { status }),
      );
    await googleRevoke({
      accessToken,
      refreshToken,
      clientConfig,
      fetcher,
      createError: (message) => new Error(message),
    });
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe("https://oauth2.googleapis.com/revoke");
    expect(Object.fromEntries(new URLSearchParams(String(init?.body)))).toEqual({ token: refreshToken });
    expect(new Headers(init?.headers).has("authorization")).toBe(false);
  }
});

it("uses the issuing Zendesk tenant instead of the current client configuration", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
  await requireRevoke(zendeskOAuth)({
    accessToken,
    clientConfig,
    providerMetadata: { subdomain: "issued" },
    fetcher,
    createError: (message) => new Error(message),
  });
  expect(String(fetcher.mock.calls[0]?.[0])).toBe("https://issued.zendesk.com/api/v2/oauth/tokens/current");
});

it("keeps expired Slack access tokens as failures while a refresh token can still work", async () => {
  await expect(
    slackRevoke({
      ...credential,
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(Response.json({ ok: false, error: "token_expired" })),
      createError: (message) => new Error(message),
    }),
  ).rejects.toThrow(/failed/);
});

it("does not report Xero access-only credentials as revoked", async () => {
  const fetcher = vi.fn<typeof fetch>();
  await expect(
    requireRevoke(xeroOAuth)({ accessToken, clientConfig, fetcher, createError: (message) => new Error(message) }),
  ).rejects.toThrow("requires a refresh token");
  expect(fetcher).not.toHaveBeenCalled();
});

function requireRevoke(runtime: ProviderOAuthRuntime): (input: OAuthTokenRevokeInput) => Promise<void> {
  const revoke = runtime.revokeAccessToken;
  if (!revoke) throw new Error("Expected a provider-specific revocation protocol");
  return (input) => revoke.call(runtime, input);
}

it.each([200, 400, 503])("tries the Google access token after an invalid refresh token (HTTP %i)", async (status) => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ error: "invalid_token" }, { status: 400 }))
    .mockResolvedValueOnce(status === 200 ? new Response() : Response.json({ error: "invalid_token" }, { status }));
  const result = googleRevoke({ ...credential, fetcher, createError: (message) => new Error(message) });
  if (status === 503) await expect(result).rejects.toThrow(/failed/);
  else await expect(result).resolves.toBeUndefined();
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(new URLSearchParams(String(fetcher.mock.calls[1]?.[1]?.body)).get("token")).toBe(accessToken);
});
