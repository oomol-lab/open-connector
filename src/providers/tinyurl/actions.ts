import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "tinyurl";

const tinyurlDateTime = s.dateTime("An ISO 8601 timestamp returned by TinyURL.");
const tinyurlListItem = s.object(
  "A single TinyURL item returned by the TinyURL listing API.",
  {
    tiny_url: s.url("The TinyURL short link."),
    alias: s.nonEmptyString("The alias used by the TinyURL."),
    domain: s.nonEmptyString("The domain used by the TinyURL."),
    url: s.url("The original destination URL, when returned by TinyURL."),
    archived: s.boolean("Whether the TinyURL is archived."),
    created_at: tinyurlDateTime,
  },
  { optional: ["url"] },
);

export const tinyurlActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "create_short_url",
    description: "Create a TinyURL short link for a destination URL.",
    inputSchema: s.object(
      "The input payload for creating a TinyURL short link.",
      {
        url: s.url("The full URL to shorten, including the http:// or https:// protocol."),
        alias: s.nonEmptyString("A custom alias for the short URL. It must be unique for the selected domain."),
        domain: s.nonEmptyString("The domain to use when TinyURL creates the short link."),
        tags: s.stringArray("Tags to associate with the created TinyURL.", { minItems: 1 }),
        expires_at: s.dateTime("The ISO 8601 timestamp when the created TinyURL should expire."),
      },
      { optional: ["alias", "domain", "tags", "expires_at"] },
    ),
    outputSchema: s.object(
      "The created TinyURL returned by the TinyURL API.",
      {
        tiny_url: s.url("The TinyURL short link that was created."),
        alias: s.nonEmptyString("The alias used by the created TinyURL."),
        domain: s.nonEmptyString("The domain used by the created TinyURL."),
        url: s.url("The original destination URL."),
        tags: s.stringArray("The tags associated with the created TinyURL."),
        expires_at: tinyurlDateTime,
        created_at: tinyurlDateTime,
      },
      { optional: ["domain", "url", "tags", "expires_at", "created_at"] },
    ),
  }),
  defineProviderAction(service, {
    name: "list_urls",
    description: "List TinyURLs from the TinyURL account by availability status.",
    inputSchema: s.object(
      "The input payload for listing TinyURLs from the TinyURL API.",
      {
        type: s.stringEnum("Whether to list available TinyURLs or archived TinyURLs.", ["available", "archived"]),
        page: s.positiveInteger("The 1-based page number of the TinyURL results to fetch."),
        limit: s.integer("The maximum number of TinyURLs to fetch per page, from 1 to 100.", {
          minimum: 1,
          maximum: 100,
        }),
      },
      { optional: ["page", "limit"] },
    ),
    outputSchema: s.object(
      "The paginated TinyURL listing returned by the TinyURL API.",
      {
        code: s.integer("The TinyURL response code."),
        data: s.array("The TinyURLs returned for the selected page.", tinyurlListItem),
        page: s.integer("The current TinyURL results page, when returned by TinyURL."),
        limit: s.integer("The number of TinyURLs returned per page, when returned by TinyURL."),
        total: s.integer("The total number of TinyURLs matching the selected type, when returned by TinyURL."),
      },
      { optional: ["code", "page", "limit", "total"] },
    ),
  }),
];
