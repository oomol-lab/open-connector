import type { ProviderDefinition } from "../../core/types.ts";

import { railwayActions } from "./actions.ts";

const service = "railway";

export const provider: ProviderDefinition = {
  service,
  displayName: "Railway",
  description: "Inspect Railway projects and services, manage deployments, read logs, and update variables.",
  categories: ["Developer Tools", "Infrastructure"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Account or Workspace Token",
      placeholder: "Enter your Railway token",
      description:
        "A Railway account or workspace token sent as a Bearer token. Create one at https://railway.com/account/tokens. Project tokens use a different authentication header and are not supported by this credential type.",
      extraFields: [
        {
          key: "workspaceId",
          label: "Workspace ID",
          inputType: "text",
          required: false,
          secret: false,
          placeholder: "Optional Railway workspace ID",
          description: "Required when using a workspace-scoped token. Leave blank for an account token.",
        },
      ],
    },
  ],
  homepageUrl: "https://railway.com",
  actions: railwayActions,
};
