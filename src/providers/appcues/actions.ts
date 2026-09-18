import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "appcues";

const flowSchema = s.object(
  "One Appcues Flow 2.0 experience.",
  {
    id: s.string("The flow identifier."),
    name: s.string("The flow name."),
    published: s.boolean("Whether the flow is currently published."),
    state: s.string("The current flow state."),
    platform: s.string("The platform targeted by the flow."),
    frequency: s.string("The configured display frequency."),
    created_at: s.integer("The flow creation time as a Unix timestamp in milliseconds."),
    updated_at: s.integer("The last flow update time as a Unix timestamp in milliseconds."),
    published_at: s.nullable(s.integer("The last publish time as a Unix timestamp in milliseconds.")),
    tag_ids: s.array("The identifiers of tags assigned to the flow.", s.string("One tag ID.")),
    steps: s.array(
      "The provider-defined steps in the flow.",
      s.looseObject("One provider-defined flow step.", {
        id: s.string("The step identifier."),
        type: s.string("The step type."),
      }),
    ),
  },
  {
    optional: ["state", "platform", "frequency", "created_at", "updated_at", "published_at", "tag_ids", "steps"],
    additionalProperties: true,
  },
);

const tagSchema = s.object(
  "One Appcues content tag.",
  {
    id: s.string("The tag identifier."),
    name: s.string("The tag name."),
    created_at: s.string("The tag creation timestamp."),
    created_by: s.string("The identifier of the user who created the tag."),
    updated_at: s.string("The tag update timestamp."),
    updated_by: s.string("The identifier of the user who last updated the tag."),
    url: s.url("The API URL for the tag."),
  },
  {
    optional: ["created_at", "created_by", "updated_at", "updated_by", "url"],
    additionalProperties: true,
  },
);

const flowIdInputSchema = s.object("Input for one Appcues Flow 2.0 experience.", {
  flow_id: s.nonEmptyString("The Appcues Flow 2.0 identifier."),
});

const publishResultSchema = s.object("The Appcues publish-state change result.", {
  status: s.integer("The upstream HTTP status reported by Appcues."),
  title: s.string("The upstream result title."),
});

export const appcuesActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_flows",
    operationType: "read",
    description: "List Appcues Flow 2.0 experiences for the connected account.",
    requiredScopes: [],
    inputSchema: s.object("Input for listing Appcues Flow 2.0 experiences.", {}),
    outputSchema: s.object("The Appcues Flow 2.0 experience list.", {
      flows: s.array("The returned Flow 2.0 experiences.", flowSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_flow",
    operationType: "read",
    description: "Get one Appcues Flow 2.0 experience by identifier.",
    requiredScopes: [],
    inputSchema: flowIdInputSchema,
    outputSchema: flowSchema,
  }),
  defineProviderAction(service, {
    name: "publish_flow",
    operationType: "write",
    description: "Publish one Appcues Flow 2.0 experience.",
    requiredScopes: [],
    inputSchema: flowIdInputSchema,
    outputSchema: publishResultSchema,
  }),
  defineProviderAction(service, {
    name: "unpublish_flow",
    operationType: "destructive",
    description: "Unpublish one Appcues Flow 2.0 experience.",
    requiredScopes: [],
    inputSchema: flowIdInputSchema,
    outputSchema: publishResultSchema,
  }),
  defineProviderAction(service, {
    name: "list_tags",
    operationType: "read",
    description: "List content tags for the connected Appcues account.",
    requiredScopes: [],
    inputSchema: s.object("Input for listing Appcues tags.", {}),
    outputSchema: s.object("The Appcues tag list.", {
      tags: s.array("The returned content tags.", tagSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_tag",
    operationType: "read",
    description: "Get one Appcues content tag by identifier.",
    requiredScopes: [],
    inputSchema: s.object("Input for retrieving one Appcues tag.", {
      tag_id: s.nonEmptyString("The Appcues tag identifier."),
    }),
    outputSchema: tagSchema,
  }),
];
