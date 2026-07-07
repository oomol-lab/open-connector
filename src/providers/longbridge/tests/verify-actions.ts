import type { LongbridgeActionName } from "../actions.ts";

import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { longbridgeActions } from "../actions.ts";
import { longbridgeReadonlyActionSpecs } from "../readonly-action-specs.ts";
import { longbridgeVerificationSamples } from "../verification-samples.ts";
import { runtimeHeaders } from "./http-client.ts";

const defaultRuntimeOrigin = "http://localhost:3000";
const defaultDelayMs = 250;

interface LongbridgeVerificationSelectOptions {
  includeExisting?: boolean;
  actions?: string[];
  exclude?: string[];
}

interface LongbridgeRuntimeActionRequest {
  url: string;
  body: {
    input: Record<string, unknown>;
  };
}

interface LongbridgeVerificationResponseInput {
  actionName: string;
  status: number;
  body: unknown;
}

export interface LongbridgeVerificationResult {
  actionName: string;
  ok: boolean;
  status: number;
  emptyOutputKeys: string[];
  errorCode?: string;
  message?: string;
}

interface LongbridgeVerificationReport {
  generatedAt: string;
  runtimeOrigin: string;
  actionCount: number;
  passed: number;
  failed: number;
  empty: number;
  results: LongbridgeVerificationResult[];
}

interface VerifyCliOptions extends LongbridgeVerificationSelectOptions {
  runtimeOrigin?: string;
  output?: string;
  failOnEmpty?: boolean;
  delayMs?: number;
  help?: boolean;
}

export function selectLongbridgeVerificationActionNames(options: LongbridgeVerificationSelectOptions): string[] {
  const explicit = options.actions?.filter(Boolean);
  const names =
    explicit && explicit.length > 0
      ? explicit
      : options.includeExisting
        ? longbridgeActions.map((action) => action.name)
        : longbridgeReadonlyActionSpecs.map((spec) => spec.name);
  const excluded = new Set(options.exclude ?? []);
  return names.filter((name) => !excluded.has(name));
}

export function buildLongbridgeRuntimeActionRequest(
  runtimeOrigin: string,
  actionName: string,
  input: Record<string, unknown>,
): LongbridgeRuntimeActionRequest {
  return {
    url: `${normalizeRuntimeOrigin(runtimeOrigin)}/v1/actions/longbridge.${actionName}`,
    body: {
      input,
    },
  };
}

export function classifyLongbridgeVerificationResponse(
  input: LongbridgeVerificationResponseInput,
): LongbridgeVerificationResult {
  const envelope = readRecord(input.body);
  const ok = input.status >= 200 && input.status < 300 && envelope?.success === true;
  if (!ok) {
    return {
      actionName: input.actionName,
      ok: false,
      status: input.status,
      emptyOutputKeys: [],
      errorCode: readString(envelope?.errorCode) ?? readString(readRecord(envelope?.error)?.code),
      message: readString(envelope?.message) ?? readString(readRecord(envelope?.error)?.message) ?? "Request failed.",
    };
  }
  return {
    actionName: input.actionName,
    ok: true,
    status: input.status,
    emptyOutputKeys: findLongbridgeEmptyOutputKeys(envelope?.data),
  };
}

export function findLongbridgeEmptyOutputKeys(output: unknown): string[] {
  const record = readRecord(output);
  if (!record) {
    return [];
  }
  return Object.entries(record)
    .filter(([key, value]) => key !== "raw" && isEmptyOutputValue(value))
    .map(([key]) => key);
}

export async function verifyLongbridgeActions(options: VerifyCliOptions = {}): Promise<LongbridgeVerificationReport> {
  const runtimeOrigin = normalizeRuntimeOrigin(options.runtimeOrigin ?? process.env.OOMOL_CONNECT_API_ORIGIN);
  const actionNames = selectLongbridgeVerificationActionNames(options);
  const results: LongbridgeVerificationResult[] = [];
  for (const actionName of actionNames) {
    const input = longbridgeVerificationSamples[actionName as LongbridgeActionName] ?? {};
    const result = await runLongbridgeAction(runtimeOrigin, actionName, input).catch((error: unknown) =>
      failedLongbridgeVerificationResult(actionName, error),
    );
    results.push(result);
    printResult(result);
    if (options.delayMs !== 0) {
      await delay(options.delayMs ?? defaultDelayMs);
    }
  }

  const report: LongbridgeVerificationReport = {
    generatedAt: new Date().toISOString(),
    runtimeOrigin,
    actionCount: results.length,
    passed: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
    empty: results.filter((result) => result.emptyOutputKeys.length > 0).length,
    results,
  };

  if (options.output) {
    await writeFile(options.output, `${JSON.stringify(report, null, 2)}\n`);
  }
  return report;
}

function failedLongbridgeVerificationResult(actionName: string, error: unknown): LongbridgeVerificationResult {
  return {
    actionName,
    ok: false,
    status: 0,
    emptyOutputKeys: [],
    errorCode: "request_failed",
    message: error instanceof Error ? error.message : String(error),
  };
}

function normalizeRuntimeOrigin(value: string | undefined): string {
  return (value?.trim() || defaultRuntimeOrigin).replace(/\/+$/, "");
}

async function runLongbridgeAction(
  runtimeOrigin: string,
  actionName: string,
  input: Record<string, unknown>,
): Promise<LongbridgeVerificationResult> {
  const request = buildLongbridgeRuntimeActionRequest(runtimeOrigin, actionName, input);
  const response = await fetch(request.url, {
    method: "POST",
    headers: runtimeHeaders({ "content-type": "application/json" }),
    body: JSON.stringify(request.body),
  });
  const body = await readJsonResponse(response);
  return classifyLongbridgeVerificationResponse({
    actionName,
    status: response.status,
    body,
  });
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {
      success: false,
      message: text,
      errorCode: "invalid_json",
    };
  }
}

function printResult(result: LongbridgeVerificationResult): void {
  if (!result.ok) {
    console.log(`FAIL ${result.actionName}: HTTP ${result.status} ${result.errorCode ?? ""} ${result.message ?? ""}`);
    return;
  }
  if (result.emptyOutputKeys.length > 0) {
    console.log(`EMPTY ${result.actionName}: ${result.emptyOutputKeys.join(", ")}`);
    return;
  }
  console.log(`OK ${result.actionName}`);
}

function isEmptyOutputValue(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  const record = readRecord(value);
  return record !== undefined && Object.keys(record).length === 0;
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseCliOptions(args: string[]): VerifyCliOptions {
  const options: VerifyCliOptions = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--include-existing") {
      options.includeExisting = true;
      continue;
    }
    if (arg === "--fail-on-empty") {
      options.failOnEmpty = true;
      continue;
    }

    const value = args[index + 1];
    if (!value) {
      throw new Error(`${arg} requires a value.`);
    }
    if (arg === "--runtime-origin") {
      options.runtimeOrigin = value;
    } else if (arg === "--actions") {
      options.actions = splitCsv(value);
    } else if (arg === "--exclude") {
      options.exclude = splitCsv(value);
    } else if (arg === "--output") {
      options.output = value;
    } else if (arg === "--delay-ms") {
      options.delayMs = readNonNegativeInteger(value, arg);
    } else {
      throw new Error(`Unknown option: ${arg}.`);
    }
    index += 1;
  }
  return options;
}

function splitCsv(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function readNonNegativeInteger(value: string, fieldName: string): number {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed >= 0) {
    return parsed;
  }
  throw new Error(`${fieldName} must be a non-negative integer.`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function printUsage(): void {
  console.log(`Usage:
  node src/providers/longbridge/tests/verify-actions.ts [options]

By default this verifies the new Longbridge readonly REST actions only.

Options:
  --runtime-origin URL    OpenConnector runtime origin. Default: http://localhost:3000
  --actions a,b,c         Verify only these Longbridge action names.
  --exclude a,b,c         Exclude action names from the selected set.
  --include-existing      Include pre-existing account/order/content actions.
  --output FILE           Write a JSON verification report.
  --fail-on-empty         Exit non-zero when successful actions return empty normalized outputs.
  --delay-ms MS           Delay between action calls. Default: 250. Use 0 to disable.

Environment:
  OOMOL_CONNECT_API_ORIGIN    Same as --runtime-origin.
  OOMOL_CONNECT_RUNTIME_TOKEN Bearer token for protected /v1 APIs.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = parseCliOptions(process.argv.slice(2));
  if (options.help) {
    printUsage();
  } else {
    const report = await verifyLongbridgeActions(options);
    console.log(
      `Summary: ${report.passed}/${report.actionCount} passed, ${report.failed} failed, ${report.empty} empty.`,
    );
    if (report.failed > 0 || (options.failOnEmpty && report.empty > 0)) {
      process.exitCode = 1;
    }
  }
}
