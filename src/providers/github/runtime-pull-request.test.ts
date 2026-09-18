import { describe, expect, it, vi } from "vitest";
import { pullRequestActionHandlers } from "./runtime-pull-request.ts";

describe("GitHub workflow dispatch", () => {
  it.each([
    {
      name: "returns the exact workflow run identity",
      response: new Response(
        JSON.stringify({
          workflow_run_id: 123,
          run_url: "https://api.github.com/repos/acme/widget/actions/runs/123",
          html_url: "https://github.com/acme/widget/actions/runs/123",
        }),
        { status: 200 },
      ),
      expected: {
        dispatched: true,
        run_identity_status: "known",
        workflow_run_id: 123,
        run_url: "https://api.github.com/repos/acme/widget/actions/runs/123",
        html_url: "https://github.com/acme/widget/actions/runs/123",
      },
    },
    {
      name: "preserves an accepted dispatch whose run identity is unavailable",
      response: new Response(null, { status: 204 }),
      expected: {
        dispatched: true,
        run_identity_status: "unavailable",
      },
    },
    {
      name: "does not claim an exact identity for an unsafe int64 run ID",
      response: new Response(
        '{"workflow_run_id":9007199254740993,"run_url":"https://api.github.com/repos/acme/widget/actions/runs/9007199254740993","html_url":"https://github.com/acme/widget/actions/runs/9007199254740993"}',
        { status: 200 },
      ),
      expected: {
        dispatched: true,
        run_identity_status: "unavailable",
      },
    },
  ])("$name", async ({ response, expected }) => {
    const fetcher = vi.fn(async () => response) as unknown as typeof fetch;

    const result = await pullRequestActionHandlers.dispatch_workflow!(
      {
        owner: "acme",
        repo: "widget",
        workflowId: "build.yml",
        ref: "release",
        inputs: { dryRun: "false" },
      },
      { accessToken: "github-token", fetcher },
    );

    expect(result).toEqual(expected);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.github.com/repos/acme/widget/actions/workflows/build.yml/dispatches",
      expect.objectContaining({
        body: JSON.stringify({
          ref: "release",
          inputs: { dryRun: "false" },
          return_run_details: true,
        }),
        method: "POST",
      }),
    );
  });
});
