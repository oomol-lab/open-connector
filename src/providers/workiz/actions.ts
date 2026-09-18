import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "workiz";
const listInput = s.object(
  "Filters for listing Workiz jobs or leads.",
  {
    startDate: s.date("Return records from this date through today."),
    offset: s.nonNegativeInteger("The zero-based record offset."),
    records: s.integer("The maximum number of records to return.", { minimum: 1, maximum: 100 }),
    onlyOpen: s.boolean("Whether to exclude completed and canceled records."),
    statuses: s.array("The Workiz statuses to include.", s.string("One Workiz status."), { minItems: 1 }),
  },
  { optional: ["startDate", "offset", "records", "onlyOpen", "statuses"] },
);
const identifier = (resource: string) =>
  s.object(`The Workiz ${resource} identifier.`, { uuid: s.nonEmptyString(`The unique Workiz ${resource} UUID.`) });
const record = (description: string) => s.looseObject(description);

export const workizActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_jobs",
    operationType: "read",
    description: "List Workiz jobs with date, offset, open-state, and status filters.",
    requiredScopes: [],
    inputSchema: listInput,
    outputSchema: s.object("The Workiz jobs response.", {
      jobs: s.array("The jobs returned by Workiz.", record("One Workiz job record.")),
    }),
  }),
  defineProviderAction(service, {
    name: "get_job",
    operationType: "read",
    description: "Get one Workiz job by its unique identifier.",
    requiredScopes: [],
    inputSchema: identifier("job"),
    outputSchema: s.object("The Workiz job response.", { job: record("The Workiz job record.") }),
  }),
  defineProviderAction(service, {
    name: "list_leads",
    operationType: "read",
    description: "List Workiz leads with date, offset, open-state, and status filters.",
    requiredScopes: [],
    inputSchema: listInput,
    outputSchema: s.object("The Workiz leads response.", {
      leads: s.array("The leads returned by Workiz.", record("One Workiz lead record.")),
    }),
  }),
  defineProviderAction(service, {
    name: "get_lead",
    operationType: "read",
    description: "Get one Workiz lead by its unique identifier.",
    requiredScopes: [],
    inputSchema: identifier("lead"),
    outputSchema: s.object("The Workiz lead response.", { lead: record("The Workiz lead record.") }),
  }),
  defineProviderAction(service, {
    name: "list_team_members",
    operationType: "read",
    description: "List active team members in the connected Workiz account.",
    requiredScopes: [],
    inputSchema: s.object("No input is required to list Workiz team members.", {}),
    outputSchema: s.object("The Workiz team response.", {
      teamMembers: s.array("The active team members returned by Workiz.", record("One Workiz team member record.")),
    }),
  }),
];
