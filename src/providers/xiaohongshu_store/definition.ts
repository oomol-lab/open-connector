import type { ProviderDefinition } from "../../core/types.ts";

import { xiaohongshuStoreActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "xiaohongshu_store",
  displayName: "Xiaohongshu Store",
  description: "Manage orders, after-sales, items, and logistics through the Xiaohongshu ARK e-commerce Open API.",
  categories: ["E-commerce"],
  authTypes: ["custom_credential"],
  auth: [
    {
      type: "custom_credential",
      fields: [
        {
          key: "appId",
          label: "App ID",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "Paste your ARK app ID",
          description:
            "The app ID (app-key) of a Xiaohongshu ARK open-platform app. Find it in the ARK console: https://ark.xiaohongshu.com/",
        },
        {
          key: "appSecret",
          label: "App Secret",
          inputType: "password",
          required: true,
          secret: true,
          placeholder: "Paste your ARK app secret",
          description: "The app secret of the same ARK app, used to sign every request.",
        },
        {
          key: "accessToken",
          label: "Access Token",
          inputType: "password",
          required: true,
          secret: true,
          placeholder: "Paste the shop access token",
          description:
            "The shop access token issued through the ARK OAuth flow or copied from the ARK console for self-developed merchant apps. Every business API requires it. Access tokens expire after 7 days; refresh with the refresh_token action or re-copy from the console.",
        },
        {
          key: "refreshToken",
          label: "Refresh Token",
          inputType: "password",
          required: false,
          secret: true,
          placeholder: "Paste the refresh token",
          description:
            "The refresh token issued together with the access token. It expires after 14 days and enables the refresh_token action; once it expires, the app must be re-authorized.",
        },
      ],
    },
  ],
  homepageUrl: "https://ark.xiaohongshu.com/",
  actions: xiaohongshuStoreActions,
};
