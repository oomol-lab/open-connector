import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "riveter";

const creditSchema = s.object("The Riveter credit balance for the account.", {
  count: s.integer("The current credit count."),
  max: s.integer("The maximum credits available."),
  balance: s.integer("The remaining credit balance."),
});

const accountSchema = s.object("The Riveter account associated with the API key.", {
  uuid: s.uuid("The unique identifier for the account."),
  name: s.string("The account name."),
  plan: s.stringEnum("The current billing plan.", ["free", "starter", "advanced", "pro", "enterprise"]),
  credit: creditSchema,
});

const userSchema = s.object("The Riveter user who created the API key.", {
  uuid: s.uuid("The user's unique identifier."),
  name: s.string("The user's full name."),
  email: s.email("The user's email address."),
});

const apiKeyInfoSchema = s.object("Details about the Riveter API key used for this request.", {
  name: s.string("The name of the API key."),
  last_used_at: s.nullableString("When the API key was last used.", { format: "date-time" }),
  created_by: userSchema,
});

export const riveterActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_account",
    description: "Retrieve the Riveter account and API key details for the connected API key.",
    inputSchema: s.object("The input payload for retrieving the Riveter account.", {}),
    outputSchema: s.object("The Riveter account response.", {
      account: accountSchema,
      api_key_info: apiKeyInfoSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "scrape",
    description: "Scrape a public webpage with Riveter and return extracted text content.",
    inputSchema: s.object(
      "The input payload for scraping a webpage with Riveter.",
      {
        url: s.url("The public webpage URL to scrape."),
        proxy_country_code: s.string({
          description: "The two-character country code for proxy routing.",
          pattern: "^[a-z]{2}$",
        }),
        skip_cache: s.boolean("Whether to bypass cached scrape results and fetch fresh content."),
      },
      { optional: ["proxy_country_code", "skip_cache"] },
    ),
    outputSchema: s.object("The Riveter scrape response.", {
      request_status: s.stringEnum("The status of the scrape request.", ["success", "error"]),
      message: s.string("The human-readable response message."),
      run_key: s.string("The unique identifier for this scrape run."),
      data: s.object(
        "The extracted webpage payload returned by Riveter.",
        {
          url: s.url("The URL that was scraped."),
          text: s.string("The extracted text content from the webpage."),
          base_url_for_links: s.url("The base URL for resolving relative links."),
          status_code: s.integer("The HTTP status code returned by the webpage server."),
          possibly_blocked: s.boolean(
            "Whether Riveter detected that the page may be blocked by anti-scraping measures.",
          ),
          credit_used: s.number("The number of Riveter credits consumed by the scrape."),
          riveter_app_link: s.url("The direct link to view this scrape in the Riveter application."),
          raw: s.looseObject("The raw scrape data object returned by Riveter."),
        },
        { optional: ["status_code", "possibly_blocked"] },
      ),
    }),
  }),
];
