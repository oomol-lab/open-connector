import { Buffer } from "node:buffer";
import { createInterface } from "node:readline/promises";

interface QrCodeResponse {
  qrcode: string;
  qrcode_img_content: string;
}

interface QrStatusResponse {
  status: string;
  bot_token?: string;
  ilink_bot_id?: string;
  baseurl?: string;
  ilink_user_id?: string;
  redirect_host?: string;
}

const apiBaseUrl = "https://ilinkai.weixin.qq.com";
const appClientVersion = "65536";
const input = createInterface({ input: process.stdin, output: process.stdout });

try {
  process.stdout.write(
    "This script starts Tencent's official Weixin iLink QR pairing flow. Review the terms shown in Weixin before confirming.\n\n",
  );

  let qr = await getQrCode();
  let pollingBaseUrl = apiBaseUrl;
  let verifyCode: string | undefined;
  showQrCode(qr.qrcode_img_content);

  while (true) {
    const result = await getQrStatus(pollingBaseUrl, qr.qrcode, verifyCode);
    switch (result.status) {
      case "wait":
        process.stdout.write(".");
        break;
      case "scaned":
        verifyCode = undefined;
        process.stdout.write("\nQR code scanned. Confirm the connection in Weixin.\n");
        break;
      case "need_verifycode":
        verifyCode = (await input.question("Enter the verification code shown in Weixin: ")).trim();
        continue;
      case "scaned_but_redirect":
        pollingBaseUrl = readRedirectBaseUrl(result.redirect_host);
        break;
      case "expired":
        process.stdout.write("\nThe QR code expired. Requesting a new one.\n");
        qr = await getQrCode();
        pollingBaseUrl = apiBaseUrl;
        verifyCode = undefined;
        showQrCode(qr.qrcode_img_content);
        break;
      case "verify_code_blocked":
        throw new Error("Verification was blocked after too many failed attempts. Run the script again later.");
      case "binded_redirect":
        throw new Error("This bot is already paired with an existing client instance.");
      case "confirmed": {
        if (!result.bot_token || !result.ilink_bot_id) {
          throw new Error("Weixin confirmed the login without returning a bot token and account ID.");
        }
        process.stdout.write("\n\nPairing succeeded. Store botToken as a secret custom credential.\n");
        process.stdout.write(
          `${JSON.stringify({ botToken: result.bot_token, accountId: result.ilink_bot_id }, null, 2)}\n`,
        );
        process.stdout.write(
          "The token may expire or be revoked; rerun this script when the provider asks you to reconnect.\n",
        );
        process.exitCode = 0;
        break;
      }
      default:
        throw new Error(`Unknown Weixin QR status: ${result.status}`);
    }

    if (result.status === "confirmed") break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
} finally {
  input.close();
}

async function getQrCode(): Promise<QrCodeResponse> {
  const url = new URL("/ilink/bot/get_bot_qrcode", apiBaseUrl);
  url.searchParams.set("bot_type", "3");
  const response = await fetch(url, {
    method: "POST",
    headers: qrPostHeaders(),
    body: JSON.stringify({ local_token_list: [] }),
    signal: AbortSignal.timeout(35_000),
  });
  return readJsonResponse<QrCodeResponse>(response, "get bot QR code");
}

async function getQrStatus(baseUrl: string, qrcode: string, verifyCode?: string): Promise<QrStatusResponse> {
  const url = new URL("/ilink/bot/get_qrcode_status", baseUrl);
  url.searchParams.set("qrcode", qrcode);
  if (verifyCode) url.searchParams.set("verify_code", verifyCode);
  try {
    const response = await fetch(url, { headers: appHeaders(), signal: AbortSignal.timeout(35_000) });
    return readJsonResponse<QrStatusResponse>(response, "poll QR code status");
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") return { status: "wait" };
    throw error;
  }
}

function showQrCode(qrcodeUrl: string): void {
  process.stdout.write("Open this URL and scan the displayed QR code with Weixin:\n");
  process.stdout.write(`${qrcodeUrl}\n\n`);
}

function appHeaders(): Headers {
  return new Headers({
    "iLink-App-Id": "bot",
    "iLink-App-ClientVersion": appClientVersion,
  });
}

function qrPostHeaders(): Headers {
  const headers = appHeaders();
  headers.set("content-type", "application/json");
  headers.set("AuthorizationType", "ilink_bot_token");
  const randomValue = crypto.getRandomValues(new Uint32Array(1))[0]!;
  headers.set("X-WECHAT-UIN", Buffer.from(String(randomValue), "utf8").toString("base64"));
  return headers;
}

function readRedirectBaseUrl(host: string | undefined): string {
  if (!host) throw new Error("Weixin requested a polling redirect without a host.");
  const url = new URL(`https://${host}`);
  if (url.hostname !== "weixin.qq.com" && !url.hostname.endsWith(".weixin.qq.com")) {
    throw new Error(`Refusing an unexpected Weixin redirect host: ${url.hostname}`);
  }
  return url.origin;
}

async function readJsonResponse<T>(response: Response, operation: string): Promise<T> {
  const text = await response.text();
  if (!response.ok) throw new Error(`Failed to ${operation}: HTTP ${response.status} ${text}`);
  return JSON.parse(text) as T;
}
