import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "lever";

const rawObjectSchema = s.looseObject("The raw object returned by Lever.");
const idSchema = s.nonEmptyString("The Lever object ID.");
const cursorSchema = s.nonEmptyString("The pagination cursor returned by Lever.");
const limitSchema = s.integer("The maximum number of records to return.", {
  minimum: 1,
  maximum: 100,
});
const timestampSchema = s.integer("A Unix timestamp in milliseconds.");

const pageSchema = s.object("Pagination metadata returned by Lever.", {
  hasNext: s.boolean("Whether Lever indicates that another page is available."),
  next: s.nullable(s.string("The cursor to use for the next page when available.")),
});

const postingStateSchema = s.stringEnum("The Lever posting state.", ["published", "internal", "closed", "draft"]);
const opportunityExpandSchema = s.array(
  "Related opportunity objects to expand in Lever's response.",
  s.stringEnum("One supported Lever opportunity expansion.", [
    "applications",
    "stage",
    "contact",
    "comments",
    "tasks",
    "notes",
    "phones",
    "emails",
  ]),
  { minItems: 1 },
);

const listPostingsInputSchema = s.object(
  "Input payload for listing Lever postings.",
  {
    offset: cursorSchema,
    limit: limitSchema,
    state: postingStateSchema,
    team: s.nonEmptyString("Only return postings assigned to this team."),
    location: s.nonEmptyString("Only return postings for this location."),
    department: s.nonEmptyString("Only return postings assigned to this department."),
    owner: s.nonEmptyString("Only return postings owned by this Lever user ID."),
    tag: s.nonEmptyString("Only return postings with this posting tag."),
  },
  { optional: ["offset", "limit", "state", "team", "location", "department", "owner", "tag"] },
);

const listOpportunitiesInputSchema = s.object(
  "Input payload for listing Lever opportunities.",
  {
    offset: cursorSchema,
    limit: limitSchema,
    createdAtStart: timestampSchema,
    createdAtEnd: timestampSchema,
    updatedAtStart: timestampSchema,
    updatedAtEnd: timestampSchema,
    stageId: s.nonEmptyString("Only return opportunities currently in this stage ID."),
    postingId: s.nonEmptyString("Only return opportunities associated with this posting ID."),
    archiveReasonId: s.nonEmptyString("Only return archived opportunities with this archive reason ID."),
    contact: s.nonEmptyString("Only return opportunities for this contact ID."),
    expand: opportunityExpandSchema,
  },
  {
    optional: [
      "offset",
      "limit",
      "createdAtStart",
      "createdAtEnd",
      "updatedAtStart",
      "updatedAtEnd",
      "stageId",
      "postingId",
      "archiveReasonId",
      "contact",
      "expand",
    ],
  },
);

const opportunityIdInputSchema = s.object("Input payload containing a Lever opportunity ID.", {
  opportunityId: idSchema,
});

const listNotesInputSchema = s.object(
  "Input payload for listing notes on a Lever opportunity.",
  {
    opportunityId: idSchema,
    offset: cursorSchema,
    limit: limitSchema,
  },
  { optional: ["offset", "limit"] },
);

const createNoteInputSchema = s.object("Input payload for creating a note on a Lever opportunity.", {
  opportunityId: idSchema,
  value: s.nonEmptyString("The note text to add to the opportunity."),
});

export const leverActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_postings",
    description: "List Lever job postings with optional state, owner, location, and team filters.",
    requiredScopes: [],
    inputSchema: listPostingsInputSchema,
    outputSchema: s.object("Lever posting list response.", {
      page: pageSchema,
      postings: s.array("Postings returned by Lever.", rawObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_posting",
    description: "Retrieve one Lever posting by ID.",
    requiredScopes: [],
    inputSchema: s.object("Input payload for retrieving a Lever posting.", {
      postingId: idSchema,
    }),
    outputSchema: s.object("Lever posting response.", {
      posting: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_opportunities",
    description:
      "List Lever opportunities with optional timestamp, posting, stage, archive, contact, and expansion filters.",
    requiredScopes: [],
    inputSchema: listOpportunitiesInputSchema,
    outputSchema: s.object("Lever opportunity list response.", {
      page: pageSchema,
      opportunities: s.array("Opportunities returned by Lever.", rawObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_opportunity",
    description: "Retrieve one Lever opportunity by ID.",
    requiredScopes: [],
    inputSchema: opportunityIdInputSchema,
    outputSchema: s.object("Lever opportunity response.", {
      opportunity: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_opportunity_notes",
    description: "List notes attached to a Lever opportunity.",
    requiredScopes: [],
    inputSchema: listNotesInputSchema,
    outputSchema: s.object("Lever opportunity note list response.", {
      page: pageSchema,
      notes: s.array("Notes returned by Lever.", rawObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "create_opportunity_note",
    description: "Create a note on a Lever opportunity.",
    requiredScopes: [],
    inputSchema: createNoteInputSchema,
    outputSchema: s.object("Lever opportunity note creation response.", {
      note: rawObjectSchema,
    }),
  }),
];
