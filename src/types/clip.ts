export type ClipStatus =
  | { kind: "pending" }
  | { kind: "encoding"; percent: number; speed: number | null }
  | { kind: "done"; outputPath: string }
  | { kind: "failed"; message: string };

export type Clip = {
  id: string;
  inSeconds: number;
  outSeconds: number;
  status: ClipStatus;
};

export function newClipId(): string {
  return `clip_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export type EncodeProgressEvent = {
  clip_id: string;
  percent: number;
  speed: number | null;
  elapsed_seconds: number;
  total_seconds: number;
};
