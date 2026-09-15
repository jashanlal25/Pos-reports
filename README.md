# POS Reports for Your Business

An installable, browser-only POS backup reader for receivables, payables and stock.

## Start
Deploy this repository on Vercel using **Other** as the framework, no build/install command, and `public` as the output directory. The included vercel.json sets the output directory. Import the project from GitHub; pushes to main can then deploy automatically.

Open the app and import your original POS backup ZIP. No business data or preloaded customer records are distributed with this repository. Existing reports from the ChatGPT-hosted site cannot transfer across domains automatically; import the ZIP once on this new app.

## Features
- Customer receivables and supplier payables from stored account balances.
- Stock quantity in packs, cost and trade valuation, discounts, company filters.
- Explicit Name A–Z / Name Z–A buttons, starts-with-letter filter, amount sorting.
- Header amounts masked by default; eye control reveals them.
- Latest report saved in this browser until replaced or cleared. Browser storage removal also removes the report.
- CSV export and Print / PDF.
- PWA installation and file-sharing target for supported browsers. Share the actual ZIP, not a Drive link. No background Drive sync.

## Data interpretation
Customer: MAST MODE C / TDBAL. Supplier: MAST MODE S / TDBAL. Company names: MODE P.
Stock units: OPSRB OQTY + PQTY - SQTY + RQTY + IN - OUT. Packs divide by ITEM PKQTY; valuation multiplies by AVERAGE. Summary includes positive stock only. Adjustment fields and invoice differences are flagged. ITEM LDISC and FDISC are shown separately; latest transaction discounts come from PUR2/SAL2.

## Privacy
The public app shell contains no customer records. Imports run in a Web Worker and stay in device IndexedDB; no backup-upload API exists. No login is required. This is not encryption or an application lock: someone with access to this browser profile can view saved reports.

## Validation
Parser checked against the supplied real ZIP: 121 customers, 85 suppliers, 8,183 items. Source syntax and static asset references checked. PWA installation and Android share-sheet behavior require device verification after deployment.
