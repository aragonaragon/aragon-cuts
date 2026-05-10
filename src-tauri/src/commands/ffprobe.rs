use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct VideoInfo {
    pub path: String,
    pub filename: String,
    pub width: u32,
    pub height: u32,
    pub duration: f64,
    pub fps: f64,
    pub video_codec: String,
    pub audio_codec: Option<String>,
    pub bitrate: Option<u64>,
    pub size_bytes: u64,
}

#[derive(Deserialize, Debug)]
struct ProbeOutput {
    streams: Vec<ProbeStream>,
    format: ProbeFormat,
}

#[derive(Deserialize, Debug)]
struct ProbeStream {
    codec_type: String,
    codec_name: Option<String>,
    width: Option<u32>,
    height: Option<u32>,
    r_frame_rate: Option<String>,
    avg_frame_rate: Option<String>,
}

#[derive(Deserialize, Debug)]
struct ProbeFormat {
    duration: Option<String>,
    bit_rate: Option<String>,
    size: Option<String>,
}

fn parse_fraction(s: &str) -> Option<f64> {
    let mut parts = s.split('/');
    let num: f64 = parts.next()?.parse().ok()?;
    let den: f64 = parts.next()?.parse().ok()?;
    if den == 0.0 {
        return None;
    }
    Some(num / den)
}

#[tauri::command]
pub async fn probe_video(app: AppHandle, path: String) -> Result<VideoInfo, String> {
    let cmd = app
        .shell()
        .sidecar("ffprobe")
        .map_err(|e| e.to_string())?
        .args([
            "-v",
            "error",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            &path,
        ]);

    let output = cmd.output().await.map_err(|e| e.to_string())?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ffprobe failed: {}", err));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let probed: ProbeOutput =
        serde_json::from_str(&stdout).map_err(|e| format!("ffprobe JSON parse: {}", e))?;

    let video = probed
        .streams
        .iter()
        .find(|s| s.codec_type == "video")
        .ok_or_else(|| "no video stream found".to_string())?;

    let audio = probed.streams.iter().find(|s| s.codec_type == "audio");

    let fps = video
        .avg_frame_rate
        .as_deref()
        .and_then(parse_fraction)
        .or_else(|| video.r_frame_rate.as_deref().and_then(parse_fraction))
        .unwrap_or(0.0);

    let duration: f64 = probed
        .format
        .duration
        .as_deref()
        .and_then(|d| d.parse().ok())
        .unwrap_or(0.0);

    let bitrate: Option<u64> = probed
        .format
        .bit_rate
        .as_deref()
        .and_then(|b| b.parse().ok());

    let size_bytes: u64 = probed
        .format
        .size
        .as_deref()
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);

    let filename = std::path::Path::new(&path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_string();

    Ok(VideoInfo {
        path,
        filename,
        width: video.width.unwrap_or(0),
        height: video.height.unwrap_or(0),
        duration,
        fps,
        video_codec: video.codec_name.clone().unwrap_or_default(),
        audio_codec: audio.and_then(|a| a.codec_name.clone()),
        bitrate,
        size_bytes,
    })
}
