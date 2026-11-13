import { expect, test } from "vitest";
import { normalizeOAuthScopes, toggleOAuthScope } from "./oauth-authorization-options";

test("extra permission requests retain defaults and revert to implicit defaults when removed", () => {
  const defaults = ["profile", "read", "write"];
  const selected = toggleOAuthScope(defaults, undefined, "delete", true, false);
  expect(normalizeOAuthScopes(selected)).toEqual([...defaults, "delete"]);
  expect(toggleOAuthScope(defaults, selected, "delete", false, false)).toBeUndefined();
});

test("custom requests preserve unknown and empty scopes without restoring defaults", () => {
  expect(toggleOAuthScope(["read", "write"], ["future", "delete"], "delete", false, true)).toEqual(["future"]);
  expect(toggleOAuthScope(["read", "write"], ["delete"], "delete", false, true)).toEqual([]);
  expect(normalizeOAuthScopes([" future ", "", "future"])).toEqual(["future"]);
  expect(normalizeOAuthScopes([])).toEqual([]);
  expect(normalizeOAuthScopes(undefined)).toBeUndefined();
});

test("checkbox changes match padded scopes and preserve unrelated raw input", () => {
  const raw = [" delete ", "future  ", "delete", ""];
  expect(toggleOAuthScope(["read"], raw, "delete", true, true)).toEqual(raw);
  const next = toggleOAuthScope(["read"], raw, "delete", false, true);
  expect(next).toEqual(["future  ", ""]);
  expect(normalizeOAuthScopes(next)).toEqual(["future"]);
  expect(toggleOAuthScope(["read"], [" read ", " delete "], "delete", false, false)).toBeUndefined();
});
