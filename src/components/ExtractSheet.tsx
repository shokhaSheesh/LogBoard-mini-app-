import { useEffect, useRef, useState } from "react";
import { Camera, ClipboardPaste, FileUp } from "lucide-react";
import { friendlyError } from "../lib/errors";
import { extractFromFile, extractFromText, MAX_FILE_BYTES, type Extraction } from "../lib/extract";
import { haptic } from "../lib/telegram";
import { Sheet, SheetRow } from "./ui";

// Filling a new load from a rate confirmation. Three ways in — the camera, a file, or
// pasted text — then a wait while it is read, and the draft goes back to the form.
export function ExtractSheet({ onDraft, onClose }: { onDraft: (x: Extraction) => void; onClose: () => void }) {
  const [mode, setMode]   = useState<"pick" | "paste" | "reading">("pick");
  const [text, setText]   = useState("");
  const [error, setError] = useState("");
  const camera = useRef<HTMLInputElement>(null);
  const files  = useRef<HTMLInputElement>(null);
  // Closing while it reads throws the answer away rather than filling a form nobody asked for.
  const open = useRef(true);
  useEffect(() => () => { open.current = false; }, []);

  async function read(work: Promise<Extraction>, back: "pick" | "paste") {
    setMode("reading"); setError("");
    try {
      const draft = await work;
      if (!open.current) return;
      haptic.success();
      onDraft(draft);
    } catch (e) {
      if (!open.current) return;
      haptic.error();
      setError(friendlyError(e, "Couldn't read that. Try again, or fill the form by hand."));
      setMode(back);
    }
  }

  const picked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // so picking the same file again still counts as a change
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) { setError("That file is over 10 MB. Try a smaller photo or the PDF."); return; }
    void read(extractFromFile(file), "pick");
  };

  return (
    <Sheet title="Fill from a rate confirmation" onClose={onClose} tall={mode === "paste"}>
      {mode === "pick" && (
        <>
          <SheetRow onClick={() => camera.current?.click()}><Camera size={18} /> Take a photo</SheetRow>
          <SheetRow onClick={() => files.current?.click()}><FileUp size={18} /> Choose a PDF or photo</SheetRow>
          <SheetRow onClick={() => { setError(""); setMode("paste"); }}><ClipboardPaste size={18} /> Paste the text</SheetRow>
          <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={picked} />
          <input ref={files} type="file" accept="application/pdf,image/*" hidden onChange={picked} />
          <div className="sub" style={{ marginTop: 8 }}>The form fills itself in. You check it before anything is saved.</div>
        </>
      )}

      {mode === "paste" && (
        <>
          <textarea className="textarea" style={{ flex: 1 }} value={text} onChange={(e) => { setText(e.target.value); setError(""); }}
            placeholder="Paste the rate confirmation or the broker's email here" aria-label="Rate confirmation text" autoFocus />
          <div className="two" style={{ marginTop: 10, flexShrink: 0 }}>
            <button className="btn ghost" onClick={() => { setError(""); setMode("pick"); }}>Back</button>
            <button className="btn" disabled={!text.trim()} onClick={() => read(extractFromText(text.trim()), "paste")}>Read it</button>
          </div>
        </>
      )}

      {mode === "reading" && (
        <div className="center" style={{ padding: "34px 12px" }}>
          <span className="spinner" style={{ width: 26, height: 26, color: "var(--pine)" }} />
          <div style={{ color: "var(--ink)", fontWeight: 600 }}>Reading the rate confirmation</div>
          <div>This usually takes 10 to 30 seconds.</div>
        </div>
      )}

      {error && <div className="error" role="alert" style={{ marginTop: 10 }}>{error}</div>}
    </Sheet>
  );
}
