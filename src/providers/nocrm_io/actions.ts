import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "nocrm_io";

const identifierField = (description: string): JsonSchema =>
  s.union(
    [
      s.positiveInteger("A positive noCRM.io numeric identifier."),
      s.nonEmptyString("A non-empty noCRM.io identifier string."),
    ],
    { description },
  );
const nullableString = (description: string): JsonSchema => s.nullableString(description);
const nullableNumber = (description: string): JsonSchema => s.nullableNumber(description);
const nullableInteger = (description: string): JsonSchema => s.nullableInteger(description);

const rawObjectSchema = s.looseObject("An arbitrary JSON object returned by noCRM.io.");
const userSchema = s.looseObject("A noCRM.io user object.", {
  id: s.positiveInteger("The noCRM.io user identifier."),
  lastname: s.nonEmptyString("The user's last name."),
  firstname: s.nonEmptyString("The user's first name."),
  email: s.email("The user's email address."),
  is_manager: s.boolean("Whether the user is a team manager."),
});
const teamSchema = s.looseObject("A noCRM.io team object.", {
  id: s.positiveInteger("The noCRM.io team identifier."),
  name: s.nonEmptyString("The noCRM.io team name."),
  users: s.array("Users assigned to the team.", userSchema),
  created_at: s.nonEmptyString("The team creation timestamp."),
  updated_at: s.nonEmptyString("The team update timestamp."),
});
const leadSchema = s.looseObject("A noCRM.io lead object.", {
  id: s.positiveInteger("The noCRM.io lead identifier."),
  title: s.nonEmptyString("The lead title."),
  pipeline: nullableString("The pipeline name returned by noCRM.io."),
  step: s.nonEmptyString("The lead step name."),
  step_id: s.positiveInteger("The lead step identifier."),
  status: s.nonEmptyString("The lead status returned by noCRM.io."),
  amount: nullableNumber("The lead amount returned by noCRM.io."),
  probability: nullableInteger("The lead probability percentage."),
  currency: nullableString("The lead currency code."),
  starred: s.boolean("Whether the lead is starred."),
  created_at: s.nonEmptyString("The lead creation timestamp."),
  updated_at: s.nonEmptyString("The lead update timestamp."),
  closed_at: nullableString("The lead close timestamp."),
  description: s.nonEmptyString("The plain-text lead description."),
  html_description: s.nonEmptyString("The HTML lead description."),
  tags: s.array("Tags assigned to the lead.", s.string("A tag assigned to the lead.")),
  user_id: nullableInteger("The assigned user identifier."),
  team_id: nullableInteger("The assigned team identifier."),
  extended_info: rawObjectSchema,
});
const leadOutputSchema = s.requiredObject("The output payload containing one noCRM.io lead.", {
  lead: leadSchema,
});
const leadIdInputSchema = s.requiredObject("Input containing one noCRM.io lead identifier.", {
  leadId: identifierField("The identifier of the target noCRM.io lead."),
});

export const nocrmIoActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_teams",
    description: "List the teams available in the connected noCRM.io account.",
    inputSchema: s.object({}, { description: "This action does not require any input." }),
    outputSchema: s.requiredObject("The output payload containing noCRM.io teams.", {
      teams: s.array("The noCRM.io teams returned by the request.", teamSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "create_lead",
    description: "Create a lead in noCRM.io with the provided title and description.",
    inputSchema: s.object(
      "Input parameters for creating a noCRM.io lead.",
      {
        title: s.nonEmptyString("The lead title, usually the company name."),
        description: s.nonEmptyString("The lead description, usually containing prospect details."),
        userId: identifierField("The user email address or identifier used for direct assignment."),
        tags: s.stringArray("Lead tags to send to noCRM.io."),
        step: identifierField("The step name or identifier for the new lead."),
        createdAt: s.nonEmptyString("The lead creation timestamp to backfill."),
      },
      { required: ["title", "description"], optional: ["userId", "tags", "step", "createdAt"] },
    ),
    outputSchema: leadOutputSchema,
  }),
  defineProviderAction(service, {
    name: "duplicate_lead",
    description: "Duplicate an existing noCRM.io lead into another step.",
    inputSchema: s.requiredObject("Input parameters for duplicating a noCRM.io lead.", {
      leadId: identifierField("The identifier of the lead to duplicate."),
      step: identifierField("The step name or identifier for the duplicated lead."),
    }),
    outputSchema: leadOutputSchema,
  }),
  defineProviderAction(service, {
    name: "change_lead_status_to_standby",
    description: "Change a noCRM.io lead to standby and schedule its next reminder.",
    inputSchema: s.object(
      "Input parameters for changing a noCRM.io lead to standby.",
      {
        leadId: identifierField("The identifier of the lead to mark as standby."),
        days: s.positiveInteger("The number of days before the reminder becomes due."),
        activityId: s.positiveInteger("The activity identifier to attach to the reminder."),
      },
      { required: ["leadId", "days"], optional: ["activityId"] },
    ),
    outputSchema: leadOutputSchema,
  }),
  defineProviderAction(service, {
    name: "change_lead_status_to_cancelled",
    description: "Change a noCRM.io lead status to cancelled.",
    inputSchema: leadIdInputSchema,
    outputSchema: leadOutputSchema,
  }),
  defineProviderAction(service, {
    name: "assign_lead_to_user",
    description: "Assign a noCRM.io lead to a specific user.",
    inputSchema: s.requiredObject("Input parameters for assigning a noCRM.io lead.", {
      leadId: identifierField("The identifier of the lead to assign."),
      userId: identifierField("The user email address or identifier that should receive the lead."),
    }),
    outputSchema: leadOutputSchema,
  }),
  defineProviderAction(service, {
    name: "add_tag_to_lead",
    description: "Add one or more tags to a noCRM.io lead.",
    inputSchema: s.requiredObject("Input parameters for adding tags to a noCRM.io lead.", {
      leadId: identifierField("The identifier of the lead that should receive the tag."),
      tag: s.nonEmptyString("One tag or a comma-separated tag list accepted by noCRM.io."),
    }),
    outputSchema: leadOutputSchema,
  }),
  defineProviderAction(service, {
    name: "append_to_lead_description",
    description: "Append text to the description of a noCRM.io lead.",
    inputSchema: s.requiredObject("Input parameters for appending text to a noCRM.io lead description.", {
      leadId: identifierField("The identifier of the lead whose description should be updated."),
      toAppend: s.nonEmptyString("The text to append to the lead description."),
    }),
    outputSchema: leadOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_lead",
    description: "Delete a noCRM.io lead.",
    inputSchema: leadIdInputSchema,
    outputSchema: s.requiredObject("The output payload for deleting a noCRM.io lead.", {
      id: s.positiveInteger("The deleted noCRM.io lead identifier."),
    }),
  }),
];
