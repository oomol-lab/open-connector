import type { ProviderDefinition } from "../core/types.ts";

/**
 * Packages that pull in Node-only native APIs and must not enter the
 * Cloudflare executor registry. Providers that import them, or the shared
 * `mail/imap-smtp` runtime, export `nodeOnly`. A `nodemailer` root import is
 * treated as Node SMTP; `nodemailer/lib/mail-composer` is allowed on Workers.
 */
export const nodeOnlyRuntimePackages: readonly string[] = ["ali-oss", "imapflow", "nodemailer"];

/**
 * Self-hosted providers that set `allowPrivateNetwork` but still use a local
 * host check instead of `assertPublicHttpUrl` / `assertGuardedEgressUrl`.
 * Remove a name when that provider adopts the Dokploy pattern or drops the
 * private-network opt-in.
 */
export const knownPrivateNetworkWithoutSharedAssert: readonly string[] = [
  "btcpay_server",
  "clickhouse",
  "countly",
  "easy8",
  "gong",
  "home_assistant",
  "mailcoach",
  "mqtt",
  "onlyoffice_docspace",
  "splunk_http_event_collector",
];

export type ProviderConformanceScanKind =
  | "catalog_action_mismatch"
  | "definition_imports_executors"
  | "executors_import_definition"
  | "global_fetch"
  | "node_only_package_unmarked"
  | "private_network_without_url_assert"
  | "raw_websocket"
  | "skip_dns_dynamic_host";

export interface ProviderActionExecutorGap {
  catalogOnlyActionIds: string[];
  extraExecutorKeys: string[];
  service: string;
}

export interface ProviderConformanceFinding {
  detail: string;
  file?: string;
  kind: ProviderConformanceScanKind;
  service: string;
}

export interface ScanProviderRuntimeSourceInput {
  fileName: string;
  nodeOnly: boolean;
  service: string;
  text: string;
}

export interface DiffCatalogAndExecutorKeysInput {
  catalogActionIds: readonly string[];
  executorKeys: readonly string[];
  service: string;
}

/**
 * Compare catalog action ids with exported executor keys.
 *
 * This repository does not ship catalog-only placeholders: every catalog
 * action must have a local handler, and every handler must be in the catalog.
 */
export function diffCatalogAndExecutorKeys(
  input: DiffCatalogAndExecutorKeysInput,
): ProviderActionExecutorGap | undefined {
  const catalog = new Set(input.catalogActionIds);
  const executors = new Set(input.executorKeys);
  const catalogOnlyActionIds = [...catalog].filter((id) => !executors.has(id)).sort((a, b) => a.localeCompare(b));
  const extraExecutorKeys = [...executors].filter((id) => !catalog.has(id)).sort((a, b) => a.localeCompare(b));
  if (catalogOnlyActionIds.length === 0 && extraExecutorKeys.length === 0) {
    return undefined;
  }

  return {
    service: input.service,
    catalogOnlyActionIds,
    extraExecutorKeys,
  };
}

export function findingFromActionExecutorGap(gap: ProviderActionExecutorGap): ProviderConformanceFinding {
  const parts: string[] = [];
  if (gap.catalogOnlyActionIds.length > 0) {
    parts.push(`catalog actions without executors: ${gap.catalogOnlyActionIds.join(", ")}`);
  }
  if (gap.extraExecutorKeys.length > 0) {
    parts.push(`executor keys missing from the catalog: ${gap.extraExecutorKeys.join(", ")}`);
  }

  return {
    service: gap.service,
    kind: "catalog_action_mismatch",
    detail: parts.join("; "),
  };
}

/**
 * Check that each action id is `<service>.<name>` and belongs to this provider.
 */
export function assertProviderActionIdentity(provider: ProviderDefinition): void {
  const seen = new Set<string>();
  for (const action of provider.actions) {
    if (action.service !== provider.service) {
      throw new Error(
        `provider ${provider.service}: action ${action.id} has service ${action.service} instead of ${provider.service}`,
      );
    }
    const expectedId = `${provider.service}.${action.name}`;
    if (action.id !== expectedId) {
      throw new Error(`provider ${provider.service}: action id ${action.id} must be ${expectedId}`);
    }
    if (seen.has(action.id)) {
      throw new Error(`provider ${provider.service}: duplicate action id ${action.id}`);
    }
    seen.add(action.id);
  }
}

/**
 * Collect executable action ids from provider definitions in catalog order.
 */
export function executableActionIdsFromProviders(providers: readonly ProviderDefinition[]): string[] {
  return providers
    .flatMap((provider) => provider.actions.map((action) => action.id))
    .sort((a, b) => a.localeCompare(b));
}

/**
 * Scan one provider source file for runtime-contract violations.
 *
 * Skips tests and `generate.ts` (codegen may use the global fetch).
 */
export function scanProviderRuntimeSource(input: ScanProviderRuntimeSourceInput): ProviderConformanceFinding[] {
  const baseName = fileNameOf(input.fileName);
  if (baseName.endsWith(".test.ts") || baseName === "generate.ts") {
    return [];
  }

  const findings: ProviderConformanceFinding[] = [];
  const source = stripComments(input.text);
  const callSource = stripStringLiterals(source);
  const isCatalogDefinition = input.fileName === "definition.ts";

  if (isCatalogDefinition && importsRelativeModule(source, "executors")) {
    findings.push({
      service: input.service,
      file: input.fileName,
      kind: "definition_imports_executors",
      detail: "definition.ts must not import executors.ts",
    });
  }

  if (!isCatalogDefinition && importsRelativeModule(source, "definition")) {
    findings.push({
      service: input.service,
      file: input.fileName,
      kind: "executors_import_definition",
      detail: `${input.fileName} must not import definition.ts to reuse catalog metadata`,
    });
  }

  if (hasBareFetchCall(callSource)) {
    findings.push({
      service: input.service,
      file: input.fileName,
      kind: "global_fetch",
      detail: "use context.fetcher, providerFetch, or createProviderFetch instead of the global fetch",
    });
  }

  if (hasRawWebSocketConstructor(callSource)) {
    findings.push({
      service: input.service,
      file: input.fileName,
      kind: "raw_websocket",
      detail: "use openGuardedWebSocket instead of new WebSocket",
    });
  }

  if (!input.nodeOnly) {
    const nodeOnlyImport = findNodeOnlyImport(source);
    if (nodeOnlyImport) {
      findings.push({
        service: input.service,
        file: input.fileName,
        kind: "node_only_package_unmarked",
        detail: `imports ${nodeOnlyImport}; export const nodeOnly = true from definition.ts`,
      });
    }
  }

  return findings;
}

/**
 * Scan a provider's runtime files for `skipDnsValidation` used against a
 * non-literal host.
 *
 * DNS resolved-address checks may be skipped only when every egress host is a
 * code-controlled string literal. Credential resolvers, user-supplied URLs,
 * and interpolated hostnames keep the DNS check as the SSRF defense.
 */
export function scanProviderSkipDnsPolicy(input: {
  files: readonly ScanProviderRuntimeSourceInput[];
  service: string;
}): ProviderConformanceFinding[] {
  const files = input.files.filter((file) => {
    const baseName = fileNameOf(file.fileName);
    return !baseName.endsWith(".test.ts") && baseName !== "generate.ts";
  });
  const sources = files.map((file) => ({
    fileName: file.fileName,
    source: stripComments(file.text),
  }));
  const skipFiles = sources.filter((file) => /skipDnsValidation\s*:\s*true/.test(file.source));
  if (skipFiles.length === 0) {
    return [];
  }

  const literalBindings = collectLiteralStringBindings(sources.map((file) => file.source).join("\n"));
  const findings: ProviderConformanceFinding[] = [];
  const joined = sources.map((file) => file.source).join("\n");

  if (/\ballowPrivateNetwork\s*:/.test(joined)) {
    findings.push({
      service: input.service,
      file: skipFiles[0]?.fileName,
      kind: "skip_dns_dynamic_host",
      detail: "skipDnsValidation cannot combine with allowPrivateNetwork; DNS is the SSRF check for self-hosted hosts",
    });
  }

  if (/\bcredentialProviderProxyBaseUrl\s*\(/.test(joined)) {
    findings.push({
      service: input.service,
      file: skipFiles[0]?.fileName,
      kind: "skip_dns_dynamic_host",
      detail: "skipDnsValidation cannot combine with credentialProviderProxyBaseUrl; the host comes from credentials",
    });
  }

  for (const interpolated of findDynamicHostnameInterpolations(joined, literalBindings)) {
    findings.push({
      service: input.service,
      file: skipFiles[0]?.fileName,
      kind: "skip_dns_dynamic_host",
      detail: `skipDnsValidation used with interpolated hostname \`${interpolated}\`; only literal hosts may skip DNS`,
    });
  }

  for (const file of skipFiles) {
    for (const detail of findSkipDnsProxyResolvers(file.source, literalBindings)) {
      findings.push({
        service: input.service,
        file: file.fileName,
        kind: "skip_dns_dynamic_host",
        detail,
      });
    }
  }

  return findings;
}

/**
 * Scan a provider's runtime files for `allowPrivateNetwork` without the shared
 * instance-URL assert. Known gaps are ratcheted; new providers and stale list
 * entries fail.
 */
export function scanProviderEgressPolicy(input: {
  files: readonly ScanProviderRuntimeSourceInput[];
  knownPrivateNetworkWithoutSharedAssert?: readonly string[];
  service: string;
}): ProviderConformanceFinding[] {
  const known = new Set(input.knownPrivateNetworkWithoutSharedAssert ?? knownPrivateNetworkWithoutSharedAssert);
  const files = input.files.filter((file) => {
    const baseName = fileNameOf(file.fileName);
    return !baseName.endsWith(".test.ts") && baseName !== "generate.ts";
  });
  const sources = files.map((file) => ({
    fileName: file.fileName,
    source: stripComments(file.text),
  }));
  const joined = sources.map((file) => file.source).join("\n");
  const allowFile = sources.find((file) => hasAllowPrivateNetwork(file.source));
  const hasSharedAssert = hasSharedInstanceUrlAssert(joined);
  const onKnownList = known.has(input.service);

  if (allowFile && hasSharedAssert && onKnownList) {
    return [
      {
        service: input.service,
        file: allowFile.fileName,
        kind: "private_network_without_url_assert",
        detail: `remove ${input.service} from knownPrivateNetworkWithoutSharedAssert; it now calls assertPublicHttpUrl or assertGuardedEgressUrl`,
      },
    ];
  }

  if (!allowFile && onKnownList) {
    return [
      {
        service: input.service,
        kind: "private_network_without_url_assert",
        detail: `remove ${input.service} from knownPrivateNetworkWithoutSharedAssert; it no longer sets allowPrivateNetwork`,
      },
    ];
  }

  if (allowFile && !hasSharedAssert && !onKnownList) {
    return [
      {
        service: input.service,
        file: allowFile.fileName,
        kind: "private_network_without_url_assert",
        detail:
          "allowPrivateNetwork requires assertPublicHttpUrl or assertGuardedEgressUrl on the instance URL (see Dokploy)",
      },
    ];
  }

  return [];
}

export function findMissingPrivateNetworkRatchetProviders(input: {
  knownPrivateNetworkWithoutSharedAssert?: readonly string[];
  scannedServices: readonly string[];
}): ProviderConformanceFinding[] {
  const known = input.knownPrivateNetworkWithoutSharedAssert ?? knownPrivateNetworkWithoutSharedAssert;
  const scanned = new Set(input.scannedServices);
  return known
    .filter((service) => !scanned.has(service))
    .map((service) => ({
      service,
      kind: "private_network_without_url_assert",
      detail: `remove ${service} from knownPrivateNetworkWithoutSharedAssert; provider is missing`,
    }));
}

export function formatConformanceFindings(findings: readonly ProviderConformanceFinding[]): string {
  return findings
    .map((finding) => {
      const location = finding.file ? `${finding.service}/${finding.file}` : finding.service;
      return `${location}: ${finding.kind}: ${finding.detail}`;
    })
    .join("\n");
}

function fileNameOf(relativePath: string): string {
  const separator = relativePath.lastIndexOf("/");
  return separator === -1 ? relativePath : relativePath.slice(separator + 1);
}

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function stripStringLiterals(text: string): string {
  return text
    .replace(/`(?:\\.|[^`\\])*`/g, " ")
    .replace(/"(?:\\.|[^"\\])*"/g, " ")
    .replace(/'(?:\\.|[^'\\])*'/g, " ");
}

function importsRelativeModule(source: string, moduleName: string): boolean {
  const pattern = new RegExp(`from\\s+["'](?:\\.\\/|\\.\\.\\/)*${moduleName}(?:\\.ts)?["']`);
  return pattern.test(source);
}

function hasBareFetchCall(source: string): boolean {
  return /(?<![.\w$])fetch\s*\(/.test(source);
}

function hasRawWebSocketConstructor(source: string): boolean {
  return /(?<![.\w$])new\s+WebSocket\s*\(/.test(source);
}

function hasAllowPrivateNetwork(source: string): boolean {
  return /(?<!\?)\ballowPrivateNetwork\s*:/.test(source);
}

function hasSharedInstanceUrlAssert(source: string): boolean {
  return /\b(?:assertPublicHttpUrl|assertGuardedEgressUrl)\s*\(/.test(source);
}

function findNodeOnlyImport(source: string): string | undefined {
  for (const packageName of nodeOnlyRuntimePackages) {
    if (hasPackageImport(source, packageName, packageName !== "nodemailer")) {
      return packageName;
    }
  }
  if (/from\s+["'][^"']*mail\/imap-smtp(?:\/[^"']*)?["']/.test(source)) {
    return "mail/imap-smtp";
  }
  return undefined;
}

function hasPackageImport(source: string, packageName: string, includeSubpaths: boolean): boolean {
  const escaped = packageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = includeSubpaths
    ? new RegExp(`from\\s+["']${escaped}(?:\\/[^"']*)?["']`)
    : new RegExp(`from\\s+["']${escaped}["']`);
  return pattern.test(source);
}

function collectLiteralStringBindings(source: string): Set<string> {
  const bindings = new Map<string, string>();
  const bindingPrefix = String.raw`(?:export\s+)?(?:const|let)\s+([A-Za-z_][\w]*)(?:\s*:\s*[^=;]+)?\s*=\s*`;
  const direct = new RegExp(`${bindingPrefix}(?:["']([^"'\\\\]+)["']|\`([^$\`\\\\]+)\`)`, "g");
  for (const match of source.matchAll(direct)) {
    bindings.set(match[1]!, match[2] ?? match[3] ?? "");
  }

  let changed = true;
  while (changed) {
    changed = false;
    const alias = new RegExp(`${bindingPrefix}\`([^\`]*)\``, "g");
    for (const match of source.matchAll(alias)) {
      const name = match[1]!;
      if (bindings.has(name)) {
        continue;
      }
      const template = match[2]!;
      const interpolations = [...template.matchAll(/\$\{([A-Za-z_][\w]*)\}/g)].map((entry) => entry[1]!);
      if (interpolations.length === 0 || interpolations.some((ident) => !bindings.has(ident))) {
        continue;
      }
      bindings.set(name, template);
      changed = true;
    }
  }

  return new Set(bindings.keys());
}

function findDynamicHostnameInterpolations(source: string, literalBindings: ReadonlySet<string>): string[] {
  const findings: string[] = [];
  const pattern = /https?:\/\/[^\s"'`]*/g;
  for (const match of source.matchAll(pattern)) {
    const url = match[0];
    const hostAndPath = url.slice(url.indexOf("://") + 3);
    const host = hostAndPath.split(/[/?#]/, 1)[0] ?? "";
    if (!host.includes("${") || isTrailingPathGlueOnLiteralHost(host)) {
      continue;
    }
    const interpolations = [...host.matchAll(/\$\{([A-Za-z_][\w]*)\}/g)].map((entry) => entry[1]!);
    if (interpolations.length > 0 && interpolations.every((ident) => literalBindings.has(ident))) {
      continue;
    }
    findings.push(url.replace(/\s+/g, " ").slice(0, 80));
  }
  return findings;
}

/**
 * `https://placeholder.invalid${path}` keeps a literal host; the interpolation
 * is a path suffix, not a hostname component.
 */
function isTrailingPathGlueOnLiteralHost(host: string): boolean {
  const interpolations = [...host.matchAll(/\$\{[A-Za-z_][\w]*\}/g)];
  if (interpolations.length !== 1) {
    return false;
  }
  const interpolation = interpolations[0]!;
  if (interpolation.index === undefined || interpolation.index + interpolation[0].length !== host.length) {
    return false;
  }
  return /^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(host.slice(0, interpolation.index));
}

function findSkipDnsProxyResolvers(source: string, literalBindings: ReadonlySet<string>): string[] {
  const findings: string[] = [];
  for (const block of extractCallObjectLiterals(source, "defineProviderProxy")) {
    if (!/skipDnsValidation\s*:\s*true/.test(block)) {
      continue;
    }
    const baseUrl = readObjectProperty(block, "baseUrl");
    if (baseUrl) {
      if (isLiteralProxyBaseUrl(baseUrl, literalBindings)) {
        continue;
      }
      findings.push(
        `skipDnsValidation used with proxy baseUrl resolver \`${trimSnippet(baseUrl)}\`; only literal hosts may skip DNS`,
      );
      continue;
    }
    if (hasProxyBaseUrlMethod(block)) {
      findings.push("skipDnsValidation used with a proxy baseUrl method; only literal hosts may skip DNS");
    }
  }
  return findings;
}

function hasProxyBaseUrlMethod(objectLiteral: string): boolean {
  return /(?:async\s+)?baseUrl\s*\(/.test(objectLiteral);
}

function isLiteralProxyBaseUrl(expression: string, literalBindings: ReadonlySet<string>): boolean {
  const trimmed = expression.trim();
  if (/^["'`]https?:\/\//.test(trimmed) && !trimmed.includes("${")) {
    return true;
  }
  const ident = /^([A-Za-z_][\w]*)$/.exec(trimmed);
  return ident !== null && literalBindings.has(ident[1]!);
}

function readObjectProperty(objectLiteral: string, name: string): string | undefined {
  const assigned = new RegExp(`${name}\\s*:`).exec(objectLiteral);
  if (assigned) {
    return readExpression(objectLiteral.slice(assigned.index + assigned[0].length));
  }
  const shorthand = new RegExp(`(?:^|\\{|,)\\s*${name}\\s*(,|})`).exec(objectLiteral);
  return shorthand ? name : undefined;
}

function readExpression(source: string): string {
  const text = source.trimStart();
  if (text.startsWith("{")) {
    return extractBalanced(text, "{", "}") ?? text.slice(0, 80);
  }
  if (text.startsWith("(") || text.startsWith("async")) {
    const start = text.indexOf("(");
    const params = start >= 0 ? extractBalanced(text.slice(start), "(", ")") : undefined;
    const afterParams = params ? text.slice(start + params.length).trimStart() : text;
    if (afterParams.startsWith("=>")) {
      const body = afterParams.slice(2).trimStart();
      if (body.startsWith("{")) {
        return `${text.slice(0, start)}${params} => ${extractBalanced(body, "{", "}")}`;
      }
    }
  }
  const end = text.search(/[,}\n]/);
  return (end === -1 ? text : text.slice(0, end)).trim();
}

function extractCallObjectLiterals(source: string, callee: string): string[] {
  const blocks: string[] = [];
  const pattern = new RegExp(`${callee}\\s*\\(`, "g");
  for (const match of source.matchAll(pattern)) {
    const rest = source.slice(match.index! + match[0].length).trimStart();
    const object = extractBalanced(rest, "{", "}");
    if (object) {
      blocks.push(object);
    }
  }
  return blocks;
}

function extractBalanced(source: string, open: string, close: string): string | undefined {
  if (!source.startsWith(open)) {
    return undefined;
  }
  let depth = 0;
  for (let index = 0; index < source.length; index++) {
    const character = source[index];
    if (character === open) {
      depth += 1;
    } else if (character === close) {
      depth -= 1;
      if (depth === 0) {
        return source.slice(0, index + 1);
      }
    }
  }
  return undefined;
}

function trimSnippet(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 80);
}
