import type { OAuthAuthorizationOption } from "./model";

import { describe, expect, it } from "vitest";
import { initialOAuthAuthorizationOptionIds, toggleOAuthAuthorizationOption } from "./oauth-authorization-options";

const options: OAuthAuthorizationOption[] = [
  {
    id: "channels:read",
    label: "Channels",
    description: "Read channels.",
    required: true,
    defaultSelected: true,
    risk: "standard",
  },
  {
    id: "channels:history",
    label: "History",
    description: "Read history.",
    required: false,
    defaultSelected: false,
    risk: "sensitive",
    requires: ["channels:read"],
  },
];

describe("OAuth authorization option selection", () => {
  it("selects required and default options when there are no granted scopes", () => {
    expect(initialOAuthAuthorizationOptionIds(options, undefined)).toEqual(["channels:read"]);
  });

  it("selects requirements together with a dependent option", () => {
    expect(toggleOAuthAuthorizationOption(options, ["channels:read"], "channels:history", true)).toEqual([
      "channels:read",
      "channels:history",
    ]);
  });

  it("removes dependent options when their requirement is deselected", () => {
    expect(
      toggleOAuthAuthorizationOption(options, ["channels:read", "channels:history"], "channels:read", false),
    ).toEqual(["channels:read"]);
  });
});
