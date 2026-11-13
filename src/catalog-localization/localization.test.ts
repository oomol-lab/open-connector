import type { CatalogTranslation } from "./types.ts";

import { describe, expect, it } from "vitest";
import { createCatalogStore } from "../catalog-store.ts";
import { describeProviderAuth } from "../core/provider-setup.ts";
import { provider as amap } from "../providers/amap/definition.ts";
import { provider as box } from "../providers/box/definition.ts";
import { provider as deepseek } from "../providers/deepseek/definition.ts";
import { provider as dingtalk_bot } from "../providers/dingtalk_bot/definition.ts";
import { provider as dingtalk_mcp } from "../providers/dingtalk_mcp/definition.ts";
import { provider as dokploy } from "../providers/dokploy/definition.ts";
import { provider as feishu } from "../providers/feishu_app_bot/definition.ts";
import { provider as feishu_custom_bot } from "../providers/feishu_custom_bot/definition.ts";
import { provider as football } from "../providers/football_charts/definition.ts";
import { provider as gitee } from "../providers/gitee/definition.ts";
import { provider as github } from "../providers/github/definition.ts";
import { provider as gmail } from "../providers/gmail/definition.ts";
import { provider as googlecalendar } from "../providers/googlecalendar/definition.ts";
import { provider as googledrive } from "../providers/googledrive/definition.ts";
import { provider as minimax } from "../providers/minimax/definition.ts";
import { provider as qianfan } from "../providers/qianfan/definition.ts";
import { provider as qwen } from "../providers/qwen/definition.ts";
import { provider as slack } from "../providers/slack/definition.ts";
import { provider as tencent_docs } from "../providers/tencent_docs/definition.ts";
import { provider as meeting } from "../providers/tencent_meeting_mcp/definition.ts";
import { provider as wecom_bot } from "../providers/wecom_bot/definition.ts";
import { provider as wecom_mcp } from "../providers/wecom_mcp/definition.ts";
import { catalogSetupLabels, localizeProvider, resolveCatalogLocale } from "./localization.ts";
import { validateCatalogTranslations } from "./validation.ts";
import { zhCN } from "./zh-CN.ts";

it.each([
  [undefined, undefined, "en"],
  ["en", "zh-CN", "en"],
  ["fr", "zh-CN", "en"],
  ["ZH-hans-HK", undefined, "zh-CN"],
  ["zh-TW", undefined, "en"],
  ["zh-Hant-CN", undefined, "en"],
  [undefined, "fr, zh-CN;q=0.8, en;q=0.5", "zh-CN"],
  [undefined, "zh-CN;q=0.2, en;q=0.9", "en"],
  [undefined, "zh-CN;q=0, en;q=0.1", "en"],
  [undefined, "zh-CN;q=garbage, en", "en"],
  [undefined, "zh-TW, zh-Hans;q=0.5", "zh-CN"],
])("resolves locale %s and language preferences %s to %s", (query, header, expected) => {
  expect(resolveCatalogLocale(query, header)).toBe(expected);
});

function withoutDisplayText(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutDisplayText);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key, item]) => !["label", "description", "placeholder", "steps"].includes(key) && item !== undefined)
        .map(([key, item]) => [key, withoutDisplayText(item)]),
    );
  return value;
}

describe("localized provider metadata", () => {
  it.each([
    meeting,
    github,
    slack,
    gmail,
    googledrive,
    googlecalendar,
    box,
    dokploy,
    feishu,
    football,
    deepseek,
    qwen,
    qianfan,
    minimax,
    dingtalk_bot,
    dingtalk_mcp,
    wecom_bot,
    wecom_mcp,
    feishu_custom_bot,
    tencent_docs,
    gitee,
    amap,
  ])("preserves contracts and source data for $service", (provider) => {
    const before = structuredClone(provider);
    const localized = localizeProvider(provider, "zh-CN");
    expect(localized.actions).toBe(provider.actions);
    expect(localized.categories).toBe(provider.categories);
    expect(localized.authTypes).toBe(provider.authTypes);
    expect(withoutDisplayText(localized.auth)).toEqual(withoutDisplayText(provider.auth));
    expect(provider).toEqual(before);
    expect(localizeProvider(provider, "en")).toBe(provider);
  });

  it("translates credential text, extra fields, OAuth options and setup steps", () => {
    expect(localizeProvider(meeting, "zh-CN").auth[0]).toMatchObject({ label: "腾讯会议 Token" });
    expect(localizeProvider(dokploy, "zh-CN").auth[0]).toMatchObject({
      extraFields: [{ key: "baseUrl", label: "实例地址" }],
    });
    expect(localizeProvider(feishu, "zh-CN").auth[0]).toMatchObject({
      fields: [
        { key: "appId", label: "应用 ID" },
        { key: "appSecret", label: "应用密钥" },
        { key: "verificationToken", label: "事件验证令牌" },
        { key: "encryptKey", label: "事件加密密钥" },
      ],
    });
    const oauth = localizeProvider(github, "zh-CN").auth[0]!;
    expect(oauth).toMatchObject({
      authorizationOptions: expect.arrayContaining([
        {
          id: "workflow",
          ...zhCN.providers.github!.auth!.oauth2!.authorizationOptions!.workflow,
          risk: "sensitive",
        },
      ]),
    });
    expect(describeProviderAuth(oauth, catalogSetupLabels["zh-CN"])).toMatchObject({
      clientFields: [
        { key: "clientId", label: "客户端 ID" },
        { key: "clientSecret", label: "客户端密钥" },
      ],
    });
    expect(localizeProvider(box, "zh-CN").auth[0]).toMatchObject({
      clientSetup: { steps: zhCN.providers.box!.auth!.oauth2!.steps },
    });
  });

  it("falls back per field and preserves no-auth providers", () => {
    const unknown = { ...meeting, service: "untranslated", categories: ["Unknown"] };
    const localized = localizeProvider(unknown, "zh-CN");
    expect(localized.displayName).toBe(unknown.displayName);
    expect(localized.auth[0]).toMatchObject(unknown.auth[0]!);
    expect(localized.categoryDisplayNames).toEqual({ Unknown: "Unknown" });
    expect(localizeProvider(football, "zh-CN").auth[0]).toEqual({ type: "no_auth" });
  });

  it("caches schema-free language variants without changing the English catalog", () => {
    const catalog = createCatalogStore([meeting]);
    const english = catalog.getProviderDisplay("en");
    const chinese = catalog.getProviderDisplay("zh-CN");
    expect(english.providerSummariesJson).toBe(catalog.providerSummariesJson);
    expect(chinese.providerSummariesEtag).not.toBe(english.providerSummariesEtag);
    expect(catalog.getProviderDisplay("zh-CN")).toBe(chinese);
    const rows = JSON.parse(new TextDecoder().decode(chinese.providerSummariesJson));
    expect(rows[0]).toMatchObject({
      displayName: "腾讯会议 MCP",
      setup: [{ fields: [{ key: "apiKey", label: "腾讯会议 Token" }] }],
    });
    expect(rows[0].actions[0]).not.toHaveProperty("inputSchema");
  });
});

it("rejects translations referencing deleted providers, fields, options or setup steps", () => {
  const translation: CatalogTranslation = { labels: zhCN.labels, categories: {}, providers: {} };
  expect(() => validateCatalogTranslations([meeting], { ...translation, providers: { missing: {} } })).toThrow(
    "Unknown translated provider",
  );
  expect(() =>
    validateCatalogTranslations([meeting], {
      ...translation,
      providers: { tencent_meeting_mcp: { auth: { api_key: { fields: { missing: { label: "Missing" } } } } } },
    }),
  ).toThrow("Unknown translated credential field");
  expect(() =>
    validateCatalogTranslations([github], {
      ...translation,
      providers: { github: { auth: { oauth2: { authorizationOptions: { missing: { label: "Missing" } } } } } },
    }),
  ).toThrow("Unknown translated authorization option");
  expect(() =>
    validateCatalogTranslations([box], { ...translation, providers: { box: { auth: { oauth2: { steps: [] } } } } }),
  ).toThrow("Translated setup steps do not match");
});
