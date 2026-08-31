import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { providerErrorCodes } from "../server/api/runtime-api.ts";

const providersDirectory = fileURLToPath(new URL(".", import.meta.url));

/**
 * Matches the upstream-status test that governs a credential failure branch: a
 * comparison against 401 or 403 in either direction, a `switch` label, or a
 * status list membership check. The compared name is left open so that a local
 * spelling such as `httpStatus === 401` or `code === 403` counts too.
 */
const authStatusTestPattern =
  /[A-Za-z_$][\w$]*\s*===?\s*40[13]\b|\b40[13]\s*===?\s*[A-Za-z_$]|\b40[13]\b[^\n]*\.includes|\bcase\s+40[13]\s*:/u;

/** Matches a branch that tests for a genuine upstream 409 conflict. */
const conflictStatusTestPattern = /===?\s*409|\bcase\s+409\s*:/u;

/** Lines read above a construction that no enclosing condition governs. */
const branchContextLines = 2;

interface AuthConflictHit {
  file: string;
  line: number;
  source: string;
}

function listProviderSourceFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listProviderSourceFiles(path));
      continue;
    }
    if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      files.push(path);
    }
  }
  return files;
}

function skipStringLiteral(source: string, startIndex: number): number {
  const quote = source[startIndex];
  let index = startIndex + 1;
  while (index < source.length) {
    if (source[index] === "\\") {
      index += 2;
      continue;
    }
    if (source[index] === quote) {
      return index + 1;
    }
    index += 1;
  }
  return source.length;
}

function findClosingParenthesis(source: string, openIndex: number): number {
  let depth = 0;
  let index = openIndex;
  while (index < source.length) {
    const character = source[index]!;
    if (character === '"' || character === "'" || character === "`") {
      index = skipStringLiteral(source, index);
      continue;
    }
    if (character === "(") {
      depth += 1;
    } else if (character === ")") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
    index += 1;
  }
  return -1;
}

function splitTopLevelArguments(source: string): string[] {
  const argumentSources: string[] = [];
  let depth = 0;
  let start = 0;
  let index = 0;
  while (index < source.length) {
    const character = source[index]!;
    if (character === '"' || character === "'" || character === "`") {
      index = skipStringLiteral(source, index);
      continue;
    }
    if (character === "(" || character === "[" || character === "{") {
      depth += 1;
    } else if (character === ")" || character === "]" || character === "}") {
      depth -= 1;
    } else if (character === "," && depth === 0) {
      argumentSources.push(source.slice(start, index));
      start = index + 1;
    }
    index += 1;
  }
  argumentSources.push(source.slice(start));
  return argumentSources;
}

const comparisonOperatorPattern = /[=!]==?$/u;

/**
 * Read the codes a code-argument expression can evaluate to. A ternary such as
 * `phase === "validate" ? "invalid_input" : "authorization_failed"` carries the
 * phase literal too, so literals that sit on either side of a comparison
 * operator are conditions rather than codes. A bare identifier is resolved
 * against the file's own string constants.
 */
function readCodeLiterals(argumentSource: string, literalsByName: Map<string, string>): string[] {
  const codes: string[] = [];
  for (const literal of argumentSource.matchAll(/"([^"\\]*)"|`([^`\\$]*)`/gu)) {
    const before = argumentSource.slice(0, literal.index).trimEnd();
    const after = argumentSource.slice(literal.index + literal[0].length).trimStart();
    if (comparisonOperatorPattern.test(before) || after.startsWith("==") || after.startsWith("!=")) {
      continue;
    }
    codes.push(literal[1] ?? literal[2]!);
  }
  const named = literalsByName.get(argumentSource.trim());
  if (named !== undefined) {
    codes.push(named);
  }
  return codes;
}

/** Read the `const name = "literal"` bindings a code argument can name. */
function readStringConstants(source: string): Map<string, string> {
  const literalsByName = new Map<string, string>();
  for (const match of source.matchAll(
    /\bconst\s+([A-Za-z_$][\w$]*)\s*(?::[^=\n]+)?=\s*(?:"([^"\\]*)"|`([^`\\$]*)`)/gu,
  )) {
    literalsByName.set(match[1]!, match[2] ?? match[3]!);
  }
  return literalsByName;
}

/**
 * Read the `const name = 409` bindings a status argument can name, so naming
 * the status does not hide the construction the way naming the code would.
 */
function readNumericConstants(source: string): Map<string, string> {
  const numbersByName = new Map<string, string>();
  for (const match of source.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*(?::[^=\n]+)?=\s*(\d+)\s*[;,)\n]/gu)) {
    numbersByName.set(match[1]!, match[2]!);
  }
  return numbersByName;
}

const identifierReferencePattern = /(?<![\w.$])[A-Za-z_$][\w$]*/gu;

/** Drop string literals so a number or code inside a message is not read as a value. */
function stripStringLiterals(source: string): string {
  let stripped = "";
  let index = 0;
  while (index < source.length) {
    const character = source[index]!;
    if (character === '"' || character === "'" || character === "`") {
      index = skipStringLiteral(source, index);
      continue;
    }
    stripped += character;
    index += 1;
  }
  return stripped;
}

/**
 * Whether an argument expression can evaluate to the given numeric status.
 * Identifiers are substituted with the file's own numeric constants first, so a
 * named status counts wherever it appears, including as one arm of a ternary.
 */
function canEvaluateToStatus(argumentSource: string, status: number, numbersByName: Map<string, string>): boolean {
  const resolved = stripStringLiterals(argumentSource).replace(
    identifierReferencePattern,
    (name) => numbersByName.get(name) ?? name,
  );
  return new RegExp(String.raw`(?<![\w.])${status}(?![\w.])`, "u").test(resolved);
}

/**
 * The literal values an argument expression always evaluates to, resolved
 * against the declaring file's own constants. A constructor that writes the
 * value itself passes it at every one of its call sites, so the value belongs
 * to the callee rather than to any argument its callers wrote.
 */
function readConstantValues(argumentSource: string, source: string): string[] {
  const values = readCodeLiterals(argumentSource, readStringConstants(source));
  const numbersByName = readNumericConstants(source);
  const resolved = stripStringLiterals(argumentSource).replace(
    identifierReferencePattern,
    (name) => numbersByName.get(name) ?? name,
  );
  for (const number of resolved.matchAll(/(?<![\w.])\d+(?![\w.])/gu)) {
    values.push(number[0]!);
  }
  return values;
}

interface CallSite {
  index: number;
  argumentSources: string[];
}

function findCallSites(source: string, calleePattern: RegExp): CallSite[] {
  const sites: CallSite[] = [];
  let match = calleePattern.exec(source);
  while (match) {
    const openIndex = match.index + match[0].length - 1;
    const closeIndex = findClosingParenthesis(source, openIndex);
    if (closeIndex !== -1) {
      sites.push({
        index: match.index,
        argumentSources: splitTopLevelArguments(source.slice(openIndex + 1, closeIndex)),
      });
    }
    match = calleePattern.exec(source);
  }
  return sites;
}

const identifierPattern = /^[A-Za-z_$][\w$]*$/u;

interface EnclosingCallable {
  name: string;
  parameterNames: string[];
}

function readParameterNames(source: string, openIndex: number): string[] {
  const closeIndex = findClosingParenthesis(source, openIndex);
  if (closeIndex === -1) {
    return [];
  }
  return splitTopLevelArguments(source.slice(openIndex + 1, closeIndex)).map(
    (parameter) => /^[A-Za-z_$][\w$]*/u.exec(parameter.trim())?.[0] ?? "",
  );
}

interface ArrowDeclaration {
  name: string;
  declarationStart: number;
  parameterStart: number;
}

/** Find the nearest `const name = (…) =>` helper declared above an index. */
function findEnclosingArrow(source: string, index: number): ArrowDeclaration | undefined {
  let found: ArrowDeclaration | undefined;
  for (const match of source
    .slice(0, index)
    .matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*(?::[^=\n]*)?=\s*(?:async\s+)?\(/gu)) {
    found = { name: match[1]!, declarationStart: match.index, parameterStart: match.index + match[0].length - 1 };
  }
  return found;
}

function findEnclosingCallable(source: string, index: number): EnclosingCallable | undefined {
  const functionStart = source.lastIndexOf("function ", index);
  const constructorStart = source.lastIndexOf("constructor(", index);
  const arrow = findEnclosingArrow(source, index);
  const arrowStart = arrow?.declarationStart ?? -1;
  if (arrow && arrowStart > functionStart && arrowStart > constructorStart) {
    return { name: arrow.name, parameterNames: readParameterNames(source, arrow.parameterStart) };
  }
  if (constructorStart > functionStart) {
    const className = /class\s+([A-Za-z_$][\w$]*)\s+extends\s+ProviderRequestError/gu;
    let owner: string | undefined;
    for (const match of source.slice(0, index).matchAll(className)) {
      owner = match[1];
    }
    return owner === undefined
      ? undefined
      : { name: owner, parameterNames: readParameterNames(source, constructorStart + "constructor".length) };
  }
  if (functionStart === -1) {
    return undefined;
  }
  const declaration = /^function\s+([A-Za-z_$][\w$]*)\s*\(/u.exec(source.slice(functionStart, functionStart + 200));
  if (!declaration) {
    return undefined;
  }
  return {
    name: declaration[1]!,
    parameterNames: readParameterNames(source, functionStart + declaration[0].length - 1),
  };
}

/** Shared runtime modules sit directly under `src/providers` and are visible everywhere. */
const sharedScope = "";

/** The provider directory a source belongs to, which bounds where its helpers apply. */
function providerScopeOf(file: string): string {
  const separator = file.indexOf("/");
  return separator === -1 ? sharedScope : file.slice(0, separator);
}

/** What a callee puts in the tracked constructor argument. */
interface CalleeArguments {
  /** Parameter positions the callee forwards there, so its callers own the value. */
  indexes: Set<number>;
  /** Values the callee writes itself, so every one of its call sites carries them. */
  constants: Set<string>;
}

type ForwardedArgumentScopes = Map<string, Map<string, CalleeArguments>>;

function lookupCallee(scopes: ForwardedArgumentScopes, scope: string, name: string): CalleeArguments | undefined {
  return scopes.get(scope)?.get(name) ?? scopes.get(sharedScope)?.get(name);
}

function registerCallee(scopes: ForwardedArgumentScopes, scope: string, name: string): CalleeArguments {
  const callees = scopes.get(scope) ?? new Map<string, CalleeArguments>();
  scopes.set(scope, callees);
  const registered = callees.get(name) ?? { indexes: new Set<number>(), constants: new Set<string>() };
  callees.set(name, registered);
  return registered;
}

/** The callees a file may reach: its own provider's helpers plus the shared ones. */
function calleesVisibleIn(scopes: ForwardedArgumentScopes, file: string): Map<string, CalleeArguments> {
  const scope = providerScopeOf(file);
  return new Map([...(scopes.get(sharedScope) ?? []), ...(scope === sharedScope ? [] : (scopes.get(scope) ?? []))]);
}

/**
 * Register a subclass that inherits its constructor rather than declaring one,
 * so a class two levels below `ProviderRequestError` is held to the same rule
 * as its parent. Repeats until nothing new resolves, because a chain may be
 * declared in any order.
 */
function registerInheritedConstructors(sources: ProviderSource[], scopes: ForwardedArgumentScopes): void {
  const declarations = sources.flatMap((entry) =>
    [...entry.source.matchAll(/\bclass\s+([A-Za-z_$][\w$]*)\s+extends\s+([A-Za-z_$][\w$]*)/gu)].map((match) => ({
      scope: providerScopeOf(entry.file),
      name: match[1]!,
      parent: match[2]!,
    })),
  );
  let resolved = true;
  while (resolved) {
    resolved = false;
    for (const declaration of declarations) {
      if (lookupCallee(scopes, declaration.scope, declaration.name)) {
        continue;
      }
      const inherited = lookupCallee(scopes, declaration.scope, declaration.parent);
      if (!inherited) {
        continue;
      }
      const registered = registerCallee(scopes, declaration.scope, declaration.name);
      for (const index of inherited.indexes) {
        registered.indexes.add(index);
      }
      for (const constant of inherited.constants) {
        registered.constants.add(constant);
      }
      resolved = true;
    }
  }
}

/**
 * Find the provider-local helpers and `ProviderRequestError` subclasses that
 * decide the given constructor argument, so their callers are held to the same
 * rule as a direct construction. Without this a helper that reorders or
 * discards its arguments hides every site that goes through it. A subclass
 * constructor that writes the argument itself rather than forwarding a
 * parameter is recorded as a constant, so hardcoding the status or the code in
 * a `super(...)` call cannot launder it past the guards either. Helpers are
 * keyed by provider directory, so two providers that spell a helper the same
 * way cannot borrow each other's argument order.
 */
function findForwardedArgumentIndexes(
  sources: ProviderSource[],
  constructorArgumentIndex: number,
): ForwardedArgumentScopes {
  const scopes: ForwardedArgumentScopes = new Map();
  registerCallee(scopes, sharedScope, "ProviderRequestError").indexes.add(constructorArgumentIndex);
  for (const entry of sources.filter((source) => source.source.includes("ProviderRequestError"))) {
    for (const site of findCallSites(entry.source, /(?:new ProviderRequestError|super)\(/gu)) {
      const decided = site.argumentSources[constructorArgumentIndex]?.trim();
      const owner = decided === undefined ? undefined : findEnclosingCallable(entry.source, site.index);
      if (decided === undefined || !owner) {
        continue;
      }
      const argumentIndex = identifierPattern.test(decided) ? owner.parameterNames.indexOf(decided) : -1;
      if (argumentIndex !== -1) {
        registerCallee(scopes, providerScopeOf(entry.file), owner.name).indexes.add(argumentIndex);
        continue;
      }
      if (!entry.source.startsWith("super(", site.index)) {
        continue;
      }
      for (const constant of readConstantValues(decided, entry.source)) {
        registerCallee(scopes, providerScopeOf(entry.file), owner.name).constants.add(constant);
      }
    }
  }
  registerInheritedConstructors(sources, scopes);
  return scopes;
}

interface BlockRange {
  openIndex: number;
  closeIndex: number;
}

interface SourceIndex {
  blocks: BlockRange[];
  /** Index of the `(` matching each `)`, so a block head is read without scanning backwards. */
  parenthesisOpenerByCloser: Map<number, number>;
}

interface ProviderSource {
  file: string;
  source: string;
  lines: string[];
}

const providerSources: ProviderSource[] = listProviderSourceFiles(providersDirectory).map((file) => {
  const source = readFileSync(file, "utf8");
  return { file: relative(providersDirectory, file), source, lines: source.split("\n") };
});

const sourceIndexes = new Map<string, SourceIndex>();

/**
 * Index the brace and parenthesis structure of a source file in one forward
 * pass, so a construction can be traced back to the conditions that govern it.
 * Generated action schemas dwarf the runtime modules, so this runs only for the
 * few files that raise a 409 at all.
 */
function readSourceIndex(entry: ProviderSource): SourceIndex {
  const cached = sourceIndexes.get(entry.file);
  if (cached) {
    return cached;
  }
  const { source } = entry;
  const blocks: BlockRange[] = [];
  const parenthesisOpeners: number[] = [];
  const parenthesisOpenerByCloser = new Map<number, number>();
  const braceStack: number[] = [];
  let index = 0;
  while (index < source.length) {
    const character = source[index]!;
    if (character === '"' || character === "'" || character === "`") {
      index = skipStringLiteral(source, index);
      continue;
    }
    if (character === "/" && source[index + 1] === "/") {
      const lineEnd = source.indexOf("\n", index);
      index = lineEnd === -1 ? source.length : lineEnd;
      continue;
    }
    if (character === "/" && source[index + 1] === "*") {
      const commentEnd = source.indexOf("*/", index);
      index = commentEnd === -1 ? source.length : commentEnd + 2;
      continue;
    }
    if (character === "(") {
      parenthesisOpeners.push(index);
    } else if (character === ")") {
      const opener = parenthesisOpeners.pop();
      if (opener !== undefined) {
        parenthesisOpenerByCloser.set(index, opener);
      }
    } else if (character === "{") {
      braceStack.push(index);
    } else if (character === "}") {
      const opener = braceStack.pop();
      if (opener !== undefined) {
        blocks.push({ openIndex: opener, closeIndex: index });
      }
    }
    index += 1;
  }
  const built: SourceIndex = { blocks, parenthesisOpenerByCloser };
  sourceIndexes.set(entry.file, built);
  return built;
}

const caseLabelPattern = /\bcase\s[^:\n]*:|\bdefault\s*:/gu;

/**
 * Read the `case` labels that govern a statement inside a `switch` body: the
 * last run of consecutive labels above it. A `case` block carries no condition
 * of its own and the `switch` head names only the value, so without this a case
 * body longer than the context window hides which status the branch matched.
 */
function readSwitchCaseLabels(source: string, blockOpenIndex: number, index: number): string {
  const body = source.slice(blockOpenIndex, index);
  let run: string[] = [];
  let previousEnd: number | undefined;
  for (const label of body.matchAll(caseLabelPattern)) {
    const contiguous = previousEnd !== undefined && body.slice(previousEnd, label.index).trim() === "";
    run = contiguous ? [...run, label[0]] : [label[0]];
    previousEnd = label.index + label[0].length;
  }
  return run.join("\n");
}

/**
 * Read the `if (...)` heads of the blocks that enclose a construction, plus the
 * `case` labels when one of them is a `switch`. Sibling branches and the rest of
 * the enclosing function stay out, so a genuine 409 raised a few lines below an
 * unrelated 401 test is not mistaken for one.
 */
function readGoverningConditions(entry: ProviderSource, index: number): string[] {
  const { blocks, parenthesisOpenerByCloser } = readSourceIndex(entry);
  const conditions: string[] = [];
  for (const block of blocks) {
    if (block.openIndex >= index || block.closeIndex <= index) {
      continue;
    }
    const head = entry.source.slice(0, block.openIndex).trimEnd();
    if (!head.endsWith(")")) {
      continue;
    }
    const conditionStart = parenthesisOpenerByCloser.get(head.length - 1);
    if (conditionStart === undefined) {
      continue;
    }
    conditions.push(entry.source.slice(conditionStart, block.openIndex));
    if (/\bswitch\s*$/u.test(entry.source.slice(0, conditionStart))) {
      conditions.push(readSwitchCaseLabels(entry.source, block.openIndex, index));
    }
  }
  return conditions;
}

function findCallSitesIn(entry: ProviderSource, callee: string): CallSite[] {
  if (!entry.source.includes(callee)) {
    return [];
  }
  // A subclass reaches its parent's constructor as `super(...)`, so a file that
  // declares one is read for both spellings. Otherwise a constructor that
  // hardcodes the status or the code is invisible to both guards.
  const declaresSubclass = new RegExp(String.raw`\bclass\s+[A-Za-z_$][\w$]*\s+extends\s+${callee}\b`, "u").test(
    entry.source,
  );
  const callPattern = declaresSubclass ? String.raw`\b(?:${callee}|super)\(` : String.raw`\b${callee}\(`;
  return findCallSites(entry.source, new RegExp(callPattern, "gu"));
}

function lineNumberAt(source: string, index: number): number {
  return source.slice(0, index).split("\n").length;
}

/**
 * Report every provider error raised with status 409 from a branch that tests
 * an upstream 401/403, whether the 409 is a literal, one arm of a ternary, or
 * an argument handed to a provider-local error helper.
 * `toProviderExecutionError` has no 409 case, so those reach the caller as
 * `invalid_input` / HTTP 400 instead of `authorization_failed` / HTTP 403. A
 * branch that also tests for 409 is a genuine upstream conflict and is kept.
 */
function findAuthConflictErrors(sources: ProviderSource[]): AuthConflictHit[] {
  const scopes = findForwardedArgumentIndexes(sources, 0);
  const hits: AuthConflictHit[] = [];
  for (const entry of sources) {
    const numbersByName = readNumericConstants(entry.source);
    for (const [callee, decided] of calleesVisibleIn(scopes, entry.file)) {
      for (const site of findCallSitesIn(entry, callee)) {
        const raisesConflict =
          decided.constants.has("409") ||
          [...decided.indexes].some((index) =>
            canEvaluateToStatus(site.argumentSources[index] ?? "", 409, numbersByName),
          );
        if (!raisesConflict) {
          continue;
        }
        const lineIndex = lineNumberAt(entry.source, site.index) - 1;
        const context = [
          ...readGoverningConditions(entry, site.index),
          ...entry.lines.slice(Math.max(0, lineIndex - branchContextLines), lineIndex + 1),
        ].join("\n");
        if (!authStatusTestPattern.test(context) || conflictStatusTestPattern.test(context)) {
          continue;
        }
        hits.push({ file: entry.file, line: lineIndex + 1, source: entry.lines[lineIndex]!.trim() });
      }
    }
  }
  return hits;
}

interface ErrorCodeArgumentHit {
  file: string;
  line: number;
  code: string;
}

/**
 * Report every string a provider puts in the `ProviderRequestError` code
 * argument that is not a provider's to set, directly or through one of those
 * helpers. That argument sets `error.code` verbatim and the routes derive the
 * HTTP status from the code alone, so an undocumented code turns what the
 * status would have answered into HTTP 400, and a connection-layer code answers
 * with a status that has nothing to do with what the upstream said.
 */
function findUndocumentedErrorCodes(sources: ProviderSource[]): ErrorCodeArgumentHit[] {
  const allowed = new Set(providerErrorCodes);
  const scopes = findForwardedArgumentIndexes(sources, 3);
  const hits: ErrorCodeArgumentHit[] = [];
  for (const entry of sources) {
    const literalsByName = readStringConstants(entry.source);
    for (const [callee, decided] of calleesVisibleIn(scopes, entry.file)) {
      for (const site of findCallSitesIn(entry, callee)) {
        const codes = [...decided.indexes].flatMap((argumentIndex) => {
          const codeArgument = site.argumentSources[argumentIndex];
          return codeArgument === undefined ? [] : readCodeLiterals(codeArgument, literalsByName);
        });
        for (const code of [...decided.constants, ...codes]) {
          if (!allowed.has(code)) {
            hits.push({ file: entry.file, line: lineNumberAt(entry.source, site.index), code });
          }
        }
      }
    }
  }
  return hits;
}

describe("provider auth-failure status guard", () => {
  it("never maps an upstream 401 or 403 to a provider 409", () => {
    expect(findAuthConflictErrors(providerSources)).toEqual([]);
  });

  it("only puts error codes a provider owns on the wire", () => {
    expect(findUndocumentedErrorCodes(providerSources)).toEqual([]);
  });
});
