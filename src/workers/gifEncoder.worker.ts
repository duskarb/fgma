import { GIFEncoder, applyPalette, quantize } from 'gifenc';

type WorkerScope = {
  onmessage: ((event: MessageEvent<WorkerMessage>) => void) | null;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
};

const workerScope = self as unknown as WorkerScope;

type InitMessage = {
  type: 'init';
  width: number;
  height: number;
  delay: number;
  frameCount: number;
};

type FrameMessage = {
  type: 'frame';
  rgba: ArrayBuffer;
};

type FinishMessage = {
  type: 'finish';
};

type WorkerMessage = InitMessage | FrameMessage | FinishMessage;

let gif: ReturnType<typeof GIFEncoder> | null = null;
let width = 0;
let height = 0;
let delay = 0;
let frameCount = 0;
let writtenFrames = 0;

workerScope.onmessage = (event: MessageEvent<WorkerMessage>) => {
  try {
    const message = event.data;

    if (message.type === 'init') {
      gif = GIFEncoder();
      width = message.width;
      height = message.height;
      delay = message.delay;
      frameCount = message.frameCount;
      writtenFrames = 0;
      workerScope.postMessage({ type: 'ready' });
      return;
    }

    if (message.type === 'frame') {
      if (!gif) throw new Error('GIF worker was not initialized.');

      const rgba = new Uint8Array(message.rgba);
      const palette = quantize(rgba, 256);
      const index = applyPalette(rgba, palette);
      gif.writeFrame(index, width, height, { palette, delay, repeat: 0 });
      writtenFrames += 1;
      workerScope.postMessage({ type: 'progress', progress: writtenFrames / Math.max(1, frameCount) });
      return;
    }

    if (message.type === 'finish') {
      if (!gif) throw new Error('GIF worker was not initialized.');

      gif.finish();
      const bytes = gif.bytes();
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      gif = null;
      workerScope.postMessage({ type: 'done', buffer }, [buffer]);
    }
  } catch (error) {
    workerScope.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
