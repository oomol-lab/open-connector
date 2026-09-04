import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sourceDir = fileURLToPath(new URL("..", import.meta.url));
const repoDir = fileURLToPath(new URL("../..", import.meta.url));

const skippedFileSuffixes = [".test.ts", ".generated.ts", ".d.ts"];
const skippedFileNames = new Set(["test-helpers.ts"]);
const identifierCharacter = /[A-Za-z0-9_$]/;
// A slash opens a regex literal only where a value may begin. Accepting one at a
// line start or after one of these characters keeps ordinary division out; the
// cost is a regex in a position no source here uses, which is a better trade for
// a guard than an expression parser.
const regexPrefixCharacters = new Set(["(", ",", "=", ":", "[", "!", "&", "|", "?", "{", "}", ";"]);
const regexPrefixKeyword = "return";
// The tree holds well over a thousand modules and a few hundred regex literals.
// Floors well under both fail loudly if the walk or the scanner stops matching
// anything and the guard quietly starts protecting nothing.
const minimumScannedFiles = 500;
const minimumScannedLiterals = 100;

type ScanMode = "code" | "template";

interface RegexLiteral {
  index: number;
  text: string;
}

function isSkippedFile(name: string): boolean {
  return skippedFileNames.has(name) || skippedFileSuffixes.some((suffix) => name.endsWith(suffix));
}

function listSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listSourceFiles(path));
    } else if (entry.name.endsWith(".ts") && !isSkippedFile(entry.name)) {
      files.push(path);
    }
  }
  return files;
}

/** Skip the quoted string starting at `start`, resyncing at a newline when it is unterminated. */
function skipQuoted(source: string, start: number): number {
  const quote = source[start];
  let index = start + 1;
  while (index < source.length) {
    const char = source[index];
    if (char === "\\") {
      index += 2;
    } else if (char === quote) {
      return index + 1;
    } else if (char === "\n") {
      return index;
    } else {
      index += 1;
    }
  }
  return source.length;
}

/** Decide whether the slash at `index` opens a regex literal rather than a division. */
function opensRegexLiteral(source: string, index: number, previous: string, previousWord: string): boolean {
  if (previousWord === regexPrefixKeyword || regexPrefixCharacters.has(previous)) {
    return true;
  }
  for (let back = index - 1; back >= 0; back -= 1) {
    const char = source[back];
    if (char === "\n") {
      return true;
    }
    if (char !== " " && char !== "\t" && char !== "\r") {
      return false;
    }
  }
  return true;
}

/** Read the regex literal opened at `start`, or undefined when the slash turns out to be an operator. */
function readRegexLiteral(source: string, start: number): RegexLiteral | undefined {
  let index = start + 1;
  let inCharacterClass = false;
  while (index < source.length) {
    const char = source[index];
    if (char === "\\") {
      if (source[index + 1] === "\n") {
        return undefined;
      }
      index += 2;
      continue;
    }
    if (char === "\n") {
      // An unescaped newline cannot appear in a regex literal, so this was a division.
      return undefined;
    }
    if (char === "[") {
      inCharacterClass = true;
    } else if (char === "]") {
      inCharacterClass = false;
    } else if (char === "/" && !inCharacterClass) {
      let end = index + 1;
      while (end < source.length && (source[end] as string) >= "a" && (source[end] as string) <= "z") {
        end += 1;
      }
      if (identifierCharacter.test(source[end] ?? "")) {
        // An identifier right after the flags means the slashes were operators.
        return undefined;
      }
      return { index: start, text: source.slice(start, end) };
    }
    index += 1;
  }
  return undefined;
}

/**
 * Collect the regex literals of one module, stepping over comments, quoted
 * strings and template literals so their contents are never read as source.
 */
function findRegexLiterals(source: string): RegexLiteral[] {
  const literals: RegexLiteral[] = [];
  const modes: ScanMode[] = ["code"];
  const substitutionDepths: number[] = [];
  let braceDepth = 0;
  let previous = "";
  let previousWord = "";
  let index = 0;

  while (index < source.length) {
    const char = source[index] as string;

    if (modes.at(-1) === "template") {
      if (char === "\\") {
        index += 2;
      } else if (char === "`") {
        modes.pop();
        previous = "`";
        previousWord = "";
        index += 1;
      } else if (char === "$" && source[index + 1] === "{") {
        modes.push("code");
        substitutionDepths.push(braceDepth);
        braceDepth += 1;
        previous = "{";
        previousWord = "";
        index += 2;
      } else {
        index += 1;
      }
      continue;
    }

    if (char === " " || char === "\t" || char === "\r" || char === "\n") {
      index += 1;
    } else if (char === "/" && source[index + 1] === "/") {
      while (index < source.length && source[index] !== "\n") {
        index += 1;
      }
    } else if (char === "/" && source[index + 1] === "*") {
      const end = source.indexOf("*/", index + 2);
      index = end < 0 ? source.length : end + 2;
    } else if (char === '"' || char === "'") {
      index = skipQuoted(source, index);
      previous = char;
      previousWord = "";
    } else if (char === "`") {
      modes.push("template");
      index += 1;
    } else if (char === "{") {
      braceDepth += 1;
      previous = char;
      previousWord = "";
      index += 1;
    } else if (char === "}") {
      braceDepth -= 1;
      if (modes.length > 1 && braceDepth === substitutionDepths.at(-1)) {
        substitutionDepths.pop();
        modes.pop();
        // The substitution resolves to a value, so a following slash is a division.
        previous = "`";
      } else {
        previous = char;
      }
      previousWord = "";
      index += 1;
    } else if (identifierCharacter.test(char)) {
      let end = index;
      while (end < source.length && identifierCharacter.test(source[end] as string)) {
        end += 1;
      }
      previousWord = source.slice(index, end);
      previous = source[end - 1] as string;
      index = end;
    } else {
      const literal =
        char === "/" && opensRegexLiteral(source, index, previous, previousWord)
          ? readRegexLiteral(source, index)
          : undefined;
      if (literal === undefined) {
        previous = char;
        previousWord = "";
        index += 1;
      } else {
        literals.push(literal);
        previous = "/";
        previousWord = "";
        index += literal.text.length;
      }
    }
  }

  return literals;
}

/**
 * A regex literal is the one place a bundler cannot re-encode a character.
 * esbuild's minifier rewrites non-ASCII inside a string literal as a `\u`
 * escape, but it has to reproduce a regex literal verbatim, so a character
 * above U+00FF written there survives into the bundled Workers script. V8
 * stores a string one byte per character only while every character fits in
 * Latin-1, so that single character makes the isolate hold the entire script as
 * two-byte UTF-16: the 14.5 MB minified script costs 27.6 MiB instead of
 * 13.8 MiB, against a 128 MB isolate heap limit. Writing the character as a
 * `\uXXXX` escape inside the regex keeps the pattern identical and the source
 * one-byte.
 */
function findNonLatin1RegexCharacters(path: string, source: string): string[] {
  const offenders: string[] = [];
  for (const literal of findRegexLiterals(source)) {
    for (const char of literal.text) {
      const code = char.codePointAt(0) as number;
      if (code <= 0xff) {
        continue;
      }
      const line = source.slice(0, literal.index).split("\n").length;
      const point = `U+${code.toString(16).toUpperCase().padStart(4, "0")}`;
      offenders.push(`${relative(repoDir, path)}:${line} (${point})`);
      break;
    }
  }
  return offenders;
}

describe("provider regex charset guard", () => {
  it("keeps every regex literal inside Latin-1", () => {
    const files = listSourceFiles(sourceDir);
    const offenders: string[] = [];
    let literals = 0;
    for (const path of files) {
      const source = readFileSync(path, "utf8");
      literals += findRegexLiterals(source).length;
      offenders.push(...findNonLatin1RegexCharacters(path, source));
    }

    expect(
      offenders,
      "a regex literal cannot be re-encoded by the bundler, and one character above U+00FF makes V8 keep the whole Workers script as a two-byte string; write it as a \\uXXXX escape instead",
    ).toEqual([]);
    expect(
      files.length,
      "the source walk found almost nothing, so this guard protects nothing; check that it still points at src/",
    ).toBeGreaterThan(minimumScannedFiles);
    expect(
      literals,
      "the scanner recognized almost no regex literals, so this guard protects nothing; check that it still tracks comments, strings and template literals",
    ).toBeGreaterThan(minimumScannedLiterals);
  });
});
