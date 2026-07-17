import type { RunLog, RunLogPage } from "./model";
import type { ReactElement, ReactNode } from "react";
import type { Mock } from "vitest";

import { isValidElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RunsPage, runListPath } from "./runs-page";

const hookState = vi.hoisted(() => ({
  effects: [] as Array<() => void | (() => void)>,
  refs: [] as Array<{ current: unknown }>,
  refIndex: 0,
  stateIndex: 0,
  stateSetters: [] as Mock[],
  stateValues: [] as unknown[],
}));

const routerState = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
  setSearchParams: vi.fn(),
}));

const apiMock = vi.hoisted(() => ({
  apiGet: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useEffect(effect: () => void | (() => void)) {
      hookState.effects.push(effect);
    },
    useMemo<T>(factory: () => T): T {
      return factory();
    },
    useRef<T>(initialValue: T): { current: T } {
      const index = hookState.refIndex++;
      hookState.refs[index] ??= { current: initialValue };
      return hookState.refs[index] as { current: T };
    },
    useState<T>(initialValue: T): [T, (value: T | ((current: T) => T)) => void] {
      const index = hookState.stateIndex++;
      if (!(index in hookState.stateValues)) {
        hookState.stateValues[index] = typeof initialValue === "function" ? (initialValue as () => T)() : initialValue;
      }
      hookState.stateSetters[index] ??= vi.fn((value: T | ((current: T) => T)) => {
        hookState.stateValues[index] =
          typeof value === "function" ? (value as (current: T) => T)(hookState.stateValues[index] as T) : value;
      });
      return [
        hookState.stateValues[index] as T,
        hookState.stateSetters[index] as (value: T | ((current: T) => T)) => void,
      ];
    },
  };
});

vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return {
    ...actual,
    useSearchParams() {
      return [routerState.searchParams, routerState.setSearchParams];
    },
  };
});

vi.mock("@embra/i18n/react", () => ({
  useTranslate() {
    return (key: string) => key;
  },
}));

vi.mock("./api", () => ({
  apiGet: apiMock.apiGet,
}));

beforeEach(() => {
  hookState.effects = [];
  hookState.refs = [];
  hookState.refIndex = 0;
  hookState.stateIndex = 0;
  hookState.stateSetters = [];
  hookState.stateValues = [];
  routerState.searchParams = new URLSearchParams();
  routerState.setSearchParams.mockClear();
  apiMock.apiGet.mockReset();
});

describe("RunsPage service loading", () => {
  it("clears stale rows and pagination when a filtered request fails", async () => {
    apiMock.apiGet.mockRejectedValue(new Error("filtered request failed"));

    renderRunsPage("gmail", "initial-next");
    runLatestEffect();
    await flushMicrotasks();

    expect(hookState.stateSetters[0]).toHaveBeenCalledWith([]);
    expect(hookState.stateSetters[1]).toHaveBeenCalledWith(undefined);
    expect(hookState.stateValues[0]).toEqual([]);
    expect(hookState.stateValues[1]).toBeUndefined();
  });

  it("ignores stale service responses after the selected service changes", async () => {
    const requests = new Map<string, (page: RunLogPage) => void>();
    apiMock.apiGet.mockImplementation(
      (path: string) =>
        new Promise<RunLogPage>((resolve) => {
          requests.set(path, resolve);
        }),
    );

    renderRunsPage("gmail");
    runLatestEffect();
    renderRunsPage("slack");
    runLatestEffect();

    const setRuns = hookState.stateSetters[0]!;
    const setNextCursor = hookState.stateSetters[1]!;
    setRuns.mockClear();
    setNextCursor.mockClear();

    requests.get(runListPath({ filters: filters({ service: "slack" }) }))?.({
      items: [run("slack-1", "slack")],
      nextCursor: "slack-next",
    });
    await flushMicrotasks();

    requests.get(runListPath({ filters: filters({ service: "gmail" }) }))?.({
      items: [run("gmail-1", "gmail")],
      nextCursor: "gmail-next",
    });
    await flushMicrotasks();

    expect(setRuns).toHaveBeenCalledTimes(1);
    expect(setRuns).toHaveBeenCalledWith([run("slack-1", "slack")]);
    expect(setNextCursor).toHaveBeenCalledTimes(1);
    expect(setNextCursor).toHaveBeenCalledWith("slack-next");
  });

  it("does not append a stale page after filters change", async () => {
    const requests = new Map<string, (page: RunLogPage) => void>();
    apiMock.apiGet.mockImplementation(
      (path: string) =>
        new Promise<RunLogPage>((resolve) => {
          requests.set(path, resolve);
        }),
    );

    const initialTree = renderRunsPage(null, "initial-next");
    runLatestEffect();
    const loadMore = findElement(
      initialTree,
      (element) => Array.isArray(element.props.children) && element.props.children.includes("runs.loadMore"),
    );
    (loadMore.props.onClick as (() => void) | undefined)?.();

    renderRunsPage("gmail");
    runLatestEffect();
    const setRuns = hookState.stateSetters[0]!;
    setRuns.mockClear();

    requests.get(runListPath({ filters: filters({ service: "gmail" }) }))?.({
      items: [run("gmail-1", "gmail")],
    });
    await flushMicrotasks();
    requests.get(runListPath({ cursor: "initial-next", filters: filters() }))?.({
      items: [run("stale-1", "hackernews")],
    });
    await flushMicrotasks();

    expect(setRuns).toHaveBeenCalledTimes(1);
    expect(setRuns).toHaveBeenCalledWith([run("gmail-1", "gmail")]);
  });

  it("invalidates pagination as soon as a filter navigation starts", async () => {
    let resolvePage: ((page: RunLogPage) => void) | undefined;
    apiMock.apiGet.mockImplementation(
      () =>
        new Promise<RunLogPage>((resolve) => {
          resolvePage = resolve;
        }),
    );
    const tree = renderRunsPage(null, "initial-next");
    runLatestEffect();
    const loadMore = findElement(
      tree,
      (element) => Array.isArray(element.props.children) && element.props.children.includes("runs.loadMore"),
    );
    (loadMore.props.onClick as (() => void) | undefined)?.();
    const serviceFilter = findElement(tree, (element) => element.props.label === "runs.service");
    (serviceFilter.props.onChange as ((value: string) => void) | undefined)?.("gmail");
    const setRuns = hookState.stateSetters[0]!;
    setRuns.mockClear();

    resolvePage?.({ items: [run("stale-1", "hackernews")] });
    await flushMicrotasks();

    expect(routerState.setSearchParams).toHaveBeenCalledOnce();
    expect(setRuns).not.toHaveBeenCalled();
  });

  it("copies the execution id from the row action", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    const tree = renderRunsPage(null);
    const copy = findElement(tree, (element) => element.props["aria-label"] === "runs.copyExecutionId");
    (copy.props.onClick as (() => void) | undefined)?.();

    expect(writeText).toHaveBeenCalledWith("initial-1");
    vi.unstubAllGlobals();
  });
});

function renderRunsPage(service: string | null, nextCursor?: string): ReactNode {
  routerState.searchParams = service ? new URLSearchParams({ service }) : new URLSearchParams();
  hookState.effects = [];
  hookState.refIndex = 0;
  hookState.stateIndex = 0;
  return RunsPage({ initialRuns: [run("initial-1", "hackernews")], nextCursor });
}

function runLatestEffect(): void {
  hookState.effects.at(-1)?.();
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function run(id: string, service: string): RunLog {
  return {
    id,
    service,
    actionId: `${service}.action`,
    caller: "http",
    startedAt: "2026-07-06T09:00:00.000Z",
    completedAt: "2026-07-06T09:00:00.727Z",
    durationMs: 727,
    ok: true,
    inputSummary: {},
  };
}

function filters(input: Partial<Parameters<typeof runListPath>[0]["filters"]> = {}) {
  return { service: null, actionId: "", caller: null, ok: null, ...input };
}

function findElement(
  node: ReactNode,
  predicate: (element: ReactElement<Record<string, unknown>>) => boolean,
): ReactElement<Record<string, unknown>> {
  const found = findElementOrUndefined(node, predicate);
  if (found) return found;
  throw new Error("Element not found.");
}

function findElementOrUndefined(
  node: ReactNode,
  predicate: (element: ReactElement<Record<string, unknown>>) => boolean,
): ReactElement<Record<string, unknown>> | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElementOrUndefined(child, predicate);
      if (found) return found;
    }
  } else if (isValidElement<Record<string, unknown>>(node)) {
    if (predicate(node)) return node;
    return findElementOrUndefined(node.props.children as ReactNode, predicate);
  }
  return undefined;
}
