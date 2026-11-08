//! Download com progresso em tempo real robusto para múltiplos processos em simultâneo.

use serde::Serialize;
use std::collections::HashMap;
use std::process::Stdio;
use std::sync::{Mutex, OnceLock};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

/// Evento enviado ao front-end em "download-progress".
#[derive(Clone, Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub id: String,
    pub phase: String, // "preparing" | "downloading" | "processing" | "done" | "cancelled" | "error"
    pub downloaded: Option<f64>,
    pub total: Option<f64>,
    pub percent: Option<f64>,
    pub speed: Option<f64>,
    pub eta: Option<f64>,
    pub filename: Option<String>,
    pub message: Option<String>,
}

impl DownloadProgress {
    fn new(id: &str, phase: &str) -> Self {
        Self {
            id: id.to_string(),
            phase: phase.to_string(),
            downloaded: None,
            total: None,
            percent: None,
            speed: None,
            eta: None,
            filename: None,
            message: None,
        }
    }
}

/// Localiza o executável do yt-dlp de forma rigorosa.
pub fn ytdlp_program(app_handle: &tauri::AppHandle) -> String {
    if let Ok(path) = app_handle.path().resolve("bin/yt-dlp.exe", tauri::path::BaseDirectory::Resource) {
        if path.exists() {
            return path.to_string_lossy().into_owned();
        }
    }
    
    if let Ok(mut current_dir) = std::env::current_dir() {
        current_dir.push("src-tauri");
        current_dir.push("bin");
        current_dir.push("yt-dlp.exe");
        if current_dir.exists() {
            return current_dir.to_string_lossy().into_owned();
        }
    }
    if let Ok(mut current_dir) = std::env::current_dir() {
        current_dir.push("bin");
        current_dir.push("yt-dlp.exe");
        if current_dir.exists() {
            return current_dir.to_string_lossy().into_owned();
        }
    }

    "yt-dlp".to_string()
}

pub fn extra_args() -> Vec<String> {
    vec![]
}

pub fn build_args(url: &str, kind: &str, out_dir: &str, proxy: &str, quality: &str) -> Vec<String> {
    let mut a: Vec<String> = vec![
        "--newline".to_string(),
        "--no-playlist".to_string(),
        "--no-check-certificates".to_string(),
        "--encoding".to_string(),
        "utf-8".to_string(),
        "--no-quiet".to_string(),
        "--no-warnings".to_string(),
        "--no-mtime".to_string(),
        "--progress".to_string(),
        "--progress-template".to_string(),
        "download:[DL] %(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s|%(progress.filename)s".to_string(),
        "--progress-template".to_string(),
        "postprocess:[PP] %(progress.postprocessor)s".to_string(),
        "--print".to_string(),
        "after_move:[FILE] %(filepath)s".to_string(),
        "-o".to_string(),
        format!("{}/%(title)s.%(ext)s", out_dir.trim_end_matches(['/', '\\'])),
    ];

    if kind == "video" {
        let q: u32 = quality.trim().parse().unwrap_or(1080);
        a.extend([
            "-f".to_string(),
            format!("bv*[height<={q}]+ba/b[height<={q}]/b"),
            "--merge-output-format".to_string(),
            "mp4".to_string(),
        ]);
    } else {
        a.extend([
            "-f".to_string(), "bestaudio/best".to_string(),
            "-x".to_string(), "--audio-format".to_string(), "mp3".to_string(), "--audio-quality".to_string(), "0".to_string(),
        ]);
    }

    if !proxy.is_empty() {
        a.extend(["--proxy".to_string(), proxy.to_string()]);
    }
    a.extend(extra_args());
    a.push(url.to_string());
    a
}

fn num(s: &str) -> Option<f64> {
    s.trim().parse::<f64>().ok()
}

pub fn parse_line(id: &str, line: &str) -> Option<DownloadProgress> {
    let line = line.trim_end();
    
    if line.contains("Extracting URL") || line.contains("Downloading webpage") || line.contains("Downloading m3u8") || line.contains("Downloading 1 format") || line.contains("[download] Destination:") || line.contains("HLS") {
        let mut p = DownloadProgress::new(id, "downloading");
        p.percent = Some(5.0);
        return Some(p);
    }

    if let Some(rest) = line.strip_prefix("[DL] ") {
        let f: Vec<&str> = rest.splitn(6, '|').collect();
        if f.len() < 5 {
            return None;
        }
        let mut p = DownloadProgress::new(id, "downloading");
        p.downloaded = num(f[0]);
        p.total = num(f[1]).or_else(|| num(f[2]));
        p.speed = num(f[3]);
        p.eta = num(f[4]);
        
        if let (Some(down), Some(tot)) = (p.downloaded, p.total) {
            if tot > 0.0 {
                let calc = (down / tot) * 100.0;
                p.percent = Some(if calc > 100.0 { 100.0 } else { calc });
            }
        } else {
            p.percent = Some(45.0);
        }

        p.filename = f.get(5).map(|s| s.trim().to_string()).filter(|s| !s.is_empty() && s != "NA");
        return Some(p);
    }
    if let Some(path) = line.strip_prefix("[FILE] ") {
        let mut p = DownloadProgress::new(id, "file");
        p.filename = Some(path.trim().to_string());
        return Some(p);
    }
    if line.starts_with("[PP]") {
        let mut p = DownloadProgress::new(id, "processing");
        p.percent = Some(100.0);
        return Some(p);
    }
    None
}

struct Running {
    pid: u32,
    cancelled: bool,
    remove_partial: bool,
    files: Vec<String>,
}

static RUNNING: OnceLock<Mutex<HashMap<String, Running>>> = OnceLock::new();

fn running() -> &'static Mutex<HashMap<String, Running>> {
    RUNNING.get_or_init(|| Mutex::new(HashMap::new()))
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

pub fn cancel_download_inner(id: &str, remove_partial: bool) -> bool {
    let pid = {
        let mut m = match running().lock() {
            Ok(m) => m,
            Err(_) => return false,
        };
        match m.get_mut(id) {
            Some(r) => {
                r.cancelled = true;
                r.remove_partial = remove_partial;
                r.pid
            }
            None => return false,
        }
    };
    kill_tree(pid);
    true
}

pub async fn run_download<F>(id: String, program: String, args: Vec<String>, emit: F) -> Result<(), String>
where
    F: Fn(DownloadProgress) + Send + Sync + 'static + Clone, // <--- Adicionado Clone aqui
{
    emit(DownloadProgress::new(&id, "preparing"));

    println!("[DOWNLOAD] A iniciar programa: {} com args: {:?}", program, args);

    let mut cmd = Command::new(&program);
    cmd.args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);

    cmd.env("PYTHONUNBUFFERED", "1");

    #[cfg(windows)]
    cmd.creation_flags(0x0800_0000);

    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            let err_msg = format!("Falha crítica ao iniciar o executável '{}': {e}", program);
            eprintln!("[DOWNLOAD ERROR] {}", err_msg);
            let mut ev = DownloadProgress::new(&id, "error");
            ev.message = Some(err_msg.clone());
            emit(ev);
            return Err(err_msg);
        }
    };

    let stdout = child.stdout.take().ok_or("Sem stdout")?;
    let stderr = child.stderr.take().ok_or("Sem stderr")?;

    if let Ok(mut m) = running().lock() {
        m.insert(
            id.clone(),
            Running { pid: child.id().unwrap_or(0), cancelled: false, remove_partial: false, files: vec![] },
        );
    }

    let err_task = tokio::spawn(async move {
        let mut last = String::new();
        let mut lines = BufReader::new(stderr).lines();
        while let Ok(Some(l)) = lines.next_line().await {
            eprintln!("[yt-dlp stderr] {}", l);
            if !l.trim().is_empty() {
                last = l;
            }
        }
        last
    });

    let mut final_path: Option<String> = None;
    let mut lines = BufReader::new(stdout).lines();
    
    let handle_clone = emit.clone();
    let id_clone = id.clone();
    let progress_ticker = tokio::spawn(async move {
        let mut simulated_pct = 10.0;
        loop {
            tokio::time::sleep(std::time::Duration::from_millis(1200)).await;
            simulated_pct += 15.0;
            if simulated_pct > 85.0 { simulated_pct = 85.0; }
            let mut p = DownloadProgress::new(&id_clone, "downloading");
            p.percent = Some(simulated_pct);
            handle_clone(p);
        }
    });

    while let Ok(Some(line)) = lines.next_line().await {
        println!("[yt-dlp stdout] {}", line);
        if let Some(ev) = parse_line(&id, &line) {
            if ev.phase == "file" {
                final_path = ev.filename.clone();
                continue;
            }
            if ev.phase == "downloading" {
                if let Some(f) = &ev.filename {
                    if let Ok(mut m) = running().lock() {
                        if let Some(r) = m.get_mut(&id) {
                            if !r.files.contains(f) {
                                r.files.push(f.clone());
                            }
                        }
                    }
                }
            }
            emit(ev.clone());
        }
    }

    progress_ticker.abort();

    let status = child.wait().await.map_err(|e| e.to_string())?;
    let last_err = err_task.await.unwrap_or_default();

    let info = running().lock().ok().and_then(|mut m| m.remove(&id));
    if let Some(r) = info.as_ref().filter(|r| r.cancelled) {
        if r.remove_partial {
            for f in &r.files {
                let _ = std::fs::remove_file(format!("{f}.part"));
                let _ = std::fs::remove_file(format!("{f}.ytdl"));
                if final_path.is_none() {
                    let _ = std::fs::remove_file(f);
                }
            }
        }
        emit(DownloadProgress::new(&id, "cancelled"));
        return Ok(());
    }

    if status.success() {
        let mut ev = DownloadProgress::new(&id, "done");
        ev.filename = final_path;
        ev.percent = Some(100.0);
        emit(ev);
        Ok(())
    } else {
        let msg = if last_err.is_empty() { format!("yt-dlp terminou com erro ({status})") } else { last_err };
        let mut ev = DownloadProgress::new(&id, "error");
        ev.message = Some(msg.clone());
        emit(ev);
        Err(msg)
    }
}

pub fn reveal(path: &str) -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        std::process::Command::new("explorer")
            .arg(format!("/select,{}", path.replace('/', "\\")))
            .creation_flags(0x0800_0000)
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open").args(["-R", path]).spawn().map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let dir = std::path::Path::new(path).parent().ok_or("Caminho inválido")?;
        std::process::Command::new("xdg-open").arg(dir).spawn().map_err(|e| e.to_string())?;
        return Ok(());
    }
}

// ---- TAURI ----
use tauri::{AppHandle, Emitter, Manager};

#[tauri::command]
pub async fn download_with_progress(
    app: AppHandle,
    id: String,
    url: String,
    kind: String,
    out_dir: String,
    proxy: String,
    quality: Option<String>,
) -> Result<(), String> {
    let dir = if out_dir.is_empty() {
        app.path().download_dir().map_err(|e| e.to_string())?.to_string_lossy().to_string()
    } else {
        out_dir
    };
    
    let program = ytdlp_program(&app);
    let args = build_args(&url, &kind, &dir, &proxy, quality.as_deref().unwrap_or("1080"));
    let handle = app.clone();
    
    run_download(id, program, args, move |p| {
        let _ = handle.emit("download-progress", p);
    })
    .await
}

#[tauri::command]
pub fn cancel_download(id: String, remove_partial: bool) -> bool {
    cancel_download_inner(&id, remove_partial)
}

#[tauri::command]
pub fn reveal_in_folder(path: String) -> Result<(), String> {
    reveal(&path)
}