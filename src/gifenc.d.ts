declare module 'gifenc' {
  export function GIFEncoder(): {
    writeFrame(index: Uint8Array, width: number, height: number, options: { palette: unknown; delay: number; repeat: number }): void;
    finish(): void;
    bytes(): Uint8Array<ArrayBuffer>;
  };

  export function quantize(rgba: Uint8Array, maxColors: number): unknown;
  export function applyPalette(rgba: Uint8Array, palette: unknown): Uint8Array<ArrayBuffer>;
}
