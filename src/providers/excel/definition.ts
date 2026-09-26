import type { ProviderDefinition } from "../../core/types.ts";

import { excelActions, excelProviderScopes } from "./actions.ts";

const service = "excel";

export const provider: ProviderDefinition = {
  service,
  displayName: "Excel",
  categories: ["Productivity", "Data"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize",
      tokenUrl: "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token",
      scopes: [excelProviderScopes.userRead, excelProviderScopes.filesReadWrite, excelProviderScopes.offlineAccess],
      tokenEndpointAuthMethod: "none",
      pkce: {
        method: "S256",
      },
      authorizationParams: {
        response_mode: "query",
      },
      clientConfigFields: [
        {
          key: "tenant",
          label: "Tenant",
          inputType: "text",
          required: true,
          secret: false,
          defaultValue: "common",
          placeholder: "common",
          description:
            "The Microsoft identity platform tenant segment to use, such as common, organizations, consumers, or a specific tenant ID.",
        },
      ],
    },
  ],
  homepageUrl: "https://www.microsoft.com/microsoft-365/excel",
  actions: excelActions,
};
