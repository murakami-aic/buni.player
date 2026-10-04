use crate::models::lastfm::{
    self, LastfmAlbumInfoResponse, LastfmArtistInfoResponse, LastfmSearchResponse,
    LastfmTrackInfoResponse,
};
use crate::models::track::Track;
use crate::services::database::{self, EnrichedData};
use crate::services::i18n;
use regex::Regex;
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::OnceLock;
use std::time::Duration;
use tauri::AppHandle;
use tauri::Manager;
use tauri_plugin_store::StoreExt;

static LAST_API_CALL: AtomicI64 = AtomicI64::new(0);

fn re_parens() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\s*\([^)]*\)").unwrap())
}

fn re_brackets() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\s*\[[^\]]*\]").unwrap())
}

fn re_feat() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?i)\s+(?:feat\.?|ft\.?|featuring)\s+[^()\[\]]+$").unwrap())
}

fn re_version_noise() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"(?i)\s+(?:slowed(?:\s*\+\s*reverb)?|reverb|sped\s*up|speed(?:ed)?\s*up|nightcore|remastered?)$").unwrap()
    })
}

fn re_spaces() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\s{2,}").unwrap())
}

fn re_artist_topic() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?i)\s*-\s*topic\s*$").unwrap())
}

fn re_artist_vevo() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?i)\s*vevo\s*$").unwrap())
}

fn re_artist_official() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?i)\s*official\s*$").unwrap())
}

fn cleanup_title(raw: &str) -> String {
    let mut t = raw.to_string();
    t = re_brackets().replace_all(&t, "").to_string();
    t = re_parens().replace_all(&t, "").to_string();
    t = re_feat().replace(&t, "").to_string();
    t = re_version_noise().replace(&t, "").to_string();
    t = re_spaces().replace_all(&t, " ").trim().to_string();
    t
}

fn cleanup_artist(raw: &str) -> String {
    let mut a = raw.to_string();
    a = re_artist_topic().replace(&a, "").to_string();
    a = re_artist_vevo().replace(&a, "").to_string();
    a = re_artist_official().replace(&a, "").to_string();
    a = re_spaces().replace_all(&a, " ").trim().to_string();
    a
}

fn strip_artist_prefix(title: &str, artist: &str) -> String {
    if artist.is_empty() || artist.len() >= title.len() {
        return title.to_string();
    }
    let title_lower = title.to_lowercase();
    let artist_lower = artist.to_lowercase();
    let artist_end = artist.len();
    if title_lower.starts_with(&artist_lower) {
        let after = &title[artist_end..];
        let separators = [" - ", " – ", " — ", ": ", ", "];
        for sep in &separators {
            if let Some(rest) = after.strip_prefix(sep) {
                return rest.trim().to_string();
            }
        }
    }
    title.to_string()
}

async fn rate_limit() {
    let last = LAST_API_CALL.load(Ordering::Acquire);
    let now = chrono::Utc::now().timestamp_millis();
    let elapsed = now - last;
    let min_interval = 200;
    if elapsed < min_interval {
        tokio::time::sleep(Duration::from_millis((min_interval - elapsed) as u64)).await;
    }
    LAST_API_CALL.store(chrono::Utc::now().timestamp_millis(), Ordering::Release);
}

fn api_key(app: &AppHandle) -> Result<String, String> {
    app.store("settings.json")
        .map_err(|e| e.to_string())?
        .get("lastfmApiKey")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .filter(|s| !s.is_empty())
        .ok_or_else(|| i18n::t("error.lastfm.no_api_key"))
}

async fn call_api(
    app: &AppHandle,
    method: &str,
    params: &[(&str, &str)],
) -> Result<String, String> {
    let key = api_key(app)?;

    let cache_key_parts: Vec<String> = std::iter::once(method.to_string())
        .chain(params.iter().map(|(k, v)| format!("{}={}", k, v)))
        .collect();
    let cache_key = cache_key_parts.join("|");

    if let Ok(Some(cached)) = database::get_lastfm_cache(app, &cache_key) {
        return Ok(cached);
    }

    rate_limit().await;

    let url = format!(
        "https://ws.audioscrobbler.com/2.0/?method={}&api_key={}&format=json&autocorrect=1",
        method, key
    );
    let url = params.iter().fold(url, |acc, (k, v)| {
        format!("{}&{}={}", acc, k, urlencoding(v))
    });
    let url_display = url.clone();

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| {
            eprintln!("[lastfm] failed to build client: {e}");
            format!("Last.fm: client error: {e}")
        })?;

    let response = client.get(&url).send().await.map_err(|e| {
        eprintln!("[lastfm] request failed: {e} | url={url_display}");
        format!("Last.fm: request error: {e}")
    })?;

    let status = response.status();
    let text = response.text().await.map_err(|e| {
        eprintln!("[lastfm] read body failed: {e}");
        format!("Last.fm: read error: {e}")
    })?;

    if !status.is_success() {
        eprintln!("[lastfm] HTTP {status}: {text}");
        return Err(format!("Last.fm: HTTP {status}"));
    }

    if text.contains("\"error\"") {
        let detail = text
            .split("\"message\":\"")
            .nth(1)
            .and_then(|s| s.split('"').next())
            .unwrap_or("unknown error");
        eprintln!("[lastfm] API error: {detail} | url={url_display}");
        return Err(format!("Last.fm: {}", detail));
    }

    let _ = database::set_lastfm_cache(app, &cache_key, &text);
    Ok(text)
}

fn urlencoding(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                result.push(b as char);
            }
            _ => {
                result.push_str(&format!("%{:02X}", b));
            }
        }
    }
    result
}

pub async fn search_track(
    app: &AppHandle,
    track: &str,
    artist: &str,
) -> Result<Option<lastfm::LastfmSearchTrack>, String> {
    let resp = call_api(
        app,
        "track.search",
        &[("track", track), ("artist", artist), ("limit", "1")],
    )
    .await?;

    let parsed: LastfmSearchResponse =
        serde_json::from_str(&resp).map_err(|_| i18n::t("error.lastfm.api_error"))?;
    Ok(parsed.results.trackmatches.track.into_iter().next())
}

async fn search_track_robust(
    app: &AppHandle,
    raw_title: &str,
    raw_artist: &str,
) -> Option<lastfm::LastfmSearchTrack> {
    let clean_title = cleanup_title(raw_title);
    let clean_artist = cleanup_artist(raw_artist);
    let search_title = strip_artist_prefix(&clean_title, &clean_artist);

    eprintln!("[lastfm] search input:  title=\"{raw_title}\"  artist=\"{raw_artist}\"");
    eprintln!("[lastfm] search cleaned: title=\"{clean_title}\"  artist=\"{clean_artist}\"");
    if search_title != clean_title {
        eprintln!("[lastfm] search stripped: \"{search_title}\" (was \"{clean_title}\")");
    }

    if !clean_title.is_empty() && !clean_artist.is_empty() {
        match search_track(app, &search_title, &clean_artist).await {
            Ok(Some(result)) => {
                eprintln!(
                    "[lastfm] attempt OK: \"{}\" by \"{}\"",
                    result.name, result.artist
                );
                return Some(result);
            }
            Ok(None) => eprintln!("[lastfm] no match for \"{search_title}\" + \"{clean_artist}\""),
            Err(e) => eprintln!("[lastfm] search ERROR: {e}"),
        }
    } else {
        eprintln!("[lastfm] SKIP: empty title or artist");
    }

    eprintln!("[lastfm] search_track_robust: failed");
    None
}

pub async fn get_track_info(
    app: &AppHandle,
    artist: &str,
    track: &str,
    mbid: Option<&str>,
) -> Result<Option<lastfm::LastfmTrackInfo>, String> {
    let mut params = vec![("artist", artist), ("track", track)];
    let mbid_val;
    if let Some(m) = mbid {
        if !m.is_empty() {
            mbid_val = m.to_string();
            params.push(("mbid", &mbid_val));
        }
    }

    let resp = call_api(app, "track.getInfo", &params).await?;
    let parsed: LastfmTrackInfoResponse =
        serde_json::from_str(&resp).map_err(|_| i18n::t("error.lastfm.api_error"))?;
    Ok(Some(parsed.track))
}

pub async fn get_artist_info(
    app: &AppHandle,
    artist: &str,
    mbid: Option<&str>,
) -> Result<Option<lastfm::LastfmArtistInfo>, String> {
    let mut params = vec![("artist", artist)];
    let mbid_val;
    if let Some(m) = mbid {
        if !m.is_empty() {
            mbid_val = m.to_string();
            params.push(("mbid", &mbid_val));
        }
    }

    let resp = call_api(app, "artist.getInfo", &params).await?;
    let parsed: LastfmArtistInfoResponse =
        serde_json::from_str(&resp).map_err(|_| i18n::t("error.lastfm.api_error"))?;
    Ok(Some(parsed.artist))
}

pub async fn get_album_info(
    app: &AppHandle,
    artist: &str,
    album: &str,
    mbid: Option<&str>,
) -> Result<Option<lastfm::LastfmAlbumInfo>, String> {
    let mut params = vec![("artist", artist), ("album", album)];
    let mbid_val;
    if let Some(m) = mbid {
        if !m.is_empty() {
            mbid_val = m.to_string();
            params.push(("mbid", &mbid_val));
        }
    }

    let resp = call_api(app, "album.getInfo", &params).await?;
    let parsed: LastfmAlbumInfoResponse =
        serde_json::from_str(&resp).map_err(|_| i18n::t("error.lastfm.api_error"))?;
    Ok(Some(parsed.album))
}

pub async fn enrich_metadata(
    app: &AppHandle,
    track_id: i64,
    title: &str,
    artist: &str,
) -> Result<EnrichedData, String> {
    let _ = api_key(app)?;
    eprintln!(
        "[lastfm] enrich_metadata: track_id={track_id} title=\"{title}\" artist=\"{artist}\""
    );

    let search = search_track_robust(app, title, artist)
        .await
        .ok_or_else(|| i18n::t("error.lastfm.not_found"))?;

    eprintln!(
        "[lastfm] search result: \"{}\" by \"{}\"",
        search.name, search.artist
    );

    let track_info = get_track_info(app, &search.artist, &search.name, None).await?;
    let track_data = match &track_info {
        Some(t) => t,
        None => return Err(i18n::t("error.lastfm.not_found")),
    };

    let corrected_title = track_data.name.clone();
    let corrected_artist = track_data.artist.name.clone();
    let album = track_data.album.as_ref().map(|a| a.title.clone());
    let album_artist = track_data.album.as_ref().map(|a| a.artist.clone());
    let duration = track_data
        .duration
        .as_deref()
        .and_then(|s| s.parse::<i64>().ok())
        .map(|ms| ms / 1000);

    eprintln!("[lastfm] corrected: title=\"{corrected_title}\" artist=\"{corrected_artist}\" album={album:?}");

    let lastfm_url = track_data.url.clone();
    let lastfm_id = track_data.mbid.clone().filter(|s| !s.is_empty());

    let mut tags: Vec<String> = vec![];
    if let Some(toptags) = &track_data.toptags {
        for tag in toptags.tag.iter().take(8) {
            if !tags.contains(&tag.name) {
                tags.push(tag.name.clone());
            }
        }
    }

    match get_artist_info(app, &corrected_artist, None).await {
        Ok(Some(artist_data)) => {
            if let Some(artist_tags) = &artist_data.tags {
                for tag in artist_tags.tag.iter().take(5) {
                    if !tags.contains(&tag.name) {
                        tags.push(tag.name.clone());
                    }
                }
            }
        }
        Ok(None) => {}
        Err(e) => eprintln!("[lastfm] artist.getInfo failed: {e}"),
    }

    let mut image_url: Option<String> = None;
    if let Some(album_title) = &album {
        match get_album_info(app, &corrected_artist, album_title, None).await {
            Ok(Some(album_data)) => {
                eprintln!("[lastfm] album.getInfo OK: \"{album_title}\"");
                if let Some(ref images) = album_data.image {
                    image_url = lastfm::best_image(images).map(|s| s.to_string());
                }
                if let Some(album_tags) = &album_data.tags {
                    for tag in album_tags.tag.iter().take(3) {
                        if !tags.contains(&tag.name) {
                            tags.push(tag.name.clone());
                        }
                    }
                }
            }
            Ok(None) => eprintln!("[lastfm] album.getInfo: no match for \"{album_title}\""),
            Err(e) => eprintln!("[lastfm] album.getInfo failed: {e}"),
        }
    }

    if image_url.is_none() {
        if let Some(ref images) = track_data.album.as_ref().and_then(|a| a.image.as_ref()) {
            image_url = lastfm::best_image(images).map(|s| s.to_string());
        }
    }

    if image_url.is_some() {
        if let Ok(app_data_dir) = app.path().app_data_dir() {
            let thumb_dir = app_data_dir.join("thumbnails");
            let _ = std::fs::create_dir_all(&thumb_dir);
            let ext = image_url
                .as_deref()
                .and_then(|u| u.split('?').next())
                .and_then(|u| u.rsplit('.').next())
                .unwrap_or("jpg");
            let clean_ext = sanitize_filename::sanitize(ext);
            let path = thumb_dir.join(format!("{}.{}", track_id, clean_ext));

            if let Some(url) = &image_url {
                if let Ok(response) = reqwest::get(url).await {
                    if let Ok(bytes) = response.bytes().await {
                        let _ = tokio::fs::write(&path, bytes).await;
                    }
                }
            }

            if path.exists() {
                if let Some(path_str) = path.to_str() {
                    if let Ok(_) = database::update_track_thumbnail(app, track_id, path_str) {}
                }
            }
        }
    }

    let genre_tags = if tags.is_empty() { None } else { Some(tags) };

    Ok(EnrichedData {
        title: corrected_title,
        artist: corrected_artist,
        album,
        album_artist,
        genre_tags,
        lastfm_url,
        lastfm_id,
        duration,
    })
}

pub async fn enrich_track(app: &AppHandle, track: &Track) -> Result<EnrichedData, String> {
    enrich_metadata(
        app,
        track.id,
        &track.title,
        track.artist.as_deref().unwrap_or(""),
    )
    .await
}
