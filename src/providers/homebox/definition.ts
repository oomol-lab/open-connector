import type { ProviderDefinition } from "../../core/types.ts";

import { homeBoxActions } from "./actions.ts";

const service = "homebox";

/**
 * HomeBox provider backed by a user-configured HomeBox instance.
 *
 * Authenticates with a static API key issued by the HomeBox web interface
 * (Users -> API Keys). The key carries the same permissions as the issuing
 * account, so the provider acts as that account, including its group scope:
 * everything created through the provider is visible to the account that
 * issued the key and its group members.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "HomeBox",
  description:
    "Home inventory and organization (entities, tags, entity types, maintenance, attachments) on a self-hosted HomeBox instance.",
  categories: ["Productivity", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "HOMEBOX_API_KEY",
      description:
        "A static API key issued from the HomeBox web interface under Users -> API Keys. The key has the same permissions as the issuing account, so the provider acts as that account and shares its group collection.",
      extraFields: [
        {
          key: "baseUrl",
          label: "Instance Base URL",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "http://homebox.local:7745",
          description:
            "The root URL for your HomeBox instance. The API is served below it at /api/v1, so http://homebox.local or http://homebox.local/api both work.",
        },
      ],
    },
  ],
  homepageUrl: "https://homebox.software",
  actions: homeBoxActions,
};
