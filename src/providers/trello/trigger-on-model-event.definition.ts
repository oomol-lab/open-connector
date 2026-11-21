import type { TriggerKeySnapshot } from "../../triggers/common/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";

const actionTypes = [
  "createCard",
  "updateCard",
  "deleteCard",
  "commentCard",
  "addAttachmentToCard",
  "addMemberToCard",
  "removeMemberFromCard",
  "addLabelToCard",
  "removeLabelFromCard",
  "createList",
  "updateList",
  "createCheckItem",
  "updateCheckItemStateOnCard",
] as const;

export const snapshot: TriggerKeySnapshot & { readonly type: "integration" } = {
  key: "trello.on_model_event",
  provider: "trello",
  name: "on_model_event",
  displayName: "Board or Card Event",
  description: "Triggers when actions occur on a Trello board, list, or card.",
  definitionVersion: 1,
  type: "integration",
  endpoint: {
    methods: ["HEAD", "POST"],
    body: { formats: ["json"], allowArray: false, allowEmpty: true },
    successStatus: 200,
  },
  configInputs: [
    { handle: "modelId", jsonSchema: s.string({ minLength: 1 }), nullable: false },
    {
      handle: "actionTypes",
      jsonSchema: s.array(s.stringEnum(actionTypes), { uniqueItems: true }),
      nullable: true,
    },
  ],
  outputs: [
    { handle: "actionType", jsonSchema: s.string(), nullable: false },
    { handle: "deliveryId", jsonSchema: s.string(), nullable: false },
    { handle: "modelId", jsonSchema: s.string(), nullable: false },
    { handle: "body", jsonSchema: { type: "object" }, nullable: false },
  ],
};
