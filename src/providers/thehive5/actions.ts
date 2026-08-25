import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "thehive5";
const entityId = s.nonEmptyString("The TheHive entity ID or numeric case reference.");
const limit = s.integer("The maximum number of records to return, up to 100.", { minimum: 1, maximum: 100 });
const offset = s.integer("The zero-based result offset.", { minimum: 0 });
const alert = s.looseObject("A TheHive 5 alert.", {
  _id: s.string("The alert ID."),
  title: s.string("The alert title."),
  source: s.string("The alert source."),
  sourceRef: s.string("The source-specific alert reference."),
});
const caze = s.looseObject("A TheHive 5 case.", {
  _id: s.string("The case ID."),
  number: s.integer("The numeric case reference."),
  title: s.string("The case title."),
  description: s.string("The case description."),
});
const commonWriteFields = {
  severity: s.integer("The severity level from 1 through 4.", { minimum: 1, maximum: 4 }),
  tags: s.array("Tags assigned to the entity.", s.nonEmptyString("A tag.")),
  tlp: s.integer("The Traffic Light Protocol level from 0 through 4.", { minimum: 0, maximum: 4 }),
  pap: s.integer("The Permissible Actions Protocol level from 0 through 3.", { minimum: 0, maximum: 3 }),
};
const listMetadata = {
  offset: s.integer("The zero-based offset used for this result page."),
  limit: s.integer("The requested page size."),
  nextOffset: s.nullable(s.integer("The offset to request for the next page, or null when this page is incomplete.")),
};

export const theHive5Actions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "create_alert",
    description: "Create a JSON alert without file observables in a TheHive 5 instance.",
    inputSchema: s.object(
      "The input for creating a TheHive 5 alert.",
      {
        type: s.nonEmptyString("The alert type.", { maxLength: 32 }),
        source: s.nonEmptyString("The alert source.", { maxLength: 32 }),
        sourceRef: s.nonEmptyString("The unique reference within the alert source.", { maxLength: 128 }),
        title: s.nonEmptyString("The alert title.", { maxLength: 512 }),
        description: s.string("The alert description.", { maxLength: 1_048_576 }),
        externalLink: s.nonEmptyString("An external URL related to the alert.", { maxLength: 4096 }),
        date: s.integer("The alert timestamp in Unix milliseconds."),
        flag: s.boolean("Whether the alert is flagged."),
        summary: s.string("A concise alert summary.", { maxLength: 1_048_576 }),
        status: s.nonEmptyString("The alert status.", { maxLength: 64 }),
        assignee: s.nonEmptyString("The login of the assigned user.", { maxLength: 128 }),
        caseTemplate: s.nonEmptyString("The case template ID or name.", { maxLength: 128 }),
        customFields: s.looseObject("Custom field values keyed by custom field name."),
        ...commonWriteFields,
      },
      {
        optional: [
          "externalLink",
          "date",
          "flag",
          "summary",
          "status",
          "assignee",
          "caseTemplate",
          "customFields",
          "severity",
          "tags",
          "tlp",
          "pap",
        ],
      },
    ),
    outputSchema: s.object("The created TheHive 5 alert response.", { alert }),
  }),
  defineProviderAction(service, {
    name: "get_alert",
    description: "Retrieve one TheHive 5 alert by ID.",
    inputSchema: s.object("The input for retrieving a TheHive 5 alert.", { alertId: entityId }),
    outputSchema: s.object("The TheHive 5 alert response.", { alert }),
  }),
  defineProviderAction(service, {
    name: "list_alerts",
    description: "List alerts visible to the connected TheHive 5 user.",
    inputSchema: s.object(
      "The input for listing TheHive 5 alerts.",
      { limit, offset },
      { optional: ["limit", "offset"] },
    ),
    outputSchema: s.object("The TheHive 5 alert list response.", {
      alerts: s.array("Alerts returned by TheHive 5.", alert),
      ...listMetadata,
    }),
  }),
  defineProviderAction(service, {
    name: "create_case",
    description: "Create a case in a TheHive 5 instance.",
    inputSchema: s.object(
      "The input for creating a TheHive 5 case.",
      {
        title: s.nonEmptyString("The case title.", { maxLength: 512 }),
        description: s.string("The Markdown case description.", { maxLength: 1_048_576 }),
        startDate: s.integer("The case start timestamp in Unix milliseconds."),
        endDate: s.integer("The case end timestamp in Unix milliseconds."),
        flag: s.boolean("Whether the case is flagged."),
        status: s.nonEmptyString("The case status.", { maxLength: 64 }),
        summary: s.string("A concise case summary.", { maxLength: 1_048_576 }),
        assignee: s.nonEmptyString("The login of the assigned user.", { maxLength: 128 }),
        caseTemplate: s.nonEmptyString("The case template ID or name.", { maxLength: 128 }),
        customFields: s.looseObject("Custom field values keyed by custom field name."),
        ...commonWriteFields,
      },
      {
        optional: [
          "startDate",
          "endDate",
          "flag",
          "status",
          "summary",
          "assignee",
          "caseTemplate",
          "customFields",
          "severity",
          "tags",
          "tlp",
          "pap",
        ],
      },
    ),
    outputSchema: s.object("The created TheHive 5 case response.", { case: caze }),
  }),
  defineProviderAction(service, {
    name: "get_case",
    description: "Retrieve one TheHive 5 case by ID or numeric reference.",
    inputSchema: s.object("The input for retrieving a TheHive 5 case.", { caseId: entityId }),
    outputSchema: s.object("The TheHive 5 case response.", { case: caze }),
  }),
  defineProviderAction(service, {
    name: "list_cases",
    description: "List cases visible to the connected TheHive 5 user.",
    inputSchema: s.object(
      "The input for listing TheHive 5 cases.",
      { limit, offset },
      { optional: ["limit", "offset"] },
    ),
    outputSchema: s.object("The TheHive 5 case list response.", {
      cases: s.array("Cases returned by TheHive 5.", caze),
      ...listMetadata,
    }),
  }),
];
