import type { CredentialValidationResult } from "../../core/types.ts";
import type { McpClientToolResult, McpToolOptions, McpToolSummary } from "../mcp-tools.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-executors.ts";
import type { ProviderFetch } from "../provider-runtime.ts";
import type { MoneyforwardToolEntry } from "./manifest.ts";

import { sha256Hex } from "../../core/aws-sigv4.ts";
import { compactObject, looseArray, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import { callMcpTool, listMcpTools } from "../mcp-tools.ts";
import {
  createProviderTimeout,
  ProviderRequestError,
  providerInputError,
  providerResponseError,
} from "../provider-runtime.ts";
import {
  canonicalOfficeName,
  currentOfficeToolName,
  moneyforwardMcpEndpoint,
  moneyforwardService,
  moneyforwardTools,
  officeCodePattern,
  schemaDigest,
} from "./manifest.ts";

export interface MoneyforwardRuntimeOptions {
  /** One budget for the whole action: office check, tools/list and the tool call share it. */
  deadlineMs: number;
  /** Extra wait past the deadline before giving up on an SDK cleanup that never settles. */
  closeGraceMs: number;
  /** Write actions allowed per key per rolling minute, so a looping agent cannot flood the ledger. */
  writesPerMinute?: number;
  /** Expected input-schema digests by tool name, replacing the manifest's (tests use synthetic schemas). */
  schemaDigests?: Readonly<Record<string, string>>;
}

/**
 * definitely_not_sent: the write request was never handed to the transport; safe to retry.
 * outcome_unknown: it may have reached Money Forward; check the ledger before retrying.
 * rejected: the reply reads as the MCP layer's own input-validation or unknown-tool refusal, which is
 *   raised before the tool runs; batch writes still ask for a manual check.
 */
type WriteOutcome = "definitely_not_sent" | "outcome_unknown" | "rejected";

type Handler = ProviderRuntimeHandler<ApiKeyProviderContext>;

const defaultOptions: MoneyforwardRuntimeOptions = { deadlineMs: 90_000, closeGraceMs: 5_000 };
const defaultWritesPerMinute = 30;
const rateWindowMs = 60_000;
const maxResponseBytes = 8 * 1024 * 1024;
const officeCodeRegExp = new RegExp(officeCodePattern, "u");
// A Money Forward API 4xx relayed by the MCP server. Enough to call a read invalid input, but not
// proof that a write did nothing: batch writes can fail part-way and retries can hide a success.
const apiClientErrorPattern = /^API request failed: client error\b/u;
// The only answers that prove the tool handler never ran: the arguments failed the tool's input
// schema, or the tool does not exist. Output validation runs after the handler, so it is excluded.
const notExecutedPattern = /^(?:MCP error -32602: )?Input validation error\b|^MCP error -32601\b/u;

export function createMoneyforwardMcpHandlers(
  timing: MoneyforwardRuntimeOptions = defaultOptions,
): Record<string, Handler> {
  const takeWriteSlot = createWriteLimiter(timing.writesPerMinute ?? defaultWritesPerMinute);
  const toolHandlers = moneyforwardTools.map((entry): [string, Handler] => [
    entry.actionName,
    entry.isWrite
      ? async (input, context) => {
          takeWriteSlot(context.apiKey);
          return runWrite(entry, input, context, timing);
        }
      : (input, context) => runRead(entry, input, context, timing),
  ]);
  const listTools: Handler = (_input, context) =>
    withDeadline(context.signal, timing, async (signal) => ({
      tools: await listMcpTools(toolOptions(context, signal, timing), { includeAnnotations: true }),
    }));
  return Object.fromEntries([...toolHandlers, ["list_tools", listTools]]);
}

export const moneyforwardMcpActionHandlers: Record<string, Handler> = createMoneyforwardMcpHandlers();

/** Accept the key when the server exposes every captured tool; report schema drift without refusing. */
export async function validateMoneyforwardMcpCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
  schemaDigests?: Readonly<Record<string, string>>,
): Promise<CredentialValidationResult> {
  const tools = await withDeadline(signal, defaultOptions, (deadlineSignal) =>
    listMcpTools(toolOptions({ apiKey, fetcher }, deadlineSignal, defaultOptions)),
  );
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  const missing = moneyforwardTools.filter((entry) => !byName.has(entry.toolName)).map((entry) => entry.toolName);
  if (missing.length > 0) {
    throw providerInputError(`Money Forward MCP does not expose these tools for this key: ${missing.join(", ")}`);
  }
  const schemaDrift = moneyforwardTools
    .filter((entry) => schemaDigest(byName.get(entry.toolName)?.inputSchema) !== expectedDigest(entry, schemaDigests))
    .map((entry) => entry.toolName);
  const keyHash = sha256Hex(apiKey).slice(0, 16);
  return {
    profile: {
      accountId: `${moneyforwardService}:${keyHash}`,
      displayName: `Money Forward MCP · ${keyHash.slice(-6)}`,
    },
    grantedScopes: [],
    metadata: { mcpEndpoint: moneyforwardMcpEndpoint, schemaDrift },
  };
}

async function runRead(
  entry: MoneyforwardToolEntry,
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
  timing: MoneyforwardRuntimeOptions,
): Promise<unknown> {
  const args = toolArguments(entry, input);
  return withDeadline(context.signal, timing, async (signal) => {
    const result = await callToolWithoutWaitingForClose({
      ...toolOptions(context, signal, timing),
      toolName: entry.toolName,
      arguments: args,
    });
    return readPayload(entry.toolName, result);
  });
}

async function runWrite(
  entry: MoneyforwardToolEntry,
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
  timing: MoneyforwardRuntimeOptions,
): Promise<unknown> {
  const args = toolArguments(entry, input);
  const expectedName = optionalString(input.expected_office_name);
  if (!expectedName) throw writeError(providerInputError("expected_office_name is required"), "definitely_not_sent");
  // Flipped by the authorizeTool hook, the last step before callMcpTool sends tools/call.
  const phase = { dispatched: false };
  try {
    return await withDeadline(context.signal, timing, async (signal) => {
      const options = toolOptions(context, signal, timing);
      await confirmOffice(String(args.office_code), expectedName, options);
      const result = await callToolWithoutWaitingForClose({
        ...options,
        toolName: entry.toolName,
        arguments: args,
        authorizeTool(tool) {
          // A late tools/list must not dispatch after the backstop has already reported definitely_not_sent.
          if (signal.aborted) {
            throw providerResponseError(
              "The Money Forward write was cancelled before it was sent; nothing was written.",
            );
          }
          assertSchemaUnchanged(entry, tool, expectedDigest(entry, timing.schemaDigests));
          phase.dispatched = true;
        },
      });
      return readPayload(entry.toolName, result);
    });
  } catch (error) {
    throw classifyWriteFailure(entry, args, phase.dispatched, error);
  }
}

async function confirmOffice(officeCode: string, expectedName: string, options: McpToolOptions): Promise<void> {
  const office = await callToolWithoutWaitingForClose({
    ...options,
    toolName: currentOfficeToolName,
    arguments: { office_code: officeCode },
  });
  const payload = optionalRecord(readPayload(currentOfficeToolName, office));
  const actualName = optionalString(payload?.name);
  if (payload?.code !== officeCode || !actualName) {
    throw providerInputError(`Money Forward did not confirm office ${officeCode}; nothing was written.`);
  }
  if (canonicalOfficeName(actualName) !== canonicalOfficeName(expectedName)) {
    throw providerInputError(
      `Office ${officeCode} is "${actualName}" in Money Forward, not "${expectedName}"; nothing was written.`,
    );
  }
}

function expectedDigest(entry: MoneyforwardToolEntry, overrides?: Readonly<Record<string, string>>): string {
  return overrides?.[entry.toolName] ?? entry.schemaDigest;
}

function assertSchemaUnchanged(entry: MoneyforwardToolEntry, tool: McpToolSummary | undefined, expected: string): void {
  if (!tool) {
    throw providerResponseError(`Money Forward MCP no longer exposes ${entry.toolName}; nothing was written.`);
  }
  if (schemaDigest(tool.inputSchema) !== expected) {
    throw providerResponseError(
      `Money Forward changed the ${entry.toolName} input schema; writes stay blocked until the change is reviewed and the provider is updated. Nothing was written.`,
    );
  }
}

function classifyWriteFailure(
  entry: MoneyforwardToolEntry,
  args: Record<string, unknown>,
  dispatched: boolean,
  error: unknown,
): ProviderRequestError {
  const cause = error instanceof ProviderRequestError ? error : providerResponseError("Money Forward request failed");
  if (readWriteOutcome(cause) !== undefined) return cause;
  if (!dispatched) return writeError(cause, "definitely_not_sent");
  const submitted = summarizeSubmission(entry, args);
  if (optionalRecord(cause.details)?.notExecuted === true) {
    // The pattern proves the MCP layer refused the call; a batch is still worth checking by hand.
    const batchNote = Object.values(args).some(Array.isArray)
      ? " This was a batch write: confirm that no item was applied before resubmitting."
      : "";
    const rejected = new ProviderRequestError(cause.status, `${cause.message}${batchNote}`, cause.details, cause.code);
    return writeError(rejected, "rejected", submitted);
  }
  return new ProviderRequestError(
    502,
    `OUTCOME UNKNOWN: ${entry.toolName} may have been applied. Check the ledger with get_journals / get_transactions for the submitted content before retrying. Cause: ${cause.message}`,
    { writeOutcome: "outcome_unknown", submitted },
    "provider_error",
  );
}

function writeError(
  error: ProviderRequestError,
  outcome: WriteOutcome,
  submitted?: Record<string, unknown>,
): ProviderRequestError {
  const details = { ...optionalRecord(error.details), writeOutcome: outcome, submitted };
  return new ProviderRequestError(error.status, error.message, details, error.code);
}

/** What was submitted, so an unknown outcome can be reconciled by hand. Never includes credentials. */
function summarizeSubmission(entry: MoneyforwardToolEntry, args: Record<string, unknown>): Record<string, unknown> {
  const journal = optionalRecord(args.journal);
  const branches = Array.isArray(journal?.branches) ? journal.branches : undefined;
  const arrayCounts = Object.fromEntries(
    Object.entries(args)
      .filter(([, value]) => Array.isArray(value))
      .map(([key, value]) => [`${key}_count`, (value as unknown[]).length]),
  );
  return compactObject({
    tool: entry.toolName,
    office_code: args.office_code,
    id: args.id,
    transaction_id: args.transaction_id,
    transaction_date: journal?.transaction_date,
    branch_count: branches?.length,
    debit_total: branches ? sumDebits(branches) : undefined,
    ...arrayCounts,
  });
}

function sumDebits(branches: unknown[]): number {
  return branches.reduce<number>(
    (total, branch) => total + (optionalNumber(optionalRecord(optionalRecord(branch)?.debitor)?.value) ?? 0),
    0,
  );
}

/**
 * Validate office_code and drop the guard-only field before it reaches Money Forward. The action
 * schema already requires both, but executors can be invoked without schema validation (tests, direct
 * loader callers), and these checks are what keep a write from going to an unnamed office.
 */
function toolArguments(entry: MoneyforwardToolEntry, input: Record<string, unknown>): Record<string, unknown> {
  const { expected_office_name: _guard, ...args } = input;
  if (entry.requiresOfficeCode && !(typeof args.office_code === "string" && officeCodeRegExp.test(args.office_code))) {
    throw entry.isWrite
      ? writeError(providerInputError("office_code is required in the form XXXX-XXXX"), "definitely_not_sent")
      : providerInputError("office_code is required in the form XXXX-XXXX");
  }
  return args;
}

/**
 * Rolling one-minute write budget per key (hashed, so the map never holds the key itself). Best-effort:
 * it counts within one process, so separate processes or isolates each keep their own budget.
 */
function createWriteLimiter(writesPerMinute: number): (apiKey: string) => void {
  const recent = new Map<string, number[]>();
  return (apiKey) => {
    const now = Date.now();
    // Timestamps are appended in order, so a bucket is idle once its newest one has aged out.
    for (const [key, times] of recent) {
      if (now - (times.at(-1) ?? 0) >= rateWindowMs) recent.delete(key);
    }
    const bucket = sha256Hex(apiKey);
    const inWindow = (recent.get(bucket) ?? []).filter((at) => now - at < rateWindowMs);
    if (inWindow.length >= writesPerMinute) {
      throw new ProviderRequestError(
        429,
        `More than ${writesPerMinute} Money Forward writes in a minute; nothing was written. Wait and confirm with the user before continuing.`,
        { writeOutcome: "definitely_not_sent" },
        "rate_limited",
      );
    }
    recent.set(bucket, [...inWindow, now]);
  };
}

// protocolVersion is deliberately left unset (legacy): in modern mode the SDK re-sends tools/call
// on a SEP-2243 header mismatch, which would be a silent write retry.
function toolOptions(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher">,
  signal: AbortSignal | undefined,
  timing: MoneyforwardRuntimeOptions,
): McpToolOptions {
  return {
    endpoint: moneyforwardMcpEndpoint,
    service: "Money Forward",
    fetcher: context.fetcher,
    headers: { "mf-api-key": context.apiKey },
    // Never follow a redirect: a cross-origin hop drops the key but would replay the ledger payload.
    redirect: "manual",
    signal,
    terminateSession: true,
    requestTimeoutMs: timing.deadlineMs,
    maxResponseBytes,
    toolListMaxBytes: 1024 * 1024,
    toolListMaxPages: 5,
    toolListMaxTools: 200,
  };
}

interface CallToolInput extends McpToolOptions {
  toolName: string;
  arguments: Record<string, unknown>;
  authorizeTool?: (tool: McpToolSummary | undefined) => void;
}

/**
 * Resolve as soon as the tool result arrives instead of after the SDK closes the session:
 * the upstream cleanup awaits close() without a timeout, and a finished write must not be
 * reported as unknown because a DELETE hung. Later cleanup errors are ignored.
 */
function callToolWithoutWaitingForClose(input: CallToolInput): Promise<McpClientToolResult> {
  return new Promise((resolve, reject) => {
    callMcpTool({
      ...input,
      transformToolResult(result) {
        resolve(result);
        return result;
      },
    }).then(
      () => undefined,
      (error: unknown) => reject(error),
    );
  });
}

function readPayload(toolName: string, result: McpClientToolResult): unknown {
  const text = readText(result);
  if ("isError" in result && result.isError) {
    const notExecuted = notExecutedPattern.test(text);
    const isClientError = notExecuted || apiClientErrorPattern.test(text);
    throw new ProviderRequestError(
      isClientError ? 400 : 502,
      `Money Forward ${toolName} failed: ${text.slice(0, 500)}`,
      { notExecuted },
      isClientError ? "invalid_input" : "provider_error",
    );
  }
  if ("structuredContent" in result && result.structuredContent !== undefined) return result.structuredContent;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { text };
  }
}

function readText(result: McpClientToolResult): string {
  return looseArray(optionalRecord(result)?.content)
    .map((item) => {
      const content = optionalRecord(item);
      return content?.type === "text" && typeof content.text === "string" ? content.text : "";
    })
    .join("")
    .trim();
}

/**
 * Run with one deadline shared by every step. The grace timer is a backstop for SDK cleanup
 * that ignores the abort; the losing promise is caught so it cannot become an unhandled rejection.
 * Every Money Forward call goes through here, so auth failures are normalized in this one place.
 */
async function withDeadline<T>(
  parentSignal: AbortSignal | undefined,
  timing: MoneyforwardRuntimeOptions,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  if (parentSignal?.aborted) {
    throw new ProviderRequestError(
      504,
      "The Money Forward request was cancelled before it was sent",
      undefined,
      "provider_error",
    );
  }
  const deadline = createProviderTimeout(parentSignal, timing.deadlineMs);
  let grace: ReturnType<typeof setTimeout> | undefined;
  const work = run(deadline.signal);
  work.catch(() => undefined);
  const backstop = new Promise<never>((_resolve, reject) => {
    grace = setTimeout(
      () => reject(new ProviderRequestError(504, "The Money Forward request timed out", undefined, "provider_error")),
      timing.deadlineMs + timing.closeGraceMs,
    );
  });
  try {
    return await Promise.race([work, backstop]);
  } catch (error) {
    throw withAuthorizationCode(error);
  } finally {
    deadline.cleanup();
    clearTimeout(grace);
  }
}

// The shared MCP error mapper reports 401/403 as provider_error; surface them as auth failures.
function withAuthorizationCode<T>(error: T): T | ProviderRequestError {
  if (error instanceof ProviderRequestError && (error.status === 401 || error.status === 403)) {
    return new ProviderRequestError(error.status, error.message, error.details, "authorization_failed");
  }
  return error;
}

function readWriteOutcome(error: ProviderRequestError): unknown {
  return optionalRecord(error.details)?.writeOutcome;
}
