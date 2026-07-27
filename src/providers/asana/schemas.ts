import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import {
  asanaCustomFieldFormats,
  asanaCustomFieldInputRestrictions,
  asanaCustomFieldSubtypes,
  asanaCustomLabelPositions,
  asanaEnumOptionColors,
} from "./custom-field-metadata.ts";

export const gidField = (description: string): JsonSchema => s.nonEmptyString(description);

export const includeFieldsSchema: JsonSchema = s.stringArray("Additional Asana fields to request via opt_fields.", {
  minItems: 1,
  itemDescription: "An Asana field name.",
});

export interface AsanaPaginationFields {
  limit: JsonSchema;
  cursor: JsonSchema;
}

export const paginationFields: AsanaPaginationFields = {
  limit: s.integer("Maximum number of items to return in one Asana page.", { minimum: 1, maximum: 100 }),
  cursor: s.nonEmptyString("Opaque pagination cursor returned by a previous Asana response."),
};

export const nextCursorSchema: JsonSchema = s.nullable(
  s.string("Opaque pagination cursor for the next Asana page, or null when there is no next page."),
);

export const successOutputSchema: JsonSchema = s.object("The output payload for this action.", {
  success: s.literal(true, { description: "Whether the Asana operation completed successfully." }),
});

function namedResourceSchema(description: string): JsonSchema {
  return s.looseObject(description, {
    gid: s.string("The resource gid."),
    resource_type: s.string("The resource type."),
    name: s.string("The resource name."),
  });
}

export const resourceRefSchema: JsonSchema = namedResourceSchema("A compact Asana resource reference.");
export const userCompactSchema: JsonSchema = namedResourceSchema("A compact Asana user.");
export const workspaceCompactSchema: JsonSchema = namedResourceSchema("A compact Asana workspace.");
export const teamCompactSchema: JsonSchema = namedResourceSchema("A compact Asana team.");
export const projectCompactSchema: JsonSchema = namedResourceSchema("A compact Asana project.");
export const sectionCompactSchema: JsonSchema = namedResourceSchema("A compact Asana project section.");
export const taskCompactSchema: JsonSchema = s.looseObject("A compact Asana task.", {
  gid: s.string("The task gid."),
  resource_type: s.string("The resource type."),
  name: s.string("The task name."),
  resource_subtype: s.stringEnum("The task subtype.", ["default_task", "milestone", "approval", "custom"]),
});

export const jobSchema: JsonSchema = s.looseObject("An asynchronous Asana job.", {
  gid: s.string("The job gid."),
  resource_type: s.string("The resource type."),
  resource_subtype: s.string("The job subtype."),
  status: s.stringEnum("The current job status.", ["not_started", "in_progress", "succeeded", "failed"]),
  new_project: s.nullable(projectCompactSchema),
  new_task: s.nullable(taskCompactSchema),
});

export const workspaceSchema: JsonSchema = s.looseObject("An Asana workspace.", {
  gid: s.string("The workspace gid."),
  resource_type: s.string("The resource type."),
  name: s.string("The workspace name."),
  email_domains: s.array("The workspace email domains.", s.string("A workspace email domain.")),
  is_organization: s.boolean("Whether the workspace is an organization."),
});

export const enumOptionSchema: JsonSchema = s.looseObject("An Asana custom field enum option.", {
  gid: s.string("The enum option gid."),
  resource_type: s.string("The resource type."),
  name: s.string("The enum option name."),
  enabled: s.boolean("Whether the enum option is enabled."),
  color: s.stringEnum("The enum option color.", asanaEnumOptionColors),
});

const customFieldValueFields: Record<string, JsonSchema> = {
  gid: s.string("The custom field gid."),
  resource_type: s.string("The resource type."),
  name: s.string("The custom field name."),
  type: s.stringEnum("The legacy custom field type.", asanaCustomFieldSubtypes),
  enum_options: s.array("The custom field enum options.", enumOptionSchema),
  enabled: s.boolean("Whether this custom field value is enabled."),
  representation_type: s.stringEnum("The custom field representation type.", [
    "text",
    "enum",
    "multi_enum",
    "number",
    "date",
    "people",
    "formula",
    "custom_id",
    "reference",
  ]),
  id_prefix: s.nullable(s.string("The prefix used by custom ID fields.")),
  input_restrictions: s.array(
    "The resource types accepted by a reference custom field.",
    s.stringEnum("A permitted resource type.", asanaCustomFieldInputRestrictions),
  ),
  is_formula_field: s.boolean("Whether this is a formula custom field."),
  date_value: s.nullable(
    s.looseObject("The selected date value.", {
      date: s.string("The selected date."),
      date_time: s.string("The selected date-time."),
    }),
  ),
  enum_value: s.nullable(enumOptionSchema),
  multi_enum_values: s.array("Selected multi-enum values.", enumOptionSchema),
  number_value: s.nullable(s.number("The number custom field value.")),
  text_value: s.nullable(s.string("The text custom field value.")),
  display_value: s.nullable(s.string("The rendered custom field value.")),
};

const compactCustomFieldSchema: JsonSchema = s.looseObject("A compact Asana custom field.", customFieldValueFields);

const userPhotoSchema = s.looseObject("The user's profile photo URLs.", {
  image_21x21: s.string("URL for the 21-pixel profile photo."),
  image_27x27: s.string("URL for the 27-pixel profile photo."),
  image_36x36: s.string("URL for the 36-pixel profile photo."),
  image_60x60: s.string("URL for the 60-pixel profile photo."),
  image_128x128: s.string("URL for the 128-pixel profile photo."),
  image_1024x1024: s.string("URL for the 1024-pixel profile photo."),
});

export const userSchema: JsonSchema = s.looseObject("An Asana user.", {
  gid: s.string("The user gid."),
  resource_type: s.string("The resource type."),
  name: s.string("The user's display name."),
  email: s.string("The user's email address."),
  photo: s.nullable(userPhotoSchema),
  workspaces: s.array("Workspaces available to the user.", workspaceCompactSchema),
  custom_fields: s.array("Custom fields returned for the user.", compactCustomFieldSchema),
});

const teamAdministrationAccessLevelSchema = s.stringEnum("The team administration access level.", [
  "all_team_members",
  "only_team_admins",
]);

const compactCustomFieldSettingSchema = s.looseObject("An Asana custom field setting.", {
  gid: s.string("The custom field setting gid."),
  resource_type: s.string("The resource type."),
  project: projectCompactSchema,
  is_important: s.boolean("Whether the custom field is marked important."),
  parent: projectCompactSchema,
  custom_field: compactCustomFieldSchema,
});

export const teamSchema: JsonSchema = s.looseObject("An Asana team.", {
  gid: s.string("The team gid."),
  resource_type: s.string("The resource type."),
  name: s.string("The team name."),
  description: s.string("The plain-text team description."),
  html_description: s.string("The HTML team description."),
  organization: workspaceCompactSchema,
  permalink_url: s.string("The Asana permalink for the team."),
  visibility: s.stringEnum("The team's visibility within its organization.", ["public", "request_to_join", "secret"]),
  edit_team_name_or_description_access_level: teamAdministrationAccessLevelSchema,
  edit_team_visibility_or_trash_team_access_level: teamAdministrationAccessLevelSchema,
  member_invite_management_access_level: teamAdministrationAccessLevelSchema,
  guest_invite_management_access_level: teamAdministrationAccessLevelSchema,
  join_request_management_access_level: teamAdministrationAccessLevelSchema,
  team_member_removal_access_level: teamAdministrationAccessLevelSchema,
  team_content_management_access_level: s.stringEnum("Who can create and share content with the team.", [
    "no_restriction",
    "only_team_admins",
  ]),
  endorsed: s.boolean("Whether the team is endorsed by the organization."),
  custom_field_settings: s.array("Custom field settings applied to the team.", compactCustomFieldSettingSchema),
});

export const projectSchema: JsonSchema = s.looseObject("An Asana project.", {
  gid: s.string("The project gid."),
  resource_type: s.string("The resource type."),
  name: s.string("The project name."),
  archived: s.boolean("Whether the project is archived."),
  completed: s.boolean("Whether the project is completed."),
  completed_at: s.nullable(s.string("The project completion timestamp.")),
  completed_by: s.nullable(userCompactSchema),
  color: s.nullable(s.string("The project color.")),
  icon: s.nullable(s.string("The project icon.")),
  notes: s.string("The project notes."),
  html_notes: s.string("The project notes formatted as HTML."),
  due_on: s.nullable(s.string("The project due date.")),
  start_on: s.nullable(s.string("The project start date.")),
  default_view: s.string("The project default view."),
  privacy_setting: s.string("The project privacy setting."),
  default_access_level: s.string("The project default access level."),
  minimum_access_level_for_customization: s.string(
    "The minimum project access level required to customize the project.",
  ),
  minimum_access_level_for_sharing: s.string("The minimum project access level required to share the project."),
  created_at: s.string("The project creation timestamp."),
  modified_at: s.string("The project update timestamp."),
  permalink_url: s.string("The project permalink URL."),
  owner: s.nullable(userCompactSchema),
  workspace: workspaceCompactSchema,
  team: teamCompactSchema,
  members: s.array("Users who are members of the project.", userCompactSchema),
  followers: s.array("Users following the project.", userCompactSchema),
  custom_fields: s.array(
    "Custom fields returned by Asana.",
    s.record("A custom field response object.", s.unknown("A custom field value.")),
  ),
});

export const sectionSchema: JsonSchema = s.looseObject("An Asana project section.", {
  gid: s.string("The section gid."),
  resource_type: s.string("The resource type."),
  name: s.string("The section name."),
  created_at: s.string("The section creation timestamp."),
  project: projectCompactSchema,
});

export const taskSchema: JsonSchema = s.looseObject("An Asana task.", {
  gid: s.string("The task gid."),
  resource_type: s.string("The resource type."),
  name: s.string("The task name."),
  resource_subtype: s.string("The task subtype."),
  completed: s.boolean("Whether the task is completed."),
  notes: s.string("The task notes."),
  due_on: s.nullable(s.string("The task due date.")),
  due_at: s.nullable(s.string("The task due date-time.")),
  start_on: s.nullable(s.string("The task start date.")),
  start_at: s.nullable(s.string("The task start date-time.")),
  created_at: s.string("The task creation timestamp."),
  modified_at: s.string("The task update timestamp."),
  completed_at: s.nullable(s.string("The task completion timestamp.")),
  permalink_url: s.string("The task permalink URL."),
  approval_status: s.string("The task approval status."),
  assignee: s.nullable(userCompactSchema),
  workspace: workspaceCompactSchema,
  parent: s.nullable(taskCompactSchema),
  projects: s.array("Projects linked to the task.", projectCompactSchema),
  memberships: s.array(
    "Memberships returned by Asana.",
    s.looseObject("A task membership.", {
      project: projectCompactSchema,
      section: sectionCompactSchema,
    }),
  ),
  custom_fields: s.array(
    "Custom fields returned by Asana.",
    s.record("A custom field response object.", s.unknown("A custom field value.")),
  ),
});

export const storyStickerNames: readonly string[] = [
  "green_checkmark",
  "people_dancing",
  "dancing_unicorn",
  "heart",
  "party_popper",
  "people_waving_flags",
  "splashing_narwhal",
  "trophy",
  "yeti_riding_unicorn",
  "celebrating_people",
  "determined_climbers",
  "phoenix_spreading_love",
];

export const storySchema: JsonSchema = s.looseObject("An Asana story or task comment.", {
  gid: s.string("The story gid."),
  resource_type: s.string("The resource type."),
  resource_subtype: s.string("The story subtype."),
  type: s.string("The legacy story type."),
  text: s.string("The plain-text story content."),
  html_text: s.string("The HTML story content."),
  created_at: s.string("The story creation timestamp."),
  created_by: userCompactSchema,
  is_edited: s.boolean("Whether the story has been edited."),
  is_pinned: s.boolean("Whether the story is pinned."),
  sticker_name: s.nullable(s.stringEnum("The story sticker name.", storyStickerNames)),
  target: taskCompactSchema,
});

export const tagSchema: JsonSchema = s.looseObject("An Asana tag.", {
  gid: s.string("The tag gid."),
  resource_type: s.string("The resource type."),
  name: s.string("The tag name."),
  color: s.nullable(s.string("The tag color.")),
  notes: s.string("The tag notes."),
  created_at: s.string("The tag creation timestamp."),
  permalink_url: s.string("The Asana permalink for the tag."),
  workspace: workspaceCompactSchema,
  followers: s.array("Users following the tag.", userCompactSchema),
});

export const attachmentSchema: JsonSchema = s.looseObject("An Asana attachment.", {
  gid: s.string("The attachment gid."),
  resource_type: s.string("The resource type."),
  resource_subtype: s.string("The attachment subtype."),
  name: s.string("The attachment name."),
  created_at: s.string("The attachment creation timestamp."),
  download_url: s.nullable(s.string("A temporary attachment download URL.")),
  permanent_url: s.nullable(s.string("The permanent Asana attachment URL.")),
  view_url: s.nullable(s.string("A URL for viewing the attachment.")),
  host: s.string("The service hosting the attachment."),
  parent: s.nullable(taskCompactSchema),
  size: s.integer("The attachment size in bytes."),
  connected_to_app: s.boolean("Whether the attachment is connected to an external app."),
});

export const customFieldSchema: JsonSchema = s.looseObject("An Asana custom field.", {
  ...customFieldValueFields,
  description: s.string("The custom field description."),
  precision: s.integer("The number field precision."),
  format: s.stringEnum("The custom field display format.", asanaCustomFieldFormats),
  currency_code: s.nullable(s.string("The ISO currency code for currency fields.")),
  custom_label: s.nullable(s.string("The label displayed beside the custom field value.")),
  custom_label_position: s.nullable(s.stringEnum("Where the custom label is displayed.", asanaCustomLabelPositions)),
  is_global_to_workspace: s.boolean("Whether the custom field is available to every workspace container."),
  has_notifications_enabled: s.boolean("Whether changes to the field notify task followers."),
  asana_created_field: s.nullable(s.string("The Asana template source identifier for this field.")),
  is_value_read_only: s.boolean("Whether the custom field value is read-only."),
  created_by: s.nullable(userCompactSchema),
  people_value: s.array("Selected people values.", userCompactSchema),
  reference_value: s.array("Selected resource values.", resourceRefSchema),
  html_text_value: s.nullable(s.string("The HTML custom field text value.")),
  privacy_setting: s.stringEnum("The custom field privacy setting.", ["public_with_guests", "public", "private"]),
  default_access_level: s.stringEnum("The default access level for new custom field members.", [
    "admin",
    "editor",
    "user",
  ]),
  resource_subtype: s.stringEnum("The custom field subtype.", asanaCustomFieldSubtypes),
});

export const customFieldSettingSchema: JsonSchema = s.looseObject("An Asana custom field setting.", {
  gid: s.string("The custom field setting gid."),
  resource_type: s.string("The resource type."),
  custom_field: customFieldSchema,
  is_important: s.boolean("Whether the custom field is marked important."),
  parent: resourceRefSchema,
  project: projectCompactSchema,
});
