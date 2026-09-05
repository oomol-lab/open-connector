import type { ProviderDefinition } from "../../core/types.ts";

import { appStoreConnectActions } from "./actions.ts";

const service = "app_store_connect";

export const provider: ProviderDefinition = {
  service,
  displayName: "App Store Connect",
  description:
    "Browse apps and App Store versions, run TestFlight distribution, answer App Store reviews, and read team members through Apple's App Store Connect API.",
  categories: ["Developer Tools", "Productivity"],
  authTypes: ["custom_credential"],
  auth: [
    {
      type: "custom_credential",
      fields: [
        {
          key: "keyId",
          label: "Key ID",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "2X9R4HXF34",
          description:
            "The key identifier shown next to the API key in App Store Connect under Users and Access > Integrations > App Store Connect API (Team Keys), or on your user profile for an Individual API Key.",
        },
        {
          key: "issuerId",
          label: "Issuer ID",
          inputType: "text",
          required: false,
          secret: false,
          placeholder: "57246542-96fe-1a63-e053-0824d011072a",
          description:
            "The issuer ID printed above the team key list in App Store Connect. Required for team keys. Leave it empty for an Individual API Key, which is authenticated by the key alone.",
        },
        {
          key: "privateKey",
          label: "Private Key (.p8)",
          inputType: "textarea",
          required: true,
          secret: true,
          placeholder: "-----BEGIN PRIVATE KEY-----",
          description:
            "The full contents of the AuthKey_<KEYID>.p8 file downloaded when the key was created, a PKCS#8 PEM holding an EC P-256 key. Apple offers the download only once. Escaped \\n line breaks are accepted.",
        },
      ],
    },
  ],
  homepageUrl: "https://appstoreconnect.apple.com/",
  actions: appStoreConnectActions,
};
