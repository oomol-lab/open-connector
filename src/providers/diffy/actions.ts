import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "diffy" as const;
const positiveId = (description: string) => s.integer(description, { minimum: 1 });
const rawObject = (description: string) => s.looseObject(description);

const listProjectsAction = defineProviderAction(service, {
  name: "list_projects",
  operationType: "read",
  description: "List the Diffy visual testing projects available to the connected account.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for listing Diffy projects.", {}),
  outputSchema: s.object("The Diffy project list response.", {
    projects: s.array("The projects returned by Diffy.", rawObject("A Diffy project record.")),
  }),
});

const getProjectAction = defineProviderAction(service, {
  name: "get_project",
  operationType: "read",
  description: "Get the current settings and environments for a Diffy project.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for getting a Diffy project.", {
    projectId: positiveId("The Diffy project identifier."),
  }),
  outputSchema: s.object("The Diffy project response.", {
    project: rawObject("The project returned by Diffy."),
  }),
});

const listScreenshotsAction = defineProviderAction(service, {
  name: "list_screenshots",
  operationType: "read",
  description: "List screenshot sets captured for a Diffy project.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for listing Diffy screenshots.", {
    projectId: positiveId("The Diffy project identifier."),
  }),
  outputSchema: s.object("The Diffy screenshot list response.", {
    screenshots: s.array("The screenshot sets returned by Diffy.", rawObject("A Diffy screenshot set.")),
  }),
});

const getScreenshotAction = defineProviderAction(service, {
  name: "get_screenshot",
  operationType: "read",
  description: "Get the current status and result details for a Diffy screenshot set.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for getting a Diffy screenshot set.", {
    screenshotId: positiveId("The Diffy screenshot set identifier."),
  }),
  outputSchema: s.object("The Diffy screenshot response.", {
    screenshot: rawObject("The screenshot set returned by Diffy."),
  }),
});

const listDiffsAction = defineProviderAction(service, {
  name: "list_diffs",
  operationType: "read",
  description: "List visual comparison results for a Diffy project.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for listing Diffy visual comparison results.",
    {
      projectId: positiveId("The Diffy project identifier."),
      page: s.integer("The zero-based Diffy results page to return.", { minimum: 0 }),
    },
    { optional: ["page"] },
  ),
  outputSchema: s.object("The Diffy comparison list response.", {
    diffs: s.array("The visual comparisons returned by Diffy.", rawObject("A Diffy comparison.")),
    page: s.integer("The zero-based page requested from Diffy."),
    totalPages: s.nullable(s.integer("The total page count reported by Diffy when available.")),
  }),
});

const getDiffAction = defineProviderAction(service, {
  name: "get_diff",
  operationType: "read",
  description: "Get the current status and visual change result for a Diffy comparison.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for getting a Diffy comparison.", {
    diffId: positiveId("The Diffy comparison identifier."),
  }),
  outputSchema: s.object("The Diffy comparison response.", {
    diff: rawObject("The visual comparison returned by Diffy."),
  }),
});

export const diffyActions: ActionDefinition[] = [
  listProjectsAction,
  getProjectAction,
  listScreenshotsAction,
  getScreenshotAction,
  listDiffsAction,
  getDiffAction,
];
