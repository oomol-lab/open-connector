import { parseArgs } from "node:util";
import { loadCatalog } from "../src/catalog-store.ts";
import { DEFAULT_ACTION_SEARCH_LIMIT, buildActionSearchIndex, searchActions } from "../src/core/action-search.ts";

const { values: options } = parseArgs({
  args: process.argv.slice(2),
  options: {
    limit: { type: "string" },
    query: { type: "string", short: "q" },
    service: { type: "string" },
  },
  strict: true,
});
if (!options.query) {
  printUsageAndExit();
}

const limit = options.limit == null ? DEFAULT_ACTION_SEARCH_LIMIT : Number(options.limit);
if (!Number.isInteger(limit) || limit < 1) {
  throw new Error("--limit must be a positive integer.");
}

const catalog = await loadCatalog();
const index = buildActionSearchIndex(catalog.actions);
const results = searchActions(index, options.query, {
  service: options.service,
  limit,
});

console.log(JSON.stringify(results, null, 2));

function printUsageAndExit(): never {
  console.error(`Usage:
  node scripts/search-actions.ts --query "send mail gmail" [--service gmail] [--limit 10]`);
  process.exit(1);
}
