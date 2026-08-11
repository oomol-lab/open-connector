import type { ProviderDefinition } from "../../core/types.ts";

import { totpActions } from "./actions.ts";

const service = "totp";

/**
 * Local TOTP authenticator backed by custom-credential storage.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "TOTP Authenticator",
  description: "Store a website account and generate its current time-based one-time password locally.",
  categories: ["Security"],
  authTypes: ["custom_credential"],
  auth: [
    {
      type: "custom_credential",
      fields: [
        {
          key: "website",
          label: "Website URL",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "https://example.com",
          description: "The HTTP or HTTPS website associated with this authenticator account.",
        },
        {
          key: "username",
          label: "Username",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "user@example.com",
          description: "The username associated with this authenticator account.",
        },
        {
          key: "secret",
          label: "TOTP Secret",
          inputType: "password",
          required: true,
          secret: true,
          placeholder: "JBSWY3DPEHPK3PXP",
          description: "The Base32-encoded TOTP secret. It is stored as a secret and never returned by actions.",
        },
      ],
      testAction: {
        actionName: "generate_code",
        input: {},
      },
    },
  ],
  actions: totpActions,
};
