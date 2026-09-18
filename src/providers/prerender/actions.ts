import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "prerender";

const rawPayloadSchema = s.nullable(s.unknown("The raw Prerender response payload when one was returned."));

export const prerenderActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "recache_urls",
    operationType: "write",
    description: "Queue one or more URLs for first-time caching or recaching with the Prerender recache API.",
    inputSchema: s.object(
      "The input payload for queueing one or more Prerender recache URLs.",
      {
        urls: s.array("The public URLs to cache or recache.", s.url("One public URL to cache or recache."), {
          minItems: 1,
        }),
        adaptiveType: s.stringEnum("The Prerender adaptive cache type to target.", ["mobile", "desktop"]),
      },
      { optional: ["adaptiveType"] },
    ),
    outputSchema: s.object("The normalized result for a successful Prerender write request.", {
      accepted: s.boolean("Whether Prerender accepted the request."),
      raw: rawPayloadSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "add_sitemap",
    operationType: "write",
    description: "Submit a sitemap XML URL to Prerender so it can discover and cache new URLs from that sitemap.",
    inputSchema: s.object("The input payload for submitting a sitemap to Prerender.", {
      url: s.url("The sitemap XML URL to submit to Prerender."),
    }),
    outputSchema: s.object("The normalized result for a successful Prerender write request.", {
      accepted: s.boolean("Whether Prerender accepted the request."),
      raw: rawPayloadSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "clear_cache",
    operationType: "destructive",
    description: "Queue a Prerender cache clear request for URLs matching a wildcard query pattern.",
    inputSchema: s.object("The input payload for queueing a Prerender cache clear request.", {
      query: s.string("The wildcard query used to match cached URLs to clear, such as https://example.com%.", {
        minLength: 1,
        pattern: "\\S",
      }),
    }),
    outputSchema: s.object("The normalized result returned by the Prerender cache clear API.", {
      status: s.stringEnum("The cache clear job state reported by Prerender.", ["queued", "in_progress"]),
      raw: rawPayloadSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_cache_clear_status",
    operationType: "read",
    description: "Check whether a Prerender cache clear job is currently running for the authenticated account.",
    inputSchema: s.object("This action does not require any input parameters.", {}),
    outputSchema: s.object("The normalized Prerender cache clear status response.", {
      status: s.stringEnum("The current cache clear job state reported by Prerender.", ["idle", "in_progress"]),
      raw: rawPayloadSchema,
    }),
  }),
];
