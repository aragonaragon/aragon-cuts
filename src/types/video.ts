export type VideoInfo = {
  path: string;
  filename: string;
  width: number;
  height: number;
  duration: number;
  fps: number;
  videoCodec: string;
  audioCodec: string | null;
  bitrate: number | null;
  sizeBytes: number;
};

export type RawVideoInfo = {
  path: string;
  filename: string;
  width: number;
  height: number;
  duration: number;
  fps: number;
  video_codec: string;
  audio_codec: string | null;
  bitrate: number | null;
  size_bytes: number;
};

export function fromRaw(r: RawVideoInfo): VideoInfo {
  return {
    path: r.path,
    filename: r.filename,
    width: r.width,
    height: r.height,
    duration: r.duration,
    fps: r.fps,
    videoCodec: r.video_codec,
    audioCodec: r.audio_codec,
    bitrate: r.bitrate,
    sizeBytes: r.size_bytes,
  };
}
