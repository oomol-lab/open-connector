import { afterEach, expect, it, vi } from "vitest";
import {
  getExecutionTimings,
  measureExecutionPhase,
  measureExecutionPhaseSync,
  withExecutionTimings,
} from "./execution-timing.ts";

afterEach(() => vi.restoreAllMocks());

it("accumulates phases on a monotonic clock and preserves earlier snapshots", async () => {
  let now = 0;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  await withExecutionTimings(async () => {
    measureExecutionPhaseSync("schemaMs", () => {
      now += 2;
    });
    await measureExecutionPhase("schemaMs", async () => {
      now += 3;
    });
    const before = getExecutionTimings()!;
    await withExecutionTimings(async () => {
      expect(getExecutionTimings()?.requestId).toBe(before.requestId);
      await measureExecutionPhase("auditMs", async () => {
        now += 7;
      });
    });
    expect(before).toMatchObject({ totalMs: 5, phases: { schemaMs: 5 } });
    expect(before.phases).not.toHaveProperty("auditMs");
    expect(getExecutionTimings()).toMatchObject({ totalMs: 12, phases: { schemaMs: 5, auditMs: 7 } });
  });
  expect(getExecutionTimings()).toBeUndefined();
});

it.each([new Error("failure"), new DOMException("cancelled", "AbortError")])(
  "records rejected work without replacing $name",
  async (error) => {
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    await withExecutionTimings(async () => {
      await expect(
        measureExecutionPhase("providerMs", async () => {
          now += 4;
          throw error;
        }),
      ).rejects.toBe(error);
      expect(getExecutionTimings()?.phases.providerMs).toBe(4);
      expect(() =>
        measureExecutionPhaseSync("schemaMs", () => {
          now += 2;
          throw error;
        }),
      ).toThrow(error);
      expect(getExecutionTimings()?.phases.schemaMs).toBe(2);
    });
  },
);

it("isolates concurrent requests and leaves unobserved calls unchanged", async () => {
  const phases = await Promise.all([
    withExecutionTimings(async () => {
      await measureExecutionPhase("providerMs", async () => {
        await Promise.resolve();
      });
      return getExecutionTimings()!;
    }),
    withExecutionTimings(async () => {
      await measureExecutionPhase("auditMs", async () => {
        await Promise.resolve();
      });
      return getExecutionTimings()!;
    }),
  ]);
  expect(phases[0].requestId).not.toBe(phases[1].requestId);
  expect(Object.keys(phases[0].phases)).toEqual(["providerMs"]);
  expect(Object.keys(phases[1].phases)).toEqual(["auditMs"]);
  expect(measureExecutionPhaseSync("schemaMs", () => 42)).toBe(42);
  await expect(measureExecutionPhase("providerMs", async () => 43)).resolves.toBe(43);
  expect(getExecutionTimings()).toBeUndefined();
});
