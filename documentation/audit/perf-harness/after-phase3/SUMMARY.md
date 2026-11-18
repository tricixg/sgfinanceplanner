# Phase 3 before/after

Before = main after Phases 0-2 (+PERF-005 for timing/requests, which it does not affect; initial JS from the build before PERF-005). After = this branch, median of 3 loads. Mock Supabase, 4x CPU.

| page | data-ready @30 ms | data-ready @100 ms | requests | API requests | Auth calls | initial JS (gz) |
|---|---|---|---|---|---|---|
| /dashboard | 1368 → 988 | 1883 → 1160 | 89 → 37 | 16 → 5 | 55 → 0 | 290 → 282 KB |
| /now | 1629 → 1029 | 2355 → 1405 | 90 → 27 | 16 → 9 | 55 → 0 | 285 → 277 KB |
| /this-month | 1119 → 820 | 1834 → 1196 | 88 → 23 | 15 → 7 | 54 → 0 | 211 → 213 KB |
| /this-month-cashflow | 1186 → 832 | 1874 → 1172 | 88 → 24 | 15 → 8 | 54 → 0 | 212 → 214 KB |
| /past-cashflow | 1130 → 677 | 1661 → 844 | 88 → 20 | 14 → 2 | 53 → 0 | 286 → 278 KB |
| /year | 1524 → 972 | 2297 → 1143 | 89 → 27 | 16 → 10 | 55 → 0 | 287 → 279 KB |
| /budget | 1532 → 1023 | 2536 → 1398 | 91 → 31 | 18 → 14 | 57 → 0 | 288 → 280 KB |
| /expenses | 933 → 655 | 1570 → 870 | 87 → 18 | 14 → 2 | 53 → 0 | 213 → 215 KB |
| /transactions | 948 → 701 | 1780 → 1055 | 90 → 21 | 15 → 3 | 54 → 0 | 215 → 218 KB |
| /recurring | 978 → 686 | 1694 → 874 | 87 → 20 | 14 → 3 | 53 → 0 | 216 → 218 KB |
| /cash-accounts | 2158 → 1737 | 3102 → 2117 | 92 → 31 | 18 → 14 | 57 → 0 | 292 → 284 KB |
| /savings | 1005 → 693 | 1728 → 918 | 88 → 20 | 15 → 3 | 54 → 0 | 291 → 283 KB |
| /wealth | 1257 → 825 | 2361 → 1146 | 90 → 29 | 15 → 11 | 54 → 0 | 296 → 288 KB |
| /cpf | 877 → 695 | 1603 → 895 | 90 → 29 | 12 → 4 | 53 → 0 | 325 → 317 KB |
| /debt | 1439 → 685 | 1847 → 963 | 86 → 23 | 13 → 5 | 52 → 0 | 325 → 317 KB |
| /cards | 1129 → 792 | 1845 → 1063 | 89 → 23 | 15 → 4 | 54 → 0 | 325 → 317 KB |
| /bto | 1349 → 845 | 2237 → 1177 | 89 → 28 | 14 → 8 | 55 → 0 | 325 → 317 KB |
| /bto/price-finder | 1478 → 1007 | 2648 → 1285 | 92 → 33 | 17 → 11 | 56 → 0 | 325 → 317 KB |
| /financial-health | 1293 → 1049 | 2352 → 1158 | 98 → 49 | 20 → 15 | 63 → 0 | 291 → 283 KB |
| /benefits | 900 → 579 | 1665 → 757 | 87 → 18 | 14 → 2 | 53 → 0 | 213 → 215 KB |
| /miles | 1243 → 693 | 1826 → 928 | 87 → 22 | 13 → 3 | 52 → 0 | 325 → 317 KB |
| /oncall | 1048 → 790 | 1713 → 888 | 89 → 21 | 15 → 3 | 54 → 1 | 219 → 221 KB |
| /poker | 1051 → 786 | 1688 → 891 | 93 → 26 | 14 → 2 | 55 → 0 | 223 → 225 KB |
| /poker/stats | 991 → 703 | 1586 → 802 | 89 → 24 | 13 → 1 | 52 → 0 | 304 → 308 KB |
| /travel | 1011 → 832 | 1687 → 1006 | 87 → 21 | 13 → 2 | 52 → 0 | 292 → 284 KB |
| /me | 1235 → 830 | 2370 → 1118 | 92 → 30 | 18 → 14 | 57 → 0 | 217 → 219 KB |

Median change in data-ready: -337 ms @30 ms, -820 ms @100 ms (26/26 and 26/26 pages faster).

## Endpoints (100 ms per DB call)

| endpoint | sequential depth | DB calls | wall |
|---|---|---|---|
| /api/auth/session | 0 → 0 | 0 → 0 | 118 → 16 ms |
| /api/state | 2 → 1 | 2 → 1 | 315 → 110 ms |
| /api/profile | 2 → 2 | 4 → 4 | 318 → 215 ms |
| /api/loans | 1 → 1 | 1 → 1 | 213 → 109 ms |
| /api/other-loans | 2 → 2 | 2 → 2 | 315 → 212 ms |
| /api/budget-lines | 1 → 1 | 4 → 4 | 215 → 112 ms |
| /api/credit-cards | 2 → 2 | 2 → 2 | 316 → 212 ms |
| /api/holdings | 2 → 2 | 2 → 2 | 316 → 212 ms |
| /api/portfolio/snapshots | 1 → 1 | 1 → 1 | 214 → 109 ms |
| /api/net-worth/snapshots | 1 → 1 | 1 → 1 | 211 → 111 ms |
| /api/cpf/contributions | 1 → 1 | 1 → 1 | 212 → 112 ms |
| /api/cpf/transactions | 1 → 1 | 1 → 1 | 212 → 109 ms |
| /api/savings | 5 → 2 | 8 → 8 | 625 → 216 ms |
| /api/accounts | 1 → 1 | 1 → 1 | 211 → 108 ms |
| /api/funds | 2 → 2 | 2 → 2 | 317 → 214 ms |
| /api/summary | 5 → 2 | 15 → 15 | 635 → 226 ms |
| /api/household | 4 → 2 | 4 → 4 | 521 → 212 ms |
| /api/household/bto-planner | 2 → 2 | 2 → 2 | 318 → 213 ms |
| /api/household/partner-cpf | 2 → 2 | 2 → 2 | 320 → 214 ms |
| /api/household/partner-bto-payments | 2 → 2 | 2 → 2 | 320 → 213 ms |
| /api/savings/shared-contributions | 2 → 2 | 2 → 2 | 317 → 214 ms |
| /api/travel/trips | 5 → 3 | 7 → 7 | 627 → 318 ms |
| /api/expenses/summary | 2 → 2 | 12 → 12 | 333 → 220 ms |
| /api/credit-cards/statements | 1 → 1 | 1 → 1 | 212 → 111 ms |
| /api/credit-cards/statements/outstanding | 1 → 1 | 1 → 1 | 214 → 110 ms |
| /api/credit-cards/calendar | 2 → 2 | 2 → 2 | 316 → 214 ms |
| /api/expenses | 1 → 1 | 1 → 1 | 218 → 115 ms |
| /api/transactions | 3 → 3 | 7 → 7 | 418 → 315 ms |
| /api/miles | 1 → 1 | 1 → 1 | 213 → 109 ms |
| /api/benefits | 1 → 1 | 1 → 1 | 213 → 108 ms |
| /api/recurring | 1 → 1 | 9 → 9 | 220 → 111 ms |
| /api/poker | 2 → 2 | 3 → 3 | 316 → 212 ms |
| /api/poker/stats | 1 → 1 | 1 → 1 | 212 → 110 ms |
| /api/spending/analytics | 1 → 1 | 8 → 8 | 216 → 114 ms |
| /api/income/analytics | 1 → 1 | 3 → 3 | 218 → 110 ms |
