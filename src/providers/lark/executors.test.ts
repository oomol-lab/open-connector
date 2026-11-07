import type { ExecutionContext, ResolvedCredential } from "../../core/types.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  credentialValidators as feishuValidators,
  executors as feishuExecutors,
  oauth as feishuOAuth,
  proxy as feishuProxy,
} from "../feishu/executors.ts";
import { requestFeishuMultipart, withFeishuRawResponse } from "../feishu/shared/client.ts";
import { feishuCloud, larkCloud } from "../feishu/shared/cloud.ts";
import {
  credentialValidators as larkValidators,
  executors as larkExecutors,
  oauth as larkOAuth,
  proxy as larkProxy,
} from "./executors.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

const envelope = (data: Record<string, unknown>) => Response.json({ code: 0, msg: "ok", data });

function oauthCredential(): Extract<ResolvedCredential, { authType: "oauth2" }> {
  return {
    authType: "oauth2",
    accessToken: "u-token",
    tokenType: "Bearer",
    profile: { accountId: "ou_1", displayName: "User", grantedScopes: [] },
    metadata: {},
  };
}

/** Run one action and return every URL it fetched. */
async function fetchedUrls(
  executors: typeof larkExecutors,
  actionId: `${string}.${string}`,
  input: Record<string, unknown>,
): Promise<string[]> {
  const urls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: RequestInfo | URL) => {
      urls.push(url.toString());
      return envelope({ open_id: "ou_1", name: "User", items: [], files: [], has_more: false });
    }),
  );
  const context: ExecutionContext = {
    getCredential: async (service) => {
      expect(service).toBe(actionId.split(".")[0]);
      return oauthCredential();
    },
  };
  const result = await executors[actionId]!(input, context);
  expect(result).toMatchObject({ ok: true });
  vi.unstubAllGlobals();
  return urls;
}

const cases: Array<[string, Record<string, unknown>, string]> = [
  // Native handler (feishu/runtime.ts).
  ["get_current_user", {}, "/open-apis/authen/v1/user_info"],
  // Shared handlers (feishu/shared/*, via createFeishuJsonRequest).
  ["list_drive_files", {}, "/open-apis/drive/v1/files"],
  ["list_chats", {}, "/open-apis/im/v1/chats"],
];

describe("Lark actions reuse Feishu handlers against Lark's API host", () => {
  for (const [name, input, path] of cases) {
    it(`lark.${name} goes to open.larksuite.com, feishu.${name} to open.feishu.cn`, async () => {
      const lark = await fetchedUrls(larkExecutors, `lark.${name}`, input);
      expect(lark.length).toBeGreaterThan(0);
      expect(lark.every((url) => url.startsWith(`https://open.larksuite.com${path}`))).toBe(true);

      const feishu = await fetchedUrls(feishuExecutors, `feishu.${name}`, input);
      expect(feishu.length).toBeGreaterThan(0);
      expect(feishu.every((url) => url.startsWith(`https://open.feishu.cn${path}`))).toBe(true);
    });
  }

  it("validates a Lark credential against Lark's user_info, a Feishu one against Feishu's", async () => {
    for (const [validators, host] of [
      [larkValidators, "open.larksuite.com"],
      [feishuValidators, "open.feishu.cn"],
    ] as const) {
      const urls: string[] = [];
      const result = await validators.oauth2!(oauthCredential(), {
        fetcher: async (url) => {
          urls.push(url.toString());
          return envelope({ open_id: "ou_1", name: "User", tenant_key: "t1" });
        },
      });
      expect(urls).toEqual([`https://${host}/open-apis/authen/v1/user_info`]);
      expect(result).toMatchObject({ profile: { accountId: "ou_1", displayName: "User" } });
    }
  });

  it("sends multipart uploads and raw downloads to the configured deployment", async () => {
    for (const cloud of [larkCloud, feishuCloud]) {
      const urls: string[] = [];
      const fetcher = (async (url: RequestInfo | URL) => {
        urls.push(url.toString());
        return envelope({ file_key: "k" });
      }) as typeof fetch;
      await requestFeishuMultipart({
        openBaseUrl: cloud.openBaseUrl,
        accessToken: "t",
        fetcher,
        path: "/im/v1/files",
        body: new FormData(),
      });
      await withFeishuRawResponse(
        { openBaseUrl: cloud.openBaseUrl, accessToken: "t", fetcher, path: "/drive/v1/files/x/download" },
        async () => undefined,
      );
      expect(urls).toEqual([`${cloud.openBaseUrl}/im/v1/files`, `${cloud.openBaseUrl}/drive/v1/files/x/download`]);
    }
  });

  it("refreshes each connection only against its own deployment", async () => {
    for (const [service, oauth, host] of [
      ["lark", larkOAuth, "open.larksuite.com"],
      ["feishu", feishuOAuth, "open.feishu.cn"],
    ] as const) {
      const fetcher = vi.fn(async () => Response.json({ code: 0, access_token: "rotated" }));
      const result = await oauth.refreshAccessToken!({
        refreshToken: "refresh-fixture",
        clientConfig: { service, clientId: "app-fixture", clientSecret: "secret-fixture", extra: {}, secretExtra: {} },
        metadata: {},
        fetcher,
        createError: (message) => new Error(message),
      });
      expect(result.accessToken).toBe("rotated");
      expect(fetcher).toHaveBeenCalledExactlyOnceWith(
        `https://${host}/open-apis/authen/v2/oauth/token`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            grant_type: "refresh_token",
            client_id: "app-fixture",
            client_secret: "secret-fixture",
            refresh_token: "refresh-fixture",
          }),
        }),
      );
    }
  });

  it("keeps proxy requests and credential lookup on the same deployment", async () => {
    for (const [service, proxy, host] of [
      ["lark", larkProxy, "open.larksuite.com"],
      ["feishu", feishuProxy, "open.feishu.cn"],
    ] as const) {
      const fetcher = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        expect(url.toString()).toBe(`https://${host}/open-apis/authen/v1/user_info`);
        expect(new Headers(init?.headers).get("authorization")).toBe("Bearer u-token");
        return envelope({ open_id: "ou_1" });
      });
      vi.stubGlobal("fetch", fetcher);
      const getCredential = vi.fn(async () => oauthCredential());
      await expect(
        proxy({ method: "GET", endpoint: "/authen/v1/user_info" }, { getCredential }),
      ).resolves.toMatchObject({ ok: true });
      expect(getCredential).toHaveBeenCalledWith(service);
      expect(fetcher).toHaveBeenCalledOnce();
    }
  });
});
