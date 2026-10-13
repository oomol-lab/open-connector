import { expect, test } from "vitest";
import { normalizeLitellmBaseUrl } from "./litellm/runtime.ts";

test("LiteLLM private-network instances require deployment opt-in", () => {
  expect(() => normalizeLitellmBaseUrl("http://10.0.0.5:4000", false)).toThrow();
  expect(normalizeLitellmBaseUrl("http://10.0.0.5:4000/v1", true)).toBe("http://10.0.0.5:4000");
  expect(() => normalizeLitellmBaseUrl("http://127.0.0.1:4000", true)).toThrow();
});
