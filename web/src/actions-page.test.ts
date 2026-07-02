import { describe, expect, it } from "vitest";
import { shouldResetRunActionModal } from "./actions-page";

describe("shouldResetRunActionModal", () => {
  it("keeps the debug result when the same action refreshes with a new schema object", () => {
    expect(shouldResetRunActionModal("hackernews.get_best_stories", "hackernews.get_best_stories")).toBe(false);
  });

  it("resets the debug state when switching actions", () => {
    expect(shouldResetRunActionModal("hackernews.get_best_stories", "hackernews.get_latest_posts")).toBe(true);
  });
});
