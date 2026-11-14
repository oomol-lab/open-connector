import { TenantError } from "./tenant-error.ts";

/**
 * Connection-ownership subject written to connection_requests.owner and
 * connections.subject. Format `<kind>:<id>`; the Hub maps it to its own
 * subject model (user / space / service).
 */
export type SubjectKind = "user" | "space" | "service";

export interface Subject {
  kind: SubjectKind;
  id: string;
}

/**
 * Legacy owner value carried by pre-OC-1 single-tenant rows. It does not match
 * the `<kind>:<id>` grammar on purpose — it is a data value, not a new input.
 */
export const LEGACY_LOCAL_SUBJECT = "local-admin";

const SUBJECT_PATTERN = /^(user|space|service):([a-zA-Z0-9][a-zA-Z0-9._@-]{0,126})$/;

export function isSubject(value: string): boolean {
  return SUBJECT_PATTERN.test(value);
}

export function parseSubject(value: string): Subject | null {
  const match = SUBJECT_PATTERN.exec(value);
  return match ? { kind: match[1] as SubjectKind, id: match[2] } : null;
}

export function formatSubject(subject: Subject): string {
  return `${subject.kind}:${subject.id}`;
}

/** Validate a caller-supplied subject; the legacy owner is rejected implicitly by the grammar. */
export function requireSubject(value: string): string {
  if (!isSubject(value)) {
    throw new TenantError("invalid_subject", `invalid subject: ${JSON.stringify(value)}`);
  }
  return value;
}
