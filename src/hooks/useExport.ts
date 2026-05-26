import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react';
import { jsPDF } from 'jspdf';
import type { ArtboardSize, RenderSettings, TextLayer } from '../types';
import type { ArtboardPresetId } from '../appConfig';
import { ARTBOARD_PRESETS, scaleLayersForSize } from '../appConfig';
import { createPosterTexture } from '../rendering/posterTexture';
import type { WebglPosterRenderer } from '../rendering/webglPosterRenderer';

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
};

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
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
}: UseExportOptions) {
  async function renderTargetAtSize(targetSize: ArtboardSize, renderSettings = settingsRef.current, time = performance.now() / 1000) {
    const targetLayers = scaleLayersForSize(layers, artboardSize, targetSize);
    const maxMasses = rendererRef.current?.getMaxMasses();
    const texture = await createPosterTexture(targetLayers, bgColor, targetSize, maxMasses, renderSettings.pointSpacing);

    if (rendererRef.current) {
      rendererRef.current.setSize(targetSize);
      rendererRef.current.updateTexture(texture);
      rendererRef.current.render(renderSettings, time);
    } else if (canvasRef.current) {
      const canvas = canvasRef.current;
      canvas.width = targetSize.width;
      canvas.height = targetSize.height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(texture.canvas, 0, 0);
    }
  }

  async function restorePreviewRenderTarget() {
    await renderTargetAtSize(previewRenderSize);
  }

  function createFrameReader(canvas: HTMLCanvasElement) {
    const width = canvas.width;
    const height = canvas.height;

    if (typeof OffscreenCanvas !== 'undefined') {
      const frameCanvas = new OffscreenCanvas(width, height);
      const frameCtx = frameCanvas.getContext('2d', { willReadFrequently: true });
      if (frameCtx) {
        return () => {
          frameCtx.drawImage(canvas, 0, 0, width, height);
          return frameCtx.getImageData(0, 0, width, height).data.buffer;
        };
      }
    }

    const frameCanvas = document.createElement('canvas');
    frameCanvas.width = width;
    frameCanvas.height = height;
    const frameCtx = frameCanvas.getContext('2d', { willReadFrequently: true })!;
    return () => {
      frameCtx.drawImage(canvas, 0, 0, width, height);
      return frameCtx.getImageData(0, 0, width, height).data.buffer;
    };
  }

  function waitForWorkerReady(worker: Worker) {
    return new Promise<void>((resolve, reject) => {
      const onMessage = (event: MessageEvent) => {
        if (event.data?.type === 'ready') {
          cleanup();
          resolve();
        } else if (event.data?.type === 'error') {
          cleanup();
          reject(new Error(event.data.message));
        }
      };
      const onError = (event: ErrorEvent) => {
        cleanup();
        reject(event.error ?? new Error(event.message));
      };
      const cleanup = () => {
        worker.removeEventListener('message', onMessage);
        worker.removeEventListener('error', onError);
      };
      worker.addEventListener('message', onMessage);
      worker.addEventListener('error', onError);
    });
  }

  function waitForWorkerDone(worker: Worker) {
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const onMessage = (event: MessageEvent) => {
        if (event.data?.type === 'done') {
          cleanup();
          resolve(event.data.buffer);
        } else if (event.data?.type === 'error') {
          cleanup();
          reject(new Error(event.data.message));
        } else if (event.data?.type === 'progress') {
          const percent = Math.round(event.data.progress * 100);
          setStatus(`ENCODING ${percent}%`);
        }
      };
      const onError = (event: ErrorEvent) => {
        cleanup();
        reject(event.error ?? new Error(event.message));
      };
      const cleanup = () => {
        worker.removeEventListener('message', onMessage);
        worker.removeEventListener('error', onError);
      };
      worker.addEventListener('message', onMessage);
      worker.addEventListener('error', onError);
    });
  }

  async function encodeGifWithWorker(canvas: HTMLCanvasElement) {
    const worker = new Worker(new URL('../workers/gifEncoder.worker.ts', import.meta.url), { type: 'module' });
    try {
      const fps = 20;
      const frameCount = Math.ceil(fps * 3.2);
      const delay = Math.round(1000 / fps);
      const readFrame = createFrameReader(canvas);

      worker.postMessage({ type: 'init', width: canvas.width, height: canvas.height, delay, frameCount });
      await waitForWorkerReady(worker);
      const done = waitForWorkerDone(worker);

      for (let i = 0; i < frameCount; i++) {
        rendererRef.current?.render(settingsRef.current, i / fps);
        const rgba = readFrame();
        worker.postMessage({ type: 'frame', rgba }, [rgba]);
        if (i % 4 === 0) await new Promise((resolve) => window.setTimeout(resolve, 0));
      }

      worker.postMessage({ type: 'finish' });
      return await done;
    } finally {
      worker.terminate();
    }
  }

  async function chooseMp4Codec(width: number, height: number, fps: number, bitrate: number) {
    type ContainerCodec = 'avc' | 'vp9';
    const candidates: { codec: string; container: ContainerCodec }[] = [
      { codec: 'avc1.640028', container: 'avc' },
      { codec: 'avc1.4d0028', container: 'avc' },
      { codec: 'avc1.42E01E', container: 'avc' },
      { codec: 'avc1.42001E', container: 'avc' },
      { codec: 'vp09.00.10.08', container: 'vp9' },
      { codec: 'vp09.00.41.08', container: 'vp9' },
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

  async function encodeMp4WithWorker(canvas: HTMLCanvasElement) {
    if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') {
      throw new Error('WebCodecs not supported. Use WEBM instead.');
    }

    const fps = 30;
    const frameCount = fps * 5;
    const bitrate = 12_000_000;
    const chosen = await chooseMp4Codec(canvas.width, canvas.height, fps, bitrate);
    if (!chosen) throw new Error('No supported video codec. Use WEBM instead.');

    const worker = new Worker(new URL('../workers/mp4Encoder.worker.ts', import.meta.url), { type: 'module' });
    try {
      worker.postMessage({
        type: 'init',
        codec: chosen.codec,
        container: chosen.container,
        width: canvas.width,
        height: canvas.height,
        bitrate,
        fps,
        frameCount,
      });
      await waitForWorkerReady(worker);
      const done = waitForWorkerDone(worker);

      for (let i = 0; i < frameCount; i++) {
        rendererRef.current?.render(settingsRef.current, i / fps);
        const frame = new VideoFrame(canvas, { timestamp: Math.round(i * 1_000_000 / fps) });
        worker.postMessage({ type: 'frame', frame, keyFrame: i % fps === 0 }, [frame]);
        if (i % 4 === 0) await new Promise((resolve) => window.setTimeout(resolve, 0));
      }

      worker.postMessage({ type: 'finish' });
      return await done;
    } finally {
      worker.terminate();
    }
  }

  async function exportPng() {
    setEditingId(null);
    const exportSettings = previewWarp ? settingsRef.current : { ...settingsRef.current, strength: 0, motionAmount: 0 };
    exportingRef.current = true;
    try {
      await renderTargetAtSize(artboardSize, exportSettings);
      const blob = rendererRef.current
        ? await rendererRef.current.toBlob('image/png')
        : await new Promise<Blob>((resolve, reject) => {
            canvasRef.current?.toBlob((nextBlob) => {
              if (nextBlob) resolve(nextBlob);
              else reject(new Error('Could not export canvas.'));
            }, 'image/png');
          });
      downloadBlob(blob, 'poster-webgl.png');
    } finally {
      await restorePreviewRenderTarget();
      exportingRef.current = false;
    }
  }

  async function exportPdf() {
    setEditingId(null);
    const exportSettings = previewWarp ? settingsRef.current : { ...settingsRef.current, strength: 0, motionAmount: 0 };
    exportingRef.current = true;
    try {
      await renderTargetAtSize(artboardSize, exportSettings);
      const blob = rendererRef.current
        ? await rendererRef.current.toBlob('image/jpeg', 0.95)
        : await new Promise<Blob>((resolve, reject) => {
            canvasRef.current?.toBlob((b) => {
              if (b) resolve(b);
              else reject(new Error('Could not export canvas.'));
            }, 'image/jpeg', 0.95);
          });
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      const isLandscape = artboardSize.width > artboardSize.height;
      const preset = ARTBOARD_PRESETS.find((p) => p.id === artboardPreset);
      const pageFormat = (preset?.id === 'a4' || preset?.id === 'a3')
        ? (preset.id.toUpperCase() as 'A4' | 'A3')
        : ([artboardSize.width * 0.264583, artboardSize.height * 0.264583] as [number, number]);
      const pdf = new jsPDF({ orientation: isLandscape ? 'landscape' : 'portrait', unit: 'mm', format: pageFormat });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      pdf.addImage(dataUrl, 'JPEG', 0, 0, pageW, pageH);
      pdf.save('poster.pdf');
    } finally {
      await restorePreviewRenderTarget();
      exportingRef.current = false;
    }
  }

  async function exportWebm() {
    const canvas = canvasRef.current;
    if (!canvas || recording) return;
    setEditingId(null);
    await renderTargetAtSize(artboardSize);
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
    setRecording(true);
    setStatus('RECORDING');
    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    recorder.onstop = () => {
      downloadBlob(new Blob(chunks, { type: 'video/webm' }), 'poster-motion.webm');
      restorePreviewRenderTarget().finally(() => {
        setRecording(false);
        setStatus(rendererRef.current ? 'LIVE' : 'FLAT');
      });
    };
    recorder.start();
    window.setTimeout(() => recorder.stop(), 3200);
  }

  async function exportMp4() {
    const canvas = canvasRef.current;
    if (!canvas || recording) return;
    setEditingId(null);
    await renderTargetAtSize(artboardSize);
    setRecording(true);
    setStatus('RECORDING');

    const mp4Mime = ['video/mp4;codecs=avc1', 'video/mp4;codecs=h264', 'video/mp4']
      .find((type) => MediaRecorder.isTypeSupported(type));
    if (mp4Mime) {
      const stream = canvas.captureStream(30);
      const recorder = new MediaRecorder(stream, { mimeType: mp4Mime });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = () => {
        downloadBlob(new Blob(chunks, { type: 'video/mp4' }), 'poster-motion.mp4');
        restorePreviewRenderTarget().finally(() => {
          setRecording(false);
          setStatus(rendererRef.current ? 'LIVE' : 'FLAT');
        });
      };
      recorder.start();
      window.setTimeout(() => recorder.stop(), 5000);
      return;
    }

    exportingRef.current = true;
    try {
      const buffer = await encodeMp4WithWorker(canvas);
      downloadBlob(new Blob([buffer], { type: 'video/mp4' }), 'poster-motion.mp4');
    } catch (err) {
      console.error('MP4 export failed:', err);
      alert(`MP4 export failed: ${err}`);
    } finally {
      await restorePreviewRenderTarget();
      exportingRef.current = false;
      setRecording(false);
      setStatus(rendererRef.current ? 'LIVE' : 'FLAT');
    }
  }

  async function exportGif() {
    const canvas = canvasRef.current;
    if (!canvas || recording) return;
    setEditingId(null);
    setRecording(true);
    setStatus('RECORDING');
    exportingRef.current = true;
    try {
      await renderTargetAtSize(artboardSize);
      const buffer = await encodeGifWithWorker(canvas);
      downloadBlob(new Blob([buffer], { type: 'image/gif' }), 'poster-motion.gif');
    } catch (err) {
      console.error('GIF export failed:', err);
    } finally {
      await restorePreviewRenderTarget();
      exportingRef.current = false;
      setRecording(false);
      setStatus(rendererRef.current ? 'LIVE' : 'FLAT');
    }
  }

  return { exportPng, exportPdf, exportWebm, exportMp4, exportGif };
}
