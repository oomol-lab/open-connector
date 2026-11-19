import { SdkErrorCode, SdkHttpError } from "@modelcontextprotocol/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { withMcpClient } from "./mcp-client.ts";

const lifecycle = vi.hoisted(() => ({
  connect: vi.fn(),
  close: vi.fn(),
  terminateSession: vi.fn(),
}));

vi.mock("@modelcontextprotocol/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@modelcontextprotocol/client")>()),
  Client: class {
    connect = lifecycle.connect;
    close = lifecycle.close;
  },
  StreamableHTTPClientTransport: class {
    terminateSession = lifecycle.terminateSession;
  },
  SSEClientTransport: class {},
  SdkErrorCode: {
    ClientHttpFailedToOpenStream: "CLIENT_HTTP_FAILED_TO_OPEN_STREAM",
  },
  SdkHttpError: class extends Error {
    status: number;

    constructor(_code: string, message: string, data: { status: number }) {
      super(message);
      this.status = data.status;
    }
  },
}));

beforeEach(() => {
  lifecycle.connect.mockReset().mockResolvedValue(undefined);
  lifecycle.close.mockReset().mockResolvedValue(undefined);
  lifecycle.terminateSession.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

it.each([undefined, false])("preserves the server session when terminateSession is %s", async (terminateSession) => {
  const result = await withMcpClient(
    { endpoint: new URL("https://example.com/mcp"), transport: "streamable_http", terminateSession },
    async () => "query-handle",
  );
  expect(result).toBe("query-handle");
  expect(lifecycle.terminateSession).not.toHaveBeenCalled();
  expect(lifecycle.close).toHaveBeenCalledOnce();
});

it("does not terminate a running action after the cleanup timeout", async () => {
  vi.useFakeTimers();
  const run = vi.fn(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 5_000));
    return "finished";
  });
  const result = withMcpClient(
    { endpoint: new URL("https://example.com/mcp"), transport: "streamable_http", terminateSession: true },
    run,
  );
  await vi.advanceTimersByTimeAsync(2_000);
  expect(lifecycle.terminateSession).not.toHaveBeenCalled();
  expect(lifecycle.close).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(3_000);
  expect(await result).toBe("finished");
  expect(lifecycle.terminateSession).toHaveBeenCalledOnce();
  expect(lifecycle.close).toHaveBeenCalledOnce();
});

it("bounds session cleanup without discarding the completed action result", async () => {
  vi.useFakeTimers();
  lifecycle.terminateSession.mockImplementation(() => new Promise<void>(() => {}));
  const result = withMcpClient(
    { endpoint: new URL("https://example.com/mcp"), transport: "streamable_http", terminateSession: true },
    async () => "finished",
  );
  await vi.advanceTimersByTimeAsync(1_999);
  expect(lifecycle.close).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(await result).toBe("finished");
  expect(lifecycle.close).toHaveBeenCalledOnce();
});

it("preserves the action error when session cleanup fails", async () => {
  const failure = new Error("tool failed");
  lifecycle.terminateSession.mockRejectedValue(new Error("cleanup failed"));
  const result = withMcpClient(
    { endpoint: new URL("https://example.com/mcp"), transport: "streamable_http", terminateSession: true },
    async () => {
      throw failure;
    },
  );
  await expect(result).rejects.toBe(failure);
  expect(lifecycle.close).toHaveBeenCalledOnce();
});

it("rebuilds a connected Streamable HTTP session once after a 404 when explicitly enabled", async () => {
  const run = vi
    .fn()
    .mockRejectedValueOnce(
      new SdkHttpError(SdkErrorCode.ClientHttpFailedToOpenStream, "session missing", { status: 404 }),
    )
    .mockResolvedValueOnce("recovered");

  await expect(
    withMcpClient(
      {
        endpoint: new URL("https://example.com/mcp"),
        transport: "streamable_http",
        retryOnSessionNotFound: true,
      },
      run,
    ),
  ).resolves.toBe("recovered");
  expect(run).toHaveBeenCalledTimes(2);
  expect(lifecycle.connect).toHaveBeenCalledTimes(2);
  expect(lifecycle.close).toHaveBeenCalledTimes(2);
});

it("does not unwrap application objects that resemble SDK errors", async () => {
  const error = { data: { cause: new Error("application failure") } };
  lifecycle.connect.mockRejectedValue(error);
  await expect(
    withMcpClient(
      { endpoint: new URL("https://example.com/mcp"), transport: "streamable_http" },
      async () => undefined,
    ),
  ).rejects.toBe(error);
});
