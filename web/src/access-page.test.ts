import type { ConnectionRecord, ProviderDefinition } from "./model";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  AccessPage,
  allowedConnectionsFromDraft,
  ConnectionGrantEditor,
  connectionGrantOptions,
  createConnectionGrantDraft,
  policyDraftFromRules,
  policyRulesFromDraft,
  runtimeTokenPolicyBody,
} from "./access-page";
import { PolicyEditor } from "./policy-editor";

vi.mock("@embra/i18n/react", () => ({
  useTranslate() {
    return (key: string, values?: { names?: string }) => (values?.names === undefined ? key : `${key} ${values.names}`);
  },
}));

const githubDefaultId = "11111111-1111-4111-8111-111111111111";
const githubWorkId = "22222222-2222-4222-8222-222222222222";
const slackWorkId = "33333333-3333-4333-8333-333333333333";
const retiredConnectionId = "44444444-4444-4444-8444-444444444444";

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
            allowedConnections: [githubWorkId, slackWorkId, retiredConnectionId],
            createdAt: "2026-07-20T00:00:00.000Z",
          },
        ],
        connections: [
          { id: githubDefaultId, service: "github", connectionName: "default", authType: "oauth2", metadata: {} },
          { id: githubWorkId, service: "github", connectionName: "work", authType: "oauth2", metadata: {} },
          { id: slackWorkId, service: "slack", connectionName: "work", authType: "oauth2", metadata: {} },
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
    expect(markup).toContain("token-policy-connections");
    expect(markup).toContain("GitHub · work, slack · work +1");
    expect(markup).toContain(`title="GitHub · work, slack · work, ${retiredConnectionId}"`);
    expect(markup).not.toContain(`<code>${githubWorkId}</code>`);
    expect(markup).toContain("access.policy.edit");
    expect(markup).toContain('role="combobox"');
    expect(markup).not.toContain("<datalist");
    expect(markup).not.toContain("access.policy.tester.trace");
    expect(markup).not.toContain("access.policy.editor.title");
  });

  it("treats omitted and empty allowedConnections as unrestricted token grants", () => {
    expect(createConnectionGrantDraft()).toEqual({ mode: "unrestricted", ids: [] });
    expect(createConnectionGrantDraft([])).toEqual({ mode: "unrestricted", ids: [] });
    expect(allowedConnectionsFromDraft({ mode: "unrestricted", ids: [githubWorkId] })).toEqual([]);
    expect(
      runtimeTokenPolicyBody(
        { allowedActions: ["github.*"], blockedActions: [], allowedProxies: [] },
        { mode: "unrestricted", ids: [githubWorkId] },
      ),
    ).toEqual({
      allowedActions: ["github.*"],
      blockedActions: [],
      allowedProxies: [],
      allowedConnections: [],
    });
  });

  it("keeps restricted connection grants as exact stable connection IDs", () => {
    expect(createConnectionGrantDraft([githubWorkId, githubDefaultId])).toEqual({
      mode: "restricted",
      ids: [githubWorkId, githubDefaultId],
    });
    expect(
      runtimeTokenPolicyBody(
        { allowedActions: [], blockedActions: [], allowedProxies: ["github"] },
        { mode: "restricted", ids: [githubWorkId] },
      ),
    ).toEqual({
      allowedActions: [],
      blockedActions: [],
      allowedProxies: ["github"],
      allowedConnections: [githubWorkId],
    });
  });

  it("builds one token grant option for each current credential connection", () => {
    const connections: ConnectionRecord[] = [
      { id: githubDefaultId, service: "github", authType: "oauth2", metadata: {} },
      { id: githubWorkId, service: "github", connectionName: " work ", authType: "oauth2", metadata: {} },
      { id: slackWorkId, service: "slack", connectionName: "work", authType: "oauth2", metadata: {} },
      {
        id: "clock:virtual",
        service: "clock",
        connectionName: "virtual",
        authType: "no_auth",
        virtual: true,
        metadata: {},
      },
    ];

    expect(
      connectionGrantOptions(connections, [
        { service: "github", displayName: "GitHub", categories: [], authTypes: [], auth: [], actions: [] },
      ]),
    ).toEqual([
      { id: githubDefaultId, name: "default", provider: "GitHub" },
      { id: githubWorkId, name: "work", provider: "GitHub" },
      { id: slackWorkId, name: "work", provider: "slack" },
    ]);
  });

  it("makes unrestricted and restricted connection grants explicit in the token editor", () => {
    const unrestricted = renderToStaticMarkup(
      createElement(ConnectionGrantEditor, {
        draft: createConnectionGrantDraft(),
        options: [
          { id: githubDefaultId, name: "default", provider: "GitHub" },
          { id: githubWorkId, name: "work", provider: "GitHub" },
          { id: slackWorkId, name: "work", provider: "Slack" },
        ],
        onChange: vi.fn(),
      }),
    );
    const restricted = renderToStaticMarkup(
      createElement(ConnectionGrantEditor, {
        draft: createConnectionGrantDraft([githubWorkId]),
        options: [
          { id: githubDefaultId, name: "default", provider: "GitHub" },
          { id: githubWorkId, name: "work", provider: "GitHub" },
          { id: slackWorkId, name: "work", provider: "Slack" },
        ],
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
    expect(restricted).toContain("GitHub");
    expect(restricted).toContain("Slack");
    expect(restricted).toContain('type="checkbox"');
    expect(restricted).toContain(`value="${githubWorkId}"`);
    expect(restricted).toContain(`value="${slackWorkId}"`);
    expect(restricted).not.toContain('role="combobox"');
  });

  it("keeps a granted connection visible when it no longer exists", () => {
    const markup = renderToStaticMarkup(
      createElement(ConnectionGrantEditor, {
        draft: createConnectionGrantDraft([retiredConnectionId]),
        options: [],
        onChange: vi.fn(),
      }),
    );

    expect(markup).toContain(retiredConnectionId);
    expect(markup).toContain("access.policy.editor.unknownRule");
    expect(markup).toContain('type="checkbox"');
  });

  it("places connection access beside actions and proxies in the token policy tabs", () => {
    const markup = renderToStaticMarkup(
      createElement(PolicyEditor, {
        draft: {
          rules: { allowedActions: [], blockedActions: [], allowedProxies: [], blockedProxies: [] },
          actionAllowMode: "unrestricted",
          proxyAllowMode: "unrestricted",
        },
        providers: [],
        includeProxies: true,
        connectionEditor: createElement(ConnectionGrantEditor, {
          draft: createConnectionGrantDraft(),
          options: [{ id: githubDefaultId, name: "default", provider: "GitHub" }],
          onChange: vi.fn(),
        }),
        onChange: vi.fn(),
      }),
    );

    expect(markup.match(/data-slot="tabs-trigger"/g)).toHaveLength(3);
    expect(markup).toContain("access.policy.editor.actionsTab");
    expect(markup).toContain("access.policy.editor.proxiesTab");
    expect(markup).toContain("access.policy.editor.connectionsTitle");
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
