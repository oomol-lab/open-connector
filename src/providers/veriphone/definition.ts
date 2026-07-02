import type { ProviderDefinition } from "../../core/types.ts";

import { veriphoneActions } from "./actions.ts";

const service = "veriphone";

export const provider: ProviderDefinition = {
  service,
  displayName: "Veriphone",
  categories: ["Communication", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "VERIPHONE_API_KEY",
      description:
        "Veriphone API key sent with the Authorization Bearer header. Sign up and manage your key from the control panel via https://veriphone.io/docs.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://veriphone.io",
  actions: veriphoneActions,
};
