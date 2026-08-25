import type { ProviderDefinition } from "../../core/types.ts";

import { chengxinActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "chengxin",
  displayName: "Tongcheng Chengxin",
  description: "Search Tongcheng Chengxin travel inventory and guidance.",
  categories: ["AI", "Location"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Chengxin Activation Code",
      placeholder: "CHENGXIN_API_KEY",
      description:
        "Tongcheng Chengxin activation code used as a Bearer API key. Open the Tongcheng Travel app or WeChat mini program, search for Chengxin activation code, and follow the instructions to obtain one.",
    },
  ],
  homepageUrl: "https://www.ly.com/",
  actions: chengxinActions,
};
