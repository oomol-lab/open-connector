import type { ProviderDefinition } from "./types.ts";

import { describe, expect, it } from "vitest";
import { createCatalogStore } from "../catalog-store.ts";
import { buildActionSearchIndex, searchActions } from "./action-search.ts";

const providers: ProviderDefinition[] = [
  {
    service: "gmail",
    displayName: "Gmail",
    categories: ["Communication"],
    authTypes: ["oauth2"],
    auth: [
      {
        type: "oauth2",
        authorizationUrl: "https://example.com/auth",
        tokenUrl: "https://example.com/token",
        scopes: [],
        tokenEndpointAuthMethod: "client_secret_post",
      },
    ],
    actions: [
      {
        id: "gmail.send_email",
        service: "gmail",
        name: "send_email",
        description: "Send an email message.",
        requiredScopes: [],
        providerPermissions: [],
        inputSchema: {},
        outputSchema: {},
      },
    ],
  },
  {
    service: "github",
    displayName: "GitHub",
    categories: ["Developer Tools"],
    authTypes: ["oauth2"],
    auth: [
      {
        type: "oauth2",
        authorizationUrl: "https://example.com/auth",
        tokenUrl: "https://example.com/token",
        scopes: [],
        tokenEndpointAuthMethod: "client_secret_post",
      },
    ],
    actions: [
      {
        id: "github.create_issue",
        service: "github",
        name: "create_issue",
        description: "Create a repository issue.",
        requiredScopes: [],
        providerPermissions: [],
        inputSchema: {},
        outputSchema: {},
      },
    ],
  },
];

describe("action search", () => {
  it("uses fuzzy keyword ranking and query synonyms", () => {
    const catalog = createCatalogStore(providers, { executableActionIds: [] });
    const index = buildActionSearchIndex(catalog.actions);

    expect(searchActions(index, "send mail gmail", { limit: 1 })).toEqual([
      {
        id: "gmail.send_email",
        service: "gmail",
        name: "send_email",
        description: "Send an email message.",
      },
    ]);
  });

  it("filters by service before applying the result limit", () => {
    const catalog = createCatalogStore(providers, { executableActionIds: [] });
    const index = buildActionSearchIndex(catalog.actions);

    expect(searchActions(index, "create", { service: "github", limit: 10 }).map((action) => action.id)).toEqual([
      "github.create_issue",
    ]);
  });
});
