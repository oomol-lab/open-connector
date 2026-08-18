import type { ConnectionRecord, ProviderDefinition } from "./model";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  AccessPage,
  allowedConnectionsFromDraft,
  ConnectionGrantEditor,
  connectionNameSuggestions,
  createConnectionGrantDraft,
  parseConnectionNames,
  policyDraftFromRules,
  policyRulesFromDraft,
  runtimeTokenPolicyBody,
} from "./access-page";

vi.mock("@embra/i18n/react", () => ({
  useTranslate() {
    return (key: string) => key;
  },
}));

describe("AccessPage", () => {
  it("shows deployment, Runtime, and token policy state", () => {
    const providers: ProviderDefinition[] = [
      {
        service: "github",
        displayName: "GitHub",
        categories: [],
        authTypes: [],
        auth: [],
        actions: [
          {
            id: "github.create_issue",
            service: "github",
            name: "create_issue",
            description: "Create an issue",
            requiredScopes: [],
            inputSchema: {},
            outputSchema: {},
            execution: {
              locallyExecutable: true,
              catalogOnly: false,
              requiredAuthTypes: [],
              noAuthRunnable: true,
              needsCredential: false,
            },
          },
        ],
      },
    ];
    const markup = renderToStaticMarkup(
      createElement(AccessPage, {
        providers,
        policy: {
          deployment: {
            allowedActions: ["github.*"],
            blockedActions: ["github.delete_repository"],
            allowedProxies: [],
            blockedProxies: ["*"],
          },
          runtime: {
            allowedActions: ["github.create_issue"],
            blockedActions: [],
            allowedProxies: ["github"],
            blockedProxies: [],
          },
        },
        tokens: [
          {
            id: "token-1",
            name: "Issue bot",
            allowedActions: ["github.*"],
            blockedActions: ["github.delete_repository"],
            allowedProxies: ["github"],
            allowedConnections: [],
            createdAt: "2026-07-20T00:00:00.000Z",
          },
          {
            id: "token-2",
            name: "Work bot",
            allowedActions: [],
            blockedActions: [],
            allowedProxies: [],
            allowedConnections: ["work"],
            createdAt: "2026-07-20T00:00:00.000Z",
          },
        ],
        connections: [
          { service: "github", connectionName: "default", authType: "oauth2", metadata: {} },
          { service: "github", connectionName: "work", authType: "oauth2", metadata: {} },
        ],
        onRefresh: vi.fn(),
      }),
    );

    expect(markup).toContain("access.policy.baseline.title");
    expect(markup).toContain("access.policy.deploymentSummary.title");
    expect(markup).toContain("access.policy.runtimeSummary.title");
    expect(markup).not.toContain("github.create_issue");
    expect(markup).toContain("github.delete_repository");
    expect(markup).toContain("Issue bot");
    expect(markup).toContain("Work bot");
    expect(markup).toContain("access.policy.connectionsUnrestricted");
    expect(markup).toContain("access.policy.connectionsRestricted");
    expect(markup).toContain("work");
    expect(markup).toContain("access.policy.edit");
    expect(markup).toContain('role="combobox"');
    expect(markup).not.toContain("<datalist");
    expect(markup).not.toContain("access.policy.tester.trace");
    expect(markup).not.toContain("access.policy.editor.title");
  });

  it("treats omitted and empty allowedConnections as unrestricted token grants", () => {
    expect(createConnectionGrantDraft()).toEqual({ mode: "unrestricted", names: [] });
    expect(createConnectionGrantDraft([])).toEqual({ mode: "unrestricted", names: [] });
    expect(allowedConnectionsFromDraft({ mode: "unrestricted", names: ["work"] })).toEqual([]);
    expect(
      runtimeTokenPolicyBody(
        { allowedActions: ["github.*"], blockedActions: [], allowedProxies: [] },
        { mode: "unrestricted", names: ["work"] },
      ),
    ).toEqual({
      allowedActions: ["github.*"],
      blockedActions: [],
      allowedProxies: [],
      allowedConnections: [],
    });
  });

  it("keeps restricted connection grants as exact normalized bare names", () => {
    expect(createConnectionGrantDraft(["work", "default"])).toEqual({
      mode: "restricted",
      names: ["work", "default"],
    });
    expect(parseConnectionNames(" work \n\nwork\ndefault ")).toEqual(["work", "default"]);
    expect(parseConnectionNames("work*")).toEqual([]);
    expect(
      runtimeTokenPolicyBody(
        { allowedActions: [], blockedActions: [], allowedProxies: ["github"] },
        { mode: "restricted", names: ["work"] },
      ),
    ).toEqual({
      allowedActions: [],
      blockedActions: [],
      allowedProxies: ["github"],
      allowedConnections: ["work"],
    });
  });

  it("suggests default plus current connection names for token grants", () => {
    const connections: ConnectionRecord[] = [
      { service: "github", authType: "oauth2", metadata: {} },
      { service: "github", connectionName: " work ", authType: "oauth2", metadata: {} },
      { service: "slack", connectionName: "work", authType: "oauth2", metadata: {} },
      { service: "clock", connectionName: "virtual", authType: "no_auth", virtual: true, metadata: {} },
    ];

    expect(connectionNameSuggestions(connections)).toEqual(["default", "work", "virtual"]);
  });

  it("makes unrestricted and restricted connection grants explicit in the token editor", () => {
    const unrestricted = renderToStaticMarkup(
      createElement(ConnectionGrantEditor, {
        draft: createConnectionGrantDraft(),
        suggestions: ["default", "work"],
        onChange: vi.fn(),
      }),
    );
    const restricted = renderToStaticMarkup(
      createElement(ConnectionGrantEditor, {
        draft: createConnectionGrantDraft(["work"]),
        suggestions: ["default", "work"],
        onChange: vi.fn(),
      }),
    );

    expect(unrestricted).toContain("access.policy.editor.connectionsTitle");
    expect(unrestricted).toContain("access.policy.editor.connectionsUnrestrictedHint");
    expect(unrestricted).not.toContain("access.policy.editor.connectionsList");
    expect(restricted).toContain("access.policy.editor.connectionsRestrictedHint");
    expect(restricted).toContain("access.policy.editor.connectionsList");
    expect(restricted).toContain("access.policy.editor.connectionsDefaultHint");
    expect(restricted).toContain("work");
  });

  it("serializes one policy rule per non-empty trimmed line", () => {
    const rules = policyRulesFromDraft({
      allowedActions: " github.*\n\ngithub.create_issue ",
      blockedActions: "",
      allowedProxies: " github ",
      blockedProxies: "*\n",
    });

    expect(rules).toEqual({
      allowedActions: ["github.*", "github.create_issue"],
      blockedActions: [],
      allowedProxies: ["github"],
      blockedProxies: ["*"],
    });
    expect(policyDraftFromRules(rules)).toEqual({
      allowedActions: "github.*\ngithub.create_issue",
      blockedActions: "",
      allowedProxies: "github",
      blockedProxies: "*",
    });
  });
});
