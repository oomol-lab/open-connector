import { optionalRecord, optionalString } from "../src/core/cast.ts";
import { closedloopAiActionHandlers } from "../src/providers/closedloop_ai/runtime.ts";
import { providerFetch } from "../src/providers/provider-runtime.ts";

// Run only with your own authorized US workspace token. Results may contain
// private customer evidence: keep this output local and do not commit it.
const accessToken = process.env.CLOSEDLOOP_AI_ACCESS_TOKEN;
const query = process.env.CLOSEDLOOP_AI_QUERY;
if (!accessToken || !query) {
  console.log("SKIP: set CLOSEDLOOP_AI_ACCESS_TOKEN and CLOSEDLOOP_AI_QUERY using your own authorized US workspace.");
} else {
  const context = { accessToken, fetcher: providerFetch };
  const overview = await closedloopAiActionHandlers.get_overview({ time_range: "30d" }, context);
  console.log(JSON.stringify({ stage: "overview", result: overview }, null, 2));
  const search = await closedloopAiActionHandlers.search_insights({ query, limit: 5, offset: 0 }, context);
  console.log(JSON.stringify({ stage: "search", result: search }, null, 2));
  const id = process.env.CLOSEDLOOP_AI_INSIGHT_ID;
  if (!id) {
    console.log(
      "Select an actual full insight ID from the results, set CLOSEDLOOP_AI_INSIGHT_ID, and rerun to follow its source.",
    );
  } else {
    const insight = await closedloopAiActionHandlers.get_insight({ id }, context);
    console.log(JSON.stringify({ stage: "insight", result: insight }, null, 2));
    const pointer = optionalRecord(readStructuredAnswer(insight)?.conversation);
    const conversationId = optionalString(pointer?.id);
    const source = optionalString(pointer?.source);
    if (!conversationId || !source) {
      console.log("No openable conversation pointer was returned; no source ID or source system was inferred.");
    } else {
      const evidence = await closedloopAiActionHandlers.get_conversation({ id: conversationId, source }, context);
      console.log(JSON.stringify({ stage: "source", result: evidence }, null, 2));
      console.log("Read source_complete and warning_codes before quoting the returned evidence as complete.");
    }
  }
}

/** Read the actual upstream record without treating missing evidence as a result. */
function readStructuredAnswer(value: unknown): Record<string, unknown> | undefined {
  const envelope = optionalRecord(value);
  const structured = optionalRecord(envelope?.structuredContent);
  if (structured) return structured;
  if (!Array.isArray(envelope?.content)) return undefined;
  for (const raw of envelope.content) {
    const block = optionalRecord(raw);
    const text = block?.type === "text" ? optionalString(block.text) : undefined;
    if (!text) continue;
    try {
      const parsed = optionalRecord(JSON.parse(text));
      if (parsed) return parsed;
    } catch {
      /* A text warning is not a structured product record. */
    }
  }
  return undefined;
}
