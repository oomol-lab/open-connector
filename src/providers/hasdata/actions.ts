import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "hasdata";

const outputFormatSchema = s.stringEnum("One HasData Web Scraping API output format.", [
  "html",
  "text",
  "markdown",
  "json",
]);
const jsonPayloadSchema = s.looseObject("Raw JSON object returned by HasData.");
const stringRecordSchema = s.record(
  "String values keyed by caller-defined field names.",
  s.string("One field extraction selector."),
);
const headersSchema = s.record(
  "HTTP headers HasData should send to the target website.",
  s.string("One HTTP header value."),
);

export type HasdataActionName = "scrape_web" | "search_google_serp";

export const hasdataActions: readonly ProviderActionDefinition<HasdataActionName>[] = [
  defineProviderAction(service, {
    name: "scrape_web",
    operationType: "read",
    description:
      "Scrape one public web page through HasData's synchronous Web Scraping API and return the official JSON payload.",
    inputSchema: s.actionInput(
      {
        url: s.string({
          description: "The absolute public URL HasData should scrape.",
          minLength: 1,
          maxLength: 2083,
          format: "uri",
        }),
        outputFormat: s.array("Response formats HasData should include in the result.", outputFormatSchema, {
          minItems: 1,
        }),
        proxyType: s.stringEnum("The proxy type HasData should use for the target page.", [
          "datacenter",
          "residential",
        ]),
        proxyCountry: s.string("The ISO 3166-1 alpha-2 country code used for HasData proxy geolocation.", {
          pattern: "^[A-Za-z]{2}$",
        }),
        extractRules: stringRecordSchema,
        aiExtractRules: s.looseObject("Structured AI extraction rules accepted by HasData."),
        screenshot: s.boolean("Whether HasData should capture a page screenshot."),
        extractEmails: s.boolean("Whether HasData should extract email addresses from the page."),
        extractLinks: s.boolean("Whether HasData should extract hyperlinks from the page."),
        wait: s.integer("Delay in milliseconds after page load before HasData scrapes the page.", {
          minimum: 0,
          maximum: 30000,
        }),
        waitFor: s.nonEmptyString("CSS selector HasData should wait for before scraping."),
        blockResources: s.boolean("Whether HasData should block images and stylesheets while loading the page."),
        blockAds: s.boolean("Whether HasData should block common ad scripts and tracking pixels."),
        blockUrls: s.stringArray("Network request substrings or domains HasData should block.", { minItems: 1 }),
        jsRendering: s.boolean("Whether HasData should enable JavaScript rendering for the page."),
        jsScenario: s.array(
          "JavaScript browser actions HasData should run on the page.",
          s.looseObject("One HasData JavaScript scenario step."),
          { minItems: 1 },
        ),
        headers: headersSchema,
      },
      ["url"],
      "Input parameters for scraping one public web page with HasData.",
    ),
    outputSchema: hasdataPayloadOutput("The output payload for a HasData web scrape."),
  }),
  defineProviderAction(service, {
    name: "search_google_serp",
    operationType: "read",
    description: "Run one synchronous Google SERP search through HasData and return the official JSON payload.",
    inputSchema: s.actionInput(
      {
        q: s.nonEmptyString("Search term to query Google for."),
        location: s.nonEmptyString("Google canonical location for the search."),
        uule: s.nonEmptyString("Encoded Google canonical location string."),
        domain: s.nonEmptyString("Google domain to use for the search, such as google.com."),
        gl: s.nonEmptyString("Two-letter country code used to localize results."),
        hl: s.nonEmptyString("Two-letter language code used for the search interface."),
        lr: s.nonEmptyString("Language restriction for the web content returned by Google."),
        tbs: s.nonEmptyString("Google advanced filter expression such as qdr:d or sbd:1."),
        safe: s.stringEnum("Adult content filtering mode sent to Google.", ["active", "off"]),
        filter: s.integer("Whether Google should enable similar and omitted result filtering.", {
          minimum: 0,
          maximum: 1,
        }),
        nfpr: s.integer("Whether Google should show only the original query.", { minimum: 0, maximum: 1 }),
        start: s.nonNegativeInteger("Number of search results to skip for pagination."),
        num: s.integer("Number of results per page.", { minimum: 10, maximum: 100 }),
        tbm: s.stringEnum("Google search type.", ["isch", "vid", "nws", "shop", "lcl"]),
        deviceType: s.stringEnum("Device type HasData should emulate for Google results.", [
          "desktop",
          "mobile",
          "tablet",
        ]),
        ludocid: s.nonEmptyString("Google Place ID for a specific location result."),
        lsig: s.nonEmptyString("Additional Google Place ID parameter."),
        kgmid: s.nonEmptyString("Google Knowledge Graph ID."),
        si: s.nonEmptyString("Google cached search parameters ID."),
      },
      ["q"],
      "Input parameters for a HasData Google SERP request.",
    ),
    outputSchema: hasdataPayloadOutput("The output payload for a HasData Google SERP request."),
  }),
];

function hasdataPayloadOutput(description: string): JsonSchema {
  return s.actionOutput({ payload: jsonPayloadSchema }, description);
}
