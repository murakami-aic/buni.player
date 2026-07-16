import type { LastfmArtistDisplay } from "../types/lastfm";

interface LastfmImage {
  "#text": string;
  size: string;
}

interface LastfmTag {
  name: string;
  url: string;
}

interface LastfmSimilarArtist {
  name: string;
  url: string;
}

interface LastfmArtistResponse {
  artist?: {
    name: string;
    url: string;
    image?: LastfmImage[];
    tags?: { tag: LastfmTag[] };
    similar?: { artist: LastfmSimilarArtist[] };
    bio?: { summary: string };
  };
}

function stripHtml(html: string): string {
  return html
    .replace(/<a\b[^>]*>.*?<\/a>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function bestImage(images: LastfmImage[]): string | null {
  for (const size of ["extralarge", "large", "medium"]) {
    const img = images.find((i) => i.size === size);
    if (img?.["#text"]) return img["#text"];
  }
  return null;
}

export async function fetchArtistInfo(
  apiKey: string,
  artist: string,
  lang: string,
): Promise<LastfmArtistDisplay | null> {
  if (!apiKey || !artist) return null;
  try {
    const encoded = encodeURIComponent(artist);
    const url = `https://ws.audioscrobbler.com/2.0/?method=artist.getInfo&artist=${encoded}&api_key=${apiKey}&format=json&autocorrect=1&lang=${lang}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data: LastfmArtistResponse = await res.json();
    if (!data.artist) return null;

    const imageUrl = bestImage(data.artist.image || []);
    console.log("[lastfm] artist.getInfo images:", JSON.stringify(data.artist.image?.map(i => i.size + ":" + i["#text"]?.slice(0, 60))));
    console.log("[lastfm] artist.getInfo bestImage:", imageUrl?.slice(0, 80));
    const bio = data.artist.bio?.summary
      ? stripHtml(data.artist.bio.summary)
          .replace(/read\s+more\s+on\s+last\.fm\s*$/i, "")
          .trim()
      : "";
    const tags = (data.artist.tags?.tag || []).map((t) => t.name);
    const similar = (data.artist.similar?.artist || [])
      .slice(0, 5)
      .map((a) => ({ name: a.name, url: a.url }));

    return { name: data.artist.name, bio, imageUrl, url: data.artist.url, tags, similar };
  } catch {
    return null;
  }
}
