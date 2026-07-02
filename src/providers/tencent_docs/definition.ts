import type { ProviderDefinition } from "../../core/types.ts";

import { tencentDocsActions, tencentDocsProviderScopes } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "tencent_docs",
  displayName: "Tencent Docs",
  categories: ["Productivity", "Storage"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://docs.qq.com/oauth/v2/authorize",
      tokenUrl: "https://docs.qq.com/oauth/v2/token",
      scopes: [
        tencentDocsProviderScopes.userInfoBase,
        tencentDocsProviderScopes.driveCreatable,
        tencentDocsProviderScopes.driveEditable,
        tencentDocsProviderScopes.driveFileMetadata,
        tencentDocsProviderScopes.driveFileMetadataReadonly,
        tencentDocsProviderScopes.driveReadonly,
        tencentDocsProviderScopes.driveExportable,
        tencentDocsProviderScopes.doc,
        tencentDocsProviderScopes.sheet,
        tencentDocsProviderScopes.smartsheetReadonly,
        tencentDocsProviderScopes.form,
      ],
      tokenEndpointAuthMethod: "client_secret_post",
      authorizationParams: {
        scope: "all",
      },
    },
  ],
  homepageUrl: "https://docs.qq.com",
  actions: tencentDocsActions,
};
