use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Playlist {
    pub id: i64,
    pub name: String,
    pub image: Option<String>,
    #[serde(rename = "trackCount")]
    pub track_count: i64,
    pub created_at: i64,
}
