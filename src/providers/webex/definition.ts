import type { ProviderDefinition } from "../../core/types.ts";

import { webexActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "webex",
  displayName: "Webex",
  categories: ["Communication", "Productivity"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://webexapis.com/v1/authorize",
      tokenUrl: "https://webexapis.com/v1/access_token",
      scopes: [
        "spark:kms",
        "spark:people_read",
        "spark:messages_read",
        "spark:messages_write",
        "spark:rooms_read",
        "spark:rooms_write",
        "spark:memberships_read",
        "spark:memberships_write",
        "spark:teams_read",
        "spark:teams_write",
        "spark:team_memberships_read",
        "spark:team_memberships_write",
        "meeting:schedules_read",
        "meeting:schedules_write",
        "meeting:participants_read",
        "meeting:recordings_read",
        "meeting:transcripts_read",
        "meeting:summaries_read",
      ],
      tokenEndpointAuthMethod: "client_secret_post",
    },
  ],
  homepageUrl: "https://www.webex.com",
  actions: webexActions,
};
