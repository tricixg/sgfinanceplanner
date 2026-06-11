"use client";

import { useState } from "react";
import { fetchJson } from "@/lib/fetch-json";
import type { TravelCompanion } from "@/lib/travel/types";

type Props = {
  tripId: string;
  companions: TravelCompanion[];
  onClose: () => void;
  onChanged: () => void;
};

export function TravelCompanionsModal({ tripId, companions, onClose, onChanged }: Props) {
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const addCompanion = async () => {
    const name = newName.trim();
    if (!name) {
      setMsg("Enter a name");
      return;
    }
    setSaving(true);
    setMsg("");
    const { res, data } = await fetchJson<{ error?: string }>(
      `/api/travel/trips/${tripId}/companions`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      }
    );
    setSaving(false);
    if (!res.ok) {
      setMsg(data.error ?? "Failed to add person");
      return;
    }
    console.info("[TravelCompanionsModal] companion added", { tripId, name });
    setNewName("");
    onChanged();
  };

  const removeCompanion = async (companionId: string) => {
    if (!confirm("Remove this person from the trip?")) return;
    setSaving(true);
    setMsg("");
    const { res, data } = await fetchJson<{ error?: string }>(
      `/api/travel/trips/${tripId}/companions/${companionId}`,
      { method: "DELETE", credentials: "include" }
    );
    setSaving(false);
    if (!res.ok) {
      setMsg(data.error ?? "Failed to remove person");
      return;
    }
    console.info("[TravelCompanionsModal] companion removed", { tripId, companionId });
    onChanged();
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="card modal-panel travel-companions-modal" style={{ maxWidth: 420 }}>
        <div className="section-head">
          <h3 style={{ margin: 0 }}>People</h3>
          <button type="button" className="btn ghost sm" onClick={onClose} disabled={saving}>
            Close
          </button>
        </div>
        <p className="note">Add people you&apos;re travelling with for bill splitting.</p>
        {companions.length > 0 ? (
          <ul className="travel-companion-list">
            {companions.map((c) => (
              <li key={c.id} className="travel-companion-list-item">
                <span>{c.name}</span>
                <button
                  type="button"
                  className="btn del sm"
                  disabled={saving}
                  onClick={() => void removeCompanion(c.id)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="note">No people added yet.</p>
        )}
        <div className="editrow" style={{ marginTop: 12 }}>
          <input
            type="text"
            placeholder="Name"
            value={newName}
            disabled={saving}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void addCompanion();
              }
            }}
          />
          <button
            type="button"
            className="btn sm"
            disabled={saving}
            onClick={() => void addCompanion()}
          >
            {saving ? "Adding…" : "Add"}
          </button>
        </div>
        {msg ? (
          <p className="note" style={{ color: "var(--rust)", marginTop: 8 }}>
            {msg}
          </p>
        ) : null}
      </div>
    </div>
  );
}
