export type TrackMode = "streaming" | "local";

export interface Track {
  id: number;
  title: string;
  artist: string | null;
  album: string | null;
  albumArtist: string | null;
  duration: number | null;
  genreTags: string[] | null;
  thumbnail: string | null;
  sourceUrl: string;
  sourceSite: string;
  streamUrl: string | null;
  streamUrlTs: number | null;
  filePath: string | null;
  mode: TrackMode;
  playCount: number;
  lastPlayed: number | null;
  lastfmUrl: string | null;
  lastfmId: string | null;
  musicbrainzId: string | null;
  hasVideo: boolean;
  createdAt: number;
  updatedAt: number;
  pending?: boolean;
}
