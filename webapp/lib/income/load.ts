import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_INCOME_CATEGORIES } from "@/lib/income/defaults";
import { mapIncomeCategory } from "@/lib/income/mappers";
import type { IncomeCategory, IncomeCategoryInput } from "@/lib/income/types";
import { isSystemIncomeSlug } from "@/lib/income/types";

const UUID_RE = /^[0-9a-f-]{36}$/i;

export async function loadIncomeCategories(
  supabase: SupabaseClient,
  userId: string
): Promise<IncomeCategory[]> {
  const { data, error } = await supabase
    .from("income_categories")
    .select("*")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true });

  if (error) throw new Error(error.message);

  if (!data?.length) {
    await seedIncomeCategories(supabase, userId);
    return loadIncomeCategories(supabase, userId);
  }

  return data.map((r) => mapIncomeCategory(r));
}

export async function seedIncomeCategories(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  const rows = DEFAULT_INCOME_CATEGORIES.map((c, i) => ({
    user_id: userId,
    name: c.name,
    slug: c.slug ?? `custom-${i}`,
    sort_order: c.sortOrder ?? i,
    counts_in_baseline: c.countsInBaseline ?? false,
    counts_as_additive: c.countsAsAdditive !== false,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase.from("income_categories").insert(rows);
  if (error) throw new Error(error.message);
  console.info("[income] seeded default categories", { userId, count: rows.length });
}

export async function saveIncomeCategories(
  supabase: SupabaseClient,
  userId: string,
  incoming: IncomeCategoryInput[]
): Promise<IncomeCategory[]> {
  const existing = await loadIncomeCategories(supabase, userId);
  const existingBySlug = new Map(existing.map((c) => [c.slug, c]));
  const keepIds = new Set<string>();

  for (let i = 0; i < incoming.length; i++) {
    const item = incoming[i];
    const slug =
      item.slug ??
      (item.id && existing.find((e) => e.id === item.id)?.slug) ??
      `custom-${Date.now()}-${i}`;

    const system = isSystemIncomeSlug(slug);
    const prev = existingBySlug.get(slug) ?? existing.find((e) => e.id === item.id);

    const payload = {
      user_id: userId,
      name: (item.name ?? "").trim() || prev?.name || "Category",
      slug,
      sort_order: i,
      counts_in_baseline: system ? slug === "salary" || slug === "comms" : false,
      counts_as_additive: system
        ? slug === "poker" || slug === "others" || slug === "reimbursement"
        : true,
      updated_at: new Date().toISOString(),
    };

    if (prev?.id && UUID_RE.test(prev.id)) {
      keepIds.add(prev.id);
      await supabase.from("income_categories").update(payload).eq("id", prev.id);
    } else {
      const { data: ins, error } = await supabase
        .from("income_categories")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      if (ins?.id) keepIds.add(String(ins.id));
    }
  }

  for (const row of existing) {
    if (!keepIds.has(row.id) && !isSystemIncomeSlug(row.slug)) {
      await supabase.from("income_categories").delete().eq("id", row.id);
      console.info("[income] deleted custom category", { id: row.id, slug: row.slug });
    }
  }

  console.info("[income] saved categories", { userId, count: incoming.length });
  return loadIncomeCategories(supabase, userId);
}

export async function findIncomeCategoryBySlug(
  supabase: SupabaseClient,
  userId: string,
  slug: string
): Promise<IncomeCategory | null> {
  const categories = await loadIncomeCategories(supabase, userId);
  return categories.find((c) => c.slug === slug) ?? null;
}

export async function findIncomeCategoryByName(
  supabase: SupabaseClient,
  userId: string,
  name: string
): Promise<IncomeCategory | null> {
  const categories = await loadIncomeCategories(supabase, userId);
  return categories.find((c) => c.name === name) ?? null;
}

export async function verifyIncomeCategory(
  supabase: SupabaseClient,
  userId: string,
  categoryId: string
): Promise<IncomeCategory | null> {
  const { data, error } = await supabase
    .from("income_categories")
    .select("*")
    .eq("id", categoryId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return null;
  return mapIncomeCategory(data);
}
