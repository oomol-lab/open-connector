import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "super_saas";

const scheduleIdSchema = s.integer("The SuperSaaS schedule ID.", { minimum: 1 });
const timeFilterSchema = s.nonEmptyString("A SuperSaaS date or timestamp in YYYY-MM-DD or YYYY-MM-DD HH:MM:SS format.");
const positiveLimitSchema = s.integer("The maximum number of records to return.", { minimum: 1 });
const offsetSchema = s.integer("The result offset used for pagination.", { minimum: 0 });
const userFilterSchema = s.nonEmptyString("A SuperSaaS user name, user ID, or foreign key used to filter bookings.");
const tupleSchema = s.array(
  "A SuperSaaS tuple such as [id, name].",
  s.unknown("One tuple value returned by SuperSaaS."),
  {
    minItems: 1,
  },
);
const bookingSchema = s.looseObject(
  "A raw SuperSaaS booking, change, or slot object. Custom account fields are preserved.",
);
const emptyInputSchema = s.object("This action does not require any input.", {});

const scheduleInputSchema = s.object("Input parameters for one SuperSaaS schedule.", {
  schedule_id: scheduleIdSchema,
});
const bookingListInputSchema = s.object(
  "Input parameters for listing SuperSaaS bookings.",
  {
    schedule_id: scheduleIdSchema,
    from: timeFilterSchema,
    to: timeFilterSchema,
    today: s.boolean("Whether SuperSaaS should use the current local day as the range."),
    limit: positiveLimitSchema,
    offset: offsetSchema,
    user: userFilterSchema,
    slot: s.boolean("Whether to include capacity schedule slot information."),
  },
  { optional: ["from", "to", "today", "limit", "offset", "user", "slot"] },
);
const bookingListOutputSchema = s.object("The bookings returned by SuperSaaS.", {
  bookings: s.array("SuperSaaS bookings in the requested range.", bookingSchema),
  slots: s.array("SuperSaaS slots in the requested range.", bookingSchema),
  raw: s.looseObject("The raw SuperSaaS response."),
});

export const superSaasActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_schedules",
    operationType: "read",
    description: "List schedules in the connected SuperSaaS account.",
    inputSchema: emptyInputSchema,
    outputSchema: s.object("The schedules returned by SuperSaaS.", {
      schedules: s.array("SuperSaaS schedule tuples.", tupleSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_super_forms",
    operationType: "read",
    description: "List SuperForms in the connected SuperSaaS account.",
    inputSchema: emptyInputSchema,
    outputSchema: s.object("The SuperForms returned by SuperSaaS.", {
      superForms: s.array("SuperSaaS SuperForm tuples.", tupleSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_groups",
    operationType: "read",
    description: "List groups in the connected SuperSaaS account.",
    inputSchema: emptyInputSchema,
    outputSchema: s.object("The groups returned by SuperSaaS.", {
      groups: s.array("SuperSaaS group tuples.", tupleSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_resources",
    operationType: "read",
    description: "List resources or services for one SuperSaaS schedule.",
    inputSchema: scheduleInputSchema,
    outputSchema: s.object("The resources or services returned by SuperSaaS.", {
      resources: s.array("SuperSaaS resource or service tuples.", tupleSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_field_names",
    operationType: "read",
    description: "List available SuperSaaS fields for a schedule or for the user object.",
    inputSchema: s.object(
      "Input parameters for listing SuperSaaS field names.",
      {
        schedule_id: scheduleIdSchema,
      },
      { optional: ["schedule_id"] },
    ),
    outputSchema: s.object("The field list returned by SuperSaaS.", {
      fields: s.looseObject("The raw SuperSaaS field list response."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_recent_changes",
    operationType: "read",
    description: "List recently changed bookings for one SuperSaaS schedule.",
    inputSchema: bookingListInputSchema,
    outputSchema: bookingListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_appointments",
    operationType: "read",
    description: "List appointments or slots for one SuperSaaS schedule in a time range.",
    inputSchema: bookingListInputSchema,
    outputSchema: bookingListOutputSchema,
  }),
];
