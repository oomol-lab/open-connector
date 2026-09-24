import { readBoundedResponseBytes } from "../../core/request.ts";
import { TikHubRequestError } from "./errors.ts";

export class BoundedResponseTooLargeError extends TikHubRequestError {}

export async function readBoundedResponseText(
  response: Response,
  input: { maxBytes: number; label: string },
): Promise<string> {
  const bytes = await readBoundedResponseBytes(response, {
    maxBytes: input.maxBytes,
    fieldName: input.label,
    createError: () => responseTooLarge(input),
  });
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export function cancelResponseBody(response: Response): void {
  try {
    void response.body?.cancel().catch(() => undefined);
  } catch {
    return;
  }
}

function responseTooLarge(input: { maxBytes: number; label: string }) {
  return new BoundedResponseTooLargeError(
    "provider_error",
    `${input.label} exceeds the ${input.maxBytes} byte limit`,
    502,
  );
}
