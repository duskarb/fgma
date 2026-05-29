import type { SoundSettings } from './audioTypes';
import type { MotionAudioInput } from '../shared/motionFeatures';
import { createTraversalAgent } from './traversalAgent';
import { extractSoundFeatures } from './featureExtractor';
import { buildSynthGraph } from './synthGraph';

const SAMPLE_RATE = 44100;
const BLOCK_SIZE = 128; // audio frames per feature step

export async function renderOfflineAudio(
  input: MotionAudioInput,
  settings: SoundSettings,
): Promise<AudioBuffer> {
  const totalSamples = Math.ceil(SAMPLE_RATE * input.durationSec);
  const ctx = new OfflineAudioContext(2, totalSamples, SAMPLE_RATE);

  const graph = buildSynthGraph(ctx, settings);
  graph.connect(ctx.destination);

  const agent = createTraversalAgent(input);
  const blocks = Math.ceil(totalSamples / BLOCK_SIZE);

  for (let b = 0; b < blocks; b++) {
    const t = (b * BLOCK_SIZE) / SAMPLE_RATE;
    const traversal = agent.step();
    const features = extractSoundFeatures(input, t, traversal);
    graph.update(features, t);
  }

  const buffer = await ctx.startRendering();
  return buffer;
}
