import { expect, test } from "vitest";
import { initialOAuthAuthorizationOptionIds, toggleOAuthAuthorizationOption } from "./oauth-authorization-options";
const options = [
  {
    id: "required",
    label: "Required",
    description: "",
    required: true,
    defaultSelected: false,
    risk: "standard" as const,
  },
  {
    id: "optional",
    label: "Optional",
    description: "",
    required: false,
    defaultSelected: false,
    risk: "standard" as const,
  },
];
test("默认选择 required，不把候选项当作默认值", () => {
  expect(initialOAuthAuthorizationOptionIds(options)).toEqual(["required"]);
});
test("取消选项保留未知 scope 并补齐 required", () => {
  expect(toggleOAuthAuthorizationOption(options, ["future", "optional"], "optional", false)).toEqual([
    "future",
    "required",
  ]);
});
