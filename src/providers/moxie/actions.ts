import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "moxie";

const clientSchema = s.looseObject("A client returned by Moxie.", {
  name: s.string("The client business name."),
  clientType: s.stringEnum("The client record type.", ["Client", "Prospect"]),
  archive: s.boolean("Whether the client is archived."),
  currency: s.string("The client's ISO 4217 currency code."),
});

const contactSchema = s.looseObject("A contact returned by Moxie.", {
  id: s.string("The contact ID."),
  clientId: s.string("The associated client ID."),
  firstName: s.string("The contact's first name."),
  lastName: s.string("The contact's last name."),
  email: s.string("The contact's email address."),
});

const projectSchema = s.looseObject("An active project returned by Moxie.", {
  id: s.string("The project ID."),
  clientId: s.string("The associated client ID."),
  name: s.string("The project name."),
  active: s.boolean("Whether the project is active."),
});

const pipelineStageSchema = s.looseObject("A sales pipeline stage returned by Moxie.", {
  id: s.string("The pipeline stage ID."),
  label: s.string("The pipeline stage label."),
  hexColor: s.string("The hexadecimal color assigned to the stage."),
  stageType: s.stringEnum("The pipeline stage type.", [
    "New",
    "InProgress",
    "OnHold",
    "ClosedWon",
    "ClosedLost",
    "Complete",
  ]),
});

const taskStageSchema = s.looseObject("A project task stage returned by Moxie.", {
  id: s.string("The task stage ID."),
  label: s.string("The task stage label."),
  hexColor: s.string("The hexadecimal color assigned to the stage."),
  complete: s.boolean("Whether tasks in this stage are complete."),
  clientApproval: s.boolean("Whether this stage requires client approval."),
});

const emptyInputSchema = s.object("Input for a Moxie list request.", {});

const requiredQueryInputSchema = s.object("Search text for a Moxie lookup.", {
  query: s.nonWhitespaceString("The text to search for."),
});

const optionalQueryInputSchema = s.object(
  "Optional search text for a Moxie lookup.",
  {
    query: s.nonWhitespaceString("The text to search for."),
  },
  { optional: ["query"] },
);

export const moxieActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_clients",
    description: "List all clients in the connected Moxie workspace.",
    requiredScopes: [],
    inputSchema: emptyInputSchema,
    outputSchema: s.object("The Moxie client list.", {
      clients: s.array("Clients returned by Moxie.", clientSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "search_clients",
    description: "Search Moxie clients by client name or contact information.",
    requiredScopes: [],
    inputSchema: requiredQueryInputSchema,
    outputSchema: s.object("The matching Moxie clients.", {
      clients: s.array("Clients matching the search text.", clientSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "search_contacts",
    description: "Search Moxie contacts by first name, last name, or email address.",
    requiredScopes: [],
    inputSchema: optionalQueryInputSchema,
    outputSchema: s.object("The matching Moxie contacts.", {
      contacts: s.array("Contacts matching the search text.", contactSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "search_projects",
    description: "Search active Moxie projects, optionally filtering by client name.",
    requiredScopes: [],
    inputSchema: optionalQueryInputSchema,
    outputSchema: s.object("The matching active Moxie projects.", {
      projects: s.array("Active projects matching the client filter.", projectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_pipeline_stages",
    description: "List sales pipeline stages configured in the Moxie workspace.",
    requiredScopes: [],
    inputSchema: emptyInputSchema,
    outputSchema: s.object("The Moxie sales pipeline stages.", {
      stages: s.array("Sales pipeline stages returned by Moxie.", pipelineStageSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_task_stages",
    description: "List project task stages configured in the Moxie workspace.",
    requiredScopes: [],
    inputSchema: emptyInputSchema,
    outputSchema: s.object("The Moxie project task stages.", {
      stages: s.array("Project task stages returned by Moxie.", taskStageSchema),
    }),
  }),
];
