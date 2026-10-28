import type { ActionDefinition } from "../../core/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
const projectId = s.integer("Unique identifier of the project.");
const projectName = s.string("Name of the project.");
const status = s.string("Project status: pending, submitted, completed, failed, or refunded.");
const url = s.string("The submitted HTTP or HTTPS URL.", { format: "uri", pattern: "^https?://" });
const projectInput = s.requiredObject("Identify a Rapid URL Indexer project.", { project_id: projectId });
const actions: ActionDefinition[] = [
  defineProviderAction("rapid_url_indexer", {
    name: "create_project",
    asyncLifecycle: {
      startActionId: "rapid_url_indexer.create_project",
      statusActionId: "rapid_url_indexer.get_project",
    },
    operationType: "write",
    requiredScopes: [],
    description:
      "Submit URLs for indexing. Standard submission costs one credit per URL; Apex and Bing add non-refundable charges. Save the project ID: final results may take 14 days.",
    inputSchema: s.object(
      "Create an indexing project.",
      {
        project_name: s.string("Project name, sanitized by the provider.", {
          minLength: 1,
          maxLength: 255,
        }),
        urls: s.array("URLs to submit for indexing.", url, { minItems: 1, maxItems: 9999 }),
        notify_on_status_change: s.boolean(
          "Receive email notifications when the project status changes. Defaults to false.",
        ),
        apex_mode_enabled: s.boolean(
          "Enable Apex Mode for faster Google indexing, adding two non-refundable credits per URL. Defaults to false.",
        ),
        bing_mode_enabled: s.boolean(
          "Enable Bing indexing, adding one non-refundable credit per URL. Defaults to false. Bing indexing is not guaranteed or checked; reports cover Google only.",
        ),
      },
      { optional: ["notify_on_status_change", "apex_mode_enabled", "bing_mode_enabled"] },
    ),
    outputSchema: s.object(
      "Created project and credit charges.",
      {
        project_id: projectId,
        message: s.string("Success message."),
        bing_mode_enabled: s.boolean("Whether Bing indexing was enabled."),
        bing_credits_charged: s.integer("Credits charged for the Bing add-on."),
        credits_charged: s.integer("Total credits charged including add-ons."),
        warnings: s.looseObject(
          "Warnings keyed by code, including bing_unavailable when no Bing credits were charged.",
        ),
      },
      {
        required: ["project_id"],
        additionalProperties: true,
      },
    ),
  }),
  defineProviderAction("rapid_url_indexer", {
    name: "get_project",
    asyncLifecycle: {
      startActionId: "rapid_url_indexer.create_project",
      statusActionId: "rapid_url_indexer.get_project",
    },
    operationType: "read",
    requiredScopes: [],
    description:
      "Read indexing progress for a project. Standard processing may take 14 days; refunded is a completed project with a partial refund.",
    inputSchema: projectInput,
    outputSchema: s.looseObject("Project indexing progress.", {
      project_id: projectId,
      project_name: projectName,
      status,
      urls: s.array("URLs submitted for indexing.", url),
      submitted_links: s.integer("Number of submitted URLs."),
      indexed_links: s.integer("Number of indexed URLs."),
      created_at: s.string("Project creation timestamp."),
      updated_at: s.string("Last update timestamp."),
    }),
  }),
  defineProviderAction("rapid_url_indexer", {
    name: "list_projects",
    operationType: "read",
    requiredScopes: [],
    description: "List all indexing projects, newest first. The API does not expose pagination.",
    inputSchema: s.requiredObject("List all projects.", {}),
    outputSchema: s.looseObject("Project listing.", {
      success: s.boolean("Whether the listing succeeded."),
      projects: s.array(
        "Projects ordered by creation date, newest first.",
        s.looseObject("An indexing project.", {
          id: projectId,
          name: projectName,
          status,
          submitted_urls: s.integer("Number of submitted URLs."),
          indexed_urls: s.integer("Number of indexed URLs."),
          created_at: s.string("Project creation timestamp."),
        }),
      ),
    }),
  }),
  defineProviderAction("rapid_url_indexer", {
    name: "get_project_report",
    operationType: "read",
    requiredScopes: [],
    description:
      "Read a project's Google indexing report as JSON. Initial reports are available after four days; Bing indexing is not checked. A report that is not ready returns an upstream error.",
    inputSchema: projectInput,
    outputSchema: s.looseObject("Google indexing report.", {
      project_id: projectId,
      project_name: projectName,
      total_urls: s.integer("Number of URLs in the report."),
      urls: s.array(
        "Per-URL indexing results.",
        s.looseObject("One URL's indexing result.", {
          url,
          status: s.string("Google indexing status: indexed or not_indexed."),
        }),
      ),
    }),
  }),
  defineProviderAction("rapid_url_indexer", {
    name: "get_credit_balance",
    operationType: "read",
    requiredScopes: [],
    description: "Get the current Rapid URL Indexer credit balance.",
    inputSchema: s.requiredObject("Read the credit balance.", {}),
    outputSchema: s.looseObject("Current credit balance.", {
      credits: s.integer("Available credits."),
    }),
  }),
];
export default actions;
