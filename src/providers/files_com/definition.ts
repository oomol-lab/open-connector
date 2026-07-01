import type { ProviderDefinition } from "../../core/types.ts";

import { filesComActions } from "./actions.ts";

const service = "files_com";

/**
 * Files.com provider backed by the Files.com REST API.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Files.com",
  categories: ["Productivity", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "FILES_COM_API_KEY",
      description:
        "Files.com API key sent with the X-FilesAPI-Key header. Create or view API keys in the Files.com web interface: https://www.files.com/docs/sdk-and-apis/api-keys.",
      extraFields: [
        {
          key: "subdomain",
          label: "Site subdomain",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "mysite",
          description: "Files.com site subdomain used to build https://SUBDOMAIN.files.com API URLs.",
        },
      ],
    },
  ],
  homepageUrl: "https://www.files.com",
  actions: filesComActions,
};
