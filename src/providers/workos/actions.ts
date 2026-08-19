import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "workos";

const cursorPaginationInputSchema = {
  before: s.nonEmptyString("An object ID that defines the cursor position before the requested page."),
  after: s.nonEmptyString("An object ID that defines the cursor position after the requested page."),
  limit: s.integer("Upper limit on the number of objects to return, between 1 and 100.", {
    minimum: 1,
    maximum: 100,
  }),
  order: s.stringEnum("Order the results by creation time.", ["normal", "desc", "asc"]),
};

const rawPayloadSchema = s.unknownObject("Raw WorkOS response payload.");
const metadataObjectSchema = s.unknownObject("Metadata key/value pairs associated with the resource.");
const organizationMembershipStatuses = ["active", "inactive", "pending"];
const organizationMembershipStatusSchema = s.stringEnum(
  "A WorkOS organization membership status.",
  organizationMembershipStatuses,
);
const listMetadataSchema = s.looseObject("WorkOS pagination metadata returned for a list request.", {
  before: s.nullableString("Cursor for the previous page when returned by WorkOS."),
  after: s.nullableString("Cursor for the next page when returned by WorkOS."),
});
const domainDataSchema = s.looseObject("WorkOS organization domain data.", {
  domain: s.string("The organization domain name."),
  state: s.string("The domain verification state."),
});

const userSchema = s.looseObject("WorkOS user object.", {
  object: s.string("Object type returned by WorkOS."),
  id: s.string("The unique ID of the user."),
  email: s.string("The email address of the user."),
  first_name: s.nullableString("The first name of the user."),
  last_name: s.nullableString("The last name of the user."),
  name: s.nullableString("The user's full name."),
  email_verified: s.boolean("Whether the user's email has been verified."),
  external_id: s.nullableString("The external ID of the user."),
  metadata: metadataObjectSchema,
  created_at: s.string("An ISO 8601 timestamp for when the user was created."),
  updated_at: s.string("An ISO 8601 timestamp for when the user was last updated."),
});

const organizationSchema = s.looseObject("WorkOS organization object.", {
  object: s.string("Object type returned by WorkOS."),
  id: s.string("Unique identifier of the organization."),
  name: s.string("A descriptive name for the organization."),
  domains: s.array("Domains associated with the organization.", s.looseObject("Organization domain.")),
  metadata: metadataObjectSchema,
  external_id: s.nullableString("The external ID of the organization."),
  created_at: s.string("The timestamp when the organization was created."),
  updated_at: s.string("The timestamp when the organization was last updated."),
});

const organizationMembershipSchema = s.looseObject("WorkOS organization membership object.", {
  object: s.string("Object type returned by WorkOS."),
  id: s.string("The unique ID of the organization membership."),
  userId: s.string("The ID of the WorkOS user."),
  organizationId: s.string("The ID of the WorkOS organization."),
  organizationName: s.string("The name of the WorkOS organization."),
  status: organizationMembershipStatusSchema,
  createdAt: s.string("The timestamp when the organization membership was created."),
  updatedAt: s.string("The timestamp when the organization membership was last updated."),
});

const userWrapperOutputSchema = s.actionOutput(
  {
    user: userSchema,
    raw: rawPayloadSchema,
  },
  "A WorkOS user response.",
);

const organizationWrapperOutputSchema = s.actionOutput(
  {
    organization: organizationSchema,
    raw: rawPayloadSchema,
  },
  "A WorkOS organization response.",
);

const membershipWrapperOutputSchema = s.actionOutput(
  {
    organization_membership: organizationMembershipSchema,
    raw: rawPayloadSchema,
  },
  "A WorkOS organization membership response.",
);

const organizationMutationFields = {
  name: s.nonEmptyString("The name of the organization."),
  allow_profiles_outside_organization: s.boolean(
    "Whether the organization allows profiles from outside the organization to sign in.",
  ),
  domain_data: s.array("Domains associated with the organization, including verification state.", domainDataSchema),
  metadata: metadataObjectSchema,
  external_id: s.nonEmptyString("An external identifier for the organization."),
};

export const workosActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_users",
    description: "List WorkOS AuthKit users with optional cursor and identity filters.",
    inputSchema: s.object(
      "Input parameters for listing WorkOS users.",
      {
        ...cursorPaginationInputSchema,
        organization_id: s.nonEmptyString("Filter users by the organization they are members of."),
        email: s.nonEmptyString("Filter users by their email address."),
      },
      { optional: ["before", "after", "limit", "order", "organization_id", "email"] },
    ),
    outputSchema: s.actionOutput(
      {
        users: s.array("Users returned by WorkOS.", userSchema),
        list_metadata: listMetadataSchema,
        raw: rawPayloadSchema,
      },
      "A page of WorkOS users.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_user",
    description: "Get a WorkOS AuthKit user by ID.",
    inputSchema: s.actionInput(
      { id: s.nonEmptyString("The unique ID of the user.") },
      ["id"],
      "Input parameters for getting a WorkOS user.",
    ),
    outputSchema: userWrapperOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_user",
    description: "Create a WorkOS AuthKit user in the current environment.",
    inputSchema: s.object(
      "Input parameters for creating a WorkOS user.",
      {
        email: s.email("The email address of the user."),
        first_name: s.nonEmptyString("The first name of the user."),
        last_name: s.nonEmptyString("The last name of the user."),
        name: s.nonEmptyString("The user's full name."),
        email_verified: s.boolean("Whether the user's email address was previously verified."),
        metadata: metadataObjectSchema,
        external_id: s.nonEmptyString("The external identifier of the user."),
        password: s.nonEmptyString("The password to set for the user."),
      },
      { optional: ["first_name", "last_name", "name", "email_verified", "metadata", "external_id", "password"] },
    ),
    outputSchema: userWrapperOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_user",
    description: "Update properties of an existing WorkOS AuthKit user.",
    inputSchema: s.object(
      "Input parameters for updating a WorkOS user.",
      {
        id: s.nonEmptyString("The unique ID of the user."),
        first_name: s.nonEmptyString("The first name of the user."),
        last_name: s.nonEmptyString("The last name of the user."),
        name: s.nonEmptyString("The user's full name."),
        email_verified: s.boolean("Whether the user's email address was previously verified."),
        metadata: metadataObjectSchema,
        external_id: s.nonEmptyString("The external identifier of the user."),
        password: s.nonEmptyString("The password to set for the user."),
      },
      { optional: ["first_name", "last_name", "name", "email_verified", "metadata", "external_id", "password"] },
    ),
    outputSchema: userWrapperOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_organizations",
    description: "List WorkOS organizations with optional cursor, domain, and text filters.",
    inputSchema: s.object(
      "Input parameters for listing WorkOS organizations.",
      {
        ...cursorPaginationInputSchema,
        domains: s.stringArray("Domains to match against organizations.", { itemDescription: "A domain name." }),
        search: s.nonEmptyString("Search text matched against organization names."),
      },
      { optional: ["before", "after", "limit", "order", "domains", "search"] },
    ),
    outputSchema: s.actionOutput(
      {
        organizations: s.array("Organizations returned by WorkOS.", organizationSchema),
        list_metadata: listMetadataSchema,
        raw: rawPayloadSchema,
      },
      "A page of WorkOS organizations.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_organization",
    description: "Get a WorkOS organization by ID.",
    inputSchema: s.actionInput(
      { id: s.nonEmptyString("Unique identifier of the organization.") },
      ["id"],
      "Input parameters for getting a WorkOS organization.",
    ),
    outputSchema: organizationWrapperOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_organization",
    description: "Create a WorkOS organization in the current environment.",
    inputSchema: s.object("Input parameters for creating a WorkOS organization.", organizationMutationFields, {
      optional: ["allow_profiles_outside_organization", "domain_data", "metadata", "external_id"],
    }),
    outputSchema: organizationWrapperOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_organization",
    description: "Update properties of an existing WorkOS organization.",
    inputSchema: s.object(
      "Input parameters for updating a WorkOS organization.",
      {
        id: s.nonEmptyString("Unique identifier of the organization."),
        ...organizationMutationFields,
      },
      { optional: ["name", "allow_profiles_outside_organization", "domain_data", "metadata", "external_id"] },
    ),
    outputSchema: organizationWrapperOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_organization_memberships",
    description: "List WorkOS organization memberships filtered by user, organization, or membership status.",
    inputSchema: s.object(
      "Input parameters for listing WorkOS organization memberships.",
      {
        ...cursorPaginationInputSchema,
        organization_id: s.nonEmptyString("The ID of the organization which the user belongs to."),
        user_id: s.nonEmptyString("The ID of the user."),
        statuses: s.array("Statuses to include in the membership list.", organizationMembershipStatusSchema),
      },
      { optional: ["before", "after", "limit", "order", "organization_id", "user_id", "statuses"] },
    ),
    outputSchema: s.actionOutput(
      {
        organization_memberships: s.array("Organization memberships returned by WorkOS.", organizationMembershipSchema),
        list_metadata: listMetadataSchema,
        raw: rawPayloadSchema,
      },
      "A page of WorkOS organization memberships.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_organization_membership",
    description: "Get a WorkOS organization membership by ID.",
    inputSchema: s.actionInput(
      { id: s.nonEmptyString("The unique ID of the organization membership.") },
      ["id"],
      "Input parameters for getting a WorkOS organization membership.",
    ),
    outputSchema: membershipWrapperOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_organization_membership",
    description: "Create an active WorkOS organization membership for a user and organization.",
    inputSchema: s.object(
      "Input parameters for creating a WorkOS organization membership.",
      {
        user_id: s.nonEmptyString("The ID of the user."),
        organization_id: s.nonEmptyString("The ID of the organization which the user belongs to."),
        role_slug: s.nonEmptyString("A single role identifier."),
        role_slugs: s.stringArray("Role identifiers to assign to the user.", { itemDescription: "A role identifier." }),
      },
      { optional: ["role_slug", "role_slugs"] },
    ),
    outputSchema: membershipWrapperOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_organization_membership",
    description: "Update roles on an existing WorkOS organization membership.",
    inputSchema: s.object(
      "Input parameters for updating a WorkOS organization membership.",
      {
        id: s.nonEmptyString("The unique ID of the organization membership."),
        role_slug: s.nonEmptyString("A single role identifier."),
        role_slugs: s.stringArray("Role identifiers to assign to the user.", { itemDescription: "A role identifier." }),
      },
      { optional: ["role_slug", "role_slugs"] },
    ),
    outputSchema: membershipWrapperOutputSchema,
  }),
  defineProviderAction(service, {
    name: "deactivate_organization_membership",
    description: "Deactivate an active WorkOS organization membership.",
    inputSchema: s.actionInput(
      { id: s.nonEmptyString("The unique ID of the organization membership.") },
      ["id"],
      "Input parameters for deactivating a WorkOS organization membership.",
    ),
    outputSchema: membershipWrapperOutputSchema,
  }),
  defineProviderAction(service, {
    name: "reactivate_organization_membership",
    description: "Reactivate an inactive WorkOS organization membership.",
    inputSchema: s.actionInput(
      { id: s.nonEmptyString("The unique ID of the organization membership.") },
      ["id"],
      "Input parameters for reactivating a WorkOS organization membership.",
    ),
    outputSchema: membershipWrapperOutputSchema,
  }),
];
