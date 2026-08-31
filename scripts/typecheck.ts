import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const rootDir = process.cwd();
const tscBin = join(rootDir, "node_modules/typescript/bin/tsc");
const buildInfoDir = join(rootDir, ".tmp/tsbuildinfo");
const projectConfigs: TypecheckProject[] = [
  { name: "src", path: "src/tsconfig.json" },
  { name: "scripts", path: "scripts/tsconfig.json" },
  { name: "examples", path: "examples/tsconfig.json" },
];

interface TypecheckProject {
  name: string;
  path: string;
}

interface TypecheckResult {
  project: TypecheckProject;
  exitCode: number;
  output: string;
  signal: NodeJS.Signals | null;
}

await mkdir(buildInfoDir, { recursive: true });

const projects = selectProjects(process.argv.slice(2));
const results = await Promise.all(projects.map((project) => typecheckProject(project)));
const failedResults = results.filter((result) => result.exitCode !== 0 || result.signal);

for (const result of failedResults.length > 0 ? results : results.filter((result) => result.output)) {
  if (result.output) {
    process.stderr.write(result.output);
  }
}

if (failedResults.length > 0) {
  process.exitCode = 1;
} else {
  console.log(`Typechecked ${projects.map((project) => project.name).join(", ")}.`);
}

function typecheckProject(project: TypecheckProject): Promise<TypecheckResult> {
  return new Promise((resolve, reject) => {
    const outputChunks: Buffer[] = [];
    const child = spawn(
      process.execPath,
      [
        tscBin,
        "-p",
        project.path,
        "--incremental",
        "--tsBuildInfoFile",
        join(buildInfoDir, `${project.name}.tsbuildinfo`),
        "--pretty",
        "false",
      ],
      {
        cwd: rootDir,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    child.stdout.on("data", (chunk: Buffer) => outputChunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => outputChunks.push(chunk));
    child.on("error", reject);
    child.on("close", (exitCode, signal) => {
      resolve({
        project,
        exitCode: exitCode ?? 1,
        output: outputChunks.length > 0 ? `\n[${project.name}]\n${Buffer.concat(outputChunks).toString()}` : "",
        signal,
      });
    });
  });
}

function selectProjects(names: string[]): TypecheckProject[] {
  if (names.length === 0) {
    return projectConfigs;
  }

  const projectsByName = new Map(projectConfigs.map((project) => [project.name, project]));
  return names.map((name) => {
    const project = projectsByName.get(name);
    if (!project) {
      throw new Error(`Unknown typecheck project: ${name}.`);
    }

    return project;
  });
}
