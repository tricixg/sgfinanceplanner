"use client";

import { useEffect, useRef, useState } from "react";
import {
  POKER_IMPORT_MAX_FILE_BYTES,
  POKER_IMPORT_TEMPLATE_CSV,
  POKER_IMPORT_TEMPLATE_FILENAME,
} from "@/lib/poker/import-template";
import {
  pokerImportProgressPercent,
  type PokerImportProgress,
  type PokerImportStreamEvent,
} from "@/lib/poker/import-sessions";
import { parsePokerCsv } from "@/lib/poker/parse-csv";
import type { PokerSession } from "@/lib/poker/types";

type ImportResult = {
  imported: number;
  warnings: { row: number; message: string }[];
  ledgerSynced?: boolean;
  sessions?: PokerSession[];
};

type Props = {
  onImported: (result: ImportResult) => void;
};

function progressLabel(progress: PokerImportProgress): string {
  const noun = progress.phase === "resolving" ? "Preparing row" : "Importing session";
  return `${noun} ${progress.current} of ${progress.total}…`;
}

async function readImportStream(
  res: Response,
  onProgress: (progress: PokerImportProgress) => void
): Promise<PokerImportStreamEvent> {
  const reader = res.body?.getReader();
  if (!reader) {
    throw new Error("No response body");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let lastEvent: PokerImportStreamEvent | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const event = JSON.parse(trimmed) as PokerImportStreamEvent;
      lastEvent = event;
      if (event.type === "progress") {
        onProgress({
          current: event.current,
          total: event.total,
          phase: event.phase,
        });
      }
    }
  }

  const tail = buffer.trim();
  if (tail) {
    const event = JSON.parse(tail) as PokerImportStreamEvent;
    lastEvent = event;
    if (event.type === "progress") {
      onProgress({
        current: event.current,
        total: event.total,
        phase: event.phase,
      });
    }
  }

  if (!lastEvent || lastEvent.type === "progress") {
    throw new Error("Import ended without a result");
  }

  return lastEvent;
}

export function PokerImportMenu({ onImported }: Props) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<PokerImportProgress | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const close = () => {
    setOpen(false);
    setError(null);
    setUploading(false);
    setProgress(null);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !uploading) close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, uploading]);

  const downloadTemplate = () => {
    const blob = new Blob([POKER_IMPORT_TEMPLATE_CSV], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = POKER_IMPORT_TEMPLATE_FILENAME;
    a.click();
    URL.revokeObjectURL(url);
    console.info("[PokerImportMenu] template downloaded");
  };

  const uploadCsv = async (file: File) => {
    const name = file.name.toLowerCase();
    if (!name.endsWith(".csv")) {
      setError("Only .csv files are accepted.");
      return;
    }
    if (file.size > POKER_IMPORT_MAX_FILE_BYTES) {
      setError(`File too large (max ${Math.round(POKER_IMPORT_MAX_FILE_BYTES / 1024)} KB).`);
      return;
    }

    const text = await file.text();
    const preview = parsePokerCsv(text);
    if (preview.errors.length > 0) {
      const first = preview.errors[0];
      setError(`Row ${first.row}: ${first.message}`);
      return;
    }

    const rowCount = preview.rows.length;
    const confirmed = confirm(
      `Import ${rowCount} poker session${rowCount === 1 ? "" : "s"}?\n\n` +
        "Rows with a matching Account name will create cash ledger entries."
    );
    if (!confirmed) return;

    setUploading(true);
    setError(null);
    setProgress({ current: 0, total: rowCount, phase: "resolving" });
    try {
      const form = new FormData();
      form.append("file", file);

      const res = await fetch("/api/poker/import", {
        method: "POST",
        credentials: "include",
        body: form,
      });

      if (!res.ok && res.headers.get("Content-Type")?.includes("application/json")) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Import failed");
      }

      if (!res.ok) {
        throw new Error("Import failed");
      }

      const event = await readImportStream(res, (p) => {
        setProgress(p);
        console.info("[PokerImportMenu] import progress", p);
      });

      if (event.type === "error") {
        const detail =
          event.errors?.map((e) => `Row ${e.row}: ${e.message}`).join("\n") ??
          event.error ??
          "Import failed";
        const rollback =
          event.rolledBack ? "\n\nNo sessions were saved (import rolled back)." : "";
        setError(detail + rollback);
        console.error("[PokerImportMenu] import failed", event);
        return;
      }

      if ((event.warnings?.length ?? 0) > 0) {
        console.info("[PokerImportMenu] import warnings", event.warnings);
      }

      setProgress({ current: rowCount, total: rowCount, phase: "importing" });
      close();
      onImported({
        imported: event.imported,
        warnings: event.warnings ?? [],
        ledgerSynced: event.ledgerSynced,
        sessions: event.sessions,
      });
      console.info("[PokerImportMenu] import success", { imported: event.imported });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      setError(msg);
      console.error("[PokerImportMenu] upload error", e);
    } finally {
      setUploading(false);
      setProgress(null);
    }
  };

  const percent = progress ? pokerImportProgressPercent(progress) : 0;

  return (
    <>
      <button type="button" className="btn ghost sm" onClick={() => setOpen(true)}>
        Import sessions
      </button>

      {open ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget && !uploading) close();
          }}
        >
          <div
            className="card modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="poker-import-title"
            style={{ maxWidth: 420 }}
          >
            <div className="modal-header">
              <h3 id="poker-import-title" style={{ margin: 0 }}>
                Import poker sessions
              </h3>
              <button
                type="button"
                className="btn ghost sm"
                disabled={uploading}
                onClick={close}
                aria-label="Close"
              >
                Close
              </button>
            </div>

            <p className="note" style={{ marginTop: 0 }}>
              Download the CSV template, fill in your sessions, then upload. Only{" "}
              <code>.csv</code> files are accepted (max{" "}
              {Math.round(POKER_IMPORT_MAX_FILE_BYTES / 1024)} KB, 100 rows).
            </p>
            <p className="note" style={{ marginTop: 0 }}>
              <code>CashOut</code> is for cash games only. Tournaments leave it empty and use{" "}
              <code>AmountWon</code> for the prize (plus <code>BountyAmount</code> for PKO
              bounties). <code>BuyIn</code> is the initial entry; <code>RebuyAmount</code> is total
              rebuys.
            </p>

            {uploading && progress ? (
              <div className="poker-import-progress" style={{ marginBottom: 14 }}>
                <div className="poker-import-progress-label">
                  <span>{progressLabel(progress)}</span>
                  <span>{Math.round(percent)}%</span>
                </div>
                <div
                  className="poker-import-progress-track"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(percent)}
                  aria-label="Import progress"
                >
                  <div
                    className="poker-import-progress-fill"
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </div>
            ) : null}

            <div className="toolbar" style={{ flexWrap: "wrap" }}>
              <button type="button" className="btn ghost" onClick={downloadTemplate} disabled={uploading}>
                Download template
              </button>
              <button
                type="button"
                className="btn"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
              >
                {uploading ? "Importing…" : "Upload CSV"}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadCsv(f);
                  e.target.value = "";
                }}
              />
            </div>

            {error ? (
              <p
                className="note"
                style={{ marginBottom: 0, color: "var(--bad, #c00)", whiteSpace: "pre-wrap" }}
              >
                {error}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
