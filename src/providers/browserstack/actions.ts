import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "browserstack";

const buildStatusSchema = s.stringEnum("A BrowserStack Automate build status filter.", [
  "running",
  "done",
  "timeout",
  "failed",
]);
const sessionStatusSchema = s.stringEnum("A BrowserStack Automate session status.", ["passed", "failed"]);
const idSchema = (description: string) => s.nonEmptyString(description);
const paginationInputSchema = {
  limit: s.integer("The number of results to return. BrowserStack accepts 1 to 100.", {
    minimum: 1,
    maximum: 100,
  }),
  offset: s.nonNegativeInteger("The zero-based result offset."),
};
const automationBuildSchema = s.looseRequiredObject(
  "A BrowserStack Automate build record.",
  {
    name: s.string("The build name."),
    hashed_id: s.string("The BrowserStack build identifier."),
    duration: s.integer("The build execution duration."),
    status: s.string("The build status."),
    build_tag: s.nullable(s.string("The build tag, when present.")),
    public_url: s.string("The BrowserStack dashboard URL for the build."),
  },
  { optional: ["name", "hashed_id", "duration", "status", "build_tag", "public_url"] },
);
const automationSessionSchema = s.looseRequiredObject(
  "A BrowserStack Automate session record.",
  {
    name: s.string("The session name."),
    duration: s.integer("The session execution duration."),
    os: s.string("The session operating system."),
    os_version: s.string("The session operating system version."),
    browser_version: s.string("The browser version used for the session."),
    browser: s.string("The browser used for the session."),
    device: s.nullable(s.string("The device used for the session, when present.")),
    status: s.string("The session status."),
    hashed_id: s.string("The BrowserStack session identifier."),
    reason: s.nullable(s.string("The test status reason, when present.")),
    build_name: s.string("The build name containing the session."),
    project_name: s.string("The project name containing the session."),
    logs: s.string("The URL for the session logs."),
    browser_url: s.string("The BrowserStack dashboard URL for the session."),
    public_url: s.string("The public URL for the session."),
    video_url: s.string("The session video URL."),
    browser_console_logs_url: s.string("The browser console logs URL."),
    har_logs_url: s.string("The HAR logs URL."),
    selenium_logs_url: s.string("The Selenium logs URL."),
  },
  {
    optional: [
      "name",
      "duration",
      "os",
      "os_version",
      "browser_version",
      "browser",
      "device",
      "status",
      "hashed_id",
      "reason",
      "build_name",
      "project_name",
      "logs",
      "browser_url",
      "public_url",
      "video_url",
      "browser_console_logs_url",
      "har_logs_url",
      "selenium_logs_url",
    ],
  },
);

export const browserstackActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_builds",
    operationType: "read",
    description: "List recent BrowserStack Automate builds with optional status, project, and pagination filters.",
    inputSchema: s.object(
      "Filters for listing BrowserStack Automate builds.",
      {
        ...paginationInputSchema,
        status: buildStatusSchema,
        project_id: s.integer("Only return builds for this BrowserStack project ID.", {
          minimum: 1,
        }),
      },
      { optional: ["limit", "offset", "status", "project_id"] },
    ),
    outputSchema: s.requiredObject("The BrowserStack Automate build list.", {
      builds: s.array("BrowserStack Automate builds.", automationBuildSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_build_sessions",
    operationType: "read",
    description: "List BrowserStack Automate sessions for a build.",
    inputSchema: s.object(
      "Filters for listing sessions in a BrowserStack Automate build.",
      {
        build_id: idSchema("The BrowserStack build hashed_id."),
        ...paginationInputSchema,
        status: s.string("Only return sessions with this BrowserStack status."),
      },
      { optional: ["limit", "offset", "status"] },
    ),
    outputSchema: s.requiredObject("The BrowserStack Automate session list.", {
      sessions: s.array("BrowserStack Automate sessions.", automationSessionSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_session",
    operationType: "read",
    description: "Retrieve details for a BrowserStack Automate session.",
    inputSchema: s.requiredObject("Input for retrieving a BrowserStack Automate session.", {
      session_id: idSchema("The BrowserStack session hashed_id."),
    }),
    outputSchema: s.requiredObject("The BrowserStack Automate session details.", {
      session: automationSessionSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_session_status",
    operationType: "write",
    description: "Mark a BrowserStack Automate session as passed or failed with a reason.",
    inputSchema: s.requiredObject("Input for updating a BrowserStack Automate session status.", {
      session_id: idSchema("The BrowserStack session hashed_id."),
      status: sessionStatusSchema,
      reason: s.nonEmptyString("The reason to store with the BrowserStack session status."),
    }),
    outputSchema: s.requiredObject("The updated BrowserStack Automate session details.", {
      session: automationSessionSchema,
    }),
  }),
];
