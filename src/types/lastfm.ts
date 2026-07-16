export interface LastfmSearchResult {
  name: string;
  artist: string;
  url: string | null;
}

export interface LastfmTrack {
  name: string;
  artist: string;
  album: string | null;
  duration: number | null;
  url: string;
  mbid: string | null;
  tags: string[];
  thumbnail: string | null;
}

export interface LastfmArtistDisplay {
  name: string;
  bio: string;
  imageUrl: string | null;
  url: string;
  tags: string[];
  similar: { name: string; url: string }[];
}
