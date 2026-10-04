export interface ClipboardWriter {
  writeText(text: string): Promise<void>;
}

export async function writeClipboardText(text: string, clipboard?: ClipboardWriter | null): Promise<void> {
  const target = clipboard === undefined
    ? (typeof navigator !== "undefined" ? navigator.clipboard : null)
    : clipboard;

  if (!target?.writeText) {
    throw new Error("Clipboard access is unavailable in this browser.");
  }

  await target.writeText(text);
}
