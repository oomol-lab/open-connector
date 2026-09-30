import type { IntegrationDefinition, ListenerReadContext } from "../../triggers/common/integration.ts";
import type { JsonValue } from "../../triggers/common/types.ts";

import { canonicalJsonBytes, digestBytes } from "../../triggers/common/encoding.ts";
import {
  IntegrationConnectionError,
  PermanentIntegrationError,
  TransientIntegrationError,
} from "../../triggers/common/integration.ts";
import { isJsonObject } from "../../triggers/common/json.ts";
import { githubRepoEvent } from "./trigger-on-repo-event.ts";
import { snapshot } from "./trigger-watch-pull-request.definition.ts";

function hookConfig(config: Readonly<Record<string, JsonValue>>) {
  return { owner: config.owner!, repo: config.repo!, events: ["pull_request"], insecureSsl: false };
}

export const githubPullRequestListener: IntegrationDefinition = {
  snapshot,
  initialState: { checkpoint: null, subscription: {} },
  async reconcile(context) {
    if (context.state == null) throw new PermanentIntegrationError("GitHub listener state is missing.");
    if (context.active && context.state.checkpoint == null) {
      const current = await readPullRequest(context);
      await context.state.saveCheckpoint({ version: current.version, sequence: 0 });
    }
    return await githubRepoEvent.reconcile({ ...context, config: hookConfig(context.config) });
  },
  async receive(context) {
    const received = await githubRepoEvent.receive({
      ...context,
      config: hookConfig(context.config),
    });
    if (received.outcome != "event") return received;
    if (!isJsonObject(context.payload) || context.payload.number !== context.config.number)
      return { outcome: "ignored", reason: "Different pull request." };
    return { outcome: "wake" };
  },
  listener: {
    intervalMs: 300_000,
    async read(context) {
      const checkpoint = context.checkpoint;
      if (
        !isJsonObject(checkpoint) ||
        typeof checkpoint.version != "string" ||
        !Number.isSafeInteger(checkpoint.sequence) ||
        Number(checkpoint.sequence) < 0 ||
        Number(checkpoint.sequence) >= Number.MAX_SAFE_INTEGER
      ) {
        throw new PermanentIntegrationError("GitHub listener checkpoint is invalid.");
      }
      const current = await readPullRequest(context);
      if (current.version == checkpoint.version)
        return { checkpoint, dedupeKey: current.version, hasMore: false, outputs: null };
      const sequence = Number(checkpoint.sequence) + 1;
      return {
        checkpoint: { version: current.version, sequence },
        dedupeKey: `${sequence}:${current.version}`,
        hasMore: false,
        outputs: current,
      };
    },
  },
};

async function readPullRequest(context: Pick<ListenerReadContext, "config" | "connector" | "signal">) {
  const { owner, repo, number } = context.config;
  if (typeof owner != "string" || typeof repo != "string" || !Number.isSafeInteger(number) || Number(number) < 1)
    throw new PermanentIntegrationError("GitHub pull request configuration is invalid.");
  const result = await context.connector.execute(
    {
      endpoint: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${number}`,
      method: "GET",
    },
    context.signal,
  );
  context.signal?.throwIfAborted();
  const value = result.data;
  if (
    result.status == 429 ||
    (result.status == 403 &&
      isJsonObject(value) &&
      typeof value.message == "string" &&
      /rate limit/i.test(value.message))
  )
    throw new TransientIntegrationError("GitHub pull request checks were rate limited.");
  if (result.status == 401 || result.status == 403)
    throw new IntegrationConnectionError("GitHub pull request access requires authorization.");
  if (result.status == 404)
    throw new PermanentIntegrationError("The pull request is unavailable; it may no longer be accessible.");
  if (result.status != 200)
    throw new TransientIntegrationError(`GitHub pull request check failed with status ${result.status}.`);
  if (
    !isJsonObject(value) ||
    !Number.isSafeInteger(value.id) ||
    value.number !== number ||
    typeof value.title != "string" ||
    typeof value.html_url != "string" ||
    (value.state != "open" && value.state != "closed") ||
    typeof value.draft != "boolean" ||
    typeof value.merged != "boolean" ||
    typeof value.updated_at != "string" ||
    !Number.isFinite(Date.parse(value.updated_at)) ||
    !isJsonObject(value.head) ||
    typeof value.head.sha != "string" ||
    !isJsonObject(value.base) ||
    typeof value.base.sha != "string"
  )
    throw new TransientIntegrationError("GitHub returned an invalid pull request.");
  const pullRequest = {
    id: Number(value.id),
    number: Number(number),
    title: value.title,
    url: value.html_url,
    state: value.state,
    draft: value.draft,
    merged: value.merged,
    updatedAt: value.updated_at,
    headSha: value.head.sha,
    baseSha: value.base.sha,
  };
  return { pullRequest, version: await digestBytes(canonicalJsonBytes(pullRequest)) };
}
