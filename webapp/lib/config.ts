export const appConfig = {
  title: process.env.NEXT_PUBLIC_APP_TITLE ?? "Financial Dashboard",
  kicker: process.env.NEXT_PUBLIC_APP_KICKER ?? "Personal Finance · Singapore",
  subtitle:
    process.env.NEXT_PUBLIC_APP_SUBTITLE ??
    "Job transition, debt paydown & CPF outlook",
  asOf: process.env.NEXT_PUBLIC_APP_ASOF ?? "All figures SGD",
  currency: "SGD",
};
