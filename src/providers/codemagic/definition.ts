import type { ProviderDefinition } from "../../core/types.ts";

import { codemagicActions } from "./actions.ts";

const service = "codemagic";

export const provider: ProviderDefinition = {
  service,
  displayName: "Codemagic",
  categories: ["Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Token",
      placeholder: "CM_API_TOKEN",
      description:
        "Codemagic personal API token used with the x-auth-token header. Find it under Teams > Personal Account > Integrations > Codemagic API > Show: https://docs.codemagic.io/rest-api/codemagic-rest-api/.",
    },
  ],
  homepageUrl: "https://codemagic.io",
  actions: codemagicActions,
};
