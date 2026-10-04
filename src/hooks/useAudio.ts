import { useEffect, useRef } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { invokeGetStreamUrl, invokeInvalidateStreamUrl, invokeTrackStarted, invokeDeleteLocalFile, invokeUpdateTrack } from "../services/tauri";
import { usePlayerStore } from "../stores/playerStore";
import { useLibraryStore } from "../stores/libraryStore";
import { useSettingsStore } from "../stores/settingsStore";
import { useToastStore } from "../stores/toastStore";
import { errorMessage } from "../utils/error";

export function useAudio() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hasStartedRef = useRef(false);
  const accumulatedRef = useRef(0);
  const lastTimeRef = useRef(0);
  const retryRef = useRef(false);
  const preloadedUrlsRef = useRef<Map<number, string>>(new Map());

  const currentTrack = usePlayerStore((state) => state.currentTrack);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const volume = usePlayerStore((state) => state.volume);
  const setCurrentTime = usePlayerStore((state) => state.seek);
  const next = usePlayerStore((state) => state.next);

  const isPlayingRef = useRef(isPlaying);
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;

    const handleTimeUpdate = () => {
      const now = audio.currentTime;
      setCurrentTime(now);

      const delta = now - lastTimeRef.current;
      if (delta > 0 && delta < 2) {
        accumulatedRef.current += delta;
      }
      lastTimeRef.current = now;

      if (!hasStartedRef.current && accumulatedRef.current >= 30) {
        hasStartedRef.current = true;
        const trackId = usePlayerStore.getState().currentTrack?.id;
        if (trackId) invokeTrackStarted(trackId).catch(() => {});
      }
    };
    const handleDurationChange = () => {
      const dur = Math.round(audio.duration || 0);
      if (dur > 0) {
        const track = usePlayerStore.getState().currentTrack;
        if (track && !track.duration) {
          invokeUpdateTrack(
            track.id,
            track.title,
            track.artist ?? undefined,
            track.album ?? undefined,
            dur,
          )
            .then((updated) => {
              useLibraryStore.getState().applyTrackUpdated(updated);
              usePlayerStore.setState({ currentTrack: updated });
            })
            .catch(() => {});
        }
      }
    };
    const handleEnded = () => {
      if (!hasStartedRef.current) {
        hasStartedRef.current = true;
        const trackId = usePlayerStore.getState().currentTrack?.id;
        if (trackId) invokeTrackStarted(trackId).catch(() => {});
      }
      hasStartedRef.current = false;
      accumulatedRef.current = 0;
      lastTimeRef.current = 0;
      if (usePlayerStore.getState().repeatMode === "one") {
        audio.currentTime = 0;
        audio.play().catch((err) => console.error("Replay failed:", err));
        usePlayerStore.getState().seek(0);
      } else {
        next();
      }
    };
    const handleError = async () => {
      console.error("Audio error", audio.error);
      const track = usePlayerStore.getState().currentTrack;
      if (!track) { next(); return; }

      if (track.mode === "local") {
        useLibraryStore.getState().markAsStreaming(track.id);
        invokeDeleteLocalFile(track.id).catch(() => {});

        invokeGetStreamUrl(track.id)
          .then(url => {
            audio.src = url;
            audio.load();
            audio.play().catch(() => next());
          })
          .catch(() => next());
        return;
      }

      if (track.mode === "streaming" && !retryRef.current) {
        retryRef.current = true;

        if (!navigator.onLine) {
          const msg = useSettingsStore.getState().lang === "en"
            ? "Not available."
            : "No disponible.";
          useToastStore.getState().addToast("error", msg);
          next();
          return;
        }

        preloadedUrlsRef.current.delete(track.id);
        await invokeInvalidateStreamUrl(track.id).catch(() => {});
        invokeGetStreamUrl(track.id)
          .then(url => {
            audio.src = url;
            audio.load();
            audio.play()
              .then(() => { retryRef.current = false; })
              .catch(() => next());
          })
          .catch(() => next());
        return;
      }

      const msg = useSettingsStore.getState().lang === "en"
        ? "Error playing audio."
        : "Error al reproducir el audio.";
      useToastStore.getState().addToast("error", msg);
      next();
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("durationchange", handleDurationChange);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("durationchange", handleDurationChange);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
      audio.pause();
      audioRef.current = null;
    };
  }, [setCurrentTime, next]);

  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.volume = volume;
  }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;

    audio.pause();

    let cancelled = false;
    retryRef.current = false;
    hasStartedRef.current = false;
    accumulatedRef.current = 0;
    lastTimeRef.current = 0;

    const loadSource = async () => {
      try {
        let src: string;
        if (currentTrack.mode === "local" && currentTrack.filePath) {
          src = convertFileSrc(currentTrack.filePath);
        } else {
          const cached = preloadedUrlsRef.current.get(currentTrack.id);
          if (cached) {
            src = cached;
            preloadedUrlsRef.current.delete(currentTrack.id);
          } else {
            src = await invokeGetStreamUrl(currentTrack.id);
          }
        }
        if (cancelled) return;
        audio.src = src;
        audio.load();
        if (isPlayingRef.current) {
          audio.play().catch((err) => console.error("Play failed:", err));
        }
        if (!cancelled) {
          preloadWindow();
        }
      } catch (err) {
        console.error("Failed to load audio source:", err);
        if (!cancelled) {
          const msg = !navigator.onLine
            ? (useSettingsStore.getState().lang === "en"
                ? "Not available."
                : "No disponible.")
            : errorMessage(err, "Error al cargar audio.");
          if (msg) useToastStore.getState().addToast("error", msg);
          next();
        }
      }
    };

    const preloadWindow = async () => {
      const PRELOAD_BEHIND = 1;
      const PRELOAD_AHEAD = 3;

      const { queue, queueIndex } = usePlayerStore.getState();
      const start = Math.max(0, queueIndex - PRELOAD_BEHIND);
      const end = Math.min(queue.length, queueIndex + PRELOAD_AHEAD + 1);

      const windowIds = new Set(queue.slice(start, end).map((t) => t.id));

      for (const id of preloadedUrlsRef.current.keys()) {
        if (!windowIds.has(id)) {
          preloadedUrlsRef.current.delete(id);
        }
      }

      const toPreload = queue
        .slice(start, end)
        .filter(
          (t) =>
            t.id !== currentTrack.id &&
            t.mode === "streaming" &&
            !preloadedUrlsRef.current.has(t.id),
        )
        .sort((a, b) => {
          const ia = queue.findIndex((t) => t.id === a.id);
          const ib = queue.findIndex((t) => t.id === b.id);
          return Math.abs(ia - queueIndex) - Math.abs(ib - queueIndex);
        });

      for (const track of toPreload) {
        if (cancelled) break;
        try {
          const url = await invokeGetStreamUrl(track.id);
          if (cancelled) break;
          preloadedUrlsRef.current.set(track.id, url);
        } catch {
          // ignore preload failures
        }
      }
    };

    loadSource();

    return () => {
      cancelled = true;
    };
  }, [currentTrack]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.play().catch((err) => console.error("Play failed:", err));
    } else {
      audio.pause();
    }
  }, [isPlaying]);

  return audioRef;
}
