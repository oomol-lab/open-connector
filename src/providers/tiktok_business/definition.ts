import type { ProviderDefinition } from "../../core/types.ts";

import { tiktokBusinessActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "tiktok_business",
  displayName: "TikTok Business",
  categories: ["Marketing", "Data"],
  authTypes: ["oauth2", "api_key"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://business-api.tiktok.com/portal/auth",
      tokenUrl: "https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/",
      refreshTokenUrl: "https://business-api.tiktok.com/open_api/v1.3/tt_user/oauth2/refresh_token/",
      scopes: [],
      tokenEndpointAuthMethod: "client_secret_post",
      tokenRequestFormat: "json",
      authorizationParams: {},
      authorizationRequestFields: {
        clientId: "app_id",
        responseType: false,
        scope: false,
      },
      tokenRequestFields: {
        code: "auth_code",
        clientId: "app_id",
        clientSecret: "secret",
        authorizationCode: {
          grantType: false,
        },
      },
      tokenResponseEnvelope: {
        dataField: "data",
        codeField: "code",
        successCode: 0,
        messageField: "message",
      },
      clientConfigFields: [
        {
          key: "permissionScopeGuide",
          label: "TikTok Permission Scope Checklist",
          inputType: "textarea",
          required: false,
          secret: false,
          defaultValue:
            "In the TikTok app Permission Scope page, select Required: 广告账号管理, 广告管理, 数据报表. Recommended: Onsite Commerce Store.",
          description:
            "A local checklist for the TikTok app Permission Scope page. It is not sent to TikTok during OAuth.",
        },
      ],
    },
    {
      type: "api_key",
      label: "Access Token",
      placeholder: "tiktok_business_access_token",
      description:
        "TikTok Business access token sent with the Access-Token header. The token needs advertiser.read, Ad management, Data reports, and GMV Max related permissions for the selected actions.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://business.tiktok.com",
  actions: tiktokBusinessActions,
};
