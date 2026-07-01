import type { ProviderDefinition } from "../../core/types.ts";

import { fireberryActions } from "./actions.ts";

const service = "fireberry";

/**
 * Fireberry provider backed by the Fireberry REST API.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Fireberry",
  categories: ["Productivity", "Marketing"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "fireberry_api_key",
      description:
        "Fireberry API key sent in the tokenid header. Create or view API credentials from the Fireberry developer and API settings documented at https://developers.fireberry.com/reference/getting-started-with-rest-api.",
    },
  ],
  homepageUrl: "https://www.fireberry.com",
  actions: fireberryActions,
};
