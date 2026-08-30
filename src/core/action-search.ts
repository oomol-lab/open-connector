import type { ActionDefinition } from "./types.ts";
import type { Options, SearchResult } from "minisearch";

import MiniSearch from "minisearch";

/**
 * The subset of an action that is indexed and returned in search results.
 */
export interface ActionSearchDocument {
  id: string;
  service: string;
  name: string;
  description: string;
}

type ActionSearchField = "service" | "name" | "description";

export interface ActionSearchOptions {
  limit?: number;
  fuzzy?: number;
  prefix?: boolean;
  service?: string;
}

export interface ActionSearchIndexProvider {
  get(): Promise<MiniSearch<ActionSearchDocument>>;
}

const indexFields: readonly ActionSearchField[] = ["service", "name", "description"];
const storeFields = ["id", "service", "name", "description"] as const;

const DEFAULT_ACTION_SEARCH_BOOST: Record<ActionSearchField, number> = {
  service: 3,
  name: 2,
  description: 1,
};
export const DEFAULT_ACTION_SEARCH_FUZZY = 0.1;
export const DEFAULT_ACTION_SEARCH_LIMIT = 20;

const stopWords = new Set([
  "i",
  "me",
  "my",
  "myself",
  "we",
  "our",
  "ours",
  "ourselves",
  "you",
  "your",
  "yours",
  "yourself",
  "yourselves",
  "he",
  "him",
  "his",
  "himself",
  "she",
  "her",
  "hers",
  "herself",
  "it",
  "its",
  "itself",
  "they",
  "them",
  "their",
  "theirs",
  "themselves",
  "what",
  "which",
  "who",
  "whom",
  "this",
  "that",
  "these",
  "those",
  "am",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "having",
  "do",
  "does",
  "did",
  "doing",
  "a",
  "an",
  "the",
  "and",
  "but",
  "if",
  "or",
  "because",
  "as",
  "until",
  "while",
  "of",
  "at",
  "by",
  "for",
  "with",
  "about",
  "against",
  "between",
  "into",
  "through",
  "during",
  "before",
  "after",
  "above",
  "below",
  "to",
  "from",
  "up",
  "down",
  "in",
  "out",
  "on",
  "off",
  "over",
  "under",
  "again",
  "further",
  "then",
  "once",
  "here",
  "there",
  "when",
  "where",
  "why",
  "how",
  "all",
  "any",
  "both",
  "each",
  "few",
  "more",
  "most",
  "other",
  "some",
  "such",
  "no",
  "nor",
  "not",
  "only",
  "own",
  "same",
  "than",
  "too",
  "very",
  "can",
  "will",
  "just",
  "should",
  "now",
  "please",
  "via",
  "using",
  "kindly",
  "let",
  "know",
  "want",
  "need",
  "new",
  "would",
  "could",
  "so",
  "right",
  "tell",
]);

const querySynonyms: Record<string, readonly string[]> = {
  mail: ["mail", "email"],
  email: ["email", "mail"],
  msg: ["msg", "message"],
  message: ["message", "msg"],
  doc: ["doc", "document"],
  document: ["document", "doc"],
  repo: ["repo", "repository"],
  repository: ["repository", "repo"],
};

const miniSearchOptions: Options<ActionSearchDocument> = {
  idField: "id",
  fields: [...indexFields],
  storeFields: [...storeFields],
  processTerm: indexProcessTerm,
};

export function toActionSearchDocument(action: ActionDefinition): ActionSearchDocument {
  return {
    id: action.id,
    service: action.service,
    name: action.name,
    description: action.description,
  };
}

export function buildActionSearchIndex(actions: Iterable<ActionDefinition>): MiniSearch<ActionSearchDocument> {
  const index = new MiniSearch<ActionSearchDocument>(miniSearchOptions);
  index.addAll(Array.from(actions, toActionSearchDocument));
  return index;
}

export function createActionSearchIndexProvider(actions: Iterable<ActionDefinition>): ActionSearchIndexProvider {
  let indexPromise: Promise<MiniSearch<ActionSearchDocument>> | undefined;
  return {
    get() {
      if (!indexPromise) {
        const building = Promise.resolve().then(() => buildActionSearchIndex(actions));
        building.catch(() => {
          if (indexPromise === building) {
            indexPromise = undefined;
          }
        });
        indexPromise = building;
      }
      return indexPromise;
    },
  };
}

export function searchActions(
  index: MiniSearch<ActionSearchDocument>,
  query: string,
  options: ActionSearchOptions = {},
): ActionSearchDocument[] {
  const { limit = DEFAULT_ACTION_SEARCH_LIMIT, fuzzy = DEFAULT_ACTION_SEARCH_FUZZY, prefix = true, service } = options;
  const results = index.search(query, {
    fuzzy,
    prefix,
    combineWith: "OR",
    boost: DEFAULT_ACTION_SEARCH_BOOST,
    weights: { fuzzy: 0.5, prefix: 0.1 },
    processTerm: searchProcessTerm,
    filter: service ? (result) => result.service === service : undefined,
  });
  return results.slice(0, limit).map(toActionSearchResult);
}

function normalizeTerm(term: string): string {
  return term.toLowerCase();
}

function indexProcessTerm(term: string): string | null {
  const normalized = normalizeTerm(term);
  return stopWords.has(normalized) ? null : normalized;
}

function searchProcessTerm(term: string): string | string[] | null {
  const normalized = normalizeTerm(term);
  if (stopWords.has(normalized)) {
    return null;
  }
  const synonyms = querySynonyms[normalized];
  return synonyms ? [...synonyms] : normalized;
}

function toActionSearchResult(result: SearchResult): ActionSearchDocument {
  return {
    id: result.id as string,
    service: result.service as string,
    name: result.name as string,
    description: result.description as string,
  };
}
