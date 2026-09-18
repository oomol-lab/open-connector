import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "snyk";

const uuid = (description: string): JsonSchema => s.uuid(description);
const optionalString = (description: string): JsonSchema => s.nonEmptyString(description);
const limit = {
  ...s.integer("Number of Snyk results to return per page. Snyk accepts multiples of 10 from 10 through 100.", {
    minimum: 10,
    maximum: 100,
  }),
  multipleOf: 10,
};
const cursorFields = {
  limit,
  startingAfter: optionalString("Snyk cursor for the page immediately after this cursor."),
  endingBefore: optionalString("Snyk cursor for the page immediately before this cursor."),
};
const resource = s.looseObject("A Snyk JSON:API resource object.");
const links = s.looseObject("Snyk JSON:API pagination or resource links.");
const meta = s.nullable(s.looseObject("Snyk JSON:API metadata when returned."));
const raw = s.looseObject("The raw Snyk JSON:API response payload.");
const collectionFields = { links, meta, raw };
const projectFilter = (description: string): JsonSchema =>
  s.array(description, s.nonEmptyString("One filter value."), { minItems: 1 });
const uuidFilter = (description: string): JsonSchema => s.array(description, uuid("One Snyk UUID."), { minItems: 1 });

export const snykActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_self",
    operationType: "read",
    description: "Fetch the Snyk principal associated with the configured API token.",
    inputSchema: s.actionInput({}, [], "Input for fetching the current Snyk principal."),
    outputSchema: s.actionOutput({ principal: resource, raw }, "The current Snyk principal response."),
  }),
  defineProviderAction(service, {
    name: "list_orgs",
    operationType: "read",
    description: "List Snyk organizations accessible to the configured API token.",
    inputSchema: s.actionInput(
      {
        ...cursorFields,
        groupId: uuid("Only return organizations within this Snyk group ID."),
        isPersonal: s.boolean("Whether to only return organizations that are not part of a group."),
        slug: s.string("Only return organizations whose slug exactly matches this value.", {
          minLength: 1,
          maxLength: 100,
        }),
        name: s.string("Only return organizations whose name contains this value.", { minLength: 1, maxLength: 100 }),
        includeMemberRole: s.boolean("Whether to expand each organization with the caller's member role."),
      },
      [],
      "Filters and pagination options for listing Snyk organizations.",
    ),
    outputSchema: s.actionOutput(
      { organizations: s.array("Snyk organization resources.", resource), ...collectionFields },
      "Snyk organizations accessible to the API token.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_org",
    operationType: "read",
    description: "Fetch one Snyk organization by ID.",
    inputSchema: s.actionInput(
      { orgId: uuid("The Snyk organization ID.") },
      ["orgId"],
      "Input for reading one Snyk organization.",
    ),
    outputSchema: s.actionOutput(
      { orgId: uuid("The requested Snyk organization ID."), organization: resource, raw },
      "One Snyk organization response.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_projects",
    operationType: "read",
    description: "List Snyk projects in an organization with useful filters.",
    inputSchema: s.actionInput(
      {
        ...cursorFields,
        orgId: uuid("The Snyk organization ID that owns the projects."),
        targetIds: uuidFilter("Only return projects that belong to these Snyk target IDs."),
        targetReference: optionalString("Only return projects that match this target reference."),
        targetFile: optionalString("Only return projects that match this target file."),
        targetRuntime: optionalString("Only return projects that match this target runtime."),
        projectIds: uuidFilter("Only return projects that match these Snyk project IDs."),
        names: projectFilter("Only return projects that match these names."),
        namesStartWith: projectFilter("Only return projects with names starting with these prefixes."),
        origins: projectFilter("Only return projects that match these origins."),
        types: projectFilter("Only return projects that match these project types."),
        tags: projectFilter("Only return projects that match all provided key:value tags."),
        businessCriticality: s.array(
          "Snyk business criticality values to match.",
          s.stringEnum("One criticality.", ["critical", "high", "medium", "low"]),
          { minItems: 1 },
        ),
        environment: s.array(
          "Snyk environment values to match.",
          s.stringEnum("One environment.", [
            "frontend",
            "backend",
            "internal",
            "external",
            "mobile",
            "saas",
            "onprem",
            "hosted",
            "distributed",
          ]),
          { minItems: 1 },
        ),
        lifecycle: s.array(
          "Snyk lifecycle values to match.",
          s.stringEnum("One lifecycle.", ["production", "development", "sandbox"]),
          { minItems: 1 },
        ),
        includeTarget: s.boolean("Whether to expand project target relationships."),
        includeLatestIssueCounts: s.boolean("Whether to include latest issue count metadata."),
        includeLatestDependencyTotal: s.boolean("Whether to include latest dependency total metadata."),
        cliMonitoredBefore: s.dateTime("Only return projects monitored before this timestamp."),
        cliMonitoredAfter: s.dateTime("Only return projects monitored after this timestamp."),
      },
      ["orgId"],
      "Filters and pagination options for listing Snyk projects.",
    ),
    outputSchema: s.actionOutput(
      {
        orgId: uuid("The requested organization ID."),
        projects: s.array("Snyk project resources.", resource),
        ...collectionFields,
      },
      "Snyk projects in the requested organization.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_project",
    operationType: "read",
    description: "Fetch one Snyk project by organization ID and project ID.",
    inputSchema: s.actionInput(
      {
        orgId: uuid("The Snyk organization ID."),
        projectId: uuid("The Snyk project ID."),
        includeTarget: s.boolean("Whether to expand target relationships."),
        includeLatestIssueCounts: s.boolean("Whether to include latest issue counts."),
        includeLatestDependencyTotal: s.boolean("Whether to include latest dependency totals."),
      },
      ["orgId", "projectId"],
      "Input for reading one Snyk project.",
    ),
    outputSchema: s.actionOutput(
      { orgId: uuid("The organization ID."), projectId: uuid("The project ID."), project: resource, raw },
      "One Snyk project response.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_org_issues",
    operationType: "read",
    description: "List Snyk issues in an organization with common filters.",
    inputSchema: s.actionInput(
      {
        ...cursorFields,
        orgId: uuid("The Snyk organization ID."),
        scanItemId: uuid("Only return issues related to this scan item ID."),
        scanItemType: optionalString("Only return issues related to this scan item type."),
        type: optionalString("Only return issues of this Snyk issue type."),
        updatedBefore: s.dateTime("Only return issues updated before this timestamp."),
        updatedAfter: s.dateTime("Only return issues updated after this timestamp."),
        createdBefore: s.dateTime("Only return issues created before this timestamp."),
        createdAfter: s.dateTime("Only return issues created after this timestamp."),
        effectiveSeverityLevel: s.array(
          "Effective severity levels to match.",
          s.stringEnum("One severity.", ["info", "low", "medium", "high", "critical"]),
          { minItems: 1 },
        ),
        status: s.array("Issue statuses to match.", s.stringEnum("One status.", ["open", "resolved"]), { minItems: 1 }),
        ignored: s.boolean("Whether to return ignored or non-ignored issues."),
      },
      ["orgId"],
      "Filters and pagination options for listing Snyk issues.",
    ),
    outputSchema: s.actionOutput(
      { orgId: uuid("The organization ID."), issues: s.array("Snyk issue resources.", resource), ...collectionFields },
      "Snyk issues in the requested organization.",
    ),
  }),
];
