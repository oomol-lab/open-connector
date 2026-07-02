import type { ProviderDefinition } from "../../core/types.ts";

import { notionActions } from "./actions.ts";
import { notionReadScopes, notionWriteScopes } from "./scopes.ts";

const service = "notion";

/**
 * Notion provider backed by the Notion public API.
 *
 * Open-source users can either configure an internal integration token or bring
 * their own Notion OAuth app with localhost callback support.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Notion",
  categories: ["Productivity"],
  authTypes: ["oauth2", "api_key"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://api.notion.com/v1/oauth/authorize",
      tokenUrl: "https://api.notion.com/v1/oauth/token",
      scopes: [...notionReadScopes, ...notionWriteScopes],
      tokenEndpointAuthMethod: "client_secret_basic",
      tokenRequestFormat: "json",
      authorizationParams: {
        owner: "user",
      },
    },
    {
      type: "api_key",
      label: "Internal Integration Secret",
      placeholder: "secret_...",
      description:
        "Notion internal integration secret used with the Authorization Bearer header. Create an internal integration from the Notion integrations dashboard, then share target pages or databases with it.",
    },
  ],
  homepageUrl: "https://www.notion.so",
  actions: notionActions,
};
