"use client";

import { useCallback, useContext, useEffect, useState } from "react";
import { fetchJson } from "@/lib/fetch-json";
import type { HouseholdMember, PartnerInvite } from "@/lib/savings/types";
import { HouseholdContext } from "@/contexts/app-data-contexts";

export function useHouseholdProvider(enabled: boolean) {
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [paired, setPaired] = useState(false);
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [sentInvites, setSentInvites] = useState<PartnerInvite[]>([]);
  const [receivedInvites, setReceivedInvites] = useState<PartnerInvite[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [configured, setConfigured] = useState(false);

  const load = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { res, data } = await fetchJson<{
        configured?: boolean;
        householdId?: string;
        paired?: boolean;
        members?: HouseholdMember[];
        sentInvites?: PartnerInvite[];
        receivedInvites?: PartnerInvite[];
        error?: string;
      }>("/api/household", { credentials: "include" });
      if (!res.ok || !data.configured) {
        setConfigured(false);
        return;
      }
      setConfigured(true);
      setHouseholdId(data.householdId ?? null);
      setPaired(Boolean(data.paired));
      setMembers(data.members ?? []);
      setSentInvites(data.sentInvites ?? []);
      setReceivedInvites(data.receivedInvites ?? []);
      console.info("[useHousehold] loaded", { paired: data.paired });
    } catch (e) {
      console.error("[useHousehold] load failed", e);
      setConfigured(false);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    load();
  }, [load]);

  const sendInvite = useCallback(
    async (email: string) => {
      const { res, data } = await fetchJson<{ error?: string }>(
        "/api/partner/invites",
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        }
      );
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to send invite");
      }
      console.info("[useHousehold] invite sent", { email });
      await load();
    },
    [load]
  );

  const respondInvite = useCallback(
    async (id: string, action: "accept" | "decline" | "cancel") => {
      const { res, data } = await fetchJson<{ error?: string }>(
        `/api/partner/invites/${id}`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        }
      );
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to update invite");
      }
      console.info("[useHousehold] invite response", { id, action });
      await load();
    },
    [load]
  );

  const unlinkPartner = useCallback(async () => {
    const { res, data } = await fetchJson<{ error?: string }>("/api/partner/unlink", {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) {
      throw new Error(data.error ?? "Failed to unlink partner");
    }
    console.info("[useHousehold] partner unlinked");
    await load();
  }, [load]);

  return {
    householdId,
    paired,
    members,
    sentInvites,
    receivedInvites,
    loading,
    configured,
    reload: load,
    sendInvite,
    respondInvite,
    unlinkPartner,
  };
}

export function useHousehold() {
  const ctx = useContext(HouseholdContext);
  if (!ctx) {
    throw new Error("useHousehold must be used within AppDataProvider");
  }
  return ctx;
}
