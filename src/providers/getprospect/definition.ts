import type { ProviderDefinition } from "../../core/types.ts";

import { getprospectActions } from "./actions.ts";

const service = "getprospect";

/**
 * GetProspect provider backed by the GetProspect REST API.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "GetProspect",
  categories: ["Marketing", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "getprospect_api_key",
      description:
        "GetProspect API key sent with the apiKey header. Generate or view it from your GetProspect API settings: https://getprospect.readme.io/reference/introduction",
    },
  ],
  homepageUrl: "https://getprospect.com",
  actions: getprospectActions,
};
