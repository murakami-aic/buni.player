import { useState, useEffect } from "react";
import { getTrackPalette, type TrackPalette } from "../utils/image";

const cache = new Map<string, TrackPalette>();

export function useTrackPalette(
  thumbnailPath: string | null | undefined,
): TrackPalette | null {
  const [palette, setPalette] = useState<TrackPalette | null>(null);

  useEffect(() => {
    if (!thumbnailPath) {
      setPalette(null);
      return;
    }

    const cached = cache.get(thumbnailPath);
    if (cached) {
      setPalette(cached);
      return;
    }

    let stale = false;
    getTrackPalette(thumbnailPath).then((p) => {
      if (stale || !p) return;
      cache.set(thumbnailPath, p);
      setPalette(p);
    });

    return () => {
      stale = true;
    };
  }, [thumbnailPath]);

  return palette;
}
