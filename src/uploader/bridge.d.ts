export interface UploadJob {
  id: number;
  name: string;
  data: string;
  /** 한 번 되올리기(2026-11-05 · sg-uploader 1.2.0) — 내전 판만 · 마감한 달에도 리플레이 · 기본 정보를 머지한다. */
  restore?: boolean;
}

export interface UploaderBridge {
  onJob(handler: (job: UploadJob) => Promise<unknown>): void;
  onLogout(handler: () => Promise<void>): void;
  emit(event: "ready" | "needs-login" | "login-ok", payload?: unknown): void;
}

declare global {
  interface Window {
    stargateUploader?: UploaderBridge;
  }
}
