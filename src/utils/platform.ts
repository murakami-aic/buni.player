import { invokeGetPlatform } from "../services/tauri";

export type Platform = "win32" | "darwin" | "linux";
export let PLATFORM: Platform = "win32";

export async function initPlatform() {
  PLATFORM = (await invokeGetPlatform()) as Platform;
}
