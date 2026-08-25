import type { ProviderDefinition } from "../../core/types.ts";

import { screendeskActions } from "./actions.ts";

const service = "screendesk";

export const provider: ProviderDefinition = {
  service,
  displayName: "Screendesk",
  description: "Manage Screendesk recordings, transcripts, and workspace users.",
  categories: ["Developer Tools", "Communication"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Personal Access Token",
      placeholder: "SCREENDESK_API_TOKEN",
      description:
        "Screendesk personal access token sent with HTTP Bearer authentication. Create or view tokens under Profile → API: https://app.screendesk.io/profile/api. API access requires an Enterprise plan.",
    },
  ],
  homepageUrl: "https://screendesk.io",
  actions: screendeskActions,
};
