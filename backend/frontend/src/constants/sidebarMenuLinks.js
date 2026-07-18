const sidebarMenuLinks = [
  {
    title: "Dashboard",
    icon: "dashboard",
    link: "/dashboard",
    permissionSlug: "viewDashboard",
  },
  {
    title: "Notifications",
    icon: "notifications",
    link: "/dashboard/notifications",
    permissionSlug: "viewDashboard",
  },
  {
    title: "Sale",
    png: "/icons/cashless-payment.png",
    sub: [
      {
        title: "Add Sale",
        link: "/dashboard/r?r=/dashboard/sales/create",
        permissionSlug: "createProductSale",
      },
      {
        title: "Sales History",
        link: "/dashboard/sales",
        permissionSlug: "viewProductSale",
      },
      {
        title: "Installments",
        link: "/dashboard/installments",
        permissionSlug: "viewInstallment",
      },
    ],
  },
  {
    title: "Product",
    png: "/icons/product.png",
    sub: [
      {
        title: "Add Product",
        link: "/dashboard/r?r=/dashboard/product/create",
        permissionSlug: "createProduct",
      },
      {
        title: "Product list",
        link: "/dashboard/product",
        permissionSlug: "viewProduct",
      },
      {
        title: "Category",
        link: "/dashboard/category",
        permissionSlug: "viewCategory",
      },
      {
        title: "Brand",
        link: "/dashboard/brand",
        permissionSlug: "viewBrand",
      },
      {
        title: "Bundles",
        link: "/dashboard/bundle",
        permissionSlug: "viewBundle",
        profileShowFlag: "showBundleModule",
      },
      {
        title: "Production",
        link: "/dashboard/production",
        permissionSlug: "viewProduction",
        profileShowFlag: "showProductionModule",
      },
      {
        title: "Units",
        link: "/dashboard/unit",
        permissionSlug: "viewUnit",
      },
    ],
  },
  {
    title: "Stock",
    png: "/icons/packages.png",
    sub: [
      {
        title: "Stock",
        link: "/dashboard/product/product_stock",
        permissionSlug: "viewProduct",
      },
      // {
      //   title: "Stock Details",
      //   link: "/dashboard/product/product-stock-details",
      //   permissionSlug: "viewProduct",
      // },
      {
        title: "Demand Forecast",
        link: "/dashboard/product/demand_forecast",
        permissionSlug: "viewProduct",
      },
      {
        title: "Add Damage",
        link: "/dashboard/r?r=/dashboard/product/product-damaged/create",
        permissionSlug: "createProductDamaged",
      },
      {
        title: "Damage/Lost History",
        link: "/dashboard/product/product-damaged",
        permissionSlug: "viewProductDamaged",
      },
      {
        title: "Add Adjustment",
        link: "/dashboard/r?r=/dashboard/adjustment/create",
        permissionSlug: "createAdjustment",
      },
      {
        title: "Adjustment History",
        link: "/dashboard/adjustment",
        permissionSlug: "viewAdjustment",
      },
      {
        title: "Adjustment Report",
        link: "/dashboard/adjustment/report",
        permissionSlug: "viewAdjustment",
      },
    ],
  },
  {
    title: "Purchase",
    png: "/icons/purchase.png",
    sub: [
      {
        title: "Add Purchase",
        link: "/dashboard/r?r=/dashboard/purchase/create",
        permissionSlug: "createPurchase",
      },
      {
        title: "Purchase History",
        link: "/dashboard/purchase",
        permissionSlug: "viewPurchase",
      },
      {
        title: "Reorder (Low Stock)",
        link: "/dashboard/purchase/reorder",
        permissionSlug: "viewPurchase",
      },
      {
        title: "Purchase Orders",
        link: "/dashboard/purchase/orders",
        permissionSlug: "viewPurchase",
      },
    ],
  },
  // {
  //   title: 'Service',
  //   png: '/icons/service.png',
  //   badge: "Comming soon",
  //   sub: [

  //     {
  //       title: 'Order',
  //       link: '/dashboard/service-sales/create',
  //       permissionSlug: 'createService',
  //     },
  //     {
  //       title: 'History',
  //       link: '/dashboard/service-sales',
  //       permissionSlug: 'viewService',
  //     },
  //     {
  //       title: 'Delivery',
  //       link: '/dashboard/service-delivered',
  //       permissionSlug: 'viewService',
  //     },
  //   ],
  // },
  {
    title: "Quotation",
    png: "/icons/quotes.png",
    sub: [
      {
        title: "Add Quotation",
        link: "/dashboard/r?r=/dashboard/product-sale-order/create",
        permissionSlug: "createQuotation",
      },
      {
        title: "Quotation History",
        link: "/dashboard/product-sale-order",
        permissionSlug: "viewQuotation",
      },
    ],
  },
  {
    title: "Warranty",
    png: "/icons/warranty-period.png",
    sub: [
      {
        title: "Check Warranty",
        link: "/dashboard/r?r=/dashboard/warranty/check",
        permissionSlug: "viewWarranty",
      },
      {
        title: "Warranty History",
        link: "/dashboard/warranty",
        permissionSlug: "viewWarranty",
      },
    ],
  },
  {
    title: "Complaint",
    png: "/icons/complaint.png",
    sub: [
      {
        title: "Add Complaint",
        link: "/dashboard/r?r=/dashboard/complaint/create",
        permissionSlug: "createComplaint",
      },
      {
        title: "Complaint History",
        link: "/dashboard/complaint",
        permissionSlug: "viewComplaint",
      },
    ],
  },
  {
    title: "Payment History",
    png: "/icons/history.png",
    sub: [
      {
        title: "Contact Wise",
        link: "/dashboard/cashbook/contact-flow",
        permissionSlug: "viewCashbook",
      },
      {
        title: "Detailed History",
        link: "/dashboard/cashbook",
        permissionSlug: "viewCashbook",
      },
    ],
  },
  {
    title: "Reports",
    png: "/icons/report.png",
    sub: [
      {
        title: "All Reports",
        link: "/dashboard/r?r=/reports",
      },
      {
        title: "Production Report",
        link: "/dashboard/reports/production",
        permissionSlug: "viewReport",
        profileShowFlag: "showProductionModule",
      },
      {
        title: "Bundle Profit",
        link: "/dashboard/reports/bundle-profit",
        permissionSlug: "viewReport",
        profileShowFlag: "showBundleModule",
      },
      {
        title: "Inventory Ledger",
        link: "/dashboard/reports/inventory-ledger",
        permissionSlug: "viewReport",
      },
      {
        title: "Adjustment Report",
        link: "/dashboard/adjustment/report",
        permissionSlug: "viewAdjustment",
      },
    ],
  },
  // {
  //   title: "Supplier",
  //   png: "/icons/supplier.png",
  //   sub: [
  //     {
  //       title: "Add Supplier",
  //       link: "/dashboard/supplier/create",
  //       permissionSlug: "createSupplier",
  //     },
  //     {
  //       title: "Supplier list",
  //       link: "/dashboard/supplier",
  //       permissionSlug: "viewSupplier",
  //     },
  //   ],
  // },
  {
    title: "Contact",
    png: "/icons/contact.png",
    sub: [
      {
        title: "Add Contact",
        link: "/dashboard/r?r=/dashboard/contacts/create",
        permissionSlug: "createContact",
      },
      {
        title: "Contact list",
        link: "/dashboard/contacts",
        permissionSlug: "viewContact",
      },
    ],
  },
  {
    title: "Staff",
    png: "/icons/employee.png",
    sub: [
      {
        title: "Staff list",
        link: "/dashboard/r?r=/dashboard/employees",
        permissionSlug: "viewEmployee",
      },
      {
        title: "Time Sheet",
        link: "/dashboard/r?r=/dashboard/time-sheet",
        permissionSlug: "viewAttendance",
      },
      {
        title: "Clock In/Out",
        link: "/dashboard/r?r=/dashboard/clock-in-out",
        permissionSlug: "viewAttendance",
      },
      {
        title: "Salary",
        link: "/dashboard/r?r=/dashboard/employee_salary/create",
        permissionSlug: "createEmployeeSalary",
      },
      {
        title: "Salary History",
        link: "/dashboard/employee_salary",
        permissionSlug: "viewEmployeeSalary",
      },
    ],
  },
  {
    title: "User",
    png: "/icons/user.png",
    sub: [
      {
        title: "Add User",
        link: "/dashboard/r?r=/dashboard/user/create",
        permissionSlug: "createUser",
      },
      {
        title: "User list",
        link: "/dashboard/user",
        permissionSlug: "viewUser",
      },
      {
        title: "Add User Role And Permission",
        link: "/dashboard/r?r=/dashboard/role/create",
        permissionSlug: "createRole",
      },
      {
        title: "User Role And Permission",
        link: "/dashboard/role",
        permissionSlug: "viewRole",
      },
    ],
  },
  {
    title: "Payment Method",
    png: "/icons/bankaccount.png",
    sub: [
      {
        title: "Add New",
        link: "/dashboard/r?r=/dashboard/payment-method/create",
        permissionSlug: "createPaymentMethod",
      },
      {
        title: "Payment Methods",
        link: "/dashboard/payment-method",
        permissionSlug: "viewPaymentMethod",
      },
      {
        title: "Add Money",
        link: "/dashboard/r?r=/dashboard/add_money/create",
        permissionSlug: "createPaymentMethod",
      },
      {
        title: "Add Money History",
        link: "/dashboard/add_money",
        permissionSlug: "viewPaymentMethod",
      },
      {
        title: "Withdraw Money",
        link: "/dashboard/r?r=/dashboard/withdraw_money/create",
        permissionSlug: "createPaymentMethod",
      },
      {
        title: "Withdraw History",
        link: "/dashboard/withdraw_money",
        permissionSlug: "viewPaymentMethod",
      },
    ],
  },
  {
    title: "Expense",
    png: "/icons/expense.png",
    sub: [
      {
        title: "Add Expense",
        link: "/dashboard/r?r=/dashboard/expense/create",
        permissionSlug: "createExpense",
      },
      {
        title: "Expenses History",
        link: "/dashboard/expense",
        permissionSlug: "viewExpense",
      },
    ],
  },
  {
    title: "Email & SMS",
    png: "/icons/mail.png",
    sub: [
      {
        title: "SMS",
        link: "/dashboard/sms-sender",
        permissionSlug: "sendSMS",
      },
      {
        title: "SMS Messenger",
        link: "/dashboard/sms-messenger",
        permissionSlug: "sendSMS",
      },
      {
        title: "Email",
        link: "/dashboard/email-sender",
        permissionSlug: "sendEmail",
      },
      {
        title: "Email Messenger",
        link: "/dashboard/email-messenger",
        permissionSlug: "sendEmail",
      },
    ],
  },
  // TODO: Branch
  {
    title: "Branch",
    png: "/icons/branch.png",
    sub: [
      {
        title: "Add Branch",
        link: "/dashboard/branch/create",
        permissionSlug: "createBranch",
      },
      {
        title: "Branch list",
        link: "/dashboard/branch",
        permissionSlug: "viewBranch",
      },
    ],
  },
  {
    title: "Settings And Config",
    png: "/icons/settings.png",
    sub: [
      {
        title: "Site Settings",
        link: "/dashboard/settings/site-settings",
        permissionSlug: "updateSiteSetting",
      },
    ],
  },
  // {
  //   title: "Subscription",
  //   png: "/icons/subscription.png",
  //   link: "/dashboard/subscription",
  //   permissionSlug: "viewSubscription",
  // },
  {
    title: "Change Logs",
    png: "/icons/history.png",
    link: "/dashboard/change-logs",
  },
];
export default sidebarMenuLinks;
