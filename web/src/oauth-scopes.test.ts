import { expect, test } from "vitest";
import { normalizeOAuthScopes, toggleOAuthScope } from "./oauth-scopes";

test("extra permission requests retain defaults and revert to implicit defaults when removed", () => {
  const defaults = ["profile", "read", "write"];
  const selected = toggleOAuthScope({
    defaults,
    requested: undefined,
    scope: "delete",
    selected: true,
    custom: false,
  });
  expect(normalizeOAuthScopes(selected)).toEqual([...defaults, "delete"]);
  expect(
    toggleOAuthScope({ defaults, requested: selected, scope: "delete", selected: false, custom: false }),
  ).toBeUndefined();
});

test("custom requests preserve unknown and empty scopes without restoring defaults", () => {
  expect(
    toggleOAuthScope({
      defaults: ["read", "write"],
      requested: ["future", "delete"],
      scope: "delete",
      selected: false,
      custom: true,
    }),
  ).toEqual(["future"]);
  expect(
    toggleOAuthScope({
      defaults: ["read", "write"],
      requested: ["delete"],
      scope: "delete",
      selected: false,
      custom: true,
    }),
  ).toEqual([]);
  expect(normalizeOAuthScopes([" future ", "", "future"])).toEqual(["future"]);
  expect(normalizeOAuthScopes([])).toEqual([]);
  expect(normalizeOAuthScopes(undefined)).toBeUndefined();
});

test("checkbox changes match padded scopes and preserve unrelated raw input", () => {
  const raw = [" delete ", "future  ", "delete", ""];
  expect(
    toggleOAuthScope({ defaults: ["read"], requested: raw, scope: "delete", selected: true, custom: true }),
  ).toEqual(raw);
  const next = toggleOAuthScope({ defaults: ["read"], requested: raw, scope: "delete", selected: false, custom: true });
  expect(next).toEqual(["future  ", ""]);
  expect(normalizeOAuthScopes(next)).toEqual(["future"]);
  expect(
    toggleOAuthScope({
      defaults: ["read"],
      requested: [" read ", " delete "],
      scope: "delete",
      selected: false,
      custom: false,
    }),
  ).toBeUndefined();
});
