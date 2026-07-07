import type { ProviderDefinition } from "../../core/types.ts";

import { codegenActions } from "./actions.ts";

const service = "codegen";

export const provider: ProviderDefinition = {
  service,
  displayName: "Codegen",
  categories: ["Developer Tools", "AI"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Token",
      placeholder: "CODEGEN_API_TOKEN",
      description:
        "Codegen API token sent as a Bearer token. Generate it from the Codegen developer settings page: https://codegen.com/token.",
      extraFields: [
        {
          key: "organizationId",
          label: "Organization ID",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "123",
          description:
            "Numeric Codegen organization ID used for organization-scoped endpoints. Find it with your API token in Codegen developer settings: https://codegen.com/token.",
        },
      ],
    },
  ],
  homepageUrl: "https://codegen.com",
  actions: codegenActions,
};
