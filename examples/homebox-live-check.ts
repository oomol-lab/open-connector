/**
 * Live verification of the HomeBox provider against a real instance.
 *
 * Read-only by default; the only mutating check creates and deletes a
 * marker-prefixed entity type, so repeated runs stay clean.
 *
 * Create a static API key in the HomeBox web interface (Users -> API Keys),
 * then run:
 *
 *   HOMEBOX_BASE_URL=http://homebox.local \
 *   HOMEBOX_API_KEY='...' \
 *   node examples/homebox-live-check.ts
 */
import { setPrivateNetworkAccessAllowed } from "../src/core/request.ts";
import { homeBoxActionHandlers } from "../src/providers/homebox/runtime.ts";
import { createProviderFetch, ProviderRequestError } from "../src/providers/provider-runtime.ts";

const baseUrl = process.env.HOMEBOX_BASE_URL?.trim();
const apiKey = process.env.HOMEBOX_API_KEY?.trim();

const fetcher = createProviderFetch({ allowPrivateNetwork: () => true });
// A HomeBox instance is commonly reachable only on the local network. In
// production the server bootstrap enables this flag from
// OOMOL_CONNECT_ALLOW_PRIVATE_NETWORK; a standalone example has no bootstrap,
// so it opts in explicitly.
setPrivateNetworkAccessAllowed(true);

const context = {
  apiKey: apiKey ?? "",
  baseUrl: baseUrl ?? "http://homebox.local",
  fetcher,
};

const E2E_MARKER = "connector-e2e";
const createdEntityTypeName = `${E2E_MARKER}-type`;

let failures = 0;
let createdEntityTypeId: string | null = null;

function check(label: string, condition: boolean, detail: string): void {
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    failures += 1;
    console.error(`  ✗ ${label}: ${detail}`);
  }
}

async function step(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (error) {
    failures += 1;
    console.error(`  ✗ ${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function main(): Promise<void> {
  if (!baseUrl || !apiKey) {
    console.log("Skip HomeBox live check: set HOMEBOX_BASE_URL and HOMEBOX_API_KEY.");
    return;
  }

  console.log(`[homebox] live check against ${baseUrl}`);

  await step("status", async () => {
    const result = (await homeBoxActionHandlers.get_status?.({}, context)) as { summary: { health?: boolean } };
    check("status is healthy", result.summary.health === true, "health flag is not true");
  });

  await step("list entity types", async () => {
    const result = (await homeBoxActionHandlers.list_entity_types?.({}, context)) as { entityTypes: unknown[] };
    check("entity type list responds", Array.isArray(result.entityTypes), "no entityTypes array");
  });

  await step("list tags", async () => {
    const result = (await homeBoxActionHandlers.list_tags?.({}, context)) as { tags: unknown[] };
    check("tag list responds", Array.isArray(result.tags), "no tags array");
  });

  await step("search entities", async () => {
    const result = (await homeBoxActionHandlers.list_entities?.({}, context)) as { total: number; items: unknown[] };
    check("entity search responds", typeof result.total === "number", "no total");
  });

  await step("custom field names", async () => {
    const result = (await homeBoxActionHandlers.list_custom_field_names?.({}, context)) as { names: string[] };
    check("field names respond", Array.isArray(result.names), "no names array");
  });

  if (!failures) {
    await step("create marker entity type", async () => {
      const result = (await homeBoxActionHandlers.create_entity_type?.({ name: createdEntityTypeName }, context)) as {
        entityType: { id: string };
      };
      createdEntityTypeId = result.entityType.id;
      check(
        "entity type created",
        typeof createdEntityTypeId === "string" && createdEntityTypeId.length > 0,
        "no entity type id",
      );
    });

    await step("delete marker entity type", async () => {
      if (createdEntityTypeId) {
        const result = (await homeBoxActionHandlers.delete_entity_type?.(
          { entityTypeId: createdEntityTypeId },
          context,
        )) as { deleted: boolean };
        check("entity type deleted", result.deleted === true, "deleted flag is not true");
      }
    });
  }

  if (failures > 0) {
    console.error(`[homebox] live check failed: ${failures} check(s) failed.`);
    if (createdEntityTypeId) {
      console.error(`[homebox] leaving ${createdEntityTypeName} (${createdEntityTypeId}) for inspection.`);
    }
    process.exitCode = 1;
  } else {
    console.log("[homebox] live check passed.");
  }
}

// Surface clean provider errors without a stack trace.
void main().catch((error: unknown) => {
  if (error instanceof ProviderRequestError) {
    console.error(`[homebox] live check failed: ${error.message}`);
    process.exitCode = 1;
  } else {
    throw error;
  }
});
