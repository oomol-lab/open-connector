import type { ProviderDefinition } from "../../core/types.ts";

import { zohoMailActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "zoho_mail",
  displayName: "Zoho Mail",
  description: "Search and read email, send replies, and organize your Zoho mailbox.",
  homepageUrl: "https://www.zoho.com/mail/",
  categories: ["Communication", "Productivity"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://accounts.zoho.com/oauth/v2/auth",
      tokenUrl: "https://accounts.zoho.com/oauth/v2/token",
      scopes: [
        "ZohoMail.accounts.READ",
        "ZohoMail.folders.READ",
        "ZohoMail.messages.READ",
        "ZohoMail.messages.CREATE",
        "ZohoMail.messages.UPDATE",
      ],
      requiredScopes: ["ZohoMail.accounts.READ"],
      scopeSeparator: ",",
      tokenEndpointAuthMethod: "client_secret_post",
      authorizationParams: { access_type: "offline", prompt: "consent" },
      clientConfigFields: [
        {
          key: "dataCenter",
          label: "Data center",
          inputType: "text",
          required: false,
          secret: false,
          defaultValue: "zoho.com",
          description:
            "Zoho account domain: zoho.com, zoho.eu, zoho.in, zoho.com.au, zoho.jp, zohocloud.ca, zoho.com.cn, zoho.ae, or zoho.sa.",
        },
      ],
      clientSetup: {
        docsUrl: "https://www.zoho.com/developer/oauth/multi-dc-support.html",
        steps: [
          "Register a Server-based Application in the Zoho API Console.",
          "Add the callback URL shown by OOMOL Connect.",
          "For accounts in other regions, enable Multi DC and use the same OAuth credentials for all enabled data centers.",
          "Enter the client ID, client secret, and account data center here.",
        ],
      },
    },
  ],
  actions: zohoMailActions,
};
