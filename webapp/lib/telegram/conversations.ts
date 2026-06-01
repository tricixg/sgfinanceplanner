import type { SupabaseClient } from "@supabase/supabase-js";

export type ConversationState = {
  flow: string;
  step: string;
  payload: Record<string, unknown>;
};

export async function getConversation(
  supabase: SupabaseClient,
  chatId: number
): Promise<ConversationState | null> {
  const { data, error } = await supabase
    .from("telegram_conversations")
    .select("flow, step, payload")
    .eq("chat_id", chatId)
    .maybeSingle();

  if (error) {
    console.error("[telegram] getConversation failed", error.message);
    return null;
  }
  if (!data) return null;

  return {
    flow: String(data.flow ?? ""),
    step: String(data.step ?? ""),
    payload: (data.payload as Record<string, unknown>) ?? {},
  };
}

export async function setConversation(
  supabase: SupabaseClient,
  chatId: number,
  state: ConversationState
): Promise<void> {
  const { error } = await supabase.from("telegram_conversations").upsert(
    {
      chat_id: chatId,
      flow: state.flow,
      step: state.step,
      payload: state.payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "chat_id" }
  );

  if (error) {
    console.error("[telegram] setConversation failed", error.message);
    throw new Error(error.message);
  }
}

export async function clearConversation(
  supabase: SupabaseClient,
  chatId: number
): Promise<void> {
  const { error } = await supabase.from("telegram_conversations").delete().eq("chat_id", chatId);
  if (error) {
    console.error("[telegram] clearConversation failed", error.message);
  }
}
