import type { TransitFileWriter } from "../../core/types.ts";

import { createHash } from "node:crypto";
import { optionalRecord, optionalString } from "../../core/cast.ts";
import { assertPublicHttpUrl, readBoundedResponseBytes } from "../../core/request.ts";
import {
  providerInputError,
  ProviderRequestError,
  readTransitFileInput,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";

interface Credentials {
  baseUrl: string;
  appName: string;
  appKey: string;
  account: string;
  password?: string;
}

function readIyunbiaoCredentials(values: Record<string, string>): Credentials {
  const url = assertPublicHttpUrl(requiredInputString(values.instanceUrl, "instanceUrl"), {
    fieldName: "instanceUrl",
    createError: providerInputError,
  });
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new ProviderRequestError(
      400,
      "instanceUrl must be the HTTP or HTTPS server origin; supply the application space ID separately",
      undefined,
      "invalid_input",
    );
  }
  const spaceId = requiredInputString(values.spaceId, "spaceId");
  if (![...spaceId].every((character) => character >= "0" && character <= "9")) {
    throw new ProviderRequestError(400, "spaceId must contain only digits", undefined, "invalid_input");
  }
  return {
    baseUrl: `${url.origin}/${spaceId}/openapi/1.0`,
    appName: requiredInputString(values.appName, "appName"),
    appKey: requiredInputString(values.appKey, "appKey"),
    account: requiredInputString(values.account, "account"),
    password: values.password,
  };
}
interface Session {
  credentials: Credentials;
  token: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

function buildIyunbiaoHeaders(credentials: Credentials, token?: string, now: number = Date.now()): Headers {
  const digest = createHash("md5").update(`${now}${credentials.appKey}`).digest("hex").toUpperCase();
  const headers = new Headers({
    "x-eversheet-application-name": credentials.appName,
    "x-eversheet-request-sign": `${digest},${now}`,
  });
  if (token) headers.set("x-eversheet-session-token", token);
  return headers;
}

async function readJson(response: Response) {
  const text = await response.text();
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new ProviderRequestError(
      response.ok ? 502 : response.status,
      `Yunbiao returned invalid JSON (HTTP ${response.status})`,
      undefined,
      "provider_error",
    );
  }
  const exception = optionalRecord(optionalRecord(payload)?.Exception);
  if (!response.ok || exception) {
    const code = exception?.code;
    throw new ProviderRequestError(
      response.ok ? 502 : response.status,
      `Yunbiao request failed (HTTP ${response.status}${typeof code === "number" ? `, code ${code}` : ""})`,
      undefined,
      "provider_error",
    );
  }
  return payload;
}

async function jsonRequest(
  credentials: Credentials,
  fetcher: typeof fetch,
  path: string,
  body?: URLSearchParams | FormData,
  token?: string,
  parentSignal?: AbortSignal,
) {
  return runProviderRequest({ label: "Yunbiao", signal: parentSignal }, async (signal) => {
    const response = await fetcher(`${credentials.baseUrl}${path}`, {
      method: body ? "POST" : "GET",
      headers: buildIyunbiaoHeaders(credentials, token),
      body,
      signal,
      redirect: "manual",
    });
    return readJson(response);
  });
}

export interface IyunbiaoLoginResult {
  session: Session;
  profile: Record<string, unknown>;
}

export async function loginIyunbiao(
  values: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<IyunbiaoLoginResult> {
  const credentials = readIyunbiaoCredentials(values);
  const password =
    credentials.password === undefined || credentials.password === ""
      ? undefined
      : createHash("md5").update(credentials.password).digest("hex").toUpperCase();
  const payload = requiredResponseRecord(
    await jsonRequest(
      credentials,
      fetcher,
      "/login",
      new URLSearchParams({
        loginJson: JSON.stringify({ account: credentials.account, password }),
      }),
      undefined,
      signal,
    ),
    "Yunbiao login response",
  );
  const token = optionalString(payload.token);
  if (!token)
    throw new ProviderRequestError(502, "Yunbiao login response is missing token", undefined, "provider_error");
  return { session: { credentials, token, fetcher, signal }, profile: payload };
}

function segment(value: unknown, name: string) {
  const text = requiredInputString(value, name);
  if (text === "." || text === ".." || [...text].some((c) => "/\\%?#\0".includes(c))) {
    throw new ProviderRequestError(400, `${name} must be a single path segment`, undefined, "invalid_input");
  }
  return encodeURIComponent(text);
}

export async function executeIyunbiaoAction(
  name: string,
  input: Record<string, unknown>,
  values: Record<string, string>,
  options: { fetcher: typeof fetch; transitFiles?: TransitFileWriter; signal?: AbortSignal },
): Promise<unknown> {
  const template = input.templateName === undefined ? undefined : segment(input.templateName, "templateName");
  const interfaceName = input.interfaceName === undefined ? undefined : segment(input.interfaceName, "interfaceName");
  const detailTable =
    input.detailTableName === undefined ? undefined : segment(input.detailTableName, "detailTableName");
  if ((name === "download_attachment" || name === "download_cloud_file") && !options.transitFiles) {
    throw new ProviderRequestError(500, "Yunbiao attachment download requires file transit and execution context");
  }
  const cloudId = name === "download_cloud_file" ? segment(String(input.fileId), "fileId") : undefined;
  if (name === "save_user") {
    const user = optionalRecord(input.user);
    if (user?.objectId !== undefined && user.formId !== undefined && user.objectId !== user.formId) {
      throw new ProviderRequestError(
        400,
        "user.objectId and user.formId must identify the same user",
        undefined,
        "invalid_input",
      );
    }
    const password = user?.password;
    if (
      password !== undefined &&
      (typeof password !== "string" ||
        password.length !== 32 ||
        ![...password.toLowerCase()].every((c) => "0123456789abcdef".includes(c)))
    ) {
      throw new ProviderRequestError(
        400,
        "user.password must be an MD5 hexadecimal digest",
        undefined,
        "invalid_input",
      );
    }
  }
  const { session } = await loginIyunbiao(values, options.fetcher, options.signal);
  const request = (path: string, body?: URLSearchParams | FormData) =>
    jsonRequest(session.credentials, session.fetcher, path, body, session.token, session.signal);
  const formBody = (key: string, value: unknown) => new URLSearchParams({ [key]: JSON.stringify(value) });
  switch (name) {
    case "list_users":
      return request("/users", input.query === undefined ? undefined : formBody("formJson", input.query));
    case "list_roles":
      return request("/roles", input.query === undefined ? undefined : formBody("formJson", input.query));
    case "get_user":
      return { user: await request(`/users/${input.objectId}`) };
    case "get_role":
      return { role: await request(`/roles/${input.objectId}`) };
    case "save_user": {
      const user = requiredResponseRecord(input.user, "Yunbiao user input");
      return {
        user: await request(`/users/${user.objectId ?? user.formId ?? 0}`, formBody("formJson", user)),
      };
    }
    case "save_role": {
      const role = requiredResponseRecord(input.role, "Yunbiao role input");
      return { role: await request(`/roles/${role.objectId ?? 0}`, formBody("formJson", role)) };
    }
    case "list_templates":
      return request("/templateNameList");
    case "get_template_structure":
      return request(`/${template}/structure`);
    case "get_form":
      return { form: await request(`/${template}/${input.objectId}`) };
    case "query_forms":
      return request(`/${template}`, formBody("formJson", input.query ?? {}));
    case "save_form":
      return { form: await request(`/${template}/new`, formBody("formJson", input.form)) };
    case "batch_save_forms":
      return request(`/${template}/batchForm`, formBody("formJson", input.forms));
    case "query_detail_rows":
      return request(`/${template}/${detailTable}/queryDetail`, formBody("queryParams", input.query ?? {}));
    case "query_template_interface":
      return {
        result: await request(`/${template}/${interfaceName}/query`, formBody("queryParams", input.query ?? {})),
      };
    case "query_global_interface":
      return {
        result: await request(`/global/${interfaceName}/query`, formBody("queryParams", input.query ?? {})),
      };
    case "upload_cloud_file":
    case "upload_attachment": {
      const fileName = requiredInputString(input.fileName, "fileName");
      const fileType = requiredInputString(input.fileType, "fileType");
      const upload = await readTransitFileInput(input.file, { transitFiles: options.transitFiles });
      if (upload.sizeBytes > 64 * 1024 * 1024)
        throw providerInputError("Attachment source exceeds the 64 MiB connector upload limit");
      const body = new FormData();
      body.set("file", upload.file, fileName);
      body.set("fileType", fileType);
      const cloudFile = name === "upload_cloud_file";
      if (cloudFile && input.fileFolderPath !== undefined) body.set("fileFolderPath", String(input.fileFolderPath));
      const result = requiredResponseRecord(
        await request(`/${template}/${cloudFile ? "fileBox" : "file"}`, body),
        "Yunbiao attachment response",
      );
      if (cloudFile) {
        const id = result.fileId ?? result.objectId;
        if ((typeof id !== "string" && typeof id !== "number") || String(id).trim() === "") {
          throw new ProviderRequestError(
            502,
            "Yunbiao cloud file response is missing fileId or objectId",
            undefined,
            "provider_error",
          );
        }
        return { fileId: String(id), file: { ...result } };
      }
      if (typeof result.objectId !== "number")
        throw new ProviderRequestError(
          502,
          "Yunbiao attachment response is missing objectId",
          undefined,
          "provider_error",
        );
      return {
        fileId: result.objectId,
        attachment: {
          文件ID: String(result.objectId),
          文件名: fileName,
          上传人: session.credentials.account,
          类型: fileType,
          大小: upload.sizeBytes,
        },
      };
    }
    case "download_cloud_file":
    case "download_attachment":
      return runProviderRequest({ label: "Yunbiao attachment download", timeoutMs: 300_000 }, async (signal) => {
        const response = await session.fetcher(
          `${session.credentials.baseUrl}/${template}/${name === "download_cloud_file" ? `fileBox/${cloudId}` : `file/${input.fileId}`}`,
          {
            headers: buildIyunbiaoHeaders(session.credentials, session.token),
            signal,
            redirect: "manual",
          },
        );
        if (!response.ok) await readJson(response);
        const fileName = requiredInputString(input.fileName, "fileName");
        const mimeType = response.headers.get("content-type") || "application/octet-stream";
        if (!options.transitFiles) throw providerInputError("Transit file storage is not enabled");
        const bytes = await readBoundedResponseBytes(response, {
          maxBytes: options.transitFiles.maxBytes,
          fieldName: "Yunbiao attachment download",
          createError: (message) => new ProviderRequestError(413, message),
        });
        const file = await options.transitFiles.create(
          new File([Uint8Array.from(bytes)], fileName, { type: mimeType }),
        );
        return { file, fileName, mimeType };
      });
  }
}
