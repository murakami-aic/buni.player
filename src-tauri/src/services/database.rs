use crate::models::playlist::Playlist;
use crate::models::track::Track;
use crate::services::i18n;
use rusqlite::{params, Connection, Result};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

pub struct EnrichedData {
    pub title: String,
    pub artist: String,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub genre_tags: Option<Vec<String>>,
    pub lastfm_url: Option<String>,
    pub lastfm_id: Option<String>,
}

fn db_path(app: &AppHandle) -> Result<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| rusqlite::Error::InvalidPath(e.to_string().into()))?;
    Ok(dir.join("amfm.db"))
}

const INIT_SQL: &str = include_str!("../../migrations/001_init.sql");
const MIGRATION_002: &str = include_str!("../../migrations/002_add_has_video.sql");
const MIGRATION_003: &str = include_str!("../../migrations/003_playlists.sql");
const MIGRATION_004: &str = include_str!("../../migrations/004_playlists_add_image.sql");

fn run_migrations(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            applied_at INTEGER NOT NULL DEFAULT (unixepoch())
        )",
    )?;

    let last_version: Option<i64> =
        conn.query_row("SELECT MAX(version) FROM schema_migrations", [], |row| {
            row.get(0)
        })?;
    let last_version = last_version.unwrap_or(0);

    if last_version < 1 {
        conn.execute_batch(INIT_SQL)?;
        conn.execute("INSERT INTO schema_migrations (version) VALUES (1)", [])?;
    }

    if last_version < 2 {
        conn.execute_batch(MIGRATION_002)?;
        conn.execute("INSERT INTO schema_migrations (version) VALUES (2)", [])?;
    }

    if last_version < 3 {
        conn.execute_batch(MIGRATION_003)?;
        conn.execute("INSERT INTO schema_migrations (version) VALUES (3)", [])?;
    }

    if last_version < 4 {
        conn.execute_batch(MIGRATION_004)?;
        conn.execute("INSERT INTO schema_migrations (version) VALUES (4)", [])?;
    }

    Ok(())
}

fn connect(app: &AppHandle) -> Result<Connection> {
    let path = db_path(app)?;
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let conn = Connection::open(path)?;
    conn.execute_batch("PRAGMA journal_mode=WAL;")?;
    run_migrations(&conn)?;
    Ok(conn)
}

fn row_to_track(row: &rusqlite::Row) -> Result<Track> {
    let genre_tags: Option<String> = row.get("genre_tags")?;
    Ok(Track {
        id: row.get("id")?,
        title: row.get("title")?,
        artist: row.get("artist")?,
        album: row.get("album")?,
        album_artist: row.get("album_artist")?,
        duration: row.get("duration")?,
        genre_tags: genre_tags.map(|s| s.split(',').map(|t| t.to_string()).collect()),
        thumbnail: row.get("thumbnail")?,
        source_url: row.get("source_url")?,
        source_site: row.get("source_site")?,
        stream_url: row.get("stream_url")?,
        stream_url_ts: row.get("stream_url_ts")?,
        file_path: row.get("file_path")?,
        mode: row.get("mode")?,
        play_count: row.get("play_count")?,
        last_played: row.get("last_played")?,
        lastfm_url: row.get("lastfm_url")?,
        lastfm_id: row.get("lastfm_id")?,
        musicbrainz_id: row.get("musicbrainz_id")?,
        has_video: row.get("has_video")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

pub fn get_tracks(
    app: &AppHandle,
    filter_mode: Option<String>,
    search_query: Option<String>,
    sort_by: Option<String>,
    sort_order: Option<String>,
) -> Result<Vec<Track>> {
    let conn = connect(app)?;

    let mut sql = String::from("SELECT * FROM tracks WHERE 1=1");
    let mut query_params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(mode) = filter_mode {
        if mode != "all" {
            sql.push_str(" AND mode = ?");
            query_params.push(Box::new(mode));
        }
    }

    if let Some(q) = search_query {
        let like = format!("%{}%", q);
        sql.push_str(" AND (title LIKE ? OR artist LIKE ? OR album LIKE ?)");
        query_params.push(Box::new(like.clone()));
        query_params.push(Box::new(like.clone()));
        query_params.push(Box::new(like));
    }

    let sort_col = match sort_by.as_deref() {
        Some("last_played") => "last_played",
        Some("artist") => "artist",
        Some("album") => "album",
        _ => "created_at",
    };
    let order = if sort_order.as_deref() == Some("asc") { "ASC" } else { "DESC" };
    sql.push_str(&format!(" ORDER BY {} {}", sort_col, order));

    let mut stmt = conn.prepare(&sql)?;
    let param_refs: Vec<&dyn rusqlite::ToSql> = query_params.iter().map(|p| p.as_ref()).collect();
    let tracks = stmt.query_map(param_refs.as_slice(), row_to_track)?;
    tracks.collect()
}

pub fn insert_track(app: &AppHandle, track: &Track) -> Result<i64> {
    let conn = connect(app)?;
    let genre_tags = track
        .genre_tags
        .as_ref()
        .map(|tags| tags.join(","));

    conn.execute(
        "INSERT INTO tracks (
            title, artist, album, album_artist, duration, genre_tags, thumbnail,
            source_url, source_site, stream_url, stream_url_ts, file_path, mode,
            play_count, last_played, lastfm_url, lastfm_id, musicbrainz_id,
            has_video, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        params![
            track.title,
            track.artist,
            track.album,
            track.album_artist,
            track.duration,
            genre_tags,
            track.thumbnail,
            track.source_url,
            track.source_site,
            track.stream_url,
            track.stream_url_ts,
            track.file_path,
            track.mode,
            track.play_count,
            track.last_played,
            track.lastfm_url,
            track.lastfm_id,
            track.musicbrainz_id,
            track.has_video,
            track.created_at,
            track.updated_at,
        ],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn delete_track(app: &AppHandle, id: i64) -> Result<()> {
    let conn = connect(app)?;
    conn.execute("DELETE FROM tracks WHERE id = ?", params![id])?;
    Ok(())
}

pub fn delete_local_file(app: &AppHandle, id: i64) -> Result<()> {
    let conn = connect(app)?;
    let now = chrono::Utc::now().timestamp();
    conn.execute(
        "UPDATE tracks SET file_path = NULL, mode = 'streaming', updated_at = ? WHERE id = ?",
        params![now, id],
    )?;
    Ok(())
}

pub fn track_started(app: &AppHandle, id: i64) -> Result<()> {
    let conn = connect(app)?;
    let now = chrono::Utc::now().timestamp();
    conn.execute(
        "UPDATE tracks SET play_count = play_count + 1, last_played = ?, updated_at = ? WHERE id = ?",
        params![now, now, id],
    )?;
    Ok(())
}

macro_rules! update_track_field {
    ($app:expr, $id:expr, $sql:literal $(, $param:expr)* $(,)?) => {{
        let conn = connect($app)?;
        let now = chrono::Utc::now().timestamp();
        conn.execute($sql, params![$($param,)* now, $id])?;
        Ok(())
    }};
}

pub fn update_track_file(app: &AppHandle, id: i64, file_path: &str) -> Result<()> {
    update_track_field!(app, id,
        "UPDATE tracks SET file_path = ?, mode = 'local', updated_at = ? WHERE id = ?",
        file_path
    )
}

pub fn update_track_thumbnail(app: &AppHandle, id: i64, thumbnail: &str) -> Result<()> {
    update_track_field!(app, id,
        "UPDATE tracks SET thumbnail = ?, updated_at = ? WHERE id = ?",
        thumbnail
    )
}

pub fn update_track_stream_url(app: &AppHandle, id: i64, stream_url: &str) -> Result<()> {
    let conn = connect(app)?;
    let now = chrono::Utc::now().timestamp();
    conn.execute(
        "UPDATE tracks SET stream_url = ?, stream_url_ts = ?, updated_at = ? WHERE id = ?",
        params![stream_url, now, now, id],
    )?;
    Ok(())
}

pub fn invalidate_track_stream_url(app: &AppHandle, id: i64) -> Result<()> {
    let conn = connect(app)?;
    let now = chrono::Utc::now().timestamp();
    conn.execute(
        "UPDATE tracks SET stream_url = NULL, stream_url_ts = NULL, updated_at = ? WHERE id = ?",
        params![now, id],
    )?;
    Ok(())
}

pub fn track_exists(app: &AppHandle, source_url: &str) -> Result<bool> {
    let conn = connect(app)?;
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM tracks WHERE source_url = ?",
        params![source_url],
        |row| row.get(0),
    )?;
    Ok(count > 0)
}

pub fn get_lastfm_cache(app: &AppHandle, query_key: &str) -> Result<Option<String>> {
    let conn = connect(app)?;
    let mut stmt = conn.prepare("SELECT response FROM lastfm_cache WHERE query_key = ?")?;
    let result = stmt.query_row(params![query_key], |row| row.get(0));
    match result {
        Ok(resp) => Ok(Some(resp)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}

pub fn set_lastfm_cache(app: &AppHandle, query_key: &str, response: &str) -> Result<()> {
    let conn = connect(app)?;
    let now = chrono::Utc::now().timestamp();
    conn.execute(
        "INSERT OR REPLACE INTO lastfm_cache (query_key, response, fetched_at) VALUES (?, ?, ?)",
        params![query_key, response, now],
    )?;
    Ok(())
}

pub fn enrich_track(app: &AppHandle, id: i64, data: &EnrichedData) -> Result<()> {
    let conn = connect(app)?;
    let now = chrono::Utc::now().timestamp();
    let genre_tags = data.genre_tags.as_ref().map(|tags| tags.join(","));
    conn.execute(
        "UPDATE tracks SET title = ?, artist = ?, album = ?, album_artist = ?, genre_tags = ?, lastfm_url = ?, lastfm_id = ?, updated_at = ? WHERE id = ?",
        params![
            data.title,
            data.artist,
            data.album,
            data.album_artist,
            genre_tags,
            data.lastfm_url,
            data.lastfm_id,
            now,
            id,
        ],
    )?;
    Ok(())
}

pub fn get_playlists(app: &AppHandle) -> Result<Vec<Playlist>> {
    let conn = connect(app)?;
    let mut stmt = conn.prepare(
        "SELECT p.id, p.name, p.image, p.created_at,
                COALESCE(cnt.c, 0) as track_count
         FROM playlists p
         LEFT JOIN (
             SELECT playlist_id, COUNT(*) as c
             FROM playlist_tracks
             GROUP BY playlist_id
         ) cnt ON cnt.playlist_id = p.id
         ORDER BY p.created_at",
    )?;

    let playlists = stmt.query_map([], |row| {
        Ok(Playlist {
            id: row.get("id")?,
            name: row.get("name")?,
            image: row.get("image")?,
            track_count: row.get("track_count")?,
            created_at: row.get("created_at")?,
        })
    })?;
    playlists.collect()
}

pub fn create_playlist(app: &AppHandle, name: &str, image: Option<&str>) -> Result<Playlist> {
    let conn = connect(app)?;
    let now = chrono::Utc::now().timestamp();
    conn.execute(
        "INSERT INTO playlists (name, image, created_at) VALUES (?, ?, ?)",
        params![name, image, now],
    )?;
    let id = conn.last_insert_rowid();
    Ok(Playlist {
        id,
        name: name.to_string(),
        image: image.map(|s| s.to_string()),
        track_count: 0,
        created_at: now,
    })
}

pub fn update_playlist(app: &AppHandle, playlist_id: i64, name: Option<&str>, image: Option<&str>) -> Result<Playlist> {
    let conn = connect(app)?;
    let now = chrono::Utc::now().timestamp();

    if let Some(n) = name {
        conn.execute(
            "UPDATE playlists SET name = ?, created_at = ? WHERE id = ?",
            params![n, now, playlist_id],
        )?;
    }
    if let Some(img) = image {
        conn.execute(
            "UPDATE playlists SET image = ?, created_at = ? WHERE id = ?",
            params![img, now, playlist_id],
        )?;
    }

    // Return updated playlist
    let mut stmt = conn.prepare(
        "SELECT p.id, p.name, p.image, p.created_at,
                COALESCE(cnt.c, 0) as track_count
         FROM playlists p
         LEFT JOIN (
             SELECT playlist_id, COUNT(*) as c
             FROM playlist_tracks
             GROUP BY playlist_id
         ) cnt ON cnt.playlist_id = p.id
         WHERE p.id = ?",
    )?;
    stmt.query_row(params![playlist_id], |row| {
        Ok(Playlist {
            id: row.get("id")?,
            name: row.get("name")?,
            image: row.get("image")?,
            track_count: row.get("track_count")?,
            created_at: row.get("created_at")?,
        })
    })
}

pub fn delete_playlist(app: &AppHandle, playlist_id: i64) -> Result<()> {
    let conn = connect(app)?;
    conn.execute("DELETE FROM playlists WHERE id = ?", params![playlist_id])?;
    Ok(())
}

pub fn add_to_playlist(app: &AppHandle, playlist_id: i64, track_id: i64) -> Result<(), String> {
    let conn = connect(app).map_err(|e| e.to_string())?;
    let max_pos: Option<i64> = conn
        .query_row(
            "SELECT MAX(position) FROM playlist_tracks WHERE playlist_id = ?",
            params![playlist_id],
            |row| row.get(0),
        )
        .ok();
    let position = max_pos.unwrap_or(-1) + 1;
    let now = chrono::Utc::now().timestamp();
    let rows = conn
        .execute(
            "INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position, added_at) VALUES (?, ?, ?, ?)",
            params![playlist_id, track_id, position, now],
        )
        .map_err(|e| e.to_string())?;

    if rows == 0 {
        return Err(i18n::t("error.playlist.track_exists"));
    }
    Ok(())
}

pub fn remove_from_playlist(app: &AppHandle, playlist_id: i64, track_id: i64) -> Result<()> {
    let conn = connect(app)?;
    conn.execute(
        "DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?",
        params![playlist_id, track_id],
    )?;
    Ok(())
}

pub fn get_playlist_tracks(app: &AppHandle, playlist_id: i64) -> Result<Vec<Track>> {
    let conn = connect(app)?;
    let mut stmt = conn.prepare(
        "SELECT t.* FROM tracks t
         INNER JOIN playlist_tracks pt ON pt.track_id = t.id
         WHERE pt.playlist_id = ?
         ORDER BY pt.position",
    )?;

    let tracks = stmt.query_map(params![playlist_id], row_to_track)?;
    tracks.collect()
}
