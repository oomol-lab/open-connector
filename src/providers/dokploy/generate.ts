import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

type JsonObject = Record<string, unknown>;

interface OpenApiOperation extends JsonObject {
  operationId?: string;
  tags?: string[];
  summary?: string;
  description?: string;
  parameters?: JsonObject[];
  requestBody?: JsonObject;
  responses?: Record<string, JsonObject>;
}

const repositoryRoot = resolve(import.meta.dirname, "../../..");
const dokployMcpCommit = "db18449eafdfc8dbd438d392b95c46292069c658";
const expectedSourceSha256 = "225972ade1e545cc9a44638e4ff32d73a23ea48298617ca3a37fb5cfff6a058e";
const defaultSourceUrl = `https://raw.githubusercontent.com/Dokploy/mcp/${dokployMcpCommit}/src/generated/openapi.json`;
const localSourceArgument = process.argv[2];
const sourcePath = localSourceArgument ? resolve(localSourceArgument) : undefined;
const sourceLabel = sourcePath
  ? relative(repositoryRoot, sourcePath)
  : `Dokploy/mcp@${dokployMcpCommit}/src/generated/openapi.json`;
const outputDirectory = resolve(process.argv[3] ?? join(repositoryRoot, "src/providers/dokploy/operations"));
const indexPath = join(repositoryRoot, "src/providers/dokploy/operations.ts");

const source = sourcePath ? await readFile(sourcePath, "utf8") : await downloadDefaultSource();
const sourceSha256 = createHash("sha256").update(source).digest("hex");
if (sourceSha256 !== expectedSourceSha256) {
  throw new Error(
    `Dokploy OpenAPI SHA-256 mismatch for ${sourceLabel}: expected ${expectedSourceSha256}, received ${sourceSha256}`,
  );
}
const document = JSON.parse(source) as JsonObject;
const paths = (document.paths ?? {}) as Record<string, Record<string, OpenApiOperation>>;
const operationsByTag = new Map<string, JsonObject[]>();
const names = new Set<string>();
let relaxedPlaceholderResponses = 0;

for (const [path, pathItem] of Object.entries(paths)) {
  for (const [method, operation] of Object.entries(pathItem)) {
    if (!["get", "post", "put", "patch", "delete"].includes(method)) continue;

    const operationId = operation.operationId ?? `${method}-${path}`;
    const tag = operation.tags?.[0] ?? "untagged";
    // Keep the MCP server's generated tool name exactly, so catalog coverage can
    // be audited as a set equality check against generatedTools.
    const name = operationId;
    if (names.has(name)) throw new Error(`Duplicate Dokploy action name: ${name}`);
    names.add(name);

    const pathParameters = pathItem.parameters as unknown as JsonObject[] | undefined;
    const parameters = [...(pathParameters ?? []), ...(operation.parameters ?? [])];
    const pathFields: string[] = [];
    const queryFields: string[] = [];
    const parameterProperties: JsonObject = {};
    const required = new Set<string>();

    for (const parameterReference of parameters) {
      const parameter = dereference(parameterReference);
      const parameterName = String(parameter.name);
      const location = String(parameter.in);
      parameterProperties[parameterName] = withDescription(
        dereference((parameter.schema ?? {}) as JsonObject),
        parameter.description,
      );
      if (parameter.required === true) required.add(parameterName);
      if (location === "path") pathFields.push(parameterName);
      if (location === "query") queryFields.push(parameterName);
    }

    const content = (operation.requestBody?.content ?? {}) as Record<string, JsonObject>;
    const contentType = selectContentType(content);
    const bodySchema = contentType ? dereference((content[contentType]?.schema ?? {}) as JsonObject) : undefined;
    const bodyFields =
      bodySchema && bodySchema.type === "object" ? Object.keys((bodySchema.properties ?? {}) as JsonObject) : [];
    const fileFields: string[] = [];
    const bodyRequired = bodySchema && Array.isArray(bodySchema.required) ? (bodySchema.required as string[]) : [];
    const bodyProperties = bodySchema?.type === "object" ? ((bodySchema.properties ?? {}) as JsonObject) : {};
    for (const [field, schema] of Object.entries(bodyProperties)) {
      const fieldSchema = schema as JsonObject;
      if (fieldSchema.type === "string" && fieldSchema.format === "binary") {
        fileFields.push(field);
        parameterProperties[field] = transitFileSchema(field);
      } else {
        parameterProperties[field] = schema;
      }
    }
    for (const field of bodyRequired) required.add(field);

    const nonObjectBody = bodySchema != null && bodySchema.type !== "object";
    if (nonObjectBody) {
      parameterProperties.body = bodySchema;
      bodyFields.push("body");
      if (operation.requestBody?.required === true) required.add("body");
    }

    const inputSchema: JsonObject = {
      type: "object",
      properties: parameterProperties,
      additionalProperties: false,
      description: `Input for ${operationId}.`,
      ...(required.size > 0 ? { required: [...required].sort() } : {}),
    };
    applyKnownSchemaCorrections(operationId, inputSchema);
    const outputSchema = responseSchema(operation.responses ?? {});
    const supportStatus = "supported";

    const generated = {
      name,
      operationId,
      tag,
      description: operation.description ?? operation.summary ?? fallbackDescription(method, path, operationId),
      method: method.toUpperCase(),
      path,
      pathFields,
      queryFields,
      bodyFields,
      fileFields,
      contentType: contentType ?? null,
      supportStatus,
      inputSchema,
      outputSchema,
    };
    const values = operationsByTag.get(tag) ?? [];
    values.push(generated);
    operationsByTag.set(tag, values);
  }
}

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

const moduleEntries: { tag: string; file: string; exportName: string }[] = [];
for (const [tag, operations] of [...operationsByTag].sort(([left], [right]) => left.localeCompare(right))) {
  const file = `${toKebabCase(tag)}.ts`;
  const exportName = `${toCamelCase(tag)}Operations`;
  moduleEntries.push({ tag, file, exportName });
  const source =
    `// Generated by src/providers/dokploy/generate.ts from ${sourceLabel}.\n` +
    `// Do not edit by hand; update the source OpenAPI document and regenerate.\n\n` +
    `import type { DokployOperationDefinition } from "../operations.ts";\n\n` +
    `export const ${exportName}: readonly DokployOperationDefinition[] = ${JSON.stringify(operations, null, 2)};\n`;
  await writeFile(join(outputDirectory, file), source);
}

const imports = moduleEntries
  .map(({ exportName, file }) => `import { ${exportName} } from "./operations/${file}";`)
  .join("\n");
const arrays = moduleEntries.map(({ exportName }) => `  ${exportName},`).join("\n");
const actionNameUnion = [...names]
  .sort((left, right) => left.localeCompare(right))
  .map((name) => `  | ${JSON.stringify(name)}`)
  .join("\n");
const indexSource =
  `// Generated in part by src/providers/dokploy/generate.ts.\n` +
  `import type { JsonSchema } from "../../core/types.ts";\n\n${imports}\n\n` +
  `export type DokployActionMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";\n` +
  `export type DokployOperationSupportStatus = "supported" | "unsupported";\n\n` +
  `export type DokployActionName =\n${actionNameUnion};\n\n` +
  `export interface DokployOperationDefinition {\n` +
  `  name: DokployActionName;\n  operationId?: string;\n  tag?: string;\n  description: string;\n` +
  `  method: DokployActionMethod;\n  path: string;\n  pathFields: readonly string[];\n` +
  `  queryFields: readonly string[];\n  bodyFields: readonly string[];\n  fileFields?: readonly string[];\n` +
  `  contentType?: string | null;\n  supportStatus?: DokployOperationSupportStatus;\n` +
  `  supportReason?: string;\n  inputSchema: JsonSchema;\n  outputSchema: JsonSchema;\n}\n\n` +
  `export type DokployOperation = DokployOperationDefinition;\n\n` +
  `export const dokployOperations: readonly DokployOperation[] = [\n${arrays}\n].flat();\n\n` +
  `export const dokployOperationByActionName: ReadonlyMap<string, DokployOperation> = new Map(\n` +
  `  dokployOperations.map((operation) => [operation.name, operation]),\n);\n`;
await writeFile(indexPath, indexSource);
formatGeneratedFiles();

const unsupported = [...operationsByTag.values()]
  .flat()
  .filter((operation) => operation.supportStatus === "unsupported");
console.log(
  `Generated ${names.size} Dokploy operations in ${operationsByTag.size} tag modules (${unsupported.length} unsupported, ${relaxedPlaceholderResponses} placeholder responses relaxed).`,
);

function formatGeneratedFiles(): void {
  const formatterPath = join(repositoryRoot, "node_modules/oxfmt/bin/oxfmt");
  const result = spawnSync(process.execPath, [formatterPath, indexPath, outputDirectory], {
    cwd: repositoryRoot,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`Failed to format generated Dokploy operations (${result.status ?? "signal"})`);
}

async function downloadDefaultSource(): Promise<string> {
  const response = await fetch(defaultSourceUrl);
  if (!response.ok) {
    throw new Error(`Failed to download pinned Dokploy OpenAPI: HTTP ${response.status} ${response.statusText}`);
  }
  return response.text();
}

function fallbackDescription(method: string, path: string, operationId: string): string {
  const upperMethod = method.toUpperCase();
  if (method === "get") return `Read Dokploy data via ${upperMethod} ${path}.`;
  if (/(?:delete|remove|stop|kill|clean|drop|destroy|revoke|disconnect|rollback)/iu.test(operationId)) {
    return `Modify Dokploy state via ${upperMethod} ${path}. Warning: this operation can remove, stop, or otherwise disrupt resources.`;
  }
  return `Modify Dokploy state via ${upperMethod} ${path}.`;
}

function dereference(value: JsonObject, seen = new Set<string>()): JsonObject {
  if (typeof value.$ref === "string") {
    if (seen.has(value.$ref)) return {};
    return dereference(resolvePointer(value.$ref), new Set([...seen, value.$ref]));
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      Array.isArray(child)
        ? child.map((item) => (isObject(item) ? dereference(item, seen) : item))
        : isObject(child)
          ? dereference(child, seen)
          : child,
    ]),
  );
}

function resolvePointer(pointer: string): JsonObject {
  if (!pointer.startsWith("#/")) throw new Error(`External OpenAPI reference is not supported: ${pointer}`);
  let current: unknown = document;
  for (const token of pointer.slice(2).split("/")) {
    current = (current as JsonObject)[token.replaceAll("~1", "/").replaceAll("~0", "~")];
  }
  if (!isObject(current)) throw new Error(`OpenAPI reference does not point to an object: ${pointer}`);
  return current;
}

function responseSchema(responses: Record<string, JsonObject>): JsonObject {
  const response = responses["200"] ?? responses["201"] ?? responses["202"] ?? responses.default;
  if (!response) return { description: "Dokploy response.", type: "object", additionalProperties: true };
  const resolvedResponse = dereference(response);
  const content = (resolvedResponse.content ?? {}) as Record<string, JsonObject>;
  const mediaType = content["application/json"] ?? Object.values(content)[0];
  if (mediaType?.schema) {
    const schema = withDescription(dereference(mediaType.schema as JsonObject), resolvedResponse.description);
    if (
      schema.type === "object" &&
      Object.keys((schema.properties ?? {}) as JsonObject).length === 0 &&
      schema.additionalProperties === false
    ) {
      relaxedPlaceholderResponses += 1;
      return {
        description: String(
          resolvedResponse.description ??
            "The response returned by Dokploy; fields vary by operation and Dokploy version.",
        ),
      };
    }
    return schema;
  }
  return {
    description: String(resolvedResponse.description ?? "Dokploy response."),
    type: "object",
    additionalProperties: true,
  };
}

function selectContentType(content: Record<string, JsonObject>): string | undefined {
  if (content["application/json"]) return "application/json";
  return Object.keys(content)[0];
}

function applyKnownSchemaCorrections(operationId: string, inputSchema: JsonObject): void {
  if (operationId !== "mongo-create") return;

  const properties = inputSchema.properties;
  const dockerImage = isObject(properties) ? properties.dockerImage : undefined;
  if (!isObject(dockerImage) || dockerImage.default !== "mongo:15") {
    throw new Error("Expected the pinned mongo-create dockerImage default to be mongo:15");
  }

  // Dokploy's persisted Mongo default is mongo:8; its API schema currently has
  // a mongo:15 typo that would direct clients to a nonexistent official tag.
  dockerImage.default = "mongo:8";
}

function withDescription(schema: JsonObject, description: unknown): JsonObject {
  return description && schema.description == null ? { ...schema, description: String(description) } : schema;
}

function transitFileSchema(field: string): JsonObject {
  return {
    type: "object",
    description: `The ${field} file previously uploaded to the local transit file API.`,
    properties: {
      fileId: { type: "string", minLength: 1, description: "The transit file identifier." },
      name: { type: "string", description: "Optional file name override." },
      mimeType: { type: "string", description: "Optional MIME type override." },
    },
    required: ["fileId"],
    additionalProperties: false,
  };
}

function toSnakeCase(value: string): string {
  return value
    .replaceAll(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replaceAll(/[^a-zA-Z0-9]+/g, "_")
    .replaceAll(/^_+|_+$/g, "")
    .toLowerCase();
}

function toKebabCase(value: string): string {
  return toSnakeCase(value).replaceAll("_", "-");
}

function toCamelCase(value: string): string {
  const parts = toSnakeCase(value).split("_");
  return (
    parts[0] +
    parts
      .slice(1)
      .map((part) => part[0]?.toUpperCase() + part.slice(1))
      .join("")
  );
}

function isObject(value: unknown): value is JsonObject {
  return value != null && typeof value === "object" && !Array.isArray(value);
}
