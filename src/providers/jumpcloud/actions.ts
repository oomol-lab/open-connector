import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "jumpcloud";

const idField = s.string("The JumpCloud object identifier.", { minLength: 1 });
const fieldsField = s.string("Space-separated fields to include in the returned JumpCloud records.", {
  minLength: 1,
});
const filterField = s.string("JumpCloud v1 filter expression such as department:$eq:Finance.", {
  minLength: 1,
});
const limitField = s.integer("The number of records to return at once. JumpCloud limits this to 100.", {
  minimum: 1,
  maximum: 100,
});
const orgIdField = s.string(
  "Optional JumpCloud organization ID to send with the x-org-id header for multi-tenant admin accounts.",
  { minLength: 1 },
);
const searchField = s.string(
  "JumpCloud search object serialized as a query string value, matching the v1 API search parameter.",
  { minLength: 1 },
);
const skipField = s.integer("The offset into the JumpCloud record collection.", {
  minimum: 0,
});
const sortField = s.string(
  "Space-separated fields used to sort the collection. Prefix a field with - for descending order.",
  { minLength: 1 },
);
const regionField = s.stringEnum("The JumpCloud data-center region to call.", ["us", "eu", "in"]);

const rawObjectSchema = s.looseObject("Raw JumpCloud object returned by the API.");
const listMetaSchema = s.object("JumpCloud pagination metadata returned by the connector.", {
  totalCount: s.nullable(s.integer("Total number of records reported by JumpCloud.")),
});
const systemUserSchema = s.looseObject("JumpCloud system user record.", {
  _id: idField,
  username: s.string("The JumpCloud username."),
  email: s.string("The user's email address."),
  firstname: s.string("The user's first name."),
  lastname: s.string("The user's last name."),
  displayname: s.string("The user's display name."),
  state: s.string("The JumpCloud user state."),
  activated: s.boolean("Whether the user is activated."),
  suspended: s.boolean("Whether the user is suspended."),
});
const systemSchema = s.looseObject("JumpCloud system record.", {
  _id: idField,
  displayName: s.string("The JumpCloud system display name."),
  hostname: s.string("The system hostname."),
  os: s.string("The operating system name."),
  version: s.string("The operating system version."),
  active: s.boolean("Whether the system is active."),
  agentVersion: s.string("The installed JumpCloud agent version."),
});

const listInputSchema = s.object(
  "Input parameters for listing JumpCloud records.",
  {
    fields: fieldsField,
    filter: filterField,
    limit: limitField,
    orgId: orgIdField,
    region: regionField,
    search: searchField,
    skip: skipField,
    sort: sortField,
  },
  { optional: ["fields", "filter", "limit", "orgId", "region", "search", "skip", "sort"] },
);

const getInputSchema = s.object(
  "Input parameters for reading a single JumpCloud record.",
  {
    id: idField,
    fields: fieldsField,
    filter: filterField,
    orgId: orgIdField,
    region: regionField,
  },
  { optional: ["fields", "filter", "orgId", "region"] },
);

export const jumpcloudActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_system_users",
    description: "List JumpCloud system users through the v1 Systemusers API.",
    inputSchema: listInputSchema,
    outputSchema: s.object("Response returned when listing JumpCloud system users.", {
      results: s.array("JumpCloud system users returned by the API.", systemUserSchema),
      meta: listMetaSchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_system_user",
    description: "Get a JumpCloud system user by ID through the v1 Systemusers API.",
    inputSchema: getInputSchema,
    outputSchema: s.object("Response returned when reading a JumpCloud system user.", {
      systemUser: systemUserSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_systems",
    description: "List JumpCloud systems through the v1 Systems API.",
    inputSchema: listInputSchema,
    outputSchema: s.object("Response returned when listing JumpCloud systems.", {
      results: s.array("JumpCloud systems returned by the API.", systemSchema),
      meta: listMetaSchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_system",
    description: "Get a JumpCloud system by ID through the v1 Systems API.",
    inputSchema: getInputSchema,
    outputSchema: s.object("Response returned when reading a JumpCloud system.", {
      system: systemSchema,
    }),
  }),
];
