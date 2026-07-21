# Desktop POS Inventory App - Implementation Plan

## Overview

Build an offline-first Electron + Vue.js desktop app that mirrors the api-inventory backend functionality using SQLite, with automatic background sync to the online API.

**Key Requirements:**
- Works completely offline with SQLite local database
- Full-featured backend similar to api-inventory Express.js server
- Background sync function to sync with online version
- Sync runs automatically on app start and after every save/edit/delete
- Multi-device synchronization support

---

## 1. Architecture

```
desktop-app/
├── src/
│   ├── main/                    # Electron main process
│   │   ├── index.ts             # Entry point
│   │   ├── database/            # SQLite layer
│   │   │   ├── connection.ts    # Better-sqlite3 setup
│   │   │   ├── migrations/      # Schema migrations
│   │   │   ├── models/          # Table schemas
│   │   │   └── repositories/    # CRUD operations
│   │   ├── sync/                # Background sync engine
│   │   │   ├── sync-engine.ts   # Core sync orchestrator
│   │   │   ├── sync-queue.ts    # Pending changes queue
│   │   │   └── api-client.ts    # Online API client
│   │   ├── services/            # Business logic (mirrors api-inventory)
│   │   │   ├── product-service.ts
│   │   │   ├── purchase-service.ts
│   │   │   ├── sale-service.ts
│   │   │   ├── inventory-service.ts
│   │   │   └── ...
│   │   ├── activation/          # Device activation
│   │   │   ├── device-service.ts
│   │   │   └── activation-service.ts
│   │   └── ipc-handlers.ts      # IPC handlers for renderer
│   ├── preload/                 # IPC bridge
│   │   └── index.ts             # Expose API to renderer
│   └── renderer/                # Vue.js frontend
│       └── src/                 # Reuse components from api-inventory
└── plan.md                      # This file
```

---

## 2. Database Schema (SQLite)

### Core Tables (UUID-based, mirrors MongoDB collections)

| Table | Web Model | Purpose |
|-------|-----------|---------|
| `products` | Product | Product catalog |
| `productinventories` | ProductInventory | Stock levels per branch (qty tracking, prices) |
| `purchasedproducts` | PurchasedProduct | Purchase line items (stock batches, lot/batch tracking) |
| `soldproducts` | SoldProduct | Sale line items (with warranty status) |
| `purchases` | Purchase | Purchase transactions (financial summary) |
| `productsales` | ProductSale | Sales transactions (financial summary) |
| `contacts` | Contact | Customers and suppliers |
| `suppliers` | Supplier | Supplier companies |
| `supplierpayments` | SupplierPayment | Payments made to suppliers |
| `categories` | Category | Product categories (parent-child) |
| `brands` | Brand | Product brands |
| `units` | Unit | Measurement units (with group & conversion) |
| `users` | User | Staff / employee records |
| `roles` | Role | User roles & permissions |
| `shops` | Shop | Shop configuration |
| `branches` | Branch | Branch settings (POS, print, SMS, email config) |
| `cashbooks` | CashBook | Cash flow records (all financial activities) |
| `expenses` | Expense | Expense tracking |
| `paymentmethods` | PaymentMethod | Payment methods (bank accounts) |
| `stocktransfers` | StockTransfer | Inter-branch stock transfers |
| `producttransfers` | ProductTransfer | Stock transfer line items |
| `productdamageds` | ProductDamaged | Inventory damage tracking |
| `timetrackers` | TimeTracker | Employee attendance (clock in/out) |
| `sync_metadata` | — | **Last sync timestamps per table** |
| `sync_queue` | — | **Pending local changes for sync** |
| `device_info` | — | Device ID, activation status, branch info |
| `sync_conflicts` | — | Sync conflict records |

### UUID Migration

All tables use UUID v4 `id` as PRIMARY KEY (NOT auto-increment integers). This enables:
- Cross-device sync without ID conflicts
- Offline record creation that syncs correctly
- Consistency with migrated api-inventory MongoDB data

### Key Schema Patterns

```sql
-- All tables follow this pattern:
CREATE TABLE products (
    id TEXT PRIMARY KEY,           -- UUID v4
    name TEXT NOT NULL,
    categoryId TEXT REFERENCES categories(id),
    branchId TEXT NOT NULL,
    shopId TEXT NOT NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    isDeleted INTEGER DEFAULT 0,   -- Soft delete: 0 = active, 1 = deleted
    version INTEGER DEFAULT 1       -- Optimistic locking
);

-- Sync metadata table
CREATE TABLE sync_metadata (
    tableName TEXT PRIMARY KEY,
    lastSyncAt DATETIME,
    lastSyncCursor TEXT,          -- Pagination cursor for large tables
    recordCount INTEGER           -- Local record count
);

-- Sync queue for pending changes
CREATE TABLE sync_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tableName TEXT NOT NULL,
    recordId TEXT NOT NULL,
    operation TEXT NOT NULL,        -- 'CREATE', 'UPDATE', 'DELETE'
    payload TEXT,                   -- JSON payload
    retryCount INTEGER DEFAULT 0,
    errorMessage TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    processedAt DATETIME
);

-- Device info
CREATE TABLE device_info (
    deviceId TEXT PRIMARY KEY,
    branchId TEXT,
    shopId TEXT,
    activatedAt DATETIME,
    lastSyncAt DATETIME,
    isActivated INTEGER DEFAULT 0
);
```

---

### 2.1 Detailed Table Schemas (Aligned with Web Version)

#### Products Table (Complete Schema)

```sql
CREATE TABLE products (
    -- Primary & Identifiers
    id TEXT PRIMARY KEY,              -- UUID v4
    
    -- Basic Info
    name TEXT NOT NULL,
    genericName TEXT,                 -- Pharmacy products
    
    -- Pricing
    buyPrice REAL DEFAULT 0,
    retailPrice REAL DEFAULT 0,
    wholesalePrice REAL DEFAULT 0,
    discount REAL DEFAULT 0,
    
    -- Product Codes
    sku TEXT DEFAULT 'SKU',
    barcode TEXT DEFAULT 'Barcode',
    
    -- Tracking & Type
    trackType TEXT DEFAULT 'Qty',     -- 'Qty' | 'Serial'
    productType TEXT DEFAULT 'standard', -- 'standard' | 'variation'
    
    -- Pharmacy Specific
    isPharmacyProduct INTEGER DEFAULT 0,  -- Boolean: 0 = false, 1 = true
    strength TEXT DEFAULT '',
    manufacturer TEXT DEFAULT '',
    
    -- Warranty
    warrantyType TEXT DEFAULT 'No',   -- 'No' | 'Date' | 'Period'
    warrantyPeriod TEXT DEFAULT 'Month', -- 'Day' | 'Week' | 'Month' | 'Year'
    warrantyDuration INTEGER DEFAULT 0,
    warrantyEnd TEXT DEFAULT '2025-07-21',
    
    -- Inventory Settings
    lowStockAlert INTEGER DEFAULT 0,
    openingStock INTEGER DEFAULT 0,
    
    -- Organization
    categoryId TEXT REFERENCES categories(id),
    brandId TEXT REFERENCES brands(id),
    unitId TEXT REFERENCES units(id),
    unitGroup TEXT DEFAULT 'Number',  -- 'Number' | 'Weight' | 'Volume' | etc.
    
    -- Media
    thumbnail TEXT,
    images TEXT,                      -- JSON array of image URLs
    
    -- Analysis
    analysisPeriod INTEGER DEFAULT 30,
    projectionPeriod INTEGER DEFAULT 30,
    
    -- Variation (for variant products)
    variationData TEXT,               -- JSON object
    variationDetails TEXT,            -- JSON array
    
    -- Relations & Tags
    relationalUnitIds TEXT,           -- JSON array of unit IDs
    tags TEXT,                        -- JSON array of strings
    sourceUrl TEXT DEFAULT '',
    
    -- Standard Fields
    branchId TEXT NOT NULL,
    shopId TEXT NOT NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedByDeviceId TEXT,           -- Track which device made last change
    isDeleted INTEGER DEFAULT 0,    -- Soft delete
    isTotalDiscount INTEGER DEFAULT 0,
    version INTEGER DEFAULT 1
);
```

#### Purchases Table (Complete Schema with Financial Fields)

```sql
CREATE TABLE purchases (
    id TEXT PRIMARY KEY,
    
    -- Order Info
    orderId TEXT NOT NULL DEFAULT '',
    invoiceNo TEXT DEFAULT '',
    
    -- Relations
    contactId TEXT REFERENCES contacts(id),
    branchId TEXT NOT NULL,
    shopId TEXT NOT NULL,
    
    -- Status Flags
    isPurchaseOrderRequest INTEGER DEFAULT 0,  -- true = purchase order request / quotation
    isOpeningStock INTEGER DEFAULT 0,         -- true = opening stock
    status INTEGER DEFAULT 1,                 -- 0 = purchase, 1 = purchase request
    deliveryStatus INTEGER DEFAULT 1,         -- 0 = delivered, 1 = pending
    paymentStatus INTEGER DEFAULT 1,          -- 0 = paid, 1 = pending, 2 = partial
    
    -- Dates
    deliveryDate DATETIME DEFAULT CURRENT_TIMESTAMP,
    purchaseDate DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    -- Financial Summary (Normalized)
    amount REAL DEFAULT 0,
    netPurchaseAmount REAL DEFAULT 0,
    grossPurchaseAmount REAL DEFAULT 0,
    netReturnAmount REAL DEFAULT 0,
    grossReturnAmount REAL DEFAULT 0,
    totalPayable REAL DEFAULT 0,
    paidAmount REAL DEFAULT 0,
    netPaidAmount REAL DEFAULT 0,
    refundedAmount REAL DEFAULT 0,
    dueAmount REAL DEFAULT 0,
    
    -- Discount
    isTotalDiscount INTEGER DEFAULT 0,
    totalDiscount REAL DEFAULT 0,
    totalDiscountType TEXT DEFAULT 'Percentage', -- 'Percentage' | 'Fixed'
    
    -- Notes
    refundNote TEXT DEFAULT '',
    note TEXT DEFAULT '',
    
    -- Audit
    createdByUserId TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedByDeviceId TEXT,
    isDeleted INTEGER DEFAULT 0,
    version INTEGER DEFAULT 1
);
```

#### Product Sales Table (Complete Schema with Financial Fields)

Web model: `ProductSale` → MongoDB collection: `productsales`

```sql
CREATE TABLE productsales (
    id TEXT PRIMARY KEY,
    
    -- Order Info
    orderId TEXT DEFAULT '',
    
    -- Relations
    contactId TEXT,
    branchId TEXT,
    shopId TEXT,
    
    -- Sale Type & Status
    saleType TEXT DEFAULT 'retail',         -- 'retail' | 'wholeSale'
    isSalesOrderRequest INTEGER DEFAULT 0,   -- true = sales order request / quotation
    status INTEGER DEFAULT 0,               -- 0 = sale, 1 = sale with returned
    deliveryStatus INTEGER DEFAULT 1,       -- 0 = delivered, 1 = pending
    paymentStatus INTEGER DEFAULT 1,        -- 0 = paid, 1 = due, 2 = partial
    
    -- Dates
    orderDate DATETIME,
    deliveryDate DATETIME,
    
    -- Financial Summary (all normalized)
    amount REAL DEFAULT 0,                  -- Sum of products amount
    totalAmount REAL DEFAULT 0,             -- Total net amount
    netSalesAmount REAL DEFAULT 0,          -- Total net sold amount
    grossSalesAmount REAL DEFAULT 0,        -- Total gross sold amount
    netReturnAmount REAL DEFAULT 0,         -- Total net returned amount
    grossReturnAmount REAL DEFAULT 0,       -- Total gross returned amount
    totalPayable REAL DEFAULT 0,
    netPaidAmount REAL DEFAULT 0,           -- Customer net paid amount
    paidAmount REAL DEFAULT 0,              -- Customer paid amount
    refundedAmount REAL DEFAULT 0,          -- Customer refunded amount
    dueAmount REAL DEFAULT 0,               -- Customer due amount
    pastDue REAL DEFAULT 0,
    currentDue REAL DEFAULT 0,
    
    -- Discount
    isTotalDiscount INTEGER DEFAULT 0,
    totalDiscount REAL DEFAULT 0,
    totalDiscountType TEXT DEFAULT 'Percentage', -- 'Percentage' | 'Fixed'
    
    -- Related IDs (JSON arrays linking to soldproducts and cashbooks)
    payments TEXT,                          -- JSON array of payment references
    paymentIds TEXT,                        -- JSON array of cashbooks IDs
    soldProducts TEXT,                      -- JSON array of sold product references
    soldProductIds TEXT,                    -- JSON array of soldproducts IDs
    
    -- Notes & Audit
    note TEXT DEFAULT '',
    createdBy TEXT,                         -- User name who created
    createdByUserId TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedByDeviceId TEXT,
    isDeleted INTEGER DEFAULT 0,
    version INTEGER DEFAULT 1
);
```

#### Purchased Products Table (Line Items for Purchase)

Web model: `PurchasedProduct` → SQLite table: `purchasedproducts`

```sql
CREATE TABLE purchasedproducts (
    id TEXT PRIMARY KEY,
    purchaseId TEXT REFERENCES purchases(id),
    purchasedProductId TEXT,               -- For return lines: link back to original purchased product
    productId TEXT REFERENCES products(id),
    
    -- Status
    status INTEGER DEFAULT 0,              -- 0 = purchased, 1 = returned
    
    -- Product Identification
    barcode TEXT DEFAULT '',
    lotNo TEXT DEFAULT '',
    batchNo TEXT DEFAULT '',
    expiryDate DATETIME,
    variant TEXT,                          -- JSON object for variation details
    
    -- Pricing
    buy REAL DEFAULT 0,                    -- Buy price
    refBuy REAL DEFAULT 0,                 -- Reference buy price (original)
    discount REAL DEFAULT 0,
    discountType TEXT DEFAULT 'Percentage', -- 'Percentage' | 'Fixed'
    refDiscount REAL DEFAULT 0,            -- Reference discount (original)
    total REAL DEFAULT 0,                  -- Line total
    
    -- Quantity Tracking
    quantity REAL DEFAULT 0,               -- Purchased quantity
    stockQuantity REAL DEFAULT 0,          -- Available in stock
    soldQuantity REAL DEFAULT 0,           -- Sold from this purchase
    damagedQuantity REAL DEFAULT 0,        -- Damaged in stock
    returnedQuantity REAL DEFAULT 0,       -- Purchase return quantity
    transferredQuantity REAL DEFAULT 0,    -- Transferred to another branch
    
    -- Unit Reference
    refUnit TEXT,                          -- Reference unit name
    refUnitId TEXT,                        -- Reference unit ID
    refQuantities TEXT,                    -- JSON array: [{unitId, quantity}]
    
    -- Warranty
    warrantyType TEXT DEFAULT 'No',        -- 'No' | 'Date' | 'Period'
    warrantyPeriod TEXT DEFAULT 'Month',   -- 'Day' | 'Week' | 'Month' | 'Year'
    warrantyDuration INTEGER DEFAULT 0,
    warrantyEnd TEXT,
    
    -- Relations
    branchId TEXT,
    shopId TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedByDeviceId TEXT,
    isDeleted INTEGER DEFAULT 0
);
```

#### Sold Products Table (Line Items for Sale)

Web model: `SoldProduct` → SQLite table: `soldproducts`

```sql
CREATE TABLE soldproducts (
    id TEXT PRIMARY KEY,
    productSaleId TEXT REFERENCES productsales(id),  -- Parent sale
    productId TEXT REFERENCES products(id),
    purchasedProductId TEXT,                   -- Link to purchased stock
    soldProductId TEXT,                        -- For returns: link back to original sold product
    
    -- Status
    status INTEGER DEFAULT 0,                  -- 0 = sold, 1 = returned
    
    -- Pricing (always positive values; status determines sold vs returned)
    price REAL DEFAULT 0,                      -- Sale price per unit
    discount REAL DEFAULT 0,
    refDiscount REAL DEFAULT 0,                -- Reference discount (original)
    discountType TEXT DEFAULT 'Percentage',    -- 'Percentage' | 'Fixed'
    subTotal REAL DEFAULT 0,                   -- Before discount
    total REAL DEFAULT 0,                      -- After discount
    
    -- Quantity
    quantity REAL DEFAULT 0,                   -- Total qty in refUnit
    
    -- Unit Reference
    refUnitId TEXT,                            -- Reference unit ID
    refQuantities TEXT,                        -- JSON array: [{unitId, quantity}]
    
    -- Warranty
    warrantyType TEXT DEFAULT 'No',            -- 'No' | 'Date' | 'Period'
    warrantyPeriod TEXT DEFAULT 'Month',       -- 'Day' | 'Week' | 'Month' | 'Year'
    warrantyDuration INTEGER DEFAULT 0,
    warrantyEnd TEXT,
    warrantyStatus TEXT DEFAULT 'On Sold',     -- 'On Sold' | 'Warranty Received' | 'On Warranty' | 'Warranty Completed'
    
    -- Relations
    branchId TEXT,
    shopId TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedByDeviceId TEXT,
    isDeleted INTEGER DEFAULT 0
);
```

#### Other Related Tables

```sql
-- Product Inventories (stock levels per branch)
-- Web model: ProductInventory → MongoDB collection: productinventories
CREATE TABLE productinventories (
    id TEXT PRIMARY KEY,
    productId TEXT NOT NULL REFERENCES products(id),
    branchId TEXT NOT NULL,
    
    -- Quantity Tracking
    purchasedQuantity REAL DEFAULT 0,     -- Total purchased
    stockQuantity REAL DEFAULT 0,         -- Available in stock
    soldQuantity REAL DEFAULT 0,          -- Total sold
    damagedQuantity REAL DEFAULT 0,       -- Total damaged
    returnedQuantity REAL DEFAULT 0,      -- Total sale returns
    transferredQuantity REAL DEFAULT 0,   -- Total transferred out
    
    -- Pricing (branch-level overrides)
    buyPrice REAL DEFAULT 0,
    retailPrice REAL DEFAULT 0,
    wholesalePrice REAL DEFAULT 0,
    
    -- Settings
    lowStockAlert INTEGER DEFAULT 0,
    analysisPeriod INTEGER DEFAULT 30,
    projectionPeriod INTEGER DEFAULT 30,
    
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedByDeviceId TEXT,
    UNIQUE(productId, branchId)
);

-- Users (for staff login)
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE,
    email TEXT NOT NULL UNIQUE,
    passwordHash TEXT,              -- Never store plain text passwords
    name TEXT,
    phone1 TEXT,
    phone2 TEXT,
    address TEXT,
    
    -- Employee/Staff fields
    nidNo TEXT,                     -- National ID
    birthRegistrationNo TEXT,
    fatherName TEXT,
    motherName TEXT,
    designation TEXT,
    salary REAL DEFAULT 0,
    monthlySalary REAL DEFAULT 0,
    hourlySalary REAL DEFAULT 0,
    joiningDate DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    -- Relations
    roleIds TEXT,                   -- JSON array of role IDs
    branchId TEXT,
    branchIds TEXT,                 -- JSON array for multiple branch access
    shopId TEXT,
    
    isActive INTEGER DEFAULT 1,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedByDeviceId TEXT
);

-- Roles
-- Web model: Role → slug enum: 'user' | 'shopAdmin' | 'admin' | 'superAdmin'
CREATE TABLE roles (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL DEFAULT 'user', -- 'user' | 'shopAdmin' | 'admin' | 'superAdmin'
    name TEXT NOT NULL,
    description TEXT,
    permissions TEXT,               -- JSON array of permission slugs
    shopId TEXT,
    branchId TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Suppliers
-- Web model: Supplier → uses 'shop'/'branch' (not shopId/branchId)
CREATE TABLE suppliers (
    id TEXT PRIMARY KEY,
    companyName TEXT NOT NULL,         -- Note: web uses companyName, not name
    details TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    warrantyPhone TEXT,
    warrantyAddress TEXT,
    shop TEXT,                         -- Note: web uses 'shop' not 'shopId'
    branch TEXT,                       -- Note: web uses 'branch' not 'branchId'
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedByDeviceId TEXT,
    isDeleted INTEGER DEFAULT 0
);

-- Shops
CREATE TABLE shops (
    id TEXT PRIMARY KEY,
    userId TEXT,                    -- Created by user
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    phone1 TEXT NOT NULL,
    phone2 TEXT NOT NULL,
    email TEXT NOT NULL,
    license TEXT NOT NULL,
    note TEXT NOT NULL,
    isPharmacy INTEGER DEFAULT 0,   -- Boolean flag
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedByDeviceId TEXT
);

-- Branches (full settings hub per branch)
-- Web model: Branch → extensive config for POS behavior, printing, SMS, email
CREATE TABLE branches (
    id TEXT PRIMARY KEY,
    userId TEXT,                        -- Created by user
    name TEXT NOT NULL,
    phone TEXT DEFAULT '',
    email TEXT DEFAULT '',
    address TEXT NOT NULL,
    isPharmacy INTEGER DEFAULT 0,
    shopId TEXT NOT NULL,
    
    -- Default references
    unitId TEXT,                        -- Default unit for this branch
    paymentMethodId TEXT,               -- Default payment method
    
    -- UI / Branding
    site_image TEXT DEFAULT '/uploads/logo.png',
    loginSuccessRedirect TEXT DEFAULT '/dashboard/sales/create',
    
    -- Inventory Settings
    inventoryAdjustment INTEGER DEFAULT 0, -- 0 = auto FIFO, 1 = manual (sale from purchased product)
    saleFromStock INTEGER DEFAULT 0,       -- Boolean
    saleOnlyInStockProduct INTEGER DEFAULT 0, -- Boolean
    
    -- Print Settings
    defaultPrint TEXT DEFAULT 'Invoice',    -- 'Invoice' | 'Slip' | 'Chalan' | 'Custom'
    pageSize TEXT DEFAULT 'A4',            -- 'A4' | 'A5' | 'A6' | 'Custom'
    pageWidth INTEGER DEFAULT 210,         -- mm
    pageHeight INTEGER DEFAULT 297,        -- mm
    invoiceNotes TEXT DEFAULT '',
    chalanNotes TEXT DEFAULT '',
    slipNotes TEXT DEFAULT '',
    
    -- SMS Config (JSON objects)
    smsConfig TEXT,                         -- JSON: {url, headers, body, messageKey, numberKey}
    smsTemplate TEXT,                       -- JSON: {productPurchase, payment, productSale, ...}
    
    -- Email Config (JSON objects)
    emailConfig TEXT,                       -- JSON: {type, service, host, port, user, pass, ...}
    emailTemplate TEXT,                     -- JSON: {productPurchase, payment, productSale, ...}
    
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedByDeviceId TEXT
);

-- Categories (with parent-child support)
CREATE TABLE categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT 'No name',
    slug TEXT NOT NULL,
    categoryType TEXT DEFAULT 'default',
    rootCategory INTEGER DEFAULT 1,    -- Boolean: 1 = root, 0 = child
    parentCategory TEXT DEFAULT NULL,   -- References categories(id) for subcategories
    thumbnail TEXT DEFAULT '/placeholder-image.jpg',
    shopId TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedByDeviceId TEXT,
    isDeleted INTEGER DEFAULT 0
);

-- Brands
CREATE TABLE brands (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT 'No name',
    slug TEXT NOT NULL DEFAULT 'no-name',
    thumbnail TEXT DEFAULT '/placeholder-image.jpg',
    shopId TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedByDeviceId TEXT,
    isDeleted INTEGER DEFAULT 0
);

-- Units (with unit group and conversion)
CREATE TABLE units (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    symbol TEXT NOT NULL,
    group TEXT DEFAULT 'Number',        -- 'Mass' | 'Number' | 'Volume' | 'Length' | 'Area' | 'Time'
    multiplier REAL DEFAULT 1,          -- Conversion factor to base unit
    isBaseUnit INTEGER DEFAULT 1,       -- Boolean: 1 = base unit, 0 = derived
    isGlobal INTEGER DEFAULT 0,         -- Boolean: 1 = system-wide, 0 = shop-specific
    shopId TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedByDeviceId TEXT,
    isDeleted INTEGER DEFAULT 0
);

-- Contacts (customers and suppliers)
CREATE TABLE contacts (
    id TEXT PRIMARY KEY,
    name TEXT,
    phone TEXT NOT NULL,                -- Required, unique per shop
    email TEXT,
    address TEXT,
    
    -- Financial balances
    receivable REAL DEFAULT 0,          -- Amount customer owes you
    payable REAL DEFAULT 0,             -- Amount you owe supplier
    netBalance REAL DEFAULT 0,          -- Net position
    
    -- Contact details
    details TEXT,                       -- Additional info
    contactType TEXT DEFAULT 'Personal', -- 'Personal' | 'Business'
    
    -- Business contact person (for Business type)
    contactPersonName TEXT,
    contactPersonPhone TEXT,
    contactPersonEmail TEXT,
    contactPersonAddress TEXT,
    
    -- Warranty info
    warrantyPhone TEXT,
    warrantyAddress TEXT,
    
    shopId TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedByDeviceId TEXT,
    isDeleted INTEGER DEFAULT 0
);

-- Cashbooks (financial transactions)
-- Web model: CashBook → MongoDB collection: cashbooks
CREATE TABLE cashbooks (
    id TEXT PRIMARY KEY,
    amount REAL NOT NULL DEFAULT 0,
    cashIn REAL DEFAULT 0,              -- Future: separate cash in amount
    cashOut REAL DEFAULT 0,             -- Future: separate cash out amount
    type TEXT NOT NULL DEFAULT 'CashIn', -- 'CashIn' | 'CashOut'
    activity TEXT NOT NULL DEFAULT 'productSale', -- See CashBookActivity enum below
    note TEXT DEFAULT '',
    meta TEXT,                          -- JSON object for additional metadata
    
    -- Relations
    paymentMethodId TEXT NOT NULL,
    referenceId TEXT,                 -- Link to sale/purchase/expense
    contactId TEXT,
    branchId TEXT NOT NULL,
    shopId TEXT NOT NULL,
    
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedByDeviceId TEXT,
    isDeleted INTEGER DEFAULT 0
);

-- CashBookActivity enum values:
-- CashIn activities: productSale, addMoney, contactPayment, supplierOpeningDue, purchaseReturn
-- CashOut activities: productSaleReturn, supplierPayment, employeeSalary, withdrawMoney, 
--                     contactWithdraw, contactOpeningDue, supplierWithdraw, purchase, expense

-- Expenses
CREATE TABLE expenses (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT 'Unnamed expense',
    date DATETIME DEFAULT CURRENT_TIMESTAMP,
    note TEXT DEFAULT '',
    amount REAL NOT NULL DEFAULT 0,
    paidAmount REAL DEFAULT 0,
    contactId TEXT,
    branchId TEXT NOT NULL,
    shopId TEXT NOT NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedByDeviceId TEXT,
    isDeleted INTEGER DEFAULT 0
);

-- Payment Methods
CREATE TABLE paymentmethods (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    accountNumber TEXT NOT NULL,
    accountType TEXT,               -- e.g., 'bank', 'mobile', 'card'
    balance REAL DEFAULT 0,
    note TEXT,
    isActive INTEGER DEFAULT 1,
    branchId TEXT,
    shopId TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedByDeviceId TEXT
);

-- Time Tracker (Employee attendance)
CREATE TABLE timetrackers (
    id TEXT PRIMARY KEY,
    userId TEXT REFERENCES users(id),
    clockIn DATETIME NOT NULL,
    clockOut DATETIME,
    totalHours REAL DEFAULT 0,
    status TEXT DEFAULT 'active',   -- 'active' | 'inactive'
    branchId TEXT,
    shopId TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedByDeviceId TEXT
);

-- Stock Transfers (Inter-branch)
-- Web model: StockTransfer → uses shopBranchRelations
CREATE TABLE stocktransfers (
    id TEXT PRIMARY KEY,
    orderId TEXT DEFAULT '',
    fromBranchId TEXT,
    toBranchId TEXT,
    
    -- Status
    isPurchaseOrderRequest INTEGER DEFAULT 0,  -- true = transfer request
    status INTEGER DEFAULT 1,                  -- 0 = transfer, 1 = transfer request
    deliveryStatus INTEGER DEFAULT 1,          -- 0 = delivered, 1 = pending
    paymentStatus INTEGER DEFAULT 1,           -- 0 = paid, 1 = pending, 2 = partial
    
    -- Dates
    deliveryDate DATETIME,
    purchaseDate DATETIME,                     -- Transfer date
    
    -- Financial
    amount REAL DEFAULT 0,
    paidAmount REAL DEFAULT 0,
    dueAmount REAL DEFAULT 0,
    
    -- Discount
    isTotalDiscount INTEGER DEFAULT 0,
    totalDiscount REAL DEFAULT 0,
    totalDiscountType TEXT DEFAULT 'Percentage',
    
    invoiceNo TEXT DEFAULT '',
    note TEXT DEFAULT '',
    createdByUserId TEXT,
    
    branchId TEXT,
    shopId TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedByDeviceId TEXT,
    isDeleted INTEGER DEFAULT 0
);

-- Product Transfers (line items for stock transfer)
-- Web model: ProductTransfer → uses shopBranchRelations
CREATE TABLE producttransfers (
    id TEXT PRIMARY KEY,
    stockTransferId TEXT NOT NULL REFERENCES stocktransfers(id),
    productId TEXT NOT NULL REFERENCES products(id),
    purchasedProductId TEXT,               -- Link to purchased stock being transferred
    quantity REAL DEFAULT 0,
    refQuantities TEXT,                    -- JSON array: [{unitId, quantity}]
    shippingCost REAL DEFAULT 0,           -- Shipping cost for this product
    branchId TEXT,
    shopId TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedByDeviceId TEXT
);

-- Supplier Payments
-- Web model: SupplierPayment → tracks payments made to suppliers
CREATE TABLE supplierpayments (
    id TEXT PRIMARY KEY,
    supplier TEXT,                          -- Supplier reference
    contactId TEXT,
    purchase TEXT,                          -- Purchase reference
    purchaseId TEXT,                        -- Purchase ID link
    payments TEXT,                          -- JSON array of payment references
    paymentIds TEXT,                        -- JSON array of cashbooks IDs
    paidAmount REAL DEFAULT 0,             -- Supplier paid amount
    amount REAL DEFAULT 0,                 -- Due amount paid
    purchasePaid REAL DEFAULT 0,           -- Product purchase paid amount
    note TEXT DEFAULT '',
    branchId TEXT,
    shopId TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedByDeviceId TEXT,
    isDeleted INTEGER DEFAULT 0
);

-- Product Damageds (inventory damage tracking)
-- Web model: ProductDamaged → MongoDB collection: productdamageds
CREATE TABLE productdamageds (
    id TEXT PRIMARY KEY,
    purchasedProductId TEXT NOT NULL,       -- Link to damaged purchased product
    quantity REAL DEFAULT 0,
    refQuantities TEXT,                    -- JSON array: [{unit, unitId, quantity}]
    reason TEXT DEFAULT '',
    date TEXT DEFAULT '',
    branchId TEXT,
    shopId TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedByDeviceId TEXT,
    isDeleted INTEGER DEFAULT 0
);
```

---

## 3. Sync Process Overview (One Server → Multiple Devices)

### 3.0 Sync Overview Table

| Phase | Overview | Device Action | Server Role | Data Flow Direction | Conflict Resolution |
|-------|----------|---------------|-------------|---------------------|---------------------|
| **1. Prepare** | Calculate sync window with -1s buffer | Load `lastSyncAt`, get current timestamp, compute `syncWindowStart = lastSyncAt - 1s` | None (local only) | N/A | N/A |
| **2. Gather Local Changes** | Query local changes since last sync | Query all tables where `updatedAt >= syncWindowStart`, collect creates/updates/deletes | None (local only) | SQLite → Memory | N/A |
| **3. Push & Get** | **Single request:** Send local changes, receive other devices' changes | Send changes to `/sync/exchange` with `deviceId` + `since` timestamp | **Atomic operation:** 1) Apply device's changes (validate timestamps), 2) Query & return all newer changes from other devices since `since` | Device → Server → Device | Server: rejects older/equal timestamps. Device: applies returned changes (newer wins) |
| **4. Finalize** | Apply server response & update metadata | Apply returned changes to local DB, update `sync_metadata.lastSyncAt`, emit completion | None | Memory → SQLite | Local applies "last-write-wins" on returned data |

**Key Design Principles:**
- **Single Source of Truth**: Server validates all writes and returns authoritative data
- **Per-Device Sync State**: Each device has its own `lastSyncAt` timestamp
- **-1 Second Buffer**: Prevents missing updates due to timing edge cases
- **Single Exchange**: One request/response handles both push and pull - more efficient
- **Conflict Resolution**: Timestamp-based last-write-wins at both levels

---

### 3.1 Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Device A   │◄────►│   Server    │◄────►│  Device B   │
│  (Branch 1) │ PUSH │ (MongoDB)   │ PUSH │  (Branch 1) │
│             │  +   │             │  +   │             │
│             │ GET  │             │ GET  │             │
└─────────────┘     └─────────────┘     └─────────────┘
        ▲                                    ▲
        └──────────────┬─────────────────────┘
                       │
              ┌────────┴────────┐
              │  Device C       │
              │  (Branch 1)     │
              └─────────────────┘
```

**Sync Exchange Flow (Single Request):**

```
Device A                          Server
   │                               │
   │  1. Query local changes       │
   │     since lastSyncAt - 1s     │
   │◄──────────────────────────────┤
   │                               │
   │  2. POST /sync/exchange       │
   │     {                         │
   │       deviceId: "A",          │
   │       since: "09:59:59",      │
   │       changes: [...]          │
   │     }                         │
   │ ─────────────────────────────►│
   │                               │
   │                               │  3. Apply Device A's changes
   │                               │     ├─ Validate timestamps
   │                               │     ├─ CREATE / UPDATE / REJECT
   │                               │     └─ Update server DB
   │                               │
   │                               │  4. Query other devices' changes
   │                               │     ├─ Find records where
   │                               │     │  updatedAt >= since
   │                               │     │  AND deviceId != "A"
   │                               │     └─ Also include any online edits
   │                               │
   │  5. Response:                 │
   │     {                         │
   │       applied: [...],         │
   │       rejected: [...],        │
   │       serverChanges: [...]    │
   │     }                         │
   │◄──────────────────────────────┤
   │                               │
   │  6. Apply serverChanges         │
   │     to local DB               │
   │◄──────────────────────────────┤
   │                               │
   │  7. Update lastSyncAt         │
   │     Done!                     │
   ▼                               ▼
```

**Key Principles:**
- **Single Source of Truth**: Server (MongoDB) maintains authoritative data
- **Independent Per-Device Sync**: Each device tracks its own `lastSyncAt` timestamp
- **Push-and-Get**: One request sends local changes AND receives other devices' changes
- **Time Buffer**: -1 second overlap ensures no updates are missed
- **Other Devices Auto-Push**: Devices B & C push their changes to server when they save (or on pending sync when online)

### 3.2 Sync Flow

#### Step 1: Determine Sync Window

```
Device Local State:
├─ lastSyncAt: 2024-01-15 10:00:00
└─ currentTime:  2024-01-15 10:05:00

Sync Window: [lastSyncAt - 1s] → [currentTime]
           = 2024-01-15 09:59:59 → 2024-01-15 10:05:00
           (5 min + 1s overlap)
```

#### Step 2: Gather Local Changes

```
Device Local DB:
├─ For each sync-enabled table:
│   ├─ Query records where updatedAt >= syncWindowStart
│   ├─ Collect creates, updates, soft-deletes
│   └─ Build payload: {table, operation, record}
│
└─ Hold changes in memory for sync exchange
```

**Example Payload Building:**
```javascript
const changes = [
  { table: "products", operation: "CREATE", record: {...} },
  { table: "productsales", operation: "UPDATE", record: {...} },
  { table: "products", operation: "DELETE", recordId: "..." }
];
```

#### Step 3: Sync Exchange (Push & Get Combined)

```
Device                          Server
   │                               │
   │  3. POST /sync/exchange       │
   │     {                         │
   │       deviceId: "A",          │
   │       since: "09:59:59",    │
   │       changes: [...]          │
   │     }                         │
   │ ─────────────────────────────►│
   │                               │
   │                               │  4. Apply incoming changes
   │                               │     ├─ Validate timestamps
   │                               │     ├─ CREATE / UPDATE / REJECT
   │                               │     └─ Update server DB
   │                               │
   │                               │  5. Query other devices' changes
   │                               │     ├─ Find records where
   │                               │     │  updatedAt >= since
   │                               │     │  AND deviceId != "A"
   │                               │     └─ Include online edits
   │                               │
   │  6. Response:                 │
   │     {                         │
   │       applied: [...],         │
   │       rejected: [...],        │
   │       serverChanges: [...]   │
   │     }                         │
   │◄──────────────────────────────┤
```

**Server Validation Logic:**
```
For each incoming record:
  ├─ If record.id NOT in DB → CREATE (new from this device)
  ├─ If record.id EXISTS:
  │   ├─ If incoming.updatedAt > existing.updatedAt → UPDATE
  │   └─ If incoming.updatedAt <= existing.updatedAt → SKIP (server wins)
  └─ Mark as processed
```

**Server Query Logic for Response:**
```sql
-- Query changes from OTHER devices to return in same response
SELECT * FROM products
WHERE updatedAt >= :syncStart
  AND updatedAt <= :currentTime
  AND updatedByDeviceId != :thisDeviceId
```

#### Step 4: Apply Changes Locally

```
Device Local DB:
├─ For each remote change:
│   ├─ If record NOT exists locally → INSERT
│   ├─ If record EXISTS:
│   │   └─ If remote.updatedAt > local.updatedAt → UPDATE
│   │   └─ Else → SKIP (local wins)
│   └─ Log any conflicts
│
└─ Update lastSyncAt = currentTime
```

### 3.3 Complete Sync Sequence (4 Phases)

```
┌─────────────────────────────────────────────────────────────────┐
│                     SYNC FUNCTION TRIGGERED                     │
│              (On app start / After CRUD / Manual)               │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 1: PREPARE                                               │
│  ├─ Get current timestamp (syncStart)                         │
│  ├─ Load lastSyncAt from syncMetadata                         │
│  ├─ Calculate syncWindowStart = lastSyncAt - 1 second         │
│  └─ Initialize empty change set                                 │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 2: GATHER LOCAL CHANGES (for PUSH)                       │
│  For each sync-enabled table:                                   │
│   ├─ Query records where updatedAt >= syncWindowStart         │
│   ├─ Collect creates, updates, soft-deletes                     │
│   └─ Build payload: {table, operation, record}                  │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 3: SYNC EXCHANGE (PUSH & GET in single request)          │
│  ├─ Send POST /api/sync/exchange                                │
│  │   { deviceId, branchId, since, changes[] }                     │
│  │                                                               │
│  │  Server Actions (atomic):                                    │
│  │   ├─ Apply incoming changes (validate timestamps)           │
│  │   │   ├─ New record → CREATE                                │
│  │   │   ├─ Incoming newer → UPDATE                            │
│  │   │   └─ Incoming older/equal → REJECT                      │
│  │   │                                                           │
│  │   └─ Query & return serverChanges:                           │
│  │       records where updatedAt >= since                       │
│  │       AND deviceId != thisDeviceId                           │
│  │                                                               │
│  └─ Receive response: { applied[], rejected[], serverChanges } │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 4: FINALIZE                                              │
│  ├─ Apply serverChanges to local DB:                           │
│  │   ├─ New records → INSERT                                    │
│  │   ├─ Existing + newer → UPDATE                              │
│  │   └─ Existing + older → SKIP (conflict log)                   │
│  ├─ Update syncMetadata.lastSyncAt = syncStart                  │
│  ├─ Clear processed items from syncQueue                        │
│  ├─ Log sync results (counts, errors, duration)                 │
│  └─ Emit sync:complete event                                    │
└─────────────────────────────────────────────────────────────────┘
```

**Result:** Single HTTP request handles both push and pull. No separate pull phase needed.

### 3.4 Sync Metadata Schema (Per-Device)

Each device maintains independent sync state:

```sql
-- Per-table sync tracking
CREATE TABLE sync_metadata (
    tableName TEXT PRIMARY KEY,
    lastSyncAt DATETIME,         -- When this table was last synced
    lastSyncDevice TEXT,         -- Device that made the change (redundant but useful)
    recordCount INTEGER,         -- Local count for validation
    syncVersion INTEGER DEFAULT 1 -- Schema version for migrations
);

-- Global device sync state
CREATE TABLE device_sync_state (
    deviceId TEXT PRIMARY KEY,
    branchId TEXT NOT NULL,
    shopId TEXT NOT NULL,
    lastFullSyncAt DATETIME,    -- Last time all tables were synced
    isSyncing INTEGER DEFAULT 0, -- Lock flag to prevent concurrent syncs
    syncErrorsCount INTEGER DEFAULT 0
);
```

### 3.5 The -1 Second Buffer (Safety Mechanism)

```
Timeline:
10:00:00.000  Device A saves Product X
10:00:00.200  Device B saves Product Y
10:00:00.500  Device A sync completes (lastSyncAt = 10:00:00.500)
10:00:00.800  Device B sync starts

Without buffer:
- Device B queries: updatedAt >= 10:00:00.500
- MISSES Product X (updated at 10:00:00.000)

With -1 second buffer:
- Device B queries: updatedAt >= 10:00:00.500 - 1s = 10:00:00.500
- Actually queries: updatedAt >= 9:59:59.500
- CATCHES Product X (even though it's "old")

Result: Product X appears in Device B's pull, ensuring consistency
```

**Why 1 second?**
- Covers most network latency + processing delays
- Small enough to avoid excessive duplicate data
- Can be adjusted based on observed sync patterns

### 3.6 Conflict Resolution

**Conflict occurs when:**
- Same record modified on 2+ devices between syncs
- Server receives older data after applying newer data

**Resolution Strategy:**
```
Server Decision (Single Source of Truth):
├─ Compare updatedAt timestamps
├─ Higher timestamp WINS
├─ Lower timestamp is REJECTED
└─ Rejected change logged for admin review

Device Handling:
├─ Accept server's decision
├─ Apply winning change locally
├─ If local change rejected → update local record to server version
└─ Log conflict for potential manual review
```

**Conflict Log Table:**
```sql
CREATE TABLE sync_conflicts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tableName TEXT NOT NULL,
    recordId TEXT NOT NULL,
    localUpdatedAt DATETIME,
    remoteUpdatedAt DATETIME,
    localData TEXT,              -- JSON
    remoteData TEXT,             -- JSON
    resolution TEXT,              -- 'SERVER_WINS' | 'LOCAL_WINS'
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 3.7 Sync Triggers

| Event | Sync Action | Priority |
|-------|-------------|----------|
| App startup | Sync exchange (push local + get remote) | High |
| Record created | Sync exchange (push + get) | High |
| Record updated | Sync exchange (push + get) | High |
| Record deleted (soft) | Sync exchange (push delete + get) | High |
| Timer (30s) | Sync exchange (get any missed changes) | Low |
| Manual trigger | Full sync exchange | High |
| Network restored | Process sync_queue, then sync exchange | High |

**Note:** Each sync is a single `/sync/exchange` request that:
1. Pushes any local changes since last sync
2. Gets all changes from other devices + online since last sync

Other devices (B, C) push their data to server when they save. Device A receives those changes when it performs its own sync exchange.

### 3.8 Offline Handling

```
When network unavailable:
├─ Save to SQLite locally (normal operation)
├─ Add to sync_queue with status='pending'
├─ Continue app operation (offline mode)
└─ Show offline indicator in UI

When network restored:
├─ Detect connectivity change
├─ Process sync_queue (send pending changes)
├─ Trigger sync exchange (push + get)
└─ Clear queue as items confirmed by server
```

### 3.9 API Endpoints (Server Side)

```
POST /api/sync/exchange
  Description: Single endpoint for push-and-get sync
  Request:  {
    deviceId: "uuid",
    branchId: "uuid",
    since: "2024-01-15T09:59:59.000Z",  // lastSyncAt - 1s
    changes: [
      { table: "products", operation: "CREATE", record: {...} },
      { table: "productsales", operation: "UPDATE", record: {...} },
      { table: "products", operation: "DELETE", recordId: "..." }
    ]
  }
  Response: {
    applied: [                          // Device's changes that were applied
      { table: "products", recordId: "...", serverUpdatedAt: "..." }
    ],
    rejected: [                         // Device's changes that were rejected (stale)
      { table: "products", recordId: "...", reason: "stale_data" }
    ],
    serverChanges: {                   // Changes from OTHER devices + online
      products: [...],
      productsales: [...],
      purchases: [...]
      // ... all tables
    },
    serverTimestamp: "2024-01-15T10:05:00.000Z"  // For next sync calculation
  }

POST /api/sync/initial
  Description: First sync after device activation - download full branch data
  Request:  { deviceId, branchId, activationCode }
  Response: {
    fullData: {
      products: [...],
      categories: [...],
      contacts: [...],
      // ... all tables
    },
    serverTimestamp: "..."
  }
```

---

## 3.10 Device Activation Flow

### Overview

Device activation is a **one-time setup process** that:
1. Registers the device with the server
2. Links device to a specific branch/shop
3. Downloads full branch data for offline use
4. Enables subsequent sync operations

### Activation Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    FIRST APP LAUNCH                             │
│              (Device not yet activated)                           │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 1: GENERATE DEVICE ID                                     │
│  ├─ Check if deviceId exists in deviceInfo table                │
│  ├─ If not, generate new UUID v4 (or use hardware ID)           │
│  └─ Store: { deviceId, isActivated: 0 }                         │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 2: SHOW ACTIVATION SCREEN                                   │
│  ├─ User enters activation code (from server/admin)             │
│  └─ User selects branch/shop (or auto-assigned)                 │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 3: REQUEST ACTIVATION                                       │
│  POST /api/device/activate                                        │
│  {                                                                │
│    deviceId: "uuid",                                              │
│    activationCode: "ABC-123-XYZ",                                 │
│    deviceName: "POS Terminal 1",  // optional                       │
│    deviceInfo: { os, version, hardwareId }                       │
│  }                                                                │
│                                                                   │
│  Server validates:                                                │
│   ├─ Is activationCode valid?                                   │
│   ├─ Is code unused/expired?                                    │
│   ├─ Which branch/shop does code belong to?                     │
│   └─ Register device in server's device collection                │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 4: ACTIVATION SUCCESS                                       │
│  Response: {                                                      │
│    success: true,                                                 │
│    branchId: "uuid",                                              │
│    shopId: "uuid",                                                │
│    branchName: "Main Branch",                                     │
│    apiToken: "jwt-token-for-future-requests"                      │
│  }                                                                │
│                                                                   │
│  Store in deviceInfo:                                            │
│   ├─ branchId, shopId                                             │
│   ├─ activatedAt = now()                                          │
│   ├─ isActivated = 1                                              │
│   └─ apiToken for authenticated requests                          │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 5: INITIAL SYNC (Full Data Download)                        │
│  POST /api/sync/initial                                           │
│  { deviceId, branchId, activationCode }                           │
│                                                                   │
│  Server returns ALL branch data:                                │
│  {                                                                │
│    products: [...],                                               │
│    categories: [...],                                               │
│    brands: [...],                                                   │
│    units: [...],                                                    │
│    contacts: [...],                                                 │
│    employees: [...],                                                │
│    paymentMethods: [...],                                           │
│    // ... all reference and transaction data                      │
│    serverTimestamp: "2024-01-15T10:00:00.000Z"                   │
│  }                                                                │
│                                                                   │
│  Device inserts all data into SQLite:                             │
│   ├─ Each table populated with full branch dataset              │
│   ├─ syncMetadata.lastSyncAt = serverTimestamp                  │
│   └─ App is now fully operational offline                       │
└─────────────────────────────────────────────────────────────────┘
```

### Device ID Generation Strategies

| Strategy | Implementation | Pros | Cons |
|----------|----------------|------|------|
| **UUID v4 (Recommended)** | `uuidv4()` random | Simple, no hardware dependency, works in VMs | Not tied to physical hardware |
| **Hardware-based** | `node-machine-id` + hash | Tied to physical device, harder to spoof | Can change if hardware changes |
| **Hybrid** | Hardware ID + UUID suffix | Best of both worlds | More complex |

**Recommended:** UUID v4 - simple and reliable for POS terminals.

### Activation Code Flow (Server Side)

```
Admin creates activation code:
├─ Code: "POS-2024-ABC123" (unique, single-use)
├─ Branch: "Main Branch" (pre-assigned)
├─ Expires: 7 days from creation
└─ Status: "unused"

Device activates with code:
├─ Code marked "used" on server
├─ Device registered to branch
└─ Device can now sync
```

### Device Info Table (SQLite)

```sql
CREATE TABLE device_info (
    deviceId TEXT PRIMARY KEY,        -- UUID v4 (generated locally)
    branchId TEXT,                    -- From activation response
    shopId TEXT,                      -- From activation response
    deviceName TEXT,                  -- User-friendly name
    activatedAt DATETIME,             -- When activation succeeded
    lastSyncAt DATETIME,             -- Last successful sync
    isActivated INTEGER DEFAULT 0,    -- 0 = pending, 1 = active
    apiToken TEXT,                    -- JWT for authenticated API calls
    serverUrl TEXT                    -- API endpoint (for multi-tenant)
);
```

### API Endpoints (Activation)

```
POST /api/device/activate
  Description: Register new device with activation code
  Request: {
    deviceId: "uuid",
    activationCode: "POS-2024-ABC123",
    deviceName: "Counter POS 1",
    deviceInfo: { platform, version, hardwareId }
  }
  Response: {
    success: true,
    branchId: "uuid",
    shopId: "uuid",
    branchName: "Main Branch",
    apiToken: "jwt.token.here"
  }
  Error: { success: false, error: "INVALID_CODE" | "CODE_EXPIRED" | "CODE_USED" }

POST /api/device/verify
  Description: Check if device is already activated (on app restart)
  Request: { deviceId }
  Response: {
    activated: true,
    branchId: "uuid",
    shopId: "uuid",
    apiToken: "jwt.token.here"
  }

POST /api/sync/initial
  Description: Download full branch data after activation
  Headers: Authorization: Bearer {apiToken}
  Request: { deviceId, branchId }
  Response: {
    fullData: { products, categories, contacts, ... },
    serverTimestamp: "2024-01-15T10:00:00.000Z"
  }
```

### Activation States

| State | Condition | UI Behavior |
|-------|-----------|-------------|
| **Unactivated** | `isActivated = 0`, no deviceId | Show activation screen, prompt for code |
| **Activating** | Request in progress | Show loading spinner, "Activating..." |
| **Activated** | `isActivated = 1`, has branchId | Show main app, start sync |
| **Activation Failed** | Error response | Show error, allow retry |

### Security Considerations

1. **Activation codes are single-use** - prevents code sharing
2. **Codes expire** - limits window of opportunity
3. **JWT tokens** - secure subsequent API calls
4. **Branch-scoped data** - devices only see their branch data
5. **Device fingerprinting** - optional: track device characteristics

---

## 3.11 Web Version (Server) Requirements

This section covers changes needed in the **web/api-inventory** project to support desktop device activation and sync.

### New MongoDB Models

#### Device Model (`backend/models/device-model.js`)

```javascript
const deviceSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },  // UUID
  branchId: { type: String, required: true, ref: 'Branch' },
  shopId: { type: String, required: true, ref: 'Shop' },
  deviceName: { type: String },
  
  // Activation
  activatedAt: { type: Date },
  isActive: { type: Boolean, default: true },
  
  // Last seen
  lastSyncAt: { type: Date },
  lastSyncIp: { type: String },
  
  // Device info
  deviceInfo: {
    platform: String,
    version: String,
    hardwareId: String
  },
  
  // API access
  apiToken: { type: String },  // JWT for this device
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});
```

#### Activation Code Model (`backend/models/activation-code-model.js`)

```javascript
const activationCodeSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },  // e.g., "POS-2024-ABC123"
  branchId: { type: String, required: true, ref: 'Branch' },
  shopId: { type: String, required: true, ref: 'Shop' },
  
  // Status
  status: { 
    type: String, 
    enum: ['unused', 'used', 'expired'], 
    default: 'unused' 
  },
  
  // Usage tracking
  usedByDeviceId: { type: String },  // Device that used this code
  usedAt: { type: Date },
  
  // Expiration
  expiresAt: { type: Date, required: true },  // e.g., createdAt + 7 days
  
  // Audit
  createdBy: { type: String, ref: 'User' },  // Admin who generated code
  createdAt: { type: Date, default: Date.now }
});
```

### Server-Side API Endpoints

#### Device Activation Endpoints

```
POST /api/device/activate
  Description: Register new desktop device with activation code
  Request: {
    deviceId: "uuid",
    activationCode: "POS-2024-ABC123",
    deviceName: "Counter POS 1",
    deviceInfo: { platform, version, hardwareId }
  }
  
  Server Logic:
  1. Validate activationCode exists and status='unused'
  2. Check code not expired (expiresAt > now)
  3. Get branchId, shopId from code
  4. Create new Device document with provided deviceId
  5. Generate JWT token for device
  6. Mark code as 'used', store deviceId and usedAt
  7. Return branch info and JWT
  
  Response: {
    success: true,
    branchId: "uuid",
    shopId: "uuid",
    branchName: "Main Branch",
    apiToken: "jwt.token.here"
  }
  
  Errors:
  - 400: INVALID_CODE
  - 400: CODE_EXPIRED
  - 400: CODE_ALREADY_USED
  - 400: DEVICE_ALREADY_ACTIVATED (if deviceId exists)

POST /api/device/verify
  Description: Verify device is activated (called on app restart)
  Headers: Authorization: Bearer {apiToken}
  Request: { deviceId }
  Response: {
    activated: true,
    branchId: "uuid",
    shopId: "uuid",
    apiToken: "jwt.token.here"  // New token if old one expired
  }

POST /api/sync/exchange
  Description: Desktop sync (push & get)
  Headers: Authorization: Bearer {deviceApiToken}
  Request: {
    deviceId: "uuid",
    branchId: "uuid",
    since: "2024-01-15T09:59:59.000Z",
    changes: [...]
  }
  
  Server Logic:
  1. Verify JWT token and device matches branch
  2. Apply incoming changes (timestamp-based conflict resolution)
  3. Query all records in branch where:
     - updatedAt >= since
     - AND updatedByDeviceId != deviceId (other devices only)
  4. Return changes grouped by table
  
  Response: {
    applied: [...],
    rejected: [...],
    serverChanges: {
      products: [...],
      productsales: [...],
      purchases: [...]
    },
    serverTimestamp: "2024-01-15T10:05:00.000Z"
  }

POST /api/sync/initial
  Description: First sync - download all branch data
  Headers: Authorization: Bearer {deviceApiToken}
  Request: { deviceId, branchId }
  
  Server Logic:
  1. Verify JWT and device ownership
  2. Query ALL records for branch:
     - products (with inventory for this branch)
     - categories, brands, units
     - contacts (customers/suppliers)
     - employees
     - paymentMethods
     - recent sales/purchases (configurable: last 30/60/90 days)
  3. Return full dataset
  
  Response: {
    fullData: {
      products: [...],
      categories: [...],
      contacts: [...],
      // ... all tables
    },
    serverTimestamp: "2024-01-15T10:00:00.000Z",
    stats: {
      productCount: 1500,
      contactCount: 200,
      // ... counts for client validation
    }
  }
```

### Admin UI Changes (Vue Frontend)

#### New Menu Items

```
Settings → Device Management
  ├─ Devices (list all activated devices)
  └─ Activation Codes (generate/manage codes)
```

#### Activation Code Management Page

**Features:**
1. **Generate New Codes**
   - Input: Quantity (1-50), Branch/Shop selector, Expiry days
   - Output: List of generated codes (download as CSV)

2. **List/Filter Codes**
   - Table columns: Code, Branch, Status, Created, Expires, Used By
   - Filters: Status (unused/used/expired), Branch, Date range

3. **Actions**
   - Revoke unused code (set expired)
   - View device that used a code
   - Bulk export codes

4. **Dashboard Stats**
   - Total devices activated
   - Active vs inactive devices
   - Unused codes count
   - Recently synced devices

#### Device Management Page

**Features:**
1. **List All Devices**
   - Table: Device Name, Branch, Last Sync, IP, Status
   - Sort by last sync (show stale devices)

2. **Device Details**
   - View device info, sync history
   - Deactivate/revoke device access
   - Force "sync required" flag

### Middleware Changes

#### Device Auth Middleware (`backend/middleware/deviceAuth.js`)

```javascript
// Validates JWT from desktop devices
const deviceAuth = async (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'NO_TOKEN' });
  
  try {
    const decoded = jwt.verify(token, process.env.DEVICE_JWT_SECRET);
    const device = await Device.findOne({ id: decoded.deviceId });
    
    if (!device || !device.isActive) {
      return res.status(401).json({ error: 'DEVICE_INACTIVE' });
    }
    
    // Attach device info to request
    req.device = device;
    req.branchId = device.branchId;
    req.shopId = device.shopId;
    
    next();
  } catch (err) {
    return res.status(401).json({ error: 'INVALID_TOKEN' });
  }
};
```

#### Branch Scope Middleware

```javascript
// Ensures device only accesses its branch data
const branchScope = (req, res, next) => {
  // Override any branchId in request with device's branch
  req.body.branchId = req.device.branchId;
  req.query.branchId = req.device.branchId;
  next();
};
```

### Existing Model Updates

Add `updatedByDeviceId` field to all sync-enabled models:

```javascript
// product-model.js
const productSchema = new mongoose.Schema({
  // ... existing fields
  updatedByDeviceId: { type: String },  // Track which device made last change
  updatedAt: { type: Date, default: Date.now }
});

// Same for: sale-model, purchase-model, contact-model, etc.
```

### Server Configuration

Add to `example.env`:

```bash
# Device Sync Configuration
DEVICE_JWT_SECRET=your-secret-key-for-device-tokens
DEVICE_TOKEN_EXPIRY=30d
ACTIVATION_CODE_EXPIRY_DAYS=7
SYNC_BATCH_SIZE=1000
```

### Implementation Tasks for Web Version

| Phase | Task | Priority |
|-------|------|----------|
| 1 | Create Device and ActivationCode models | High |
| 1 | Add `updatedByDeviceId` to all sync-enabled models | High |
| 1 | Create `/api/device/activate` endpoint | High |
| 1 | Create device JWT middleware | High |
| 2 | Create `/api/sync/exchange` endpoint | High |
| 2 | Create `/api/sync/initial` endpoint | High |
| 2 | Add branch-scoping to sync endpoints | High |
| 3 | Build Activation Code management UI | Medium |
| 3 | Build Device list/management UI | Medium |
| 3 | Add device sync stats dashboard | Low |
| 4 | Add rate limiting for sync endpoints | Medium |
| 4 | Add sync logging/audit trail | Low |

---

## 4. Implementation Phases

### Phase 1: Foundation (Week 1)

**Dependencies:**
```bash
npm install better-sqlite3 uuid axios date-fns lodash
npm install -D @types/better-sqlite3 @types/uuid
```

**Tasks:**
- [x] Install `better-sqlite3` and configure for Electron
- [x] Create database connection layer (`src/main/database/connection.ts`)
- [x] Build migration system with version tracking
- [x] Create initial schema with `sync_metadata` and `sync_queue` tables
- [x] Add UUID v4 generation utilities

**Key Files:**
- `src/main/database/connection.ts`
- `src/main/database/migrations/001-initial-schema.sql`
- `src/main/database/migrations/migration-runner.ts`

### Phase 2: Core Data Layer (Week 2)

**Tasks:**
- [x] Create base repository class with CRUD operations
- [x] Implement `sync_metadata` repository
- [x] Implement `sync_queue` repository
- [x] Create `device_info` repository
- [x] Build query builder for filtering/pagination (mirror api-inventory)

**Key Files:**
- `src/main/database/repositories/base-repository.ts`
- `src/main/database/repositories/sync-metadata-repository.ts`
- `src/main/database/repositories/sync-queue-repository.ts`

### Phase 3: Sync Engine (Week 3)

**Tasks:**
- [x] Build API client with axios (auth headers, retry logic)
- [x] Implement sync engine with pull/push methods
- [x] Create sync queue processor with exponential backoff
- [x] Add sync status tracking
- [x] Build conflict detection and resolution

**Key Files:**
- `src/main/sync/api-client.ts`
- `src/main/sync/sync-engine.ts`
- `src/main/sync/sync-queue-processor.ts`
- `src/main/sync/conflict-resolver.ts`

### Phase 4: Domain Models & Repositories (Week 4-5)

**Port from api-inventory backend:**

| Domain | Models | Controllers → Services |
|--------|--------|------------------------|
| Product | `product-model.js`, `product-inventory-model.js` | Product service |
| Purchase | `purchase-model.js`, `purchased-product-model.js` | Purchase service |
| Sale | `sale-model.js`, `sold-product-model.js` | Sale service |
| Contact | `contact-model.js` | Contact service |
| Employee | `employee-model.js` | Employee service |
| Cashbook | `cashbook-model.js` | Cashbooks service |
| Expense | `expense-model.js` | Expense service |
| Reference | `category-model.js`, `brand-model.js`, `unit-model.js` | Reference services |

**Tasks:**
- [x] Port each model to SQLite schema
- [x] Create repositories for each domain
- [x] Implement business logic services (mirror api-inventory)
- [x] Add inventory recalculation engine

### Phase 5: Activation & Device Management (Week 6)

**Tasks:**
- [x] Device ID generation (hardware-based or random UUID)
- [x] Activation API integration
- [x] Branch data download on activation
- [x] Store activation state in `device_info` table

**Key Files:**
- `src/main/activation/device-service.ts`
- `src/main/activation/activation-service.ts`

### Phase 6: IPC Layer & Frontend Integration (Week 7)

**Tasks:**
- [x] Create IPC handlers for all CRUD operations
- [x] Implement sync status IPC events
- [x] Reuse Vue components from api-inventory frontend
- [x] Replace axios calls with IPC invocations
- [x] Add sync status UI indicator
- [x] Add offline indicator

**Key Files:**
- `src/main/ipc-handlers.ts`
- `src/preload/index.ts`

### Phase 7: Testing & Polish (Week 8)

**Tasks:**
- [x] Test offline functionality
- [x] Test multi-device sync scenarios
- [x] Test conflict resolution
- [x] Performance testing with large datasets
- [x] Error handling and logging
- [x] Auto-updater integration

---

## 5. Dependencies

### Production Dependencies to Add

```json
{
  "dependencies": {
    "better-sqlite3": "^9.4.0",
    "uuid": "^9.0.0",
    "axios": "^1.6.0",
    "date-fns": "^3.0.0",
    "lodash": "^4.17.21",
    "electron-log": "^5.0.0",
    "node-machine-id": "^1.1.12"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.8",
    "@types/uuid": "^9.0.0",
    "@types/lodash": "^4.14.0"
  }
}
```

---

## 6. Key Technical Decisions

| Decision | Rationale |
|----------|-----------|
| **better-sqlite3 over sqlite3** | Synchronous API, better performance, no callback hell, native compilation for Electron |
| **UUID v4 everywhere** | Cross-device sync without ID conflicts, offline record creation works seamlessly |
| **Timestamp-based sync** | Simple, reliable, handles offline → online transitions gracefully |
| **Immediate push on CRUD** | Near-realtime multi-device sync with minimal latency |
| **Sync queue table** | Survives app restarts, persistent retry mechanism |
| **Soft deletes (isDeleted)** | Maintains referential integrity, supports sync of deletions |
| **Optimistic locking (version)** | Prevents lost updates during concurrent sync |
| **Last-write-wins conflicts** | Simple, predictable, with audit trail in conflict_log |

---

## 7. Database Connection Setup

### better-sqlite3 Configuration

```typescript
// src/main/database/connection.ts
import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';

const dbPath = path.join(app.getPath('userData'), 'inventory.db');
const db = new Database(dbPath);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export default db;
```

### Migration Runner

```typescript
// src/main/database/migrations/migration-runner.ts
const runMigrations = () => {
  // Check current version
  // Run pending migrations in order
  // Update version in metadata table
};
```

---

## 8. Sync Engine Architecture

```typescript
// src/main/sync/sync-engine.ts
class SyncEngine {
  async pullChanges(tableName: string): Promise<void> {
    const lastSync = await syncMetadataRepo.getLastSync(tableName);
    const changes = await apiClient.getChanges(tableName, lastSync);
    await this.applyChanges(tableName, changes);
    await syncMetadataRepo.updateLastSync(tableName, new Date());
  }

  async pushChanges(): Promise<void> {
    const pending = await syncQueueRepo.getPending();
    for (const item of pending) {
      try {
        await apiClient.pushChange(item);
        await syncQueueRepo.markProcessed(item.id);
      } catch (error) {
        await syncQueueRepo.incrementRetry(item.id, error.message);
      }
    }
  }

  startAutoSync(): void {
    // Run push immediately on CRUD
    // Run pull every 30 seconds
  }
}
```

---

## 9. IPC API Surface

```typescript
// Exposed to renderer via contextBridge
interface DesktopAPI {
  // CRUD operations
  products: {
    getAll: (filters: any) => Promise<Product[]>;
    getById: (id: string) => Promise<Product>;
    create: (data: any) => Promise<Product>;
    update: (id: string, data: any) => Promise<Product>;
    delete: (id: string) => Promise<void>;
  };
  
  // Sync
  sync: {
    getStatus: () => Promise<SyncStatus>;
    forceSync: () => Promise<void>;
    onStatusChange: (callback: (status: SyncStatus) => void) => void;
  };
  
  // Activation
  activation: {
    getDeviceInfo: () => Promise<DeviceInfo>;
    activate: (code: string) => Promise<void>;
    isActivated: () => Promise<boolean>;
  };
}
```

---

## 10. Testing Strategy

| Test Type | Focus |
|-----------|-------|
| **Unit** | Repository methods, service logic |
| **Integration** | Sync engine with mocked API |
| **E2E** | Offline → Online transitions, multi-device sync |
| **Performance** | Large dataset sync (>10k products) |

---

## 11. Data Consistency: Server & Desktop

### Primary Key Strategy

**Both Server and Desktop use UUID v4 as primary key (`id`)**

| System | Primary Key | Notes |
|--------|-------------|-------|
| **Server (MongoDB)** | `id` (UUID v4) | Migration from `_id` (ObjectId) → `id` (UUID) runs on server |
| **Desktop (SQLite)** | `id` (TEXT UUID) | Uses UUID natively from start - **no migration needed** |

### Server Migration (One-Time)

The migration from MongoDB's `_id` (ObjectId) to UUID v4 happens **only on the server**:

```javascript
// Server-side migration script
// Run once to add 'id' field to all MongoDB documents
// All new documents created with UUID 'id' from the start
```

**Desktop Implications:**
- Desktop SQLite schema uses `id TEXT PRIMARY KEY` (UUID) from the start
- No migration scripts needed in desktop app
- All records created offline use `uuidv4()` for `id`
- Sync works seamlessly because both systems use UUID

### Data Type Mapping

| Server (MongoDB) | Desktop (SQLite) | Notes |
|------------------|------------------|-------|
| `id` (UUID) | `id` (TEXT) | Same UUID format |
| `refs` (UUID) | `refs` (TEXT) | Foreign keys use UUID |
| `Date` | `DATETIME` | ISO 8601 format |
| `Number` | `REAL` or `INTEGER` | Depends on use |
| `Boolean` | `INTEGER` (0/1) | |
| `Array` | Separate table | Normalized |
| `Object` | JSON string or columns | Depends on structure |

### Relationship Mapping

MongoDB separate collections → SQLite tables with foreign keys:
- `Purchase` → `purchases` table, line items in `purchasedproducts` table (PurchasedProduct)
- `ProductSale` → `productsales` table, line items in `soldproducts` table (SoldProduct)
- `ProductInventory` → `productinventories` table (per productId + branchId)
- `StockTransfer` → `stocktransfers` table, line items in `producttransfers` table (ProductTransfer)
- `SupplierPayment` → `supplierpayments` table
- `ProductDamaged` → `productdamageds` table

---

## Next Steps

1. [x] **Review this plan** and adjust priorities as needed
2. [x] **Start Phase 1**: Add better-sqlite3 dependency and database connection
3. [x] **Begin schema design** by examining api-inventory models
4. [x] **Set up activation flow** early (required for initial sync)
5. [ ] **Implement remaining business services**: Employee, Expense, Reference services etc.
6. [ ] **Build inventory recalculation engine**: Port from api-inventory.
7. [ ] **Frontend Integration**: Reuse Vue components and connect to IPC handlers.

---

## Appendix: API Inventory Module Mapping

From `/Volumes/MinhajExtSSD/dev/nodejs/vue/erp-soft/api-inventory/backend/modules/`:

| Module | Priority | Notes |
|--------|----------|-------|
| `product/` | **Critical** | Core inventory tracking |
| `purchase/` | **Critical** | Stock inflow |
| `product-sale/` | **Critical** | Stock outflow, POS |
| `contact/` | **Critical** | Customers/suppliers |
| `supplier/` | **Critical** | Supplier management (distinct from contacts) |
| `inventory-service.js` | **Critical** | Recalculation engine |
| `cashbook/` | High | Financial tracking (cashbooks) |
| `expense/` | High | Expense management |
| `employee/` | Medium | HR functions |
| `category/` | High | Product organization |
| `brand/` | Medium | Product organization |
| `unit/` | Medium | Measurement units |
| `shop/` | **Critical** | Shop configuration |
| `branch/` | **Critical** | Branch management |
| `user/` | **Critical** | Authentication & user management |
| `role/` | **Critical** | User roles & permissions |
| `payment-method/` | High | Payment methods |
| `stock-transfer/` | Medium | Inter-branch transfers |
| `product-damaged/` | Medium | Damaged product tracking |
| `subscription/` | **Critical** | License/subscription management |
| `complaint/` | Low | Customer complaints |
| `file/` | Medium | File uploads (product images) |
| `message/` | Low | Notifications/messaging |
| `service-type/` | Low | Service categories |
| `worker/` | Low | Worker management |
| `analytics/` | Low | Reporting (can sync later) |
