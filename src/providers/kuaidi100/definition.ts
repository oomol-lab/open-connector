import type { ProviderDefinition } from "../../core/types.ts";

import { kuaidi100Actions } from "./actions.ts";

const service = "kuaidi100";

export const provider: ProviderDefinition = {
  service,
  displayName: "Kuaidi100",
  categories: ["Productivity", "Location"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "KUAIDI100_API_KEY",
      description:
        "Kuaidi100 (快递100) authorization key sent as the key query parameter. Find it in the Kuaidi100 API console under 授权参数: https://api.kuaidi100.com/manager/v2/query/overview.",
    },
  ],
  homepageUrl: "https://api.kuaidi100.com/product/mcp",
  actions: kuaidi100Actions,
};
