import type { TransitFileWriter, CredentialValidationResult } from "../../core/types.ts";

import { SignJWT } from "jose";
import { optionalRecord, optionalString } from "../../core/cast.ts";
import { providerResponseError } from "../provider-runtime.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import { providerUserAgent, requiredResponseRecord, runProviderRequest } from "../provider-runtime.ts";
export const ilovepdfApiBaseUrl = "https://api.ilovepdf.com/v1";
const ilovepdfTools: Record<string, string> = {
  merge_pdf: "merge",
  split_pdf: "split",
  compress_pdf: "compress",
  rotate_pdf: "rotate",
  office_to_pdf: "officepdf",
  image_to_pdf: "imagepdf",
  pdf_to_image: "pdfjpg",
  ocr_pdf: "pdfocr",
  extract_text: "extract",
  protect_pdf: "protect",
  unlock_pdf: "unlock",
  repair_pdf: "repair",
  add_page_numbers: "pagenumber",
  convert_to_pdfa: "pdfa",
  validate_pdfa: "validatepdfa",
};
const processFields: Record<string, string> = {
  meta: "meta",
  ignoreErrors: "ignore_errors",
  ignorePassword: "ignore_password",
  outputFilename: "output_filename",
  packagedFilename: "packaged_filename",
  fileEncryptionKey: "file_encryption_key",
  tryPdfRepair: "try_pdf_repair",
  tryImageRepair: "try_image_repair",
  customInt: "custom_int",
  customString: "custom_string",
  splitMode: "split_mode",
  ranges: "ranges",
  fixedRange: "fixed_range",
  removePages: "remove_pages",
  mergeAfter: "merge_after",
  compressionLevel: "compression_level",
  pdfjpgMode: "pdfjpg_mode",
  orientation: "orientation",
  margin: "margin",
  pageSize: "pagesize",
  ocrLanguages: "ocr_languages",
  detailed: "detailed",
  outputPassword: "password",
  facingPages: "facing_pages",
  firstCover: "first_cover",
  pages: "pages",
  startingNumber: "starting_number",
  verticalPosition: "vertical_position",
  horizontalPosition: "horizontal_position",
  verticalPositionAdjustment: "vertical_position_adjustment",
  horizontalPositionAdjustment: "horizontal_position_adjustment",
  fontFamily: "font_family",
  fontSize: "font_size",
  fontColor: "font_color",
  text: "text",
  conformance: "conformance",
  allowDowngrade: "allow_downgrade",
};
export interface IlovepdfContext {
  secretKey: string;
  publicKey: string;
  fetcher: typeof fetch;
  transitFiles?: TransitFileWriter;
  signal?: AbortSignal;
}
interface SourceFile {
  fileUrl: string;
  filename: string;
  rotate?: number;
  password?: string;
}
export async function createIlovepdfToken(
  secretKey: string,
  publicKey: string,
  fileEncryptionKey?: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ file_encryption_key: fileEncryptionKey })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setJti(publicKey)
    .setIssuer("api.ilovepdf.com")
    .setIssuedAt(now - 5)
    .setNotBefore(now - 5)
    .setExpirationTime(now + 3595)
    .sign(new TextEncoder().encode(secretKey));
}
export async function validateIlovepdfCredential(
  secretKey: string,
  publicKey: string,
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const token = await createIlovepdfToken(secretKey, publicKey);
  await requestJson(
    `${ilovepdfApiBaseUrl}/task`,
    token,
    fetcher,
    {
      secret_key: secretKey,
      page: 1,
    },
    [secretKey, publicKey, token],
  );
  return {
    profile: { displayName: "iLovePDF API Project" },
    grantedScopes: [],
    metadata: {},
  };
}
export async function processIlovepdfFiles(
  actionName: string,
  input: Record<string, unknown>,
  context: IlovepdfContext,
): Promise<unknown> {
  const { transitFiles } = context;
  const validationOnly = actionName === "validate_pdfa";
  if (!validationOnly && !transitFiles?.createFromStream) {
    throw new ProviderRequestError(
      500,
      "iLovePDF file processing requires streaming transit file storage",
      undefined,
      "provider_error",
    );
  }
  const files = input.files as SourceFile[];
  const token = await createIlovepdfToken(
    context.secretKey,
    context.publicKey,
    optionalString(input.fileEncryptionKey),
  );
  const secrets = [
    context.secretKey,
    context.publicKey,
    token,
    optionalString(input.fileEncryptionKey),
    optionalString(input.outputPassword),
    ...files.map((file) => file.password),
  ].filter((value): value is string => Boolean(value));
  const tool = ilovepdfTools[actionName];
  const region = optionalString(input.region);
  const start = requiredResponseRecord(
    await requestJson(
      `${ilovepdfApiBaseUrl}/start/${tool}${region ? `/${region}` : ""}`,
      token,
      context.fetcher,
      undefined,
      secrets,
      undefined,
      context.signal,
    ),
    "iLovePDF start response",
  );
  const task = requiredResponseString(start.task, "task");
  const server = requiredResponseString(start.server, "server");
  const baseUrl = taskServerBaseUrl(server);
  const uploaded = [];
  for (const file of files) {
    const result = requiredResponseRecord(
      await requestJson(
        `${baseUrl}/upload`,
        token,
        context.fetcher,
        {
          task,
          cloud_file: file.fileUrl,
        },
        secrets,
        120000,
        context.signal,
      ),
      "iLovePDF upload response",
    );
    uploaded.push({
      server_filename: requiredResponseString(result.server_filename, "server_filename"),
      filename: file.filename,
      rotate: file.rotate,
      password: file.password,
    });
  }
  const body: Record<string, unknown> = { task, tool, files: uploaded };
  for (const [field, upstream] of Object.entries(processFields)) {
    if (input[field] !== undefined) body[upstream] = input[field];
  }
  const result = requiredResponseRecord(
    await requestJson(`${baseUrl}/process`, token, context.fetcher, body, secrets, 300000, context.signal),
    "iLovePDF process response",
  );
  if (validationOnly) {
    if (!Array.isArray(result.validations)) {
      throw providerResponseError("iLovePDF response is missing validations");
    }
    return { task, server, validations: result.validations, result };
  }
  const file = await runProviderRequest(
    { label: "iLovePDF download", timeoutMs: 300000, signal: context.signal },
    async (signal) => {
      const response = await context.fetcher(`${baseUrl}/download/${encodeURIComponent(task)}`, {
        headers: { authorization: `Bearer ${token}`, "user-agent": providerUserAgent },
        signal,
        redirect: "manual",
      });
      if (!response.ok) throw await responseError(response, secrets);
      if (!response.body) throw providerResponseError("iLovePDF returned no file");
      const name = optionalString(result.download_filename) || "ilovepdf-output";
      const mimetype = response.headers.get("content-type")?.split(";")[0] || "application/octet-stream";
      let sizeBytes = 0;
      const stream = response.body.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, controller) {
            sizeBytes += chunk.byteLength;
            controller.enqueue(chunk);
          },
          flush() {
            if (sizeBytes === 0) throw providerResponseError("iLovePDF returned an empty file");
          },
        }),
      );
      const upload = await transitFiles!.createFromStream!({ name, mimeType: mimetype, body: stream, signal });
      return {
        name,
        mimeType: mimetype,
        fileId: upload.fileId,
        downloadUrl: upload.downloadUrl,
        sizeBytes: upload.sizeBytes,
      };
    },
  );
  return { file, task, server, result };
}
function taskServerBaseUrl(server: string) {
  const suffix = ".ilovepdf.com";
  const label = server.endsWith(suffix) ? server.slice(0, -suffix.length) : "";
  const number = label.startsWith("api") ? label.slice(3) : "";
  if (!number || !Array.from(number).every((char) => char >= "0" && char <= "9")) {
    throw providerResponseError("iLovePDF returned an invalid task server");
  }
  return `https://${server}/v1`;
}
function requiredResponseString(value: unknown, field: string) {
  const text = optionalString(value);
  if (!text) throw providerResponseError(`iLovePDF response is missing ${field}`);
  return text;
}
async function requestJson(
  url: string,
  token: string,
  fetcher: typeof fetch,
  body: Record<string, unknown> | undefined,
  secrets: string[],
  timeoutMs?: number,
  parentSignal?: AbortSignal,
) {
  return runProviderRequest({ label: "iLovePDF", timeoutMs, signal: parentSignal }, async (signal) => {
    const response = await fetcher(url, {
      method: body ? "POST" : "GET",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal,
      redirect: "manual",
    });
    if (!response.ok) throw await responseError(response, secrets);
    return response.json();
  });
}
async function responseError(response: Response, secrets: string[]) {
  const payload = await response.json().catch(() => null);
  const record = optionalRecord(payload);
  const error = optionalRecord(record?.error) ?? record;
  const type = optionalString(error?.type);
  let message = optionalString(error?.message) ?? `iLovePDF request failed with HTTP ${response.status}`;
  if (type) message = `${type}: ${message}`;
  for (const secret of secrets) message = message.split(secret).join("[REDACTED]");
  return new ProviderRequestError(
    response.status,
    message,
    undefined,
    response.status === 429 ? "rate_limited" : "provider_error",
  );
}
