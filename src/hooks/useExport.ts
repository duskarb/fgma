import type {
  Dispatch,
  MutableRefObject,
  RefObject,
  SetStateAction,
} from "react";
import { jsPDF } from "jspdf";
import type { ArtboardSize, RenderSettings, TextLayer } from "../types";
import type { ArtboardPresetId } from "../appConfig";
import { ARTBOARD_PRESETS, scaleLayersForSize } from "../appConfig";
import { createPosterTexture } from "../rendering/posterTexture";
import { renderScale, scaleRenderSettings } from "../rendering/scaleRenderSettings";
import type { WebglPosterRenderer } from "../rendering/webglPosterRenderer";
import { SonificationEngine } from "../audio/SonificationEngine";
import type { SoundSettings } from "../audio/audioTypes";
import type { MotionAudioInput } from "../shared/motionFeatures";
import { buildAudioLayerInfo } from "../shared/audioLayerInfo";
import { renderOfflineAudio } from "../audio/renderOfflineAudio";
import { encodeAudioTrack } from "../export/encodeAudioTrack";

type UseExportOptions = {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  rendererRef: MutableRefObject<WebglPosterRenderer | null>;
  exportingRef: MutableRefObject<boolean>;
  layers: TextLayer[];
  bgColor: string;
  artboardSize: ArtboardSize;
  artboardPreset: ArtboardPresetId;
  previewRenderSize: ArtboardSize;
  previewWarp: boolean;
  settingsRef: MutableRefObject<RenderSettings>;
  recording: boolean;
  setRecording: Dispatch<SetStateAction<boolean>>;
  setStatus: Dispatch<SetStateAction<string>>;
  setEditingId: Dispatch<SetStateAction<string | null>>;
  sonificationEngineRef: MutableRefObject<SonificationEngine | null>;
  soundSettings: SoundSettings;
  textureRef: MutableRefObject<{
    masses: Float32Array;
    massCount: number;
    totalMass: number;
  } | null>;
};

export type ExportFormat = "png" | "jpg" | "pdf" | "mp4" | "webm" | "gif";

export type ExportOptions = {
  format: ExportFormat;
  scale: number;
  /** 0–1, JPG and PDF only. */
  quality: number;
  fps: number;
  durationSec: number;
  includeSound: boolean;
  fileName: string;
};

export const MAX_EXPORT_SIDE = 8192;

export function isMotionFormat(format: ExportFormat) {
  return format === "mp4" || format === "webm" || format === "gif";
}

function hasWebCodecs() {
  return typeof VideoEncoder !== "undefined" && typeof VideoFrame !== "undefined";
}

/** Formats recorded in real time from the live canvas (no frame-by-frame encode). */
export function isRealtimeFormat(format: ExportFormat) {
  return format === "webm" || (format === "mp4" && !hasWebCodecs());
}

export function exportSize(size: ArtboardSize, scale: number): ArtboardSize {
  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  };
}

function fileNameWithExt(name: string, ext: string) {
  const base = name.trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\.(png|jpe?g|pdf|mp4|webm|gif)$/i, "") || "fgma";
  return `${base}.${ext}`;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function useExport({
  canvasRef,
  rendererRef,
  exportingRef,
  layers,
  bgColor,
  artboardSize,
  artboardPreset,
  previewRenderSize,
  previewWarp,
  settingsRef,
  recording,
  setRecording,
  setStatus,
  setEditingId,
  sonificationEngineRef,
  soundSettings,
  textureRef,
}: UseExportOptions) {
  async function renderTargetAtSize(
    targetSize: ArtboardSize,
    renderSettings = settingsRef.current,
    time = performance.now() / 1000,
  ) {
    const targetLayers = scaleLayersForSize(layers, artboardSize, targetSize);
    const maxMasses = rendererRef.current?.getMaxMasses();
    const texture = await createPosterTexture(
      targetLayers,
      bgColor,
      targetSize,
      maxMasses,
      renderSettings.pointSpacing,
    );

    if (rendererRef.current) {
      rendererRef.current.setSize(targetSize);
      rendererRef.current.updateTexture(texture);
      rendererRef.current.render(renderSettings, time);
    } else if (canvasRef.current) {
      const canvas = canvasRef.current;
      canvas.width = targetSize.width;
      canvas.height = targetSize.height;
      const ctx = canvas.getContext("2d");
      ctx?.drawImage(texture.canvas, 0, 0);
    }
  }

  async function restorePreviewRenderTarget() {
    await renderTargetAtSize(
      previewRenderSize,
      scaleRenderSettings(settingsRef.current, renderScale(previewRenderSize, artboardSize)),
    );
  }

  function createFrameReader(canvas: HTMLCanvasElement) {
    const width = canvas.width;
    const height = canvas.height;

    if (typeof OffscreenCanvas !== "undefined") {
      const frameCanvas = new OffscreenCanvas(width, height);
      const frameCtx = frameCanvas.getContext("2d", {
        willReadFrequently: true,
      });
      if (frameCtx) {
        return () => {
          frameCtx.drawImage(canvas, 0, 0, width, height);
          return frameCtx.getImageData(0, 0, width, height).data.buffer;
        };
      }
    }

    const frameCanvas = document.createElement("canvas");
    frameCanvas.width = width;
    frameCanvas.height = height;
    const frameCtx = frameCanvas.getContext("2d", {
      willReadFrequently: true,
    })!;
    return () => {
      frameCtx.drawImage(canvas, 0, 0, width, height);
      return frameCtx.getImageData(0, 0, width, height).data.buffer;
    };
  }

  function waitForWorkerReady(worker: Worker) {
    return new Promise<void>((resolve, reject) => {
      const onMessage = (event: MessageEvent) => {
        if (event.data?.type === "ready") {
          cleanup();
          resolve();
        } else if (event.data?.type === "error") {
          cleanup();
          reject(new Error(event.data.message));
        }
      };
      const onError = (event: ErrorEvent) => {
        cleanup();
        reject(event.error ?? new Error(event.message));
      };
      const cleanup = () => {
        worker.removeEventListener("message", onMessage);
        worker.removeEventListener("error", onError);
      };
      worker.addEventListener("message", onMessage);
      worker.addEventListener("error", onError);
    });
  }

  function waitForWorkerDone(worker: Worker) {
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const onMessage = (event: MessageEvent) => {
        if (event.data?.type === "done") {
          cleanup();
          resolve(event.data.buffer);
        } else if (event.data?.type === "error") {
          cleanup();
          reject(new Error(event.data.message));
        } else if (event.data?.type === "progress") {
          const percent = Math.round(event.data.progress * 100);
          setStatus(`ENCODING ${percent}%`);
        }
      };
      const onError = (event: ErrorEvent) => {
        cleanup();
        reject(event.error ?? new Error(event.message));
      };
      const cleanup = () => {
        worker.removeEventListener("message", onMessage);
        worker.removeEventListener("error", onError);
      };
      worker.addEventListener("message", onMessage);
      worker.addEventListener("error", onError);
    });
  }

  async function encodeGifWithWorker(
    canvas: HTMLCanvasElement,
    renderSettings: RenderSettings,
    fps: number,
    durationSec: number,
  ) {
    const worker = new Worker(
      new URL("../workers/gifEncoder.worker.ts", import.meta.url),
      { type: "module" },
    );
    try {
      const frameCount = Math.max(1, Math.ceil(fps * durationSec));
      const delay = Math.round(1000 / fps);
      const readFrame = createFrameReader(canvas);

      worker.postMessage({
        type: "init",
        width: canvas.width,
        height: canvas.height,
        delay,
        frameCount,
      });
      await waitForWorkerReady(worker);
      const done = waitForWorkerDone(worker);

      for (let i = 0; i < frameCount; i++) {
        rendererRef.current?.render(renderSettings, i / fps);
        const rgba = readFrame();
        worker.postMessage({ type: "frame", rgba }, [rgba]);
        if (i % 4 === 0)
          await new Promise((resolve) => window.setTimeout(resolve, 0));
      }

      worker.postMessage({ type: "finish" });
      return await done;
    } finally {
      worker.terminate();
    }
  }

  async function chooseMp4Codec(
    width: number,
    height: number,
    fps: number,
    bitrate: number,
  ) {
    type ContainerCodec = "avc" | "vp9";
    const candidates: { codec: string; container: ContainerCodec }[] = [
      { codec: "avc1.640028", container: "avc" },
      { codec: "avc1.4d0028", container: "avc" },
      { codec: "avc1.42E01E", container: "avc" },
      { codec: "avc1.42001E", container: "avc" },
      { codec: "vp09.00.10.08", container: "vp9" },
      { codec: "vp09.00.41.08", container: "vp9" },
    ];

    for (const candidate of candidates) {
      try {
        const { supported } = await VideoEncoder.isConfigSupported({
          codec: candidate.codec,
          width,
          height,
          bitrate,
          framerate: fps,
        });
        if (supported) return candidate;
      } catch {
        // Try the next codec candidate.
      }
    }

    return null;
  }

  async function encodeMp4WithWorker(
    canvas: HTMLCanvasElement,
    renderSettings: RenderSettings,
    fps: number,
    durationSec: number,
    audioBuffer?: AudioBuffer,
  ) {
    if (
      typeof VideoEncoder === "undefined" ||
      typeof VideoFrame === "undefined"
    ) {
      throw new Error("WebCodecs not supported. Use WEBM instead.");
    }

    const frameCount = Math.max(1, Math.round(fps * durationSec));
    // ~0.2 bits per pixel per frame, clamped to a sane range.
    const bitrate = Math.round(
      Math.min(40_000_000, Math.max(4_000_000, canvas.width * canvas.height * fps * 0.2)),
    );
    const chosen = await chooseMp4Codec(
      canvas.width,
      canvas.height,
      fps,
      bitrate,
    );
    if (!chosen) throw new Error("No supported video codec. Use WEBM instead.");

    // Check audio encoding support
    let audioOpts: { sampleRate: number; channels: number } | undefined;
    if (audioBuffer) {
      if (typeof AudioEncoder === "undefined") {
        throw new Error("This browser cannot encode AAC audio for MP4. Try Chrome or Edge.");
      }
      const sup = await AudioEncoder.isConfigSupported({
        codec: "mp4a.40.2",
        sampleRate: audioBuffer.sampleRate,
        numberOfChannels: audioBuffer.numberOfChannels,
      });
      if (!sup.supported) {
        throw new Error("This browser cannot encode AAC audio for MP4. Try Chrome or Edge.");
      }
      audioOpts = {
        sampleRate: audioBuffer.sampleRate,
        channels: audioBuffer.numberOfChannels,
      };
    }

    const worker = new Worker(
      new URL("../workers/mp4Encoder.worker.ts", import.meta.url),
      { type: "module" },
    );
    try {
      worker.postMessage({
        type: "init",
        codec: chosen.codec,
        container: chosen.container,
        width: canvas.width,
        height: canvas.height,
        bitrate,
        fps,
        frameCount,
        audio: audioOpts,
      });
      await waitForWorkerReady(worker);
      const done = waitForWorkerDone(worker);

      // Send encoded audio chunks before video frames so muxer can interleave
      if (audioBuffer && audioOpts) {
        await encodeAudioTrack(audioBuffer, (chunk, metadata) => {
          const chunkData = new Uint8Array(chunk.byteLength);
          chunk.copyTo(chunkData);

          const transferables: Transferable[] = [chunkData.buffer];
          let serializedMeta: any = undefined;

          if (metadata && metadata.decoderConfig) {
            serializedMeta = {
              decoderConfig: {
                codec: metadata.decoderConfig.codec,
                sampleRate: metadata.decoderConfig.sampleRate,
                numberOfChannels: metadata.decoderConfig.numberOfChannels,
              },
            };
            if (metadata.decoderConfig.description) {
              const desc = metadata.decoderConfig.description;
              let descBuffer: ArrayBuffer;
              if (ArrayBuffer.isView(desc)) {
                descBuffer = new Uint8Array(
                  desc.buffer as ArrayBuffer,
                  desc.byteOffset,
                  desc.byteLength,
                ).buffer;
              } else {
                descBuffer = new Uint8Array(desc as ArrayBuffer).buffer;
              }
              serializedMeta.decoderConfig.description = new Uint8Array(
                descBuffer,
              );
              transferables.push(descBuffer);
            }
          }

          worker.postMessage(
            {
              type: "audio",
              chunk: {
                type: chunk.type,
                timestamp: chunk.timestamp,
                duration: chunk.duration || 0,
                data: chunkData,
              },
              meta: serializedMeta,
            },
            transferables,
          );
        });
      }

      for (let i = 0; i < frameCount; i++) {
        rendererRef.current?.render(renderSettings, i / fps);
        const bitmap = await createImageBitmap(canvas);
        worker.postMessage(
          {
            type: "frame",
            bitmap,
            timestamp: Math.round((i * 1_000_000) / fps),
            keyFrame: i % fps === 0,
          },
          [bitmap],
        );
        if (i % 4 === 0)
          await new Promise((resolve) => window.setTimeout(resolve, 0));
      }

      worker.postMessage({ type: "finish" });
      return await done;
    } finally {
      worker.terminate();
    }
  }

  function stillSettings() {
    return previewWarp
      ? settingsRef.current
      : { ...settingsRef.current, strength: 0, motionAmount: 0 };
  }

  function finishExport() {
    exportingRef.current = false;
    setRecording(false);
    setStatus(rendererRef.current ? "LIVE" : "FLAT");
  }

  async function canvasBlob(type: string, quality?: number) {
    if (rendererRef.current) return rendererRef.current.toBlob(type, quality);
    return new Promise<Blob>((resolve, reject) => {
      canvasRef.current?.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Could not export canvas."))),
        type,
        quality,
      );
    });
  }

  async function exportImage(options: ExportOptions) {
    const size = exportSize(artboardSize, options.scale);
    const renderSettings = scaleRenderSettings(stillSettings(), options.scale);
    await renderTargetAtSize(size, renderSettings);

    if (options.format === "png") {
      downloadBlob(await canvasBlob("image/png"), fileNameWithExt(options.fileName, "png"));
      return;
    }

    const jpeg = await canvasBlob("image/jpeg", options.quality);
    if (options.format === "jpg") {
      downloadBlob(jpeg, fileNameWithExt(options.fileName, "jpg"));
      return;
    }

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(jpeg);
    });
    // Page size follows the 1x artboard; scale only raises the image DPI.
    const isLandscape = artboardSize.width > artboardSize.height;
    const preset = ARTBOARD_PRESETS.find((p) => p.id === artboardPreset);
    const pageFormat =
      preset?.id === "a4" || preset?.id === "a3"
        ? (preset.id.toUpperCase() as "A4" | "A3")
        : ([
            artboardSize.width * 0.264583,
            artboardSize.height * 0.264583,
          ] as [number, number]);
    const pdf = new jsPDF({
      orientation: isLandscape ? "landscape" : "portrait",
      unit: "mm",
      format: pageFormat,
    });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    pdf.addImage(dataUrl, "JPEG", 0, 0, pageW, pageH);
    pdf.save(fileNameWithExt(options.fileName, "pdf"));
  }

  async function renderAudio(options: ExportOptions) {
    const tex = textureRef.current;
    if (!options.includeSound) return null;
    if (!tex) throw new Error("The artboard is not ready to render audio yet. Try exporting again.");
    const input: MotionAudioInput = {
      masses: tex.masses,
      massCount: tex.massCount,
      totalMass: tex.totalMass,
      strength: settingsRef.current.strength,
      decay: settingsRef.current.decay,
      epsilon: settingsRef.current.epsilon,
      motionAmount: settingsRef.current.motionAmount,
      durationSec: options.durationSec,
      fps: options.fps,
      seed: soundSettings.seed,
      bgColorHex: bgColor,
      textColorHex: layers[0]?.color || "#111111",
      fontFamily: layers[0]?.fontFamily || "Pretendard",
      layersInfo: buildAudioLayerInfo(layers, artboardSize),
    };
    setStatus("AUDIO…");
    return renderOfflineAudio(input, soundSettings);
  }

  /** Real-time capture through MediaRecorder; resolves when the file is saved. */
  function recordRealtime(
    canvas: HTMLCanvasElement,
    mimeType: string,
    options: ExportOptions,
    ext: string,
    audioTrack?: MediaStreamTrack,
  ) {
    return new Promise<void>((resolve, reject) => {
      const videoStream = canvas.captureStream(options.fps);
      const stream = audioTrack
        ? new MediaStream([...videoStream.getVideoTracks(), audioTrack])
        : videoStream;
      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks: Blob[] = [];
      let timer: number | undefined;
      let failed = false;
      const cleanup = () => {
        if (timer !== undefined) window.clearTimeout(timer);
        videoStream.getTracks().forEach((track) => track.stop());
      };
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onerror = () => {
        failed = true;
        cleanup();
        reject(new Error("Video recording failed in this browser."));
      };
      recorder.onstop = () => {
        cleanup();
        if (failed) return;
        if (!chunks.length) {
          reject(new Error("Video recording produced no data."));
          return;
        }
        downloadBlob(
          new Blob(chunks, { type: mimeType.split(";")[0] }),
          fileNameWithExt(options.fileName, ext),
        );
        resolve();
      };
      recorder.start();
      timer = window.setTimeout(() => {
        if (recorder.state !== "inactive") recorder.stop();
      }, options.durationSec * 1000);
    });
  }

  async function exportMotion(options: ExportOptions) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // MediaRecorder needs a live audio stream. Start it while the export click
    // still has user activation, before any asynchronous texture work.
    let startedForExport: SonificationEngine | null = null;
    let createdForExport = false;
    try {
      if (options.format === "mp4" && options.includeSound && !hasWebCodecs()) {
        const engine = sonificationEngineRef.current ?? new SonificationEngine(soundSettings);
        if (!sonificationEngineRef.current) {
          sonificationEngineRef.current = engine;
          createdForExport = true;
        }
        if (!engine.isRunning) {
          startedForExport = engine;
          engine.start();
        }
      }
      // Real-time capture records the live render loop, which always uses the
      // 1x settings, so it can only run at 1x.
      const scale = isRealtimeFormat(options.format) ? 1 : options.scale;
      const size = exportSize(artboardSize, scale);
      const renderSettings = scaleRenderSettings(settingsRef.current, scale);
      await renderTargetAtSize(size, renderSettings);

      if (options.format === "gif") {
        const buffer = await encodeGifWithWorker(canvas, renderSettings, options.fps, options.durationSec);
        downloadBlob(new Blob([buffer], { type: "image/gif" }), fileNameWithExt(options.fileName, "gif"));
        return;
      }

      if (options.format === "webm") {
        const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
          ? "video/webm;codecs=vp9"
          : "video/webm";
        exportingRef.current = false;
        await recordRealtime(canvas, mimeType, options, "webm");
        return;
      }

      // MP4 path A: WebCodecs, frame-by-frame.
      if (hasWebCodecs()) {
        const audioBuffer = await renderAudio(options);
        const buffer = await encodeMp4WithWorker(
          canvas,
          renderSettings,
          options.fps,
          options.durationSec,
          audioBuffer ?? undefined,
        );
        downloadBlob(new Blob([buffer], { type: "video/mp4" }), fileNameWithExt(options.fileName, "mp4"));
        return;
      }

      // MP4 path B: MediaRecorder fallback (Firefox, etc.)
      const mp4Mime = [
        "video/mp4;codecs=avc1",
        "video/mp4;codecs=h264",
        "video/mp4",
      ].find((type) => MediaRecorder.isTypeSupported(type));
      if (!mp4Mime) {
        throw new Error("MP4 export is not supported in this browser. Try Chrome/Edge or export WEBM.");
      }
      let audioTrack: MediaStreamTrack | undefined;
      if (options.includeSound) {
        const engine = sonificationEngineRef.current;
        if (!engine?.isRunning) throw new Error("Could not start audio capture for MP4.");
        audioTrack = engine.getCaptureStream().getAudioTracks()[0];
        if (!audioTrack) throw new Error("Could not get an audio track for MP4.");
      }
      exportingRef.current = false;
      await recordRealtime(canvas, mp4Mime, options, "mp4", audioTrack);
    } finally {
      startedForExport?.stop();
      if (createdForExport && sonificationEngineRef.current === startedForExport) {
        sonificationEngineRef.current = null;
      }
    }
  }

  /** Returns true when the file was produced. */
  async function runExport(options: ExportOptions) {
    if (recording) return false;
    setEditingId(null);
    setRecording(true);
    setStatus(isMotionFormat(options.format) ? "RECORDING" : "RENDERING");
    exportingRef.current = true;
    try {
      if (isMotionFormat(options.format)) await exportMotion(options);
      else await exportImage(options);
      return true;
    } catch (err) {
      console.error(`${options.format.toUpperCase()} export failed:`, err);
      alert(`${options.format.toUpperCase()} export failed: ${err instanceof Error ? err.message : err}`);
      return false;
    } finally {
      await restorePreviewRenderTarget();
      finishExport();
    }
  }

  return { runExport };
}
