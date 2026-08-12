import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import process from "node:process";

const candidates = {
  darwin: [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    join(
      homedir(),
      "Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    ),
  ],
  win32: [
    join(
      process.env.PROGRAMFILES ?? "C:\\Program Files",
      "Google",
      "Chrome",
      "Application",
      "chrome.exe",
    ),
    join(
      process.env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)",
      "Google",
      "Chrome",
      "Application",
      "chrome.exe",
    ),
    join(
      process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"),
      "Google",
      "Chrome",
      "Application",
      "chrome.exe",
    ),
  ],
  linux: [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/snap/bin/chromium",
  ],
};

const executablePath = (candidates[process.platform] ?? []).find((p) =>
  existsSync(p),
);

export default {
  ...(executablePath && { executablePath }),
};
