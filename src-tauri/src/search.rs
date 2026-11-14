//! Busca de vídeos e playlists por palavras-chave ou URLs via yt-dlp.

use serde::Serialize;
use std::collections::HashMap;
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::Semaphore;

#[derive(Clone, Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub id: String,
    pub title: String,
    pub channel: String,
    pub duration: Option<f64>,
    pub view_count: Option<u64>,
    pub live: bool,
    pub thumbnail: String,
    pub url: String,
    pub upload_date: Option<String>,
}

const MAX_QUERY_CHARS: usize = 300;
const MAX_LIMIT: u32 = 50;

pub fn sanitize_query(q: &str) -> Result<String, String> {
    let cleaned: String = q
        .chars()
        .map(|c| if c.is_control() { ' ' } else { c })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    let cleaned: String = cleaned.chars().take(MAX_QUERY_CHARS).collect();
    if cleaned.is_empty() {
        return Err("Digite um termo de busca ou cole um link válido.".to_string());
    }
    Ok(cleaned)
}

fn is_youtube_url(s: &str) -> bool {
    s.contains("youtube.com/") || s.contains("youtu.be/")
}

pub fn build_args(input: &str, limit: u32, sort: &str, proxy: &str) -> Vec<String> {
    let mut a: Vec<String> = vec![
        "--flat-playlist".into(),
        "--dump-json".into(),
        "--no-warnings".into(),
        "--ignore-errors".into(),
        "--encoding".into(),
        "utf-8".into(),
        "--socket-timeout".into(),
        "15".into(),
        "--extractor-retries".into(),
        "1".into(),
    ];
    if !proxy.is_empty() {
        a.extend(["--proxy".into(), proxy.to_string()]);
    }

    if is_youtube_url(input) {
        // Se for um link (Vídeo ou Playlist), o yt-dlp extrai diretamente
        a.push(input.to_string());
    } else {
        // Se for palavra-chave, faz a busca
        let limit = limit.clamp(1, MAX_LIMIT);
        let prefix = if sort == "date" { "ytsearchdate" } else { "ytsearch" };
        a.push(format!("{prefix}{limit}:{input}"));
    }
    a
}

fn is_video_id(s: &str) -> bool {
    s.len() == 11 && s.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

pub fn parse_search_line(line: &str) -> Option<SearchResult> {
    let v: serde_json::Value = serde_json::from_str(line.trim()).ok()?;
    let id = v["id"].as_str()?;
    if !is_video_id(id) {
        // Ignora playlists ou canais genéricos na listagem bruta se necessário
    }
    let title = v["title"].as_str().unwrap_or("").trim().to_string();
    if title.is_empty() || title == "[Private video]" || title == "[Deleted video]" {
        return None;
    }
    let channel = v["channel"].as_str().or_else(|| v["uploader"].as_str()).unwrap_or("Desconhecido").trim().to_string();
    let live = matches!(v["live_status"].as_str(), Some("is_live") | Some("is_upcoming")) || v["is_live"].as_bool() == Some(true);
    
    Some(SearchResult {
        id: id.to_string(),
        title,
        channel,
        duration: v["duration"].as_f64(),
        view_count: v["view_count"].as_u64().or_else(|| v["view_count"].as_f64().map(|f| f as u64)),
        live,
        thumbnail: format!("https://i.ytimg.com/vi/{id}/mqdefault.jpg"),
        url: format!("https://www.youtube.com/watch?v={id}"),
        upload_date: v["upload_date"].as_str().map(|s| s.to_string()),
    })
}

// ---------- Gestão de Processos e Cache ----------

struct Running {
    pid: u32,
    cancelled: Arc<AtomicBool>,
}

static RUNNING: OnceLock<Mutex<HashMap<String, Running>>> = OnceLock::new();
static SEM: OnceLock<Semaphore> = OnceLock::new();

fn running() -> &'static Mutex<HashMap<String, Running>> {
    RUNNING.get_or_init(|| Mutex::new(HashMap::new()))
}

fn sem() -> &'static Semaphore {
    SEM.get_or_init(|| Semaphore::new(2))
}

struct CacheEntry {
    results: Vec<SearchResult>,
    expires_at: Instant,
}

static SEARCH_CACHE: OnceLock<Mutex<HashMap<String, CacheEntry>>> = OnceLock::new();

fn search_cache() -> &'static Mutex<HashMap<String, CacheEntry>> {
    SEARCH_CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn kill_tree(pid: u32) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let _ = std::process::Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .creation_flags(0x0800_0000)
            .status();
    }
    #[cfg(not(windows))]
    {
        let _ = std::process::Command::new("pkill").args(["-TERM", "-P", &pid.to_string()]).status();
        let _ = std::process::Command::new("kill").args(["-TERM", &pid.to_string()]).status();
    }
}

pub fn cancel_inner(id: &str) -> bool {
    let entry = match running().lock() {
        Ok(mut m) => m.remove(id),
        Err(_) => None,
    };
    match entry {
        Some(r) => {
            r.cancelled.store(true, Ordering::SeqCst);
            kill_tree(r.pid);
            true
        }
        None => false,
    }
}

pub async fn run_search(
    id: &str,
    program: &str,
    args: Vec<String>,
    limit: usize,
    timeout: Duration,
) -> Result<Vec<SearchResult>, String> {
    cancel_inner(id);
    let _permit = sem().acquire().await.map_err(|e| e.to_string())?;

    let mut cmd = Command::new(program);
    cmd.args(&args).stdout(Stdio::piped()).stderr(Stdio::piped()).kill_on_drop(true);
    #[cfg(windows)]
    cmd.creation_flags(0x0800_0000);

    let mut child = cmd.spawn().map_err(|e| format!("Não foi possível iniciar o yt-dlp: {e}"))?;
    let stdout = child.stdout.take().ok_or("Sem stdout")?;
    let stderr = child.stderr.take().ok_or("Sem stderr")?;

    let cancelled = Arc::new(AtomicBool::new(false));
    if let Ok(mut m) = running().lock() {
        m.insert(id.to_string(), Running { pid: child.id().unwrap_or(0), cancelled: cancelled.clone() });
    }
    let pid = child.id().unwrap_or(0);

    let err_task = tokio::spawn(async move {
        let mut last = String::new();
        let mut lines = BufReader::new(stderr).lines();
        while let Ok(Some(l)) = lines.next_line().await {
            if !l.trim().is_empty() {
                last = l;
            }
        }
        last
    });

    let read = async {
        let mut out: Vec<SearchResult> = Vec::new();
        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if let Some(r) = parse_search_line(&line) {
                if !out.iter().any(|x| x.id == r.id) {
                    out.push(r);
                }
                if out.len() >= limit {
                    break;
                }
            }
        }
        out
    };

    let timed = tokio::time::timeout(timeout, read).await;

    if let Ok(mut m) = running().lock() {
        if m.get(id).map(|r| Arc::ptr_eq(&r.cancelled, &cancelled)).unwrap_or(false) {
            m.remove(id);
        }
    }

    let out = match timed {
        Ok(out) => out,
        Err(_) => {
            kill_tree(pid);
            let _ = child.wait().await;
            return Err("A busca demorou demais. Tente novamente.".to_string());
        }
    };

    let _ = child.wait().await;
    let last_err = err_task.await.unwrap_or_default();

    if cancelled.load(Ordering::SeqCst) {
        return Err("cancelled".to_string());
    }
    if out.is_empty() && !last_err.is_empty() {
        return Err(last_err);
    }
    Ok(out)
}

// ---- COMANDOS TAURI ----
use tauri::AppHandle;

#[tauri::command]
pub async fn search_youtube(
    app: AppHandle,
    id: String,
    query: String,
    limit: Option<u32>,
    sort: Option<String>,
    proxy: Option<String>,
) -> Result<Vec<SearchResult>, String> {
    let q = sanitize_query(&query)?;
    let limit_val = limit.unwrap_or(30).clamp(1, MAX_LIMIT);
    let sort_val = sort.as_deref().unwrap_or("relevance");
    let proxy_val = proxy.as_deref().unwrap_or("");

    let cache_key = format!("{q}_{limit_val}_{sort_val}");
    {
        if let Ok(mut cache) = search_cache().lock() {
            if let Some(entry) = cache.get(&cache_key) {
                if entry.expires_at > Instant::now() {
                    return Ok(entry.results.clone());
                } else {
                    cache.remove(&cache_key);
                }
            }
        }
    }

    let args = build_args(&q, limit_val, sort_val, proxy_val);
    let program = crate::download::ytdlp_program(&app);

    let results = run_search(&id, &program, args, limit_val as usize, Duration::from_secs(45)).await?;

    if let Ok(mut cache) = search_cache().lock() {
        cache.insert(
            cache_key,
            CacheEntry {
                results: results.clone(),
                expires_at: Instant::now() + Duration::from_secs(600),
            },
        );
    }

    Ok(results)
}

#[tauri::command]
pub fn cancel_search(id: String) -> bool {
    cancel_inner(&id)
}