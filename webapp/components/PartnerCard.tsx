"use client";

import { useState } from "react";
import type { useHousehold } from "@/hooks/useHousehold";

type HouseholdApi = ReturnType<typeof useHousehold>;

function formatInviteDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-SG", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

export function PartnerCard({ household }: { household: HouseholdApi }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!household.configured) {
    return null;
  }

  if (household.loading) {
    return (
      <div className="card settings-account">
        <h3 className="settings-account-title">Partner</h3>
        <p className="note" style={{ marginTop: 0 }}>
          Loading partner status…
        </p>
      </div>
    );
  }

  const respond = async (id: string, action: "accept" | "decline" | "cancel") => {
    setError("");
    setBusy(true);
    try {
      await household.respondInvite(id, action);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update invite");
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    setError("");
    setBusy(true);
    try {
      await household.sendInvite(email.trim());
      setEmail("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send invite");
    } finally {
      setBusy(false);
    }
  };

  const pendingReceived = household.receivedInvites.filter(
    (i) => i.status === "pending"
  );
  const pendingSent = household.sentInvites.filter((i) => i.status === "pending");

  return (
    <div className="card settings-account">
      <h3 className="settings-account-title">Partner</h3>

      {pendingReceived.length > 0 ? (
        <div style={{ marginBottom: 16 }}>
          <p className="note" style={{ marginTop: 0, marginBottom: 8 }}>
            <b>Invites for you</b>
          </p>
          {pendingReceived.map((inv) => {
            const from = inv.inviterEmail?.trim() || "Someone";
            const when = formatInviteDate(inv.createdAt);
            return (
              <div
                key={inv.id}
                className="card"
                style={{ marginBottom: 8, padding: "12px 14px" }}
              >
                <p style={{ margin: "0 0 10px" }}>
                  <strong>{from}</strong> invited you to link accounts and share savings.
                  {when ? (
                    <span className="note" style={{ display: "block", marginTop: 4 }}>
                      Sent {when}
                    </span>
                  ) : null}
                </p>
                <div className="toolbar">
                  <button
                    type="button"
                    className="btn sm"
                    disabled={busy}
                    onClick={() => void respond(inv.id, "accept")}
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    className="btn ghost sm"
                    disabled={busy}
                    onClick={() => void respond(inv.id, "decline")}
                  >
                    Decline
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {household.paired ? (
        <p className="note" style={{ marginTop: 0 }}>
          You are linked with a partner. Shared savings pools and shared goals are available on
          the Savings tab.
        </p>
      ) : (
        <>
          <p className="note" style={{ marginTop: 0, marginBottom: 12 }}>
            Invite your partner by email. They must sign in with that same email and accept the
            request here. Only <b>savings accounts and savings goals</b> are shared — budgets and
            expenses stay separate.
          </p>
          <div className="toolbar">
            <input
              type="email"
              placeholder="partner@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button
              type="button"
              className="btn"
              disabled={busy || !email.trim()}
              onClick={() => void send()}
            >
              {busy ? "Sending…" : "Send invite"}
            </button>
          </div>
        </>
      )}

      {pendingSent.length > 0 ? (
        <div style={{ marginTop: 16 }}>
          <p className="note" style={{ marginBottom: 8 }}>
            <b>Pending sent</b>
          </p>
          {pendingSent.map((inv) => (
            <div key={inv.id} className="toolbar" style={{ marginBottom: 8 }}>
              <span>
                Waiting for <strong>{inv.inviteeEmail}</strong>
              </span>
              <button
                type="button"
                className="btn ghost sm"
                disabled={busy}
                onClick={() => void respond(inv.id, "cancel")}
              >
                Cancel
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {error ? (
        <p className="pin-error" role="alert" style={{ marginTop: 12, marginBottom: 0 }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
