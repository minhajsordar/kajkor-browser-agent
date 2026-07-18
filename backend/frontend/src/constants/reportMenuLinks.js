const reportMenuLinks = [
  {
    title: "Dashboard",
    icon: "dashboard",
    link: "/dashboard",
    permissionSlug: "viewDashboard",
  },
  // {
  //   label: "Reports",
  // },
  {
    title: "Purchase Report",
    sub: [
      {
        title: "Purchase Invoice",
        link: "/reports/purchase-invoice",
        permissionSlug: "createProductSale",
      },
      {
        title: "Purchase Product",
        link: "/reports/purchase-product",
        permissionSlug: "createProductSale",
      },
      {
        title: "Category Wise Purchase",
        link: "/reports/category-wise-purchase",
        permissionSlug: "createProductSale",
      },
      {
        title: "Product Wise Purchase",
        link: "/reports/product-wise-purchase",
        permissionSlug: "createProductSale",
      },
      {
        title: "Purchase Summary",
        link: "/reports/purchase-summary",
        permissionSlug: "createProductSale",
      },
    ],
  },
  {
    title: "Sales Report",
    sub: [
      {
        title: "Sales Invoice",
        link: "/reports/sales-invoice",
        permissionSlug: "createProductSale",
      },
      {
        title: "Sales Product",
        link: "/reports/sales-product",
        permissionSlug: "createProductSale",
      },
      {
        title: "Category Wise Sales",
        link: "/reports/category-wise-sales",
        permissionSlug: "createProductSale",
      },
      {
        title: "Product Wise Sales",
        link: "/reports/product-wise-sales",
        permissionSlug: "createProductSale",
      },
      {
        title: "Sales Summary",
        link: "/reports/sales-summary",
        permissionSlug: "createProductSale",
      },
      {
        title: "Upcomming Installment",
        link: "/reports/upcomming-installment",
        permissionSlug: "createProductSale",
      },
    ],
  },
  // TODO: task due for later
  // {
  //   title: "Service Report",
  //   sub: [
  //     {
  //       title: "Service Order",
  //       link: "/reports/service-order",
  //       permissionSlug: "createProductSale",
  //     },
  //   ],
  // },
  {
    title: "Stock Report",
    sub: [
      {
        title: "Overall Stock",
        link: "/reports/overall-stock",
        permissionSlug: "createProductSale",
      },
      {
        title: "Category Wise Stock",
        link: "/reports/category-wise-stock",
        permissionSlug: "createProductSale",
      },
      {
        title: "Overall Stock Samary",
        link: "/reports/overall-stock-summary",
        permissionSlug: "createProductSale",
      },
      {
        title: "Damage/Lost Report",
        link: "/reports/damage-lost-report",
        permissionSlug: "createProductSale",
      },
    ],
  },
  {
    title: "Payment Report",
    sub: [
      {
        title: "Contact Payment Receive",
        link: "/reports/contact-payment-receive",
        permissionSlug: "createProductSale",
      },
      {
        title: "Supplier Payment Report",
        link: "/reports/supplier-payment-report",
        permissionSlug: "createProductSale",
      },
      {
        title: "Staff Salary Payment",
        link: "/reports/staff-salary-payment",
        permissionSlug: "createProductSale",
      },
    ],
  },
  {
    title: "General Transaction",
    sub: [
      {
        title: "Transaction Report",
        link: "/reports/transaction-report",
        permissionSlug: "createProductSale",
      },
      {
        title: "Category Wise Transaction",
        link: "/reports/category-wise-transaction",
        permissionSlug: "createProductSale",
      },
      {
        title: "Transaction Summary",
        link: "/reports/transaction-summary",
        permissionSlug: "createProductSale",
      },
    ],
  },
  {
    title: "Contact Report",
    sub: [
      {
        title: "All Contact Dues",
        link: "/reports/all-contact-dues",
        permissionSlug: "createProductSale",
      },
      {
        title: "Contact Dues",
        link: "/reports/contact-dues",
        permissionSlug: "createProductSale",
      },
      {
        title: "Contact Invoices",
        link: "/reports/contact-invoices",
        permissionSlug: "createProductSale",
      },
      {
        title: "Contact Purchased Product",
        link: "/reports/contact-purchased-product",
        permissionSlug: "createProductSale",
      },
      {
        title: "Contact Ledger",
        link: "/reports/contact-ledger",
        permissionSlug: "createProductSale",
      },
      {
        title: "Contact Wise Profit",
        link: "/reports/contact-wise-profit",
        permissionSlug: "createProductSale",
      },
    ],
  },
  {
    title: "Supplier Report",
    sub: [
      {
        title: "Supplier Invoices",
        link: "/reports/supplier-invoices",
        permissionSlug: "createProductSale",
      },
      {
        title: "Supplier Sales Product",
        link: "/reports/supplier-sales-product",
        permissionSlug: "createPurchase",
      },
      {
        title: "Supplier Ledger",
        link: "/reports/supplier-ledger",
        permissionSlug: "createPurchase",
      },
      // {
      //   title: "Supplier Balance",
      //   link: "/reports/supplier-balance",
      //   permissionSlug: "createProductSale",
      // },
    ],
  },
  {
    title: "Staff Report",
    sub: [
      {
        title: "Staff Wise Salary Report",
        link: "/reports/staff-wise-salary-report",
        permissionSlug: "createProductSale",
      },
      {
        title: "Staff Sales Invoices",
        link: "/reports/staff-sales-invoices",
        permissionSlug: "createProductSale",
      },
      {
        title: "Staff Wise Product Sales",
        link: "/reports/staff-wise-product-sales",
        permissionSlug: "createProductSale",
      },

      // TODO: task due for later
      // {
      //   title: "Staff Attendance Report",
      //   link: "/reports/staff-attendance-report",
      //   permissionSlug: "createProductSale",
      // },
      // {
      //   title: "Individual Attendance Report",
      //   link: "/reports/individual-attendance-report",
      //   permissionSlug: "createProductSale",
      // },
      // {
      //   title: "Staff Balance",
      //   link: "/reports/staff-balance",
      //   permissionSlug: "createProductSale",
      // },
    ],
  },
  {
    title: "Profit Report",
    sub: [
      {
        title: "Invoice Wise Profit",
        link: "/reports/invoice-wise-profit",
        permissionSlug: "createProductSale",
      },
      {
        title: "Product Wise Profit",
        link: "/reports/product-wise-profit",
        permissionSlug: "createProductSale",
      },
      {
        title: "Net Profit",
        link: "/reports/net-profit",
        permissionSlug: "createProductSale",
      },
    ],
  },
  // TODO: task due for later
  // {
  //   title: "Warranty Report",
  //   sub: [
  //     {
  //       title: "Supplier Wise Report",
  //       link: "/reports/supplier-wise-report",
  //       permissionSlug: "createProductSale",
  //     },
  //   ],
  // },
  // TODO: task due for later
  // {
  //   title: "Account And Cash Report",
  //   sub: [
  //     {
  //       title: "Cash Ledger",
  //       link: "/reports/cash-ledger",
  //       permissionSlug: "createProductSale",
  //     },
  //     {
  //       title: "All Transaction Summary",
  //       link: "/reports/all-transaction-summary",
  //       permissionSlug: "createProductSale",
  //     },
  //     {
  //       title: "Account Balance",
  //       link: "/reports/account-balance",
  //       permissionSlug: "createProductSale",
  //     },
  //   ],
  // },
  // TODO: task due for later
  // {
  //   title: "Reports",
  //   png: "/icons/report.png",
  //   link: "/dashboard/reports",
  //   permissionSlug: "viewReport",
  // },
  {
    title: "Installment Report",
    sub: [
      {
        title: "Overdue",
        link: "/reports/installment-overdue",
        permissionSlug: "viewInstallment",
      },
      {
        title: "Upcoming",
        link: "/reports/installment-upcoming",
        permissionSlug: "viewInstallment",
      },
      {
        title: "Collection History",
        link: "/reports/installment-collection",
        permissionSlug: "viewInstallment",
      },
      {
        title: "Aging",
        link: "/reports/installment-aging",
        permissionSlug: "viewInstallment",
      },
    ],
  },
];
export default reportMenuLinks;
