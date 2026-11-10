use std::process::Command;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use tauri::Manager;

// Declara o módulo download.rs que gere o progresso e cancelamento
mod download;

/// Constante do Windows para impedir o aparecimento da janela de consola (CREATE_NO_WINDOW = 0x08000000)
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

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

    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);

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

    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);

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

    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);

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

/// 🔍 Inspeciona o vídeo e retorna as alturas (resoluções) reais disponíveis
#[tauri::command]
async fn get_available_qualities(app_handle: tauri::AppHandle, url: String, proxy: String) -> Result<Vec<u32>, String> {
    let ytdlp_bin = get_ytdlp_executable(&app_handle);
    let mut cmd = Command::new(ytdlp_bin);
    
    let mut args = vec!["--dump-json".to_string(), "--no-playlist".to_string(), url];
    if !proxy.is_empty() {
        args.insert(0, proxy);
        args.insert(0, "--proxy".to_string());
    }

    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let output = cmd.args(&args).output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).into());
    }

    let json_str = String::from_utf8_lossy(&output.stdout);
    let parsed: serde_json::Value = serde_json::from_str(&json_str).map_err(|e| e.to_string())?;

    let mut heights = Vec::new();
    if let Some(formats) = parsed["formats"].as_array() {
        for f in formats {
            if let Some(h) = f["height"].as_u64() {
                let h_u32 = h as u32;
                if h_u32 >= 144 && !heights.contains(&h_u32) {
                    heights.push(h_u32);
                }
            }
        }
    }

    heights.sort_by(|a, b| b.cmp(a));
    Ok(heights)
}

#[tauri::command]
async fn get_stream_url(
    app_handle: tauri::AppHandle, 
    url: String, 
    proxy: String, 
    _video_mode: bool, 
    quality: Option<String>
) -> Result<serde_json::Value, String> {
    let ytdlp_bin = get_ytdlp_executable(&app_handle);
    let q = quality.unwrap_or_else(|| "1080".to_string());

    // 1. Obtém o stream de áudio puro
    let audio_url = fetch_ytdlp_url(&ytdlp_bin, &url, "ba", &proxy)?;

    // 2. Obtém o stream de vídeo adaptado à qualidade escolhida (ex: height<=1080)
    let fmt_video = format!("bv*[height<={q}]+ba/b[height<={q}]/b");
    let video_url = fetch_ytdlp_url(&ytdlp_bin, &url, &fmt_video, &proxy).unwrap_or_default();

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
            get_available_qualities,
            get_stream_url,
            download::download_with_progress,
            download::cancel_download,
            download::reveal_in_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}