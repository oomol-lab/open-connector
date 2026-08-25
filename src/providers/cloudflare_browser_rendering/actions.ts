import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "cloudflare_browser_rendering";

const waitUntilEventSchema = s.stringEnum("One Puppeteer page load event to wait for.", [
  "load",
  "domcontentloaded",
  "networkidle0",
  "networkidle2",
]);

const gotoOptionsSchema = s.object(
  "Puppeteer navigation options forwarded to Cloudflare Browser Run.",
  {
    referer: s.nonEmptyString("The Referer header value used for navigation."),
    referrerPolicy: s.nonEmptyString("The referrer policy used for navigation."),
    timeout: s.nonNegativeInteger("The navigation timeout in milliseconds."),
    waitUntil: s.anyOf("The page load event or events Cloudflare should wait for.", [
      waitUntilEventSchema,
      s.array("The page load events Cloudflare should wait for.", waitUntilEventSchema, { minItems: 1 }),
    ]),
  },
  { optional: ["referer", "referrerPolicy", "timeout", "waitUntil"] },
);

const viewportSchema = s.object(
  "Browser viewport options forwarded to Cloudflare Browser Run.",
  {
    width: s.positiveInteger("The viewport width in pixels."),
    height: s.positiveInteger("The viewport height in pixels."),
    deviceScaleFactor: s.number("The device scale factor."),
    hasTouch: s.boolean("Whether the viewport supports touch events."),
    isLandscape: s.boolean("Whether the viewport should emulate landscape orientation."),
    isMobile: s.boolean("Whether the viewport should emulate a mobile device."),
  },
  { required: ["width", "height"] },
);

const waitForSelectorSchema = s.object(
  "Selector wait options forwarded to Cloudflare Browser Run.",
  {
    selector: s.nonEmptyString("The selector Cloudflare should wait for."),
    hidden: s.boolean("Whether Cloudflare should wait for the selector to be hidden."),
    timeout: s.nonNegativeInteger("The selector wait timeout in milliseconds."),
    visible: s.boolean("Whether Cloudflare should wait for the selector to be visible."),
  },
  { required: ["selector"] },
);

const commonQuickActionFields: Record<string, JsonSchema> = {
  accountId: s.nonEmptyString(
    "The Cloudflare account ID. OAuth connections that can access multiple accounts must provide this value.",
  ),
  url: s.string({
    format: "uri",
    minLength: 1,
    description: "The URL Cloudflare Browser Run should navigate to.",
  }),
  html: s.string("Raw HTML content Cloudflare Browser Run should render.", { minLength: 1 }),
  cacheTtl: s.nonNegativeInteger("The Cloudflare Browser Run cache TTL in seconds. Set to 0 to disable caching."),
  actionTimeout: s.nonNegativeInteger(
    "The maximum duration in milliseconds allowed for the browser action after page load.",
  ),
  bestAttempt: s.boolean("Whether Cloudflare should proceed when awaited events fail or timeout."),
  gotoOptions: gotoOptionsSchema,
  setJavaScriptEnabled: s.boolean("Whether JavaScript should be enabled on the page."),
  userAgent: s.nonEmptyString("The user agent string used by the browser page."),
  viewport: viewportSchema,
  waitForSelector: waitForSelectorSchema,
  waitForTimeout: s.nonNegativeInteger("The fixed wait time in milliseconds before extraction."),
};

const commonQuickActionOptionalFields = [
  "accountId",
  "url",
  "html",
  "cacheTtl",
  "actionTimeout",
  "bestAttempt",
  "gotoOptions",
  "setJavaScriptEnabled",
  "userAgent",
  "viewport",
  "waitForSelector",
  "waitForTimeout",
];

const paginationInputSchema = s.object(
  "Input parameters for listing Cloudflare accounts.",
  {
    page: s.positiveInteger("The result page number."),
    perPage: s.positiveInteger("The page size."),
  },
  { optional: ["page", "perPage"] },
);

const cloudflareResultInfoSchema = s.object(
  "Cloudflare pagination metadata.",
  {
    page: s.integer("The current page number."),
    perPage: s.integer("The page size."),
    count: s.integer("The number of items in the current page."),
    totalCount: s.integer("The total number of matching items."),
    totalPages: s.integer("The total number of pages."),
  },
  { optional: ["page", "perPage", "count", "totalCount", "totalPages"] },
);

const cloudflareAccountSchema = s.object(
  "A Cloudflare account summary.",
  {
    id: s.string("The Cloudflare account ID."),
    name: s.string("The Cloudflare account name."),
    type: s.string("The Cloudflare account type."),
  },
  { required: ["id", "name"] },
);

const cloudflareMetaSchema = s.looseObject("Cloudflare Browser Run response metadata.", {
  status: s.integer("The HTTP status reported by the rendered page."),
  title: s.string("The title reported by the rendered page."),
});

const responseFormatSchema = s.object(
  "Structured JSON response format options forwarded to Cloudflare Browser Run.",
  {
    type: s.nonEmptyString("The response format type accepted by Cloudflare Browser Run."),
    jsonSchema: s.looseObject("The JSON schema Cloudflare should use for the structured result."),
  },
  { required: ["type"] },
);

const scrapeElementInputSchema = s.object(
  "One element selector to scrape.",
  {
    selector: s.nonEmptyString("The CSS selector Cloudflare Browser Run should scrape."),
  },
  { required: ["selector"] },
);

const scrapeResultSchema = s.requiredObject("One Cloudflare Browser Run scrape selector result.", {
  selector: s.string("The CSS selector used for this result."),
  results: s.unknown("The element result or result array returned by Cloudflare for this selector."),
});

export const cloudflareBrowserRenderingActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_accounts",
    description:
      "List Cloudflare accounts accessible to the current connection so callers can confirm account IDs used by Browser Run actions.",
    inputSchema: paginationInputSchema,
    outputSchema: s.actionOutput(
      {
        accounts: s.array("Cloudflare accounts visible to the current connection.", cloudflareAccountSchema),
        resultInfo: cloudflareResultInfoSchema,
      },
      "The Cloudflare accounts visible to the current connection.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_html_content",
    description: "Render a URL or raw HTML with Cloudflare Browser Run and return the fully rendered HTML content.",
    inputSchema: quickActionInputSchema("Input parameters for the Browser Run content endpoint."),
    outputSchema: s.object(
      "The rendered HTML content returned by Cloudflare Browser Run.",
      {
        content: s.string("The rendered HTML content."),
        meta: cloudflareMetaSchema,
      },
      { required: ["content"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_markdown",
    description: "Render a URL or raw HTML with Cloudflare Browser Run and return the page content as Markdown.",
    inputSchema: quickActionInputSchema("Input parameters for the Browser Run markdown endpoint."),
    outputSchema: s.actionOutput(
      {
        markdown: s.string("The extracted Markdown content."),
      },
      "The Markdown content returned by Cloudflare Browser Run.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_links",
    description: "Render a URL or raw HTML with Cloudflare Browser Run and return links discovered on the page.",
    inputSchema: quickActionInputSchema(
      "Input parameters for the Browser Run links endpoint.",
      {
        excludeExternalLinks: s.boolean("Whether Cloudflare should exclude external links."),
        visibleLinksOnly: s.boolean("Whether Cloudflare should return only visible links."),
      },
      ["excludeExternalLinks", "visibleLinksOnly"],
    ),
    outputSchema: s.actionOutput(
      {
        links: s.array("The extracted links.", s.string("One extracted link.")),
      },
      "The links returned by Cloudflare Browser Run.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_json",
    description: "Render a URL or raw HTML with Cloudflare Browser Run and extract structured JSON from the page.",
    inputSchema: jsonQuickActionInputSchema(),
    outputSchema: s.actionOutput(
      {
        data: s.unknown("The structured JSON result returned by Cloudflare Browser Run."),
      },
      "The structured JSON data returned by Cloudflare Browser Run.",
    ),
  }),
  defineProviderAction(service, {
    name: "scrape_elements",
    description: "Render a URL or raw HTML with Cloudflare Browser Run and scrape selected HTML elements.",
    inputSchema: quickActionInputSchema(
      "Input parameters for the Browser Run scrape endpoint.",
      {
        elements: s.array("The CSS selectors to scrape after rendering.", scrapeElementInputSchema, { minItems: 1 }),
      },
      [],
    ),
    outputSchema: s.actionOutput(
      {
        elements: s.array("The scrape results by selector.", scrapeResultSchema),
      },
      "The scrape results returned by Cloudflare Browser Run.",
    ),
  }),
];

function quickActionInputSchema(
  description: string,
  properties: Record<string, JsonSchema> = {},
  optional: string[] = [],
): JsonSchema {
  return {
    ...s.object(
      description,
      {
        ...commonQuickActionFields,
        ...properties,
      },
      {
        optional: [...commonQuickActionOptionalFields, ...optional],
      },
    ),
    oneOf: [
      { required: ["url"], not: { required: ["html"] } },
      { required: ["html"], not: { required: ["url"] } },
    ],
  };
}

function jsonQuickActionInputSchema(): JsonSchema {
  return {
    ...quickActionInputSchema(
      "Input parameters for the Browser Run JSON endpoint.",
      {
        prompt: s.nonEmptyString("The natural language prompt for extracting structured data."),
        responseFormat: responseFormatSchema,
      },
      ["prompt", "responseFormat"],
    ),
    anyOf: [{ required: ["prompt"] }, { required: ["responseFormat"] }],
  };
}
