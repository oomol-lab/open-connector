import { I18nProvider } from "@embra/i18n/react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi, afterEach } from "vitest";
import { ApiError, apiPut } from "./api";
import { createAppI18n } from "./i18n";
import { SaasFeedback } from "./saas-feedback";

afterEach(() => vi.unstubAllGlobals());

it.each([
  ["encryption_required", "OOMOL_CONNECT_ENCRYPTION_KEY"],
  ["origin_required", "OOMOL_CONNECT_ORIGIN"],
  ["invalid_url", "Fake-IP"],
  ["dns", "无法解析云端域名"],
  ["timeout", "连接云端超时"],
])("localizes %s with a prominent error alert", (reason, expected) => {
  const html = renderToStaticMarkup(
    createElement(
      I18nProvider,
      { i18n: createAppI18n("zh-CN") },
      createElement(SaasFeedback, {
        error: new ApiError(502, "Raw server diagnostic", undefined, "oauth_source_unavailable", reason),
      }),
    ),
  );
  expect(html).toContain(expected);
  expect(html).toContain("操作未完成");
  expect(html).toContain('role="alert"');
  expect(html).toContain("border-destructive/40");
  expect(html).not.toContain("Raw server diagnostic");
});

it("preserves structured API error information for localized feedback", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json(
        {
          error: {
            code: "oauth_source_configuration_error",
            reason: "encryption_required",
            message: "Configure encryption",
          },
        },
        { status: 400 },
      ),
    ),
  );
  await expect(apiPut("/api/oauth/managed-project", {})).rejects.toMatchObject({
    code: "oauth_source_configuration_error",
    reason: "encryption_required",
    status: 400,
  });
});

it("presents success independently of error styling", () => {
  const html = renderToStaticMarkup(
    createElement(I18nProvider, { i18n: createAppI18n("zh-CN") }, createElement(SaasFeedback, { message: "已保存。" })),
  );
  expect(html).toContain('role="status"');
  expect(html).toContain("已保存。");
  expect(html).not.toContain("操作未完成");
});
