import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "alt_text_ai";

const languageSchema = s.string(
  "Language code or comma-separated language codes for generated alt text.",
  { minLength: 1 },
);

const keywordsSchema = s.array(
  "Keywords or phrases to consider when generating SEO-optimized alt text.",
  s.string("A keyword or phrase written in English.", { minLength: 1 }),
  { maxItems: 6 },
);

const stringRecordSchema = s.unknownObject("Custom key-value metadata associated with the image.");

const ecommerceSchema = s.object(
  "Ecommerce product context for product image alt text generation.",
  {
    product: s.string("Product name or description.", { minLength: 1 }),
    brand: s.string("Brand name.", { minLength: 1 }),
    color: s.string("Product color.", { minLength: 1 }),
  },
  { optional: ["product", "brand", "color"] },
);

const imageSchema = s.object(
  "An AltText.ai image record.",
  {
    asset_id: s.nullable(s.string("The unique ID of the image.")),
    url: s.nullable(
      s.string("The public image URL, or null when the image was uploaded as raw data."),
    ),
    alt_text: s.nullable(s.string("The primary generated alt text for the image.")),
    alt_texts: s.unknownObject("Generated alt text keyed by language code."),
    tags: s.array("Words or phrases associated with the image.", s.string("An image tag.")),
    metadata: s.unknownObject("Custom metadata stored with the image."),
    created_at: s.nullable(s.integer("Creation time in seconds since epoch.")),
    errors: s.unknownObject("Field-specific image processing errors."),
    error_code: s.nullable(
      s.string("An identifier describing the type of image processing error."),
    ),
  },
  {
    optional: [
      "asset_id",
      "url",
      "alt_text",
      "alt_texts",
      "tags",
      "metadata",
      "created_at",
      "errors",
      "error_code",
    ],
  },
);

const paginationSchema = s.object("Pagination metadata returned in AltText.ai response headers.", {
  currentPage: s.nullable(s.integer("The current page number returned by AltText.ai.")),
  pageItems: s.nullable(s.integer("The number of items in each page returned by AltText.ai.")),
  totalPages: s.nullable(s.integer("The total number of pages returned by AltText.ai.")),
  totalCount: s.nullable(s.integer("The total number of items returned by AltText.ai.")),
  link: s.nullable(s.string("The RFC 8288 pagination link header returned by AltText.ai.")),
});

const imagesOutputSchema = s.object("A page of AltText.ai image records.", {
  images: s.array("Image records returned by AltText.ai.", imageSchema),
  pagination: paginationSchema,
});

const accountSchema = s.object(
  "AltText.ai account settings and usage details.",
  {
    name: s.nullable(s.string("The name of the AltText.ai account.")),
    webhook_url: s.nullable(s.string("The default notification URL for webhooks.")),
    notification_email: s.nullable(
      s.string("The email address for important account notifications."),
    ),
    usage: s.nullable(s.integer("The number of credits used this billing period.")),
    usage_limit: s.nullable(
      s.integer("The maximum credits that can be used during this billing period."),
    ),
    whitelabel: s.nullable(s.boolean("Whether whitelabel mode is enabled for the account.")),
    ending_period: s.nullable(
      s.boolean("Whether generated alt text should end with a period by default."),
    ),
    no_quotes: s.nullable(
      s.boolean("Whether quote characters are removed from generated alt text by default."),
    ),
    remove_symbols: s.nullable(
      s.array("Symbol characters removed from generated alt text.", s.string("A symbol.")),
    ),
    gpt_prompt: s.nullable(s.string("The default prompt applied to initially generated alt text.")),
    max_chars: s.nullable(s.integer("The account-level maximum character limit for alt text.")),
    subscription: s.nullable(
      s.object(
        "Subscription details associated with the account.",
        {
          plan_name: s.nullable(s.string("The name of the current subscription plan.")),
          usage_quota: s.nullable(
            s.integer("The number of credits granted each billing period on this plan."),
          ),
          status: s.nullable(s.string("The current status of the subscription plan.")),
          expires_at: s.nullable(s.string("The renewal or expiration date of the plan.")),
        },
        { optional: ["plan_name", "usage_quota", "status", "expires_at"] },
      ),
    ),
    errors: s.unknownObject("Field-specific account errors."),
  },
  {
    optional: [
      "name",
      "webhook_url",
      "notification_email",
      "usage",
      "usage_limit",
      "whitelabel",
      "ending_period",
      "no_quotes",
      "remove_symbols",
      "gpt_prompt",
      "max_chars",
      "subscription",
      "errors",
    ],
  },
);

const scrapedImageSchema = s.object(
  "A single image discovered during page scraping.",
  {
    src: s.nullable(s.string("The image src attribute discovered in the page HTML.")),
    alt: s.nullable(s.string("The existing alt attribute discovered in the page HTML.")),
    width: s.nullable(s.integer("The image width in pixels when available.")),
    height: s.nullable(s.integer("The image height in pixels when available.")),
    skip_reason: s.nullable(
      s.string("The reason this image was skipped from processing, or null when queued."),
    ),
  },
  { optional: ["src", "alt", "width", "height", "skip_reason"] },
);

const pageScrapeOutputSchema = s.object(
  "The result of scraping a web page or HTML document for images.",
  {
    url: s.nullable(s.string("The page URL that was scraped, or null when raw HTML was sent.")),
    scraped_images: s.array("Images discovered during page scraping.", scrapedImageSchema),
    total_processed: s.integer("The number of scraped images queued for alt text generation."),
    errors: s.unknownObject("Errors encountered while scraping or queuing images."),
  },
  { optional: ["url", "scraped_images", "total_processed", "errors"] },
);

export const altTextAiActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_account",
    description: "Retrieve AltText.ai account settings and usage details for the API key.",
    requiredScopes: [],
    inputSchema: s.object("No input is required to retrieve account settings.", {}),
    outputSchema: accountSchema,
  }),
  defineProviderAction(service, {
    name: "create_image",
    description: "Add a publicly accessible image URL to AltText.ai and generate alt text.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for generating alt text for a publicly accessible image URL.",
      {
        url: s.url("The public URL of the image that needs alt text."),
        asset_id: s.string("Your own unique asset ID for this image.", { minLength: 1 }),
        tags: s.array("Words or phrases to associate with the image.", s.string("An image tag.")),
        metadata: stringRecordSchema,
        ecomm: ecommerceSchema,
        keywords: keywordsSchema,
        negative_keywords: keywordsSchema,
        keyword_source: s.string("Text source for extracting keywords when keywords is blank.", {
          minLength: 12,
          maxLength: 1024,
        }),
        lang: languageSchema,
        max_chars: s.integer("Maximum generated alt text length in characters.", {
          minimum: 80,
          maximum: 500,
        }),
        overwrite: s.boolean("Whether to regenerate existing alt text for the image."),
        gpt_prompt: s.string("Prompt to apply to generated alt text using the {{AltText}} macro.", {
          minLength: 1,
        }),
        model_name: s.stringEnum("The language model style to use for alt text generation.", [
          "describe-detailed",
          "describe-regular",
          "describe-factual",
          "succinct-describe-factual",
          "describe-terse",
        ]),
        timeout_secs: s.integer("Maximum timeout in seconds for synchronous generation.", {
          minimum: 5,
          maximum: 30,
        }),
      },
      {
        optional: [
          "asset_id",
          "tags",
          "metadata",
          "ecomm",
          "keywords",
          "negative_keywords",
          "keyword_source",
          "lang",
          "max_chars",
          "overwrite",
          "gpt_prompt",
          "model_name",
          "timeout_secs",
        ],
      },
    ),
    outputSchema: imageSchema,
  }),
  defineProviderAction(service, {
    name: "list_images",
    description: "List image records in the AltText.ai library with optional URL filtering.",
    requiredScopes: [],
    inputSchema: s.object(
      "Pagination and filtering input for listing image records.",
      {
        page: s.integer("Page number to retrieve, starting at 1.", { minimum: 1 }),
        limit: s.integer("Number of images per page, up to 100.", { minimum: 1, maximum: 100 }),
        url: s.url("Exact image URL used to filter results."),
      },
      { optional: ["page", "limit", "url"] },
    ),
    outputSchema: imagesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_image",
    description: "Retrieve a single AltText.ai image record by asset ID.",
    requiredScopes: [],
    inputSchema: s.object("Input for retrieving a specific image by asset ID.", {
      asset_id: s.string("The unique asset ID of the image to retrieve.", { minLength: 1 }),
    }),
    outputSchema: imageSchema,
  }),
  defineProviderAction(service, {
    name: "search_images",
    description: "Search the AltText.ai image library by URL, asset ID, or alt text content.",
    requiredScopes: [],
    inputSchema: s.object(
      "Search and pagination input for the AltText.ai image library.",
      {
        query: s.string("The search query for URL, asset ID, or alt text content.", {
          minLength: 1,
          maxLength: 256,
        }),
        page: s.integer("Page number to retrieve, starting at 1.", { minimum: 1 }),
        limit: s.integer("Number of search results per page, up to 100.", {
          minimum: 1,
          maximum: 100,
        }),
      },
      { optional: ["page", "limit"] },
    ),
    outputSchema: imagesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_image",
    description: "Delete an image from the AltText.ai library by asset ID.",
    requiredScopes: [],
    inputSchema: s.object("Input for deleting a specific image by asset ID.", {
      asset_id: s.string("The asset ID of the image to delete.", { minLength: 1 }),
    }),
    outputSchema: imageSchema,
  }),
  defineProviderAction(service, {
    name: "scrape_page",
    description:
      "Scrape a web page or raw HTML document and queue discovered images for alt text generation.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for scraping images from a URL or raw HTML document.",
      {
        url: s.url("The page URL to scrape. The crawler does not execute JavaScript."),
        html: s.string("Raw HTML document to parse for image elements.", { minLength: 1 }),
        keywords: keywordsSchema,
        negative_keywords: keywordsSchema,
        lang: languageSchema,
        include_existing: s.boolean("Whether to process images that already have alt text."),
      },
      { optional: ["url", "html", "keywords", "negative_keywords", "lang", "include_existing"] },
    ),
    outputSchema: pageScrapeOutputSchema,
  }),
] satisfies ActionDefinition[];
