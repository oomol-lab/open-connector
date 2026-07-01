import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "feathery";

const noInputSchema = s.object("No input parameters are required for this action.", {});
const nonEmptyString = (description: string) => s.string(description, { minLength: 1, pattern: "\\S" });
const optionalString = (description: string) => s.string(description);

const formSchema = s.looseRequiredObject(
  "One Feathery form returned by the Forms API.",
  {
    id: nonEmptyString("The Feathery form ID."),
    name: nonEmptyString("The Feathery form name."),
    active: s.boolean("Whether the Feathery form is active."),
    tags: s.array("The tags associated with the form.", s.string("One Feathery form tag.")),
    created_at: nonEmptyString("The timestamp when the form was created."),
    updated_at: nonEmptyString("The timestamp when the form was last updated."),
    internal_id: s.string("The Feathery internal form identifier when returned."),
  },
  { optional: ["id", "name", "active", "tags", "created_at", "updated_at", "internal_id"] },
);

const accountSchema = s.looseRequiredObject(
  "The Feathery account information returned for the API key.",
  {
    team: nonEmptyString("The Feathery team name."),
    accounts: s.array(
      "The accounts belonging to the Feathery team.",
      s.looseRequiredObject(
        "One Feathery account member.",
        {
          id: nonEmptyString("The Feathery account member ID."),
          email: s.email("The account member email address."),
          role: nonEmptyString("The account member role."),
        },
        { optional: ["id", "email", "role"] },
      ),
    ),
  },
  { optional: ["team", "accounts"] },
);

const hiddenFieldSchema = s.looseRequiredObject(
  "One Feathery hidden field.",
  {
    id: nonEmptyString("The hidden field ID."),
    field_id: nonEmptyString("The hidden field ID returned by write endpoints."),
    type: nonEmptyString("The hidden field value type."),
    internal_id: nonEmptyString("The Feathery internal hidden field identifier."),
    created_at: nonEmptyString("The timestamp when the hidden field was created."),
    updated_at: nonEmptyString("The timestamp when the hidden field was last updated."),
  },
  { optional: ["id", "field_id", "type", "internal_id", "created_at", "updated_at"] },
);

const userSchema = s.looseRequiredObject(
  "One Feathery end user.",
  {
    id: nonEmptyString("The Feathery user ID."),
    created_at: nonEmptyString("The timestamp when the user was created."),
    sdk_key: nonEmptyString("The SDK key returned for this Feathery user."),
  },
  { optional: ["id", "created_at", "sdk_key"] },
);

const fieldDataSchema = s.looseRequiredObject(
  "One Feathery field data entry.",
  {
    id: nonEmptyString("The field ID."),
    type: nonEmptyString("The field value type."),
    value: s.unknown("The submitted field value returned by Feathery."),
    hidden: s.boolean("Whether this entry is a hidden field."),
    internal_id: nonEmptyString("The Feathery internal field identifier."),
    display_text: s.string("The human-readable field label when returned."),
    created_at: nonEmptyString("The timestamp when this field was created."),
    updated_at: nonEmptyString("The timestamp when this field was last updated."),
  },
  {
    optional: ["id", "type", "value", "hidden", "internal_id", "display_text", "created_at", "updated_at"],
  },
);

const formIdInputSchema = s.requiredObject("Input payload for one Feathery form.", {
  form_id: nonEmptyString("The Feathery form ID."),
});

const listFormsInputSchema = s.object(
  "Optional filters for listing Feathery forms.",
  {
    tags: s.array("Only return forms that have all of these Feathery tags.", nonEmptyString("One Feathery form tag.")),
  },
  { optional: ["tags"] },
);

const createOrUpdateSubmissionsInputSchema = s.requiredObject(
  "Input payload for creating or updating Feathery form submissions.",
  {
    form_id: nonEmptyString("The Feathery form ID."),
    submissions: s.array(
      "The Feathery submission objects to create or update.",
      s.looseObject({}, { description: "One Feathery submission object." }),
      { minItems: 1 },
    ),
  },
);

const hiddenFieldIdInputSchema = s.requiredObject("Input payload for one Feathery hidden field.", {
  field_id: nonEmptyString("The Feathery hidden field ID."),
});

const editHiddenFieldInputSchema = s.requiredObject("Input payload for editing one Feathery hidden field.", {
  field_id: nonEmptyString("The existing Feathery hidden field ID."),
  new_field_id: nonEmptyString("The replacement Feathery hidden field ID."),
});

const listUsersInputSchema = s.object(
  "Optional filters for listing Feathery users.",
  {
    created_after: optionalString("Return users created on or after this ISO timestamp."),
    created_before: optionalString("Return users created on or before this ISO timestamp."),
    filter_field_id: optionalString("The form or hidden field ID used to filter users."),
    filter_field_value: optionalString("The value matched for filter_field_id."),
  },
  {
    optional: ["created_after", "created_before", "filter_field_id", "filter_field_value"],
  },
);

const userIdInputSchema = s.requiredObject("Input payload for one Feathery user.", {
  id: nonEmptyString("The Feathery user ID."),
});

const userSessionInputSchema = s.requiredObject("Input payload for one Feathery user session.", {
  user_id: nonEmptyString("The Feathery user ID."),
});

export const featheryActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_account_info",
    description: "Retrieve Feathery team and account information for the authenticated API key.",
    inputSchema: noInputSchema,
    outputSchema: s.requiredObject("The normalized Feathery account response.", {
      account: accountSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_forms",
    description: "List Feathery forms, optionally filtered by tags.",
    inputSchema: listFormsInputSchema,
    outputSchema: s.requiredObject("The normalized Feathery form-list response.", {
      forms: s.array("The Feathery forms returned by the API.", formSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_form_schema",
    description: "Retrieve the complete schema for one Feathery form.",
    inputSchema: formIdInputSchema,
    outputSchema: s.requiredObject("The normalized Feathery form-schema response.", {
      schema: s.looseObject({}, { description: "The raw Feathery form schema payload." }),
    }),
  }),
  defineProviderAction(service, {
    name: "create_or_update_form_submissions",
    description: "Create or update Feathery form submissions for one form.",
    inputSchema: createOrUpdateSubmissionsInputSchema,
    outputSchema: s.requiredObject("The normalized Feathery submission write response.", {
      result: s.looseObject({}, { description: "The raw Feathery submission write payload." }),
    }),
  }),
  defineProviderAction(service, {
    name: "list_hidden_fields",
    description: "List hidden fields configured in the Feathery account.",
    inputSchema: noInputSchema,
    outputSchema: s.requiredObject("The normalized Feathery hidden-field list response.", {
      hiddenFields: s.array("The hidden fields returned by Feathery.", hiddenFieldSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "create_hidden_field",
    description: "Create a Feathery hidden field by field ID.",
    inputSchema: hiddenFieldIdInputSchema,
    outputSchema: s.requiredObject("The normalized Feathery hidden-field create response.", {
      hiddenField: hiddenFieldSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "edit_hidden_field",
    description: "Rename or edit a Feathery hidden field by field ID.",
    inputSchema: editHiddenFieldInputSchema,
    outputSchema: s.requiredObject("The normalized Feathery hidden-field edit response.", {
      hiddenField: hiddenFieldSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "delete_hidden_field",
    description: "Delete one Feathery hidden field by field ID.",
    inputSchema: hiddenFieldIdInputSchema,
    outputSchema: s.requiredObject("The normalized Feathery hidden-field delete response.", {
      deleted: s.boolean("Whether the delete request completed successfully."),
      field_id: nonEmptyString("The deleted Feathery hidden field ID."),
      raw: s.unknown("The raw response returned by Feathery."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_users",
    description: "List Feathery users with optional creation-time and field-value filters.",
    inputSchema: listUsersInputSchema,
    outputSchema: s.requiredObject("The normalized Feathery user-list response.", {
      users: s.array("The Feathery users returned by the API.", userSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_user_data",
    description: "Retrieve all Feathery field data, optionally scoped to one user.",
    inputSchema: s.object(
      "Optional input payload for reading Feathery user field data.",
      {
        id: nonEmptyString("The Feathery user ID whose field data should be returned."),
      },
      { optional: ["id"] },
    ),
    outputSchema: s.requiredObject("The normalized Feathery user data response.", {
      fields: s.array("The Feathery field data entries returned by the API.", fieldDataSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_user_session",
    description: "Retrieve Feathery form session and progress data for one user.",
    inputSchema: userSessionInputSchema,
    outputSchema: s.requiredObject("The normalized Feathery user-session response.", {
      session: s.looseObject({}, { description: "The raw Feathery user session payload." }),
    }),
  }),
  defineProviderAction(service, {
    name: "create_or_fetch_user",
    description: "Create a Feathery user or fetch the existing user by ID.",
    inputSchema: userIdInputSchema,
    outputSchema: s.requiredObject("The normalized Feathery create-or-fetch-user response.", {
      user: userSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "delete_user",
    description: "Delete one Feathery user by ID.",
    inputSchema: userIdInputSchema,
    outputSchema: s.requiredObject("The normalized Feathery delete-user response.", {
      deleted: s.boolean("Whether the delete request completed successfully."),
      id: nonEmptyString("The deleted Feathery user ID."),
      raw: s.unknown("The raw response returned by Feathery."),
    }),
  }),
];

export type FeatheryActionName =
  | "get_account_info"
  | "list_forms"
  | "get_form_schema"
  | "create_or_update_form_submissions"
  | "list_hidden_fields"
  | "create_hidden_field"
  | "edit_hidden_field"
  | "delete_hidden_field"
  | "list_users"
  | "get_user_data"
  | "get_user_session"
  | "create_or_fetch_user"
  | "delete_user";
