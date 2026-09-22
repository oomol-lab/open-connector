import type { ProviderDefinition } from "../../core/types.ts";

import { zyhubActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "zyhub",
  displayName: "Sina Finance ZYHub",
  description: "Query Sina Finance ZYHub market, company, and research data.",
  categories: ["Finance", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "ZYHUB_API_KEY",
      description: "ZYHub API key sent in the X-Auth-Token header. Obtain it from the official ZYHub service.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://zyhub.finance.sina.cn/",
  actions: zyhubActions,
};
