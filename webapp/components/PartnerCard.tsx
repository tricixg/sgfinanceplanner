"use client";

import { useState } from "react";
import type { useHousehold } from "@/hooks/useHousehold";

type HouseholdApi = ReturnType<typeof useHousehold>;

export function PartnerCard({ household }: { household: HouseholdApi }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!household.configured) {
    return null;
  }

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

  return (
    <div className="card settings-account">
      <h3 className="settings-account-title">Partner</h3>
      {household.paired ? (
        <p className="note" style={{ marginTop: 0 }}>
          You are linked with a partner. Shared savings pools and shared goals are available on
          the Savings tab.
        </p>
      ) : (
        <>
          <p className="note" style={{ marginTop: 0, marginBottom: 12 }}>
            Invite your partner by email. They must sign up with that same email and accept the
            request. Only <b>savings accounts and savings goals</b> are shared — budgets and
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
          {error ? (
            <p className="pin-error" role="alert">
              {error}
            </p>
          ) : null}
        </>
      )}

      {household.receivedInvites.length > 0 ? (
        <div style={{ marginTop: 16 }}>
          <p className="note" style={{ marginBottom: 8 }}>
            <b>Invites for you</b>
          </p>
          {household.receivedInvites.map((inv) => (
            <div key={inv.id} className="toolbar" style={{ marginBottom: 8 }}>
              <span>{inv.inviteeEmail}</span>
              <button
                type="button"
                className="btn sm"
                disabled={busy}
                onClick={() => void household.respondInvite(inv.id, "accept")}
              >
                Accept
              </button>
              <button
                type="button"
                className="btn ghost sm"
                disabled={busy}
                onClick={() => void household.respondInvite(inv.id, "decline")}
              >
                Decline
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {household.sentInvites.filter((i) => i.status === "pending").length > 0 ? (
        <div style={{ marginTop: 16 }}>
          <p className="note" style={{ marginBottom: 8 }}>
            <b>Pending sent</b>
          </p>
          {household.sentInvites
            .filter((i) => i.status === "pending")
            .map((inv) => (
              <div key={inv.id} className="toolbar" style={{ marginBottom: 8 }}>
                <span>{inv.inviteeEmail}</span>
                <button
                  type="button"
                  className="btn ghost sm"
                  disabled={busy}
                  onClick={() => void household.respondInvite(inv.id, "cancel")}
                >
                  Cancel
                </button>
              </div>
            ))}
        </div>
      ) : null}
    </div>
  );
}
