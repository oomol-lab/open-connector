import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { KlangioActionName } from "./actions.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import { assertPublicHttpUrl } from "../../core/request.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

type KlangioActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;
type KlangioJobOutput = "mxml" | "midi" | "pdf" | "gp5" | "json" | "midi_quant";
type KlangioStemType = "vocals" | "bass" | "drums" | "other" | "piano" | "guitar";
type KlangioJobPath =
  | "/transcription"
  | "/chord-recognition"
  | "/chord-recognition-extended"
  | "/beat-tracking"
  | "/strum-recognition"
  | "/source-separation";

interface KlangioUploadSource {
  bytes: Uint8Array;
  fileName: string;
  mimeType: string;
}

export const klangioApiBaseUrl = "https://api.klang.io";
const klangioValidationJobId = "00000000-0000-0000-0000-000000000000";
const maxKlangioUploadSourceBytes = 100 * 1024 * 1024;

export const klangioActionHandlers: Record<KlangioActionName, KlangioActionHandler> = {
  async create_transcription_job(input, context) {
    const formData = await createFileFormData(input.file, context);
    for (const output of readStringArray(input.outputs, "outputs")) {
      formData.append("outputs", output);
    }

    return createKlangioJob({
      path: "/transcription",
      formData,
      query: {
        model: readRequiredInputString(input.model, "model"),
        title: optionalString(input.title),
        composer: optionalString(input.composer),
        webhook_url: optionalString(input.webhookUrl),
      },
      context,
    });
  },
  async create_chord_recognition_job(input, context) {
    return createKlangioJob({
      path: "/chord-recognition",
      formData: await createFileFormData(input.file, context),
      query: {
        vocabulary: readRequiredInputString(input.vocabulary, "vocabulary"),
        webhook_url: optionalString(input.webhookUrl),
      },
      context,
    });
  },
  async create_chord_recognition_extended_job(input, context) {
    return createKlangioJob({
      path: "/chord-recognition-extended",
      formData: await createFileFormData(input.file, context),
      query: {
        vocabulary: readRequiredInputString(input.vocabulary, "vocabulary"),
        webhook_url: optionalString(input.webhookUrl),
      },
      context,
    });
  },
  async create_beat_tracking_job(input, context) {
    return createKlangioJob({
      path: "/beat-tracking",
      formData: await createFileFormData(input.file, context),
      query: {
        webhook_url: optionalString(input.webhookUrl),
      },
      context,
    });
  },
  async create_strum_recognition_job(input, context) {
    return createKlangioJob({
      path: "/strum-recognition",
      formData: await createFileFormData(input.file, context),
      query: {
        webhook_url: optionalString(input.webhookUrl),
      },
      context,
    });
  },
  async create_source_separation_job(input, context) {
    return createKlangioJob({
      path: "/source-separation",
      formData: await createFileFormData(input.file, context),
      query: {
        model: optionalString(input.model),
        output: optionalString(input.output),
        webhook_url: optionalString(input.webhookUrl),
      },
      context,
    });
  },
  get_job_status(input, context) {
    return getKlangioJobStatus(readRequiredInputString(input.jobId, "jobId"), context);
  },
  download_job_result(input, context) {
    const jobId = readRequiredInputString(input.jobId, "jobId");
    const resultType = readRequiredInputString(input.resultType, "resultType") as KlangioJobOutput;
    return downloadKlangioFile({
      path: `/job/${encodeURIComponent(jobId)}/${resultPathSegment(resultType)}`,
      fileName: buildJobResultFileName(jobId, resultType),
      fallbackMimeType: fallbackMimeTypeForJobResult(resultType),
      actionName: "download_job_result",
      context,
    });
  },
  download_source_separation_audio(input, context) {
    const jobId = readRequiredInputString(input.jobId, "jobId");
    const stemType = readRequiredInputString(input.stemType, "stemType") as KlangioStemType;
    return downloadKlangioFile({
      path: `/job/${encodeURIComponent(jobId)}/audio`,
      query: {
        stem_type: stemType,
      },
      fileName: `klangio-${jobId}-${stemType}`,
      fallbackMimeType: "application/octet-stream",
      actionName: "download_source_separation_audio",
      context,
    });
  },
};

export async function validateKlangioCredential(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
): Promise<CredentialValidationResult> {
  const validationEndpoint = `/job/${klangioValidationJobId}/status`;
  const response = await context.fetcher(buildKlangioUrl(validationEndpoint), {
    method: "GET",
    headers: buildKlangioHeaders(context.apiKey, { accept: "application/json" }),
    signal: context.signal,
  });
  const payload = await readKlangioPayload(response);

  if (!response.ok && response.status !== 404) {
    throw createKlangioError(response, payload);
  }

  return {
    profile: {
      accountId: "api_key",
      displayName: "Klangio API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: klangioApiBaseUrl,
      validationEndpoint,
    },
  };
}

async function createKlangioJob(input: {
  path: KlangioJobPath;
  formData: FormData;
  query?: Record<string, string | undefined>;
  context: ApiKeyProviderContext;
}): Promise<unknown> {
  const response = await input.context.fetcher(buildKlangioUrl(input.path, input.query), {
    method: "POST",
    headers: buildKlangioHeaders(input.context.apiKey, { accept: "application/json" }),
    body: input.formData,
    signal: input.context.signal,
  });

  const payload = await readKlangioPayload(response);
  if (!response.ok) {
    throw createKlangioError(response, payload);
  }

  return normalizeKlangioJobResponse(payload);
}

async function getKlangioJobStatus(jobId: string, context: ApiKeyProviderContext): Promise<unknown> {
  const response = await context.fetcher(buildKlangioUrl(`/job/${encodeURIComponent(jobId)}/status`), {
    method: "GET",
    headers: buildKlangioHeaders(context.apiKey, { accept: "application/json" }),
    signal: context.signal,
  });
  const payload = await readKlangioPayload(response);
  if (!response.ok) {
    throw createKlangioError(response, payload);
  }

  const record = requireResponseObject(payload, "Klangio status response");
  return {
    status: readRequiredResponseString(record.status, "status"),
    error: record.error === null ? null : optionalString(record.error),
  };
}

async function downloadKlangioFile(input: {
  path: string;
  query?: Record<string, string | undefined>;
  fileName: string;
  fallbackMimeType: string;
  actionName: KlangioActionName;
  context: ApiKeyProviderContext;
}): Promise<unknown> {
  if (!input.context.transitFiles) {
    throw new ProviderRequestError(400, "Transit file storage is not enabled.");
  }

  const response = await input.context.fetcher(buildKlangioUrl(input.path, input.query), {
    method: "GET",
    headers: buildKlangioHeaders(input.context.apiKey, { accept: "*/*" }),
    signal: input.context.signal,
  });

  if (!response.ok) {
    const payload = await readKlangioPayload(response);
    throw createKlangioError(response, payload);
  }

  const bytes = await response.arrayBuffer();
  if (bytes.byteLength === 0) {
    throw new ProviderRequestError(502, `Klangio ${input.actionName} response did not include file bytes`);
  }

  const contentType = normalizeMimeType(response.headers.get("content-type")) ?? input.fallbackMimeType;
  const name = appendExtensionIfMissing(input.fileName, extensionForMimeType(contentType));
  const upload = await input.context.transitFiles.create(new File([bytes], name, { type: contentType }));

  return {
    file: {
      name,
      mimetype: contentType,
      fileId: upload.fileId,
      downloadUrl: upload.downloadUrl,
      sizeBytes: upload.sizeBytes,
      mimeType: contentType,
    },
    contentType,
    contentLength: bytes.byteLength,
  };
}

async function createFileFormData(value: unknown, context: ApiKeyProviderContext): Promise<FormData> {
  const source = await resolveKlangioUploadSource(value, context);
  const formData = new FormData();
  formData.set("file", new File([Buffer.from(source.bytes)], source.fileName, { type: source.mimeType }));
  return formData;
}

async function resolveKlangioUploadSource(
  value: unknown,
  context: Pick<ApiKeyProviderContext, "fetcher" | "signal">,
): Promise<KlangioUploadSource> {
  const file = requireInputObject(value, "file");
  const fileUrl = optionalString(file.url);
  if (fileUrl) {
    const url = assertPublicHttpUrl(fileUrl, {
      fieldName: "file.url",
      createError: (message) => new ProviderRequestError(400, message),
    });
    const response = await context.fetcher(url, {
      method: "GET",
      // Workers has no "error" redirect mode; "manual" never follows either, and
      // the !response.ok check below rejects any 3xx.
      redirect: "manual",
      signal: context.signal,
    });

    if (!response.ok) {
      throw new ProviderRequestError(
        response.status >= 500 ? 502 : 400,
        `failed to fetch klangio upload source: ${response.status}`,
      );
    }

    const bytes = await readKlangioUploadSourceBytes(response);
    if (bytes.byteLength === 0) {
      throw new ProviderRequestError(400, "file.url did not return file bytes");
    }

    return {
      bytes,
      fileName: optionalString(file.fileName) ?? inferFileNameFromUrl(url) ?? "audio.bin",
      mimeType:
        optionalString(file.mimeType) ??
        normalizeMimeType(response.headers.get("content-type")) ??
        "application/octet-stream",
    };
  }

  const contentBase64 = optionalString(file.contentBase64);
  if (!contentBase64) {
    throw new ProviderRequestError(400, "url or contentBase64 is required");
  }

  const bytes = decodeKlangioBase64Content(contentBase64);
  if (!bytes) {
    throw new ProviderRequestError(400, "file.contentBase64 must be valid base64");
  }
  assertUploadSourceSize(bytes.byteLength);

  const fileName = optionalString(file.fileName);
  if (!fileName) {
    throw new ProviderRequestError(400, "file.fileName is required when using contentBase64");
  }

  return {
    bytes,
    fileName,
    mimeType: optionalString(file.mimeType) ?? "application/octet-stream",
  };
}

async function readKlangioUploadSourceBytes(response: Response): Promise<Uint8Array> {
  const contentLength = response.headers.get("content-length");
  if (contentLength) {
    const parsedLength = Number.parseInt(contentLength, 10);
    if (Number.isInteger(parsedLength)) {
      assertUploadSourceSize(parsedLength);
    }
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  assertUploadSourceSize(bytes.byteLength);
  return bytes;
}

function assertUploadSourceSize(byteLength: number): void {
  if (byteLength > maxKlangioUploadSourceBytes) {
    throw new ProviderRequestError(400, `klangio upload source exceeds ${maxKlangioUploadSourceBytes} bytes`);
  }
}

function inferFileNameFromUrl(url: URL): string | undefined {
  const segments = url.pathname.split("/").filter(Boolean);
  const fileName = segments.at(-1);
  if (!fileName) {
    return undefined;
  }
  try {
    return decodeURIComponent(fileName);
  } catch {
    return fileName;
  }
}

function normalizeKlangioJobResponse(payload: unknown): Record<string, unknown> {
  const record = requireResponseObject(payload, "Klangio job response");
  const generatedOutputs = readGeneratedOutputs(record);
  return {
    jobId: readRequiredResponseString(record.job_id, "job_id"),
    creationDate: readRequiredResponseString(record.creation_date, "creation_date"),
    deletionDate: readRequiredResponseString(record.deletion_date, "deletion_date"),
    statusEndpointUrl: readRequiredResponseString(record.status_endpoint_url, "status_endpoint_url"),
    ...(generatedOutputs ? { generatedOutputs } : {}),
  };
}

function readGeneratedOutputs(record: Record<string, unknown>): Record<string, boolean> | undefined {
  const keys = ["gen_xml", "gen_midi", "gen_midi_quant", "gen_gp5", "gen_pdf"];
  if (!keys.some((key) => typeof record[key] === "boolean")) {
    return undefined;
  }

  return {
    mxml: record.gen_xml === true,
    midi: record.gen_midi === true,
    midiQuant: record.gen_midi_quant === true,
    gp5: record.gen_gp5 === true,
    pdf: record.gen_pdf === true,
  };
}

async function readKlangioPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createKlangioError(response: Response, payload: unknown): ProviderRequestError {
  const message = extractKlangioErrorMessage(payload) ?? `Klangio request failed with status ${response.status}`;

  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(401, message);
  }

  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }

  if (response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(400, message);
  }

  return new ProviderRequestError(response.status || 500, message);
}

function extractKlangioErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return payload.trim() || undefined;
  }

  const record = optionalRecord(payload);
  const description = optionalString(record?.description);
  if (description) {
    return description;
  }

  const detail = record?.detail;
  if (typeof detail === "string") {
    return detail;
  }
  if (Array.isArray(detail) && detail.length > 0) {
    const firstIssue = optionalRecord(detail[0]);
    return optionalString(firstIssue?.msg) ?? optionalString(firstIssue?.type);
  }

  return optionalString(record?.message) ?? optionalString(record?.error);
}

function buildKlangioHeaders(apiKey: string, input: { accept: string }): Headers {
  return new Headers({
    accept: input.accept,
    "kl-api-key": apiKey,
    "user-agent": providerUserAgent,
  });
}

function buildKlangioUrl(path: string, query: Record<string, string | undefined> = {}): URL {
  const url = new URL(path, klangioApiBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

function resultPathSegment(value: KlangioJobOutput): string {
  if (value === "mxml") {
    return "xml";
  }
  return value;
}

function buildJobResultFileName(jobId: string, resultType: KlangioJobOutput): string {
  switch (resultType) {
    case "mxml":
      return `klangio-${jobId}-musicxml.musicxml`;
    case "midi":
      return `klangio-${jobId}-midi.mid`;
    case "midi_quant":
      return `klangio-${jobId}-midi-quantized.mid`;
    case "pdf":
      return `klangio-${jobId}.pdf`;
    case "gp5":
      return `klangio-${jobId}.gp5`;
    case "json":
      return `klangio-${jobId}.json`;
  }
}

function fallbackMimeTypeForJobResult(resultType: KlangioJobOutput): string {
  switch (resultType) {
    case "mxml":
      return "application/vnd.recordare.musicxml+xml";
    case "midi":
    case "midi_quant":
      return "audio/midi";
    case "pdf":
      return "application/pdf";
    case "gp5":
      return "application/octet-stream";
    case "json":
      return "application/json";
  }
}

function extensionForMimeType(mimeType: string): string | undefined {
  switch (mimeType) {
    case "audio/mpeg":
      return "mp3";
    case "audio/wav":
    case "audio/wave":
    case "audio/x-wav":
      return "wav";
    case "application/json":
      return "json";
    case "application/pdf":
      return "pdf";
    case "audio/midi":
    case "audio/x-midi":
      return "mid";
    case "application/xml":
    case "text/xml":
    case "application/vnd.recordare.musicxml+xml":
      return "musicxml";
    default:
      return undefined;
  }
}

function appendExtensionIfMissing(fileName: string, extension: string | undefined): string {
  if (!extension) {
    return fileName;
  }
  const expectedSuffix = `.${extension}`;
  return fileName.toLowerCase().endsWith(expectedSuffix) ? fileName : `${fileName}${expectedSuffix}`;
}

function normalizeMimeType(value: string | null): string | undefined {
  if (!value) {
    return undefined;
  }
  return value.split(";")[0]?.trim().toLowerCase() || undefined;
}

function readRequiredInputString(value: unknown, fieldName: string): string {
  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return text;
}

function readStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, `${fieldName} must be an array`);
  }
  return value.map((item) => readRequiredInputString(item, fieldName));
}

function requireInputObject(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(400, `${label} must be an object`);
  }
  return record;
}

function requireResponseObject(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${label} was not an object`);
  }
  return record;
}

function readRequiredResponseString(value: unknown, fieldName: string): string {
  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(502, `Klangio response missing string field: ${fieldName}`);
  }
  return text;
}

function decodeKlangioBase64Content(contentBase64: string): Uint8Array | null {
  const normalized = contentBase64.trim();
  if (normalized.length === 0 || normalized.length % 4 !== 0) {
    return null;
  }

  const decoded = Buffer.from(normalized, "base64");
  if (decoded.length === 0 || decoded.toString("base64") !== normalized) {
    return null;
  }

  return new Uint8Array(decoded);
}
