import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "cloudflare_mcp";

const codeSchema = s.nonWhitespaceString(
  "A JavaScript async arrow function. Use `search` before `execute` to discover the exact Cloudflare API path and parameters.",
);

export const cloudflareMcpActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "docs",
    description: "Search the official Cloudflare developer documentation for relevant guidance and examples.",
    requiredScopes: [],
    providerPermissions: [],
    inputSchema: s.requiredObject("Input for searching Cloudflare documentation.", {
      query: s.nonWhitespaceString("The Cloudflare documentation search query."),
    }),
    outputSchema: s.looseObject("Semantically relevant Cloudflare documentation excerpts.", {
      results: s.array(
        "Matching documentation excerpts.",
        s.looseObject("One matching documentation excerpt.", {
          similarity: s.number("The semantic similarity score."),
          id: s.string("The source document ID."),
          url: s.url("The Cloudflare developer documentation URL."),
          title: s.string("The documentation page title."),
          text: s.string("The matching documentation text."),
        }),
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "search",
    description:
      "Run sandboxed JavaScript against Cloudflare's OpenAPI specification to discover API endpoints and parameters.",
    requiredScopes: [],
    providerPermissions: [],
    inputSchema: s.requiredObject("Input for searching the Cloudflare API specification.", {
      code: codeSchema,
    }),
    outputSchema: s.unknown("The value returned by the supplied search function."),
    followUpActions: ["cloudflare_mcp.execute"],
  }),
  defineProviderAction(service, {
    name: "execute",
    description:
      "Run sandboxed JavaScript on Cloudflare's official MCP server to call Cloudflare API endpoints discovered with `search`.",
    requiredScopes: [],
    providerPermissions: [],
    inputSchema: s.object(
      "Input for executing Cloudflare API calls.",
      {
        code: codeSchema,
        account_id: s.nonWhitespaceString(
          "An optional Cloudflare account ID. Supply it for a user token when the operation is account-scoped; account tokens are auto-detected.",
        ),
      },
      { required: ["code"] },
    ),
    outputSchema: s.unknown("The value returned by the supplied Cloudflare API function."),
  }),
];
