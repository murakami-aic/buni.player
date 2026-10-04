use reqwest::{header, Client as HttpClient, Response, Url};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, LazyLock, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::AsyncWriteExt;

const API_KEY: &str = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";
const API_BASE: &str = "https://www.youtube.com/youtubei/v1";
const PLAYER_DIAGNOSTIC_VIDEO_ID: &str = "A2VpR8HahKc";
const URL_EXPIRY_MARGIN_SECS: i64 = 20 * 60;
const DOWNLOAD_RANGE_CHUNK_BYTES: u64 = 1024 * 1024;
const YOUTUBE_REQUEST_INTERVAL: Duration = Duration::from_millis(500);

static LAST_YOUTUBE_REQUEST: LazyLock<tokio::sync::Mutex<Option<Instant>>> =
    LazyLock::new(|| tokio::sync::Mutex::new(None));

#[derive(Clone, Copy)]
struct ClientProfile {
    name: &'static str,
    version: &'static str,
    android_sdk: Option<u32>,
    user_agent: &'static str,
}

const CLIENTS: &[ClientProfile] = &[
    ClientProfile {
        name: "ANDROID",
        version: "20.10.38",
        android_sdk: Some(30),
        user_agent: "com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip",
    },
    ClientProfile {
        name: "ANDROID_VR",
        version: "1.60.19",
        android_sdk: Some(32),
        user_agent:
            "com.google.android.apps.youtube.vr.oculus/1.60.19 (Linux; U; Android 12L) gzip",
    },
    ClientProfile {
        name: "IOS",
        version: "20.10.4",
        android_sdk: None,
        user_agent: "com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X)",
    },
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoMetadata {
    pub title: String,
    pub artist: Option<String>,
    pub duration: Option<i64>,
    pub thumbnail_url: Option<String>,
    pub source_site: String,
    pub source_url: String,
    pub has_video: bool,
}

#[derive(Debug, Clone)]
pub struct Resolved {
    pub stream_url: String,
    pub duration: Option<i64>,
    pub bytes: Option<u64>,
    pub expires_at: i64,
    pub client_name: &'static str,
    pub user_agent: &'static str,
}

#[derive(Debug, Clone)]
struct ParsedSource {
    video_id: Option<String>,
    playlist_id: Option<String>,
}

struct AudioRange {
    bytes: Vec<u8>,
    total: u64,
    end: u64,
    partial: bool,
}

fn http_client() -> &'static HttpClient {
    static CLIENT: OnceLock<HttpClient> = OnceLock::new();
    CLIENT.get_or_init(HttpClient::new)
}

async fn pace_youtube_request() {
    let mut last_request = LAST_YOUTUBE_REQUEST.lock().await;
    if let Some(last_request) = *last_request {
        let wait = YOUTUBE_REQUEST_INTERVAL.saturating_sub(last_request.elapsed());
        if !wait.is_zero() {
            tokio::time::sleep(wait).await;
        }
    }
    *last_request = Some(Instant::now());
}

fn context(client: ClientProfile) -> Value {
    let mut client_context = json!({
        "clientName": client.name,
        "clientVersion": client.version,
    });

    if let Some(sdk) = client.android_sdk {
        client_context["androidSdkVersion"] = json!(sdk);
    }

    json!({ "client": client_context })
}

fn api_url(endpoint: &str) -> String {
    format!("{API_BASE}/{endpoint}?key={API_KEY}")
}

async fn post_json(endpoint: &str, client: ClientProfile, body: Value) -> Result<Value, String> {
    pace_youtube_request().await;
    let response = http_client()
        .post(api_url(endpoint))
        .header(header::USER_AGENT, client.user_agent)
        .header(header::ORIGIN, "https://www.youtube.com")
        .header(header::CONTENT_TYPE, "application/json")
        .timeout(Duration::from_secs(20))
        .json(&body)
        .send()
        .await
        .map_err(|error| format!("InnerTube request failed: {error}"))?;

    response_json(response).await
}

async fn response_json(response: Response) -> Result<Value, String> {
    let status = response.status();
    let body = match response.json::<Value>().await {
        Ok(body) => body,
        Err(error) if !status.is_success() => {
            return Err(format!(
                "InnerTube returned HTTP {status} (invalid response body: {error})"
            ));
        }
        Err(error) => return Err(format!("Invalid InnerTube response: {error}")),
    };

    if !status.is_success() {
        return Err(format!("InnerTube returned HTTP {status}"));
    }

    Ok(body)
}

fn playability_error(value: &Value) -> Option<(bool, String)> {
    let status = value.pointer("/playabilityStatus/status")?.as_str()?;
    if status == "OK" {
        return None;
    }

    let reason = value
        .pointer("/playabilityStatus/reason")
        .and_then(Value::as_str)
        .unwrap_or(status)
        .to_string();
    let lower_reason = reason.to_lowercase();
    let unavailable = ["unavailable", "removed", "private", "deleted"]
        .iter()
        .any(|term| lower_reason.contains(term));

    let try_next_client = !unavailable
        && (status == "LOGIN_REQUIRED"
            || status == "UNPLAYABLE"
            || lower_reason.contains("sign in to confirm you're not a bot"));

    Some((try_next_client, reason))
}

async fn player_response(video_id: &str) -> Result<(Value, ClientProfile), String> {
    player_response_from(video_id, 0).await
}

async fn player_response_from(
    video_id: &str,
    start_index: usize,
) -> Result<(Value, ClientProfile), String> {
    if start_index >= CLIENTS.len() {
        return Err("No untried InnerTube client remains".to_string());
    }

    let mut last_retryable_error = None;

    for client in CLIENTS.iter().skip(start_index) {
        let body = json!({
            "context": context(*client),
            "videoId": video_id,
        });
        let response = match post_json("player", *client, body).await {
            Ok(response) => response,
            Err(error) if error.starts_with("InnerTube returned HTTP 403") => {
                last_retryable_error = Some(error);
                continue;
            }
            Err(error) => return Err(error),
        };

        match playability_error(&response) {
            None => return Ok((response, *client)),
            Some((true, reason)) => last_retryable_error = Some(reason),
            Some((false, reason)) => {
                return Err(format!("YouTube: {reason}"));
            }
        }
    }

    Err(format!(
        "YouTube blocked all available clients: {}",
        last_retryable_error.unwrap_or_else(|| "unknown playback error".to_string())
    ))
}

fn parse_source(source_url: &str) -> Result<ParsedSource, String> {
    let parsed = Url::parse(source_url).map_err(|_| "Invalid YouTube URL".to_string())?;
    let host = parsed.host_str().unwrap_or_default().to_ascii_lowercase();
    let path: Vec<_> = parsed.path_segments().into_iter().flatten().collect();

    let video_id: Option<String> = if host == "youtu.be" || host.ends_with(".youtu.be") {
        path.first().map(|id| (*id).to_string())
    } else if host == "youtube.com"
        || host.ends_with(".youtube.com")
        || host == "youtube-nocookie.com"
    {
        match path.as_slice() {
            ["watch", ..] => parsed
                .query_pairs()
                .find_map(|(key, value)| (key == "v").then(|| value.into_owned())),
            ["shorts", id, ..] | ["embed", id, ..] | ["live", id, ..] => Some((*id).to_string()),
            _ => None,
        }
    } else {
        None
    }
    .filter(|id| valid_video_id(id));
    let playlist_id = parsed
        .query_pairs()
        .find_map(|(key, value)| (key == "list").then(|| value.into_owned()));

    if video_id.is_none() && playlist_id.is_none() {
        return Err("URL does not contain a valid YouTube video or playlist ID".to_string());
    }

    Ok(ParsedSource {
        video_id,
        playlist_id,
    })
}

fn valid_video_id(value: &str) -> bool {
    value.len() == 11
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
}

fn best_thumbnail(value: &Value) -> Option<String> {
    value
        .pointer("/thumbnails")
        .and_then(Value::as_array)
        .and_then(|items| items.iter().rev().find_map(|item| item.get("url")))
        .and_then(Value::as_str)
        .map(str::to_owned)
}

fn rendered_text(value: &Value) -> Option<String> {
    if let Some(text) = value.get("simpleText").and_then(Value::as_str) {
        return Some(text.to_string());
    }

    value
        .get("runs")
        .and_then(Value::as_array)
        .map(|runs| {
            runs.iter()
                .filter_map(|run| run.get("text").and_then(Value::as_str))
                .collect::<String>()
        })
        .filter(|text| !text.is_empty())
}

fn parse_duration(value: &str) -> Option<i64> {
    value.split(':').try_fold(0_i64, |total, part| {
        part.parse::<i64>()
            .ok()
            .map(|number| total.saturating_mul(60).saturating_add(number))
    })
}

fn video_url(video_id: &str) -> String {
    format!("https://www.youtube.com/watch?v={video_id}")
}

fn metadata_from_player(value: &Value, video_id: &str) -> Result<VideoMetadata, String> {
    let details = value
        .get("videoDetails")
        .ok_or_else(|| "YouTube response is missing videoDetails".to_string())?;
    let title = details
        .get("title")
        .and_then(Value::as_str)
        .filter(|title| !title.trim().is_empty())
        .unwrap_or("Unknown track")
        .to_string();
    let artist = details
        .get("author")
        .and_then(Value::as_str)
        .filter(|artist| !artist.trim().is_empty())
        .map(str::to_owned);
    let duration = details
        .get("lengthSeconds")
        .and_then(Value::as_str)
        .and_then(|text| text.parse().ok());
    let thumbnail_url = details
        .get("thumbnail")
        .and_then(best_thumbnail)
        .or_else(|| Some(format!("https://i.ytimg.com/vi/{video_id}/hqdefault.jpg")));

    Ok(VideoMetadata {
        title,
        artist,
        duration,
        thumbnail_url,
        source_site: "youtube".to_string(),
        source_url: video_url(video_id),
        has_video: true,
    })
}

fn metadata_from_playlist_renderer(renderer: &Value) -> Option<VideoMetadata> {
    let video_id = renderer.get("videoId")?.as_str()?;
    if !valid_video_id(video_id) {
        return None;
    }
    let title = rendered_text(renderer.get("title")?)?;
    let artist = renderer
        .get("shortBylineText")
        .or_else(|| renderer.get("longBylineText"))
        .and_then(rendered_text);
    let duration = renderer
        .get("lengthText")
        .and_then(rendered_text)
        .and_then(|text| parse_duration(&text));
    let thumbnail_url = renderer.get("thumbnail").and_then(best_thumbnail);

    Some(VideoMetadata {
        title,
        artist,
        duration,
        thumbnail_url,
        source_site: "youtube".to_string(),
        source_url: video_url(video_id),
        has_video: true,
    })
}

fn collect_renderers<'a>(value: &'a Value, key: &str, out: &mut Vec<&'a Value>) {
    match value {
        Value::Object(object) => {
            for (name, child) in object {
                if name == key {
                    out.push(child);
                } else {
                    collect_renderers(child, key, out);
                }
            }
        }
        Value::Array(items) => {
            for item in items {
                collect_renderers(item, key, out);
            }
        }
        _ => {}
    }
}

async fn playlist_metadata(
    playlist_id: &str,
    video_id: Option<&str>,
) -> Result<Vec<VideoMetadata>, String> {
    let client = CLIENTS[0];
    let mut body = json!({
        "context": context(client),
        "playlistId": playlist_id,
    });
    if let Some(video_id) = video_id {
        body["videoId"] = json!(video_id);
    }
    let response = post_json("next", client, body).await?;

    let mut renderers = Vec::new();
    collect_renderers(&response, "playlistPanelVideoRenderer", &mut renderers);
    let mut videos: Vec<_> = renderers
        .into_iter()
        .filter_map(metadata_from_playlist_renderer)
        .collect();

    // Newer InnerTube responses use lockupViewModel instead of the older renderer.
    if videos.is_empty() {
        if let Some(items) = response
            .pointer("/contents/singleColumnWatchNextResults/playlist/playlist/contents")
            .and_then(Value::as_array)
        {
            for item in items {
                let Some(lockup) = item.get("lockupViewModel") else {
                    continue;
                };
                let endpoint = lockup
                    .pointer("/contentId")
                    .and_then(Value::as_str)
                    .filter(|id| valid_video_id(id));
                let Some(id) = endpoint else {
                    continue;
                };
                let title = lockup
                    .pointer("/metadata/lockupMetadataViewModel/title/content")
                    .and_then(Value::as_str)
                    .unwrap_or("Unknown track")
                    .to_string();
                let thumbnail_url = Some(format!("https://i.ytimg.com/vi/{id}/hqdefault.jpg"));
                videos.push(VideoMetadata {
                    title,
                    artist: None,
                    duration: None,
                    thumbnail_url,
                    source_site: "youtube".to_string(),
                    source_url: video_url(id),
                    has_video: true,
                });
            }
        }
    }

    if videos.is_empty() {
        return Err("YouTube did not return any videos for this playlist".to_string());
    }

    Ok(videos)
}

pub async fn get_metadata(
    source_url: &str,
    no_playlist: bool,
    use_flat_playlist: bool,
) -> Result<Vec<VideoMetadata>, String> {
    let parsed = parse_source(source_url)?;

    if let Some(playlist_id) = parsed.playlist_id.as_deref() {
        if parsed.video_id.is_none() || (!no_playlist && use_flat_playlist) {
            return playlist_metadata(playlist_id, parsed.video_id.as_deref()).await;
        }
    }

    let video_id = parsed
        .video_id
        .as_deref()
        .ok_or_else(|| "URL does not contain a valid YouTube video ID".to_string())?;
    let (response, _) = player_response(video_id).await?;
    Ok(vec![metadata_from_player(&response, video_id)?])
}

pub async fn search(query: &str, limit: u32) -> Result<Vec<VideoMetadata>, String> {
    let client = CLIENTS[0];
    let response = post_json(
        "search",
        client,
        json!({
            "context": context(client),
            "query": query,
        }),
    )
    .await?;

    let mut renderers = Vec::new();
    collect_renderers(&response, "compactVideoRenderer", &mut renderers);
    let results = renderers
        .into_iter()
        .filter_map(|renderer| {
            let video_id = renderer.get("videoId")?.as_str()?;
            if !valid_video_id(video_id) {
                return None;
            }
            let title = rendered_text(renderer.get("title")?)?;
            let artist = renderer
                .get("ownerText")
                .or_else(|| renderer.get("longBylineText"))
                .and_then(rendered_text);
            let duration = renderer
                .get("lengthText")
                .and_then(rendered_text)
                .and_then(|text| parse_duration(&text));
            let thumbnail_url = renderer.get("thumbnail").and_then(best_thumbnail);

            Some(VideoMetadata {
                title,
                artist,
                duration,
                thumbnail_url,
                source_site: "youtube".to_string(),
                source_url: video_url(video_id),
                has_video: true,
            })
        })
        .take(limit.clamp(1, 50) as usize)
        .collect();

    Ok(results)
}

pub async fn resolve(source_url: &str) -> Result<Resolved, String> {
    let parsed = parse_source(source_url)?;
    let video_id = parsed
        .video_id
        .as_deref()
        .ok_or_else(|| "URL does not contain a valid YouTube video ID".to_string())?;
    resolve_video(video_id, 0).await
}

pub async fn resolve_after(source_url: &str, current_client: &str) -> Result<Resolved, String> {
    let parsed = parse_source(source_url)?;
    let video_id = parsed
        .video_id
        .as_deref()
        .ok_or_else(|| "URL does not contain a valid YouTube video ID".to_string())?;
    let start_index = CLIENTS
        .iter()
        .position(|client| client.name == current_client)
        .map(|index| index + 1)
        .unwrap_or(1);
    resolve_video(video_id, start_index).await
}

async fn resolve_video(video_id: &str, start_index: usize) -> Result<Resolved, String> {
    let (response, client) = player_response_from(video_id, start_index).await?;
    let formats = response
        .pointer("/streamingData/adaptiveFormats")
        .and_then(Value::as_array)
        .ok_or_else(|| "YouTube did not return audio formats".to_string())?;

    let audio = formats
        .iter()
        .find(|format| {
            format.get("itag").and_then(Value::as_i64) == Some(140)
                && format
                    .get("mimeType")
                    .and_then(Value::as_str)
                    .is_some_and(|mime| mime.starts_with("audio/mp4"))
        })
        .ok_or_else(|| "YouTube did not return the supported m4a audio format".to_string())?;
    let stream_url = audio
        .get("url")
        .and_then(Value::as_str)
        .ok_or_else(|| "YouTube audio format did not include a direct URL".to_string())?
        .to_string();
    let params: std::collections::HashMap<_, _> = Url::parse(&stream_url)
        .map_err(|error| format!("Invalid YouTube audio URL: {error}"))?
        .query_pairs()
        .map(|(key, value)| (key.into_owned(), value.into_owned()))
        .collect();

    let expires_at = params
        .get("expire")
        .and_then(|value| value.parse::<i64>().ok())
        .ok_or_else(|| "YouTube audio URL did not include an expiry time".to_string())?;
    let bytes = params
        .get("clen")
        .and_then(|value| value.parse::<u64>().ok());
    let duration = params
        .get("dur")
        .and_then(|value| value.parse::<f64>().ok())
        .map(|seconds| seconds.round() as i64);

    Ok(Resolved {
        stream_url,
        duration,
        bytes,
        expires_at,
        client_name: client.name,
        user_agent: client.user_agent,
    })
}

pub fn cached_url_is_fresh(url: &str, fetched_at: i64, now: i64) -> bool {
    let expiry = Url::parse(url)
        .ok()
        .and_then(|parsed| {
            parsed.query_pairs().find_map(|(key, value)| {
                (key == "expire")
                    .then(|| value.parse::<i64>().ok())
                    .flatten()
            })
        })
        .map(|expiry| expiry.saturating_sub(URL_EXPIRY_MARGIN_SECS))
        .unwrap_or_else(|| fetched_at.saturating_add(5 * 60 * 60));

    now < expiry
}

pub fn is_supported_stream_url(url: &str) -> bool {
    let Ok(parsed) = Url::parse(url) else {
        return false;
    };
    let host = parsed.host_str().unwrap_or_default();
    if host != "googlevideo.com" && !host.ends_with(".googlevideo.com") {
        return false;
    }

    let params: std::collections::HashMap<_, _> = parsed.query_pairs().collect();
    let valid_client = params
        .get("c")
        .is_some_and(|name| CLIENTS.iter().any(|client| client.name == name));

    valid_client
        && params.get("itag").is_some_and(|itag| itag == "140")
        && params
            .get("expire")
            .is_some_and(|expire| expire.parse::<i64>().is_ok())
}

pub fn client_name_for_stream_url(url: &str) -> &'static str {
    client_for_stream_url(url).name
}

pub async fn diagnose() -> Result<String, String> {
    let started = Instant::now();
    let resolved = resolve(&video_url(PLAYER_DIAGNOSTIC_VIDEO_ID)).await?;
    let elapsed_ms = started.elapsed().as_millis();
    let range_end = resolved
        .bytes
        .unwrap_or(100_000)
        .saturating_sub(1)
        .min(99_999);
    let range_result =
        fetch_audio_range(&resolved.stream_url, resolved.user_agent, 0, range_end).await;
    let media_status = match range_result {
        Ok(range) => format!(
            "{}/{}bytes of {}",
            if range.partial { "206" } else { "200" },
            range.bytes.len(),
            range.total
        ),
        Err(error) => error,
    };

    Ok(format!(
        "client={} elapsed_ms={} duration={:?} bytes={:?} expires_at={} playabilityStatus=OK range_test={}",
        resolved.client_name,
        elapsed_ms,
        resolved.duration,
        resolved.bytes,
        resolved.expires_at,
        media_status
    ))
}

fn parse_content_range(value: Option<&header::HeaderValue>) -> Option<(u64, u64, u64)> {
    let value = value?.to_str().ok()?;
    let value = value.strip_prefix("bytes ")?;
    let (range, total) = value.split_once('/')?;
    let (start, end) = range.split_once('-')?;
    Some((start.parse().ok()?, end.parse().ok()?, total.parse().ok()?))
}

fn total_from_url(url: &str) -> Option<u64> {
    Url::parse(url)
        .ok()?
        .query_pairs()
        .find_map(|(key, value)| (key == "clen").then(|| value.parse().ok()).flatten())
}

fn client_for_stream_url(url: &str) -> ClientProfile {
    let client_name = Url::parse(url).ok().and_then(|parsed| {
        parsed
            .query_pairs()
            .find_map(|(key, value)| (key == "c").then(|| value.into_owned()))
    });
    CLIENTS
        .iter()
        .copied()
        .find(|client| Some(client.name) == client_name.as_deref())
        .unwrap_or(CLIENTS[0])
}

fn requested_range(range: Option<&str>, total: u64) -> Option<(u64, u64)> {
    if total == 0 {
        return None;
    }
    let range = range.unwrap_or("bytes=0-");
    let (unit, spec) = range.split_once('=')?;
    if unit != "bytes" || spec.contains(',') {
        return None;
    }
    let (start, end) = spec.split_once('-')?;

    if start.is_empty() {
        let suffix_len = end.parse::<u64>().ok()?;
        if suffix_len == 0 {
            return None;
        }
        let start = total.saturating_sub(suffix_len);
        return Some((start, total - 1));
    }

    let start = start.parse::<u64>().ok()?;
    if start >= total {
        return None;
    }
    let max_end = start
        .saturating_add(DOWNLOAD_RANGE_CHUNK_BYTES - 1)
        .min(total - 1);
    let end = if end.is_empty() {
        max_end
    } else {
        end.parse::<u64>().ok()?.min(max_end)
    };
    (end >= start).then_some((start, end))
}

async fn fetch_audio_range(
    url: &str,
    user_agent: &str,
    start: u64,
    end: u64,
) -> Result<AudioRange, String> {
    pace_youtube_request().await;
    let response = http_client()
        .get(url)
        .header(header::USER_AGENT, user_agent)
        .header(header::ORIGIN, "https://www.youtube.com")
        .header(header::RANGE, format!("bytes={start}-{end}"))
        .send()
        .await
        .map_err(|error| format!("Audio range request failed: {error}"))?;

    let status = response.status();
    if status.as_u16() == 206 {
        let (actual_start, actual_end, total) =
            parse_content_range(response.headers().get(header::CONTENT_RANGE))
                .ok_or_else(|| "YouTube returned an invalid Content-Range".to_string())?;
        if actual_start != start || actual_end > end || actual_end < actual_start {
            return Err("YouTube returned an unexpected byte range".to_string());
        }
        let bytes = response
            .bytes()
            .await
            .map_err(|error| format!("Could not read audio range: {error}"))?
            .to_vec();
        if bytes.len() as u64 != actual_end - actual_start + 1 {
            return Err("YouTube returned a truncated byte range".to_string());
        }
        return Ok(AudioRange {
            bytes,
            total,
            end: actual_end,
            partial: true,
        });
    }

    if status.is_success() && start == 0 {
        let total = response
            .content_length()
            .or_else(|| total_from_url(url))
            .ok_or_else(|| "Audio response did not include its size".to_string())?;
        let bytes = response
            .bytes()
            .await
            .map_err(|error| format!("Could not read audio response: {error}"))?
            .to_vec();
        if bytes.len() as u64 != total {
            return Err("YouTube returned an incomplete audio response".to_string());
        }
        return Ok(AudioRange {
            bytes,
            total,
            end: total - 1,
            partial: false,
        });
    }

    let body = response.text().await.unwrap_or_default();
    let detail = body.trim().chars().take(240).collect::<String>();
    if detail.is_empty() {
        Err(format!("YouTube audio CDN returned HTTP {status}"))
    } else {
        Err(format!(
            "YouTube audio CDN returned HTTP {status}: {detail}"
        ))
    }
}

fn protocol_response(
    status: tauri::http::StatusCode,
    total: Option<u64>,
    range: Option<(u64, u64)>,
    body: Vec<u8>,
) -> tauri::http::Response<Vec<u8>> {
    let mut response = tauri::http::Response::builder()
        .status(status)
        .header(tauri::http::header::CONTENT_TYPE, "audio/mp4")
        .header(tauri::http::header::ACCEPT_RANGES, "bytes")
        .header(tauri::http::header::CACHE_CONTROL, "no-store")
        .header(tauri::http::header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header(
            tauri::http::header::ACCESS_CONTROL_ALLOW_METHODS,
            "GET, HEAD, OPTIONS",
        )
        .header(tauri::http::header::ACCESS_CONTROL_ALLOW_HEADERS, "Range")
        .header(
            tauri::http::header::ACCESS_CONTROL_EXPOSE_HEADERS,
            "Accept-Ranges, Content-Length, Content-Range",
        );

    if let Some(total) = total {
        let content_length = range
            .map(|(start, end)| end.saturating_sub(start).saturating_add(1))
            .or_else(|| (status == tauri::http::StatusCode::OK).then_some(total))
            .unwrap_or(body.len() as u64);
        response = response.header(tauri::http::header::CONTENT_LENGTH, content_length);
        if let Some((start, end)) = range {
            response = response.header(
                tauri::http::header::CONTENT_RANGE,
                format!("bytes {start}-{end}/{total}"),
            );
        }
    }

    response
        .body(body)
        .unwrap_or_else(|_| tauri::http::Response::new(Vec::new()))
}

pub async fn audio_protocol_response(
    url: &str,
    request: &tauri::http::Request<Vec<u8>>,
) -> tauri::http::Response<Vec<u8>> {
    let Some(total) = total_from_url(url) else {
        return protocol_response(
            tauri::http::StatusCode::BAD_GATEWAY,
            None,
            None,
            b"Missing audio size in stream URL".to_vec(),
        );
    };

    if request.method() == tauri::http::Method::HEAD {
        return protocol_response(tauri::http::StatusCode::OK, Some(total), None, Vec::new());
    }
    if request.method() == tauri::http::Method::OPTIONS {
        return protocol_response(tauri::http::StatusCode::NO_CONTENT, None, None, Vec::new());
    }
    if request.method() != tauri::http::Method::GET {
        return protocol_response(
            tauri::http::StatusCode::METHOD_NOT_ALLOWED,
            Some(total),
            None,
            b"Only GET and HEAD are supported".to_vec(),
        );
    }

    let range_header = request
        .headers()
        .get(tauri::http::header::RANGE)
        .and_then(|value| value.to_str().ok());
    let Some((start, end)) = requested_range(range_header, total) else {
        return tauri::http::Response::builder()
            .status(tauri::http::StatusCode::RANGE_NOT_SATISFIABLE)
            .header(
                tauri::http::header::CONTENT_RANGE,
                format!("bytes */{total}"),
            )
            .header(tauri::http::header::CACHE_CONTROL, "no-store")
            .body(Vec::new())
            .unwrap_or_else(|_| tauri::http::Response::new(Vec::new()));
    };

    match fetch_audio_range(url, client_for_stream_url(url).user_agent, start, end).await {
        Ok(range) => {
            let (status, content_range) = if range.partial {
                (
                    tauri::http::StatusCode::PARTIAL_CONTENT,
                    Some((start, range.end)),
                )
            } else {
                (tauri::http::StatusCode::OK, None)
            };
            protocol_response(status, Some(range.total), content_range, range.bytes)
        }
        Err(error) => {
            eprintln!("Audio proxy failed for range {start}-{end}: {error}");
            protocol_response(
                tauri::http::StatusCode::BAD_GATEWAY,
                Some(total),
                None,
                error.into_bytes(),
            )
        }
    }
}

fn emit_progress(
    app: &AppHandle,
    track_id: i64,
    received: u64,
    total: Option<u64>,
    started: Instant,
) {
    let percent = total
        .filter(|total| *total > 0)
        .map(|total| (received as f64 * 100.0 / total as f64).clamp(0.0, 99.9))
        .unwrap_or(0.0);
    let elapsed = started.elapsed().as_secs_f64().max(0.001);
    let bytes_per_sec = received as f64 / elapsed;
    let speed = format!("{}/s", format_bytes(bytes_per_sec as u64));
    let eta = total
        .filter(|total| bytes_per_sec > 0.0 && received < *total)
        .map(|total| format_duration(((total - received) as f64 / bytes_per_sec) as u64))
        .unwrap_or_default();

    let _ = app.emit(
        "track:download-progress",
        json!({
            "trackId": track_id,
            "percent": percent,
            "speed": speed,
            "eta": eta,
            "status": "downloading"
        }),
    );
}

fn format_bytes(bytes: u64) -> String {
    const UNITS: [&str; 4] = ["B", "KiB", "MiB", "GiB"];
    let mut value = bytes as f64;
    let mut unit = 0;
    while value >= 1024.0 && unit < UNITS.len() - 1 {
        value /= 1024.0;
        unit += 1;
    }
    format!("{value:.1} {}", UNITS[unit])
}

fn format_duration(seconds: u64) -> String {
    format!("{:02}:{:02}", seconds / 60, seconds % 60)
}

async fn wait_until_cancelled(cancelled: Arc<AtomicBool>) {
    while !cancelled.load(Ordering::Relaxed) {
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
}

pub async fn download(
    app: &AppHandle,
    url: &str,
    destination: &Path,
    track_id: i64,
    expected_bytes: Option<u64>,
    user_agent: &str,
    cancelled: Arc<AtomicBool>,
) -> Result<u64, String> {
    download_to_path(
        url,
        destination,
        expected_bytes,
        user_agent,
        cancelled,
        |received, total, started, complete| {
            if complete {
                let speed = format!(
                    "{}/s",
                    format_bytes(
                        (received as f64 / started.elapsed().as_secs_f64().max(0.001)) as u64
                    )
                );
                let _ = app.emit(
                    "track:download-progress",
                    json!({
                        "trackId": track_id,
                        "percent": 100.0,
                        "speed": speed,
                        "eta": "00:00",
                        "status": "downloading"
                    }),
                );
            } else {
                emit_progress(app, track_id, received, total, started);
            }
        },
    )
    .await
}

async fn download_to_path<F>(
    url: &str,
    destination: &Path,
    expected_bytes: Option<u64>,
    user_agent: &str,
    cancelled: Arc<AtomicBool>,
    mut report_progress: F,
) -> Result<u64, String>
where
    F: FnMut(u64, Option<u64>, Instant, bool),
{
    let partial = destination.with_extension("m4a.part");
    let mut file = tokio::fs::File::create(&partial)
        .await
        .map_err(|error| format!("Could not create download file: {error}"))?;
    let started = Instant::now();
    let mut received = 0_u64;
    let mut last_progress = Instant::now();
    let mut total = expected_bytes.or_else(|| total_from_url(url));

    loop {
        if total.is_some_and(|total| received >= total) {
            break;
        }

        // Googlevideo rejects unbounded GETs; use bounded 1 MiB ranges.
        let end = total
            .map(|total| {
                total
                    .saturating_sub(1)
                    .min(received.saturating_add(DOWNLOAD_RANGE_CHUNK_BYTES - 1))
            })
            .unwrap_or_else(|| received.saturating_add(DOWNLOAD_RANGE_CHUNK_BYTES - 1));

        let range_result = tokio::select! {
            _ = wait_until_cancelled(cancelled.clone()) => {
                drop(file);
                let _ = tokio::fs::remove_file(&partial).await;
                return Err("cancelled".to_string());
            }
            range = fetch_audio_range(url, user_agent, received, end) => range,
        };

        let range = match range_result {
            Ok(result) => result,
            Err(error) => {
                drop(file);
                let _ = tokio::fs::remove_file(&partial).await;
                return Err(error);
            }
        };
        if total.is_some_and(|expected| expected != range.total) {
            drop(file);
            let _ = tokio::fs::remove_file(&partial).await;
            return Err("YouTube changed the total size during download".to_string());
        }
        total = Some(range.total);

        let before_range = received;
        if let Err(error) = file.write_all(&range.bytes).await {
            drop(file);
            let _ = tokio::fs::remove_file(&partial).await;
            return Err(format!("Could not write download: {error}"));
        }
        received = range.end.saturating_add(1);

        if last_progress.elapsed() >= Duration::from_millis(150) {
            report_progress(received, total, started, false);
            last_progress = Instant::now();
        }

        if received == before_range {
            drop(file);
            let _ = tokio::fs::remove_file(&partial).await;
            return Err("YouTube returned an empty byte range".to_string());
        }
    }

    if let Err(error) = file.flush().await {
        drop(file);
        let _ = tokio::fs::remove_file(&partial).await;
        return Err(format!("Could not flush download: {error}"));
    }
    drop(file);

    if let Some(total) = total {
        if received != total {
            let _ = tokio::fs::remove_file(&partial).await;
            return Err(format!(
                "Incomplete download: received {received} of {total} bytes"
            ));
        }
    }

    if let Err(error) = tokio::fs::rename(&partial, destination).await {
        let _ = tokio::fs::remove_file(&partial).await;
        return Err(format!("Could not finalize download: {error}"));
    }

    report_progress(received, total, started, true);

    Ok(received)
}

pub async fn download_thumbnail(
    app: &AppHandle,
    thumbnail_url: &str,
    track_id: i64,
) -> Result<String, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("thumbnails");
    std::fs::create_dir_all(&dir).map_err(|error| error.to_string())?;

    let ext = thumbnail_url
        .split('?')
        .next()
        .and_then(|url| url.rsplit('.').next())
        .unwrap_or("jpg");
    let ext = sanitize_filename::sanitize(ext);
    let path = dir.join(format!("{track_id}.{ext}"));

    let response = http_client()
        .get(thumbnail_url)
        .header(header::USER_AGENT, CLIENTS[0].user_agent)
        .send()
        .await
        .map_err(|error| format!("Thumbnail request failed: {error}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "Thumbnail request returned HTTP {}",
            response.status()
        ));
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("Could not read thumbnail: {error}"))?;

    tokio::fs::write(&path, bytes)
        .await
        .map_err(|error| format!("Could not save thumbnail: {error}"))?;

    path.to_str()
        .map(str::to_owned)
        .ok_or_else(|| "Invalid thumbnail path".to_string())
}

#[tauri::command]
pub async fn innertube_diagnose() -> Result<String, String> {
    diagnose().await
}

#[cfg(test)]
mod tests {
    use super::{
        cached_url_is_fresh, is_supported_stream_url, parse_duration, parse_source,
        playability_error,
    };
    use serde_json::json;

    #[test]
    fn extracts_supported_youtube_url_shapes_and_playlist() {
        let cases = [
            ("https://www.youtube.com/watch?v=A2VpR8HahKc", "A2VpR8HahKc"),
            ("https://youtu.be/A2VpR8HahKc", "A2VpR8HahKc"),
            ("https://youtube.com/shorts/A2VpR8HahKc", "A2VpR8HahKc"),
            (
                "https://music.youtube.com/watch?v=A2VpR8HahKc",
                "A2VpR8HahKc",
            ),
        ];

        for (url, expected_id) in cases {
            assert_eq!(
                parse_source(url).unwrap().video_id.as_deref(),
                Some(expected_id)
            );
        }

        let playlist =
            parse_source("https://www.youtube.com/watch?v=A2VpR8HahKc&list=PL1234567890").unwrap();
        assert_eq!(playlist.video_id.as_deref(), Some("A2VpR8HahKc"));
        assert_eq!(playlist.playlist_id.as_deref(), Some("PL1234567890"));

        let playlist_only =
            parse_source("https://www.youtube.com/playlist?list=PL1234567890").unwrap();
        assert_eq!(playlist_only.video_id, None);
        assert_eq!(playlist_only.playlist_id.as_deref(), Some("PL1234567890"));
    }

    #[test]
    fn parses_duration_and_classifies_video_errors_before_cascading() {
        assert_eq!(parse_duration("1:02:03"), Some(3723));
        assert_eq!(parse_duration("5:21"), Some(321));
        assert_eq!(parse_duration("live"), None);

        assert_eq!(
            playability_error(
                &json!({ "playabilityStatus": { "status": "LOGIN_REQUIRED", "reason": "Sign in to confirm you're not a bot" } })
            ),
            Some((true, "Sign in to confirm you're not a bot".to_string()))
        );
        assert_eq!(
            playability_error(
                &json!({ "playabilityStatus": { "status": "ERROR", "reason": "This video is unavailable" } })
            ),
            Some((false, "This video is unavailable".to_string()))
        );
        assert_eq!(
            playability_error(
                &json!({ "playabilityStatus": { "status": "LOGIN_REQUIRED", "reason": "This video is private" } })
            ),
            Some((false, "This video is private".to_string()))
        );
    }

    #[test]
    fn parses_content_range_response_headers() {
        let range = reqwest::header::HeaderValue::from_static("bytes 1048576-2097151/5186748");
        assert_eq!(
            super::parse_content_range(Some(&range)),
            Some((1_048_576, 2_097_151, 5_186_748))
        );
        assert_eq!(super::parse_content_range(None), None);
        let unknown_total = reqwest::header::HeaderValue::from_static("bytes 0-100/*");
        assert_eq!(super::parse_content_range(Some(&unknown_total)), None);

        assert_eq!(
            super::requested_range(None, 5_186_748),
            Some((0, 1_048_575))
        );
        assert_eq!(
            super::requested_range(Some("bytes=3000000-"), 5_186_748),
            Some((3_000_000, 4_048_575))
        );
        assert_eq!(
            super::requested_range(Some("bytes=-1000"), 5_186_748),
            Some((5_185_748, 5_186_747))
        );
        assert_eq!(
            super::requested_range(Some("bytes=6000000-"), 5_186_748),
            None
        );
    }

    #[test]
    fn builds_media_responses_with_byte_range_headers() {
        let partial = super::protocol_response(
            tauri::http::StatusCode::PARTIAL_CONTENT,
            Some(100),
            Some((0, 99)),
            vec![0; 100],
        );
        assert_eq!(partial.status(), tauri::http::StatusCode::PARTIAL_CONTENT);
        assert_eq!(
            partial.headers()[tauri::http::header::CONTENT_LENGTH],
            "100"
        );
        assert_eq!(
            partial.headers()[tauri::http::header::ACCEPT_RANGES],
            "bytes"
        );
        assert_eq!(
            partial.headers()[tauri::http::header::CONTENT_RANGE],
            "bytes 0-99/100"
        );

        let head =
            super::protocol_response(tauri::http::StatusCode::OK, Some(100), None, Vec::new());
        assert_eq!(head.headers()[tauri::http::header::CONTENT_LENGTH], "100");
    }

    #[test]
    fn uses_server_expiry_with_a_safety_margin_and_has_a_fallback() {
        let url = "https://example.com/audio?expire=10000";
        assert!(cached_url_is_fresh(url, 0, 8799));
        assert!(!cached_url_is_fresh(url, 0, 8800));
        assert!(cached_url_is_fresh(
            "https://example.com/audio",
            1000,
            1000 + 4 * 3600
        ));
        assert!(!cached_url_is_fresh(
            "https://example.com/audio",
            1000,
            1000 + 5 * 3600
        ));
        assert!(is_supported_stream_url(
            "https://rr1---sn.googlevideo.com/videoplayback?itag=140&c=ANDROID&expire=99999"
        ));
        assert!(!is_supported_stream_url(
            "https://rr1---sn.googlevideo.com/videoplayback?itag=140&c=WEB&expire=99999"
        ));
        assert!(!is_supported_stream_url(
            "https://notgooglevideo.com/videoplayback?itag=140&c=ANDROID&expire=99999"
        ));
    }

    #[tokio::test]
    #[ignore = "requires live YouTube access"]
    async fn live_m4a_download_smoke() {
        let source_url = "https://www.youtube.com/watch?v=A2VpR8HahKc";
        let mut resolved = super::resolve(source_url).await.unwrap();
        let path =
            std::env::temp_dir().join(format!("buni-innertube-smoke-{}.m4a", std::process::id()));
        let mut received = None;
        for attempt in 0..super::CLIENTS.len() {
            match super::download_to_path(
                &resolved.stream_url,
                &path,
                resolved.bytes,
                resolved.user_agent,
                std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
                |_, _, _, _| {},
            )
            .await
            {
                Ok(size) => {
                    received = Some(size);
                    break;
                }
                Err(error) if error.contains("HTTP 403") && attempt + 1 < super::CLIENTS.len() => {
                    resolved = super::resolve_after(source_url, resolved.client_name)
                        .await
                        .unwrap();
                }
                Err(error) => panic!("live download failed: {error}"),
            }
        }
        let received = received.expect("all clients rejected the live download");
        let bytes = tokio::fs::read(&path).await.unwrap();

        assert_eq!(Some(received), resolved.bytes);
        assert_eq!(&bytes[4..8], b"ftyp");
        let _ = tokio::fs::remove_file(path).await;
    }
}
