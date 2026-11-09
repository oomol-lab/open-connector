import type { ActionDefinition } from "../../core/types.ts";
import type { AisaActionRoute } from "./routes.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { dataForSeoOnPageInputFields as page } from "./dataforseo-onpage-actions.ts";

export const dataForSeoInstantActions: ActionDefinition[] = [
  defineProviderAction("aisa", {
    name: "audit_dataforseo_page",
    operationType: "read",
    description:
      "Audit one webpage with DataForSEO and return its SEO checks, page metrics, and optional rendering results. Avoid concurrent requests for the same host. Stored HTML and markup reports can be read using the returned task ID.",
    requiredScopes: [],
    inputSchema: s.object(
      "A single webpage and optional audit settings.",
      {
        url: s.string("Absolute webpage URL to audit; downloaded by DataForSEO.", { format: "uri" }),
        acceptLanguage: s.optional(page.acceptLanguage),
        browserPreset: s.optional(page.browserPreset),
        browserScreenHeight: s.optional(page.browserScreenHeight),
        browserScreenWidth: s.optional(page.browserScreenWidth),
        browserScreenScaleFactor: s.optional(page.browserScreenScaleFactor),
        checkSpell: s.optional(page.checkSpell),
        checksThreshold: s.optional(page.checksThreshold),
        customJs: s.optional(page.customJs),
        customUserAgent: s.optional(page.customUserAgent),
        disableCookiePopup: s.optional(page.disableCookiePopup),
        enableBrowserRendering: s.optional(
          s.boolean(
            "Render the page to measure Core Web Vitals. Automatically enables JavaScript and resource loading; incurs additional charges.",
          ),
        ),
        enableJavascript: s.optional(page.enableJavascript),
        enableXhr: s.optional(page.enableXhr),
        ipPoolForScan: s.optional(s.stringEnum("Proxy pool location used to access the page.", ["us", "de"])),
        loadResources: s.optional(page.loadResources),
        returnDespiteTimeout: s.optional(page.returnDespiteTimeout),
        storeRawHtml: s.optional(page.storeRawHtml),
        switchPool: s.optional(page.switchPool),
        validateMicromarkup: s.optional(page.validateMicromarkup),
      },
      { optional: [] },
    ),
    outputSchema: s.object(
      "The page audit and its handle for optional stored reports.",
      {
        taskId: s.string("Task ID to use with get_dataforseo_onpage_report on the same connection."),
        status: s.stringEnum("Normalized audit status; inspect raw for upstream error details.", [
          "running",
          "completed",
          "failed",
        ]),
        output: s.unknown("The complete upstream page audit result, preserving additional fields."),
        raw: s.looseObject("The complete DataForSEO response with status codes and reported cost."),
      },
      { optional: [] },
    ),
  }),
  defineProviderAction("aisa", {
    name: "summarize_dataforseo_serp",
    operationType: "read",
    description:
      "Summarize a completed DataForSEO organic search result, optionally reading its linked pages. Use a task from the last 30 days.",
    requiredScopes: [],
    inputSchema: s.object(
      "A completed organic search task and summary preferences.",
      {
        taskId: s.string("The completed SERP task ID from the same connection.", { minLength: 1 }),
        prompt: s.optional(
          s.string("Additional summary instructions relevant to the original search keyword.", {
            maxLength: 2000,
          }),
        ),
        supportExtra: s.optional(
          s.boolean("Include answer boxes, knowledge graphs, and featured snippets; defaults to true upstream."),
        ),
        fetchContent: s.optional(
          s.boolean("Read pages from the organic results when producing the summary; defaults to false upstream."),
        ),
        includeLinks: s.optional(
          s.boolean("Include source links in the generated summary; defaults to false upstream."),
        ),
      },
      { optional: [] },
    ),
    outputSchema: s.looseObject(
      "The complete DataForSEO summary response; inspect per-task status codes for errors.",
      {
        tasks: s.array(
          "Summary tasks with status, cost, and results.",
          s.looseObject("One summary task; result items contain the generated summary."),
        ),
      },
      { required: [] },
    ),
  }),
  defineProviderAction("aisa", {
    name: "screenshot_dataforseo_serp",
    operationType: "read",
    description:
      "Capture a completed DataForSEO search result page that supports HTML. The task must be at most seven days old; returned image URLs expire after one day.",
    requiredScopes: [],
    inputSchema: s.object(
      "A completed search task and screenshot viewport settings.",
      {
        taskId: s.string("The completed HTML-capable SERP task ID from the same connection.", { minLength: 1 }),
        browserPreset: s.optional(
          s.stringEnum("Viewport preset; defaults to the device used by the original task.", [
            "desktop",
            "tablet",
            "mobile",
          ]),
        ),
        browserScreenHeight: s.optional(
          s.integer("Browser viewport height in pixels.", { minimum: 240, maximum: 9999 }),
        ),
        browserScreenWidth: s.optional(s.integer("Browser viewport width in pixels.", { minimum: 240, maximum: 9999 })),
        browserScreenScaleFactor: s.optional(s.number("Browser device pixel ratio.", { minimum: 0.5, maximum: 3 })),
        page: s.optional(
          s.integer("Number of search result pages to screenshot; defaults to one upstream.", {
            minimum: 1,
          }),
        ),
      },
      { optional: [] },
    ),
    outputSchema: s.looseObject(
      "The complete DataForSEO screenshot response; inspect per-task status codes for errors.",
      {
        tasks: s.array(
          "Screenshot tasks with status, cost, and results.",
          s.looseObject("One screenshot task containing image URLs and any upstream errors."),
        ),
      },
      { required: [] },
    ),
  }),
];

export const dataForSeoInstantRoutes: Record<string, AisaActionRoute> = {
  audit_dataforseo_page: {
    method: "POST",
    path: "/apis/v1/dataforseo/on_page/instant_pages",
    query: {},
    body: {
      url: "url",
      acceptLanguage: "accept_language",
      browserPreset: "browser_preset",
      browserScreenHeight: "browser_screen_height",
      browserScreenWidth: "browser_screen_width",
      browserScreenScaleFactor: "browser_screen_scale_factor",
      checkSpell: "check_spell",
      checksThreshold: "checks_threshold",
      customJs: "custom_js",
      customUserAgent: "custom_user_agent",
      disableCookiePopup: "disable_cookie_popup",
      enableBrowserRendering: "enable_browser_rendering",
      enableJavascript: "enable_javascript",
      enableXhr: "enable_xhr",
      ipPoolForScan: "ip_pool_for_scan",
      loadResources: "load_resources",
      returnDespiteTimeout: "return_despite_timeout",
      storeRawHtml: "store_raw_html",
      switchPool: "switch_pool",
      validateMicromarkup: "validate_micromarkup",
    },
    bodyArray: true,
    dataForSeoTask: "submit",
    timeoutMs: 180000,
  },
  summarize_dataforseo_serp: {
    method: "POST",
    path: "/apis/v1/dataforseo/serp/ai_summary",
    query: {},
    body: {
      taskId: "task_id",
      prompt: "prompt",
      supportExtra: "support_extra",
      fetchContent: "fetch_content",
      includeLinks: "include_links",
    },
    bodyArray: true,
    timeoutMs: 180000,
  },
  screenshot_dataforseo_serp: {
    method: "POST",
    path: "/apis/v1/dataforseo/serp/screenshot",
    query: {},
    body: {
      taskId: "task_id",
      browserPreset: "browser_preset",
      browserScreenHeight: "browser_screen_height",
      browserScreenWidth: "browser_screen_width",
      browserScreenScaleFactor: "browser_screen_scale_factor",
      page: "page",
    },
    bodyArray: true,
    timeoutMs: 180000,
  },
};
