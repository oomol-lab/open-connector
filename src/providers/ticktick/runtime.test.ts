import { describe, expect, it } from "vitest";
import { ticktickActions } from "./actions.ts";
import { ticktickActionHandlers } from "./runtime.ts";

it("keeps tags optional when updating a task", () => {
  const updateTask = ticktickActions.find(({ name }) => name === "update_task");

  expect(updateTask?.inputSchema.required).toEqual(["taskId", "projectId"]);
  expect(updateTask?.inputSchema.properties).toHaveProperty("tags");
});

describe("TickTick batch task creation", () => {
  it.each([
    ["array", []],
    ["add", { add: [] }],
    ["tasks", { tasks: [] }],
  ])("preserves an empty %s response", async (_name, payload) => {
    const output = await batchAddTasks(Response.json(payload));

    expect(output).toEqual({ tasks: [], createdCount: 0 });
  });

  it("uses the request count only when the response body is empty", async () => {
    const output = await batchAddTasks(new Response(null));

    expect(output).toEqual({ tasks: [], createdCount: 1 });
  });
});

async function batchAddTasks(response: Response): Promise<unknown> {
  const fetcher = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    expect(new URL(input instanceof Request ? input.url : input.toString()).pathname).toBe("/open/v1/task/batch");
    expect(JSON.parse(String(init?.body))).toEqual({ add: [{ projectId: "project-1", title: "Task" }] });
    return response;
  };

  return ticktickActionHandlers.batch_add_tasks(
    { tasks: [{ projectId: "project-1", title: "Task" }] },
    { accessToken: "ticktick-token", fetcher },
  );
}
