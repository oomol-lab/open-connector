import type { RuntimeLogger } from "../../core/types.ts";
import type { OAuthClientMetadata } from "./client-metadata.ts";

import { createGuardedFetch } from "../../core/guarded-fetch.ts";
import { readBoundedResponseBytes } from "../../core/request.ts";
import { normalizeClientMetadata } from "./client-metadata.ts";

/**
 * Client ID Metadata Documents (draft-ietf-oauth-client-id-metadata-document).
 * The `client_id` IS an HTTPS URL; the document it serves describes the client.
 * The URL is attacker-influenced input to a server-side fetch, so every fetch
 * goes through the shared egress guard, HTTPS only, with a hard size cap.
 */

const maxDocumentBytes = 1024 * 1024;
const fetchTimeoutMs = 10_000;
const cacheTtlMs = 3_600_000;

interface CacheEntry {
  metadata: OAuthClientMetadata;
  expiresAt: number;
}

export class CimdError extends Error {
  readonly code: "invalid_client_metadata" | "invalid_client" | "access_denied";

  constructor(code: "invalid_client_metadata" | "invalid_client" | "access_denied", message: string) {
    super(message);
    this.code = code;
  }
}

export interface CimdClientOptions {
  logger?: RuntimeLogger;
  cache?: Map<string, CacheEntry>;
  fetch?: typeof fetch;
  now?: () => number;
}

export class CimdClient {
  private readonly cache: Map<string, CacheEntry>;
  private readonly fetcher: typeof fetch;
  private readonly logger?: RuntimeLogger;
  private readonly now: () => number;

  constructor(options: CimdClientOptions = {}) {
    this.cache = options.cache ?? new Map();
    this.fetcher = options.fetch ?? createGuardedFetch({ maxRedirects: 3, allowPrivateNetwork: false });
    this.logger = options.logger;
    this.now = options.now ?? Date.now;
  }

  /**
   * Fetch (or reuse a cached) metadata document for one CIMD client_id.
   * Cache entries live one hour; a failed revalidation keeps serving the last
   * good document until its entry expires, so a flapping host cannot lock an
   * already-authorized client out mid-flow.
   */
  async resolve(clientId: string): Promise<OAuthClientMetadata> {
    if (!clientId.startsWith("https://")) {
      throw new CimdError("invalid_client", "A client_id metadata document must be an HTTPS URL.");
    }
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(clientId);
    } catch {
      throw new CimdError("invalid_client", "A client_id metadata document must be a valid URL.");
    }
    if (parsedUrl.username || parsedUrl.password || parsedUrl.search || parsedUrl.hash) {
      throw new CimdError(
        "invalid_client",
        "A client_id metadata document URL must not contain credentials, a query, or a fragment.",
      );
    }

    const cached = this.cache.get(clientId);
    if (cached && cached.expiresAt > this.now()) {
      return cached.metadata;
    }

    let response: Response;
    // One deadline for the whole exchange (connect, headers, and body read):
    // a server that trickles bytes cannot wedge the request past 10s either.
    const timeoutSignal = AbortSignal.timeout(fetchTimeoutMs);
    try {
      response = await this.fetcher(clientId, {
        method: "GET",
        headers: { accept: "application/json" },
        redirect: "error",
        signal: timeoutSignal,
      });
    } catch (error) {
      if (cached) {
        return cached.metadata;
      }
      throw new CimdError(
        "invalid_client",
        `Unable to fetch the client metadata document: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (!response.ok) {
      if (cached) {
        return cached.metadata;
      }
      throw new CimdError("invalid_client", `The client metadata document responded with ${response.status}.`);
    }

    let body: string;
    try {
      const bytes = await readBoundedResponseBytes(response, {
        maxBytes: maxDocumentBytes,
        fieldName: "client metadata document",
        createError: () => new CimdError("invalid_client", "The client metadata document exceeds 1 MiB."),
        signal: timeoutSignal,
      });
      body = new TextDecoder().decode(bytes);
    } catch (error) {
      if (cached) {
        return cached.metadata;
      }
      throw error instanceof CimdError
        ? error
        : new CimdError("invalid_client", "Unable to read the client metadata document.");
    }

    let document: unknown;
    try {
      document = JSON.parse(body);
    } catch {
      throw new CimdError("invalid_client", "The client metadata document is not valid JSON.");
    }

    const metadata = normalizeClientMetadata(document);
    if (!metadata) {
      throw new CimdError("invalid_client_metadata", "The client metadata document is missing required fields.");
    }
    // CIMD section 4: the document's client_id must equal the URL it was
    // fetched from, or the document does not describe this client.
    if (metadata.clientId !== clientId) {
      throw new CimdError("invalid_client_metadata", "The document's client_id does not match its retrieval URL.");
    }
    this.cache.set(clientId, { metadata, expiresAt: this.now() + cacheTtlMs });
    return metadata;
  }
}
