import {
  pipeline,
  TextStreamer,
  env,
} from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js";
env.allowLocalModels = false;
env.backends.onnx.wasm.numThreads = 1;
let generator = null,
  busy = false;
self.onmessage = async (event) => {
  const { action, id, messages } = event.data;
  if (busy) {
    self.postMessage({ kind: "error", id, text: "Wait for the current answer or press Stop." });
    return;
  }
  busy = true;
  try {
    if (!generator) {
      self.postMessage({ kind: "loading", id, text: "Downloading the on-device model…" });
      generator = await pipeline("text-generation", "onnx-community/Qwen2.5-Coder-0.5B-Instruct", {
        dtype: "q8",
        device: "wasm",
        progress_callback: (p) => {
          if (p.status === "progress")
            self.postMessage({ kind: "progress", id, file: p.file, progress: p.progress });
        },
      });
      self.postMessage({ kind: "ready", id });
    }
    if (action === "load") {
      busy = false;
      return;
    }
    let text = "";
    const streamer = new TextStreamer(generator.tokenizer, {
      skip_prompt: true,
      skip_special_tokens: true,
      callback_function: (token) => {
        text += token;
        self.postMessage({ kind: "token", id, text });
      },
    });
    await generator(messages, {
      max_new_tokens: 128,
      do_sample: false,
      repetition_penalty: 1.1,
      streamer,
    });
    self.postMessage({ kind: "done", id, text: text.trim() });
  } catch (error) {
    self.postMessage({
      kind: "error",
      id,
      text:
        error?.message ||
        (typeof error === "number"
          ? "This browser could not initialise the AI runtime. Syllabus search remains available."
          : String(error)),
    });
  } finally {
    busy = false;
  }
};
