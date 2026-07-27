import type { ProviderDefinition } from "../../core/types.ts";

import { upstashRedisActions } from "./actions.ts";

const service = "upstash_redis";

/**
 * Upstash Redis provider backed by the official REST API.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Upstash Redis",
  description: "Read and manage string keys in an Upstash Redis database through its REST API.",
  categories: ["Data", "Developer Tools"],
  authTypes: ["custom_credential"],
  auth: [
    {
      type: "custom_credential",
      fields: [
        {
          key: "restUrl",
          label: "REST URL",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "https://your-database.upstash.io",
          description:
            "The HTTPS REST URL shown for an Upstash Redis database in the Upstash console. Only official upstash.io endpoints are supported.",
        },
        {
          key: "restToken",
          label: "REST Token",
          inputType: "password",
          required: true,
          secret: true,
          placeholder: "Your Upstash REST token",
          description:
            "The Upstash Redis REST token sent as a Bearer token. A read-only token can run get, exists, and ttl, but Upstash also blocks scan for read-only tokens, so the standard token is required for scan and for every write action.",
        },
      ],
    },
  ],
  homepageUrl: "https://upstash.com/redis",
  actions: upstashRedisActions,
};
