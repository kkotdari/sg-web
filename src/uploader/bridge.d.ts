export interface UploadJob {
  id: number;
  name: string;
  data: string;
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
