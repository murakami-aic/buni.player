import { create } from "zustand";
import type { Track } from "../types/track";
import type { LastfmArtistDisplay } from "../types/lastfm";
import { invokeGetSetting, invokeSetSetting } from "../services/tauri";

export type RepeatMode = "none" | "all" | "one";

interface QueueSnapshot {
  trackIds: number[];
  queueIndex: number;
  repeatMode: RepeatMode;
  shuffle: boolean;
  queuePlaylistId: number;
}

async function persistQueue(state: PlayerState) {
  const snapshot: QueueSnapshot = {
    trackIds: state.queue.map((t) => t.id),
    queueIndex: state.queueIndex,
    repeatMode: state.repeatMode,
    shuffle: state.shuffle,
    queuePlaylistId: state.queuePlaylistId,
  };
  try {
    await invokeSetSetting("queue_state", JSON.stringify(snapshot));
  } catch {
    // non-critical
  }
}

interface PlayerState {
  currentTrack: Track | null;
  isPlaying: boolean;
  currentTime: number;
  volume: number;
  queue: Track[];
  queueIndex: number;
  queuePlaylistId: number;
  repeatMode: RepeatMode;
  shuffle: boolean;
  artistInfo: LastfmArtistDisplay | null;

  play: (track: Track) => void;
  pause: () => void;
  resume: () => void;
  seek: (time: number) => void;
  setVolume: (volume: number) => void;
  next: () => void;
  previous: () => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  shuffleQueue: () => void;
  unshuffleQueue: () => void;
  setQueue: (tracks: Track[], startIndex?: number) => void;
  addToQueue: (track: Track) => void;
  removeFromQueue: (index: number) => void;
  clearQueue: () => void;
  moveInQueue: (fromIndex: number, toIndex: number) => void;
  playIndex: (index: number) => void;
  loadQueue: (libraryTracks: Track[]) => Promise<void>;
  setQueuePlaylistId: (id: number) => void;
  setCurrentTrack: (track: Track) => void;
  setArtistInfo: (info: LastfmArtistDisplay | null) => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentTrack: null,
  isPlaying: false,
  currentTime: 0,
  volume: 1,
  queue: [],
  queueIndex: 0,
  queuePlaylistId: 0,
  repeatMode: "none",
  shuffle: false,
  artistInfo: null,

  play: (track) => {
    const { queue } = get();
    const index = queue.findIndex((t) => t.id === track.id);
    set({
      currentTrack: track,
      isPlaying: true,
      currentTime: 0,
      queueIndex: index >= 0 ? index : queue.length,
      artistInfo: null,
    });
    // TODO: load audio source via audio service
  },

  pause: () => set({ isPlaying: false }),
  resume: () => set({ isPlaying: true }),

  seek: (time) => set({ currentTime: time }),
  setVolume: (volume) => set({ volume: Math.max(0, Math.min(1, volume)) }),

  next: () => {
    const { queue, queueIndex, repeatMode } = get();
    if (queue.length === 0) return;

    if (repeatMode === "none") {
      const nextIndex = queueIndex + 1;
      if (nextIndex >= queue.length) {
        set({ currentTrack: null, isPlaying: false });
        return;
      }
      set({ queueIndex: nextIndex, currentTrack: queue[nextIndex], currentTime: 0, isPlaying: true });
      return;
    }

    const nextIndex = queueIndex + 1;
    if (nextIndex >= queue.length) {
      set({ queueIndex: 0, currentTrack: queue[0], currentTime: 0, isPlaying: true });
      return;
    }
    set({ currentTrack: queue[nextIndex], queueIndex: nextIndex, currentTime: 0, isPlaying: true });
  },

  previous: () => {
    const { queue, queueIndex, repeatMode } = get();
    if (queue.length === 0) return;

    let prevIndex = queueIndex - 1;
    if (prevIndex < 0) {
      if (repeatMode === "all") prevIndex = queue.length - 1;
      else return;
    }

    set({ currentTrack: queue[prevIndex], queueIndex: prevIndex, currentTime: 0, isPlaying: true });
  },

  toggleShuffle: () => set((state) => ({ shuffle: !state.shuffle })),

  toggleRepeat: () =>
    set((state) => {
      const modes: RepeatMode[] = ["none", "all", "one"];
      const nextIndex = (modes.indexOf(state.repeatMode) + 1) % modes.length;
      return { repeatMode: modes[nextIndex] };
    }),

  shuffleQueue: () => {
    const { queue, queueIndex } = get();
    if (queue.length <= 1) return;
    const current = queue[queueIndex];
    const rest = queue.filter((_, i) => i !== queueIndex);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    set({ queue: [current, ...rest], queueIndex: 0 });
  },

  unshuffleQueue: () => {
    const { queue, queueIndex } = get();
    if (queue.length <= 1) return;
    const current = queue[queueIndex];
    const rest = queue.filter((_, i) => i !== queueIndex);
    rest.sort((a, b) => b.createdAt - a.createdAt);
    set({ queue: [current, ...rest], queueIndex: 0 });
  },

  setQueue: (tracks, startIndex = 0) => {
    const state = get();
    let queue = tracks;
    let qi = startIndex;
    if (state.shuffle && tracks.length > 1) {
      const start = tracks[startIndex];
      const rest = tracks.filter((_, i) => i !== startIndex);
      for (let i = rest.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rest[i], rest[j]] = [rest[j], rest[i]];
      }
      queue = [start, ...rest];
      qi = 0;
    }
    set({ queue, queueIndex: qi, currentTrack: queue[qi] ?? null, isPlaying: true, currentTime: 0 });
  },

  addToQueue: (track) => set((state) => ({ queue: [...state.queue, track] })),

  removeFromQueue: (index) => {
    set((state) => {
      if (index < 0 || index >= state.queue.length) return state;
      const queue = [...state.queue];
      queue.splice(index, 1);
      let { queueIndex, currentTrack, isPlaying } = state;

      if (index < queueIndex) {
        queueIndex = queueIndex - 1;
      } else if (index === queueIndex) {
        if (queue.length === 0) {
          currentTrack = null;
          isPlaying = false;
          queueIndex = 0;
        } else if (queueIndex >= queue.length) {
          queueIndex = queue.length - 1;
          currentTrack = queue[queueIndex];
        } else {
          currentTrack = queue[queueIndex];
        }
      }

      return { queue, queueIndex, currentTrack, isPlaying };
    });
  },

  clearQueue: () => {
    set({ queue: [], queueIndex: 0, currentTrack: null, isPlaying: false });
  },

  moveInQueue: (fromIndex, toIndex) => {
    set((state) => {
      if (fromIndex === toIndex) return state;
      if (fromIndex < 0 || fromIndex >= state.queue.length) return state;
      if (toIndex < 0 || toIndex >= state.queue.length) return state;

      const queue = [...state.queue];
      const [item] = queue.splice(fromIndex, 1);
      const adjustedToIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
      queue.splice(adjustedToIndex, 0, item);

      let { queueIndex } = state;
      if (fromIndex === queueIndex) {
        queueIndex = adjustedToIndex;
      } else {
        const trackId = state.queue[state.queueIndex]?.id;
        if (trackId) {
          queueIndex = queue.findIndex((t) => t.id === trackId);
        }
      }

      return { queue, queueIndex };
    });
  },

  playIndex: (index) => {
    const { queue } = get();
    if (index < 0 || index >= queue.length) return;
    set({
      queueIndex: index,
      currentTrack: queue[index],
      isPlaying: true,
      currentTime: 0,
    });
  },

  loadQueue: async (libraryTracks: Track[]) => {
    try {
      const raw = await invokeGetSetting("queue_state");
      if (!raw) return;
      const snapshot: QueueSnapshot = JSON.parse(raw);
      const idMap = new Map(libraryTracks.map((t) => [t.id, t]));
      const queue = snapshot.trackIds
        .map((id) => idMap.get(id))
        .filter((t): t is Track => t !== undefined);
      if (queue.length === 0) return;
      const safeIndex = Math.min(snapshot.queueIndex, queue.length - 1);
      set({
        queue,
        queueIndex: safeIndex,
        currentTrack: queue[safeIndex] ?? null,
        repeatMode: snapshot.repeatMode,
        shuffle: snapshot.shuffle,
        queuePlaylistId: snapshot.queuePlaylistId ?? 0,
        isPlaying: false,
        currentTime: 0,
      });
    } catch {
      // queue restore is non-critical
    }
  },

  setQueuePlaylistId: (id) => {
    set({ queuePlaylistId: id });
  },

  setCurrentTrack: (track) => {
    set({ currentTrack: track, artistInfo: null });
  },

  setArtistInfo: (info) => set({ artistInfo: info }),
}));

usePlayerStore.subscribe((state, prevState) => {
  if (
    state.queue !== prevState.queue ||
    state.queueIndex !== prevState.queueIndex ||
    state.repeatMode !== prevState.repeatMode ||
    state.shuffle !== prevState.shuffle ||
    state.queuePlaylistId !== prevState.queuePlaylistId
  ) {
    persistQueue(state);
  }
});
