import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { sourceScanTimeout } from "./provider-source-guards.support.ts";

const sourceDir = fileURLToPath(new URL(".", import.meta.url));

const skippedFileSuffixes = [".test.ts", ".generated.ts", ".d.ts"];
const skippedFileNames = new Set(["test-helpers.ts"]);
// Provider schema modules follow their content: `actions.ts` and
// `*-actions*.ts`, `schemas.ts`/`*-schema.ts`, `operations/*.ts`,
// `*tools*.ts`, and trigger `*.definition.ts`. Restricting the read to those
// keeps the guard fast; every file holding a literal schema pattern today
// matches one of the shapes.
const schemaModuleName = /(^|[-_.])actions?([-_.]|$)|schema|operations|tool|(^|[-_])trigger-.*\.definition\.ts$/;
// A schema pattern appears either as a `pattern` property value or as the first
// argument of `s.stringPattern("...")`.
const patternLiteral = /(?:\bpattern:\s*|\bs\.stringPattern\(\s*)"((?:[^"\\]|\\.)*)"/g;
// The tree holds hundreds of schema modules and patterns. Floors fail loudly if
// the walk or the scanner stops matching anything and the guard quietly starts
// protecting nothing.
const minimumScannedFiles = 200;
const minimumScannedPatterns = 500;

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

function lineOf(source: string, index: number): number {
  let line = 1;
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (source[cursor] === "\n") {
      line += 1;
    }
  }
  return line;
}

const sourceFiles = listSourceFiles(sourceDir);

describe("provider schema pattern guard", { timeout: sourceScanTimeout(sourceFiles.length) }, () => {
  it("keeps every provider JSON-Schema pattern compilable", () => {
    const offenders: string[] = [];
    let scannedFiles = 0;
    let scannedPatterns = 0;
    for (const file of sourceFiles) {
      // `operations` is a module directory, not a file-name shape.
      const normalized = file.replaceAll("\\", "/");
      if (!schemaModuleName.test(basename(file)) && !normalized.includes("/operations/")) {
        continue;
      }
      scannedFiles += 1;
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(patternLiteral)) {
        scannedPatterns += 1;
        let value: string;
        try {
          value = JSON.parse(`"${match[1]}"`) as string;
        } catch {
          offenders.push(`${file}:${lineOf(source, match.index ?? 0)} pattern literal cannot be decoded: ${match[1]}`);
          continue;
        }
        try {
          // An invalid pattern is an unhandled SyntaxError while an action is
          // validated, so the whole action answers 500 instead of invalid_input.
          // `@cfworker/json-schema` compiles patterns with the unicode flag.
          new RegExp(value, "u");
        } catch (error) {
          offenders.push(
            `${file}:${lineOf(source, match.index ?? 0)} invalid pattern ${JSON.stringify(value)}: ${
              (error as Error).message
            }`,
          );
        }
      }
    }

    expect(scannedFiles).toBeGreaterThanOrEqual(minimumScannedFiles);
    expect(scannedPatterns).toBeGreaterThanOrEqual(minimumScannedPatterns);
    expect(offenders.join("\n")).toBe("");
  });
});
