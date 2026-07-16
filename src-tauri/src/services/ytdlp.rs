use crate::services::i18n;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

pub struct VideoMetadata {
    pub title: String,
    pub artist: Option<String>,
    pub duration: Option<i64>,
    pub thumbnail_url: Option<String>,
    pub source_site: String,
    pub source_url: String,
    pub has_video: bool,
}

pub async fn get_metadata(
    app: &AppHandle,
    source_url: &str,
    child_slot: &Mutex<Option<CommandChild>>,
    no_playlist: bool,
) -> Result<Vec<VideoMetadata>, String> {
    let mut args: Vec<String> = vec![
        "--no-download".into(),
        "--print".into(),
        "%(title)s\t%(duration)s\t%(thumbnail)s\t%(uploader)s\t%(channel)s\t%(vcodec)s\t%(extractor)s\t%(webpage_url)s".into(),
    ];
    if no_playlist {
        args.insert(0, "--no-playlist".into());
    }
    args.push(source_url.to_string());
    let str_args: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let output = run_ytdlp_cancellable(app, &str_args, child_slot).await?;

    let mut results = Vec::new();
    for line in output.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let fields: Vec<&str> = line.split('\t').collect();
        if fields.len() < 8 {
            return Err(i18n::t("error.metadata.incomplete"));
        }
        let title = fields[0].trim();
        let title = if title.is_empty() { "Unknown track" } else { title }.to_string();
        let duration = fields[1].trim().parse::<i64>().ok();
        let thumbnail_url = fields[2].trim();
        let thumbnail_url = if thumbnail_url.is_empty() { None } else { Some(thumbnail_url.to_string()) };
        let artist = [fields[3].trim(), fields[4].trim()]
            .into_iter()
            .find(|s| !s.is_empty())
            .map(|s| s.to_string());
        let vcodec = fields[5].trim().to_lowercase();
        let has_video = !vcodec.is_empty() && vcodec != "none" && vcodec != "na";
        let source_site = fields[6].trim().to_lowercase();
        let source_url = fields[7].trim().to_string();

        results.push(VideoMetadata {
            title,
            artist,
            duration,
            thumbnail_url,
            source_site,
            source_url,
            has_video,
        });
    }

    Ok(results)
}

async fn run_ytdlp_cancellable(
    app: &AppHandle,
    args: &[&str],
    child_slot: &Mutex<Option<CommandChild>>,
) -> Result<String, String> {
    let sidecar = app
        .shell()
        .sidecar("yt-dlp")
        .map_err(|e| {
            eprintln!("yt-dlp sidecar error: {}", e);
            i18n::t("error.ytdlp.not_found")
        })?;

    let mut all_args = vec!["--js-runtimes", "node", "--js-runtimes", "deno"];
    all_args.extend_from_slice(args);
    let (mut rx, child) = sidecar
        .args(&all_args)
        .spawn()
        .map_err(|e| {
            eprintln!("Failed to spawn yt-dlp: {}", e);
            i18n::t("error.ytdlp.spawn_failed")
        })?;

    *child_slot.lock().unwrap() = Some(child);

    let mut stdout_lines: Vec<String> = Vec::new();
    let mut stderr_output = String::new();

    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(line) => {
                stdout_lines.push(String::from_utf8_lossy(&line).into_owned());
            }
            CommandEvent::Stderr(line) => {
                let line = String::from_utf8_lossy(&line);
                stderr_output.push_str(&line);
                stderr_output.push('\n');
            }
            CommandEvent::Terminated(payload) => {
                if payload.code != Some(0) {
                    eprintln!(
                        "yt-dlp exit code {:?}: {}",
                        payload.code, stderr_output
                    );
                    *child_slot.lock().unwrap() = None;
                    return Err(i18n::t("error.ytdlp.generic"));
                }
                break;
            }
            CommandEvent::Error(err) => {
                eprintln!("yt-dlp process error: {}", err);
                *child_slot.lock().unwrap() = None;
                return Err(i18n::t("error.ytdlp.process_error"));
            }
            _ => {}
        }
    }

    *child_slot.lock().unwrap() = None;
    Ok(stdout_lines.join("\n"))
}

pub async fn get_stream_url(app: &AppHandle, source_url: &str) -> Result<String, String> {
    let output = run_ytdlp(
        app,
        &[
            "--no-playlist",
            "-f",
            "bestaudio[ext=m4a]/bestaudio/best",
            "--get-url",
            source_url,
        ],
    )
    .await?;

    output
        .lines()
        .next()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| i18n::t("error.stream.url"))
}

pub async fn download_audio(
    app: &AppHandle,
    source_url: &str,
    template: &str,
    track_id: i64,
) -> Result<String, String> {
    use tauri_plugin_shell::process::CommandEvent;

    let sidecar = app
        .shell()
        .sidecar("yt-dlp")
        .map_err(|e| {
            eprintln!("yt-dlp sidecar error: {}", e);
            i18n::t("error.ytdlp.not_found")
        })?;

    let progress_template = "%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s";
    let (mut rx, _child) = sidecar
        .args([
            "--no-playlist",
            "--js-runtimes",
            "node",
            "--js-runtimes",
            "deno",
            "-f",
            "bestaudio[ext=m4a]/bestaudio/best",
            "-x",
            "--audio-format",
            "m4a",
            "--audio-quality",
            "0",
            "-o",
            template,
            "--restrict-filenames",
            "--newline",
            "--progress-template",
            progress_template,
            "--print",
            "after_move:%(filepath)s",
            source_url,
        ])
        .spawn()
        .map_err(|e| {
            eprintln!("Failed to spawn yt-dlp: {}", e);
            i18n::t("error.ytdlp.spawn_failed")
        })?;

    let mut file_path: Option<String> = None;
    let mut stderr_output = String::new();

    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(line) => {
                let line = String::from_utf8_lossy(&line);
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }

                if trimmed.contains('|') {
                    let parts: Vec<&str> = trimmed.split('|').collect();
                    if parts.len() >= 3 {
                        let percent_str = parts[0].trim().trim_end_matches('%');
                        let percent = percent_str.parse::<f64>().unwrap_or(0.0);
                        let _ = app.emit(
                            "track:download-progress",
                            serde_json::json!({
                                "trackId": track_id,
                                "percent": percent,
                                "speed": parts[1].trim(),
                                "eta": parts[2].trim(),
                                "status": "downloading"
                            }),
                        );
                    }
                } else if trimmed.ends_with(".m4a")
                    || trimmed.ends_with(".mp3")
                    || trimmed.ends_with(".webm")
                {
                    file_path = Some(trimmed.to_string());
                }
            }
            CommandEvent::Stderr(line) => {
                let line = String::from_utf8_lossy(&line);
                stderr_output.push_str(&line);
                stderr_output.push('\n');
            }
            CommandEvent::Error(err) => {
                eprintln!("yt-dlp process error: {}", err);
                return Err(i18n::t("error.ytdlp.process_error"));
            }
            CommandEvent::Terminated(payload) => {
                if payload.code != Some(0) {
                    eprintln!(
                        "yt-dlp exit code {:?}: {}",
                        payload.code, stderr_output
                    );
                    return Err(i18n::t("error.ytdlp.download_failed"));
                }
                break;
            }
            _ => {}
        }
    }

    file_path.ok_or_else(|| i18n::t("error.ytdlp.no_file_path"))
}

pub async fn download_thumbnail(
    app: &AppHandle,
    thumbnail_url: &str,
    track_id: i64,
) -> Result<String, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("thumbnails");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let ext = thumbnail_url
        .split('?')
        .next()
        .and_then(|url| url.rsplit('.').next())
        .unwrap_or("jpg");
    let ext = sanitize_filename::sanitize(ext);
    let path = dir.join(format!("{}.{}", track_id, ext));

    let response = reqwest::get(thumbnail_url)
        .await
        .map_err(|e| format!("Failed to download thumbnail: {}", e))?;
    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read thumbnail bytes: {}", e))?;

    tokio::fs::write(&path, bytes)
        .await
        .map_err(|e| format!("Failed to write thumbnail: {}", e))?;

    path.to_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "Invalid thumbnail path".to_string())
}

async fn run_ytdlp(app: &AppHandle, args: &[&str]) -> Result<String, String> {
    let sidecar = app
        .shell()
        .sidecar("yt-dlp")
        .map_err(|e| {
            eprintln!("yt-dlp sidecar error: {}", e);
            i18n::t("error.ytdlp.not_found")
        })?;

    let mut all_args = vec!["--js-runtimes", "node", "--js-runtimes", "deno"];
    all_args.extend_from_slice(args);
    let output = sidecar
        .args(&all_args)
        .output()
        .await
        .map_err(|e| {
            eprintln!("Failed to execute yt-dlp: {}", e);
            i18n::t("error.ytdlp.execute_failed")
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        eprintln!("yt-dlp failed: {}", stderr);
        return Err(i18n::t("error.ytdlp.generic"));
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}
