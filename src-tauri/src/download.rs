//! Download com progresso em tempo real (yt-dlp -> eventos Tauri -> barra de progresso).
//!
//! 1) main.rs / lib.rs:   mod download;
//!                        .invoke_handler(tauri::generate_handler![download::download_with_progress, /* seus outros comandos */])
//! 2) Cargo.toml:         tokio = { version = "1", features = ["process", "io-util"] }
//!                        serde = { version = "1", features = ["derive"] }
//! 3) AJUSTE `ytdlp_program()` e `extra_args()` para usar o mesmo yt-dlp/ffmpeg do seu `run_ytdlp`.

use serde::Serialize;
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

/// Evento enviado ao front-end em "download-progress".
#[derive(Clone, Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub id: String,
    /// "downloading" | "processing" | "done" | "error"
    pub phase: String,
    pub downloaded: Option<f64>,
    pub total: Option<f64>,
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
            speed: None,
            eta: None,
            filename: None,
            message: None,
        }
    }
}

/// Caminho do yt-dlp. TROQUE pelo mesmo que o seu `run_ytdlp` usa (sidecar, pasta do app etc.).
pub fn ytdlp_program() -> String {
    "yt-dlp".to_string()
}

/// Argumentos extras que você já usa (ex.: --ffmpeg-location <pasta>, cookies...).
pub fn extra_args() -> Vec<String> {
    vec![]
}

pub fn build_args(url: &str, kind: &str, out_dir: &str, proxy: &str) -> Vec<String> {
    let mut a: Vec<String> = vec![
        "--newline".into(),
        "--no-playlist".into(),
        "--encoding".into(),
        "utf-8".into(),
        // linhas parseáveis: [DL] baixado|total|total_estimado|velocidade|eta|arquivo
        "--progress-template".into(),
        "download:[DL] %(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s|%(progress.filename)s".into(),
        // etapa de pós-processamento (ffmpeg: converter/mesclar)
        "--progress-template".into(),
        "postprocess:[PP] %(progress.postprocessor)s".into(),
        "-o".into(),
        format!("{}/%(title)s.%(ext)s", out_dir.trim_end_matches(['/', '\\'])),
    ];

    if kind == "video" {
        a.extend(["-f".into(), "bv*[height<=1080]+ba/b".into(), "--merge-output-format".into(), "mp4".into()]);
    } else {
        a.extend([
            "-f".into(), "bestaudio/best".into(),
            "-x".into(), "--audio-format".into(), "mp3".into(), "--audio-quality".into(), "0".into(),
        ]);
    }

    if !proxy.is_empty() {
        a.extend(["--proxy".into(), proxy.to_string()]);
    }
    a.extend(extra_args());
    a.push(url.to_string());
    a
}

fn num(s: &str) -> Option<f64> {
    s.trim().parse::<f64>().ok() // "NA" vira None
}

/// Converte uma linha de saída do yt-dlp em evento (ou None se não for de progresso).
pub fn parse_line(id: &str, line: &str) -> Option<DownloadProgress> {
    let line = line.trim_end();
    if let Some(rest) = line.strip_prefix("[DL] ") {
        // splitn(6): o nome do arquivo (último) pode conter '|'
        let f: Vec<&str> = rest.splitn(6, '|').collect();
        if f.len() < 5 {
            return None;
        }
        let mut p = DownloadProgress::new(id, "downloading");
        p.downloaded = num(f[0]);
        p.total = num(f[1]).or_else(|| num(f[2]));
        p.speed = num(f[3]);
        p.eta = num(f[4]);
        p.filename = f.get(5).map(|s| s.trim().to_string()).filter(|s| !s.is_empty() && s != "NA");
        return Some(p);
    }
    if line.starts_with("[PP]") {
        return Some(DownloadProgress::new(id, "processing"));
    }
    None
}

/// Executa o yt-dlp e chama `emit` a cada atualização. Independente do Tauri (fácil de testar).
pub async fn run_download<F>(id: String, program: String, args: Vec<String>, emit: F) -> Result<(), String>
where
    F: Fn(DownloadProgress) + Send + Sync + 'static,
{
    let mut cmd = Command::new(&program);
    cmd.args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    #[cfg(windows)]
    cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW: não abre janela de console

    let mut child = cmd.spawn().map_err(|e| format!("Falha ao iniciar o yt-dlp: {e}"))?;
    let stdout = child.stdout.take().ok_or("Sem stdout")?;
    let stderr = child.stderr.take().ok_or("Sem stderr")?;

    // guarda a última mensagem de erro (stderr) para mostrar ao usuário
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

    emit(DownloadProgress::new(&id, "downloading"));

    let mut lines = BufReader::new(stdout).lines();
    while let Ok(Some(line)) = lines.next_line().await {
        if let Some(ev) = parse_line(&id, &line) {
            emit(ev);
        }
    }

    let status = child.wait().await.map_err(|e| e.to_string())?;
    let last_err = err_task.await.unwrap_or_default();

    if status.success() {
        emit(DownloadProgress::new(&id, "done"));
        Ok(())
    } else {
        let msg = if last_err.is_empty() { format!("yt-dlp terminou com erro ({status})") } else { last_err };
        let mut ev = DownloadProgress::new(&id, "error");
        ev.message = Some(msg.clone());
        emit(ev);
        Err(msg)
    }
}

// ---- TAURI ----
use tauri::{AppHandle, Emitter, Manager};

/// `outDir` vazio = pasta Downloads do usuário.
#[tauri::command]
pub async fn download_with_progress(
    app: AppHandle,
    id: String,
    url: String,
    kind: String,
    out_dir: String,
    proxy: String,
) -> Result<(), String> {
    let dir = if out_dir.is_empty() {
        app.path().download_dir().map_err(|e| e.to_string())?.to_string_lossy().to_string()
    } else {
        out_dir
    };
    let args = build_args(&url, &kind, &dir, &proxy);
    let handle = app.clone();
    run_download(id, ytdlp_program(), args, move |p| {
        let _ = handle.emit("download-progress", p);
    })
    .await
}
