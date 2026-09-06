import type { ActionDefinition } from "../../core/types.ts";

import { describe, expect, it } from "vitest";
import { renderActionMarkdown } from "./action-markdown.ts";

const action: ActionDefinition = {
  id: "github.delete_repository",
  service: "github",
  name: "delete_repository",
  description: "Delete a repository.",
  requiredScopes: [],
  providerPermissions: [],
  inputSchema: { type: "object", properties: { repo: { type: "string" } }, required: ["repo"] },
  outputSchema: { type: "object" },
};

describe("renderActionMarkdown", () => {
  it("renders HTTP request examples against the caller's public origin", () => {
    const markdown = renderActionMarkdown(action, {
      transport: { kind: "http", origin: "https://connector.example.com" },
    });

    expect(markdown).toContain("## Execute");
    expect(markdown).toContain(
      "curl -s https://connector.example.com/v1/actions/github.delete_repository \\\n" +
        "  -H 'content-type: application/json' \\\n" +
        `  -d '{"input":{"repo":""}}'`,
    );
    expect(markdown).toContain('fetch("https://connector.example.com/v1/actions/github.delete_repository"');
    expect(markdown).toContain("Use the runtime endpoint above");
    expect(markdown).not.toContain("localhost");
    expect(markdown).not.toContain("execute_action");
  });

  it("renders an execute_action example for MCP callers instead of HTTP requests", () => {
    const markdown = renderActionMarkdown(action, { transport: { kind: "mcp" } });

    expect(markdown).toContain("Call the `execute_action` tool with these arguments:");
    expect(markdown).toContain(
      "```json\n" + JSON.stringify({ actionId: "github.delete_repository", input: { repo: "" } }, null, 2) + "\n```",
    );
    expect(markdown).toContain("Add `connectionName` to run the action with a named connection");
    expect(markdown).toContain("Use the `execute_action` tool above");
    expect(markdown).not.toContain("curl");
    expect(markdown).not.toContain("fetch(");
    expect(markdown).not.toContain("localhost");
  });

  it("renders the current execution policy decision and decisive rule", () => {
    const markdown = renderActionMarkdown(action, {
      transport: { kind: "mcp" },
      policy: {
        allowed: false,
        code: "action_blocked",
        message: "Action is blocked.",
        checks: [{ source: "runtime", outcome: "block_match", rule: "github.delete_repository" }],
      },
    });

    expect(markdown).toContain("## Execution Policy");
    expect(markdown).toContain("Denied: Action is blocked.");
    expect(markdown).toContain("`runtime`: `block_match` via `github.delete_repository`");
  });
});
