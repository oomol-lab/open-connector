import type { ProviderDefinition } from "../../core/types.ts";

import actions from "./actions.ts";
export const provider: ProviderDefinition = {
  service: "ilovepdf",
  displayName: "iLovePDF",
  description: "PDF processing, OCR, text extraction, password protection, and PDF/A validation",
  homepageUrl: "https://www.ilovepdf.com/",
  categories: ["Productivity", "Design & Media"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Secret Key",
      description:
        "Project secret key used to sign API requests. Find both project keys at https://www.iloveapi.com/user/projects.",
      extraFields: [
        {
          key: "publicKey",
          label: "Public Key",
          inputType: "text",
          required: true,
          secret: true,
          description:
            "Public key of the same iLovePDF API project. Copy it from https://www.iloveapi.com/user/projects.",
        },
      ],
    },
  ],
  actions,
};
