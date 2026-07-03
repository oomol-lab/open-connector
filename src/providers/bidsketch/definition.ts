import type { ProviderDefinition } from "../../core/types.ts";

import { bidsketchActions } from "./actions.ts";

const service = "bidsketch";

export const provider: ProviderDefinition = {
  service,
  displayName: "BidSketch",
  categories: ["Productivity", "Marketing"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Token",
      placeholder: "BIDSKETCH_API_TOKEN",
      description:
        "BidSketch API token used with the Authorization header. Admin users can create and view it at your workspace /account/api_tokens page, as described in the official API help article: https://help.bidsketch.com/article/76-using-the-bidsketch-api",
    },
  ],
  homepageUrl: "https://www.bidsketch.com/",
  actions: bidsketchActions,
};
