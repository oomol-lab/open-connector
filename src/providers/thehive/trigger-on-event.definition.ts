import type { TriggerKeySnapshot } from "../../triggers/common/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";

const resourceTypes = ["alert", "case"] as const;

export const snapshot: TriggerKeySnapshot & { readonly type: "poll" } = {
  key: "thehive.on_event",
  provider: "thehive",
  name: "on_event",
  displayName: "Alert or Case Event",
  description: "Polls TheHive for new or updated alerts or cases.",
  definitionVersion: 1,
  type: "poll",
  configInputs: [
    {
      handle: "resourceType",
      jsonSchema: { type: "string", enum: resourceTypes, title: "Resource Type" },
      nullable: false,
      value: "alert",
    },
  ],
  outputs: [
    { handle: "resourceType", jsonSchema: s.string(), nullable: false },
    { handle: "objectId", jsonSchema: s.string(), nullable: false },
    { handle: "body", jsonSchema: { type: "object" }, nullable: false },
  ],
};
