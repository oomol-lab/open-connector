import type { ProviderDefinition } from "../../core/types.ts";

import { myMindActions } from "./actions.ts";

const service = "mymind";

const sessionCredentialHelp =
  "mymind has no public API and issues no API keys, so a connection reuses the session your browser already holds. Sign in at https://access.mymind.com, open the browser developer tools, and read the values from any request the app makes.";

/**
 * mymind provider backed by the endpoints the mymind web app uses.
 *
 * mymind publishes no API, so a connection carries the browser session values
 * instead of an issued credential, and the endpoints may change without notice.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "mymind",
  description:
    "Search, read, and add to the cards saved in a mymind account, including notes, bookmarks, tags, and spaces.",
  categories: ["Productivity"],
  authTypes: ["custom_credential"],
  auth: [
    {
      type: "custom_credential",
      fields: [
        {
          key: "jwt",
          label: "Session JWT",
          inputType: "password",
          required: true,
          secret: true,
          placeholder: "MYMIND_JWT",
          description: `The value of the _jwt cookie. ${sessionCredentialHelp}`,
        },
        {
          key: "cid",
          label: "Client ID",
          inputType: "password",
          required: true,
          secret: true,
          placeholder: "MYMIND_CID",
          description: `The value of the _cid cookie sent alongside the session JWT. ${sessionCredentialHelp}`,
        },
        {
          key: "authenticityToken",
          label: "Authenticity Token",
          inputType: "password",
          required: true,
          secret: true,
          placeholder: "MYMIND_AUTHENTICITY_TOKEN",
          description: `The value of the x-authenticity-token request header, which mymind requires on every request. ${sessionCredentialHelp}`,
        },
      ],
      testAction: {
        actionName: "list_tags",
        input: { limit: 1 },
      },
    },
  ],
  homepageUrl: "https://mymind.com",
  actions: myMindActions,
};
