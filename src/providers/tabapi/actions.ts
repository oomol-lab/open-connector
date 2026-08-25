import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "tabapi";
const domain = s.nonEmptyString("The domain name to inspect, without a URL path.");
const outputSchemas: Record<string, JsonSchema> = {
  get_domain_traffic: s.looseRequiredObject("The modeled traffic response.", {
    domain: s.string("The normalized queried domain."),
    overview: s.looseObject("Aggregate traffic metrics."),
    monthly_visits: s.array("Monthly visit history.", s.looseObject("One monthly visit record.")),
    traffic_sources: s.looseObject("Traffic acquisition shares."),
    top_keywords: s.array("Top organic keywords.", s.looseObject("One keyword record.")),
    top_regions: s.array("Top visitor countries.", s.looseObject("One country record.")),
  }),
  get_domain_whois: s.looseRequiredObject("The raw WHOIS response.", {
    domain: s.string("The normalized registrable domain."),
    whois_server: s.nullableString("The WHOIS server."),
    raw: s.string("The verbatim WHOIS response."),
  }),
  get_domain_rdap: s.looseRequiredObject("The RDAP domain response.", {
    ldhName: s.string("The domain name in LDH ASCII form."),
  }),
  get_dns_records: s.looseRequiredObject("The DNS response.", {
    domain: s.string("The queried hostname."),
    status: s.string("The DNS response code name."),
    resolver: s.string("The selected DNS resolver."),
    records: s.array("Returned DNS records.", s.looseObject("One DNS resource record.")),
  }),
  get_domain_backlinks: s.looseRequiredObject("The backlink profile.", {
    domain: s.string("The normalized queried domain."),
    overview: s.looseObject("Aggregate backlink metrics."),
    backlinks: s.array("Representative referring pages.", s.looseObject("One backlink record.")),
  }),
  google_search: s.looseRequiredObject("The normalized Google results.", {
    search_parameters: s.looseObject("The executed search parameters."),
    organic_results: s.array("Organic results.", s.looseObject("One organic result.")),
    paid_results: s.array("Paid results.", s.looseObject("One paid result.")),
    people_also_ask: s.array("People Also Ask results.", s.looseObject("One question.")),
    related_searches: s.array("Related searches.", s.looseObject("One related search.")),
  }),
  find_adsense_publisher_sites: s.looseRequiredObject("The reverse AdSense result.", {
    publisher_id: s.string("The normalized AdSense publisher ID."),
    total_sites: s.integer("The reported number of matches."),
    sites: s.stringArray("Matching domains."),
  }),
  extract_url_markdown: webOutput("Markdown"),
  capture_url_screenshot: webOutput("screenshot"),
};

function action(name: string, description: string, inputSchema: JsonSchema): ActionDefinition {
  return defineProviderAction(service, {
    name,
    description,
    requiredScopes: [],
    inputSchema,
    outputSchema: outputSchemas[name]!,
  });
}

function webOutput(kind: string): JsonSchema {
  return s.looseRequiredObject(`The normalized ${kind} result.`, {
    source: s.looseObject("Source URL resolution details."),
    page: s.looseObject("Extracted page metadata."),
    output: s.looseObject(`The ${kind} output.`),
    warnings: s.array("Non-fatal warnings.", s.string("One warning.")),
  });
}

export const tabapiActions: ActionDefinition[] = [
  action(
    "get_domain_traffic",
    "Get traffic estimates and acquisition channels for a domain.",
    s.actionInput(
      {
        domain,
        months: s.integer("The number of recent months to include.", { minimum: 3, maximum: 12 }),
      },
      ["domain"],
      "Input for retrieving domain traffic.",
    ),
  ),
  action(
    "get_domain_whois",
    "Get the raw port-43 WHOIS record for a domain.",
    s.actionInput({ domain }, ["domain"], "Input for retrieving WHOIS data."),
  ),
  action(
    "get_domain_rdap",
    "Get structured RDAP registration data for a domain.",
    s.actionInput({ domain }, ["domain"], "Input for retrieving RDAP data."),
  ),
  action(
    "get_dns_records",
    "Get DNS records for a domain.",
    s.actionInput(
      {
        domain,
        type: s.stringEnum("The DNS record type, or ALL for every supported type.", [
          "A",
          "AAAA",
          "CNAME",
          "MX",
          "NS",
          "TXT",
          "all",
        ]),
      },
      ["domain"],
      "Input for retrieving DNS records.",
    ),
  ),
  action(
    "get_domain_backlinks",
    "Get backlink metrics and representative source pages for a domain.",
    s.actionInput({ domain }, ["domain"], "Input for retrieving backlinks."),
  ),
  action(
    "google_search",
    "Search Google and return normalized result data.",
    s.actionInput(
      {
        q: s.nonEmptyString("The Google search query."),
        country: s.string({ pattern: "^[a-z]{2}$", description: "The two-letter lowercase country code." }),
        language: s.string({ pattern: "^[a-z]{2,3}(-[a-z0-9]{2,8})*$", description: "The lowercase language code." }),
        page: s.integer("The one-based result page.", { minimum: 1, maximum: 10 }),
      },
      ["q"],
      "Input for Google Search.",
    ),
  ),
  action(
    "find_adsense_publisher_sites",
    "Find domains associated with an AdSense publisher ID.",
    s.actionInput(
      {
        pub_id: s.string({
          pattern: "^(?:pub-)?\\d{16}$",
          description: "The 16-digit AdSense publisher ID, with or without pub-.",
        }),
      },
      ["pub_id"],
      "Input for reverse AdSense lookup.",
    ),
  ),
  action(
    "extract_url_markdown",
    "Extract a public web page as Markdown.",
    s.actionInput(
      {
        url: s.string({
          format: "uri",
          pattern: "^https?://",
          description: "The public HTTP or HTTPS page URL that TabAPI should fetch.",
        }),
      },
      ["url"],
      "Input for URL-to-Markdown extraction.",
    ),
  ),
  action(
    "capture_url_screenshot",
    "Capture the first viewport of a public URL and return a hosted PNG URL.",
    s.actionInput(
      {
        url: s.string({
          format: "uri",
          pattern: "^https?://",
          description: "The public HTTP or HTTPS page URL that TabAPI should capture.",
        }),
        options: s.object(
          "Screenshot rendering settings.",
          {
            viewport: s.object(
              "The first-viewport dimensions.",
              {
                width: s.integer("The viewport width in pixels.", { minimum: 320, maximum: 2560 }),
                height: s.integer("The viewport height in pixels.", { minimum: 240, maximum: 2160 }),
              },
              { optional: ["width", "height"] },
            ),
          },
          { optional: ["viewport"] },
        ),
      },
      ["url"],
      "Input for capturing a URL screenshot.",
    ),
  ),
];
