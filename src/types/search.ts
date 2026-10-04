export interface SearchResult {
  title: string;
  artist: string | null;
  duration: number | null;
  thumbnailUrl: string | null;
  sourceSite: string;
  sourceUrl: string;
  hasVideo: boolean;
}
