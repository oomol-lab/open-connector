import type { ProviderDefinition } from "../../core/types.ts";

import { bigpictureIoActions } from "./actions.ts";

const service = "bigpicture_io";

export const provider: ProviderDefinition = {
  service,
  displayName: "BigPicture.io",
  categories: ["Data", "Marketing"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "BIGPICTURE_API_KEY",
      description:
        "BigPicture API key sent in the Authorization header. Request API access or sign in from the official BigPicture site: https://bigpicture.io",
    },
  ],
  homepageUrl: "https://bigpicture.io",
  actions: bigpictureIoActions,
};
