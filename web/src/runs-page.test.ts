import type { RunLog } from "./model";

import { describe, expect, it } from "vitest";
import { runListPath, runServiceFromSearchParams, runServiceOptions } from "./runs-page";

describe("runServiceOptions", () => {
  it("returns services in first-seen order with counts", () => {
    expect(
      runServiceOptions([
        run("hackernews-1", "news.get_best_stories", "hackernews"),
        run("gmail-1", "mail.search_threads", "gmail"),
        run("hackernews-2", "news.get_top_stories", "hackernews"),
      ]),
    ).toEqual([
      { service: "hackernews", count: 2 },
      { service: "gmail", count: 1 },
    ]);
  });
});

describe("runListPath", () => {
  it("adds the selected service to run API requests", () => {
    expect(runListPath({ service: "gmail" })).toBe("/api/runs?limit=50&service=gmail");
  });

  it("keeps service filters while paginating", () => {
    expect(runListPath({ service: "gmail", cursor: "next cursor" })).toBe(
      "/api/runs?limit=50&cursor=next+cursor&service=gmail",
    );
  });
});

describe("runServiceFromSearchParams", () => {
  it("reads the selected service from the URL query", () => {
    expect(runServiceFromSearchParams(new URLSearchParams("service=hackernews"))).toBe("hackernews");
  });

  it("ignores empty service values", () => {
    expect(runServiceFromSearchParams(new URLSearchParams("service= "))).toBeNull();
  });
});

function run(id: string, actionId: string, service: string): RunLog {
  return {
    id,
    service,
    actionId,
    caller: "http",
    startedAt: "2026-07-06T09:00:00.000Z",
    completedAt: "2026-07-06T09:00:00.727Z",
    durationMs: 727,
    ok: true,
    inputSummary: {},
  };
}
