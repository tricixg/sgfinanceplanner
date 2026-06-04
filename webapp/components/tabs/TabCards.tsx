"use client";

import { useEffect, useMemo, useState } from "react";
import type { CreditCard, DashboardState } from "@/lib/types";
import type { OtherLoan } from "@/lib/other-loans/types";
import { aggregateOpenCycles } from "@/lib/cards/open-cycle-display";
import type { CardStatementComputed } from "@/lib/cards/types";
import { CATALOG_AS_OF } from "@/lib/cards/sg-card-catalog";
import type { SpendCategory } from "@/lib/cards/sg-card-catalog";
import {
  applyCatalogEntry,
  countCardsByRewardType,
  recommendCardForSpend,
  type CardRecommendation,
  type RewardPreference,
} from "@/lib/finance/card-rewards";
import { ensureCreditCardIds } from "@/lib/finance/card-linking";
import { getCatalogEntry } from "@/lib/cards/sg-card-catalog";
import { fmt2 } from "@/lib/finance/helpers";
import { fetchJson } from "@/lib/fetch-json";
import { Snackbar } from "@/components/Snackbar";
import { useAccounts } from "@/hooks/useAccounts";
import { useCardStatements } from "@/hooks/useCardStatements";
import { useFinancialAccounts } from "@/hooks/useFinancialAccounts";
import { useSnackbar } from "@/hooks/useSnackbar";
import { dispatchDomainEvent } from "@/lib/events/domain-events";
import { CardPaymentModal } from "@/components/credit-cards/CardPaymentModal";
import { CardEditForm } from "@/components/credit-cards/CardEditForm";
import { CardListSection } from "@/components/credit-cards/CardListSection";
import { CardOpenCycleSection } from "@/components/credit-cards/CardOpenCycleSection";
import { CardStatementList } from "@/components/credit-cards/CardStatementList";
import { CardRewardsAdvisor } from "@/components/credit-cards/CardRewardsAdvisor";
type CardsApi = {
  cards: CreditCard[];
  saveCards: (next: CreditCard[]) => Promise<void>;
  configured: boolean;
};

type Props = {
  state: DashboardState;
  setState: (s: DashboardState | ((p: DashboardState) => DashboardState)) => void;
  cardsApi?: CardsApi;
};

export function TabCards({ state: S, setState, cardsApi }: Props) {
  const creditCards = cardsApi?.configured ? cardsApi.cards : S.creditCards;
  const statementsEnabled = Boolean(cardsApi?.configured);
  const {
    bundle,
    loading: statementsLoading,
    reload: reloadStatements,
  } = useCardStatements(statementsEnabled);
  const { reload: reloadFinancialAccounts } = useFinancialAccounts();
  const { configured: accountsConfigured, reload: reloadCashAccounts } = useAccounts();

  const snackbar = useSnackbar();
  const [initialLoadDone, setInitialLoadDone] = useState(!statementsEnabled);

  useEffect(() => {
    if (!statementsEnabled) {
      setInitialLoadDone(true);
      return;
    }
    if (!statementsLoading) {
      setInitialLoadDone(true);
    }
  }, [statementsEnabled, statementsLoading]);

  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState<CreditCard[] | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);
  const [spendAmount, setSpendAmount] = useState(500);
  const [spendCategory, setSpendCategory] = useState<SpendCategory>("dining");
  const [preference, setPreference] = useState<RewardPreference>("best");
  const [recommendation, setRecommendation] = useState<CardRecommendation | null>(null);
  const [payStatement, setPayStatement] = useState<CardStatementComputed | null>(null);
  const [draftActual, setDraftActual] = useState<Record<string, string>>({});
  const [draftMinDue, setDraftMinDue] = useState<Record<string, string>>({});
  const [savingRow, setSavingRow] = useState<string | null>(null);
  const [undoingRow, setUndoingRow] = useState<string | null>(null);
  const [confirmUndoStatementId, setConfirmUndoStatementId] = useState<string | null>(null);
  const [showOpenCycleDetail, setShowOpenCycleDetail] = useState(false);
  const [excludeCarriedFromOpenCycle, setExcludeCarriedFromOpenCycle] = useState(false);

  const openCycleAgg = useMemo(
    () => aggregateOpenCycles(bundle.openCycles, excludeCarriedFromOpenCycle),
    [bundle.openCycles, excludeCarriedFromOpenCycle]
  );

  const rewardCounts = useMemo(
    () => countCardsByRewardType(creditCards),
    [creditCards]
  );

  const statementByCardKey = useMemo(() => {
    const map = new Map<string, CardStatementComputed>();
    for (const s of bundle.statements) {
      map.set(s.creditCardKey, s);
    }
    return map;
  }, [bundle.statements]);

  const patchEditDraft = (updater: (prev: CreditCard[]) => CreditCard[]) => {
    setEditDraft((prev) => ensureCreditCardIds(updater(prev ?? creditCards)));
  };

  const updateCard = (i: number, patch: Partial<CreditCard>) => {
    patchEditDraft((prev) => prev.map((c, j) => (j === i ? { ...c, ...patch } : c)));
    console.info("[TabCards] updated card draft", { index: i, patch });
  };

  const applyCatalog = (i: number, catalogId: string) => {
    if (!catalogId) {
      updateCard(i, {
        catalogId: undefined,
        bank: undefined,
        rewardType: undefined,
        rewardHeadline: undefined,
        rewardRules: undefined,
      });
      return;
    }
    const entry = getCatalogEntry(catalogId);
    if (!entry) return;
    patchEditDraft((prev) =>
      prev.map((c, j) =>
        j === i
          ? {
              ...c,
              ...applyCatalogEntry(entry),
              statementDay: c.statementDay,
              paymentDueDay: c.paymentDueDay,
              interestRateApr: c.interestRateApr,
            }
          : c
      )
    );
    console.info("[TabCards] applied catalog", { catalogId });
  };

  const addCard = () => {
    patchEditDraft((prev) => [
      ...prev,
      {
        name: "New card",
        statementDay: 1,
        paymentDueDay: 21,
        statementAmount: 0,
        interestRateApr: 0,
      },
    ]);
    console.info("[TabCards] added card to draft");
  };

  const removeCard = (i: number) => {
    patchEditDraft((prev) => prev.filter((_, j) => j !== i));
    console.info("[TabCards] removed card from draft", { index: i });
  };

  const cardsInEdit = editDraft ?? creditCards;

  useEffect(() => {
    setDraftActual((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const s of bundle.statements) {
        if (next[s.id] === undefined && s.actualAmount != null) {
          next[s.id] = String(s.actualAmount);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    setDraftMinDue((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const s of bundle.statements) {
        if (next[s.id] === undefined && s.minimumDue != null) {
          next[s.id] = String(s.minimumDue);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [bundle.statements]);

  const saveStatementRow = async (stmt: CardStatementComputed) => {
    const actualRaw = draftActual[stmt.id] ?? "";
    const minRaw = draftMinDue[stmt.id] ?? "";
    const actualAmount = actualRaw === "" ? undefined : parseFloat(actualRaw);
    const minimumDue = minRaw === "" ? null : parseFloat(minRaw);

    if (actualAmount !== undefined && (!Number.isFinite(actualAmount) || actualAmount < 0)) {
      return;
    }
    if (minimumDue != null && (!Number.isFinite(minimumDue) || minimumDue < 0)) {
      return;
    }
    if (actualAmount === undefined && minRaw === "") return;

    setSavingRow(stmt.id);
    try {
      const body: { actualAmount?: number; minimumDue?: number | null } = {};
      if (actualAmount !== undefined) body.actualAmount = actualAmount;
      if (minRaw !== "" || stmt.minimumDue != null) body.minimumDue = minimumDue;

      const { res, data } = await fetchJson<{ error?: string }>(
        `/api/credit-cards/statements/${stmt.id}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      console.info("[TabCards] saved statement row", { id: stmt.id, body });
      await reloadStatements({ silent: true });
      snackbar.show("Statement saved");
    } catch (e) {
      console.error("[TabCards] save statement row failed", e);
      snackbar.show(
        e instanceof Error ? e.message : "Failed to save statement",
        { error: true }
      );
    } finally {
      setSavingRow(null);
    }
  };

  const runAdvisor = () => {
    const rec = recommendCardForSpend(creditCards, spendAmount, spendCategory, preference);
    setRecommendation(rec);
    console.info("[TabCards] recommend", { spendAmount, spendCategory, preference, rec });
  };

  const refreshBalancesAfterLedgerChange = async () => {
    if (!accountsConfigured) return;
    await reloadCashAccounts();
    await reloadFinancialAccounts();
    console.info("[TabCards] cash account balances refreshed");
  };

  const undoStatementPayment = async (stmt: CardStatementComputed) => {
    if (!stmt.paymentSavingsTransactionId) return;
    setConfirmUndoStatementId(null);
    setUndoingRow(stmt.id);
    try {
      const { res, data } = await fetchJson<{ error?: string }>(
        `/api/credit-cards/statements/${stmt.id}/pay`,
        { method: "DELETE", credentials: "include" }
      );
      if (!res.ok) throw new Error(data.error ?? "Failed to undo payment");
      console.info("[TabCards] undo payment ok", { statementId: stmt.id });
      dispatchDomainEvent([
        "expense:changed",
        "cards:changed",
        "accounts:changed",
        "savings:changed",
        "otherLoans:changed",
      ]);
      await reloadStatements({ silent: true });
      await refreshBalancesAfterLedgerChange();
      snackbar.show("Payment undone");
    } catch (e) {
      console.error("[TabCards] undo payment failed", e);
      snackbar.show(e instanceof Error ? e.message : "Failed to undo payment", {
        error: true,
      });
    } finally {
      setUndoingRow(null);
    }
  };

  const startEditing = () => {
    setEditDraft(ensureCreditCardIds([...creditCards]));
    setEditing(true);
    console.info("[TabCards] edit mode on");
  };

  const finishEditing = async () => {
    if (!editDraft) {
      setEditing(false);
      return;
    }
    setSavingConfig(true);
    try {
      const next = ensureCreditCardIds(editDraft);
      if (cardsApi?.configured) {
        await cardsApi.saveCards(next);
      } else {
        setState((prev) => ({ ...prev, creditCards: next }));
      }
      if (statementsEnabled) {
        await reloadStatements({ silent: true });
      }
      snackbar.show("Card configuration saved");
      setEditing(false);
      setEditDraft(null);
      console.info("[TabCards] edit mode off, saved");
    } catch (e) {
      console.error("[TabCards] save config failed", e);
      snackbar.show(e instanceof Error ? e.message : "Failed to save cards", {
        error: true,
      });
    } finally {
      setSavingConfig(false);
    }
  };

  if (statementsEnabled && !initialLoadDone) {
    return (
      <section className="panel on">
        <p className="loading">Loading credit cards and statements…</p>
      </section>
    );
  }

  return (
    <section className="panel on">
      <div className="callout tip">
        <span className="ico">Tip</span>
        Pick cards from the Singapore catalog (indicative as of {CATALOG_AS_OF}).
        Enter statement amount and minimum due for each card, then record payment from a
        cash account. Unpaid balances after the due date carry forward with daily interest.
      </div>

      <div className="grid g2" style={{ marginBottom: 16 }}>
        <div className="stat">
          <div className="lbl">Cards tracked</div>
          <div className="val">{creditCards.length}</div>
          <div className="note">
            {rewardCounts.miles} miles · {rewardCounts.cashback} cashback
            {rewardCounts.hybrid > 0 ? ` · ${rewardCounts.hybrid} hybrid` : ""}
          </div>
        </div>
        {statementsEnabled && bundle.openCycles.length > 0 && (
          <div className="stat accent">
            <div className="lbl">Est. next statements (all cards)</div>
            <div className="val">{fmt2(openCycleAgg.displayTotal)}</div>
            <div className="note">
              {excludeCarriedFromOpenCycle
                ? "New spend + interest only"
                : "Includes carried forward"}
              <br />
              <button
                type="button"
                className="btn ghost sm"
                style={{ marginTop: 4 }}
                onClick={() => setShowOpenCycleDetail((v) => !v)}
              >
                {showOpenCycleDetail ? "Hide" : "View"} open-cycle estimates
              </button>
            </div>
          </div>
        )}
      </div>

      {statementsEnabled && showOpenCycleDetail && (
        <CardOpenCycleSection
          openCycles={bundle.openCycles}
          openCycleAgg={openCycleAgg}
          excludeCarriedFromOpenCycle={excludeCarriedFromOpenCycle}
          onExcludeCarriedChange={setExcludeCarriedFromOpenCycle}
        />
      )}

      <div className="section-head">
        <h2>Card configuration</h2>
        {editing ? (
          <button
            type="button"
            className="btn sm"
            disabled={savingConfig}
            onClick={() => void finishEditing()}
          >
            {savingConfig ? "Saving…" : "Done"}
          </button>
        ) : (
          <button
            type="button"
            className="btn ghost sm"
            disabled={savingRow !== null}
            onClick={startEditing}
          >
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <CardEditForm
          cards={cardsInEdit}
          saving={savingConfig}
          onUpdate={updateCard}
          onApplyCatalog={applyCatalog}
          onRemove={removeCard}
          onAdd={addCard}
        />
      ) : (
        <CardListSection cards={creditCards} />
      )}

      {statementsEnabled && (
        <>
          <h2 style={{ marginTop: 24 }}>Statements</h2>
          <p className="note" style={{ marginBottom: 8 }}>
            Latest closed cycle per card. Enter amounts from your bank statement, then save
            and record payment.
          </p>
          <CardStatementList
            cards={creditCards}
            statementByCardKey={statementByCardKey}
            draftActual={draftActual}
            onDraftActualChange={setDraftActual}
            draftMinDue={draftMinDue}
            onDraftMinDueChange={setDraftMinDue}
            savingRow={savingRow}
            undoingRow={undoingRow}
            savingConfig={savingConfig}
            onSaveRow={(stmt) => void saveStatementRow(stmt)}
            onUndoPayment={(stmt) => void undoStatementPayment(stmt)}
            onPay={setPayStatement}
            confirmUndoStatementId={confirmUndoStatementId}
            onRequestUndoPayment={(stmt) => setConfirmUndoStatementId(stmt.id)}
            onCancelUndoPayment={() => setConfirmUndoStatementId(null)}
          />
        </>
      )}

      {!statementsEnabled && (
        <p className="note" style={{ marginTop: 16 }}>
          Sign in with cloud sync to use statement cycles, tracked spend, and payments.
        </p>
      )}

      <CardRewardsAdvisor
        cards={creditCards}
        spendAmount={spendAmount}
        onSpendAmountChange={setSpendAmount}
        spendCategory={spendCategory}
        onSpendCategoryChange={setSpendCategory}
        preference={preference}
        onPreferenceChange={setPreference}
        recommendation={recommendation}
        onSuggest={runAdvisor}
      />

      {payStatement && (
        <CardPaymentModal
          statement={payStatement}
          onClose={() => setPayStatement(null)}
          onPaid={async () => {
            await reloadStatements({ silent: true });
            await refreshBalancesAfterLedgerChange();
            const { res, data } = await fetchJson<{ otherLoans?: OtherLoan[] }>(
              "/api/other-loans",
              { credentials: "include" }
            );
            if (res.ok) {
              setState((prev) => ({
                ...prev,
                otherLoans: data.otherLoans ?? prev.otherLoans,
              }));
            }
            snackbar.show("Payment recorded");
          }}
        />
      )}

      <Snackbar
        message={snackbar.message}
        variant={snackbar.variant}
        durationMs={snackbar.durationMs}
        onDismiss={snackbar.dismiss}
      />
    </section>
  );
}
