use std::process::Command;
use tauri::Manager;

// Declara o módulo download.rs que gere o progresso e cancelamento
mod download;

// Localiza o executável do yt-dlp no ambiente Tauri ou no sistema
fn get_ytdlp_executable(app_handle: &tauri::AppHandle) -> String {
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

fn fetch_ytdlp_url(ytdlp_bin: &str, url: &str, fmt: &str, proxy: &str) -> Result<String, String> {
    let mut cmd = Command::new(ytdlp_bin);
    let mut args = vec!["-g".to_string(), "-f".to_string(), fmt.to_string(), url.to_string()];
    
    if !proxy.is_empty() {
        args.insert(0, proxy.to_string());
        args.insert(0, "--proxy".to_string());
    }

    let output = cmd.args(&args).output();

    match output {
        Ok(res) => {
            if res.status.success() {
                let stdout = String::from_utf8_lossy(&res.stdout).trim().to_string();
                let direct_url = stdout.lines().next().unwrap_or("").to_string();
                if direct_url.is_empty() {
                    Err("URL vazia retornada pelo yt-dlp.".to_string())
                } else {
                    Ok(direct_url)
                }
            } else {
                Err(String::from_utf8_lossy(&res.stderr).to_string())
            }
        }
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn run_ytdlp(app_handle: tauri::AppHandle, url: String, proxy: String) -> Result<String, String> {
    let ytdlp_bin = get_ytdlp_executable(&app_handle);
    let mut cmd = Command::new(ytdlp_bin);
    
    let mut args = vec![url];
    if !proxy.is_empty() {
        args.insert(0, proxy);
        args.insert(0, "--proxy".to_string());
    }

    let output = cmd.args(&args).output();

    match output {
        Ok(res) => {
            if res.status.success() {
                Ok(String::from_utf8_lossy(&res.stdout).to_string())
            } else {
                Err(String::from_utf8_lossy(&res.stderr).to_string())
            }
        }
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn analyze_playlist(app_handle: tauri::AppHandle, url: String, proxy: String) -> Result<String, String> {
    let ytdlp_bin = get_ytdlp_executable(&app_handle);
    let mut cmd = Command::new(ytdlp_bin);
    
    let mut args = vec!["--flat-playlist".to_string(), "--dump-json".to_string(), url];
    if !proxy.is_empty() {
        args.insert(0, proxy);
        args.insert(0, "--proxy".to_string());
    }

    let output = cmd.args(&args).output();

    match output {
        Ok(res) => {
            if res.status.success() {
                Ok(String::from_utf8_lossy(&res.stdout).to_string())
            } else {
                Err(String::from_utf8_lossy(&res.stderr).to_string())
            }
        }
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn get_stream_url(app_handle: tauri::AppHandle, url: String, proxy: String) -> Result<serde_json::Value, String> {
    let ytdlp_bin = get_ytdlp_executable(&app_handle);

    // 1. Obtém o stream de áudio puro
    let audio_url = fetch_ytdlp_url(&ytdlp_bin, &url, "ba", &proxy)?;

    // 2. Obtém o stream de vídeo unificado compatível
    let video_url = fetch_ytdlp_url(&ytdlp_bin, &url, "best[height<=720][ext=mp4]/best[ext=mp4]/best", &proxy).unwrap_or_default();

    Ok(serde_json::json!({
        "audio": audio_url,
        "video": video_url
    }))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            run_ytdlp,
            analyze_playlist,
            get_stream_url,
            // Comandos essenciais para o progresso, cancelamento e gestão de pastas:
            download::download_with_progress,
            download::cancel_download,
            download::reveal_in_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}