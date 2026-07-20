import type { ProviderDefinition } from "./model";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AccessPage, policyDraftFromRules, policyRulesFromDraft } from "./access-page";

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
            createdAt: "2026-07-20T00:00:00.000Z",
          },
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
    expect(markup).toContain("access.policy.edit");
    expect(markup).toContain('role="combobox"');
    expect(markup).not.toContain("<datalist");
    expect(markup).not.toContain("access.policy.tester.trace");
    expect(markup).not.toContain("access.policy.editor.title");
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
