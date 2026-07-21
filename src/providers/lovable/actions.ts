import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "lovable";

export type LovableActionName =
  | "get_me"
  | "list_workspaces"
  | "get_workspace"
  | "create_project"
  | "list_projects"
  | "get_project"
  | "deploy_project"
  | "send_message"
  | "get_message"
  | "list_messages"
  | "get_diff"
  | "list_files"
  | "read_file"
  | "get_database_status"
  | "enable_database"
  | "query_database";

export const lovableActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_me",
    description: "Get authenticated user profile and workspaces.",
    inputSchema: s.object("Input payload for get_me", {}),
    outputSchema: s.looseObject("User profile and workspaces"),
  }),
  defineProviderAction(service, {
    name: "list_workspaces",
    description: "List all workspaces. Paginate with cursors.",
    inputSchema: s.object(
      "Input payload for list_workspaces",
      {
        limit: s.integer({ description: "Limit number of workspaces returned." }),
        offset: s.integer({ description: "Offset for pagination." }),
        cursor: s.string({ description: "Cursor for pagination." }),
      },
      { optional: ["limit", "offset", "cursor"] },
    ),
    outputSchema: s.looseObject("A page of workspaces"),
  }),
  defineProviderAction(service, {
    name: "get_workspace",
    description: "Get workspace details, credits, and settings.",
    inputSchema: s.object("Input payload for get_workspace", {
      workspace_id: s.nonEmptyString("The workspace identifier."),
    }),
    outputSchema: s.looseObject("Workspace details"),
  }),
  defineProviderAction(service, {
    name: "create_project",
    description: "Create a new project using Lovable's default backend stack.",
    inputSchema: s.object(
      "Input payload for create_project",
      {
        workspace_id: s.string({
          description: "The workspace identifier. Required if account has multiple workspaces.",
        }),
        initial_message: s.nonEmptyString("The initial instructions for the project builder agent."),
        files: s.array(
          "Optional files to attach to the project (e.g. design assets, specs).",
          s.looseObject("File attachment details"),
        ),
        template_project_id: s.string({ description: "Optional template project ID to fork from." }),
        design_systems: s.array("Optional design systems to initialize with.", s.string()),
        wait: s.boolean({ description: "Wait for the builder to finish writing initial code. Defaults to true." }),
        timeout_seconds: s.integer({ description: "Custom timeout in seconds if wait is true." }),
      },
      { optional: ["workspace_id", "files", "template_project_id", "design_systems", "wait", "timeout_seconds"] },
    ),
    outputSchema: s.looseObject("Created project details"),
  }),
  defineProviderAction(service, {
    name: "list_projects",
    description: "Search and list projects inside a workspace.",
    inputSchema: s.object(
      "Input payload for list_projects",
      {
        workspace_id: s.nonEmptyString("The workspace identifier."),
        query: s.string({ description: "Optional query to search by name." }),
        visibility: s.stringEnum("Optional visibility filter.", ["draft", "private", "public"]),
        publish_status: s.string({ description: "Optional publish status filter." }),
        folder_id: s.string({ description: "Optional folder ID filter." }),
        user_id: s.string({ description: "Optional user ID filter." }),
        viewed_by_me: s.boolean({ description: "Optional filter for viewed projects." }),
        limit: s.integer({ description: "Limit number of projects returned." }),
        cursor: s.string({ description: "Cursor for pagination." }),
      },
      {
        optional: ["query", "visibility", "publish_status", "folder_id", "user_id", "viewed_by_me", "limit", "cursor"],
      },
    ),
    outputSchema: s.looseObject("A page of projects"),
  }),
  defineProviderAction(service, {
    name: "get_project",
    description: "Get project details and current build status.",
    inputSchema: s.object("Input payload for get_project", {
      project_id: s.nonEmptyString("The project identifier."),
    }),
    outputSchema: s.looseObject("Project details"),
  }),
  defineProviderAction(service, {
    name: "deploy_project",
    description: "Publish the project to a live URL on lovable.app.",
    inputSchema: s.object(
      "Input payload for deploy_project",
      {
        project_id: s.nonEmptyString("The project identifier."),
        name: s.string({ description: "Optional name of the deployment target." }),
      },
      { optional: ["name"] },
    ),
    outputSchema: s.looseObject("Deployment details"),
  }),
  defineProviderAction(service, {
    name: "send_message",
    description: "Send instructions or prompts to a project's AI builder agent.",
    inputSchema: s.object(
      "Input payload for send_message",
      {
        project_id: s.nonEmptyString("The project identifier."),
        message: s.nonEmptyString("The instruction prompt for the agent (1-100k chars)."),
        variant_id: s.string({ description: "Optional variant ID to send the message to." }),
        wait: s.boolean({ description: "Wait for the builder to finish writing code. Defaults to true." }),
        timeout_seconds: s.integer({ description: "Custom timeout in seconds." }),
        plan_mode: s.boolean({ description: "If true, discuss architecture without writing code." }),
        files: s.array(
          "Optional file IDs to attach (from get_file_upload_url).",
          s.looseObject("File attachment details"),
        ),
      },
      { optional: ["variant_id", "wait", "timeout_seconds", "plan_mode", "files"] },
    ),
    outputSchema: s.looseObject("Message send response"),
  }),
  defineProviderAction(service, {
    name: "get_message",
    description: "Retrieve a message's progress or build status.",
    inputSchema: s.object(
      "Input payload for get_message",
      {
        project_id: s.nonEmptyString("The project identifier."),
        message_id: s.nonEmptyString("The message identifier."),
        thread_id: s.string({ description: "Optional thread identifier." }),
      },
      { optional: ["thread_id"] },
    ),
    outputSchema: s.looseObject("Message details"),
  }),
  defineProviderAction(service, {
    name: "list_messages",
    description: "List recent messages newest-first in a project.",
    inputSchema: s.object(
      "Input payload for list_messages",
      {
        project_id: s.nonEmptyString("The project identifier."),
        limit: s.integer({ description: "Limit number of messages returned." }),
        cursor: s.string({ description: "Cursor for pagination." }),
      },
      { optional: ["limit", "cursor"] },
    ),
    outputSchema: s.looseObject("A page of messages"),
  }),
  defineProviderAction(service, {
    name: "get_diff",
    description: "Get unified diff from a message or between commits.",
    inputSchema: s.object(
      "Input payload for get_diff",
      {
        project_id: s.nonEmptyString("The project identifier."),
        message_id: s.string({ description: "Optional message ID to see its changes." }),
        sha: s.string({ description: "Optional commit SHA." }),
        base_sha: s.string({ description: "Optional base commit SHA." }),
      },
      { optional: ["message_id", "sha", "base_sha"] },
    ),
    outputSchema: s.looseObject("The unified diff"),
  }),
  defineProviderAction(service, {
    name: "list_files",
    description: "List files at a given git ref (sha/branch).",
    inputSchema: s.object(
      "Input payload for list_files",
      {
        project_id: s.nonEmptyString("The project identifier."),
        ref: s.string({ description: "Optional git reference (commit SHA or branch name)." }),
        limit: s.integer({ description: "Limit number of files returned." }),
        cursor: s.string({ description: "Cursor for pagination." }),
      },
      { optional: ["ref", "limit", "cursor"] },
    ),
    outputSchema: s.looseObject("A page of files"),
  }),
  defineProviderAction(service, {
    name: "read_file",
    description: "Read a single file's contents at a git ref.",
    inputSchema: s.object("Input payload for read_file", {
      project_id: s.nonEmptyString("The project identifier."),
      path: s.nonEmptyString("The relative file path inside the project."),
      ref: s.nonEmptyString("The git reference (commit SHA or branch name)."),
    }),
    outputSchema: s.looseObject("File contents"),
  }),
  defineProviderAction(service, {
    name: "get_database_status",
    description: "Check if a project database is provisioned.",
    inputSchema: s.object("Input payload for get_database_status", {
      project_id: s.nonEmptyString("The project identifier."),
    }),
    outputSchema: s.looseObject("Database status details"),
  }),
  defineProviderAction(service, {
    name: "enable_database",
    description: "Provision a cloud PostgreSQL database for the project.",
    inputSchema: s.object("Input payload for enable_database", {
      project_id: s.nonEmptyString("The project identifier."),
    }),
    outputSchema: s.looseObject("Database provision details"),
  }),
  defineProviderAction(service, {
    name: "query_database",
    description: "Execute SQL query directly against the project database.",
    inputSchema: s.object("Input payload for query_database", {
      project_id: s.nonEmptyString("The project identifier."),
      sql: s.nonEmptyString("The SQL query to execute."),
    }),
    outputSchema: s.looseObject("Query execution result"),
  }),
];
