import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "memberstack";

const planInputSchema = s.object("A free Memberstack plan assignment.", {
  planId: s.nonEmptyString("The free plan ID to assign or remove. Free plan IDs start with pln_."),
});

const authSchema = s.looseObject("The member authentication details returned by Memberstack.", {
  email: s.string("The member's email address."),
});

const planConnectionSchema = s.looseObject("One plan connection returned on a Memberstack member.", {
  id: s.string("The plan connection ID."),
  active: s.boolean("Whether the plan connection is active."),
  status: s.string("The plan connection status."),
  planId: s.string("The connected plan ID."),
  planName: s.string("The connected plan name."),
  type: s.string("The connected plan type."),
  payment: s.unknown("Payment details for the plan connection when present."),
});

const teamPlanSchema = s.looseObject("The owner plan details returned for a team membership.", {
  id: s.string("The team owner plan ID."),
  name: s.string("The team owner plan name."),
  teamAccountInviteSignupLink: s.string("The team invite signup link."),
  teamAccountUpgradeLink: s.string("The team upgrade link."),
});

const teamSchema = s.looseObject("One team membership embedded on a Memberstack member.", {
  id: s.string("The team ID."),
  role: s.string("The member's role on the team."),
  createdAt: s.string("The ISO timestamp when the team was created."),
  inviteToken: s.string("The team invite token."),
  currentTeamMemberCount: s.number("The current number of members on the team."),
  maxTeamMembers: s.nullableNumber("The maximum number of members allowed on the team."),
  plan: s.nullable(teamPlanSchema),
});

const memberSchema = s.looseObject("A Memberstack member object.", {
  id: s.string("The Memberstack member ID."),
  auth: authSchema,
  createdAt: s.string("The ISO timestamp when the member was created."),
  lastLogin: s.nullableString("The ISO timestamp when the member last logged in."),
  verified: s.boolean("Whether the member's email is verified."),
  customFields: s.looseObject("Custom fields stored on the member."),
  metaData: s.looseObject("Metadata stored on the member."),
  json: s.looseObject("JSON data stored on the member."),
  permissions: s.array("Permissions assigned to the member.", s.string("One permission value.")),
  loginRedirect: s.string("The URL or path where the member is redirected after login."),
  stripeCustomerId: s.nullableString("The Stripe customer ID when present."),
  profileImage: s.nullableString("The member profile image URL when present."),
  planConnections: s.array("Plan connections for the member.", planConnectionSchema),
  teams: s.array("Team memberships embedded with include=teams.", teamSchema),
});

const memberWrapperSchema = s.object("A Memberstack single-member response.", {
  data: memberSchema,
});

const nullableMemberWrapperSchema = s.object("A Memberstack nullable member lookup response.", {
  data: s.nullable(memberSchema),
});

const listMembersInputSchema = s.object(
  "The query parameters for listing Memberstack members.",
  {
    after: s.integer("The endCursor after which listing should start."),
    order: s.stringEnum("The member sort order.", ["ASC", "DESC"]),
    first: s.integer("Alias for limit. If supplied, Memberstack gives it precedence.", {
      minimum: 1,
      maximum: 100,
    }),
    limit: s.integer("The maximum number of members to return.", {
      minimum: 1,
      maximum: 100,
    }),
    includeJSON: s.boolean("Whether to include each member's json field in the response."),
  },
  {
    optional: ["after", "order", "first", "limit", "includeJSON"],
  },
);

const listMembersOutputSchema = s.object("A paginated Memberstack member list response.", {
  totalCount: s.integer("The total number of members."),
  endCursor: s.integer("The cursor to pass as after when fetching the next page."),
  hasNextPage: s.boolean("Whether more members are available."),
  data: s.array("The members returned for this page.", memberSchema),
});

const getMemberInputSchema = s.object(
  "The input for retrieving a Memberstack member by ID or email.",
  {
    idOrEmail: s.nonEmptyString("The Memberstack member ID or email address."),
    includeTeams: s.boolean("Whether to request embedded team memberships with include=teams."),
  },
  {
    optional: ["includeTeams"],
  },
);

const createMemberInputSchema = s.object(
  "The JSON body for creating a Memberstack member.",
  {
    email: s.email("The member's unique email address."),
    password: s.nonEmptyString("The member password. Required unless the app uses passwordless authentication."),
    plans: s.array("Free plans to assign during creation.", planInputSchema),
    customFields: s.looseObject("Custom fields to store on the member."),
    metaData: s.looseObject("Metadata to store on the member."),
    json: s.looseObject("JSON data to store on the member."),
    loginRedirect: s.nonEmptyString("The URL or path where the member is redirected after login."),
  },
  {
    optional: ["password", "plans", "customFields", "metaData", "json", "loginRedirect"],
  },
);

const updateMemberInputSchema: JsonSchema = s.object(
  "The JSON body for partially updating a Memberstack member.",
  {
    id: s.nonEmptyString("The Memberstack member ID to update."),
    email: s.email("The updated member email address."),
    customFields: s.looseObject("Custom fields to shallow-merge into the member."),
    metaData: s.looseObject("Metadata to shallow-merge into the member."),
    json: s.looseObject("JSON data to replace on the member."),
    loginRedirect: s.nonEmptyString("The updated URL or path where the member is redirected after login."),
    verified: s.boolean("Whether the member's email should be marked verified."),
    profileImage: s.url("The updated member profile image URL."),
  },
  {
    optional: ["email", "customFields", "metaData", "json", "loginRedirect", "verified", "profileImage"],
  },
);
updateMemberInputSchema.anyOf = [
  { required: ["email"] },
  { required: ["customFields"] },
  { required: ["metaData"] },
  { required: ["json"] },
  { required: ["loginRedirect"] },
  { required: ["verified"] },
  { required: ["profileImage"] },
];

const deleteMemberInputSchema = s.object(
  "The input for permanently deleting a Memberstack member.",
  {
    id: s.nonEmptyString("The Memberstack member ID to delete."),
    deleteStripeCustomer: s.boolean("Whether to delete the associated Stripe customer."),
    cancelStripeSubscriptions: s.boolean("Whether to cancel associated Stripe subscriptions."),
  },
  {
    optional: ["deleteStripeCustomer", "cancelStripeSubscriptions"],
  },
);

const freePlanInputSchema = s.object("The input for adding or removing a free member plan.", {
  id: s.nonEmptyString("The Memberstack member ID."),
  planId: s.nonEmptyString("The free plan ID. Free plan IDs start with pln_."),
});

const successOutputSchema = s.object("A successful empty-body Memberstack response.", {
  success: s.literal(true, { description: "Whether the operation succeeded." }),
});

const verifyMemberTokenInputSchema = s.object("The input for verifying a Memberstack member JWT.", {
  token: s.nonEmptyString("The JWT token issued to a Memberstack member."),
});

const verifyMemberTokenOutputSchema = s.object("The decoded Memberstack member token response.", {
  data: s.looseObject("The decoded token payload returned by Memberstack.", {
    id: s.string("The member ID from the token."),
    type: s.string("The token type."),
    iat: s.integer("The issued-at Unix timestamp."),
    exp: s.integer("The expiration Unix timestamp."),
    aud: s.string("The token audience."),
    iss: s.string("The token issuer."),
  }),
});

export const memberstackActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_members",
    description: "List Memberstack members with cursor pagination and optional JSON-field inclusion.",
    inputSchema: listMembersInputSchema,
    outputSchema: listMembersOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_member",
    description:
      "Retrieve one Memberstack member by member ID or email address, optionally embedding team memberships.",
    inputSchema: getMemberInputSchema,
    outputSchema: nullableMemberWrapperSchema,
  }),
  defineProviderAction(service, {
    name: "create_member",
    description:
      "Create a Memberstack member with email, optional password, free plans, custom fields, metadata, JSON data, and login redirect.",
    inputSchema: createMemberInputSchema,
    outputSchema: memberWrapperSchema,
  }),
  defineProviderAction(service, {
    name: "update_member",
    description:
      "Partially update a Memberstack member's email, custom fields, metadata, JSON data, login redirect, verified status, or profile image.",
    inputSchema: updateMemberInputSchema,
    outputSchema: memberWrapperSchema,
  }),
  defineProviderAction(service, {
    name: "delete_member",
    description:
      "Permanently delete a Memberstack member with optional Stripe customer and subscription cleanup flags.",
    inputSchema: deleteMemberInputSchema,
    outputSchema: s.object("A Memberstack delete member response.", {
      data: s.object("The deleted member identifier.", {
        id: s.string("The deleted Memberstack member ID."),
      }),
    }),
  }),
  defineProviderAction(service, {
    name: "add_free_plan",
    description: "Add a free Memberstack plan to an existing member.",
    inputSchema: freePlanInputSchema,
    outputSchema: successOutputSchema,
  }),
  defineProviderAction(service, {
    name: "remove_free_plan",
    description: "Remove a free Memberstack plan from an existing member.",
    inputSchema: freePlanInputSchema,
    outputSchema: successOutputSchema,
  }),
  defineProviderAction(service, {
    name: "verify_member_token",
    description: "Verify a Memberstack member JWT and return the decoded token payload.",
    inputSchema: verifyMemberTokenInputSchema,
    outputSchema: verifyMemberTokenOutputSchema,
  }),
];
