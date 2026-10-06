// Colour maths for recolouring a textured character part.
// Everything here is in linear colour space, which is what the 3D renderer works in.

export type RGB = { r: number; g: number; b: number };
export type Pixels = { data: Uint8ClampedArray; size: number };

/** Anything that can report texture coordinates per vertex, e.g. a geometry's "uv" attribute. */
export type UVSource = {
  count: number;
  getX(index: number): number;
  getY(index: number): number;
};

const SAMPLE_SIZE = 128; // the texture is read at this resolution
const MAX_UV_SAMPLES = 3000;
const MAX_GAIN = 12;

function srgbToLinear(value: number): number {
  return value <= 0.04045
    ? value / 12.92
    : Math.pow((value + 0.055) / 1.055, 2.4);
}

export function hexToLinear(hex: string): RGB {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  if (hex.replace("#", "").length !== 6 || Number.isNaN(value))
    return { r: 1, g: 1, b: 1 };
  return {
    r: srgbToLinear(((value >> 16) & 255) / 255),
    g: srgbToLinear(((value >> 8) & 255) / 255),
    b: srgbToLinear((value & 255) / 255),
  };
}

/** Copy a texture image into readable pixels. Returns null when it cannot be read. */
export function readPixels(image: CanvasImageSource): Pixels | null {
  const canvas = document.createElement("canvas");
  canvas.width = SAMPLE_SIZE;
  canvas.height = SAMPLE_SIZE;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;

  try {
    context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    return {
      data: context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data,
      size: SAMPLE_SIZE,
    };
  } catch {
    return null;
  }
}

function wrap(value: number): number {
  return value - Math.floor(value);
}

/**
 * Average visible colour of a texture.
 * With `uv`, only the part of the texture that mesh actually uses is measured. That matters
 * when one texture sheet holds skin, shirt, trousers and shoes side by side.
 * `flipY` says whether the texture's rows run bottom-to-top, which is the 3D default.
 */
export function averageLinear(
  pixels: Pixels,
  isSRGB: boolean,
  uv?: UVSource | null,
  flipY = true
): RGB | null {
  const { data, size } = pixels;
  let r = 0;
  let g = 0;
  let b = 0;
  let weight = 0;

  const add = (offset: number) => {
    const alpha = data[offset + 3] / 255;
    if (alpha < 0.2) return; // transparent, e.g. gaps between hair strands
    const pr = isSRGB ? srgbToLinear(data[offset] / 255) : data[offset] / 255;
    const pg = isSRGB
      ? srgbToLinear(data[offset + 1] / 255)
      : data[offset + 1] / 255;
    const pb = isSRGB
      ? srgbToLinear(data[offset + 2] / 255)
      : data[offset + 2] / 255;
    if (pr + pg + pb < 0.002) return; // unused black padding in the texture sheet
    r += pr * alpha;
    g += pg * alpha;
    b += pb * alpha;
    weight += alpha;
  };

  if (uv && uv.count > 0) {
    const step = Math.max(1, Math.ceil(uv.count / MAX_UV_SAMPLES));
    for (let i = 0; i < uv.count; i += step) {
      const u = wrap(uv.getX(i));
      const v = wrap(uv.getY(i));
      const column = Math.min(size - 1, Math.floor(u * size));
      const row = Math.min(size - 1, Math.floor((flipY ? 1 - v : v) * size));
      add((row * size + column) * 4);
    }
  } else {
    for (let offset = 0; offset < data.length; offset += 4) add(offset);
  }

  if (weight === 0) return null;
  return { r: r / weight, g: g / weight, b: b / weight };
}

function gain(target: number, base: number): number {
  return Math.min(MAX_GAIN, target / Math.max(base, 1e-4));
}

/**
 * The material colour that makes a texture read as `tint`.
 * A material colour multiplies its texture, so a plain tint on a dark texture
 * stays dark. Dividing by the texture's average cancels that out.
 */
export function tintFor(tint: RGB, average: RGB | null): RGB {
  if (!average) return tint;
  return {
    r: gain(tint.r, average.r),
    g: gain(tint.g, average.g),
    b: gain(tint.b, average.b),
  };
}
