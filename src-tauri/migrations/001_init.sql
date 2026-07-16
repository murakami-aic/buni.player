CREATE TABLE IF NOT EXISTS tracks (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    title           TEXT NOT NULL,
    artist          TEXT,
    album           TEXT,
    album_artist    TEXT,
    duration        INTEGER,
    genre_tags      TEXT,
    thumbnail       TEXT,
    source_url      TEXT NOT NULL UNIQUE,
    source_site     TEXT NOT NULL,
    stream_url      TEXT,
    stream_url_ts   INTEGER,
    file_path       TEXT,
    mode            TEXT NOT NULL DEFAULT 'streaming',
    play_count      INTEGER DEFAULT 0,
    last_played     INTEGER,
    lastfm_url      TEXT,
    lastfm_id       TEXT,
    musicbrainz_id  TEXT,
    created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS lastfm_cache (
    query_key   TEXT PRIMARY KEY,
    response    TEXT NOT NULL,
    fetched_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tracks_mode ON tracks(mode);
CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist);
CREATE INDEX IF NOT EXISTS idx_tracks_album ON tracks(album);
CREATE INDEX IF NOT EXISTS idx_tracks_source_url ON tracks(source_url);
CREATE INDEX IF NOT EXISTS idx_tracks_last_played ON tracks(last_played);
CREATE INDEX IF NOT EXISTS idx_tracks_created ON tracks(created_at);
CREATE INDEX IF NOT EXISTS idx_lastfm_cache_fetched ON lastfm_cache(fetched_at);
