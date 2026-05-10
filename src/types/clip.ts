export type ClipStatus =
  | { kind: "pending" }
  | { kind: "encoding" }
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
