export const TRAVEL_CATEGORY = "Travel";

export function formatTravelExpenseNote(
  tripName: string,
  subCategory: string,
  extraNote?: string
): string {
  const base = `${tripName.trim()} - ${subCategory.trim()}`;
  const extra = extraNote?.trim();
  return extra ? `${base} · ${extra}` : base;
}

export function parseTripSubCategoryFromNote(
  tripName: string,
  note: string
): string | null {
  const prefix = `${tripName.trim()} - `;
  if (!note.startsWith(prefix)) return null;
  const tail = note.slice(prefix.length);
  const [subCategory] = tail.split("·");
  const out = subCategory?.trim() ?? "";
  return out || null;
}
