import { ArrayBufferTarget, Muxer } from 'mp4-muxer';

type WorkerScope = {
  onmessage: ((event: MessageEvent<WorkerMessage>) => void | Promise<void>) | null;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
};

const workerScope = self as unknown as WorkerScope;

type ContainerCodec = 'avc' | 'vp9';

type InitMessage = {
  type: 'init';
  codec: string;
  container: ContainerCodec;
  width: number;
  height: number;
  bitrate: number;
  fps: number;
  frameCount: number;
};

type FrameMessage = {
  type: 'frame';
  frame: VideoFrame;
  keyFrame: boolean;
};

type FinishMessage = {
  type: 'finish';
};

type WorkerMessage = InitMessage | FrameMessage | FinishMessage;

let target: ArrayBufferTarget | null = null;
let muxer: Muxer<ArrayBufferTarget> | null = null;
let encoder: VideoEncoder | null = null;
let encodeError: Error | null = null;
let frameCount = 0;
let encodedFrames = 0;

workerScope.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  try {
    const message = event.data;

    if (message.type === 'init') {
      if (typeof VideoEncoder === 'undefined') {
        throw new Error('WebCodecs is not available in this worker.');
      }

      target = new ArrayBufferTarget();
      muxer = new Muxer({
        target,
        video: {
          codec: message.container,
          width: message.width,
          height: message.height,
        },
        fastStart: 'in-memory',
      });
      frameCount = message.frameCount;
      encodedFrames = 0;
      encodeError = null;

      encoder = new VideoEncoder({
        output: (chunk, meta) => {
          muxer?.addVideoChunk(chunk, meta);
          encodedFrames += 1;
          workerScope.postMessage({ type: 'progress', progress: encodedFrames / Math.max(1, frameCount) });
        },
        error: (error) => {
          encodeError = error;
          workerScope.postMessage({ type: 'error', message: error.message });
        },
      });

      encoder.configure({
        codec: message.codec,
        width: message.width,
        height: message.height,
        bitrate: message.bitrate,
        framerate: message.fps,
      });

      workerScope.postMessage({ type: 'ready' });
      return;
    }

    if (message.type === 'frame') {
      if (!encoder) throw new Error('MP4 worker was not initialized.');
      if (encodeError) throw encodeError;

      encoder.encode(message.frame, { keyFrame: message.keyFrame });
      message.frame.close();
      return;
    }

    if (message.type === 'finish') {
      if (!encoder || !muxer || !target) throw new Error('MP4 worker was not initialized.');

      await encoder.flush();
      if (encodeError) throw encodeError;
      muxer.finalize();
      const buffer = target.buffer;
      encoder.close();
      encoder = null;
      muxer = null;
      target = null;
      workerScope.postMessage({ type: 'done', buffer }, [buffer]);
    }
  } catch (error) {
    workerScope.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
