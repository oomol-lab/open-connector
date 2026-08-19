import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "whop";

const directionSchema = s.stringEnum("Sort direction for returned Whop resources.", ["asc", "desc"]);

const membershipStatusSchema = s.stringEnum("Whop membership lifecycle status.", [
  "trialing",
  "active",
  "past_due",
  "completed",
  "canceled",
  "expired",
  "unresolved",
  "drafted",
  "canceling",
]);

const membershipCancelOptionSchema = s.stringEnum("Whop membership cancellation reason.", [
  "too_expensive",
  "switching",
  "missing_features",
  "technical_issues",
  "bad_experience",
  "other",
  "testing",
]);

const membershipOrderSchema = s.stringEnum("Sortable Whop membership column.", [
  "id",
  "created_at",
  "status",
  "canceled_at",
  "date_joined",
  "total_spend",
]);

const authorizedUserRoleSchema = s.stringEnum("Role assigned to a Whop authorized user.", [
  "owner",
  "admin",
  "sales_manager",
  "moderator",
  "advertiser",
  "app_manager",
  "support",
  "manager",
  "custom",
]);

const cursorInputFields = {
  after: s.nonEmptyString("Cursor for returning resources after this position."),
  before: s.nonEmptyString("Cursor for returning resources before this position."),
  first: s.integer("Number of resources to return from the start of the list.", { minimum: 1 }),
  last: s.integer("Number of resources to return from the end of the list.", { minimum: 1 }),
};

const pageInfoSchema = s.object("Whop cursor pagination metadata.", {
  end_cursor: s.nullableString("Cursor for the next page when paginating forward."),
  start_cursor: s.nullableString("Cursor for the previous page when paginating backward."),
  has_next_page: s.boolean("Whether more resources are available after this page."),
  has_previous_page: s.boolean("Whether more resources are available before this page."),
});

const ownerUserSchema = s.looseObject("Whop owner user summary.", {
  id: s.nonEmptyString("The unique Whop user identifier."),
  name: s.nullableString("The user's display name."),
  username: s.nonEmptyString("The user's public username."),
});

const companySummarySchema = s.looseObject("Whop company resource.", {
  id: s.nonEmptyString("The unique Whop company identifier."),
  title: s.nonEmptyString("The company display name."),
  description: s.nullableString("The company promotional description."),
  verified: s.boolean("Whether Whop has verified this company."),
  created_at: s.dateTime("The datetime when this company was created."),
  updated_at: s.dateTime("The datetime when this company was last updated."),
  member_count: s.integer("The number of active members across this company's products."),
  owner_user: ownerUserSchema,
  route: s.nonEmptyString("The company store route slug."),
  metadata: s.nullable(s.looseObject("Custom metadata stored on this company.")),
});

const productSummarySchema = s.looseObject("Whop product resource.", {
  id: s.nonEmptyString("The unique Whop product identifier."),
  created_at: s.dateTime("The datetime when this product was created."),
  updated_at: s.dateTime("The datetime when this product was last updated."),
  title: s.nullableString("The product display name."),
  visibility: s.nullableString("The product visibility state."),
  headline: s.nullableString("The product marketing headline."),
  verified: s.boolean("Whether Whop has verified this product."),
  member_count: s.number("The active membership count for this product."),
  route: s.nullableString("The product public route slug."),
  published_reviews_count: s.number("The number of published reviews for this product."),
  external_identifier: s.nullableString("External identifier stored on this product."),
  metadata: s.nullable(s.looseObject("Custom metadata stored on this product.")),
});

const userSummarySchema = s.looseObject("Whop user summary.", {
  id: s.nonEmptyString("The unique Whop user identifier."),
  username: s.nonEmptyString("The user's public username."),
  name: s.nullableString("The user's display name."),
  email: s.nullableString("The user's email address when the credential has email access."),
});

const idSummarySchema = s.looseObject("Whop linked resource summary.", {
  id: s.nonEmptyString("The unique Whop resource identifier."),
});

const membershipSchema = s.looseObject("Whop membership resource.", {
  id: s.nonEmptyString("The unique Whop membership identifier."),
  status: membershipStatusSchema,
  created_at: s.dateTime("The datetime when this membership was created."),
  joined_at: s.nullable(s.dateTime("The datetime when the user joined the company.")),
  updated_at: s.dateTime("The datetime when this membership was last updated."),
  manage_url: s.nullableString("URL where the customer can manage this membership."),
  member: s.nullable(idSummarySchema),
  user: s.nullable(userSummarySchema),
  cancel_at_period_end: s.boolean("Whether this membership will cancel at period end."),
  cancel_option: s.nullable(membershipCancelOptionSchema),
  cancellation_reason: s.nullableString("Free-text cancellation reason."),
  canceled_at: s.nullable(s.dateTime("The datetime when this membership was canceled.")),
  currency: s.nullableString("The membership billing currency."),
  company: s.looseObject("Company linked to this membership.", {
    id: s.nonEmptyString("The unique Whop company identifier."),
    title: s.nonEmptyString("The company display name."),
  }),
  plan: s.looseObject("Plan linked to this membership.", {
    id: s.nonEmptyString("The unique Whop plan identifier."),
    metadata: s.nullable(s.looseObject("Custom metadata stored on the plan.")),
  }),
  promo_code: s.nullable(idSummarySchema),
  product: s.looseObject("Product linked to this membership.", {
    id: s.nonEmptyString("The unique Whop product identifier."),
    title: s.nonEmptyString("The product display name."),
    metadata: s.nullable(s.looseObject("Custom metadata stored on the product.")),
  }),
  license_key: s.nullableString("Software license key linked to this membership."),
  metadata: s.nullable(s.looseObject("Custom metadata stored on this membership.")),
  payment_collection_paused: s.boolean("Whether recurring payment collection is paused for this membership."),
  checkout_configuration_id: s.nullableString("Checkout configuration identifier that produced this membership."),
});

const authorizedUserSchema = s.looseObject("Whop authorized user resource.", {
  id: s.nonEmptyString("The unique Whop authorized user identifier."),
  role: authorizedUserRoleSchema,
  user: userSummarySchema,
  company: s.looseObject("Company this user can administer.", {
    id: s.nonEmptyString("The unique Whop company identifier."),
    title: s.nonEmptyString("The company display name."),
  }),
});

const companyListOutputSchema = s.object("Paginated Whop company list response.", {
  data: s.array("Companies returned by Whop.", companySummarySchema),
  page_info: pageInfoSchema,
});

const productListOutputSchema = s.object("Paginated Whop product list response.", {
  data: s.array("Products returned by Whop.", productSummarySchema),
  page_info: pageInfoSchema,
});

const membershipListOutputSchema = s.object("Paginated Whop membership list response.", {
  data: s.array("Memberships returned by Whop.", membershipSchema),
  page_info: pageInfoSchema,
});

const authorizedUserListOutputSchema = s.object("Paginated Whop authorized user list response.", {
  data: s.array("Authorized users returned by Whop.", authorizedUserSchema),
  page_info: pageInfoSchema,
});

const idInputSchema = (description: string, idDescription: string) =>
  s.object(description, {
    id: s.nonEmptyString(idDescription),
  });

const stringArraySchema = (description: string, itemDescription: string) =>
  s.array(description, s.nonEmptyString(itemDescription), { minItems: 1 });

export const whopActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_companies",
    description:
      "List Whop companies accessible to the credential, optionally filtering connected accounts by parent company.",
    inputSchema: s.object(
      "Query parameters for listing Whop companies.",
      {
        ...cursorInputFields,
        parent_company_id: s.nonEmptyString("Parent platform company ID for listing connected accounts."),
        direction: directionSchema,
        created_before: s.dateTime("Only return companies created before this timestamp."),
        created_after: s.dateTime("Only return companies created after this timestamp."),
      },
      {
        optional: [
          "after",
          "before",
          "first",
          "last",
          "parent_company_id",
          "direction",
          "created_before",
          "created_after",
        ],
      },
    ),
    outputSchema: companyListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_company",
    description: "Retrieve a Whop company by ID or route slug.",
    inputSchema: idInputSchema(
      "Path parameters for retrieving a Whop company.",
      "The unique Whop company identifier or route slug.",
    ),
    outputSchema: companySummarySchema,
  }),
  defineProviderAction(service, {
    name: "list_products",
    description: "List Whop products belonging to a company with optional visibility, type, sort, and cursor filters.",
    inputSchema: s.object(
      "Query parameters for listing Whop products.",
      {
        company_id: s.nonEmptyString("The unique Whop company identifier."),
        visibilities: stringArraySchema("Product visibility states to include.", "One product visibility state."),
        access_pass_types: stringArraySchema("Product access pass types to include.", "One product access pass type."),
        direction: directionSchema,
        order: s.nonEmptyString("Product field to sort by. Defaults to created_at."),
        first: s.integer("Number of products to return. Default and max is 100.", {
          minimum: 1,
          maximum: 100,
        }),
        after: s.nonEmptyString("Cursor for returning products after this position."),
        last: s.integer("Number of products to return from the end of the range.", { minimum: 1 }),
        before: s.nonEmptyString("Cursor for returning products before this position."),
      },
      {
        optional: ["visibilities", "access_pass_types", "direction", "order", "first", "after", "last", "before"],
      },
    ),
    outputSchema: productListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_product",
    description: "Retrieve a Whop product by ID.",
    inputSchema: idInputSchema("Path parameters for retrieving a Whop product.", "The unique Whop product identifier."),
    outputSchema: productSummarySchema,
  }),
  defineProviderAction(service, {
    name: "list_memberships",
    description: "List Whop memberships for a company with optional product, plan, user, status, and cursor filters.",
    inputSchema: s.object(
      "Query parameters for listing Whop memberships.",
      {
        ...cursorInputFields,
        company_id: s.nonEmptyString("The Whop company identifier. Required when using an API key."),
        direction: directionSchema,
        order: membershipOrderSchema,
        product_ids: stringArraySchema("Product identifiers to filter memberships by.", "One Whop product identifier."),
        statuses: s.array("Membership statuses to include.", membershipStatusSchema, { minItems: 1 }),
        cancel_options: s.array("Cancellation reasons to filter memberships by.", membershipCancelOptionSchema, {
          minItems: 1,
        }),
        plan_ids: stringArraySchema("Plan identifiers to filter memberships by.", "One Whop plan identifier."),
        user_ids: stringArraySchema("User identifiers to filter memberships by.", "One Whop user identifier."),
        promo_code_ids: stringArraySchema(
          "Promo code identifiers to filter memberships by.",
          "One Whop promo code identifier.",
        ),
        created_before: s.dateTime("Only return memberships created before this timestamp."),
        created_after: s.dateTime("Only return memberships created after this timestamp."),
      },
      {
        optional: [
          "after",
          "before",
          "first",
          "last",
          "direction",
          "order",
          "product_ids",
          "statuses",
          "cancel_options",
          "plan_ids",
          "user_ids",
          "promo_code_ids",
          "created_before",
          "created_after",
        ],
      },
    ),
    outputSchema: membershipListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_membership",
    description: "Retrieve a Whop membership by membership ID or license key.",
    inputSchema: idInputSchema(
      "Path parameters for retrieving a Whop membership.",
      "The unique Whop membership identifier or license key.",
    ),
    outputSchema: membershipSchema,
  }),
  defineProviderAction(service, {
    name: "list_authorized_users",
    description: "List authorized Whop team members with optional company, user, role, date, and cursor filters.",
    inputSchema: s.object(
      "Query parameters for listing Whop authorized users.",
      {
        ...cursorInputFields,
        company_id: s.nonEmptyString("The unique Whop company identifier."),
        user_id: s.nonEmptyString("The unique Whop user identifier."),
        role: authorizedUserRoleSchema,
        created_before: s.dateTime("Only return authorized users created before this timestamp."),
        created_after: s.dateTime("Only return authorized users created after this timestamp."),
      },
      {
        optional: [
          "after",
          "before",
          "first",
          "last",
          "company_id",
          "user_id",
          "role",
          "created_before",
          "created_after",
        ],
      },
    ),
    outputSchema: authorizedUserListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_authorized_user",
    description: "Retrieve a Whop authorized user by ID.",
    inputSchema: idInputSchema(
      "Path parameters for retrieving a Whop authorized user.",
      "The unique Whop authorized user identifier.",
    ),
    outputSchema: authorizedUserSchema,
  }),
];
