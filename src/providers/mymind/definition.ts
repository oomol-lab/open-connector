import type { ProviderDefinition } from "../../core/types.ts";

import { myMindActions } from "./actions.ts";

const service = "mymind";

/**
 * mymind provider backed by the official mymind API.
 *
 * Requests are authenticated with a short-lived JWT signed per request from the
 * account's access key, so a connection stores the key rather than a token.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "mymind",
  description:
    "Search, read, and add to the objects saved in a mymind account, including notes, bookmarks, files, tags, spaces, and links.",
  categories: ["Productivity"],
  authTypes: ["custom_credential"],
  auth: [
    {
      type: "custom_credential",
      fields: [
        {
          key: "keyId",
          label: "Access Key ID",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "MYMIND_ACCESS_KEY_ID",
          description:
            "The access key identifier, sent as the kid header of every signed request. Create an access key on the Extensions page at https://access.mymind.com/extensions; the identifier and its secret are shown together once, at creation.",
        },
        {
          key: "keySecret",
          label: "Access Key Secret",
          inputType: "password",
          required: true,
          secret: true,
          placeholder: "MYMIND_ACCESS_KEY_SECRET",
          description:
            "The base64 secret shown beside that identifier. It signs each request locally and is never sent to mymind.",
        },
      ],
      testAction: {
        actionName: "list_tags",
        input: {},
      },
    },
  ],
  homepageUrl: "https://mymind.com",
  actions: myMindActions,
};
