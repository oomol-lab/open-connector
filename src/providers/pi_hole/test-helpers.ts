import type { PiHoleActionContext } from "./runtime.ts";

export interface CapturedRequest {
  url: URL;
  method: string;
  headers: Headers;
  body: unknown;
}

export function createTestContext(respond: (request: CapturedRequest) => Response | Promise<Response> | undefined): {
  context: PiHoleActionContext;
  requests: CapturedRequest[];
} {
  const requests: CapturedRequest[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const headers = new Headers(init?.headers);
    const request: CapturedRequest = {
      url,
      method: init?.method ?? "GET",
      headers,
      body:
        init?.body instanceof FormData
          ? init?.body
          : init?.body !== undefined
            ? JSON.parse(String(init?.body))
            : undefined,
    };
    requests.push(request);

    return (await respond(request)) ?? new Response(null, { status: 404 });
  };

  return {
    context: { appPassword: "app-password", baseUrl: "http://pi.hole", apiPath: "api", fetcher },
    requests,
  };
}

export function sessionResponse(sid: string): Response {
  return Response.json({
    session: { valid: true, sid, validity: 600, csrf: "csrf", totp: false, message: "correct password" },
    took: 0.1,
  });
}
