import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "breezy_hr";

const idSchema = s.nonEmptyString("The Breezy HR resource ID.");
const pageSchema = s.nonNegativeInteger("The zero-based Breezy HR page number.");
const positionPageSizeSchema = s.positiveInteger("The number of positions to return when opting into pagination.", {
  maximum: 100,
});
const candidatePageSizeSchema = s.positiveInteger(
  "The number of candidates to return when opting into pagination. Breezy caps this value at 50.",
  { maximum: 50 },
);
const sortSchema = s.nonEmptyString("The Breezy HR sort field, such as updated.");

const companyIdInputSchema = s.requiredObject("Input containing a Breezy HR company ID.", {
  companyId: idSchema,
});

const positionIdInputSchema = s.requiredObject("Input containing Breezy HR company and position IDs.", {
  companyId: idSchema,
  positionId: idSchema,
});

const candidateIdInputSchema = s.requiredObject("Input containing Breezy HR company, position, and candidate IDs.", {
  companyId: idSchema,
  positionId: idSchema,
  candidateId: idSchema,
});

const listPositionsInputSchema = s.object(
  "Input for listing Breezy HR positions.",
  {
    companyId: idSchema,
    state: s.stringEnum("Lifecycle state used to filter Breezy HR positions.", [
      "published",
      "draft",
      "archived",
      "closed",
      "pending",
    ]),
    pageSize: positionPageSizeSchema,
    page: pageSchema,
    sort: sortSchema,
  },
  { optional: ["state", "pageSize", "page", "sort"] },
);

const listPositionCandidatesInputSchema = s.object(
  "Input for listing candidates on a Breezy HR position.",
  {
    companyId: idSchema,
    positionId: idSchema,
    pageSize: candidatePageSizeSchema,
    page: pageSchema,
    sort: sortSchema,
  },
  { optional: ["pageSize", "page", "sort"] },
);

const searchCandidatesByEmailInputSchema = s.requiredObject(
  "Input for searching Breezy HR candidates by exact email address.",
  {
    companyId: idSchema,
    emailAddress: s.string({
      description: "The candidate email address to match exactly.",
      minLength: 1,
      format: "email",
    }),
  },
);

const userSchema = s.looseObject("A Breezy HR user profile.", {
  _id: s.string("The Breezy HR user ID."),
  email_address: s.string("The user's email address."),
  name: s.string("The user's display name."),
  username: s.string("The user's username."),
  initial: s.string("The user's initials."),
  creation_date: s.string("The user creation timestamp."),
  updated_date: s.string("The user update timestamp."),
});

const companySchema = s.looseObject("A Breezy HR company profile.", {
  _id: s.string("The Breezy HR company ID."),
  name: s.string("The company name."),
  friendly_id: s.string("The company friendly ID."),
  member_count: s.integer("The number of members in the company."),
  initial: s.string("The company initials."),
  creation_date: s.string("The company creation timestamp."),
  updated_date: s.string("The company update timestamp."),
});

const positionSchema = s.looseObject("A Breezy HR position record.", {
  _id: s.string("The Breezy HR position ID."),
  name: s.string("The position name."),
  friendly_id: s.string("The position friendly ID."),
  state: s.string("The position lifecycle state."),
  department: s.nullable(s.string("The position department when present.")),
  description: s.string("The position description."),
  creation_date: s.string("The position creation timestamp."),
  updated_date: s.string("The position update timestamp."),
});

const candidateSchema = s.looseObject("A Breezy HR candidate record.", {
  _id: s.string("The Breezy HR candidate ID."),
  meta_id: s.string("The candidate metadata ID."),
  name: s.string("The candidate name."),
  email_address: s.nullable(s.string("The candidate email address when present.")),
  phone_number: s.nullable(s.string("The candidate phone number when present.")),
  headline: s.nullable(s.string("The candidate headline when present.")),
  origin: s.string("The candidate origin."),
  creation_date: s.string("The candidate creation timestamp."),
  updated_date: s.string("The candidate update timestamp."),
  stage: s.looseObject("The candidate's current stage."),
  source: s.nullable(s.looseObject("The candidate source when present.")),
  tags: s.array("Tags attached to the candidate.", s.string("A candidate tag.")),
});

const searchedCandidateSchema = s.looseObject("A lightweight Breezy HR candidate search match.", {
  _id: s.string("The Breezy HR candidate ID."),
  name: s.string("The candidate name."),
  creation_date: s.string("The candidate creation timestamp."),
  position: s.looseObject("The position associated with the candidate search match."),
});

export const breezyHrActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    operationType: "read",
    description: "Retrieve the currently authenticated Breezy HR user profile.",
    inputSchema: s.object("No input is required for this Breezy HR action.", {}),
    outputSchema: s.requiredObject("Breezy HR current user output.", {
      user: userSchema,
      raw: s.unknown("The raw Breezy HR user response."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_companies",
    operationType: "read",
    description: "List Breezy HR companies available to the connected account.",
    inputSchema: s.object("No input is required for this Breezy HR action.", {}),
    outputSchema: s.requiredObject("Breezy HR company list output.", {
      companies: s.array("Companies returned by Breezy HR.", companySchema),
      raw: s.unknown("The raw Breezy HR companies response."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_company",
    operationType: "read",
    description: "Retrieve one Breezy HR company by ID.",
    inputSchema: companyIdInputSchema,
    outputSchema: s.requiredObject("Breezy HR company output.", {
      company: companySchema,
      raw: s.unknown("The raw Breezy HR company response."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_positions",
    operationType: "read",
    description: "List Breezy HR positions for a company with optional state and page filters.",
    inputSchema: listPositionsInputSchema,
    outputSchema: s.requiredObject("Breezy HR position list output.", {
      positions: s.array("Positions returned by Breezy HR.", positionSchema),
      raw: s.unknown("The raw Breezy HR positions response."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_position",
    operationType: "read",
    description: "Retrieve one Breezy HR position by company and position ID.",
    inputSchema: positionIdInputSchema,
    outputSchema: s.requiredObject("Breezy HR position output.", {
      position: positionSchema,
      raw: s.unknown("The raw Breezy HR position response."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_position_candidates",
    operationType: "read",
    description: "List candidates on one Breezy HR position with optional page filters.",
    inputSchema: listPositionCandidatesInputSchema,
    outputSchema: s.requiredObject("Breezy HR candidate list output.", {
      candidates: s.array("Candidates returned by Breezy HR.", candidateSchema),
      raw: s.unknown("The raw Breezy HR candidates response."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_candidate",
    operationType: "read",
    description: "Retrieve one Breezy HR candidate by company, position, and candidate ID.",
    inputSchema: candidateIdInputSchema,
    outputSchema: s.requiredObject("Breezy HR candidate output.", {
      candidate: candidateSchema,
      raw: s.unknown("The raw Breezy HR candidate response."),
    }),
  }),
  defineProviderAction(service, {
    name: "search_candidates_by_email",
    operationType: "read",
    description: "Search company-wide Breezy HR candidates by exact normalized email address.",
    inputSchema: searchCandidatesByEmailInputSchema,
    outputSchema: s.requiredObject("Breezy HR candidate email search output.", {
      candidates: s.array("Candidate matches returned by Breezy HR.", searchedCandidateSchema),
      raw: s.unknown("The raw Breezy HR candidate search response."),
    }),
  }),
];
