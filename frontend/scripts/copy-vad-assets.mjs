// Copies the runtime assets that @ricky0123/vad-web fetches at runtime — its
// AudioWorklet, the Silero VAD ONNX model(s), and the onnxruntime-web WASM — into
// public/vad/ so Vite serves them at /vad/. voice.ts points the VAD at this dir via
// baseAssetPath / onnxWASMBasePath. Wired to `postinstall` so it survives clean installs.
import { mkdirSync, copyFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const dest = join(root, "public", "vad");
mkdirSync(dest, { recursive: true });

const vad = join(root, "node_modules", "@ricky0123", "vad-web", "dist");
const ort = join(root, "node_modules", "onnxruntime-web", "dist");

const files = [
  // VAD worklet + models (we use the v5 model; legacy kept as a fallback option)
  [vad, "vad.worklet.bundle.min.js"],
  [vad, "silero_vad_v5.onnx"],
  [vad, "silero_vad_legacy.onnx"],
  // onnxruntime-web wasm runtime (threaded build runs single-threaded without COOP/COEP)
  [ort, "ort-wasm-simd-threaded.wasm"],
  [ort, "ort-wasm-simd-threaded.mjs"],
  [ort, "ort-wasm-simd-threaded.jsep.wasm"],
  [ort, "ort-wasm-simd-threaded.jsep.mjs"],
];

let copied = 0;
for (const [dir, name] of files) {
  const src = join(dir, name);
  if (!existsSync(src)) {
    console.warn(`[copy-vad-assets] missing (skipped): ${src}`);
    continue;
  }
  copyFileSync(src, join(dest, name));
  copied++;
}
console.log(`[copy-vad-assets] copied ${copied} file(s) to public/vad/`);
