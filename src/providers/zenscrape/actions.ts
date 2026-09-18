import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "zenscrape";
const blockableResourceSchema = s.stringEnum(
  [
    "document",
    "stylesheet",
    "image",
    "media",
    "font",
    "script",
    "texttrack",
    "xhr",
    "fetch",
    "eventsource",
    "websocket",
    "manifest",
    "other",
  ],
  { description: "A resource type Zenscrape should block while loading the page." },
);

export const zenscrapeActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "fetch_url",
    operationType: "read",
    description: "Fetch one public URL through Zenscrape with optional rendering, proxy, header, and wait controls.",
    inputSchema: {
      ...s.object(
        "The input payload for fetching one URL with Zenscrape.",
        {
          url: s.string({
            format: "uri",
            minLength: 1,
            maxLength: 2083,
            description: "The public target URL Zenscrape should request.",
          }),
          render: s.boolean("Whether Zenscrape should render JavaScript before returning the page."),
          premium: s.boolean("Whether Zenscrape should use premium proxies for the request."),
          location: s.nonEmptyString("The Zenscrape proxy location code, such as na, eu, or a premium country code."),
          deviceType: s.stringEnum(["mobile"], {
            description: "The device type Zenscrape should emulate.",
          }),
          waitFor: s.positiveInteger("How long Zenscrape should wait before returning the page response."),
          waitForCss: s.nonEmptyString(
            "The CSS selector Zenscrape should wait for before returning the page response.",
          ),
          blockAds: s.boolean("Whether Zenscrape should block ads while loading the page."),
          javascriptSnippet: s.nonEmptyString(
            "The JavaScript snippet Zenscrape should execute before returning the page response.",
          ),
          blockResources: s.array(
            "The resource types Zenscrape should block while loading the page.",
            blockableResourceSchema,
            { minItems: 1 },
          ),
          keepHeaders: s.boolean("Whether Zenscrape should forward provided custom headers to the target URL."),
          customHeaders: s.record(
            "Custom HTTP headers Zenscrape should forward to the target URL when keepHeaders is true.",
            s.string("A custom HTTP header value."),
          ),
          cookies: s.nonEmptyString("The Cookie header value Zenscrape should forward to the target URL."),
        },
        {
          optional: [
            "render",
            "premium",
            "location",
            "deviceType",
            "waitFor",
            "waitForCss",
            "blockAds",
            "javascriptSnippet",
            "blockResources",
            "keepHeaders",
            "customHeaders",
            "cookies",
          ],
        },
      ),
      allOf: [
        {
          if: {
            anyOf: [{ required: ["waitForCss"] }, { required: ["javascriptSnippet"] }],
          },
          then: {
            properties: { render: { const: true } },
            required: ["render"],
          },
        },
        {
          if: {
            anyOf: [{ required: ["customHeaders"] }, { required: ["cookies"] }],
          },
          then: {
            not: {
              properties: { keepHeaders: { const: false } },
              required: ["keepHeaders"],
            },
          },
        },
      ],
    },
    outputSchema: s.requiredObject("The response returned when fetching a URL with Zenscrape.", {
      body: s.string("The response body returned by Zenscrape."),
      metadata: s.requiredObject("Metadata collected from the Zenscrape response.", {
        statusCode: s.integer("The HTTP status code returned by Zenscrape."),
        contentType: s.nullableString("The response content type returned by Zenscrape."),
      }),
      headers: s.record(
        "Response headers returned by Zenscrape or the target website.",
        s.string("One response header value."),
      ),
    }),
  }),
];
