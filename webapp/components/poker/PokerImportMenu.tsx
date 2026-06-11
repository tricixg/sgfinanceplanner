"use client";

import { useEffect, useRef, useState } from "react";
import {
  POKER_IMPORT_MAX_FILE_BYTES,
  POKER_IMPORT_TEMPLATE_CSV,
  POKER_IMPORT_TEMPLATE_FILENAME,
} from "@/lib/poker/import-template";
import { parsePokerCsv } from "@/lib/poker/parse-csv";
import type { PokerSession } from "@/lib/poker/types";

type ImportResult = {
  imported: number;
  warnings: { row: number; message: string }[];
  ledgerSynced?: boolean;
  sessions?: PokerSession[];
};

type ImportError = {
  error?: string;
  errors?: { row: number; message: string }[];
  rolledBack?: boolean;
};

type Props = {
  onImported: (result: ImportResult) => void;
};

export function PokerImportMenu({ onImported }: Props) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const close = () => {
    setOpen(false);
    setError(null);
    setUploading(false);
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
    try {
      const form = new FormData();
      form.append("file", file);

      const res = await fetch("/api/poker/import", {
        method: "POST",
        credentials: "include",
        body: form,
      });

      const data = (await res.json()) as ImportResult & ImportError;

      if (!res.ok) {
        const detail =
          data.errors?.map((e) => `Row ${e.row}: ${e.message}`).join("\n") ??
          data.error ??
          "Import failed";
        const rollback =
          data.rolledBack ? "\n\nNo sessions were saved (import rolled back)." : "";
        setError(detail + rollback);
        console.error("[PokerImportMenu] import failed", data);
        return;
      }

      if ((data.warnings?.length ?? 0) > 0) {
        console.info("[PokerImportMenu] import warnings", data.warnings);
      }

      close();
      onImported({
        imported: data.imported,
        warnings: data.warnings ?? [],
        ledgerSynced: data.ledgerSynced,
        sessions: data.sessions,
      });
      console.info("[PokerImportMenu] import success", { imported: data.imported });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      setError(msg);
      console.error("[PokerImportMenu] upload error", e);
    } finally {
      setUploading(false);
    }
  };

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

            <div className="toolbar" style={{ flexWrap: "wrap" }}>
              <button type="button" className="btn ghost" onClick={downloadTemplate}>
                Download template
              </button>
              <button
                type="button"
                className="btn"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
              >
                {uploading ? "Uploading…" : "Upload CSV"}
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
