import type { ProviderDefinition } from "../../core/types.ts";

import { vercelActions } from "./actions.ts";

const service = "vercel";

/**
 * Vercel provider backed by the Vercel REST API.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Vercel",
  categories: ["Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Access token",
      placeholder: "vercel_access_token",
      description:
        "Vercel personal access token used with the Authorization Bearer header. Create it in your Vercel Account Tokens settings. Team-owned resources also need Team ID or Team slug.",
      extraFields: [
        {
          key: "teamId",
          label: "Team ID",
          inputType: "text",
          required: false,
          secret: false,
          placeholder: "team_...",
          description:
            "Optional Vercel team ID sent as the teamId query parameter on team-scoped REST API requests. Use this or Team slug, not both. Find it under the team Settings page.",
        },
        {
          key: "slug",
          label: "Team slug",
          inputType: "text",
          required: false,
          secret: false,
          placeholder: "my-team",
          description:
            "Optional Vercel team slug sent as the slug query parameter on team-scoped REST API requests. Use this or Team ID, not both.",
        },
      ],
    },
  ],
  homepageUrl: "https://vercel.com",
  actions: vercelActions,
};
