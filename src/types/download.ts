export interface DownloadProgress {
  trackId: number;
  percent: number;
  speed: string;
  eta: string;
  status: "downloading" | "processing" | "complete" | "error";
  error?: string;
}
