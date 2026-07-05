import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "felt";

const feltIdSchema = s.nonEmptyString("The Felt resource ID.");
const workspaceIdSchema = s.nonEmptyString("The Felt workspace ID.");
const projectVisibilitySchema = s.stringEnum("The Felt project visibility setting.", ["workspace", "private"]);
const maxInheritedPermissionSchema = s.stringEnum(
  "The maximum permission level workspace members inherit on team-visible projects.",
  ["view_only", "view_and_contribute", "view_and_edit"],
);
const mapPublicAccessSchema = s.stringEnum("The Felt map public access setting.", [
  "private",
  "view_only",
  "view_and_comment",
  "view_comment_and_edit",
]);

const rawUserSchema = s.looseObject("The raw Felt user object returned by the API.", {
  id: s.string("The Felt user ID."),
  name: s.string("The user's display name."),
  email: s.string("The user's email address."),
});
const rawProjectSchema = s.looseObject("The raw Felt project object returned by the API.");
const rawMapSchema = s.looseObject("The raw Felt map object returned by the API.");

const tableSettingsInputSchema = s.object(
  "Map table settings accepted by the Felt API.",
  {
    default_table_layer_id: s.nullable(feltIdSchema),
    viewers_can_open_table: s.boolean("Whether viewers can open the data table."),
  },
  { optional: ["default_table_layer_id", "viewers_can_open_table"] },
);

const viewerPermissionsInputSchema = s.object(
  "Viewer permissions accepted by the Felt API.",
  {
    can_duplicate_map: s.boolean("Whether viewers can duplicate the map and data."),
    can_export_data: s.boolean("Whether viewers can export map data."),
    can_see_map_presence: s.boolean("Whether viewers can see who else is viewing the map."),
  },
  { optional: ["can_duplicate_map", "can_export_data", "can_see_map_presence"] },
);

const mapDestinationInputSchema = s.oneOf(
  [
    s.object("A Felt project destination.", {
      project_id: feltIdSchema,
    }),
    s.object("A Felt folder destination.", {
      folder_id: feltIdSchema,
    }),
  ],
  { description: "The destination project or folder for a Felt map." },
);

const moveMapInputSchema = s.oneOf(
  [
    s.object("Move a Felt map to another project.", {
      map_id: feltIdSchema,
      project_id: feltIdSchema,
    }),
    s.object("Move a Felt map to another folder.", {
      map_id: feltIdSchema,
      folder_id: feltIdSchema,
    }),
  ],
  { description: "The input payload for moving a Felt map." },
);

const userOutputSchema = s.object("The current Felt user response.", {
  user: rawUserSchema,
});

const projectOutputSchema = s.object("A Felt project response.", {
  project: rawProjectSchema,
});

const projectListOutputSchema = s.object("A Felt project list response.", {
  projects: s.array("The Felt projects returned by the API.", rawProjectSchema),
});

const mapOutputSchema = s.object("A Felt map response.", {
  map: rawMapSchema,
});

const deleteProjectOutputSchema = s.object("A Felt project deletion confirmation.", {
  id: feltIdSchema,
  object: s.literal("project", { description: "The deleted Felt object type." }),
  deleted: s.boolean("Whether Felt accepted the project deletion."),
});

const deleteMapOutputSchema = s.object("A Felt map deletion confirmation.", {
  id: feltIdSchema,
  object: s.literal("map", { description: "The deleted Felt object type." }),
  deleted: s.boolean("Whether Felt accepted the map deletion."),
});

export const feltActions: Array<ProviderActionDefinition<FeltActionName>> = [
  defineProviderAction(service, {
    name: "get_current_user",
    description: "Get the Felt user profile for the authenticated API token.",
    inputSchema: s.object("The input payload for retrieving the current Felt user.", {}),
    outputSchema: userOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_projects",
    description: "List Felt projects accessible to the authenticated user.",
    inputSchema: s.object(
      "The input payload for listing Felt projects.",
      {
        workspace_id: workspaceIdSchema,
      },
      { optional: ["workspace_id"] },
    ),
    outputSchema: projectListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_project",
    description: "Create a Felt project in the authenticated workspace.",
    inputSchema: s.object(
      "The input payload for creating a Felt project.",
      {
        name: s.nonEmptyString("The name to use for the Felt project."),
        visibility: projectVisibilitySchema,
        max_inherited_permission: maxInheritedPermissionSchema,
      },
      { optional: ["max_inherited_permission"] },
    ),
    outputSchema: projectOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_project",
    description: "Get one Felt project by ID.",
    inputSchema: s.object("The input payload for retrieving a Felt project.", {
      project_id: feltIdSchema,
    }),
    outputSchema: projectOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_project",
    description: "Update Felt project properties.",
    inputSchema: s.object(
      "The input payload for updating a Felt project.",
      {
        project_id: feltIdSchema,
        name: s.nonEmptyString("The updated Felt project name."),
        visibility: projectVisibilitySchema,
        max_inherited_permission: maxInheritedPermissionSchema,
      },
      { optional: ["name", "visibility", "max_inherited_permission"] },
    ),
    outputSchema: projectOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_project",
    description: "Delete one Felt project by ID.",
    inputSchema: s.object("The input payload for deleting a Felt project.", {
      project_id: feltIdSchema,
    }),
    outputSchema: deleteProjectOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_map",
    description: "Create a Felt map with optional initial metadata.",
    inputSchema: s.object(
      "The input payload for creating a Felt map.",
      {
        title: s.nonEmptyString("The Felt map title."),
        description: s.nonEmptyString("The Felt map description."),
        public_access: mapPublicAccessSchema,
        basemap: s.nonEmptyString("The Felt basemap identifier."),
        lat: s.number("The initial map center latitude."),
        lon: s.number("The initial map center longitude."),
        zoom: s.number("The initial map zoom level."),
        workspace_id: workspaceIdSchema,
        layer_urls: s.array(
          "Layer URLs Felt should import into the new map.",
          s.url("One layer URL for Felt to import."),
          {
            minItems: 1,
          },
        ),
      },
      {
        optional: [
          "title",
          "description",
          "public_access",
          "basemap",
          "lat",
          "lon",
          "zoom",
          "workspace_id",
          "layer_urls",
        ],
      },
    ),
    outputSchema: mapOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_map",
    description: "Get one Felt map by ID.",
    inputSchema: s.object("The input payload for retrieving a Felt map.", {
      map_id: feltIdSchema,
    }),
    outputSchema: mapOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_map",
    description: "Update Felt map metadata and sharing settings.",
    inputSchema: s.object(
      "The input payload for updating a Felt map.",
      {
        map_id: feltIdSchema,
        title: s.nonEmptyString("The updated Felt map title."),
        description: s.nonEmptyString("The updated Felt map description."),
        public_access: mapPublicAccessSchema,
        basemap: s.nonEmptyString("The updated Felt basemap identifier."),
        table_settings: tableSettingsInputSchema,
        viewer_permissions: viewerPermissionsInputSchema,
      },
      { optional: ["title", "description", "public_access", "basemap", "table_settings", "viewer_permissions"] },
    ),
    outputSchema: mapOutputSchema,
  }),
  defineProviderAction(service, {
    name: "duplicate_map",
    description: "Duplicate a Felt map, optionally into another project or folder.",
    inputSchema: s.object(
      "The input payload for duplicating a Felt map.",
      {
        map_id: feltIdSchema,
        title: s.nonEmptyString("The title for the duplicated map."),
        destination: mapDestinationInputSchema,
      },
      { optional: ["title", "destination"] },
    ),
    outputSchema: mapOutputSchema,
  }),
  defineProviderAction(service, {
    name: "move_map",
    description: "Move a Felt map to another project or folder in the same workspace.",
    inputSchema: moveMapInputSchema,
    outputSchema: mapOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_map",
    description: "Delete one Felt map by ID.",
    inputSchema: s.object("The input payload for deleting a Felt map.", {
      map_id: feltIdSchema,
    }),
    outputSchema: deleteMapOutputSchema,
  }),
];

export type FeltActionName =
  | "get_current_user"
  | "list_projects"
  | "create_project"
  | "get_project"
  | "update_project"
  | "delete_project"
  | "create_map"
  | "get_map"
  | "update_map"
  | "duplicate_map"
  | "move_map"
  | "delete_map";
