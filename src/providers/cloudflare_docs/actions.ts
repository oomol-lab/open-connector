import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "cloudflare_docs" as const;

export const cloudflareDocsActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "search_cloudflare_documentation",
    description:
      "Search Cloudflare documentation for Workers, Pages, R2, Images, Stream, D1, Durable Objects, KV, Workflows, Hyperdrive, Queues, AI Search, Workers AI, Vectorize, AI Gateway, Browser Run, Zero Trust, Access, Tunnel, Gateway, Browser Isolation, WARP, DDOS, Magic Transit, Magic WAN, CDN, Cache, DNS, Zaraz, Argo, Rulesets, Terraform, Account and Billing.",
    requiredScopes: [],
    inputSchema: s.object("Input payload for search_cloudflare_documentation", {
      query: s.string("Search query for Cloudflare documentation.", { minLength: 1 }),
    }),
    outputSchema: s.looseObject("Documentation search results from Cloudflare Docs MCP."),
  }),
  defineProviderAction(service, {
    name: "get_pages_to_workers_migration_guide",
    description: "Get the guide and instructions for migrating Cloudflare Pages projects to Cloudflare Workers.",
    requiredScopes: [],
    inputSchema: s.object("Input payload for get_pages_to_workers_migration_guide", {}),
    outputSchema: s.looseObject("Cloudflare Pages to Workers migration guide."),
  }),
];
