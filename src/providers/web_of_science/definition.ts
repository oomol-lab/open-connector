import type { ProviderDefinition } from "../../core/types.ts";

import { webOfScienceActions } from "./actions.ts";

const service = "web_of_science";

export const provider: ProviderDefinition = {
  service,
  displayName: "Web of Science",
  description: "Search Web of Science documents and journals through the Clarivate Web of Science Starter API.",
  categories: ["Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "WEB_OF_SCIENCE_API_KEY",
      description:
        "Web of Science API key sent in the X-ApiKey header. Register an application and subscribe to the Starter API in the Clarivate Developer Portal: https://developer.clarivate.com/apis/wos-starter",
    },
  ],
  homepageUrl:
    "https://clarivate.com/academia-government/scientific-and-academic-research/research-discovery-and-referencing/web-of-science/",
  actions: webOfScienceActions,
};
