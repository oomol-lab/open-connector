import type { ProviderDefinition } from "../../core/types.ts";

import { smarthrActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "smarthr",
  displayName: "SmartHR",
  categories: ["Productivity"],
  homepageUrl: "https://smarthr.jp/",
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Access Token",
      placeholder: "SmartHR access token",
      description:
        "Ask an administrator to create an access token under Common settings > External system integration > Access tokens. Enable company read access for connection validation and the resource and employee-field permissions needed by your actions: https://support.smarthr.jp/ja/help/articles/360026266033/",
      extraFields: [
        {
          key: "subdomain",
          inputType: "text",
          secret: false,
          label: "Company Subdomain",
          placeholder: "acme",
          description:
            "Enter acme for https://acme.smarthr.jp. Enter only the subdomain: https://developer.smarthr.jp/api/about_api",
          required: true,
        },
        {
          key: "environment",
          inputType: "text",
          secret: false,
          label: "Environment",
          placeholder: "production",
          description:
            "Use production (default), or sandbox for an official daruma.space test tenant: https://developer.smarthr.jp/api/about_sandbox",
          required: false,
        },
      ],
    },
  ],
  actions: smarthrActions,
};
