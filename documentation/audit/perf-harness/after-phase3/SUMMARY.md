# Phase 3 before/after

Before = main after Phases 0-2 (+PERF-005 for timing/requests, which it does not affect; initial JS from the build before PERF-005). After = this branch, median of 3 loads. Mock Supabase, 4x CPU.

| page | data-ready @30 ms | data-ready @100 ms | requests | API requests | Auth calls | initial JS (gz) |
|---|---|---|---|---|---|---|
| /dashboard | 1368 → 942 | 1883 → 1255 | 89 → 37 | 16 → 5 | 55 → 0 | 290 → 343 KB |
| /now | 1629 → 1051 | 2355 → 1358 | 90 → 27 | 16 → 9 | 55 → 0 | 285 → 338 KB |
| /this-month | 1119 → 835 | 1834 → 1226 | 88 → 23 | 15 → 7 | 54 → 0 | 211 → 274 KB |
| /this-month-cashflow | 1186 → 803 | 1874 → 1208 | 88 → 24 | 15 → 8 | 54 → 0 | 212 → 275 KB |
| /past-cashflow | 1130 → 702 | 1661 → 908 | 88 → 20 | 14 → 2 | 53 → 0 | 286 → 339 KB |
| /year | 1524 → 995 | 2297 → 1357 | 89 → 27 | 16 → 10 | 55 → 0 | 287 → 340 KB |
| /budget | 1532 → 1096 | 2536 → 1519 | 91 → 31 | 18 → 14 | 57 → 0 | 288 → 341 KB |
| /expenses | 933 → 721 | 1570 → 946 | 87 → 18 | 14 → 2 | 53 → 0 | 213 → 276 KB |
| /transactions | 948 → 796 | 1780 → 1146 | 90 → 21 | 15 → 3 | 54 → 0 | 215 → 279 KB |
| /recurring | 978 → 755 | 1694 → 965 | 87 → 20 | 14 → 3 | 53 → 0 | 216 → 279 KB |
| /cash-accounts | 2158 → 1813 | 3102 → 2235 | 92 → 31 | 18 → 14 | 57 → 0 | 292 → 345 KB |
| /savings | 1005 → 724 | 1728 → 993 | 88 → 20 | 15 → 3 | 54 → 0 | 291 → 344 KB |
| /wealth | 1257 → 796 | 2361 → 1256 | 90 → 29 | 15 → 11 | 54 → 0 | 296 → 349 KB |
| /cpf | 877 → 746 | 1603 → 1122 | 90 → 29 | 12 → 4 | 53 → 0 | 325 → 378 KB |
| /debt | 1439 → 760 | 1847 → 1044 | 86 → 23 | 13 → 5 | 52 → 0 | 325 → 378 KB |
| /cards | 1129 → 782 | 1845 → 1246 | 89 → 23 | 15 → 4 | 54 → 0 | 325 → 378 KB |
| /bto | 1349 → 932 | 2237 → 1486 | 89 → 28 | 14 → 8 | 55 → 0 | 325 → 378 KB |
| /bto/price-finder | 1478 → 944 | 2648 → 1474 | 92 → 33 | 17 → 11 | 56 → 0 | 325 → 378 KB |
| /financial-health | 1293 → 931 | 2352 → 1271 | 98 → 49 | 20 → 15 | 63 → 0 | 291 → 344 KB |
| /benefits | 900 → 704 | 1665 → 849 | 87 → 18 | 14 → 2 | 53 → 0 | 213 → 276 KB |
| /miles | 1243 → 787 | 1826 → 988 | 87 → 22 | 13 → 3 | 52 → 0 | 325 → 378 KB |
| /oncall | 1048 → 805 | 1713 → 882 | 89 → 21 | 15 → 3 | 54 → 1 | 219 → 282 KB |
| /poker | 1051 → 770 | 1688 → 1318 | 93 → 26 | 14 → 2 | 55 → 0 | 223 → 286 KB |
| /poker/stats | 991 → 732 | 1586 → 884 | 89 → 24 | 13 → 1 | 52 → 0 | 304 → 369 KB |
| /travel | 1011 → 814 | 1687 → 1185 | 87 → 21 | 13 → 2 | 52 → 0 | 292 → 345 KB |
| /me | 1235 → 887 | 2370 → 1185 | 92 → 30 | 18 → 14 | 57 → 0 | 217 → 280 KB |

Median change in data-ready: -347 ms @30 ms, -751 ms @100 ms (26/26 and 26/26 pages faster).

## Endpoints (100 ms per DB call)

| endpoint | sequential depth | DB calls | wall |
|---|---|---|---|
| /api/auth/session | 0 → 0 | 0 → 0 | 118 → 13 ms |
| /api/state | 2 → 1 | 2 → 1 | 315 → 109 ms |
| /api/profile | 2 → 2 | 4 → 4 | 318 → 214 ms |
| /api/loans | 1 → 1 | 1 → 1 | 213 → 111 ms |
| /api/other-loans | 2 → 2 | 2 → 2 | 315 → 211 ms |
| /api/budget-lines | 1 → 1 | 4 → 4 | 215 → 112 ms |
| /api/credit-cards | 2 → 2 | 2 → 2 | 316 → 211 ms |
| /api/holdings | 2 → 2 | 2 → 2 | 316 → 210 ms |
| /api/portfolio/snapshots | 1 → 1 | 1 → 1 | 214 → 110 ms |
| /api/net-worth/snapshots | 1 → 1 | 1 → 1 | 211 → 115 ms |
| /api/cpf/contributions | 1 → 1 | 1 → 1 | 212 → 107 ms |
| /api/cpf/transactions | 1 → 1 | 1 → 1 | 212 → 108 ms |
| /api/savings | 5 → 2 | 8 → 8 | 625 → 213 ms |
| /api/accounts | 1 → 1 | 1 → 1 | 211 → 109 ms |
| /api/funds | 2 → 2 | 2 → 2 | 317 → 210 ms |
| /api/summary | 5 → 2 | 15 → 15 | 635 → 219 ms |
| /api/household | 4 → 2 | 4 → 4 | 521 → 210 ms |
| /api/household/bto-planner | 2 → 2 | 2 → 2 | 318 → 209 ms |
| /api/household/partner-cpf | 2 → 2 | 2 → 2 | 320 → 210 ms |
| /api/household/partner-bto-payments | 2 → 2 | 2 → 2 | 320 → 211 ms |
| /api/savings/shared-contributions | 2 → 2 | 2 → 2 | 317 → 211 ms |
| /api/travel/trips | 5 → 3 | 7 → 7 | 627 → 313 ms |
| /api/expenses/summary | 2 → 2 | 12 → 12 | 333 → 213 ms |
| /api/credit-cards/statements | 1 → 1 | 1 → 1 | 212 → 109 ms |
| /api/credit-cards/statements/outstanding | 1 → 1 | 1 → 1 | 214 → 108 ms |
| /api/credit-cards/calendar | 2 → 2 | 2 → 2 | 316 → 211 ms |
| /api/expenses | 1 → 1 | 1 → 1 | 218 → 113 ms |
| /api/transactions | 3 → 3 | 7 → 7 | 418 → 312 ms |
| /api/miles | 1 → 1 | 1 → 1 | 213 → 107 ms |
| /api/benefits | 1 → 1 | 1 → 1 | 213 → 107 ms |
| /api/recurring | 1 → 1 | 9 → 9 | 220 → 108 ms |
| /api/poker | 2 → 2 | 3 → 3 | 316 → 210 ms |
| /api/poker/stats | 1 → 1 | 1 → 1 | 212 → 107 ms |
| /api/spending/analytics | 1 → 1 | 8 → 8 | 216 → 112 ms |
| /api/income/analytics | 1 → 1 | 3 → 3 | 218 → 108 ms |
