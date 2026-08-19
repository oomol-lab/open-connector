import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "byteforms";

const stringOrNumberField = (description: string): JsonSchema =>
  s.union([s.number(description), s.string(description)], { description });
const nullableStringField = (description: string): JsonSchema => s.nullableString(description);

const formBodyItemSchema = s.looseObject("One form body item returned by ByteForms.", {
  component: s.string("The ByteForms component category, such as input."),
  type: s.string("The ByteForms component type, such as text or email."),
  label: s.string("The field label shown in the form builder."),
  placeholder: s.string("The placeholder shown for the field."),
  page: s.integer("The form page that owns this field."),
  index: s.integer("The field index within the form body."),
  id: s.string("The field identifier used in ByteForms responses."),
  required: s.boolean("Whether the field is required."),
});

const formOptionsSchema = s.looseObject("The documented ByteForms form options object.", {
  one_submission_per_email: s.boolean("Whether ByteForms restricts one submission per email."),
  thank_you_message: s.string("The thank-you message shown after submission."),
  max_submissions: s.integer("The maximum number of allowed submissions."),
  stop_submissions_after: nullableStringField("The timestamp after which ByteForms stops accepting submissions."),
  submit_button_text: s.string("The submit button label configured for the form."),
  form_width: s.string("The configured form width mode."),
  redirect_url: s.string("The redirect URL configured after submission."),
  password: s.string("The configured password protection value."),
  theme: s.string("The ByteForms theme name applied to the form."),
  visibility: s.string("The visibility mode configured for the form."),
  page_behaviour: s.string("The page navigation behaviour for the form."),
  custom_code: s.string("The custom code snippet configured for the form."),
  draft_submissions: s.boolean("Whether draft submissions are enabled."),
  remove_branding: s.boolean("Whether ByteForms branding is removed from the form."),
  email_notifications: s.boolean("Whether email notifications are enabled for the form."),
});

const formSchema = s.looseObject("One normalized ByteForms form.", {
  id: stringOrNumberField("The internal ByteForms form ID."),
  public_id: s.string("The public ByteForms form ID."),
  name: s.string("The visible ByteForms form name."),
  body: s.array("The form body definition.", formBodyItemSchema),
  pages: s.unknown("The ByteForms pages payload when present."),
  is_custom: s.boolean("Whether the form is marked as custom."),
  options: formOptionsSchema,
  user_id: stringOrNumberField("The owning ByteForms user ID."),
  created_at: s.string("The timestamp when the form was created."),
  updated_at: s.string("The timestamp when the form was last updated."),
  deleted_at: nullableStringField("The timestamp when the form was deleted, or null when active."),
});

const responseItemSchema = s.looseObject("One normalized ByteForms form response.", {
  id: stringOrNumberField("The ByteForms response ID."),
  form_id: stringOrNumberField("The owning ByteForms form ID."),
  response: s.record("The field-value pairs returned for one form submission.", s.unknown("The raw field value.")),
  options: s.looseObject("The submission options object returned by ByteForms.", {
    ip: s.string("The submitter IP address recorded by ByteForms."),
  }),
  created_at: s.string("The timestamp when the response was created."),
  updated_at: s.string("The timestamp when the response was last updated."),
  deleted_at: nullableStringField("The timestamp when the response was deleted, or null when active."),
});

const cursorSchema = s.actionOutput(
  {
    after: nullableStringField("The cursor to request the next response page, or null when unavailable."),
    before: nullableStringField("The cursor to request the previous response page, or null when unavailable."),
  },
  "The ByteForms response pagination cursors.",
);

const getFormInputSchema = s.actionInput(
  {
    formId: s.nonEmptyString("The ByteForms form ID to retrieve."),
  },
  ["formId"],
  "Input payload for retrieving one ByteForms form.",
);

const listFormResponsesInputSchema = s.object(
  "Input payload for listing ByteForms responses on one form.",
  {
    formId: s.nonEmptyString("The ByteForms form ID whose responses should be listed."),
    limit: s.positiveInteger("The maximum number of responses to return."),
    order: s.stringEnum("The sort order for the response page.", ["asc", "desc"]),
    query: s.string({ minLength: 1, description: "The free-text filter query passed through to ByteForms." }),
    after: s.string({ minLength: 1, description: "The cursor used to request the next response page." }),
    before: s.string({ minLength: 1, description: "The cursor used to request the previous response page." }),
  },
  { required: ["formId"], optional: ["limit", "order", "query", "after", "before"] },
);

export const byteformsActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_forms",
    description: "List forms available to the authenticated ByteForms account.",
    inputSchema: s.actionInput({}, [], "No input parameters are required for this action."),
    outputSchema: s.actionOutput(
      {
        forms: s.array("The forms returned by ByteForms.", formSchema),
      },
      "The normalized ByteForms form-list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_form",
    description: "Get one ByteForms form by form ID.",
    inputSchema: getFormInputSchema,
    outputSchema: s.actionOutput(
      {
        form: formSchema,
      },
      "The normalized ByteForms single-form response.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_form_responses",
    description:
      "List responses for one ByteForms form with the documented cursor, query, order, and limit parameters.",
    inputSchema: listFormResponsesInputSchema,
    outputSchema: s.actionOutput(
      {
        count: s.integer("The number of responses in the current page.", { minimum: 0 }),
        cursor: cursorSchema,
        responses: s.array("The responses returned for the requested form.", responseItemSchema),
      },
      "The normalized ByteForms response-list payload.",
    ),
  }),
];
