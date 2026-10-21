import type { TriggerKeySnapshot } from "../../triggers/common/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
export const events = ["deployment.ready", "deployment.error"] as const;
export const snapshot: TriggerKeySnapshot & { readonly type: "integration" } = {
  key: "vercel.on_deployment_event",
  provider: "vercel",
  name: "on_deployment_event",
  displayName: "Deployment Ready or Failed",
  description: "Receives successful and failed deployments for a Vercel project.",
  definitionVersion: 2,
  type: "integration",
  endpoint: {
    methods: ["POST"],
    body: { formats: ["json"], allowArray: false, allowEmpty: false },
    successStatus: 200,
  },
  configInputs: [
    {
      handle: "teamId",
      jsonSchema: { type: "string", minLength: 1, maxLength: 256, title: "Team ID" },
      nullable: false,
    },
    {
      handle: "projectId",
      jsonSchema: { type: "string", minLength: 1, maxLength: 256, title: "Project ID" },
      nullable: false,
    },
    {
      handle: "environment",
      jsonSchema: { type: "string", enum: ["all", "production", "preview"], title: "Environment" },
      nullable: false,
      value: "all",
    },
  ],
  outputs: [
    { handle: "event", jsonSchema: { type: "string", enum: events }, nullable: false },
    { handle: "deliveryId", jsonSchema: s.string(), nullable: false },
    { handle: "deploymentId", jsonSchema: s.string(), nullable: false },
    { handle: "projectId", jsonSchema: s.string(), nullable: false },
    { handle: "body", jsonSchema: { type: "object" }, nullable: false },
  ],
};
