import type { ProviderDefinition } from "../../core/types.ts";

import { webOfScienceExpandedActions } from "./actions.ts";

const service = "web_of_science_expanded";

export const provider: ProviderDefinition = {
  service,
  displayName: "Web of Science Expanded",
  description:
    "Search full Web of Science records, cited references, related documents, and citation reports through the paid Clarivate Expanded API.",
  categories: ["Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "WEB_OF_SCIENCE_EXPANDED_API_KEY",
      description:
        "Web of Science API key with a paid Expanded API subscription, sent in the X-ApiKey header. Register an application and request Expanded access in the official Clarivate Developer Portal: https://developer.clarivate.com/apis/wos",
    },
  ],
  homepageUrl:
    "https://clarivate.com/academia-government/scientific-and-academic-research/research-discovery-and-referencing/web-of-science/",
  actions: webOfScienceExpandedActions,
};
