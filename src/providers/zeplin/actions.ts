import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { zeplinReadScope } from "./scopes.ts";

const service = "zeplin";

const anyObject = s.looseObject("A raw Zeplin object.");
const timestampSchema = s.nonNegativeInteger("A Unix timestamp in seconds.");
const paginationProperties: Record<string, JsonSchema> = {
  limit: s.integer("The maximum number of items to return.", { minimum: 1, maximum: 100 }),
  offset: s.integer("The number of items to skip.", { minimum: 0 }),
};

const emptyInputSchema = s.actionInput({}, [], "The input payload for this action.");
const paginationInputSchema = s.actionInput(paginationProperties, [], "The pagination parameters for this action.");

const rgbaSchema = s.object("The RGBA color values.", {
  r: s.integer("The red channel value.", { minimum: 0, maximum: 255 }),
  g: s.integer("The green channel value.", { minimum: 0, maximum: 255 }),
  b: s.integer("The blue channel value.", { minimum: 0, maximum: 255 }),
  a: s.number("The alpha channel value.", { minimum: 0, maximum: 1 }),
});

const zeplinProjectSummaryProperties: Record<string, JsonSchema> = {
  id: s.string("The unique identifier of the project."),
  name: s.string("The name of the project."),
  platform: s.string("The target platform of the project."),
  status: s.string("The current status of the project."),
  created: timestampSchema,
  updated: s.nonNegativeInteger("The timestamp when the project was last updated."),
  numberOfMembers: s.nonNegativeInteger("The number of project members."),
  numberOfScreens: s.nonNegativeInteger("The number of screens in the project."),
  numberOfComponents: s.nonNegativeInteger("The number of components in the project."),
  numberOfConnectedComponents: s.nonNegativeInteger("The number of connected components."),
  numberOfTextStyles: s.nonNegativeInteger("The number of text styles."),
  numberOfColors: s.nonNegativeInteger("The number of color tokens."),
  numberOfSpacingTokens: s.nonNegativeInteger("The number of spacing tokens."),
  description: s.string("The description of the project."),
  sceneUrl: s.string("The scene URL of the project."),
  thumbnail: s.string("The thumbnail URL of the project."),
  organization: anyObject,
  remPreferences: anyObject,
  workflowStatus: anyObject,
};
const zeplinProjectSummaryOptional = [
  "updated",
  "description",
  "sceneUrl",
  "thumbnail",
  "organization",
  "remPreferences",
  "workflowStatus",
];
const zeplinProjectSummarySchema = s.object("A Zeplin project summary.", zeplinProjectSummaryProperties, {
  optional: zeplinProjectSummaryOptional,
});

const zeplinColorSchema = s.object(
  "A Zeplin color token.",
  {
    id: s.string("The unique identifier of the color."),
    name: s.string("The name of the color."),
    source: anyObject,
    created: timestampSchema,
    color: rgbaSchema,
    description: s.string("The description of the color."),
    hex: s.string("The hex color code."),
  },
  { optional: ["description", "hex"] },
);

const zeplinTextStyleSchema = s.object(
  "A Zeplin text style.",
  {
    id: s.string("The unique identifier of the text style."),
    name: s.string("The name of the text style."),
    source: anyObject,
    created: timestampSchema,
    fontFamily: s.string("The font family name."),
    fontSize: s.number("The font size in points."),
    fontWeight: s.number("The font weight value."),
    fontStyle: s.string("The font style."),
    fontStretch: s.number("The font stretch value."),
    lineHeight: s.number("The line height."),
    letterSpacing: s.number("The letter spacing."),
    textAlign: s.string("The text alignment."),
    color: rgbaSchema,
    description: s.string("The description of the text style."),
  },
  { optional: ["lineHeight", "letterSpacing", "textAlign", "description"] },
);

const zeplinScreenVersionSchema = s.object(
  "A Zeplin screen version.",
  {
    id: s.string("The unique identifier of the screen version."),
    created: timestampSchema,
    commitMessage: s.string("The commit message for the version."),
    version: s.integer("The version number."),
    author: anyObject,
  },
  { optional: ["created", "commitMessage", "version", "author"] },
);

const projectIdSchema = s.nonEmptyString("The project ID.");
const projectInputSchema = (description: string): JsonSchema =>
  s.actionInput({ ...paginationProperties, projectId: projectIdSchema }, ["projectId"], description);

export const zeplinActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    description: "Get the current authenticated Zeplin user profile.",
    requiredScopes: [zeplinReadScope],
    inputSchema: emptyInputSchema,
    outputSchema: s.actionOutput({ user: anyObject }, "The output payload for this action."),
  }),
  defineProviderAction(service, {
    name: "list_personal_projects",
    description: "List projects in the current user's Zeplin personal workspace.",
    requiredScopes: [zeplinReadScope],
    inputSchema: paginationInputSchema,
    outputSchema: s.actionOutput(
      { projects: s.array("The list of projects.", zeplinProjectSummarySchema) },
      "The output payload for this action.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_project",
    description: "Get a Zeplin project by project ID.",
    requiredScopes: [zeplinReadScope],
    inputSchema: s.actionInput(
      { projectId: s.nonEmptyString("The project ID to retrieve.") },
      ["projectId"],
      "The input payload for this action.",
    ),
    outputSchema: s.actionOutput(
      {
        project: s.object(
          "The project detail with optional styleguide.",
          { ...zeplinProjectSummaryProperties, styleguide: anyObject },
          { optional: [...zeplinProjectSummaryOptional, "styleguide"] },
        ),
      },
      "The output payload for this action.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_project_colors",
    description: "List color tokens defined for a Zeplin project.",
    requiredScopes: [zeplinReadScope],
    inputSchema: projectInputSchema("The input payload for this action."),
    outputSchema: s.actionOutput(
      { colors: s.array("The list of color tokens.", zeplinColorSchema) },
      "The output payload for this action.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_project_text_styles",
    description: "List text styles defined for a Zeplin project.",
    requiredScopes: [zeplinReadScope],
    inputSchema: projectInputSchema("The input payload for this action."),
    outputSchema: s.actionOutput(
      { textStyles: s.array("The list of text styles.", zeplinTextStyleSchema) },
      "The output payload for this action.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_screen_versions",
    description:
      "List versions of a Zeplin screen. This action requires both projectId and screenId to match the official endpoint.",
    requiredScopes: [zeplinReadScope],
    inputSchema: s.actionInput(
      {
        ...paginationProperties,
        projectId: projectIdSchema,
        screenId: s.nonEmptyString("The screen ID."),
      },
      ["projectId", "screenId"],
      "The input payload for this action.",
    ),
    outputSchema: s.actionOutput(
      { versions: s.array("The list of screen versions.", zeplinScreenVersionSchema) },
      "The output payload for this action.",
    ),
  }),
];
