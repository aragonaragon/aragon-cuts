use serde::Serialize;
use sha1::{Digest, Sha1};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::UNIX_EPOCH;
use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;
use tokio::task::JoinSet;

const THUMB_COUNT: usize = 30;
const THUMB_WIDTH: u32 = 160;

#[derive(Serialize, Debug)]
pub struct ThumbnailStrip {
    pub paths: Vec<String>,
}

fn cache_key(path: &str) -> String {
    let mtime_secs: u64 = std::fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let mut hasher = Sha1::new();
    hasher.update(path.as_bytes());
    hasher.update(mtime_secs.to_le_bytes());
    hex::encode(hasher.finalize())
}

fn cache_dir(key: &str) -> PathBuf {
    let mut p = std::env::temp_dir();
    p.push("shorts-maker");
    p.push("thumbs");
    p.push(key);
    p
}

async fn extract_single(
    app: Arc<AppHandle>,
    input: Arc<String>,
    timestamp: f64,
    output: PathBuf,
) -> Result<(), String> {
    let out_str = output.to_string_lossy().to_string();
    let cmd = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| e.to_string())?
        .args([
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-ss",
            &format!("{:.3}", timestamp),
            "-i",
            input.as_str(),
            "-frames:v",
            "1",
            "-vf",
            &format!("scale={}:-2", THUMB_WIDTH),
            "-q:v",
            "5",
            &out_str,
        ]);
    let output = cmd.output().await.map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(format!(
            "ffmpeg thumbnail failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    Ok(())
}

#[tauri::command]
pub async fn generate_thumbnails(
    app: AppHandle,
    video_path: String,
    duration: f64,
) -> Result<ThumbnailStrip, String> {
    if duration <= 0.0 {
        return Ok(ThumbnailStrip { paths: vec![] });
    }

    let key = cache_key(&video_path);
    let dir = cache_dir(&key);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    // Pre-fill with existing cached paths; collect indices that still need work.
    let mut paths = vec![String::new(); THUMB_COUNT];
    let mut needed: Vec<(usize, f64, PathBuf)> = Vec::new();
    for i in 0..THUMB_COUNT {
        let path = dir.join(format!("{:02}.jpg", i));
        if path.exists() {
            paths[i] = path.to_string_lossy().to_string();
        } else {
            let t = ((i as f64) + 0.5) / (THUMB_COUNT as f64) * duration;
            needed.push((i, t, path));
        }
    }

    if needed.is_empty() {
        return Ok(ThumbnailStrip { paths });
    }

    let app = Arc::new(app);
    let input = Arc::new(video_path);
    let mut set: JoinSet<Result<(usize, String), String>> = JoinSet::new();

    for (i, t, out) in needed {
        let app = app.clone();
        let input = input.clone();
        let out_for_result = out.to_string_lossy().to_string();
        set.spawn(async move {
            extract_single(app, input, t, out).await?;
            Ok((i, out_for_result))
        });
    }

    let mut first_error: Option<String> = None;
    while let Some(result) = set.join_next().await {
        match result {
            Ok(Ok((i, p))) => paths[i] = p,
            Ok(Err(e)) => {
                if first_error.is_none() {
                    first_error = Some(e);
                }
            }
            Err(e) => {
                if first_error.is_none() {
                    first_error = Some(e.to_string());
                }
            }
        }
    }

    // If at least one thumbnail was generated, return what we got. Otherwise propagate the error.
    if paths.iter().all(|p| p.is_empty()) {
        return Err(first_error.unwrap_or_else(|| "no thumbnails generated".to_string()));
    }

    Ok(ThumbnailStrip { paths })
}
