import type { ProviderDefinition, RuntimePolicyState } from "./model";

import { describe, expect, it } from "vitest";
import {
  countAllowedActions,
  createPolicyEditorDraft,
  evaluatePolicy,
  filterPolicyRuleCandidates,
  policyLayers,
  policyRuleCandidates,
  policyRulesFromEditorDraft,
  validatePolicyEditorDraft,
} from "./policy";

const emptyRules = { allowedActions: [], blockedActions: [], allowedProxies: [], blockedProxies: [] };

describe("web policy evaluation", () => {
  it("applies block rules before allowlist misses across layers", () => {
    const result = evaluatePolicy("github.delete_repository", "action", [
      {
        source: "deployment",
        rules: { ...emptyRules, allowedActions: ["slack.*"] },
      },
      {
        source: "runtime",
        rules: { ...emptyRules, blockedActions: ["github.delete_repository"] },
      },
    ]);

    expect(result).toMatchObject({ allowed: false, code: "action_blocked" });
    expect(result.trace).toEqual([
      { source: "deployment", outcome: "allow_miss" },
      { source: "runtime", outcome: "block_match", rule: "github.delete_repository" },
    ]);
  });

  it("intersects each non-empty action allowlist", () => {
    const result = evaluatePolicy("github.create_issue", "action", [
      { source: "deployment", rules: { ...emptyRules, allowedActions: ["github.*"] } },
      { source: "runtime", rules: { ...emptyRules, allowedActions: ["github.get_issue"] } },
    ]);

    expect(result).toMatchObject({ allowed: false, code: "action_not_allowed" });
    expect(result.trace).toEqual([
      { source: "deployment", outcome: "allow_match", rule: "github.*" },
      { source: "runtime", outcome: "allow_miss" },
    ]);
  });

  it("counts policy-allowed catalog actions", () => {
    const policy: RuntimePolicyState = {
      deployment: emptyRules,
      runtime: { ...emptyRules, blockedActions: ["github.delete_repository"] },
    };

    expect(countAllowedActions([githubProvider()], policyLayers(policy))).toEqual({ allowed: 1, total: 2 });
  });

  it("requires a rule when the structured editor selects a restricted allow mode", () => {
    const draft = createPolicyEditorDraft(emptyRules);
    draft.actionAllowMode = "restricted";

    expect(validatePolicyEditorDraft(draft, false)).toContainEqual({
      field: "allowedActions",
      code: "required",
    });
    expect(policyRulesFromEditorDraft(draft).allowedActions).toEqual([]);
  });

  it("shows broad action rules before individual catalog actions", () => {
    const github = githubProvider();
    const slack: ProviderDefinition = {
      ...github,
      service: "slack",
      displayName: "Slack",
      actions: github.actions.map((action) => ({
        ...action,
        id: action.id.replace("github.", "slack."),
        service: "slack",
      })),
    };
    const candidates = policyRuleCandidates([github, slack], "action");

    expect(filterPolicyRuleCandidates(candidates, "", 3)).toEqual(["*", "github.*", "slack.*"]);
    expect(filterPolicyRuleCandidates(candidates, "create_issue")).toEqual([
      "github.create_issue",
      "slack.create_issue",
    ]);
  });

  it("ranks provider-prefix matches before incidental action-name matches", () => {
    expect(
      filterPolicyRuleCandidates(
        [
          "dokploy.application-saveGithubProvider",
          "dokploy.github-getGithubBranches",
          "github.add_issue_assignees",
          "github.create_issue",
        ],
        "github",
      ),
    ).toEqual([
      "github.add_issue_assignees",
      "github.create_issue",
      "dokploy.github-getGithubBranches",
      "dokploy.application-saveGithubProvider",
    ]);
  });
});

function githubProvider(): ProviderDefinition {
  return {
    service: "github",
    displayName: "GitHub",
    categories: [],
    authTypes: [],
    auth: [],
    actions: ["create_issue", "delete_repository"].map((name) => ({
      id: `github.${name}`,
      service: "github",
      name,
      description: name,
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
    })),
  };
}
