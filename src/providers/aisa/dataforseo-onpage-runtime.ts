import { looseArray, optionalRawString, optionalRecord } from "../../core/cast.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import { normalizeAisaDataForSeoTask, readAisaDataForSeoTask } from "./dataforseo-task-runtime.ts";

function crawlStatus(output: unknown) {
  const summary = optionalRecord(looseArray(output)[0]);
  const progress = optionalRawString(summary?.crawl_progress);
  if (!progress) {
    throw new ProviderRequestError(502, "AIsa OnPage summary omitted crawl progress", undefined, "provider_error");
  }

  if (progress === "in_progress") return "running";
  if (progress !== "finished") return "failed";
  switch (summary?.crawl_stop_reason) {
    case "unexpected_exception":
      return "failed";
    case "force_stopped":
      return "cancelled";
    default:
      return "completed";
  }
}

export function normalizeAisaOnPageTask(
  payload: unknown,
  phase: "submit" | "summary" | "report" | "cancel",
  taskId?: string,
):
  | { taskId: string; status: string; output: {} | null; raw: Record<string, unknown> }
  | { taskId: string | undefined; output: {} | null; raw: Record<string, unknown> } {
  if (phase === "submit") return normalizeAisaDataForSeoTask(payload, "submit");
  if (phase === "summary") {
    const result = normalizeAisaDataForSeoTask(payload, "get", taskId);
    if (result.status !== "completed") return result;
    return { ...result, status: crawlStatus(result.output) };
  }

  const { raw, task } = readAisaDataForSeoTask(payload, "AIsa OnPage report");
  return { taskId, output: task.result ?? null, raw };
}
