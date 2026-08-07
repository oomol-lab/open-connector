import { expect, it } from "vitest";
import { ProviderRequestError } from "../provider-runtime.ts";
import { microsoftTodoActionHandlers } from "./runtime.ts";

it("follows an allowed nextLink for task pagination", async () => {
  const nextLink = "https://graph.microsoft.com/v1.0/me/todo/lists/list-1/tasks?$skiptoken=abc";
  const fetcher = async (input: string | URL | Request): Promise<Response> => {
    expect(new URL(input instanceof Request ? input.url : input.toString()).toString()).toBe(nextLink);
    return Response.json({ value: [] });
  };

  const output = await microsoftTodoActionHandlers.list_tasks(
    { listId: "list-1", nextLink },
    { accessToken: "token", fetcher },
  );

  expect(output).toEqual({ value: [] });
});

it("follows an allowed nextLink for checklist item pagination", async () => {
  const nextLink = "https://graph.microsoft.com/v1.0/me/todo/lists/list-1/tasks/task-1/checklistItems?$skiptoken=abc";
  const fetcher = async (input: string | URL | Request): Promise<Response> => {
    expect(new URL(input instanceof Request ? input.url : input.toString()).toString()).toBe(nextLink);
    return Response.json({ value: [] });
  };

  const output = await microsoftTodoActionHandlers.list_checklist_items(
    { listId: "list-1", taskId: "task-1", nextLink },
    { accessToken: "token", fetcher },
  );

  expect(output).toEqual({ value: [] });
});

it("maps @odata.nextLink to nextLink in list responses", async () => {
  const odataNextLink = "https://graph.microsoft.com/v1.0/me/todo/lists/list-1/tasks?$skiptoken=abc";
  const fetcher = async (): Promise<Response> =>
    Response.json({
      "@odata.context": "https://graph.microsoft.com/v1.0/$metadata#...",
      value: [{ id: "task-1" }],
      "@odata.nextLink": odataNextLink,
    });

  const output = await microsoftTodoActionHandlers.list_tasks({ listId: "list-1" }, { accessToken: "token", fetcher });

  expect(output).toEqual({ value: [{ id: "task-1" }], nextLink: odataNextLink });
});

it("omits nextLink from list responses when Graph does not return @odata.nextLink", async () => {
  const fetcher = async (): Promise<Response> => Response.json({ value: [{ id: "task-1" }] });

  const output = await microsoftTodoActionHandlers.list_tasks({ listId: "list-1" }, { accessToken: "token", fetcher });

  expect(output).toEqual({ value: [{ id: "task-1" }] });
});

it("rejects a nextLink that does not target graph.microsoft.com", async () => {
  const fetcher = async (): Promise<Response> => Response.json({ value: [] });

  await expect(
    microsoftTodoActionHandlers.list_tasks(
      { listId: "list-1", nextLink: "https://evil.example.com/v1.0/me/todo/lists/list-1/tasks" },
      { accessToken: "token", fetcher },
    ),
  ).rejects.toThrow(ProviderRequestError);
});

it("rejects a nextLink outside the Microsoft To Do pagination endpoints", async () => {
  const fetcher = async (): Promise<Response> => Response.json({ value: [] });

  await expect(
    microsoftTodoActionHandlers.list_tasks(
      { listId: "list-1", nextLink: "https://graph.microsoft.com/v1.0/me/messages" },
      { accessToken: "token", fetcher },
    ),
  ).rejects.toThrow(ProviderRequestError);
});

it("defaults timeZone to UTC when a dateTimeTimeZone input omits it", async () => {
  const fetcher = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    expect(JSON.parse(String(init?.body))).toMatchObject({
      dueDateTime: { dateTime: "2026-08-10T09:00:00", timeZone: "UTC" },
    });
    return Response.json({ id: "task-1", title: "Task" });
  };

  await microsoftTodoActionHandlers.create_task(
    { listId: "list-1", title: "Task", dueDateTime: { dateTime: "2026-08-10T09:00:00" } },
    { accessToken: "token", fetcher },
  );
});

it("returns a confirmation object for a 204 No Content delete response", async () => {
  const fetcher = async (): Promise<Response> => new Response(null, { status: 204 });

  const output = await microsoftTodoActionHandlers.delete_task(
    { listId: "list-1", taskId: "task-1" },
    { accessToken: "token", fetcher },
  );

  expect(output).toEqual({ id: "task-1", deleted: true });
});
