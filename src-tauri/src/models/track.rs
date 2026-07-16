use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Track {
    pub id: i64,
    pub title: String,
    pub artist: Option<String>,
    pub album: Option<String>,
    #[serde(rename = "albumArtist")]
    pub album_artist: Option<String>,
    pub duration: Option<i64>,
    #[serde(rename = "genreTags")]
    pub genre_tags: Option<Vec<String>>,
    pub thumbnail: Option<String>,
    #[serde(rename = "sourceUrl")]
    pub source_url: String,
    #[serde(rename = "sourceSite")]
    pub source_site: String,
    #[serde(rename = "streamUrl")]
    pub stream_url: Option<String>,
    #[serde(rename = "streamUrlTs")]
    pub stream_url_ts: Option<i64>,
    #[serde(rename = "filePath")]
    pub file_path: Option<String>,
    pub mode: String,
    #[serde(rename = "playCount")]
    pub play_count: i64,
    #[serde(rename = "lastPlayed")]
    pub last_played: Option<i64>,
    #[serde(rename = "lastfmUrl")]
    pub lastfm_url: Option<String>,
    #[serde(rename = "lastfmId")]
    pub lastfm_id: Option<String>,
    #[serde(rename = "musicbrainzId")]
    pub musicbrainz_id: Option<String>,
    pub has_video: bool,
    #[serde(rename = "createdAt")]
    pub created_at: i64,
    #[serde(rename = "updatedAt")]
    pub updated_at: i64,
}
