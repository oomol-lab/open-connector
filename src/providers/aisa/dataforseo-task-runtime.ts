import { looseArray, optionalNumber, optionalRawString, optionalRecord } from "../../core/cast.ts";
import { ProviderRequestError, requiredResponseRecord } from "../provider-runtime.ts";

function invalidTaskResponse(label: string, raw: Record<string, unknown>, task: Record<string, unknown> | undefined) {
  const message = optionalRawString(task?.status_message) ?? optionalRawString(raw.status_message);
  const code = optionalNumber(task?.status_code) ?? optionalNumber(raw.status_code);
  let detail = `${label} response is invalid`;
  if (message) detail += `: ${message}`;
  if (code !== undefined) detail += ` (${code})`;
  return new ProviderRequestError(502, detail, undefined, "provider_error");
}

export function readAisaDataForSeoTask(
  payload: unknown,
  label = "AIsa DataForSEO task",
): { raw: Record<string, unknown>; task: Record<string, unknown>; code: number } {
  const raw = requiredResponseRecord(payload, label);
  const task = optionalRecord(looseArray(raw.tasks)[0]);
  const code = optionalNumber(task?.status_code);
  if (!task || raw.status_code !== 20000 || code === undefined) {
    throw invalidTaskResponse(label, raw, task);
  }

  return { raw, task, code };
}

function taskStatus(code: number) {
  if (code === 20000) return "completed";
  if (code === 20100 || code === 40601 || code === 40602) return "running";
  return "failed";
}

export function normalizeAisaDataForSeoTask(
  payload: unknown,
  phase: "submit" | "get",
  expectedTaskId?: string,
): { taskId: string; status: string; output: {} | null; raw: Record<string, unknown> } {
  const { raw, task, code } = readAisaDataForSeoTask(payload);
  const id = optionalRawString(task.id);
  if (!id) throw invalidTaskResponse("AIsa DataForSEO task", raw, task);
  if (phase === "get" && id !== expectedTaskId) {
    throw new ProviderRequestError(502, "AIsa DataForSEO returned a different task", undefined, "provider_error");
  }

  return { taskId: id, status: taskStatus(code), output: task.result ?? null, raw };
}
