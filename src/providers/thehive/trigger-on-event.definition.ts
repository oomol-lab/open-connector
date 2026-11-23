import type { TriggerKeySnapshot } from "../../triggers/common/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";

const resourceTypes = ["alert", "case"] as const;

const eventSchema = s.object(
  {
    change: s.stringEnum(["created", "updated"], { description: "Whether the resource was created or updated." }),
    resourceType: s.string(),
    objectId: s.string(),
    body: { type: "object" },
  },
  { required: ["resourceType", "change", "objectId", "body"], additionalProperties: false },
);

export const snapshot: TriggerKeySnapshot & { readonly type: "poll" } = {
  key: "thehive.on_event",
  provider: "thehive",
  name: "on_event",
  displayName: "Alert or Case Event",
  description: "Polls TheHive for new or updated alerts or cases.",
  definitionVersion: 2,
  type: "poll",
  configInputs: [
    {
      handle: "resourceType",
      jsonSchema: { type: "string", enum: resourceTypes, title: "Resource Type" },
      nullable: false,
      value: "alert",
    },
  ],
  outputs: [{ handle: "events", jsonSchema: s.array(eventSchema), nullable: false }],
};
