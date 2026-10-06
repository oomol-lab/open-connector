import type { ExecutionContext } from "../../core/types.ts";
import type { GmailMimeAttachment } from "./mime.ts";

import { Buffer } from "node:buffer";
import { base64Bytes, objectArray, optionalString, requiredRawString } from "../../core/cast.ts";
import { providerInputError, ProviderRequestError, readTransitFileInput } from "../provider-runtime.ts";
import { gmailMaxAttachmentBytes, gmailMaxAttachmentCount } from "./limits.ts";
import { assertMimeAttachmentMetadata } from "./mime.ts";

interface AttachmentContext {
  transitFiles?: ExecutionContext["transitFiles"];
}

/** Resolve supplied content only; HTML and URL-to-CID conversion belong to callers. */
export async function readGmailAttachments(
  value: unknown,
  context: AttachmentContext,
): Promise<GmailMimeAttachment[] | undefined> {
  if (value === undefined) return undefined;
  const inputs = objectArray(value, "attachments", providerInputError);
  if (inputs.length > gmailMaxAttachmentCount) {
    throw providerInputError(`attachments must contain at most ${gmailMaxAttachmentCount} files`);
  }
  const attachments: GmailMimeAttachment[] = [];
  const contentIds = new Set<string>();
  let totalBytes = 0;
  for (let index = 0; index < inputs.length; index++) {
    const input = inputs[index]!;
    const field = `attachments[${index}]`;
    const hasBase64 = Object.hasOwn(input, "contentBase64");
    if (hasBase64 === Object.hasOwn(input, "file")) {
      throw providerInputError(`${field} requires exactly one of contentBase64 or file`);
    }
    let filename =
      input.filename === undefined
        ? undefined
        : requiredRawString(input.filename, `${field}.filename`, providerInputError);
    let mimeType =
      input.mimeType === undefined
        ? undefined
        : requiredRawString(input.mimeType, `${field}.mimeType`, providerInputError);
    const contentId =
      input.contentId === undefined
        ? undefined
        : requiredRawString(input.contentId, `${field}.contentId`, providerInputError);
    const disposition = input.disposition ?? (contentId ? "inline" : "attachment");
    if (disposition !== "inline" && disposition !== "attachment")
      throw providerInputError(`${field}.disposition must be inline or attachment`);
    if (contentId !== undefined) {
      if (contentIds.has(contentId)) throw providerInputError(`Duplicate attachment contentId: ${contentId}`);
      contentIds.add(contentId);
    }
    let contentBase64: string;
    if (hasBase64) {
      const encoded = requiredRawString(input.contentBase64, `${field}.contentBase64`, providerInputError);
      // Reject oversized encoded input before the shared strict decoder allocates bytes.
      if (encoded.length > Math.ceil((gmailMaxAttachmentBytes - totalBytes) / 3) * 4) throw attachmentTooLarge();
      const bytes =
        encoded === "" ? new Uint8Array(0) : base64Bytes(encoded, `${field}.contentBase64`, providerInputError);
      totalBytes += bytes.byteLength;
      if (totalBytes > gmailMaxAttachmentBytes) throw attachmentTooLarge();
      contentBase64 = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64");
    } else {
      const source = await readTransitFileInput(input.file, context);
      if (source.file.size > gmailMaxAttachmentBytes - totalBytes) throw attachmentTooLarge();
      totalBytes += source.file.size;
      contentBase64 = Buffer.from(await source.file.arrayBuffer()).toString("base64");
      filename ??= source.name;
      mimeType ??= optionalString(source.mimeType);
    }
    const attachment: GmailMimeAttachment = {
      filename,
      mimeType: mimeType ?? "application/octet-stream",
      contentBase64,
      contentId,
      disposition,
    };
    assertMimeAttachmentMetadata(attachment);
    attachments.push(attachment);
  }
  return attachments;
}

function attachmentTooLarge(): ProviderRequestError {
  return new ProviderRequestError(413, `Gmail attachment content exceeds ${gmailMaxAttachmentBytes} bytes in total`);
}
