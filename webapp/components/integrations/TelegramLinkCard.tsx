"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "@/lib/fetch-json";

type LinkStatus = {
  configured?: boolean;
  telegramConfigured?: boolean;
  linked?: boolean;
  username?: string | null;
  linkedAt?: string | null;
};

type LinkCode = {
  code?: string;
  expiresAt?: string;
  botUsername?: string | null;
  error?: string;
};

export function TelegramLinkCard() {
  const [status, setStatus] = useState<LinkStatus | null>(null);
  const [codeInfo, setCodeInfo] = useState<LinkCode | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const loadStatus = useCallback(async () => {
    setLoading(true);
    const { res, data } = await fetchJson<LinkStatus>("/api/integrations/telegram/link", {
      credentials: "include",
    });
    if (res.ok) setStatus(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const generateCode = async () => {
    setBusy(true);
    setMsg("");
    const { res, data } = await fetchJson<LinkCode>("/api/integrations/telegram/link", {
      method: "POST",
      credentials: "include",
    });
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error ?? "Failed to generate code");
      return;
    }
    setCodeInfo(data);
    console.info("[TelegramLinkCard] link code generated", { expiresAt: data.expiresAt });
  };

  const unlink = async () => {
    setBusy(true);
    setMsg("");
    const { res, data } = await fetchJson<{ error?: string }>("/api/integrations/telegram/link", {
      method: "DELETE",
      credentials: "include",
    });
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error ?? "Failed to unlink");
      return;
    }
    setCodeInfo(null);
    await loadStatus();
    setMsg("Telegram disconnected.");
  };

  if (loading) {
    return (
      <div className="card">
        <h3>Telegram bot</h3>
        <p className="note">Loading…</p>
      </div>
    );
  }

  if (!status?.telegramConfigured) {
    return (
      <div className="card">
        <h3>Telegram bot</h3>
        <p className="note">
          Server is not configured for Telegram yet. Add <code>TELEGRAM_BOT_TOKEN</code> and{" "}
          <code>TELEGRAM_WEBHOOK_SECRET</code> — see{" "}
          <a href="https://github.com/tricixg/sgfinanceplanner/blob/main/documentation/09-telegram-bot-setup.md">
            setup guide
          </a>
          .
        </p>
      </div>
    );
  }

  const botUser = codeInfo?.botUsername ?? "your_bot";

  return (
    <div className="card">
      <h3>Telegram bot</h3>
      <p className="note" style={{ marginTop: 0 }}>
        Log expenses, poker sessions, and travel costs from Telegram. Link once per account.
      </p>

      {status.linked ? (
        <>
          <p className="note">
            Linked
            {status.username ? ` as @${status.username}` : ""}
            {status.linkedAt
              ? ` · since ${new Date(status.linkedAt).toLocaleDateString("en-SG")}`
              : ""}
          </p>
          <div className="toolbar">
            <button type="button" className="btn ghost sm" disabled={busy} onClick={() => void unlink()}>
              Disconnect Telegram
            </button>
          </div>
        </>
      ) : codeInfo?.code ? (
        <>
          <p>
            <strong>Link code:</strong> <code style={{ fontSize: "1.1em" }}>{codeInfo.code}</code>
          </p>
          <p className="note">
            Open{" "}
            <a
              href={`https://t.me/${botUser}?start=${codeInfo.code}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              t.me/{botUser}
            </a>{" "}
            and send <code>/start {codeInfo.code}</code> before{" "}
            {codeInfo.expiresAt
              ? new Date(codeInfo.expiresAt).toLocaleTimeString("en-SG")
              : "it expires"}
            .
          </p>
          <div className="toolbar">
            <button type="button" className="btn ghost sm" disabled={busy} onClick={() => void generateCode()}>
              New code
            </button>
            <button type="button" className="btn sm" disabled={busy} onClick={() => void loadStatus()}>
              I linked — refresh
            </button>
          </div>
        </>
      ) : (
        <div className="toolbar">
          <button type="button" className="btn sm" disabled={busy} onClick={() => void generateCode()}>
            {busy ? "Generating…" : "Connect Telegram"}
          </button>
        </div>
      )}

      {msg ? <p className="note">{msg}</p> : null}
    </div>
  );
}
