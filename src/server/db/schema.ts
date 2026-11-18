import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgSequence,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const roleEnum = pgEnum("role", ["admin", "staff"]);
export const audienceEnum = pgEnum("audience", ["kids", "youth", "adult"]);
export const sizeEnum = pgEnum("size", ["XS", "S", "M", "L", "XL"]);
export const productStatusEnum = pgEnum("product_status", ["active", "archived"]);
export const imageKindEnum = pgEnum("image_kind", ["original", "ai_model", "marketing"]);
export const inventoryTxnTypeEnum = pgEnum("inventory_txn_type", [
  "initial",
  "stock_in",
  "adjustment",
  "stock_out",
  "reserve",
  "release",
  "sale",
]);
export const jobStatusEnum = pgEnum("job_status", ["pending", "processing", "completed", "failed"]);
export const orderStatusEnum = pgEnum("order_status", [
  "pending",
  "confirmed",
  "processing",
  "dispatched",
  "delivered",
  "cancelled",
]);
export const reservationStatusEnum = pgEnum("reservation_status", ["active", "released", "consumed"]);
export const reservationPolicyEnum = pgEnum("reservation_policy", ["on_order", "on_confirm"]);

export const productSkuSeq = pgSequence("product_sku_seq", { startWith: 1, increment: 1 });
export const orderNumberSeq = pgSequence("order_number_seq", { startWith: 1, increment: 1 });

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export const users = pgTable(
  "users",
  {
    // Same id as the Supabase Auth user (auth.users.id); Supabase checks the password.
    id: uuid("id").primaryKey(),
    // Slots 1-4 are the only possible accounts. Slot 1 is always the admin.
    slot: smallint("slot").notNull(),
    role: roleEnum("role").notNull(),
    name: varchar("name", { length: 80 }).notNull(),
    email: varchar("email", { length: 254 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("users_slot_unique").on(t.slot),
    uniqueIndex("users_email_unique").on(sql`lower(${t.email})`),
    check("users_slot_range", sql`${t.slot} BETWEEN 1 AND 4`),
    check("users_admin_slot", sql`(${t.role} = 'admin') = (${t.slot} = 1)`),
  ],
);

export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    email: varchar("email", { length: 254 }).notNull(),
    ip: varchar("ip", { length: 64 }).notNull(),
    success: boolean("success").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("login_attempts_lookup_idx").on(t.email, t.ip, t.createdAt)],
);

// Generic per-key rate limiting (public order form).
export const rateLimitEvents = pgTable(
  "rate_limit_events",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    key: varchar("key", { length: 200 }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("rate_limit_events_key_idx").on(t.key, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 60 }).notNull().unique(),
  slug: varchar("slug", { length: 60 }).notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: createdAt(),
});

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sku: varchar("sku", { length: 20 })
      .notNull()
      .unique()
      .default(sql`next_code('CLO-', 'product_sku_seq')`),
    name: varchar("name", { length: 120 }).notNull(),
    description: text("description").notNull(),
    audience: audienceEnum("audience").notNull(),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    purchasePriceMinor: integer("purchase_price_minor").notNull(),
    sellingPriceMinor: integer("selling_price_minor").notNull(),
    status: productStatusEnum("status").notNull().default("active"),
    isPublished: boolean("is_published").notNull().default(true),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("products_status_created_idx").on(t.status, t.createdAt),
    index("products_audience_idx").on(t.audience),
    index("products_category_idx").on(t.categoryId),
    check("products_prices_positive", sql`${t.purchasePriceMinor} >= 0 AND ${t.sellingPriceMinor} > 0`),
    check("products_description_len", sql`char_length(${t.description}) <= 1000`),
  ],
);

export const productSizes = pgTable(
  "product_sizes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    size: sizeEnum("size").notNull(),
    onHand: integer("on_hand").notNull().default(0),
    reserved: integer("reserved").notNull().default(0),
    sold: integer("sold").notNull().default(0),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("product_sizes_product_size_unique").on(t.productId, t.size),
    check("product_sizes_on_hand_nonneg", sql`${t.onHand} >= 0`),
    check("product_sizes_reserved_nonneg", sql`${t.reserved} >= 0`),
    check("product_sizes_reserved_le_on_hand", sql`${t.reserved} <= ${t.onHand}`),
    check("product_sizes_sold_nonneg", sql`${t.sold} >= 0`),
  ],
);

export const aiGenerationJobs = pgTable(
  "ai_generation_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    status: jobStatusEnum("status").notNull().default("pending"),
    provider: varchar("provider", { length: 30 }),
    // Provider chosen when regenerating (e.g. the paid one); null = AI_IMAGE_PROVIDER.
    requestedProvider: varchar("requested_provider", { length: 30 }),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    runAfter: timestamp("run_after", { withTimezone: true }).notNull().defaultNow(),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    lastError: text("last_error"),
    requestedBy: uuid("requested_by").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // One active job per product: duplicate job prevention at the database level.
    uniqueIndex("ai_jobs_one_active_per_product")
      .on(t.productId)
      .where(sql`${t.status} IN ('pending', 'processing')`),
    index("ai_jobs_claim_idx").on(t.status, t.runAfter),
    index("ai_jobs_product_idx").on(t.productId, t.createdAt),
  ],
);

export const productImages = pgTable(
  "product_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    kind: imageKindEnum("kind").notNull(),
    storageKey: varchar("storage_key", { length: 300 }).notNull(),
    thumbKey: varchar("thumb_key", { length: 300 }),
    // Re-encoded copy without EXIF/GPS metadata; this is what customers see.
    displayKey: varchar("display_key", { length: 300 }),
    // Failed attempts to create the display copy (the backfill gives up after a few).
    displayAttempts: smallint("display_attempts").notNull().default(0),
    contentType: varchar("content_type", { length: 40 }).notNull(),
    width: integer("width"),
    height: integer("height"),
    jobId: uuid("job_id").references(() => aiGenerationJobs.id),
    variant: smallint("variant").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    index("product_images_product_idx").on(t.productId, t.kind, t.createdAt),
    // One stored file belongs to exactly one image row (stops upload-ticket replays).
    uniqueIndex("product_images_storage_key_unique").on(t.storageKey),
  ],
);

export const publicProductLinks = pgTable("public_product_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id")
    .notNull()
    .unique()
    .references(() => products.id, { onDelete: "restrict" }),
  // Equals the SKU, which never changes, so shared links stay stable.
  slug: varchar("slug", { length: 40 }).notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  viewCount: integer("view_count").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export const customers = pgTable("customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  phone: varchar("phone", { length: 20 }).notNull().unique(),
  name: varchar("name", { length: 80 }).notNull(),
  whatsapp: varchar("whatsapp", { length: 20 }),
  address: varchar("address", { length: 300 }).notNull(),
  city: varchar("city", { length: 60 }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderNumber: varchar("order_number", { length: 20 })
      .notNull()
      .unique()
      .default(sql`next_code('ORD-', 'order_number_seq')`),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    status: orderStatusEnum("status").notNull().default("pending"),
    // Delivery snapshot: the customer row may change later, the order must not.
    customerName: varchar("customer_name", { length: 80 }).notNull(),
    phone: varchar("phone", { length: 20 }).notNull(),
    whatsapp: varchar("whatsapp", { length: 20 }),
    address: varchar("address", { length: 300 }).notNull(),
    city: varchar("city", { length: 60 }).notNull(),
    notes: varchar("notes", { length: 500 }),
    totalMinor: bigint("total_minor", { mode: "number" }).notNull(),
    stockReserved: boolean("stock_reserved").notNull().default(false),
    cancelReason: varchar("cancel_reason", { length: 200 }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("orders_status_created_idx").on(t.status, t.createdAt),
    index("orders_customer_idx").on(t.customerId),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    productSizeId: uuid("product_size_id")
      .notNull()
      .references(() => productSizes.id),
    productName: varchar("product_name", { length: 120 }).notNull(),
    sku: varchar("sku", { length: 20 }).notNull(),
    size: sizeEnum("size").notNull(),
    unitPriceMinor: integer("unit_price_minor").notNull(),
    unitCostMinor: integer("unit_cost_minor").notNull(),
    quantity: integer("quantity").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("order_items_order_idx").on(t.orderId),
    index("order_items_product_idx").on(t.productId),
    check("order_items_quantity_positive", sql`${t.quantity} > 0`),
  ],
);

export const stockReservations = pgTable(
  "stock_reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderItemId: uuid("order_item_id")
      .notNull()
      .references(() => orderItems.id),
    productSizeId: uuid("product_size_id")
      .notNull()
      .references(() => productSizes.id),
    quantity: integer("quantity").notNull(),
    status: reservationStatusEnum("status").notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("stock_reservations_item_idx").on(t.orderItemId),
    check("stock_reservations_quantity_positive", sql`${t.quantity} > 0`),
  ],
);

export const inventoryTransactions = pgTable(
  "inventory_transactions",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    productSizeId: uuid("product_size_id")
      .notNull()
      .references(() => productSizes.id),
    type: inventoryTxnTypeEnum("type").notNull(),
    onHandDelta: integer("on_hand_delta").notNull().default(0),
    reservedDelta: integer("reserved_delta").notNull().default(0),
    soldDelta: integer("sold_delta").notNull().default(0),
    onHandAfter: integer("on_hand_after").notNull(),
    reservedAfter: integer("reserved_after").notNull(),
    reason: varchar("reason", { length: 300 }),
    orderId: uuid("order_id").references(() => orders.id),
    userId: uuid("user_id").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    index("inventory_txn_product_idx").on(t.productId, t.createdAt),
    index("inventory_txn_created_idx").on(t.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// Activity, notifications, settings
// ---------------------------------------------------------------------------

export const activityLogs = pgTable(
  "activity_logs",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    // NULL means a customer or the system.
    userId: uuid("user_id").references(() => users.id),
    action: varchar("action", { length: 60 }).notNull(),
    entityType: varchar("entity_type", { length: 40 }),
    entityId: varchar("entity_id", { length: 60 }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    ip: varchar("ip", { length: 64 }),
    createdAt: createdAt(),
  },
  (t) => [
    index("activity_logs_created_idx").on(t.createdAt),
    index("activity_logs_user_idx").on(t.userId, t.createdAt),
    index("activity_logs_entity_idx").on(t.entityType, t.entityId),
  ],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 40 }).notNull(),
    title: varchar("title", { length: 120 }).notNull(),
    body: varchar("body", { length: 300 }),
    href: varchar("href", { length: 200 }),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.readAt, t.createdAt)],
);

export const settings = pgTable(
  "settings",
  {
    id: smallint("id").primaryKey().default(1),
    brandName: varchar("brand_name", { length: 60 }).notNull().default("Threadline"),
    brandTagline: varchar("brand_tagline", { length: 120 }),
    currencyCode: varchar("currency_code", { length: 3 }).notNull().default("PKR"),
    currencySymbol: varchar("currency_symbol", { length: 6 }).notNull().default("Rs."),
    lowStockThreshold: integer("low_stock_threshold").notNull().default(5),
    reservationPolicy: reservationPolicyEnum("reservation_policy").notNull().default("on_order"),
    pendingOrderExpiryHours: integer("pending_order_expiry_hours").notNull().default(72),
    autoPublishProducts: boolean("auto_publish_products").notNull().default(true),
    maxOrderQuantity: integer("max_order_quantity").notNull().default(10),
    updatedAt: updatedAt(),
  },
  (t) => [check("settings_singleton", sql`${t.id} = 1`)],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const usersRelations = relations(users, ({ many }) => ({
  products: many(products),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, { fields: [products.categoryId], references: [categories.id] }),
  creator: one(users, { fields: [products.createdBy], references: [users.id] }),
  sizes: many(productSizes),
  images: many(productImages),
  jobs: many(aiGenerationJobs),
  link: one(publicProductLinks),
}));

export const productSizesRelations = relations(productSizes, ({ one }) => ({
  product: one(products, { fields: [productSizes.productId], references: [products.id] }),
}));

export const productImagesRelations = relations(productImages, ({ one }) => ({
  product: one(products, { fields: [productImages.productId], references: [products.id] }),
  job: one(aiGenerationJobs, { fields: [productImages.jobId], references: [aiGenerationJobs.id] }),
}));

export const aiGenerationJobsRelations = relations(aiGenerationJobs, ({ one, many }) => ({
  product: one(products, { fields: [aiGenerationJobs.productId], references: [products.id] }),
  images: many(productImages),
}));

export const publicProductLinksRelations = relations(publicProductLinks, ({ one }) => ({
  product: one(products, { fields: [publicProductLinks.productId], references: [products.id] }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  customer: one(customers, { fields: [orders.customerId], references: [customers.id] }),
  items: many(orderItems),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  product: one(products, { fields: [orderItems.productId], references: [products.id] }),
}));

export const customersRelations = relations(customers, ({ many }) => ({
  orders: many(orders),
}));
