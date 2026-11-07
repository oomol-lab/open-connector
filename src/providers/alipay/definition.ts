import type { ProviderDefinition } from "../../core/types.ts";

import { alipayActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "alipay",
  displayName: "Alipay",
  description: "Alipay payment links, transaction queries, and refunds",
  categories: ["Finance"],
  authTypes: ["custom_credential"],
  auth: [
    {
      type: "custom_credential",
      fields: [
        {
          key: "appId",
          label: "App ID",
          required: true,
          secret: false,
          description:
            "Open https://aipay.alipay.com and select One-stop Integration > VibePay > Web Application. Copy AIPAY_APP_ID for the environment you want to connect.",
          inputType: "text",
        },
        {
          key: "privateKey",
          label: "Application Private Key",
          required: true,
          secret: true,
          inputType: "textarea",
          description:
            "Open https://aipay.alipay.com and select One-stop Integration > VibePay > Web Application. Use AIPAY_PRIVATE_PKCS_KEY (non-Java private key) or AIPAY_PRIVATE_KEY for the selected environment; it is used locally for RSA2 signing.",
        },
        {
          key: "alipayPublicKey",
          label: "Alipay Public Key",
          required: true,
          secret: false,
          inputType: "textarea",
          description:
            "Open https://aipay.alipay.com and select One-stop Integration > VibePay > Web Application. Copy AIPAY_ALIPAY_PUBLIC_KEY for response verification; AIPAY_PUBLIC_KEY is the application public key and does not belong in this field.",
        },
        {
          key: "environment",
          label: "Environment",
          required: false,
          secret: false,
          placeholder: "prod",
          description:
            "Use prod (default) for production or sandbox for testing, with credentials from the same environment. Open https://aipay.alipay.com > One-stop Integration > VibePay > Web Application to find the setup and sandbox testing steps.",
          inputType: "text",
        },
        {
          key: "appAuthToken",
          label: "App Authorization Token",
          required: false,
          secret: true,
          description:
            "For service providers acting for an authorized merchant. Leave empty for your own app. Included in generated checkout URLs.",
          inputType: "password",
        },
      ],
    },
  ],
  homepageUrl: "https://www.alipay.com/",
  actions: alipayActions,
};
