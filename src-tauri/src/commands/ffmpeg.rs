use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::AppHandle;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

#[derive(Deserialize, Debug)]
pub struct EncodeRequest {
    pub input_path: String,
    pub in_seconds: f64,
    pub out_seconds: f64,
    pub use_nvenc: bool,
    pub watermark: Option<String>,
}

#[derive(Serialize, Debug)]
pub struct EncodeResult {
    pub output_path: String,
}

const BASE_BLURRED_BG: &str = "[0:v]split=2[orig][bg];[bg]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,gblur=sigma=20[bgblur];[orig]scale=1080:-2[fg];[bgblur][fg]overlay=(W-w)/2:(H-h)/2:format=auto";

fn sanitize_watermark(text: &str) -> String {
    text.chars()
        .filter(|c| {
            !matches!(
                c,
                '\'' | '"' | '\\' | ':' | ';' | ',' | '%' | '<' | '>' | '|' | '$' | '*' | '?' | '='
            ) && !c.is_control()
        })
        .take(48)
        .collect::<String>()
        .trim()
        .to_string()
}

fn build_filter(watermark: Option<&str>) -> String {
    let watermark = watermark
        .map(sanitize_watermark)
        .filter(|s| !s.is_empty());

    match watermark {
        None => format!("{}[vout]", BASE_BLURRED_BG),
        Some(text) => {
            format!(
                "{},drawtext=text='{}':fontfile='C\\:/Windows/Fonts/arialbd.ttf':fontsize=42:fontcolor=white@0.88:x=w-text_w-36:y=84:shadowcolor=black@0.7:shadowx=2:shadowy=2[vout]",
                BASE_BLURRED_BG, text
            )
        }
    }
}

fn build_output_path(input: &str, in_s: f64, out_s: f64) -> PathBuf {
    let p = Path::new(input);
    let parent = p.parent().unwrap_or_else(|| Path::new(".")).to_path_buf();
    let stem = p
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("output");

    let output_dir = parent.join(format!("{}_shorts", stem));
    let _ = std::fs::create_dir_all(&output_dir);

    let in_int = in_s.max(0.0).round() as u64;
    let out_int = out_s.max(0.0).round() as u64;
    let base = format!("clip_{}-{}s", in_int, out_int);
    let mut candidate = output_dir.join(format!("{}.mp4", base));
    let mut counter = 1;
    while candidate.exists() {
        candidate = output_dir.join(format!("{} ({}).mp4", base, counter));
        counter += 1;
    }
    candidate
}

fn build_args(req: &EncodeRequest, output: &str) -> Vec<String> {
    let duration = (req.out_seconds - req.in_seconds).max(0.001);
    let filter = build_filter(req.watermark.as_deref());

    let mut args: Vec<String> = vec![
        "-y".into(),
        "-ss".into(),
        format!("{:.3}", req.in_seconds),
        "-i".into(),
        req.input_path.clone(),
        "-t".into(),
        format!("{:.3}", duration),
        "-filter_complex".into(),
        filter,
        "-map".into(),
        "[vout]".into(),
        "-map".into(),
        "0:a?".into(),
    ];

    if req.use_nvenc {
        args.extend(
            [
                "-c:v",
                "h264_nvenc",
                "-preset",
                "p5",
                "-tune",
                "hq",
                "-rc",
                "vbr",
                "-cq",
                "20",
                "-b:v",
                "0",
                "-maxrate",
                "12M",
                "-bufsize",
                "24M",
            ]
            .iter()
            .map(|s| s.to_string()),
        );
    } else {
        args.extend(
            ["-c:v", "libx264", "-preset", "medium", "-crf", "20"]
                .iter()
                .map(|s| s.to_string()),
        );
    }

    args.extend(
        [
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "copy",
            "-movflags",
            "+faststart",
            output,
        ]
        .iter()
        .map(|s| s.to_string()),
    );

    args
}

#[tauri::command]
pub async fn encode_short(app: AppHandle, req: EncodeRequest) -> Result<EncodeResult, String> {
    let output_path = build_output_path(&req.input_path, req.in_seconds, req.out_seconds);
    let output_str = output_path.to_string_lossy().to_string();

    let args = build_args(&req, &output_str);
    let (mut rx, _child) = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| e.to_string())?
        .args(args)
        .spawn()
        .map_err(|e| format!("ffmpeg spawn failed: {}", e))?;

    let mut stderr_buf = String::new();
    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stderr(line) => {
                let s = String::from_utf8_lossy(&line);
                stderr_buf.push_str(&s);
                stderr_buf.push('\n');
            }
            CommandEvent::Stdout(_) => {}
            CommandEvent::Error(e) => {
                return Err(format!("ffmpeg error: {} | log: {}", e, stderr_buf));
            }
            CommandEvent::Terminated(payload) => {
                if payload.code != Some(0) {
                    return Err(format!(
                        "ffmpeg exited with code {:?}\n{}",
                        payload.code, stderr_buf
                    ));
                }
                break;
            }
            _ => {}
        }
    }

    Ok(EncodeResult {
        output_path: output_str,
    })
}
