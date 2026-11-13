import type { ProviderDefinition } from "../../core/types.ts";

import { baobiaoCompanyActions } from "./actions-companies.ts";
import { baobiaoProjectActions } from "./actions-projects.ts";

/**
 * Baobiao (保标) tender, contract, planned-project, and company data from Shibo Technology.
 */
export const provider: ProviderDefinition = {
  service: "baobiao",
  displayName: "Baobiao",
  categories: ["Data", "Marketing"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "Paste your Baobiao API key",
      description:
        "Baobiao API gateway key, sent as the key query parameter. Request one from Baobiao sales; see https://console.woyaobid.com/gateway-admin/share/api-doc.",
    },
  ],
  homepageUrl: "https://www.woyaobid.com/",
  actions: [...baobiaoProjectActions, ...baobiaoCompanyActions],
};
