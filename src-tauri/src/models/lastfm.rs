#![allow(dead_code)]

use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Serialize)]
pub struct LastfmImage {
    #[serde(rename = "#text")]
    pub url: String,
    pub size: String,
}

#[derive(Debug, Deserialize)]
pub struct LastfmTag {
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub struct LastfmWiki {
    pub summary: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct LastfmAlbum {
    pub title: String,
    pub artist: String,
    pub mbid: Option<String>,
    pub url: Option<String>,
    pub image: Option<Vec<LastfmImage>>,
}

#[derive(Debug, Deserialize)]
pub struct LastfmTrackArtist {
    pub name: String,
    pub mbid: Option<String>,
    pub url: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct LastfmToptags {
    pub tag: Vec<LastfmTag>,
}

// ── track.search ──

#[derive(Debug, Deserialize, Serialize)]
pub struct LastfmSearchTrack {
    pub name: String,
    pub artist: String,
    pub url: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct LastfmTrackmatches {
    pub track: Vec<LastfmSearchTrack>,
}

#[derive(Debug, Deserialize)]
pub struct LastfmSearchResults {
    pub trackmatches: LastfmTrackmatches,
}

#[derive(Debug, Deserialize)]
pub struct LastfmSearchResponse {
    pub results: LastfmSearchResults,
}

// ── track.getInfo ──

#[derive(Debug, Deserialize)]
pub struct LastfmTrackInfo {
    pub name: String,
    pub mbid: Option<String>,
    pub url: Option<String>,
    pub duration: Option<String>,
    pub artist: LastfmTrackArtist,
    pub album: Option<LastfmAlbum>,
    pub toptags: Option<LastfmToptags>,
    pub wiki: Option<LastfmWiki>,
}

#[derive(Debug, Deserialize)]
pub struct LastfmTrackInfoResponse {
    pub track: LastfmTrackInfo,
}

// ── artist.getInfo ──

#[derive(Debug, Deserialize)]
pub struct LastfmArtistTags {
    pub tag: Vec<LastfmTag>,
}

#[derive(Debug, Deserialize)]
pub struct LastfmArtistBio {
    pub summary: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct LastfmArtistInfo {
    pub name: String,
    pub mbid: Option<String>,
    pub url: Option<String>,
    pub image: Option<Vec<LastfmImage>>,
    pub tags: Option<LastfmArtistTags>,
    pub bio: Option<LastfmArtistBio>,
}

#[derive(Debug, Deserialize)]
pub struct LastfmArtistInfoResponse {
    pub artist: LastfmArtistInfo,
}

// ── album.getInfo ──

#[derive(Debug, Deserialize)]
pub struct LastfmAlbumTags {
    pub tag: Vec<LastfmTag>,
}

#[derive(Debug, Deserialize)]
pub struct LastfmAlbumInfo {
    pub name: String,
    pub artist: String,
    pub mbid: Option<String>,
    pub url: Option<String>,
    pub image: Option<Vec<LastfmImage>>,
    pub tags: Option<LastfmAlbumTags>,
}

#[derive(Debug, Deserialize)]
pub struct LastfmAlbumInfoResponse {
    pub album: LastfmAlbumInfo,
}

// ── helpers ──

pub fn best_image(images: &[LastfmImage]) -> Option<&str> {
    for size in &["extralarge", "large", "medium", "small"] {
        if let Some(img) = images.iter().find(|i| i.size == *size) {
            if !img.url.is_empty() {
                return Some(&img.url);
            }
        }
    }
    None
}
