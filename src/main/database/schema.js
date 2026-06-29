const { withTransaction } = require('./connection');
const { runDatabaseMigrations } = require('./migrations');

async function initializeDatabase() {
  await withTransaction(async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS roles (
        id SERIAL PRIMARY KEY,
        name VARCHAR(40) UNIQUE NOT NULL,
        description TEXT,
        is_system BOOLEAN NOT NULL DEFAULT FALSE,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(
      'ALTER TABLE roles ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT FALSE;'
    );
    await client.query(
      'ALTER TABLE roles ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;'
    );
    await client.query(
      'ALTER TABLE roles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();'
    );

    await client.query(`
      INSERT INTO roles (name, description)
      VALUES
        ('Admin', 'Full system access'),
        ('Manager', 'Inventory, purchases, reports, and limited user access'),
        ('Cashier', 'POS billing, returns, and receipt printing'),
        ('Saleman', 'Product search and sales support access'),
        ('Warehouse', 'Stock entries, purchase receiving, and inventory adjustments'),
        ('Accountant', 'Financial reports, expenses, suppliers, and ledgers')
      ON CONFLICT (name) DO NOTHING;
    `);
    await client.query(
      "UPDATE roles SET is_system = TRUE WHERE name IN ('Admin','Manager','Cashier','Saleman','Warehouse','Accountant');"
    );

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(80) UNIQUE,
        email VARCHAR(180) UNIQUE NOT NULL,
        full_name VARCHAR(140) NOT NULL,
        phone VARCHAR(60),
        password_hash TEXT NOT NULL,
        role_id INTEGER NOT NULL REFERENCES roles(id),
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        failed_login_attempts INTEGER NOT NULL DEFAULT 0,
        locked_until TIMESTAMPTZ,
        password_changed_at TIMESTAMPTZ,
        last_login_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(80);');
    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(60);');
    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;');
    await client.query(
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;'
    );
    await client.query(
      "UPDATE users SET username = LOWER(SPLIT_PART(email, '@', 1)) WHERE username IS NULL;"
    );
    await client.query('ALTER TABLE users ALTER COLUMN username SET NOT NULL;');

    await client.query(`
      CREATE TABLE IF NOT EXISTS permissions (
        id SERIAL PRIMARY KEY,
        permission_key VARCHAR(120) UNIQUE NOT NULL,
        category VARCHAR(60) NOT NULL,
        label VARCHAR(160) NOT NULL,
        description TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS role_permissions (
        role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
        permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (role_id, permission_id)
      );
    `);

    await client.query(`
      INSERT INTO permissions (permission_key, category, label)
      SELECT permission_key, category, label
      FROM (VALUES
        ('dashboard.view','DASHBOARD','View dashboard'),
        ('pos.view','POS','View POS'),
        ('pos.sale.create','POS','Create sale'),
        ('pos.sale.discount','POS','Apply sale discount'),
        ('pos.sale.hold','POS','Hold sale'),
        ('pos.sale.deleteHeld','POS','Delete held sale'),
        ('pos.refund.create','POS','Create refund'),
        ('products.view','PRODUCTS','View products'),
        ('products.create','PRODUCTS','Create products'),
        ('products.update','PRODUCTS','Update products'),
        ('products.delete','PRODUCTS','Delete products'),
        ('inventory.view','INVENTORY','View inventory'),
        ('inventory.adjust','INVENTORY','Adjust inventory'),
        ('inventory.transfer','INVENTORY','Transfer inventory'),
        ('purchases.view','PURCHASES','View purchases'),
        ('purchases.create','PURCHASES','Create purchases'),
        ('purchases.update','PURCHASES','Update purchases'),
        ('purchases.delete','PURCHASES','Delete purchases'),
        ('requisition.view','REQUISITIONS','View purchase requisitions'),
        ('requisition.create','REQUISITIONS','Create purchase requisitions'),
        ('requisition.approve','REQUISITIONS','Approve purchase requisitions'),
        ('purchaseOrders.view','PURCHASE_ORDERS','View purchase orders'),
        ('purchaseOrders.create','PURCHASE_ORDERS','Create purchase orders'),
        ('purchaseOrders.update','PURCHASE_ORDERS','Update purchase orders'),
        ('purchaseOrders.approve','PURCHASE_ORDERS','Approve purchase orders'),
        ('purchaseOrders.receive','PURCHASE_ORDERS','Receive purchase orders'),
        ('purchaseOrders.cancel','PURCHASE_ORDERS','Cancel purchase orders'),
        ('purchaseOrder.view','PURCHASE_ORDERS','View procurement purchase orders'),
        ('purchaseOrder.create','PURCHASE_ORDERS','Create procurement purchase orders'),
        ('purchaseOrder.approve','PURCHASE_ORDERS','Approve procurement purchase orders'),
        ('purchaseOrder.sendToSupplier','PURCHASE_ORDERS','Send purchase orders to supplier'),
        ('purchaseOrder.confirmSupplier','PURCHASE_ORDERS','Confirm supplier purchase order'),
        ('purchaseOrder.receiveGoods','PURCHASE_ORDERS','Receive purchase order goods'),
        ('purchaseInvoice.create','PURCHASE_INVOICES','Create purchase invoice'),
        ('supplierPayment.create','SUPPLIERS','Create supplier payment'),
        ('customers.view','CUSTOMERS','View customers'),
        ('customers.create','CUSTOMERS','Create customers'),
        ('customers.update','CUSTOMERS','Update customers'),
        ('customers.ledger.view','CUSTOMERS','View customer ledger'),
        ('customers.payment.create','CUSTOMERS','Create customer payment'),
        ('suppliers.view','SUPPLIERS','View suppliers'),
        ('suppliers.create','SUPPLIERS','Create suppliers'),
        ('suppliers.update','SUPPLIERS','Update suppliers'),
        ('suppliers.ledger.view','SUPPLIERS','View supplier ledger'),
        ('suppliers.payment.create','SUPPLIERS','Create supplier payment'),
        ('expenses.view','EXPENSES','View expenses'),
        ('expenses.create','EXPENSES','Create expenses'),
        ('expenses.update','EXPENSES','Update expenses'),
        ('expenses.delete','EXPENSES','Delete expenses'),
        ('reports.view','REPORTS','View reports'),
        ('reports.sales','REPORTS','Sales reports'),
        ('reports.profit','REPORTS','Profit reports'),
        ('reports.inventory','REPORTS','Inventory reports'),
        ('reports.cashflow','REPORTS','Cash flow reports'),
        ('lucky_draw.view','LUCKY_DRAW','View Lucky Draw'),
        ('lucky_draw.create','LUCKY_DRAW','Create Lucky Draw campaigns'),
        ('lucky_draw.update','LUCKY_DRAW','Update Lucky Draw campaigns'),
        ('lucky_draw.delete','LUCKY_DRAW','Delete Lucky Draw campaigns'),
        ('lucky_draw.verify','LUCKY_DRAW','Verify Lucky Draw coupons'),
        ('lucky_draw.draw','LUCKY_DRAW','Run Lucky Draw winner selection'),
        ('lucky_draw.print','LUCKY_DRAW','Print Lucky Draw coupons'),
        ('lucky_draw.reports','LUCKY_DRAW','Lucky Draw reports'),
        ('settings.view','SETTINGS','View settings'),
        ('settings.update','SETTINGS','Update settings'),
        ('backup.create','BACKUP','Create backup'),
        ('backup.restore','BACKUP','Restore backup'),
        ('users.view','USERS','View users'),
        ('users.create','USERS','Create users'),
        ('users.update','USERS','Update users'),
        ('users.deactivate','USERS','Deactivate users'),
        ('roles.view','ROLES','View roles'),
        ('roles.create','ROLES','Create roles'),
        ('roles.update','ROLES','Update roles'),
        ('roles.assignPermissions','ROLES','Assign permissions'),
        ('sync.view','SYNC','View sync'),
        ('sync.retry','SYNC','Retry sync')
      ) AS seed(permission_key, category, label)
      ON CONFLICT (permission_key) DO UPDATE SET category = EXCLUDED.category, label = EXCLUDED.label;
    `);

    await client.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT roles.id, permissions.id
      FROM roles
      CROSS JOIN permissions
      WHERE roles.name = 'Admin'
      ON CONFLICT DO NOTHING;
    `);
    await client.query(
      `
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT roles.id, permissions.id
      FROM roles
      JOIN permissions ON permissions.permission_key = ANY($1)
      WHERE roles.name = 'Manager'
      ON CONFLICT DO NOTHING;
    `,
      [
        [
          'dashboard.view',
          'pos.view',
          'pos.sale.create',
          'pos.sale.discount',
          'pos.sale.hold',
          'pos.sale.deleteHeld',
          'pos.refund.create',
          'products.view',
          'products.create',
          'products.update',
          'products.delete',
          'inventory.view',
          'inventory.adjust',
          'purchases.view',
          'purchases.create',
          'purchases.update',
          'requisition.view',
          'requisition.create',
          'requisition.approve',
          'purchaseOrders.view',
          'purchaseOrders.create',
          'purchaseOrders.update',
          'purchaseOrders.approve',
          'purchaseOrders.receive',
          'purchaseOrders.cancel',
          'purchaseOrder.view',
          'purchaseOrder.create',
          'purchaseOrder.approve',
          'purchaseOrder.sendToSupplier',
          'purchaseOrder.confirmSupplier',
          'purchaseOrder.receiveGoods',
          'purchaseInvoice.create',
          'supplierPayment.create',
          'customers.view',
          'customers.create',
          'customers.update',
          'customers.ledger.view',
          'customers.payment.create',
          'suppliers.view',
          'suppliers.create',
          'suppliers.update',
          'suppliers.ledger.view',
          'suppliers.payment.create',
          'expenses.view',
          'expenses.create',
          'expenses.update',
          'expenses.delete',
          'reports.view',
          'reports.sales',
          'reports.profit',
          'reports.inventory',
          'reports.cashflow',
          'lucky_draw.view',
          'lucky_draw.create',
          'lucky_draw.update',
          'lucky_draw.delete',
          'lucky_draw.verify',
          'lucky_draw.draw',
          'lucky_draw.print',
          'lucky_draw.reports',
          'settings.view',
          'settings.update',
          'backup.create',
          'sync.view',
          'sync.retry',
        ],
      ]
    );
    await client.query(
      `
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT roles.id, permissions.id
      FROM roles
      JOIN permissions ON permissions.permission_key = ANY($1)
      WHERE roles.name = 'Cashier'
      ON CONFLICT DO NOTHING;
    `,
      [
        [
          'dashboard.view',
          'pos.view',
          'pos.sale.create',
          'pos.sale.discount',
          'pos.sale.hold',
          'pos.refund.create',
          'products.view',
          'customers.view',
          'customers.create',
          'lucky_draw.view',
          'lucky_draw.verify',
          'lucky_draw.print',
          'returns.view',
          'sync.view',
        ].filter(Boolean),
      ]
    );
    await client.query(
      `
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT roles.id, permissions.id
      FROM roles
      JOIN permissions ON permissions.permission_key = ANY($1)
      WHERE roles.name = 'Warehouse'
      ON CONFLICT DO NOTHING;
    `,
      [
        [
          'dashboard.view',
          'products.view',
          'inventory.view',
          'inventory.adjust',
          'purchases.view',
          'purchases.create',
          'requisition.view',
          'purchaseOrders.view',
          'purchaseOrders.receive',
          'purchaseOrder.view',
          'purchaseOrder.receiveGoods',
          'suppliers.view',
          'sync.view',
        ],
      ]
    );
    await client.query(
      `
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT roles.id, permissions.id
      FROM roles
      JOIN permissions ON permissions.permission_key = ANY($1)
      WHERE roles.name = 'Accountant'
      ON CONFLICT DO NOTHING;
    `,
      [
        [
          'dashboard.view',
          'suppliers.view',
          'suppliers.ledger.view',
          'suppliers.payment.create',
          'expenses.view',
          'expenses.create',
          'expenses.update',
          'reports.view',
          'reports.sales',
          'reports.profit',
          'reports.cashflow',
          'settings.view',
          'backup.create',
        ],
      ]
    );

    await client.query(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id UUID PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_used_at TIMESTAMPTZ
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id BIGSERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        action VARCHAR(80) NOT NULL,
        status VARCHAR(30) NOT NULL,
        message TEXT,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query('CREATE INDEX IF NOT EXISTS idx_users_email ON users (LOWER(email));');
    await client.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_unique ON users (LOWER(username));'
    );
    await client.query('CREATE INDEX IF NOT EXISTS idx_users_role_id ON users (role_id);');
    await client.query('CREATE INDEX IF NOT EXISTS idx_users_status ON users (is_active);');
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON role_permissions (role_id);'
    );
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens (user_id);'
    );
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs (created_at DESC);'
    );

    await client.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(140) NOT NULL,
        description TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS brands (
        id SERIAL PRIMARY KEY,
        name VARCHAR(140) NOT NULL,
        description TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS units (
        id SERIAL PRIMARY KEY,
        name VARCHAR(80) NOT NULL,
        short_name VARCHAR(30) NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(220) NOT NULL,
        sku VARCHAR(80) NOT NULL,
        barcode VARCHAR(120) NOT NULL,
        category_id INTEGER REFERENCES categories(id),
        brand_id INTEGER REFERENCES brands(id),
        unit_id INTEGER REFERENCES units(id),
        purchase_price NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (purchase_price >= 0),
        sale_price NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (sale_price >= 0),
        wholesale_price NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (wholesale_price >= 0),
        min_stock_level NUMERIC(14, 3) NOT NULL DEFAULT 0 CHECK (min_stock_level >= 0),
        current_stock NUMERIC(14, 3) NOT NULL DEFAULT 0 CHECK (current_stock >= 0),
        allow_sale_price_override BOOLEAN NOT NULL DEFAULT FALSE,
        auto_update_sale_price_from_purchase BOOLEAN NOT NULL DEFAULT FALSE,
        track_expiry BOOLEAN NOT NULL DEFAULT FALSE,
        expiry_required BOOLEAN NOT NULL DEFAULT FALSE,
        expiry_alert_days INTEGER CHECK (expiry_alert_days IS NULL OR expiry_alert_days >= 0),
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        product_image TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS stock_movements (
        id BIGSERIAL PRIMARY KEY,
        product_id INTEGER NOT NULL REFERENCES products(id),
        warehouse_id INTEGER,
        movement_type VARCHAR(40) NOT NULL,
        quantity NUMERIC(14, 3) NOT NULL,
        previous_stock NUMERIC(14, 3) NOT NULL,
        new_stock NUMERIC(14, 3) NOT NULL,
        reference_type VARCHAR(60),
        reference_id INTEGER,
        reason TEXT,
        notes TEXT,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(
      'ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS warehouse_id INTEGER;'
    );
    await client.query('ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS reason TEXT;');
    await client.query(
      'ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;'
    );

    await client.query(`
      CREATE TABLE IF NOT EXISTS warehouses (
        id SERIAL PRIMARY KEY,
        name VARCHAR(140) UNIQUE NOT NULL,
        is_default BOOLEAN NOT NULL DEFAULT FALSE,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ
      );
    `);

    await client.query(`
      INSERT INTO warehouses (name, is_default)
      VALUES ('Main Warehouse', TRUE)
      ON CONFLICT (name) DO NOTHING;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS inventory (
        id BIGSERIAL PRIMARY KEY,
        product_id INTEGER NOT NULL REFERENCES products(id),
        warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
        current_stock NUMERIC(14, 3) NOT NULL DEFAULT 0 CHECK (current_stock >= 0),
        min_stock_level NUMERIC(14, 3) NOT NULL DEFAULT 0 CHECK (min_stock_level >= 0),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(product_id, warehouse_id)
      );
    `);

    await client.query(`
      INSERT INTO inventory (product_id, warehouse_id, current_stock, min_stock_level)
      SELECT products.id, warehouses.id, products.current_stock, products.min_stock_level
      FROM products
      CROSS JOIN warehouses
      WHERE warehouses.is_default = TRUE
      ON CONFLICT (product_id, warehouse_id)
      DO UPDATE SET
        current_stock = EXCLUDED.current_stock,
        min_stock_level = EXCLUDED.min_stock_level,
        updated_at = NOW();
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS suppliers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(180) NOT NULL,
        phone VARCHAR(60),
        email VARCHAR(180),
        address TEXT,
        current_balance NUMERIC(14, 2) NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ
      );
    `);

    await client.query(
      'ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS current_balance NUMERIC(14, 2) NOT NULL DEFAULT 0;'
    );
    await client.query(
      'ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS opening_balance NUMERIC(14, 2) NOT NULL DEFAULT 0;'
    );

    await client.query(`
      CREATE TABLE IF NOT EXISTS purchases (
        id BIGSERIAL PRIMARY KEY,
        supplier_id INTEGER REFERENCES suppliers(id),
        invoice_number VARCHAR(120) NOT NULL,
        purchase_date DATE NOT NULL,
        subtotal NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
        discount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
        tax NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (tax >= 0),
        grand_total NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (grand_total >= 0),
        paid_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
        due_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (due_amount >= 0),
        status VARCHAR(40) NOT NULL DEFAULT 'RECEIVED',
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS purchase_items (
        id BIGSERIAL PRIMARY KEY,
        purchase_id BIGINT NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL REFERENCES products(id),
        batch_number VARCHAR(120),
        expiration_date DATE,
        quantity NUMERIC(14, 3) NOT NULL CHECK (quantity > 0),
        purchase_price NUMERIC(14, 2) NOT NULL CHECK (purchase_price >= 0),
        sale_price NUMERIC(14, 2) NOT NULL CHECK (sale_price >= 0),
        total NUMERIC(14, 2) NOT NULL CHECK (total >= 0)
      );
    `);
    await client.query(
      'ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS batch_number VARCHAR(120);'
    );
    await client.query('ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS expiration_date DATE;');

    await client.query(`
      CREATE TABLE IF NOT EXISTS purchase_requisitions (
        id BIGSERIAL PRIMARY KEY,
        requisition_number VARCHAR(120) NOT NULL,
        requested_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        requested_date DATE NOT NULL DEFAULT CURRENT_DATE,
        department VARCHAR(140),
        location VARCHAR(140),
        reason TEXT,
        priority VARCHAR(40) NOT NULL DEFAULT 'Normal',
        status VARCHAR(40) NOT NULL DEFAULT 'DRAFT',
        approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        approved_at TIMESTAMPTZ,
        approval_notes TEXT,
        rejection_reason TEXT,
        converted_purchase_order_id BIGINT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS purchase_requisition_items (
        id BIGSERIAL PRIMARY KEY,
        requisition_id BIGINT NOT NULL REFERENCES purchase_requisitions(id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL REFERENCES products(id),
        required_qty NUMERIC(14, 3) NOT NULL CHECK (required_qty > 0),
        reason TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS purchase_orders (
        id BIGSERIAL PRIMARY KEY,
        po_number VARCHAR(120) NOT NULL,
        supplier_id INTEGER REFERENCES suppliers(id),
        status VARCHAR(40) NOT NULL DEFAULT 'DRAFT',
        expected_date DATE,
        subtotal NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
        discount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
        tax NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (tax >= 0),
        total NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (total >= 0),
        notes TEXT,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        approved_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ
      );
    `);

    await client.query(
      'ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS requisition_id BIGINT REFERENCES purchase_requisitions(id) ON DELETE SET NULL;'
    );
    await client.query('ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS approval_notes TEXT;');
    await client.query(
      'ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS rejection_reason TEXT;'
    );
    await client.query(
      'ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS supplier_sent_at TIMESTAMPTZ;'
    );
    await client.query(
      'ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS supplier_confirmed_at TIMESTAMPTZ;'
    );
    await client.query(
      'ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS supplier_reference_number VARCHAR(120);'
    );
    await client.query(
      'ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS supplier_confirmation_notes TEXT;'
    );
    await client.query(
      'ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS supplier_expected_delivery_date DATE;'
    );
    await client.query(
      'ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;'
    );

    await client.query(`
      CREATE TABLE IF NOT EXISTS purchase_order_items (
        id BIGSERIAL PRIMARY KEY,
        purchase_order_id BIGINT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL REFERENCES products(id),
        ordered_qty NUMERIC(14, 3) NOT NULL CHECK (ordered_qty > 0),
        received_qty NUMERIC(14, 3) NOT NULL DEFAULT 0 CHECK (received_qty >= 0),
        cost NUMERIC(14, 2) NOT NULL CHECK (cost >= 0),
        sale_price NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (sale_price >= 0),
        total NUMERIC(14, 2) NOT NULL CHECK (total >= 0)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS goods_receipts (
        id BIGSERIAL PRIMARY KEY,
        receipt_number VARCHAR(120) NOT NULL,
        purchase_order_id BIGINT NOT NULL REFERENCES purchase_orders(id),
        purchase_id BIGINT REFERENCES purchases(id),
        supplier_id INTEGER REFERENCES suppliers(id),
        received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        subtotal NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
        discount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
        tax NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (tax >= 0),
        total NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (total >= 0),
        paid_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
        due_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (due_amount >= 0),
        notes TEXT,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(
      'ALTER TABLE purchases ADD COLUMN IF NOT EXISTS purchase_order_id BIGINT REFERENCES purchase_orders(id) ON DELETE SET NULL;'
    );
    await client.query(
      'ALTER TABLE purchases ADD COLUMN IF NOT EXISTS goods_receipt_id BIGINT REFERENCES goods_receipts(id) ON DELETE SET NULL;'
    );
    await client.query(
      'ALTER TABLE purchases ADD COLUMN IF NOT EXISTS supplier_invoice_number VARCHAR(120);'
    );
    await client.query('ALTER TABLE purchases ADD COLUMN IF NOT EXISTS invoice_date DATE;');

    await client.query(`
      CREATE TABLE IF NOT EXISTS goods_receipt_items (
        id BIGSERIAL PRIMARY KEY,
        goods_receipt_id BIGINT NOT NULL REFERENCES goods_receipts(id) ON DELETE CASCADE,
        purchase_order_item_id BIGINT NOT NULL REFERENCES purchase_order_items(id),
        product_id INTEGER NOT NULL REFERENCES products(id),
        received_qty NUMERIC(14, 3) NOT NULL CHECK (received_qty > 0),
        cost NUMERIC(14, 2) NOT NULL CHECK (cost >= 0),
        sale_price NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (sale_price >= 0),
        total NUMERIC(14, 2) NOT NULL CHECK (total >= 0)
      );
    `);

    await client.query(
      'ALTER TABLE goods_receipt_items ADD COLUMN IF NOT EXISTS damaged_qty NUMERIC(14, 3) NOT NULL DEFAULT 0;'
    );
    await client.query(
      'ALTER TABLE goods_receipt_items ADD COLUMN IF NOT EXISTS rejected_qty NUMERIC(14, 3) NOT NULL DEFAULT 0;'
    );

    await client.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(180) NOT NULL,
        phone VARCHAR(60),
        email VARCHAR(180),
        address TEXT,
        cnic VARCHAR(40),
        opening_balance NUMERIC(14, 2) NOT NULL DEFAULT 0,
        credit_limit NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (credit_limit >= 0),
        current_balance NUMERIC(14, 2) NOT NULL DEFAULT 0,
        is_walk_in BOOLEAN NOT NULL DEFAULT FALSE,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ
      );
    `);

    await client.query('ALTER TABLE customers ADD COLUMN IF NOT EXISTS cnic VARCHAR(40);');
    await client.query(
      'ALTER TABLE customers ADD COLUMN IF NOT EXISTS opening_balance NUMERIC(14, 2) NOT NULL DEFAULT 0;'
    );

    await client.query(`
      INSERT INTO customers (name, is_walk_in)
      SELECT 'Walk-in Customer', TRUE
      WHERE NOT EXISTS (
        SELECT 1 FROM customers WHERE is_walk_in = TRUE AND deleted_at IS NULL
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS sales (
        id BIGSERIAL PRIMARY KEY,
        invoice_number VARCHAR(120) NOT NULL,
        customer_id INTEGER REFERENCES customers(id),
        terminal_id INTEGER,
        cashier_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        subtotal NUMERIC(14, 2) NOT NULL CHECK (subtotal >= 0),
        discount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
        tax NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (tax >= 0),
        grand_total NUMERIC(14, 2) NOT NULL CHECK (grand_total >= 0),
        paid_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
        change_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (change_amount >= 0),
        payment_method VARCHAR(40) NOT NULL,
        status VARCHAR(40) NOT NULL DEFAULT 'COMPLETED',
        sync_status VARCHAR(40) NOT NULL DEFAULT 'PENDING',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await client.query('ALTER TABLE sales ADD COLUMN IF NOT EXISTS terminal_id INTEGER;');

    await client.query(`
      CREATE TABLE IF NOT EXISTS sale_items (
        id BIGSERIAL PRIMARY KEY,
        sale_id BIGINT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL REFERENCES products(id),
        quantity NUMERIC(14, 3) NOT NULL CHECK (quantity > 0),
        unit_price NUMERIC(14, 2) NOT NULL CHECK (unit_price >= 0),
        discount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
        total NUMERIC(14, 2) NOT NULL CHECK (total >= 0)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id BIGSERIAL PRIMARY KEY,
        sale_id BIGINT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
        payment_method VARCHAR(40) NOT NULL,
        amount NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS lucky_draw_campaigns (
        id BIGSERIAL PRIMARY KEY,
        campaign_name VARCHAR(180) NOT NULL,
        campaign_code VARCHAR(80) NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        minimum_purchase NUMERIC(14, 2) NOT NULL CHECK (minimum_purchase >= 0),
        prize_details TEXT NOT NULL,
        total_winners INTEGER NOT NULL DEFAULT 1 CHECK (total_winners > 0),
        coupon_generation_type VARCHAR(20) NOT NULL DEFAULT 'AUTO',
        qr_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        barcode_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
        notes TEXT,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS lucky_draw_entries (
        id BIGSERIAL PRIMARY KEY,
        campaign_id BIGINT NOT NULL REFERENCES lucky_draw_campaigns(id),
        customer_id INTEGER REFERENCES customers(id),
        sale_id BIGINT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
        coupon_no VARCHAR(120) NOT NULL,
        qr_value TEXT NOT NULL,
        barcode_value TEXT NOT NULL,
        bill_amount NUMERIC(14, 2) NOT NULL CHECK (bill_amount >= 0),
        verification_status VARCHAR(30) NOT NULL DEFAULT 'UNVERIFIED',
        is_used BOOLEAN NOT NULL DEFAULT FALSE,
        verified_at TIMESTAMPTZ,
        verified_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS lucky_draw_winners (
        id BIGSERIAL PRIMARY KEY,
        campaign_id BIGINT NOT NULL REFERENCES lucky_draw_campaigns(id),
        entry_id BIGINT NOT NULL REFERENCES lucky_draw_entries(id),
        prize_name TEXT,
        selected_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        selected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS coupon_logs (
        id BIGSERIAL PRIMARY KEY,
        coupon_no VARCHAR(120) NOT NULL,
        action VARCHAR(80) NOT NULL,
        performed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS customer_ledger (
        id BIGSERIAL PRIMARY KEY,
        customer_id INTEGER NOT NULL REFERENCES customers(id),
        sale_id BIGINT REFERENCES sales(id),
        return_id BIGINT,
        payment_id BIGINT,
        entry_type VARCHAR(40) NOT NULL,
        debit NUMERIC(14, 2) NOT NULL DEFAULT 0,
        credit NUMERIC(14, 2) NOT NULL DEFAULT 0,
        balance NUMERIC(14, 2) NOT NULL DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query('ALTER TABLE customer_ledger ADD COLUMN IF NOT EXISTS return_id BIGINT;');
    await client.query('ALTER TABLE customer_ledger ADD COLUMN IF NOT EXISTS payment_id BIGINT;');

    await client.query(`
      CREATE TABLE IF NOT EXISTS customer_payments (
        id BIGSERIAL PRIMARY KEY,
        customer_id INTEGER NOT NULL REFERENCES customers(id),
        amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
        payment_method VARCHAR(40) NOT NULL DEFAULT 'Cash',
        notes TEXT,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS returns (
        id BIGSERIAL PRIMARY KEY,
        return_number VARCHAR(120) NOT NULL,
        sale_id BIGINT NOT NULL REFERENCES sales(id),
        customer_id INTEGER REFERENCES customers(id),
        terminal_id INTEGER,
        cashier_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        refund_method VARCHAR(40) NOT NULL,
        reason TEXT,
        subtotal NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
        total_refund NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (total_refund >= 0),
        status VARCHAR(40) NOT NULL DEFAULT 'COMPLETED',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ
      );
    `);
    await client.query('ALTER TABLE returns ADD COLUMN IF NOT EXISTS terminal_id INTEGER;');

    await client.query(`
      CREATE TABLE IF NOT EXISTS return_items (
        id BIGSERIAL PRIMARY KEY,
        return_id BIGINT NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
        sale_item_id BIGINT NOT NULL REFERENCES sale_items(id),
        product_id INTEGER NOT NULL REFERENCES products(id),
        quantity NUMERIC(14, 3) NOT NULL CHECK (quantity > 0),
        unit_price NUMERIC(14, 2) NOT NULL CHECK (unit_price >= 0),
        discount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
        total NUMERIC(14, 2) NOT NULL CHECK (total >= 0)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS refund_payments (
        id BIGSERIAL PRIMARY KEY,
        return_id BIGINT NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
        refund_method VARCHAR(40) NOT NULL,
        amount NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS supplier_ledger (
        id BIGSERIAL PRIMARY KEY,
        supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
        purchase_id BIGINT REFERENCES purchases(id),
        supplier_payment_id BIGINT,
        reference_type VARCHAR(60),
        reference_id BIGINT,
        entry_type VARCHAR(40) NOT NULL,
        debit NUMERIC(14, 2) NOT NULL DEFAULT 0,
        credit NUMERIC(14, 2) NOT NULL DEFAULT 0,
        balance NUMERIC(14, 2) NOT NULL DEFAULT 0,
        notes TEXT,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(
      'ALTER TABLE supplier_ledger ADD COLUMN IF NOT EXISTS supplier_payment_id BIGINT;'
    );
    await client.query(
      'ALTER TABLE supplier_ledger ADD COLUMN IF NOT EXISTS reference_type VARCHAR(60);'
    );
    await client.query('ALTER TABLE supplier_ledger ADD COLUMN IF NOT EXISTS reference_id BIGINT;');
    await client.query(
      'ALTER TABLE supplier_ledger ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL;'
    );

    await client.query(`
      CREATE TABLE IF NOT EXISTS supplier_payments (
        id BIGSERIAL PRIMARY KEY,
        supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
        amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
        payment_method VARCHAR(40) NOT NULL DEFAULT 'Cash',
        notes TEXT,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS expense_categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(120) NOT NULL,
        is_system BOOLEAN NOT NULL DEFAULT FALSE,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ
      );
    `);

    await client.query(`
      INSERT INTO expense_categories (name, is_system)
      SELECT seed.name, TRUE
      FROM (VALUES
        ('Rent'),
        ('Electricity'),
        ('Salary'),
        ('Transport'),
        ('Maintenance'),
        ('Miscellaneous')
      ) AS seed(name)
      WHERE NOT EXISTS (
        SELECT 1 FROM expense_categories
        WHERE LOWER(expense_categories.name) = LOWER(seed.name) AND deleted_at IS NULL
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS expenses (
        id BIGSERIAL PRIMARY KEY,
        category_id INTEGER REFERENCES expense_categories(id),
        title VARCHAR(220) NOT NULL,
        amount NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
        payment_method VARCHAR(40) NOT NULL DEFAULT 'Cash',
        expense_date DATE NOT NULL,
        notes TEXT,
        receipt_path TEXT,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        deleted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS held_sales (
        id BIGSERIAL PRIMARY KEY,
        hold_number VARCHAR(120) NOT NULL,
        customer_id INTEGER REFERENCES customers(id),
        cashier_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        payload JSONB NOT NULL,
        status VARCHAR(40) NOT NULL DEFAULT 'HELD',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS offline_queue (
        id BIGSERIAL PRIMARY KEY,
        operation_uuid VARCHAR(80),
        terminal_id INTEGER,
        entity_type VARCHAR(80) NOT NULL,
        entity_id BIGINT NOT NULL,
        operation VARCHAR(40) NOT NULL,
        payload JSONB NOT NULL,
        status VARCHAR(40) NOT NULL DEFAULT 'PENDING',
        retry_count INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        locked_at TIMESTAMPTZ,
        synced_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(
      'ALTER TABLE offline_queue ADD COLUMN IF NOT EXISTS operation_uuid VARCHAR(80);'
    );
    await client.query('ALTER TABLE offline_queue ADD COLUMN IF NOT EXISTS terminal_id INTEGER;');
    await client.query('ALTER TABLE offline_queue ADD COLUMN IF NOT EXISTS last_error TEXT;');
    await client.query('ALTER TABLE offline_queue ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;');
    await client.query('ALTER TABLE offline_queue ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ;');

    await client.query(`
      CREATE TABLE IF NOT EXISTS terminals (
        id SERIAL PRIMARY KEY,
        terminal_code VARCHAR(80) UNIQUE NOT NULL,
        terminal_name VARCHAR(140) NOT NULL,
        branch_code VARCHAR(80),
        machine_id VARCHAR(180),
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        last_seen_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS sync_logs (
        id BIGSERIAL PRIMARY KEY,
        terminal_id INTEGER REFERENCES terminals(id) ON DELETE SET NULL,
        sync_direction VARCHAR(20) NOT NULL DEFAULT 'OUTBOUND',
        status VARCHAR(30) NOT NULL,
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMPTZ,
        processed_count INTEGER NOT NULL DEFAULT 0,
        failed_count INTEGER NOT NULL DEFAULT 0,
        message TEXT,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS printer_settings (
        id SERIAL PRIMARY KEY,
        printer_name VARCHAR(220),
        paper_width VARCHAR(10) NOT NULL DEFAULT '80mm',
        silent_print BOOLEAN NOT NULL DEFAULT FALSE,
        footer_text TEXT NOT NULL DEFAULT 'Thank you for shopping',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      INSERT INTO printer_settings (paper_width)
      SELECT '80mm'
      WHERE NOT EXISTS (SELECT 1 FROM printer_settings);
    `);

    await client.query(
      'ALTER TABLE printer_settings ADD COLUMN IF NOT EXISTS auto_print BOOLEAN NOT NULL DEFAULT FALSE;'
    );
    await client.query(
      'ALTER TABLE printer_settings ADD COLUMN IF NOT EXISTS receipt_copies INTEGER NOT NULL DEFAULT 1;'
    );

    await client.query(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key VARCHAR(80) PRIMARY KEY,
        value JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS backup_logs (
        id BIGSERIAL PRIMARY KEY,
        file_name VARCHAR(260) NOT NULL,
        file_path TEXT,
        action VARCHAR(20) NOT NULL DEFAULT 'BACKUP',
        status VARCHAR(30) NOT NULL,
        message TEXT,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS device_registrations (
        id BIGSERIAL PRIMARY KEY,
        machine_id VARCHAR(128) UNIQUE NOT NULL,
        machine_name VARCHAR(180),
        platform VARCHAR(60),
        arch VARCHAR(40),
        app_version VARCHAR(40),
        registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS licenses (
        id BIGSERIAL PRIMARY KEY,
        machine_id VARCHAR(128) NOT NULL,
        license_key_hash TEXT,
        license_status VARCHAR(40) NOT NULL DEFAULT 'trial',
        activation_state VARCHAR(40) NOT NULL DEFAULT 'trial',
        activated_at TIMESTAMPTZ,
        expires_at TIMESTAMPTZ,
        trial_ends_at TIMESTAMPTZ,
        last_verified_at TIMESTAMPTZ,
        verification_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        cache_signature TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS update_checks (
        id BIGSERIAL PRIMARY KEY,
        current_version VARCHAR(40) NOT NULL,
        latest_version VARCHAR(40),
        status VARCHAR(40) NOT NULL,
        provider VARCHAR(80) NOT NULL,
        message TEXT,
        checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        checked_by INTEGER REFERENCES users(id) ON DELETE SET NULL
      );
    `);

    await client.query(`
      INSERT INTO app_settings (key, value)
      VALUES
        ('store', '{"storeName":"Enterprise POS","phone":"","email":"","address":"","taxNumber":"","receiptFooterText":"Thank you for shopping","logoPath":""}'::jsonb),
        ('tax', '{"enabled":false,"defaultTaxPercentage":0,"mode":"excluded"}'::jsonb),
        ('system', '{"currencySymbol":"PKR","dateFormat":"DD/MM/YYYY","lowStockAlertThreshold":5,"invoicePrefix":"POS","nextInvoiceNumber":1}'::jsonb)
      ON CONFLICT (key) DO NOTHING;
    `);

    await client.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_name_unique ON categories (LOWER(name)) WHERE deleted_at IS NULL;'
    );
    await client.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_brands_name_unique ON brands (LOWER(name)) WHERE deleted_at IS NULL;'
    );
    await client.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_units_name_unique ON units (LOWER(name)) WHERE deleted_at IS NULL;'
    );
    await client.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_products_sku_unique ON products (LOWER(sku)) WHERE deleted_at IS NULL;'
    );
    await client.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_products_barcode_unique ON products (LOWER(barcode)) WHERE deleted_at IS NULL;'
    );
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_products_name_search ON products (LOWER(name)) WHERE deleted_at IS NULL;'
    );
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_products_category_id ON products (category_id) WHERE deleted_at IS NULL;'
    );
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_products_brand_id ON products (brand_id) WHERE deleted_at IS NULL;'
    );
    await client.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS product_image TEXT;');
    await client.query(
      'ALTER TABLE products ADD COLUMN IF NOT EXISTS allow_sale_price_override BOOLEAN NOT NULL DEFAULT FALSE;'
    );
    await client.query(
      'ALTER TABLE products ADD COLUMN IF NOT EXISTS auto_update_sale_price_from_purchase BOOLEAN NOT NULL DEFAULT FALSE;'
    );
    await client.query(
      'ALTER TABLE products ADD COLUMN IF NOT EXISTS track_expiry BOOLEAN NOT NULL DEFAULT FALSE;'
    );
    await client.query(
      'ALTER TABLE products ADD COLUMN IF NOT EXISTS expiry_required BOOLEAN NOT NULL DEFAULT FALSE;'
    );
    await client.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS expiry_alert_days INTEGER;');
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'products_expiry_alert_days_non_negative'
        ) THEN
          ALTER TABLE products
          ADD CONSTRAINT products_expiry_alert_days_non_negative
          CHECK (expiry_alert_days IS NULL OR expiry_alert_days >= 0);
        END IF;
      END $$;
    `);
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON stock_movements (product_id, created_at DESC);'
    );
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_inventory_product_id ON inventory (product_id);'
    );
    await client.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_suppliers_name_unique ON suppliers (LOWER(name)) WHERE deleted_at IS NULL;'
    );
    await client.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_purchases_invoice_unique ON purchases (LOWER(invoice_number)) WHERE deleted_at IS NULL;'
    );
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_purchases_po ON purchases (purchase_order_id) WHERE deleted_at IS NULL;'
    );
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_purchases_receipt ON purchases (goods_receipt_id) WHERE deleted_at IS NULL;'
    );
    await client.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_invoice_unique ON sales (LOWER(invoice_number));'
    );
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items (sale_id);'
    );
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales (created_at DESC);'
    );
    await client.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_purchase_orders_po_unique ON purchase_orders (LOWER(po_number)) WHERE deleted_at IS NULL;'
    );
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON purchase_orders (supplier_id, created_at DESC) WHERE deleted_at IS NULL;'
    );
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders (status, created_at DESC) WHERE deleted_at IS NULL;'
    );
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_purchase_orders_expected_date ON purchase_orders (expected_date) WHERE deleted_at IS NULL;'
    );
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_purchase_order_items_po ON purchase_order_items (purchase_order_id);'
    );
    await client.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_purchase_requisitions_number_unique ON purchase_requisitions (LOWER(requisition_number)) WHERE deleted_at IS NULL;'
    );
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_purchase_requisitions_status ON purchase_requisitions (status, created_at DESC) WHERE deleted_at IS NULL;'
    );
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_purchase_requisition_items_req ON purchase_requisition_items (requisition_id);'
    );
    await client.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_goods_receipts_number_unique ON goods_receipts (LOWER(receipt_number));'
    );
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_goods_receipts_po ON goods_receipts (purchase_order_id, received_at DESC);'
    );
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_goods_receipt_items_receipt ON goods_receipt_items (goods_receipt_id);'
    );
    await client.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_lucky_draw_campaigns_code_unique ON lucky_draw_campaigns (LOWER(campaign_code)) WHERE deleted_at IS NULL;'
    );
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_lucky_draw_campaigns_status_dates ON lucky_draw_campaigns (status, start_date, end_date) WHERE deleted_at IS NULL;'
    );
    await client.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_lucky_draw_entries_coupon_unique ON lucky_draw_entries (LOWER(coupon_no));'
    );
    await client.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_lucky_draw_entries_campaign_sale_unique ON lucky_draw_entries (campaign_id, sale_id);'
    );
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_lucky_draw_entries_campaign_created ON lucky_draw_entries (campaign_id, created_at DESC);'
    );
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_lucky_draw_entries_customer ON lucky_draw_entries (customer_id, created_at DESC);'
    );
    // P-7: persist walk-in customer names (nullable, safe idempotent migration)
    await client.query(
      'ALTER TABLE lucky_draw_entries ADD COLUMN IF NOT EXISTS customer_name VARCHAR(180);'
    );
    await client.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_lucky_draw_winners_entry_unique ON lucky_draw_winners (entry_id);'
    );
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_lucky_draw_winners_campaign ON lucky_draw_winners (campaign_id, selected_at DESC);'
    );
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_coupon_logs_coupon_no ON coupon_logs (LOWER(coupon_no), timestamp DESC);'
    );
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_customers_search ON customers (LOWER(name), phone) WHERE deleted_at IS NULL;'
    );
    await client.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_held_sales_hold_number_unique ON held_sales (LOWER(hold_number)) WHERE deleted_at IS NULL;'
    );
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_offline_queue_status ON offline_queue (status, created_at);'
    );
    await client.query(`
      DELETE FROM offline_queue older
      USING offline_queue newer
      WHERE older.id < newer.id
        AND older.entity_type = newer.entity_type
        AND older.entity_id = newer.entity_id
        AND older.operation = newer.operation;
    `);
    await client.query(`
      DELETE FROM offline_queue older
      USING offline_queue newer
      WHERE older.id < newer.id
        AND older.operation_uuid IS NOT NULL
        AND newer.operation_uuid IS NOT NULL
        AND older.operation_uuid = newer.operation_uuid;
    `);
    await client.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_offline_queue_operation_uuid_unique ON offline_queue (operation_uuid) WHERE operation_uuid IS NOT NULL;'
    );
    await client.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_offline_queue_entity_operation_unique ON offline_queue (entity_type, entity_id, operation);'
    );
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_terminals_code ON terminals (terminal_code);'
    );
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_sync_logs_started_at ON sync_logs (started_at DESC);'
    );
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_customer_ledger_customer_id ON customer_ledger (customer_id, created_at DESC);'
    );
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_customer_payments_customer_id ON customer_payments (customer_id, created_at DESC);'
    );
    await client.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_returns_number_unique ON returns (LOWER(return_number)) WHERE deleted_at IS NULL;'
    );
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_returns_sale_id ON returns (sale_id, created_at DESC);'
    );
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_return_items_sale_item_id ON return_items (sale_item_id);'
    );
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_supplier_ledger_supplier_id ON supplier_ledger (supplier_id, created_at DESC);'
    );
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier_id ON supplier_payments (supplier_id, created_at DESC);'
    );
    await client.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_expense_categories_name_unique ON expense_categories (LOWER(name)) WHERE deleted_at IS NULL;'
    );
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_expenses_category_id ON expenses (category_id) WHERE deleted_at IS NULL;'
    );
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses (expense_date DESC) WHERE deleted_at IS NULL;'
    );
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_backup_logs_created_at ON backup_logs (created_at DESC);'
    );
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_device_registrations_machine_id ON device_registrations (machine_id);'
    );
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_licenses_machine_id ON licenses (machine_id, updated_at DESC);'
    );
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_update_checks_checked_at ON update_checks (checked_at DESC);'
    );

    await client.query(`
      INSERT INTO activity_logs (action, status, message)
      VALUES ('database.initialized', 'success', 'Authentication schema verified');
    `);

    await runDatabaseMigrations(client);
  });
}

module.exports = {
  initializeDatabase,
};
