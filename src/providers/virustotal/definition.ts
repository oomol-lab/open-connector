import type { ProviderDefinition } from "../../core/types.ts";

import { virustotalActions } from "./actions.ts";

const service = "virustotal";

export const provider: ProviderDefinition = {
  service,
  displayName: "VirusTotal",
  categories: ["Security", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "VIRUSTOTAL_API_KEY",
      description:
        "VirusTotal API key sent as the x-apikey header. Find it in your account user menu or at https://www.virustotal.com/gui/my-apikey, as documented at https://docs.virustotal.com/reference/authentication.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://www.virustotal.com",
  actions: virustotalActions,
};
