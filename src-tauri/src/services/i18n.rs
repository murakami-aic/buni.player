use std::collections::HashMap;
use std::sync::{OnceLock, RwLock};

static ES_TR: OnceLock<HashMap<String, String>> = OnceLock::new();
static EN_TR: OnceLock<HashMap<String, String>> = OnceLock::new();
static LANG: RwLock<String> = RwLock::new(String::new());

fn es_map() -> &'static HashMap<String, String> {
    ES_TR.get_or_init(|| {
        let raw = include_str!("../../i18n/es.json");
        serde_json::from_str::<HashMap<String, String>>(raw)
            .unwrap_or_default()
    })
}

fn en_map() -> &'static HashMap<String, String> {
    EN_TR.get_or_init(|| {
        let raw = include_str!("../../i18n/en.json");
        serde_json::from_str::<HashMap<String, String>>(raw)
            .unwrap_or_default()
    })
}

pub fn set_language(lang: &str) {
    *LANG.write().unwrap() = lang.to_string();
}

pub fn t(key: &str) -> String {
    let lang = LANG.read().unwrap().clone();
    let primary = if lang == "en" { en_map() } else { es_map() };
    let fallback = if lang == "en" { es_map() } else { en_map() };

    primary
        .get(key)
        .or_else(|| fallback.get(key))
        .cloned()
        .unwrap_or_else(|| key.to_string())
}
