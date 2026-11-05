import { access } from "node:fs/promises";
import { delimiter, join } from "node:path";

/** Finds an installed Edge, Chrome, or Chromium executable. */
export async function findBrowser(explicit: string | undefined): Promise<string> {
  const candidates: string[] = [];
  if (explicit !== undefined) {
    candidates.push(explicit);
  } else {
    if (process.platform === "win32") {
      for (const root of [
        process.env.ProgramFiles,
        process.env["ProgramFiles(x86)"],
        process.env.LOCALAPPDATA,
      ]) {
        if (root !== undefined) {
          candidates.push(
            join(root, "Microsoft", "Edge", "Application", "msedge.exe"),
            join(root, "Google", "Chrome", "Application", "chrome.exe"),
          );
        }
      }
    } else if (process.platform === "darwin") {
      for (const root of ["/Applications", join(process.env.HOME ?? "", "Applications")]) {
        for (const [application, executable] of [
          ["Microsoft Edge", "Microsoft Edge"],
          ["Google Chrome", "Google Chrome"],
          ["Chromium", "Chromium"],
        ] as const) {
          candidates.push(join(root, `${application}.app`, "Contents", "MacOS", executable));
        }
      }
    }
    for (const directory of (process.env.PATH ?? "").split(delimiter)) {
      for (const name of process.platform === "win32"
        ? ["msedge.exe", "chrome.exe"]
        : [
            "microsoft-edge",
            "microsoft-edge-stable",
            "google-chrome",
            "google-chrome-stable",
            "chromium",
            "chromium-browser",
          ]) {
        candidates.push(join(directory, name));
      }
    }
  }
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {}
  }
  throw new Error(
    "No Chromium browser is found. Install Edge or Chrome, or pass --browser with its executable path.",
  );
}
