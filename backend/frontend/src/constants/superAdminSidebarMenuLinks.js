const sidebarMenuLinks = [
  {
    title: 'Super Admin',
    icon: 'dashboard',
    link: '/super-admin',
    permissionSlug: 'viewDashboard',
  },
  {
    title: 'Send Notification',
    png: '/icons/notification-bell.png',
    link: '/super-admin/notifications',
  },
  {
    title: 'User',
    png: '/icons/user.png',
    sub: [
      {
        title: 'Add User',
        link: '/super-admin/user/create',
        permissionSlug: 'createUser',
      },
      {
        title: 'User list',
        link: '/super-admin/user',
        permissionSlug: 'viewUser',
      },
      {
        title: 'Add User Role And Permission',
        link: '/super-admin/role/create',
        permissionSlug: 'createRole',
      },
      {
        title: 'User Role And Permission',
        link: '/super-admin/role',
        permissionSlug: 'viewRole',
      },
    ],
  },
  {
    title: 'Shop',
    png: '/icons/shop.png',
    sub: [
      {
        title: 'Shop list',
        link: '/super-admin/shop',
        permissionSlug: 'viewShop',
      },
      {
        title: 'Add Branch',
        link: '/super-admin/branch/create',
        permissionSlug: 'createBranch',
      },
      {
        title: 'Branch list',
        link: '/super-admin/branch',
        permissionSlug: 'viewBranch',
      },
    ],
  },
  {
    title: 'Products',
    png: '/icons/product.png',
    sub: [
      {
        title: 'Bulk Update',
        link: '/super-admin/products/bulk-update',
        permissionSlug: 'editProduct',
      },
    ],
  },
  {
    title: 'Business Profile',
    png: '/icons/presets.png',
    sub: [
      {
        title: 'Profile list',
        link: '/super-admin/business-profile',
        permissionSlug: 'manageBusinessProfile',
      },
      {
        title: 'Preset list',
        link: '/super-admin/product-preset',
        permissionSlug: 'manageProductPreset',
      },
      {
        title: 'Global Tags',
        link: '/super-admin/global-tag',
        permissionSlug: 'manageProductPreset',
      },
      {
        title: 'Languages',
        link: '/super-admin/language',
        permissionSlug: 'manageProductPreset',
      },
    ],
  },
  {
    title: 'Subscription',
    png: '/icons/subscription.png',
    sub: [
      {
        title: 'Add Subscription',
        link: '/super-admin/subscription/create',
        permissionSlug: 'createSubscription',
      },
      {
        title: 'Subscription list',
        link: '/super-admin/subscription',
        permissionSlug: 'viewSubscription',
      },
    ],
  },
  {
    title: "Activation Codes",
    png: "/icons/localarea.png",
    link: "/super-admin/device-activation",
  },
  {
    title: "Desktop Releases",
    png: "/icons/cloud-hosting.png",
    link: "/super-admin/desktop-release",
  },
  {
    title: "Analytics",
    png: "/icons/analysis.png",
    link: "/super-admin/analytics",
  },
  {
    title: "DB",
    png: "/icons/cloud-hosting.png",
    link: "/super-admin/db",
  },
];
export default sidebarMenuLinks