/** Release ordinary responses immediately and SSE responses when their body ends or is cancelled. */
export function releaseAfterResponse(response: Response, controller: AbortController, release: () => void): Response {
  // MCP can return an SSE response before its tool finishes. Preserve ordinary responses, including Content-Length.
  if (response.body === null || !/^text\/event-stream\b/i.test(response.headers.get("content-type") ?? "")) {
    release();
    return response;
  }

  const reader = response.body.getReader();
  const body = new ReadableStream<Uint8Array>({
    async pull(stream) {
      try {
        const chunk = await reader.read();
        if (chunk.done) {
          release();
          stream.close();
        } else stream.enqueue(chunk.value);
      } catch (error) {
        controller.abort(error);
        release();
        stream.error(error);
      }
    },
    cancel(reason) {
      controller.abort(reason);
      release();
      return reader.cancel(reason).catch(() => {});
    },
  });
  return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
}
