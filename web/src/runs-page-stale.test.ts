import type { RunLog, RunLogPage } from "./model";
import type { Mock } from "vitest";

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
        hookState.stateValues[index] = initialValue;
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

    requests.get(runListPath({ service: "slack" }))?.({
      items: [run("slack-1", "slack")],
      nextCursor: "slack-next",
    });
    await flushMicrotasks();

    requests.get(runListPath({ service: "gmail" }))?.({
      items: [run("gmail-1", "gmail")],
      nextCursor: "gmail-next",
    });
    await flushMicrotasks();

    expect(setRuns).toHaveBeenCalledTimes(1);
    expect(setRuns).toHaveBeenCalledWith([run("slack-1", "slack")]);
    expect(setNextCursor).toHaveBeenCalledTimes(1);
    expect(setNextCursor).toHaveBeenCalledWith("slack-next");
  });
});

function renderRunsPage(service: string): void {
  routerState.searchParams = new URLSearchParams({ service });
  hookState.effects = [];
  hookState.refIndex = 0;
  hookState.stateIndex = 0;
  RunsPage({ initialRuns: [run("initial-1", "hackernews")] });
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
