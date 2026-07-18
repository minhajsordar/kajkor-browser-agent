const changeLogs = [
  {
    date: "2026-05-18",
    title: "1.1.1",
    logs: [
      {
        label: "Desktop app release",
        changes: [
          "Releasing the desktop app for Windows",
          "Desktop app includes offline mode, local SQLite database, and sync with the cloud backend",
          "Fix Expense create/edit form to correctly handle payment amounts and total amount calculations",
        ],
      },
    ],
  },
  {
    date: "2026-05-18",
    title: "1.1.0",
    logs: [
      {
        label: "Shareable Invoice Link",
        changes: [
          "Public invoice link can be generated and shared via WhatsApp.",
          "Link expires in 7 days or after 10 views (whichever first).",
          "Customer phone auto-normalized to 880 country code.",
          "Message preview includes invoice summary + link.",
          "Share button added in Sale details and Sales list action menu.",
        ],
      },
      {
        label: "Dashboard Redesign",
        changes: [
          "Filter-driven sales, purchase, and cash flow summary with date range.",
          "Gradient KPI cards for Cash In / Out / Net and Sales / Purchase / Profit.",
          "Monthly + 7-day sales charts with Total / Peak / Avg stat strip.",
          "Payment methods rendered as wallet-style cards with credit/debit badges.",
          "Skeleton loading replaces blank flicker on initial load.",
          "Daily / Weekly / Monthly / Yearly sales and purchase cards retained with redesigned look.",
        ],
      },
      {
        label: "Cashbook Improvements",
        changes: [
          "Today overview cards with cash in/out and per-activity breakdown.",
          "Independent date filter for summary section (separate from table).",
          "Contact column added with name + phone shown inline.",
          "Date and Contact filters moved to per-column slots.",
          "Amount column color-coded green/red by type.",
          "View Source button opens detail dialog instead of redirecting.",
        ],
      },
      {
        label: "Contact Cash Flow Report",
        changes: [
          "New page under Reports → Contact Cash Flow.",
          "Daily/range cash in/out grouped by contact with totals.",
          "Untracked (no contact) transactions surfaced separately.",
        ],
      },
      {
        label: "Supplier Opening Due",
        changes: [
          "Supplier Opening Due list and create/edit now separate from Customer Opening Due.",
          "Save button shown instead of Pay on opening-due entries.",
        ],
      },
      {
        label: "Fixes",
        changes: [
          "Sold By user name now reliably shown in Sales list.",
          "Inventory now stores buy/retail/wholesale/TP prices on product create.",
          "tpPrice field added across product create, update, list and per-branch inventory.",
          "SelectUser dropdown now loads list and supports search by user name.",
          "Multi-aggregation tpPrice fallback so updates reflect across branches.",
        ],
      },
    ],
  },
  {
    date: "2026-05-12",
    title: "1.0.9",
    logs: [
      {
        label: "Fix product search and TP price show",
        changes: [
          "Fix Invoice search by product name.",
          "Fix Product TP price field added.",
          "Fix Product TP price show while selling product.",
        ]
      },
    ],
  },
  {
    date: "2026-05-12",
    title: "1.0.9",
    logs: [
      {
        label: "Fix product search and TP price show",
        changes: [
          "Fix Invoice search by product name.",
          "Fix Product TP price field added.",
          "Fix Product TP price show while selling product.",
        ]
      },
    ],
  },
  {
    date: "2026-05-11",
    title: "1.0.8",
    logs: [
      {
        label: "Fixes and add new features",
        changes: [
          "Invoice search by product name.",
          "Product TP price field added.",
          "Product TP price show while selling product.",
        ]
      },
    ],
  },
  {
    date: "2026-03-27",
    title: "1.0.7",
    logs: [
      {
        label: "Contact ledger fix",
        changes: [
          "Contact ledger showing incorrect data for some contacts.",
        ]
      },
    ],
  },
  {
    date: "2026-03-21",
    title: "1.0.6",
    logs: [
      {
        label: "Date filtering fixed",
        changes: [
          "Date filtering fixed for cashbook and other reports.",
          "Date filtering additional Date Range feature added in purchase and sale pages.",
        ]
      },
    ],
  },
  {
    date: "2026-03-18",
    title: "1.0.5",
    logs: [
      {
        label: "Business Contact Payment fixed",
        changes: [
          "Supplier payments added.",
        ]
      },
    ],
  },
  {
    date: "2026-03-16",
    title: "1.0.4",
    logs: [
      {
        label: "Bug fixes",
        changes: [
          "Purchase status fixed",
        ]
      },
    ],
  },
  {
    date: "2026-03-15",
    title: "1.0.3",
    logs: [
      {
        label: "Bug fixes",
        changes: [
          "Invoice and payment bug fixes",
        ]
      },
      {
        label: "Product buy price",
        changes: [
          "Set product purchase price while purchasing new product."
        ]
      },
    ],
  },
  {
    date: "2026-03-13",
    title: "1.0.3",
    logs: [
      {
        label: "Purchase",
        changes: [
          "Bring purchase date to 3rd column in purchase listing page",
          "Purchase refund feature added",
          "Purchase date, contact filter added",
          "Amount columns Fix"
        ]
      },
      {
        label: "Sale",
        changes: [
          "Bring sale date to 3rd column in sale listing page",
          "Sale date, contact filter added"
        ]
      },
    ],
  },
  {
    date: "2026-03-12",
    title: "1.0.2",
    logs: [
      {
        label: "Dashboard",
        changes: [
          "Added stock value calculation feature to the dashboard for better inventory tracking",
        ]
      },
      {
        label: "User Panel",
        changes: [
          "Fixed an issue preventing new user accounts from being created successfully",
        ]
      },
      {
        label: "Contact Invoice",
        changes: [
          "Resolved display issue with contact invoice listing not showing all records",
        ]
      }
    ],
  },
  {
    date: "2026-03-10",
    title: "1.0.1",
    logs: [
      {
        label: "Invoice",
        changes: [
          "Redesigned invoice layout with additional business details for improved clarity and professionalism",
        ]
      },
    ],
  },
  {
    date: "2024-09-12",
    title: "1.0.0",
    logs: [
      {
        label: "Release",
        changes: [
          "Initial release of the inventory management software with core features",
        ]
      },
    ],
  },
];

export default changeLogs;
