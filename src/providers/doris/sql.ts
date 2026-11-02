import { providerInputError } from "../provider-runtime.ts";

/** Check statement boundaries without treating quoted values or comments as SQL keywords. */
export function assertReadOnlyQuery(query: string): void {
  const tokens: string[] = [];
  const token =
    /\s+|--[^\r\n]*|#[^\r\n]*|\/\*[\s\S]*?\*\/|'(?:''|[^'\\])*'|"(?:""|[^"\\])*"|`(?:``|[^`\\])*`|[\p{L}_][\p{L}\p{N}_$]*|[^\s]/guy;
  let offset = 0;
  let ended = false;
  let depth = 0;
  while (offset < query.length) {
    token.lastIndex = offset;
    const text = token.exec(query)?.[0];
    if (!text) {
      throw providerInputError("Invalid Doris SQL token");
    }
    offset = token.lastIndex;
    if (/^\s|^--|^#/.test(text)) {
      continue;
    }
    if (text.startsWith("/*")) {
      if (/^\/\*[!+]/.test(text)) {
        throw providerInputError("Doris SQL hints and executable comments are not supported");
      }
      continue;
    }
    if ((text === "/" && query[offset] === "*") || text === "'" || text === '"' || text === "`" || text === "\\") {
      throw providerInputError("Unterminated SQL quote/comment or unsupported backslash escape; use doubled quotes");
    }
    if (ended) {
      throw providerInputError("Doris queries must contain exactly one statement");
    }
    if (text === ";") {
      if (depth !== 0) {
        throw providerInputError("Doris queries must contain exactly one statement");
      }
      ended = true;
      continue;
    }
    if (text === "(") depth += 1;
    if (text === ")") depth -= 1;
    if (depth < 0) throw providerInputError("Unbalanced SQL parentheses");
    tokens.push(/^[\x27"`]/.test(text) ? "<quoted>" : text.toUpperCase());
  }
  if (depth !== 0) throw providerInputError("Unbalanced SQL parentheses");
  const first = tokens[0];
  if (!first || !["SELECT", "WITH", "SHOW", "DESC", "DESCRIBE", "EXPLAIN"].includes(first)) {
    throw providerInputError("Only SELECT, WITH, SHOW, DESC, DESCRIBE, and EXPLAIN queries are allowed");
  }
  // INTO OUTFILE is a write even when the account only has SELECT_PRIV.
  const forbidden =
    /^(?:INTO|INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE|LOAD|EXPORT|COPY|GRANT|REVOKE|SET|USE|CALL|EXECUTE|PREPARE|DEALLOCATE|KILL|ADMIN|CANCEL|REFRESH|RECOVER|RESTORE|BACKUP|ANALYZE|LOCK|UNLOCK|COMMIT|ROLLBACK)$/;
  tokens.forEach((text, index) => {
    if (first === "SHOW" && text !== "INTO") return;
    if (forbidden.test(text) || (text === "REPLACE" && tokens[index + 1] !== "(")) {
      throw providerInputError(`Doris read-only queries do not allow ${text}`);
    }
  });
  if (first === "WITH") {
    let nesting = 0;
    const hasQuery = tokens.some((text) => {
      if (text === "(") nesting += 1;
      if (text === ")") nesting -= 1;
      return nesting === 0 && text === "SELECT";
    });
    if (!hasQuery) throw providerInputError("WITH must end in a SELECT query");
  }
}
