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
  return parseTravelExpenseParts(tripName, note)?.subCategory ?? null;
}

export function parseTravelExpenseParts(
  tripName: string,
  note: string
): { subCategory: string; extraNote: string } | null {
  const prefix = `${tripName.trim()} - `;
  if (!note.startsWith(prefix)) return null;
  const tail = note.slice(prefix.length);
  const [subCategoryPart, ...extraParts] = tail.split("·");
  const subCategory = subCategoryPart?.trim() ?? "";
  if (!subCategory) return null;
  const extraNote = extraParts.join("·").trim();
  return { subCategory, extraNote };
}
