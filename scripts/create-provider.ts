import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { assertProviderId } from "../src/core/provider-id.ts";
import { assertPublicHttpUrl } from "../src/core/request.ts";

const [service, displayName, endpoint, ...extra] = process.argv.slice(2);
if (!service || !displayName?.trim() || !endpoint || extra.length) {
  throw new Error('Usage: node scripts/create-provider.ts <service> "Display name" <public-json-endpoint>');
}
assertProviderId(service);
const url = assertPublicHttpUrl(endpoint, { fieldName: "endpoint", createError: (message) => new Error(message) });
const directory = join(process.cwd(), "src/providers", service);
const serviceLiteral = JSON.stringify(service);
const labelLiteral = JSON.stringify(displayName.trim());
const endpointLiteral = JSON.stringify(url.toString());
const description = JSON.stringify(`Read data from ${displayName.trim()}.`);

// An existing provider must never be partially overwritten.
await mkdir(directory);
try {
  await writeFile(
    join(directory, "definition.ts"),
    `import type { ProviderDefinition } from "../../core/types.ts";
import { actions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: ${serviceLiteral},
  displayName: ${labelLiteral},
  categories: ["Data"],
  authTypes: ["no_auth"],
  auth: [{ type: "no_auth" }],
  actions,
};
`,
  );
  await writeFile(
    join(directory, "actions.ts"),
    `import type { ActionDefinition } from "../../core/types.ts";
import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

export const actions: ActionDefinition[] = [
  defineProviderAction(${serviceLiteral}, {
    name: "get_data",
    operationType: "read",
    description: ${description},
    inputSchema: s.object({}),
    outputSchema: s.object({ data: s.unknown("Response from the provider.") }),
  }),
];
`,
  );
  await writeFile(
    join(directory, "executors.ts"),
    `import type { ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import { defineProviderExecutors, runProviderRequest, readProviderJsonBody, readProviderErrorTextBody, ProviderRequestError } from "../provider-runtime.ts";

interface Context {
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

const service = ${serviceLiteral};
const handlers: ProviderActionHandlers<typeof service, (input: Record<string, unknown>, context: Context) => Promise<unknown>> = {
  async get_data(_input, context) {
    return runProviderRequest({ signal: context.signal, label: service }, async signal => {
      const response = await context.fetcher(${endpointLiteral}, { signal });
      if (!response.ok) {
        throw new ProviderRequestError(response.status, await readProviderErrorTextBody(response, service, signal));
      }
      const data = await readProviderJsonBody(response, { emptyBody: null, invalidJsonMessage: "Provider returned invalid JSON." });
      return { data };
    });
  },
};

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers,
  createContext: (context, fetcher): Context => ({ fetcher, signal: context.signal }),
});
`,
  );
} catch (error) {
  try {
    await rm(directory, { recursive: true, force: true });
  } catch (cleanupError) {
    throw new AggregateError(
      [error, cleanupError],
      "Provider creation failed and its incomplete directory could not be removed.",
    );
  }
  throw error;
}
console.log(
  `Created ${directory}. Replace the generic action/schema with the provider's documented contract, then run npm run generate:catalog and npm run fix-check.`,
);
