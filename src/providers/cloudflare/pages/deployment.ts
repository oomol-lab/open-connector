import type { CloudflareClient } from "../shared/action-client.ts";

import { optionalString, optionalRecord } from "../../../core/cast.ts";
import { requiredResponseRecord, ProviderRequestError } from "../../provider-runtime.ts";

export function projectPath(client: CloudflareClient): string {
  return `${client.accountPath()}/pages/projects/${client.id("projectName")}`;
}

export function normalizeDeployment(result: unknown, input: Record<string, unknown>): Record<string, unknown> {
  const deployment = requiredResponseRecord(result, "Cloudflare Pages deployment");
  const deploymentId = optionalString(deployment.id);
  if (!deploymentId) throw new ProviderRequestError(502, "Cloudflare deployment response is missing id");
  const stage = optionalRecord(deployment.latest_stage);
  const stageStatus = optionalString(stage?.status) ?? "idle";
  let state = stageStatus;
  if (deployment.is_skipped === true) state = "skipped";
  else if ((stageStatus === "success" || stageStatus === "skipped") && stage?.name !== "deploy") state = "active";
  return {
    accountId: input.accountId,
    projectName: input.projectName,
    deploymentId,
    state,
    url: optionalString(deployment.url) ?? "",
    deployment,
  };
}
