import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "thehive";
const entityId = s.nonEmptyString("The TheHive entity ID or numeric case reference.");
const limit = s.integer("The maximum number of records to return, up to 100.", { minimum: 1, maximum: 100 });
const offset = s.integer("The zero-based result offset.", { minimum: 0 });
const alert = s.looseObject("A TheHive 4 alert.", {
  _id: s.string("The alert ID."),
  title: s.string("The alert title."),
  source: s.string("The alert source."),
  sourceRef: s.string("The source-specific alert reference."),
});
const caze = s.looseObject("A TheHive 4 case.", {
  _id: s.string("The case ID."),
  title: s.string("The case title."),
  description: s.string("The case description."),
});
const commonWriteFields = {
  severity: s.integer("The severity level from 1 through 3.", { minimum: 1, maximum: 3 }),
  tags: s.array("Tags assigned to the entity.", s.nonEmptyString("A tag.")),
  tlp: s.integer("The Traffic Light Protocol level from 0 through 3.", { minimum: 0, maximum: 3 }),
};
const listMetadata = {
  offset: s.integer("The zero-based offset used for this result page."),
  limit: s.integer("The requested page size."),
  nextOffset: s.nullable(s.integer("The offset to request for the next page, or null when this page is incomplete.")),
};

export const theHiveActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "create_alert",
    description: "Create a JSON alert in a TheHive 4 instance.",
    inputSchema: s.object(
      "The input for creating a TheHive 4 alert.",
      {
        type: s.nonEmptyString("The alert type.", { maxLength: 32 }),
        source: s.nonEmptyString("The alert source.", { maxLength: 32 }),
        sourceRef: s.nonEmptyString("The unique reference within the alert source.", { maxLength: 128 }),
        title: s.nonEmptyString("The alert title.", { maxLength: 512 }),
        description: s.string("The alert description."),
        date: s.integer("The alert timestamp in Unix milliseconds."),
        follow: s.boolean("Whether the connected user follows the alert."),
        ...commonWriteFields,
      },
      { optional: ["date", "follow", "severity", "tags", "tlp"] },
    ),
    outputSchema: s.object("The created TheHive 4 alert response.", { alert }),
  }),
  defineProviderAction(service, {
    name: "get_alert",
    description: "Retrieve one TheHive 4 alert by ID.",
    inputSchema: s.object("The input for retrieving a TheHive 4 alert.", { alertId: entityId }),
    outputSchema: s.object("The TheHive 4 alert response.", { alert }),
  }),
  defineProviderAction(service, {
    name: "list_alerts",
    description: "List alerts visible to the connected TheHive 4 user.",
    inputSchema: s.object(
      "The input for listing TheHive 4 alerts.",
      { limit, offset },
      { optional: ["limit", "offset"] },
    ),
    outputSchema: s.object("The TheHive 4 alert list response.", {
      alerts: s.array("Alerts returned by TheHive 4.", alert),
      ...listMetadata,
    }),
  }),
  defineProviderAction(service, {
    name: "create_case",
    description: "Create a case in a TheHive 4 instance.",
    inputSchema: s.object(
      "The input for creating a TheHive 4 case.",
      {
        title: s.nonEmptyString("The case title.", { maxLength: 512 }),
        description: s.string("The case description."),
        startDate: s.integer("The case start timestamp in Unix milliseconds."),
        owner: s.string("The login of the case owner."),
        flag: s.boolean("Whether the case is flagged."),
        ...commonWriteFields,
      },
      { optional: ["startDate", "owner", "flag", "severity", "tags", "tlp"] },
    ),
    outputSchema: s.object("The created TheHive 4 case response.", { case: caze }),
  }),
  defineProviderAction(service, {
    name: "get_case",
    description: "Retrieve one TheHive 4 case by ID or numeric reference.",
    inputSchema: s.object("The input for retrieving a TheHive 4 case.", { caseId: entityId }),
    outputSchema: s.object("The TheHive 4 case response.", { case: caze }),
  }),
  defineProviderAction(service, {
    name: "list_cases",
    description: "List cases visible to the connected TheHive 4 user.",
    inputSchema: s.object(
      "The input for listing TheHive 4 cases.",
      { limit, offset },
      { optional: ["limit", "offset"] },
    ),
    outputSchema: s.object("The TheHive 4 case list response.", {
      cases: s.array("Cases returned by TheHive 4.", caze),
      ...listMetadata,
    }),
  }),
];
