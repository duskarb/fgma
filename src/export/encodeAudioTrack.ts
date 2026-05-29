export async function encodeAudioTrack(
  audioBuffer: AudioBuffer,
  onChunk: (chunk: EncodedAudioChunk, metadata?: EncodedAudioChunkMetadata) => void,
): Promise<void> {
  if (typeof AudioEncoder === 'undefined') {
    throw new Error('AudioEncoder (WebCodecs) not available');
  }

  const codec = 'mp4a.40.2'; // AAC-LC
  const sampleRate = audioBuffer.sampleRate;
  const numberOfChannels = audioBuffer.numberOfChannels;

  const supported = await AudioEncoder.isConfigSupported({
    codec,
    sampleRate,
    numberOfChannels,
  });
  if (!supported.supported) {
    throw new Error('AAC encoding not supported in this browser');
  }

  await new Promise<void>((resolve, reject) => {
    const encoder = new AudioEncoder({
      output: (chunk, metadata) => onChunk(chunk, metadata),
      error: (e) => reject(e),
    });

    encoder.configure({ codec, sampleRate, numberOfChannels, bitrate: 128_000 });

    // Interleave channels into AudioData
    const frameSize = 1024; // typical AAC frame
    const totalFrames = audioBuffer.length;
    const channelData = Array.from({ length: numberOfChannels }, (_, ch) =>
      audioBuffer.getChannelData(ch),
    );

    for (let offset = 0; offset < totalFrames; offset += frameSize) {
      const count = Math.min(frameSize, totalFrames - offset);
      const interleaved = new Float32Array(count * numberOfChannels);
      for (let i = 0; i < count; i++) {
        for (let ch = 0; ch < numberOfChannels; ch++) {
          interleaved[i * numberOfChannels + ch] = channelData[ch][offset + i];
        }
      }

      const data = new AudioData({
        format: 'f32-planar',
        sampleRate,
        numberOfFrames: count,
        numberOfChannels,
        timestamp: Math.round((offset / sampleRate) * 1_000_000),
        data: (function () {
          // planar: each channel contiguous
          const planar = new Float32Array(count * numberOfChannels);
          for (let ch = 0; ch < numberOfChannels; ch++) {
            planar.set(channelData[ch].subarray(offset, offset + count), ch * count);
          }
          return planar;
        })(),
      });

      encoder.encode(data);
      data.close();
    }

    encoder.flush().then(() => { encoder.close(); resolve(); }).catch(reject);
  });
}
