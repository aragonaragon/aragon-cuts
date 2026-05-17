use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

#[derive(Deserialize, Debug)]
pub struct EncodeRequest {
    pub clip_id: String,
    pub input_path: String,
    pub in_seconds: f64,
    pub out_seconds: f64,
    pub use_nvenc: bool,
    pub watermark: Option<String>,
    pub watermark_style: Option<String>,
    pub hook_text: Option<String>,
    pub hook_duration: f64,
    /// Source audio codec name from ffprobe (e.g. "aac", "pcm_s16le").
    /// Used to decide whether `-c:a copy` is safe or audio must be re-encoded
    /// to AAC for the MP4 muxer.
    pub source_audio_codec: Option<String>,
}

fn audio_codec_args(source_codec: Option<&str>) -> Vec<String> {
    // Codecs the MP4 muxer accepts directly. Everything else must be
    // re-encoded to AAC (otherwise ffmpeg exits with errors like
    // "Could not find tag for codec pcm_s16le in stream").
    let copy_ok = source_codec
        .map(|c| c.to_ascii_lowercase())
        .map(|c| {
            matches!(
                c.as_str(),
                "aac" | "mp3" | "ac3" | "eac3" | "alac" | "mp4a" | "opus"
            )
        })
        .unwrap_or(false);
    if copy_ok {
        ["-c:a", "copy"].iter().map(|s| s.to_string()).collect()
    } else {
        ["-c:a", "aac", "-b:a", "192k", "-ac", "2"]
            .iter()
            .map(|s| s.to_string())
            .collect()
    }
}

#[derive(Serialize, Debug)]
pub struct EncodeResult {
    pub output_path: String,
}

#[derive(Serialize, Clone, Debug)]
struct EncodeProgress {
    clip_id: String,
    percent: f64,
    speed: Option<f64>,
    elapsed_seconds: f64,
    total_seconds: f64,
}

// Defensive pipeline for 10-bit / HDR / AV1 sources (common with NVIDIA
// ShadowPlay, NVIDIA Record, and modern game captures). h264_nvenc rejects
// anything that isn't plain 8-bit 4:2:0 with regular timestamps:
//   - `format=yuv420p` at the input strips bit-depth + chroma to 8-bit 4:2:0
//   - `setpts=PTS-STARTPTS` resets the timestamp base after `-ss` trim so
//     NVENC doesn't see negative or huge PTS values
//   - a final `format=yuv420p` after the overlay is belt-and-suspenders for
//     any intermediate filter that promoted the format
const BASE_BLURRED_BG: &str = "[0:v]format=yuv420p,setpts=PTS-STARTPTS,split=2[orig][bg];[bg]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,gblur=sigma=20[bgblur];[orig]scale=1080:-2[fg];[bgblur][fg]overlay=(W-w)/2:(H-h)/2,format=yuv420p";

fn sanitize_text(text: &str, max_len: usize) -> String {
    text.chars()
        .filter(|c| {
            !matches!(
                c,
                '\'' | '"' | '\\' | ':' | ';' | ',' | '%' | '<' | '>' | '|' | '$' | '*' | '?' | '='
            ) && !c.is_control()
        })
        .take(max_len)
        .collect::<String>()
        .trim()
        .to_string()
}

const FONT_PATH: &str = "C\\:/Windows/Fonts/arialbd.ttf";

/// Channel-name watermark in the TOP blurred zone, centered horizontally.
/// The visual treatment (boxed, minimal, gold pill, outline) is chosen by `style`.
fn watermark_drawtext(text: &str, style: &str) -> String {
    // Common position: centered horizontally, vertical center at ~16% of height
    // (places it roughly in the middle of the top blurred area for 16:9 sources).
    let common = "x=(w-text_w)/2:y=(h*0.16)-(text_h/2):text_shaping=1";

    let body = match style {
        // Minimal: clean white text with a soft drop shadow — no surrounding box.
        "minimal" => format!(
            "fontsize=64:fontcolor=white:{common}:shadowcolor=black@0.85:shadowx=3:shadowy=3"
        ),
        // Gold: dark text inside a solid gold pill.
        "gold" => format!(
            "fontsize=58:fontcolor=0x1A1A1B:{common}:box=1:boxcolor=0xC9A14A@0.95:boxborderw=26"
        ),
        // Outline: bold dark text with a thick gold outline, no box.
        "outline" => format!(
            "fontsize=66:fontcolor=0x1A1A1B@0.96:{common}:borderw=5:bordercolor=0xC9A14A"
        ),
        // Boxed (default): white text in a translucent black pill with a thin gold border.
        _ => format!(
            "fontsize=64:fontcolor=white:{common}:box=1:boxcolor=black@0.55:boxborderw=26:borderw=2:bordercolor=0xC9A14A@0.5"
        ),
    };

    format!(",drawtext=text='{}':fontfile='{}':{}", text, FONT_PATH, body)
}

fn hook_drawtext(text: &str, duration: f64) -> String {
    let duration = duration.clamp(0.5, 10.0);
    let fade = (duration / 4.0).min(0.18).max(0.05);
    let fade_out_start = duration - fade;
    // Hook text: large gold headline in the BOTTOM blurred zone below the
    // source video, centered horizontally. Fades in and out.
    format!(
        ",drawtext=text='{}':fontfile='{}':fontsize=96:fontcolor=0xC9A14A:x=(w-text_w)/2:y=(h*0.83)-(text_h/2):shadowcolor=black@0.85:shadowx=4:shadowy=4:borderw=2:bordercolor=black@0.6:text_shaping=1:alpha='if(lt(t,{f}), t/{f}, if(gt(t,{fos}), max(0\\,({d}-t)/{f}), 1))':enable='between(t,0,{d})'",
        text,
        FONT_PATH,
        f = format!("{:.3}", fade),
        fos = format!("{:.3}", fade_out_start),
        d = format!("{:.3}", duration),
    )
}

fn build_filter(
    watermark: Option<&str>,
    watermark_style: Option<&str>,
    hook_text: Option<&str>,
    hook_duration: f64,
) -> String {
    let mut chain = BASE_BLURRED_BG.to_string();

    if let Some(text) = watermark
        .map(|t| sanitize_text(t, 48))
        .filter(|s| !s.is_empty())
    {
        let style = watermark_style.unwrap_or("boxed");
        chain.push_str(&watermark_drawtext(&text, style));
    }

    if let Some(text) = hook_text
        .map(|t| sanitize_text(t, 48))
        .filter(|s| !s.is_empty())
    {
        chain.push_str(&hook_drawtext(&text, hook_duration));
    }

    chain.push_str("[vout]");
    chain
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
    let filter = build_filter(
        req.watermark.as_deref(),
        req.watermark_style.as_deref(),
        req.hook_text.as_deref(),
        req.hook_duration,
    );

    let mut args: Vec<String> = vec![
        "-y".into(),
        "-hide_banner".into(),
        "-nostats".into(),
        "-progress".into(),
        "pipe:2".into(),
        "-stats_period".into(),
        "0.5".into(),
        "-fflags".into(),
        "+genpts".into(),
    ];

    // When NVENC is in use, route decoding through CUDA as well. This lights
    // up the full GPU pipeline (e.g. av1_cuvid -> ... -> h264_nvenc) and
    // — crucially — sidesteps libaom-av1's refusal to decode AV1 Level 6
    // streams written by NVIDIA's own AV1 encoder (ShadowPlay / NVIDIA
    // Record at 4K@60 use seq_level_idx=23, which libaom rejects).
    if req.use_nvenc {
        args.extend(["-hwaccel", "cuda"].iter().map(|s| s.to_string()));
    }

    args.extend(
        [
            "-ss",
            &format!("{:.3}", req.in_seconds),
            "-i",
            &req.input_path,
            "-t",
            &format!("{:.3}", duration),
            "-filter_complex",
            &filter,
            "-map",
            "[vout]",
            "-map",
            "0:a?",
            // Force 8-bit 4:2:0 BEFORE picking the encoder so NVENC negotiates
            // its input format correctly. The filter graph also outputs yuv420p
            // but specifying it again here is cheap insurance.
            "-pix_fmt",
            "yuv420p",
        ]
        .iter()
        .map(|s| s.to_string()),
    );

    if req.use_nvenc {
        // Minimal NVENC config: preset + constant-quality target only.
        // Removing -tune, explicit -rc, and -maxrate/-bufsize because some
        // driver/source combinations (notably 4K AV1 + HDR captures from
        // NVIDIA Record) reject the more elaborate VBR configuration with
        // a generic -22 "invalid argument" error during encoder init.
        args.extend(
            ["-c:v", "h264_nvenc", "-preset", "p5", "-cq", "23"]
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

    args.extend(audio_codec_args(req.source_audio_codec.as_deref()));
    args.extend(
        ["-movflags", "+faststart", output]
            .iter()
            .map(|s| s.to_string()),
    );

    args
}

/// Parses an `out_time_us=NNNN` line from `-progress pipe:2` output
/// and returns the elapsed encode time in seconds.
fn parse_progress_time(line: &str) -> Option<f64> {
    let value = line.strip_prefix("out_time_us=")?.trim();
    let us: i64 = value.parse().ok()?;
    if us < 0 {
        return None;
    }
    Some(us as f64 / 1_000_000.0)
}

/// Parses a `speed=N.NNx` line. The trailing `x` is optional in some builds.
fn parse_progress_speed(line: &str) -> Option<f64> {
    let value = line.strip_prefix("speed=")?.trim();
    let value = value.trim_end_matches('x').trim();
    if value == "N/A" {
        return None;
    }
    value.parse().ok()
}

#[tauri::command]
pub async fn encode_short(app: AppHandle, req: EncodeRequest) -> Result<EncodeResult, String> {
    let output_path = build_output_path(&req.input_path, req.in_seconds, req.out_seconds);
    let output_str = output_path.to_string_lossy().to_string();
    let total = (req.out_seconds - req.in_seconds).max(0.001);
    let clip_id = req.clip_id.clone();

    // Initial progress event so the UI flips from "pending" to "0%" immediately.
    let _ = app.emit(
        "encode:progress",
        EncodeProgress {
            clip_id: clip_id.clone(),
            percent: 0.0,
            speed: None,
            elapsed_seconds: 0.0,
            total_seconds: total,
        },
    );

    let args = build_args(&req, &output_str);
    let (mut rx, _child) = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| e.to_string())?
        .args(args)
        .spawn()
        .map_err(|e| format!("ffmpeg spawn failed: {}", e))?;

    let mut stderr_buf = String::new();
    let mut current_elapsed: Option<f64> = None;
    let mut current_speed: Option<f64> = None;

    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stderr(bytes) => {
                let s = String::from_utf8_lossy(&bytes);
                // `-progress pipe:2` writes one key=value per line, separated by \n.
                // Errors/warnings from -hide_banner also come through here.
                for raw_line in s.split(|c: char| c == '\n' || c == '\r') {
                    let line = raw_line.trim();
                    if line.is_empty() {
                        continue;
                    }
                    stderr_buf.push_str(line);
                    stderr_buf.push('\n');

                    if let Some(t) = parse_progress_time(line) {
                        current_elapsed = Some(t);
                    } else if let Some(sp) = parse_progress_speed(line) {
                        current_speed = Some(sp);
                    } else if line == "progress=continue" || line == "progress=end" {
                        if let Some(elapsed) = current_elapsed {
                            let percent = ((elapsed / total) * 100.0).clamp(0.0, 100.0);
                            let _ = app.emit(
                                "encode:progress",
                                EncodeProgress {
                                    clip_id: clip_id.clone(),
                                    percent,
                                    speed: current_speed,
                                    elapsed_seconds: elapsed,
                                    total_seconds: total,
                                },
                            );
                        }
                        current_elapsed = None;
                        current_speed = None;
                    }
                }
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

    // Final 100% so the UI doesn't get stuck below the finish line.
    let _ = app.emit(
        "encode:progress",
        EncodeProgress {
            clip_id: clip_id.clone(),
            percent: 100.0,
            speed: None,
            elapsed_seconds: total,
            total_seconds: total,
        },
    );

    Ok(EncodeResult {
        output_path: output_str,
    })
}
