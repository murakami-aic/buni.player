import { readFile } from "@tauri-apps/plugin-fs";
import { getSwatchesSync, getColorSync } from "colorthief";

export interface TrackPalette {
  accentTriplet: string;
  mutedTriplet: string;
  accentFgTriplet: string;
  themeSurface: string;
  themeOverlay: string;
  overlayOpacity: number;
  brightness: number;
}

const LUM_R = 0.2126;
const LUM_G = 0.7152;
const LUM_B = 0.0722;

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function surfaceLightness(brightness: number): number {
  return Math.round(28 - (brightness / 255) * 16);
}

function overlayLightness(brightness: number): number {
  return Math.round(22 - (brightness / 255) * 14);
}

export async function getTrackPalette(
  thumbnailPath: string,
): Promise<TrackPalette | null> {
  try {
    const bytes = await readFile(thumbnailPath);
    const objectUrl = URL.createObjectURL(new Blob([bytes]));
    try {
      const img = await loadImage(objectUrl);
      if (!img) return null;

      const swatches = getSwatchesSync(img);
      const accent = swatches.Vibrant?.color
        ?? swatches.Muted?.color
        ?? getColorSync(img);
      if (!accent) return null;

      const hsl = accent.hsl();
      const { r, g, b } = accent.rgb();
      const brightness = LUM_R * r + LUM_G * g + LUM_B * b;
      const sL = surfaceLightness(brightness);
      const oL = overlayLightness(brightness);

      return {
        accentTriplet: `${hsl.h} ${hsl.s}% ${Math.min(hsl.l, 55)}%`,
        mutedTriplet: `${hsl.h} ${hsl.s}% ${Math.max(hsl.l, 65)}%`,
        accentFgTriplet: brightness < 180 ? "0 0% 98%" : "240 5.9% 10%",
        themeSurface: `hsl(${hsl.h} ${hsl.s}% ${sL}% / 0.6)`,
        themeOverlay: `hsl(${hsl.h} ${hsl.s}% ${oL}% / 0.8)`,
        overlayOpacity: Math.round((0.3 + (brightness / 255) * 0.45) * 1000) / 1000,
        brightness: Math.round(brightness),
      };
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch {
    return null;
  }
}
