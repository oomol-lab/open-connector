import { adminHeaders, fetchJson, runtimeHeaders } from "./client.ts";

const baseUrl = "http://localhost:3000";
const host = process.env.SFTP_HOST;
const username = process.env.SFTP_USERNAME;
const password = process.env.SFTP_PASSWORD;
const privateKey = process.env.SFTP_PRIVATE_KEY;
if (!host || !username || (!password && !privateKey)) {
  console.log(
    "Skipping SFTP example: set SFTP_HOST, SFTP_USERNAME, and SFTP_PASSWORD or SFTP_PRIVATE_KEY. Optionally set SFTP_PORT, SFTP_PASSPHRASE, SFTP_HOST_KEY_FINGERPRINT, SFTP_PATH, and SFTP_WRITE_DIR.",
  );
  process.exit(0);
}

interface ActionEnvelope<T> {
  data: T;
}

async function runAction<T>(name: string, input: Record<string, unknown>): Promise<T> {
  const result = await fetchJson<ActionEnvelope<T>>(`${baseUrl}/v1/actions/sftp.${name}`, {
    method: "POST",
    headers: runtimeHeaders({ "content-type": "application/json" }),
    body: JSON.stringify({ input }),
  });
  console.log(name, JSON.stringify(result.data, null, 2));
  return result.data;
}

const hostKeyFingerprint = process.env.SFTP_HOST_KEY_FINGERPRINT;
if (!hostKeyFingerprint) {
  console.warn(
    "SFTP_HOST_KEY_FINGERPRINT is not set: saving the connection trusts the host key the server presents now and replaces any key pinned by an earlier run. Set it to keep the pin across runs.",
  );
}

await fetchJson(`${baseUrl}/api/connections/sftp`, {
  method: "PUT",
  headers: adminHeaders({ "content-type": "application/json" }),
  body: JSON.stringify({
    authType: "custom_credential",
    values: {
      host,
      port: process.env.SFTP_PORT,
      username,
      password,
      privateKey,
      passphrase: process.env.SFTP_PASSPHRASE,
      hostKeyFingerprint,
    },
  }),
});

const listPath = process.env.SFTP_PATH ?? ".";
await runAction("list_directory", { path: listPath, maxEntries: 20 });
await runAction("stat", { path: listPath });

// The write round trip only touches a fresh directory under SFTP_WRITE_DIR and removes it afterwards.
const writeDir = process.env.SFTP_WRITE_DIR;
if (writeDir) {
  const scratch = `${writeDir.replace(/\/+$/, "")}/open-connector-example-${Date.now()}`;
  await runAction("create_directory", { path: scratch, recursive: true });

  const form = new FormData();
  form.append("file", new File(["hello from OpenConnector\n"], "hello.txt", { type: "text/plain" }));
  const upload = await fetchJson<{ fileId: string }>(`${baseUrl}/api/files`, {
    method: "POST",
    headers: adminHeaders(),
    body: form,
  });

  await runAction("upload_file", { path: `${scratch}/hello.txt`, file: { fileId: upload.fileId } });
  await runAction("rename", { fromPath: `${scratch}/hello.txt`, toPath: `${scratch}/renamed.txt` });
  const download = await runAction<{ file: { downloadUrl: string } }>("download_file", {
    path: `${scratch}/renamed.txt`,
    mimeType: "text/plain",
  });
  console.log("downloaded content", JSON.stringify(await (await fetch(download.file.downloadUrl)).text()));
  await runAction("delete_file", { path: `${scratch}/renamed.txt` });
  await runAction("remove_directory", { path: scratch });
}
