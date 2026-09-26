use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;

#[tauri::command]
pub async fn detect_encoder(app: AppHandle) -> Result<String, String> {
    let cmd = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| e.to_string())?
        .args(["-hide_banner", "-encoders"]);

    let output = cmd.output().await.map_err(|e| e.to_string())?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    #[cfg(target_os = "macos")]
    if stdout.contains("h264_videotoolbox") || stderr.contains("h264_videotoolbox") {
        return Ok("videotoolbox".to_string());
    }

    #[cfg(target_os = "windows")]
    if stdout.contains("h264_nvenc") || stderr.contains("h264_nvenc") {
        return Ok("nvenc".to_string());
    }

    Ok("software".to_string())
}
