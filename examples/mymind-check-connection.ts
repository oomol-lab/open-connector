import type { ActionExecutor, ExecutionContext, ExecutionResult, ResolvedCredential } from "../src/core/types.ts";

import { credentialValidators, executors } from "../src/providers/mymind/executors.ts";

/**
 * Check that a mymind access key works end to end.
 *
 * Run it with an access key from https://access.mymind.com/extensions:
 *
 *   MYMIND_KEY_ID=... MYMIND_PRIVATE_KEY=... node examples/mymind-check-connection.ts
 *
 * By default it only reads, so it cannot change the mind it is checking. Pass
 * --write to also run a round trip that creates a note, edits it, and deletes
 * it again; that needs a full-access key. The round trip removes the note's
 * tags before deleting, because a tag outlives the object that carried it, but
 * mymind also tags new content by itself and does so asynchronously, so a few
 * auto-generated tags can still appear a moment later. Emptying Trash in the
 * mymind app clears those.
 */

const requiredEnvironment = ["MYMIND_KEY_ID", "MYMIND_PRIVATE_KEY"] as const;
const service = "mymind";
const noteTitle = "open-connector connection check";
const noteTag = "open-connector-check";

async function main(): Promise<void> {
  const missing = requiredEnvironment.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    console.log(`Skip mymind connection check: missing ${missing.join(", ")}.`);
    console.log("Create an access key at https://access.mymind.com/extensions and export both values.");
    return;
  }

  const values = {
    keyId: process.env.MYMIND_KEY_ID!.trim(),
    keySecret: process.env.MYMIND_PRIVATE_KEY!.trim(),
  };
  const credential: ResolvedCredential = {
    authType: "custom_credential",
    values,
    profile: { accountId: values.keyId, displayName: `mymind key ${values.keyId}`, grantedScopes: [] },
    metadata: {},
  };
  const context: ExecutionContext = {
    async getCredential(requested) {
      return requested === service ? credential : undefined;
    },
  };
  const write = process.argv.includes("--write");

  console.log(`Checking mymind key ${values.keyId}\n`);

  const validation = await credentialValidators.customCredential?.({ values }, { fetcher: fetch });
  console.log(`credential validated as ${validation?.profile?.displayName ?? values.keyId}\n`);

  const tags = await run("list_tags", {}, context);
  const spaces = await run("list_spaces", {}, context);
  const links = await run("list_links", {}, context);
  console.log(`list_tags     ${count(tags.tags)} tags${preview(names(tags.tags))}`);
  console.log(`list_spaces   ${count(spaces.spaces)} spaces${preview(names(spaces.spaces))}`);
  console.log(`list_links    ${count(links.links)} links`);

  const recent = await run("list_objects", { limit: 5 }, context);
  const objects = asArray(recent.objects);
  console.log(`list_objects  ${objects.length} objects${preview(objects.map(title))}`);

  const firstTag = names(tags.tags)[0];
  if (firstTag) {
    const found = await run("search_objects", { query: `tag:${quoteTerm(firstTag)}`, limit: 3 }, context);
    const matches = asArray(found.matches);
    console.log(`search_objects ${matches.length} matches for tag:${quoteTerm(firstTag)}`);
    for (const match of matches) {
      const object = record(match.object);
      console.log(`   ${String(match.id)}  score ${String(match.score)}  ${title(object)}`);
    }
  }

  const sample = objects[0];
  if (sample?.id) {
    const objectId = String(sample.id);
    const full = await run("get_object", { objectId }, context);
    console.log(`\nget_object    ${objectId} -> ${title(full)}`);
    const content = await run("get_object_content", { objectId }, context);
    const markdown = String(content.markdown ?? "");
    console.log(
      content.hasContent === true
        ? `get_object_content ${markdown.length} chars of markdown`
        : "get_object_content object has no inline body (normal for a bookmark or image)",
    );
    if (markdown) {
      console.log(indent(markdown.split("\n").slice(0, 3).join("\n")));
    }
  }

  if (!write) {
    console.log("\nReads work. Pass --write to also check creating and deleting a note.");
    return;
  }

  console.log("\nWrite round trip (everything created here is deleted again):");
  const created = await run(
    "create_note",
    {
      title: noteTitle,
      content: `# ${noteTitle}\n\nCreated by examples/mymind-check-connection.ts. Safe to delete.`,
      tags: [noteTag],
    },
    context,
  );
  const noteId = String(record(created.object).id ?? "");
  if (!noteId) {
    throw new Error("create_note did not return an object id");
  }
  console.log(`   create_note   ${noteId} (created=${String(created.created)})`);

  try {
    const readBack = await run("get_object_content", { objectId: noteId }, context);
    console.log(`   read back     ${JSON.stringify(String(readBack.markdown ?? "").slice(0, 60))}`);

    await run("update_object", { objectId: noteId, title: `${noteTitle} (updated)` }, context);
    const updated = await run("get_object", { objectId: noteId }, context);
    console.log(`   update_object title is now ${JSON.stringify(title(updated))}`);
    console.log(`   tags on note  ${names(record(updated).tags).join(", ") || "(none yet)"}`);
  } finally {
    // Strip every tag before deleting, and read them back rather than assuming
    // the one we set: mymind tags new content itself, and a tag outlives the
    // object that carried it, so deleting first leaves those tags in the mind.
    const beforeDelete = await run("get_object", { objectId: noteId }, context);
    const attached = names(record(beforeDelete).tags);
    if (attached.length > 0) {
      await run("remove_object_tags", { objectId: noteId, tags: attached }, context);
      console.log(`   remove_object_tags ${attached.join(", ")}`);
    }
    const deleted = await run("delete_object", { objectId: noteId }, context);
    console.log(`   delete_object ${noteId} (acknowledged=${String(deleted.acknowledged)})`);
    console.log(
      "   note: mymind soft-deletes to Trash, and tags new content asynchronously,\n" +
        "   so a few auto-generated tags may still surface. Empty Trash in the app to clear them.",
    );
  }

  console.log("\nConnection works.");
}

async function run(
  actionName: string,
  input: Record<string, unknown>,
  context: ExecutionContext,
): Promise<Record<string, unknown>> {
  const executor: ActionExecutor | undefined = executors[`${service}.${actionName}`];
  if (!executor) {
    throw new Error(`No executor for ${service}.${actionName}`);
  }

  const result: ExecutionResult = await executor(input, context);
  if (!result.ok) {
    throw new Error(`${service}.${actionName} failed: ${result.error?.code} ${result.error?.message}`);
  }
  return (result.output ?? {}) as Record<string, unknown>;
}

function asArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => isRecord(item)) : [];
}

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function names(value: unknown): string[] {
  return asArray(value)
    .map((item) => (typeof item.name === "string" ? item.name : ""))
    .filter(Boolean);
}

function title(value: unknown): string {
  const text = record(value).title;
  return typeof text === "string" && text ? text : "(untitled)";
}

function count(value: unknown): number {
  return asArray(value).length;
}

function preview(items: string[]): string {
  return items.length === 0 ? "" : `: ${items.slice(0, 3).join(", ")}${items.length > 3 ? ", …" : ""}`;
}

function quoteTerm(value: string): string {
  return /\s/u.test(value) ? `"${value}"` : value;
}

function indent(text: string): string {
  return text
    .split("\n")
    .map((line) => `      ${line}`)
    .join("\n");
}

await main();
