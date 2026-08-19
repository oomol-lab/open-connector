import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "zyte_api";

const urlSchema = s.string({
  description: "The absolute public HTTP or HTTPS URL to extract data from with Zyte API.",
  format: "uri",
  maxLength: 8192,
});

const ipTypeSchema = s.stringEnum("The IP type Zyte API should use for the request.", ["datacenter", "residential"]);

const extractFromSchema = s.stringEnum("The source Zyte API should use for automatic extraction.", [
  "browserHtml",
  "browserHtmlOnly",
  "httpResponseBody",
]);

const commonInputShape = {
  url: urlSchema,
  ipType: ipTypeSchema,
};

const structuredExtractionInputShape = {
  ...commonInputShape,
  extractFrom: extractFromSchema,
};

const commonOutputShape = {
  url: s.string("The URL Zyte API extracted data from. It may differ from the input URL."),
  statusCode: s.integer("The HTTP status code retrieved from the target page."),
};

const fetchBrowserHtmlInputSchema = s.object(
  "The input payload for fetching browser-rendered HTML with Zyte API.",
  commonInputShape,
  { required: ["url"], optional: ["ipType"] },
);

const fetchBrowserHtmlOutputSchema = s.object(
  "The output payload for fetching browser-rendered HTML with Zyte API.",
  {
    ...commonOutputShape,
    browserHtml: s.string("The browser-rendered HTML returned by Zyte API."),
  },
  { required: ["url", "browserHtml"], optional: ["statusCode"] },
);

const structuredInputSchema = (description: string) =>
  s.object(description, structuredExtractionInputShape, { required: ["url"], optional: ["ipType", "extractFrom"] });

const productOutputSchema = s.object(
  "The output payload for extracting product data with Zyte API.",
  {
    ...commonOutputShape,
    product: s.looseObject("The product data returned by Zyte API."),
  },
  { required: ["url", "product"], optional: ["statusCode"] },
);

const articleOutputSchema = s.object(
  "The output payload for extracting article data with Zyte API.",
  {
    ...commonOutputShape,
    article: s.looseObject("The article data returned by Zyte API."),
  },
  { required: ["url", "article"], optional: ["statusCode"] },
);

const pageContentOutputSchema = s.object(
  "The output payload for extracting page content data with Zyte API.",
  {
    ...commonOutputShape,
    pageContent: s.looseObject("The page content data returned by Zyte API."),
  },
  { required: ["url", "pageContent"], optional: ["statusCode"] },
);

export const zyteApiActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "fetch_browser_html",
    description: "Fetch browser-rendered HTML for one public URL with Zyte API.",
    inputSchema: fetchBrowserHtmlInputSchema,
    outputSchema: fetchBrowserHtmlOutputSchema,
  }),
  defineProviderAction(service, {
    name: "extract_product",
    description: "Extract product data from one public URL with Zyte API.",
    inputSchema: structuredInputSchema("The input payload for extracting product data with Zyte API."),
    outputSchema: productOutputSchema,
  }),
  defineProviderAction(service, {
    name: "extract_article",
    description: "Extract article data from one public URL with Zyte API.",
    inputSchema: structuredInputSchema("The input payload for extracting article data with Zyte API."),
    outputSchema: articleOutputSchema,
  }),
  defineProviderAction(service, {
    name: "extract_page_content",
    description: "Extract generic page content data from one public URL with Zyte API.",
    inputSchema: structuredInputSchema("The input payload for extracting page content data with Zyte API."),
    outputSchema: pageContentOutputSchema,
  }),
];
