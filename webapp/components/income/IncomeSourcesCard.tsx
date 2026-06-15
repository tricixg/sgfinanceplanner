"use client";

import { useEffect, useState } from "react";
import { useIncomeCategories } from "@/hooks/useIncomeCategories";
import { isSystemIncomeSlug } from "@/lib/income/types";
import type { IncomeCategoryInput } from "@/lib/income/types";

type Props = {
  /** Whether the signed-in income-category API is available (cloud mode). */
  authEnabled: boolean;
};

/**
 * Income source categories editor. Salary and Comms feed the baseline (from
 * the ME salary inputs); Poker, Others, and custom categories add to cashflow
 * when deposited to a cash account. Rendered on the ME tab.
 */
export function IncomeSourcesCard({ authEnabled }: Props) {
  const { categories, configured, save, loading: catsLoading } =
    useIncomeCategories(authEnabled);
  const [catDraft, setCatDraft] = useState<IncomeCategoryInput[]>([]);
  const [editingCats, setEditingCats] = useState(false);
  const [catSaving, setCatSaving] = useState(false);
  const [catMsg, setCatMsg] = useState("");

  useEffect(() => {
    if (!editingCats) {
      setCatDraft(
        categories.map((c) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          sortOrder: c.sortOrder,
        }))
      );
    }
  }, [categories, editingCats]);

  const saveCategories = async () => {
    setCatSaving(true);
    setCatMsg("");
    try {
      await save(catDraft);
      setEditingCats(false);
      setCatMsg("Income categories saved.");
    } catch (e) {
      setCatMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setCatSaving(false);
    }
  };

  if (!configured) return null;

  return (
    <div className="card">
      <div className="section-head">
        <h2 style={{ margin: 0 }}>Income sources</h2>
        {editingCats ? (
          <button
            type="button"
            className="btn sm"
            disabled={catSaving}
            onClick={() => void saveCategories()}
          >
            {catSaving ? "Saving…" : "Done"}
          </button>
        ) : (
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => setEditingCats(true)}
          >
            Edit
          </button>
        )}
      </div>
      <p className="note" style={{ marginTop: 0 }}>
        Salary and Comms are included in baseline from ME. Poker, Others, and custom
        categories add to cashflow when you deposit to a cash account.
      </p>
      {catMsg ? <p className="note">{catMsg}</p> : null}
      {catsLoading && !categories.length ? (
        <p className="note">Loading categories…</p>
      ) : editingCats ? (
        <div className="income-cat-edit">
          {catDraft.map((c, i) => {
            const locked = Boolean(c.slug && isSystemIncomeSlug(c.slug));
            return (
              <div className="editrow" key={c.id ?? i} style={{ marginBottom: 8 }}>
                <input
                  type="text"
                  value={c.name}
                  disabled={locked}
                  onChange={(e) => {
                    const next = [...catDraft];
                    next[i] = { ...c, name: e.target.value };
                    setCatDraft(next);
                  }}
                />
                <span className="note" style={{ alignSelf: "center" }}>
                  {c.slug === "salary" || c.slug === "comms"
                    ? "Baseline"
                    : c.slug === "poker" || c.slug === "others"
                      ? "+ cashflow"
                      : "+ cashflow"}
                </span>
                {!locked ? (
                  <button
                    type="button"
                    className="btn ghost sm"
                    onClick={() => setCatDraft(catDraft.filter((_, j) => j !== i))}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            );
          })}
          <button
            type="button"
            className="btn ghost sm"
            onClick={() =>
              setCatDraft([...catDraft, { name: "New category", sortOrder: catDraft.length }])
            }
          >
            Add category
          </button>
        </div>
      ) : (
        <ul className="income-cat-list" style={{ margin: 0, paddingLeft: 18 }}>
          {categories.map((c) => (
            <li key={c.id}>
              {c.name}
              <span className="note">
                {c.countsAsAdditive ? " · adds to cashflow when deposited" : " · in baseline"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
