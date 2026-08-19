import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "klicktipp";

const contactEmailSchema = s.email(
  "The subscriber email address. KlickTipp requires either email or smsnumber for signin, and email for signout and signoff.",
);
const smsNumberSchema = s.nonEmptyString(
  "The subscriber phone number in international format, for example +4912345678 or 004912345678.",
);
const customFieldsSchema = s.record(
  "Additional custom fields for the subscriber. Keys must match KlickTipp field names and values must match the configured field type formats.",
  s.string(
    "A custom field value as a string. Use Unix timestamps in seconds for KlickTipp date, time, and date-time fields.",
  ),
);

const signinInputSchema: JsonSchema = s.object(
  "Input for creating or updating a subscriber through the KlickTipp Listbuilding API signin endpoint.",
  {
    email: contactEmailSchema,
    smsnumber: smsNumberSchema,
    fields: customFieldsSchema,
  },
  { optional: ["email", "smsnumber", "fields"] },
);
signinInputSchema.anyOf = [{ required: ["email"] }, { required: ["smsnumber"] }];

const emailOnlyInputSchema = (description: string): JsonSchema =>
  s.object(description, {
    email: s.email("The subscriber email address."),
  });

const signinOutputSchema = s.object("The KlickTipp Listbuilding signin response.", {
  redirect_urls: s.array(
    "Redirect URLs returned by KlickTipp for the configured opt-in flow.",
    s.url("A redirect URL returned by KlickTipp."),
  ),
});

const booleanResultOutputSchema = s.object("The KlickTipp Listbuilding boolean result.", {
  success: s.boolean("Whether every returned boolean result is true."),
  results: s.array("The raw boolean result array returned by KlickTipp.", s.boolean("A result.")),
});

export const klicktippActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "signin",
    description: "Create or update a subscriber and associate the tag linked to the KlickTipp Listbuilding API key.",
    requiredScopes: [],
    inputSchema: signinInputSchema,
    outputSchema: signinOutputSchema,
  }),
  defineProviderAction(service, {
    name: "signout",
    description: "Remove the tag linked to the KlickTipp Listbuilding API key from a subscriber by email address.",
    requiredScopes: [],
    inputSchema: emailOnlyInputSchema("Input for removing the Listbuilding API key tag."),
    outputSchema: booleanResultOutputSchema,
  }),
  defineProviderAction(service, {
    name: "signoff",
    description: "Unsubscribe a contact by email address through the KlickTipp Listbuilding API key.",
    requiredScopes: [],
    inputSchema: emailOnlyInputSchema("Input for unsubscribing a contact."),
    outputSchema: booleanResultOutputSchema,
  }),
];
