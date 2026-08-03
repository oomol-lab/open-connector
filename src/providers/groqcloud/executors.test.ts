import { describe, expect, it, vi } from "vitest";
import { validateActionInput } from "../../core/validation.ts";
import { groqcloudActions } from "./actions.ts";
import { groqcloudActionHandlers } from "./executors.ts";

const apiBaseUrl = "https://api.groq.com/openai/v1";
const audioBase64 = Buffer.from("fake-audio-bytes").toString("base64");

function createContext(fetcher: typeof fetch) {
  return {
    apiKey: "test-key",
    fetcher,
  };
}

function jsonFetcher(payload: Record<string, unknown> = {}): typeof fetch {
  return vi.fn(async () => Response.json(payload)) as typeof fetch;
}

function requestInit(fetcher: typeof fetch): RequestInit {
  return vi.mocked(fetcher).mock.calls[0]![1] as RequestInit;
}

function requestForm(fetcher: typeof fetch): FormData {
  return requestInit(fetcher).body as FormData;
}

describe("GroqCloud audio transcription", () => {
  it("uploads inline base64 audio as multipart form data", async () => {
    const fetcher = jsonFetcher({ text: "hello" });

    await groqcloudActionHandlers.create_audio_transcription(
      {
        model: "whisper-large-v3-turbo",
        file: { name: "meeting.mp3", mimetype: "audio/mpeg", content_base64: audioBase64 },
        language: "en",
        temperature: 0,
      },
      createContext(fetcher),
    );

    expect(fetcher).toHaveBeenCalledWith(
      `${apiBaseUrl}/audio/transcriptions`,
      expect.objectContaining({ method: "POST" }),
    );

    const form = requestForm(fetcher);
    const uploaded = form.get("file") as File;
    expect(uploaded.name).toBe("meeting.mp3");
    expect(uploaded.type).toBe("audio/mpeg");
    expect(await uploaded.text()).toBe("fake-audio-bytes");
    expect(form.get("model")).toBe("whisper-large-v3-turbo");
    expect(form.get("language")).toBe("en");
    expect(form.get("temperature")).toBe("0");
  });

  it("omits the JSON content type so the multipart boundary is preserved", async () => {
    const fetcher = jsonFetcher({ text: "hello" });

    await groqcloudActionHandlers.create_audio_transcription(
      { model: "whisper-large-v3", file: { name: "a.mp3", content_base64: audioBase64 } },
      createContext(fetcher),
    );

    const headers = requestInit(fetcher).headers as Record<string, string>;
    expect(headers["content-type"]).toBeUndefined();
    expect(headers.authorization).toBe("Bearer test-key");
  });

  it("forwards a public url instead of downloading the audio", async () => {
    const fetcher = jsonFetcher({ text: "hello" });

    await groqcloudActionHandlers.create_audio_translation(
      { model: "whisper-large-v3", file: { url: "https://example.com/clip.mp3" } },
      createContext(fetcher),
    );

    expect(vi.mocked(fetcher).mock.calls).toHaveLength(1);
    expect(String(vi.mocked(fetcher).mock.calls[0]![0])).toBe(`${apiBaseUrl}/audio/translations`);
    const form = requestForm(fetcher);
    expect(form.get("url")).toBe("https://example.com/clip.mp3");
    expect(form.get("file")).toBeNull();
  });

  it("rejects private and loopback audio urls before forwarding them", () => {
    const fetcher = jsonFetcher();

    expect(() =>
      groqcloudActionHandlers.create_audio_transcription(
        { model: "whisper-large-v3", file: { url: "http://127.0.0.1/internal.mp3" } },
        createContext(fetcher),
      ),
    ).toThrow();

    expect(fetcher).not.toHaveBeenCalled();
  });

  it("requires exactly one audio source", () => {
    const fetcher = jsonFetcher();

    expect(() =>
      groqcloudActionHandlers.create_audio_transcription({ model: "whisper-large-v3" }, createContext(fetcher)),
    ).toThrow("file is required");

    expect(() =>
      groqcloudActionHandlers.create_audio_transcription(
        { model: "whisper-large-v3", file: { name: "a.mp3" } },
        createContext(fetcher),
      ),
    ).toThrow("file must include url or content_base64");

    expect(() =>
      groqcloudActionHandlers.create_audio_transcription(
        {
          model: "whisper-large-v3",
          file: { name: "a.mp3", content_base64: audioBase64, url: "https://example.com/clip.mp3" },
        },
        createContext(fetcher),
      ),
    ).toThrow("provide only one of file.url or file.content_base64");

    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects malformed base64 audio content", () => {
    const fetcher = jsonFetcher();

    expect(() =>
      groqcloudActionHandlers.create_audio_transcription(
        { model: "whisper-large-v3", file: { name: "a.mp3", content_base64: "not*base64" } },
        createContext(fetcher),
      ),
    ).toThrow("file.content_base64 must be valid base64");
  });

  it("rejects inline audio above GroqCloud's attachment limit", () => {
    const fetcher = jsonFetcher();
    const attachmentMaxBytes = 25 * 1024 * 1024;
    const oversizedAudioBase64 = Buffer.alloc(attachmentMaxBytes + 1).toString("base64");

    expect(() =>
      groqcloudActionHandlers.create_audio_transcription(
        { model: "whisper-large-v3", file: { name: "a.mp3", content_base64: oversizedAudioBase64 } },
        createContext(fetcher),
      ),
    ).toThrow(`file.content_base64 exceeds ${attachmentMaxBytes} bytes`);

    expect(fetcher).not.toHaveBeenCalled();
  });

  it("repeats timestamp granularities as an array field and requires verbose_json", async () => {
    const fetcher = jsonFetcher({ text: "hello" });

    await groqcloudActionHandlers.create_audio_transcription(
      {
        model: "whisper-large-v3",
        file: { name: "a.mp3", content_base64: audioBase64 },
        response_format: "verbose_json",
        timestamp_granularities: ["segment", "word"],
      },
      createContext(fetcher),
    );

    expect(requestForm(fetcher).getAll("timestamp_granularities[]")).toEqual(["segment", "word"]);
    expect(requestForm(fetcher).get("timestamp_granularities")).toBeNull();

    expect(() =>
      groqcloudActionHandlers.create_audio_transcription(
        {
          model: "whisper-large-v3",
          file: { name: "a.mp3", content_base64: audioBase64 },
          timestamp_granularities: ["word"],
        },
        createContext(jsonFetcher()),
      ),
    ).toThrow("timestamp_granularities requires response_format=verbose_json");
  });

  it("offers turbo for transcription but not for translation", () => {
    const transcription = groqcloudActions.find((action) => action.id === "groqcloud.create_audio_transcription")!;
    const translation = groqcloudActions.find((action) => action.id === "groqcloud.create_audio_translation")!;
    const file = { url: "https://example.com/a.mp3" };

    expect(validateActionInput(transcription, { model: "whisper-large-v3-turbo", file }).valid).toBe(true);
    expect(validateActionInput(translation, { model: "whisper-large-v3", file }).valid).toBe(true);
    expect(validateActionInput(translation, { model: "whisper-large-v3-turbo", file }).valid).toBe(false);
  });

  it("requires a name alongside inline audio content", () => {
    const action = groqcloudActions.find((action) => action.id === "groqcloud.create_audio_transcription")!;

    expect(
      validateActionInput(action, { model: "whisper-large-v3", file: { name: "a.mp3", content_base64: audioBase64 } })
        .valid,
    ).toBe(true);
    expect(
      validateActionInput(action, { model: "whisper-large-v3", file: { content_base64: audioBase64 } }).valid,
    ).toBe(false);
    expect(
      validateActionInput(action, {
        model: "whisper-large-v3",
        file: { name: "a.mp3", content_base64: audioBase64, url: "https://example.com/a.mp3" },
      }).valid,
    ).toBe(false);
  });

  it("rejects empty audio urls in the action schema", () => {
    const action = groqcloudActions.find((action) => action.id === "groqcloud.create_audio_transcription")!;

    expect(validateActionInput(action, { model: "whisper-large-v3", file: { url: "" } }).valid).toBe(false);
  });
});
