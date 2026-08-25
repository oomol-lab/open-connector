import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "mailchimp";

const countField = s.integer({
  minimum: 1,
  description: "Maximum number of items to return.",
});
const offsetField = s.nonNegativeInteger("Number of items to skip before collecting the response page.");
const listIdField = s.nonEmptyString("Mailchimp audience/list identifier.");
const subscriberHashField = s.nonEmptyString(
  "Lowercase MD5 hash of the subscriber email address accepted by Mailchimp.",
);
const emailAddressField = s.email("Subscriber email address used by Mailchimp to derive the subscriber hash.");
const memberStatusField = s.nonEmptyString("Mailchimp member status value accepted by the official API.");
const tagStatusField = s.stringEnum(["active", "inactive"], {
  description: "Tag state accepted by the official Mailchimp member-tags endpoint.",
});

const memberWriteFields = {
  merge_fields: s.looseObject("Merge fields object accepted by the official Mailchimp API."),
  status: memberStatusField,
  vip: s.boolean("Whether Mailchimp should mark the member as VIP."),
  language: s.nonEmptyString("Preferred language code accepted by the official Mailchimp API."),
  email_type: s.nonEmptyString("Email content type accepted by the official Mailchimp API."),
};

const listListsInputSchema = s.object(
  "Query parameters for listing Mailchimp audiences/lists.",
  {
    count: countField,
    offset: offsetField,
  },
  { optional: ["count", "offset"] },
);

const getListInputSchema = s.object(
  "Path parameters for fetching a single Mailchimp audience/list.",
  {
    list_id: listIdField,
  },
  { required: ["list_id"] },
);

const listMembersInputSchema = s.object(
  "Query parameters for listing members in a Mailchimp audience/list.",
  {
    list_id: listIdField,
    count: countField,
    offset: offsetField,
    status: memberStatusField,
  },
  { required: ["list_id"] },
);

const upsertMemberInputSchema = s.object(
  "Request payload for Mailchimp add-or-update member requests.",
  {
    list_id: listIdField,
    email_address: emailAddressField,
    status_if_new: memberStatusField,
    skip_merge_validation: s.boolean("Whether Mailchimp should skip merge-field validation during the write request."),
    ...memberWriteFields,
  },
  { required: ["list_id", "email_address"] },
);

const updateMemberInputSchema = memberLocatorInputSchema("Request payload for patching an existing Mailchimp member.", {
  skip_merge_validation: s.boolean("Whether Mailchimp should skip merge-field validation during the write request."),
  ...memberWriteFields,
});

const tagWriteInputSchema = memberLocatorInputSchema(
  "Request payload for updating Mailchimp member tags.",
  {
    tags: s.array(
      "Tag updates to submit to Mailchimp.",
      s.object(
        "Single Mailchimp tag update instruction.",
        {
          name: s.nonEmptyString("Tag name accepted by the official Mailchimp API."),
          status: tagStatusField,
        },
        { required: ["name", "status"] },
      ),
      { minItems: 1 },
    ),
  },
  ["tags"],
);

const listMergeFieldsInputSchema = s.object(
  "Query parameters for listing Mailchimp merge fields.",
  {
    list_id: listIdField,
    count: countField,
    offset: offsetField,
  },
  { required: ["list_id"] },
);

const successOutputSchema = s.object(
  "Success marker returned after a Mailchimp no-content response.",
  {
    success: s.boolean("Whether Mailchimp accepted the request."),
  },
  { required: ["success"] },
);

export const mailchimpActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_lists",
    description: "List Mailchimp audiences/lists visible to the current API key.",
    inputSchema: listListsInputSchema,
    outputSchema: createCollectionOutputSchema(
      "lists",
      "Audience/list object returned by Mailchimp.",
      "Mailchimp audience/list collection response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_list",
    description: "Fetch a single Mailchimp audience/list by ID.",
    inputSchema: getListInputSchema,
    outputSchema: createSingleOutputSchema(
      "list",
      "Audience/list object returned by Mailchimp.",
      "Single Mailchimp audience/list response normalized by the connector.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_members",
    description: "List members in a Mailchimp audience/list.",
    inputSchema: listMembersInputSchema,
    outputSchema: createCollectionOutputSchema(
      "members",
      "Member object returned by Mailchimp.",
      "Mailchimp member collection response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_member",
    description: "Fetch a single Mailchimp member by subscriber hash or email address.",
    inputSchema: memberLocatorInputSchema(
      "Mailchimp list identifier plus either a subscriber hash or an email address.",
    ),
    outputSchema: createSingleOutputSchema(
      "member",
      "Member object returned by Mailchimp.",
      "Single Mailchimp member response normalized by the connector.",
    ),
  }),
  defineProviderAction(service, {
    name: "upsert_member",
    description: "Add or update a Mailchimp member using the official upsert endpoint.",
    inputSchema: upsertMemberInputSchema,
    outputSchema: createSingleOutputSchema(
      "member",
      "Member object returned by Mailchimp after the upsert request.",
      "Single Mailchimp member response normalized after an upsert request.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_member",
    description: "Patch an existing Mailchimp member by subscriber hash or email address.",
    inputSchema: updateMemberInputSchema,
    outputSchema: createSingleOutputSchema(
      "member",
      "Member object returned by Mailchimp after the update request.",
      "Single Mailchimp member response normalized after an update request.",
    ),
  }),
  defineProviderAction(service, {
    name: "archive_member",
    description: "Archive a Mailchimp member from the specified audience/list.",
    inputSchema: memberLocatorInputSchema("Mailchimp member locator for archiving a member."),
    outputSchema: successOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_member_permanently",
    description: "Permanently delete a Mailchimp member from the specified audience/list.",
    inputSchema: memberLocatorInputSchema("Mailchimp member locator for permanently deleting a member."),
    outputSchema: successOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_member_tags",
    description: "List tags currently attached to a Mailchimp member.",
    inputSchema: memberLocatorInputSchema("Mailchimp member locator for listing tags."),
    outputSchema: createCollectionOutputSchema(
      "tags",
      "Tag object returned by Mailchimp.",
      "Mailchimp member-tags response.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_member_tags",
    description: "Add or remove Mailchimp member tags using the official tag-update endpoint.",
    inputSchema: tagWriteInputSchema,
    outputSchema: successOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_merge_fields",
    description: "List merge fields defined for a Mailchimp audience/list.",
    inputSchema: listMergeFieldsInputSchema,
    outputSchema: createCollectionOutputSchema(
      "merge_fields",
      "Merge field object returned by Mailchimp.",
      "Mailchimp merge-field collection response.",
    ),
  }),
];

function memberLocatorInputSchema(
  description: string,
  extraProperties: Record<string, JsonSchema> = {},
  extraRequired: string[] = [],
): JsonSchema {
  return {
    ...s.object(
      description,
      {
        list_id: listIdField,
        subscriber_hash: subscriberHashField,
        email_address: emailAddressField,
        ...extraProperties,
      },
      { required: ["list_id", ...extraRequired] },
    ),
    anyOf: [{ required: ["subscriber_hash"] }, { required: ["email_address"] }],
  };
}

function createCollectionOutputSchema(key: string, itemDescription: string, description: string): JsonSchema {
  return s.object(
    description,
    {
      [key]: s.array(`Array of ${key} returned by the official Mailchimp API.`, s.looseObject(itemDescription)),
      total_items: s.nonNegativeInteger("Total number of items reported by the official Mailchimp API."),
      _links: s.array(
        "Hypermedia links returned by the official Mailchimp API.",
        s.looseObject("Hypermedia link object returned by Mailchimp."),
      ),
    },
    { required: [key], additionalProperties: true },
  );
}

function createSingleOutputSchema(key: string, itemDescription: string, description: string): JsonSchema {
  return s.object(
    description,
    {
      [key]: s.looseObject(itemDescription),
    },
    { required: [key], additionalProperties: true },
  );
}
