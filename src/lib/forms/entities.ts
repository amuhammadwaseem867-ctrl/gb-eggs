import type { ModuleCode } from "@/lib/types";
import { type FieldDef, opts, PAYMENT_METHODS, type Refinement } from "@/lib/forms/schema";

export interface EntityDef {
  title: string;
  table: string;
  module: ModuleCode;
  fields: FieldDef[];
  /** insert (default) | upsert on `conflict` | rpc taking { p: payload } */
  mode?: "insert" | "upsert" | "rpc";
  conflict?: string;
  rpc?: string;
  /** Whether existing rows may be edited through the form. */
  editable?: boolean;
  /** Whether rows may be hard-deleted (master data only; FK constraints still apply). */
  deletable?: boolean;
  refine?: Refinement[];
  /** Extra constant values merged into the payload. */
  constants?: Record<string, unknown>;
  submitLabel?: string;
}

// Reusable field groups -------------------------------------------------------
const date = (name: string, label = "Date"): FieldDef => ({ name, label, type: "date", required: true, defaultValue: "today" });
const notes: FieldDef = { name: "notes", label: "Notes", type: "textarea", wide: true };
const active: FieldDef = { name: "is_active", label: "Active", type: "checkbox", defaultValue: true };
const paymentFields = (paidLabel = "Amount paid now"): FieldDef[] => [
  { name: "paid_amount", label: paidLabel, type: "money", min: 0, defaultValue: 0 },
  { name: "payment_method", label: "Payment method", type: "select", options: PAYMENT_METHODS, defaultValue: "cash" },
  { name: "cash_account_id", label: "Paid from / into account", type: "select", source: "cashAccounts" },
];
const requireAccountWhenPaid: Refinement = (v) =>
  Number(v.paid_amount ?? 0) > 0 && !v.cash_account_id
    ? { path: "cash_account_id", message: "Select the cash/bank account for the payment" }
    : null;

export const BIRD_TYPES = opts(["layer", "Layer"], ["broiler", "Broiler"], ["breeder", "Breeder"], ["grower", "Grower"]);
export const SUPPLIER_TYPES = opts(
  ["egg", "Egg supplier"], ["chicken", "Chicken supplier"], ["feed", "Feed supplier"],
  ["medicine", "Medicine supplier"], ["packaging", "Packaging supplier"], ["general", "General"],
);
export const DAMAGE_SOURCES = opts(["handling", "Handling"], ["transport", "Transport"], ["storage", "Storage"], ["other", "Other"]);
export const MEDICINE_CATEGORIES = opts(
  ["vaccine", "Vaccine"], ["antibiotic", "Antibiotic"], ["vitamin", "Vitamin"], ["dewormer", "Dewormer"],
  ["disinfectant", "Disinfectant"], ["supplement", "Supplement"], ["other", "Other"],
);
export const MEDICINE_UNITS = opts(
  ["ml", "ml"], ["l", "Litre"], ["g", "Gram"], ["kg", "Kg"], ["dose", "Dose"], ["vial", "Vial"],
  ["bottle", "Bottle"], ["sachet", "Sachet"], ["tablet", "Tablet"], ["pcs", "Pieces"],
);
export const INCOME_CATEGORIES = opts(
  ["manure", "Manure sales"], ["empty_trays", "Empty tray sales"], ["scrap", "Scrap sales"], ["rent", "Rent"],
  ["interest", "Bank profit / interest"], ["misc", "Miscellaneous income"],
  ["owner_capital", "Owner capital (not income)"], ["loan_received", "Loan received (not income)"],
);
export const ATTENDANCE_STATUS = opts(["present", "Present"], ["absent", "Absent"], ["leave", "Leave"], ["half_day", "Half day"], ["holiday", "Holiday"]);

export const ENTITIES = {
  // --- Poultry ---------------------------------------------------------------
  farm: {
    title: "Farm / location", table: "farms", module: "poultry", editable: true, deletable: true,
    fields: [
      { name: "code", label: "Code", type: "text", required: true, placeholder: "GB-MAIN" },
      { name: "name", label: "Name", type: "text", required: true },
      { name: "farm_type", label: "Type", type: "select", required: true, defaultValue: "farm", options: opts(["farm", "Farm"], ["store", "Store / warehouse"]) },
      { name: "location", label: "Location", type: "text" },
      { name: "manager_name", label: "Manager", type: "text" },
      { name: "phone", label: "Phone", type: "tel" },
      { name: "capacity", label: "Bird capacity", type: "number", min: 0, integer: true },
      active, notes,
    ],
  },
  shed: {
    title: "Shed", table: "sheds", module: "poultry", editable: true, deletable: true,
    fields: [
      { name: "farm_id", label: "Farm", type: "select", source: "farms", required: true },
      { name: "code", label: "Code", type: "text", required: true },
      { name: "name", label: "Name", type: "text", required: true },
      { name: "shed_type", label: "Type", type: "select", required: true, defaultValue: "layer", options: opts(["layer", "Layer"], ["broiler", "Broiler"], ["breeder", "Breeder"], ["grower", "Grower"], ["brooder", "Brooder"]) },
      { name: "capacity", label: "Capacity", type: "number", min: 0, integer: true },
      active, notes,
    ],
  },
  breed: {
    title: "Breed", table: "chicken_breeds", module: "poultry", editable: true, deletable: true,
    fields: [
      { name: "name", label: "Breed name", type: "text", required: true },
      { name: "bird_type", label: "Type", type: "select", required: true, defaultValue: "layer", options: opts(["layer", "Layer"], ["broiler", "Broiler"], ["breeder", "Breeder"], ["dual", "Dual purpose"]) },
      { name: "description", label: "Description", type: "textarea", wide: true },
      active,
    ],
  },
  batch: {
    title: "Chicken batch (flock)", table: "chicken_batches", module: "poultry", editable: true,
    fields: [
      { name: "batch_code", label: "Batch code", type: "text", required: true, placeholder: "B-2026-04" },
      { name: "farm_id", label: "Farm", type: "select", source: "farms", required: true },
      { name: "shed_id", label: "Shed", type: "select", source: "sheds", dependsOn: "farm_id", required: true },
      { name: "breed_id", label: "Breed", type: "select", source: "breeds" },
      { name: "bird_type", label: "Bird type", type: "select", required: true, defaultValue: "layer", options: BIRD_TYPES },
      date("placement_date", "Placement date"),
      { name: "age_at_placement_days", label: "Age at placement (days)", type: "number", min: 0, integer: true, defaultValue: 0 },
      { name: "opening_birds", label: "Opening birds", type: "number", min: 0, integer: true, required: true },
      { name: "status", label: "Status", type: "select", defaultValue: "active", required: true, options: opts(["active", "Active"], ["closed", "Closed"]) },
      { name: "closed_date", label: "Closed date", type: "date", showIf: { field: "status", in: ["closed"] } },
      notes,
    ],
    refine: [(v) => (v.status === "closed" && !v.closed_date ? { path: "closed_date", message: "Closed date is required" } : null)],
  },
  chicken_purchase: {
    title: "Chicken purchase", table: "chicken_purchases", module: "poultry", submitLabel: "Record purchase",
    fields: [
      { name: "batch_id", label: "Batch", type: "select", source: "activeBatches", required: true },
      { name: "supplier_id", label: "Supplier", type: "select", source: "suppliers", required: true },
      date("purchase_date", "Purchase date"),
      { name: "invoice_no", label: "Supplier invoice #", type: "text" },
      { name: "quantity", label: "Birds", type: "number", min: 1, integer: true, required: true },
      { name: "rate", label: "Rate per bird", type: "money", min: 0, required: true },
      ...paymentFields(), notes,
    ],
    refine: [requireAccountWhenPaid],
  },
  mortality: {
    title: "Mortality", table: "mortality_records", module: "poultry", submitLabel: "Record mortality",
    fields: [
      { name: "batch_id", label: "Batch", type: "select", source: "activeBatches", required: true },
      date("record_date"),
      { name: "quantity", label: "Birds dead", type: "number", min: 1, integer: true, required: true },
      { name: "cause", label: "Cause", type: "select", options: opts(["Natural", "Natural"], ["Heat stress", "Heat stress"], ["Respiratory", "Respiratory"], ["Prolapse", "Prolapse"], ["Disease", "Disease"], ["Predator", "Predator"], ["Unknown", "Unknown"]) },
      notes,
    ],
  },
  chicken_sale: {
    title: "Chicken sale", table: "chicken_sales", module: "poultry", submitLabel: "Record sale",
    fields: [
      { name: "batch_id", label: "Batch", type: "select", source: "activeBatches", required: true },
      { name: "customer_id", label: "Customer (blank = walk-in)", type: "select", source: "customers" },
      { name: "buyer_name", label: "Walk-in buyer name", type: "text" },
      date("sale_date", "Sale date"),
      { name: "quantity", label: "Birds", type: "number", min: 1, integer: true, required: true },
      { name: "rate_basis", label: "Rate basis", type: "select", defaultValue: "per_bird", required: true, options: opts(["per_bird", "Per bird"], ["per_kg", "Per kg"]) },
      { name: "total_weight_kg", label: "Total weight (kg)", type: "number", min: 0, step: 0.001, showIf: { field: "rate_basis", in: ["per_kg"] } },
      { name: "rate", label: "Rate", type: "money", min: 0, required: true },
      ...paymentFields("Amount received now"), notes,
    ],
    refine: [
      requireAccountWhenPaid,
      (v) => (v.rate_basis === "per_kg" && !v.total_weight_kg ? { path: "total_weight_kg", message: "Weight is required for per-kg sales" } : null),
      (v) => (!v.customer_id && !v.buyer_name ? { path: "buyer_name", message: "Enter the buyer name or choose a customer" } : null),
    ],
  },
  chicken_transfer: {
    title: "Bird transfer", table: "chicken_transfers", module: "poultry", submitLabel: "Transfer birds",
    fields: [
      { name: "from_batch_id", label: "From batch", type: "select", source: "activeBatches", required: true },
      { name: "to_batch_id", label: "To batch", type: "select", source: "activeBatches", required: true },
      date("transfer_date"),
      { name: "quantity", label: "Birds", type: "number", min: 1, integer: true, required: true },
      notes,
    ],
    refine: [(v) => (v.from_batch_id && v.from_batch_id === v.to_batch_id ? { path: "to_batch_id", message: "Choose a different batch" } : null)],
  },
  vaccination: {
    title: "Vaccination", table: "vaccination_records", module: "poultry", editable: true, deletable: true,
    fields: [
      { name: "batch_id", label: "Batch", type: "select", source: "batches", required: true },
      date("vaccination_date", "Vaccination date"),
      { name: "vaccine_name", label: "Vaccine", type: "text", required: true },
      { name: "disease_target", label: "Disease", type: "text" },
      { name: "dose", label: "Dose", type: "text" },
      { name: "method", label: "Method", type: "select", options: opts(["drinking_water", "Drinking water"], ["injection", "Injection"], ["eye_drop", "Eye drop"], ["spray", "Spray"], ["wing_web", "Wing web"], ["other", "Other"]) },
      { name: "birds_vaccinated", label: "Birds vaccinated", type: "number", min: 0, integer: true },
      { name: "administered_by", label: "Administered by", type: "text" },
      { name: "next_due_date", label: "Next due date", type: "date" },
      notes,
    ],
  },

  // --- Production ---------------------------------------------------------------
  egg_collection: {
    title: "Daily egg collection", table: "egg_collections", module: "production", submitLabel: "Save collection",
    fields: [
      date("collection_date", "Collection date"),
      { name: "farm_id", label: "Farm", type: "select", source: "farms", required: true },
      { name: "shed_id", label: "Shed", type: "select", source: "sheds", dependsOn: "farm_id", required: true },
      { name: "batch_id", label: "Batch (optional)", type: "select", source: "activeBatches", help: "Leave blank to use all laying flocks in the shed" },
      { name: "morning_eggs", label: "Morning collection", type: "number", min: 0, integer: true, required: true },
      { name: "evening_eggs", label: "Evening collection", type: "number", min: 0, integer: true, required: true, defaultValue: 0 },
      { name: "small_eggs", label: "Small", type: "number", min: 0, integer: true, defaultValue: 0 },
      { name: "medium_eggs", label: "Medium", type: "number", min: 0, integer: true, defaultValue: 0 },
      { name: "large_eggs", label: "Large", type: "number", min: 0, integer: true, defaultValue: 0 },
      { name: "xl_eggs", label: "Extra large", type: "number", min: 0, integer: true, defaultValue: 0 },
      { name: "dirty_eggs", label: "Dirty", type: "number", min: 0, integer: true, defaultValue: 0 },
      { name: "broken_eggs", label: "Broken", type: "number", min: 0, integer: true, defaultValue: 0 },
      { name: "rejected_eggs", label: "Rejected", type: "number", min: 0, integer: true, defaultValue: 0 },
      notes,
    ],
    refine: [
      (v) => {
        const total = Number(v.morning_eggs ?? 0) + Number(v.evening_eggs ?? 0);
        const graded = ["small_eggs", "medium_eggs", "large_eggs", "xl_eggs", "dirty_eggs", "broken_eggs", "rejected_eggs"]
          .reduce((a, k) => a + Number(v[k] ?? 0), 0);
        if (total <= 0) return { path: "morning_eggs", message: "Enter the eggs collected" };
        return total !== graded
          ? { path: "rejected_eggs", message: `Size breakdown (${graded}) must equal total collected (${total})` }
          : null;
      },
    ],
  },

  // --- Inventory ---------------------------------------------------------------
  egg_damage: {
    title: "Damaged / broken eggs", table: "egg_damages", module: "inventory", submitLabel: "Record loss",
    fields: [
      date("damage_date"),
      { name: "farm_id", label: "Location", type: "select", source: "locations", required: true },
      { name: "grade_id", label: "Egg grade", type: "select", source: "grades", required: true },
      { name: "quantity", label: "Eggs", type: "number", min: 1, integer: true, required: true },
      { name: "source", label: "Cause", type: "select", options: DAMAGE_SOURCES, defaultValue: "handling", required: true },
      { name: "reason", label: "Details", type: "textarea", wide: true },
    ],
  },
  egg_adjustment: {
    title: "Stock adjustment", table: "egg_stock_adjustments", module: "inventory", submitLabel: "Post adjustment",
    fields: [
      date("adjustment_date"),
      { name: "farm_id", label: "Location", type: "select", source: "locations", required: true },
      { name: "grade_id", label: "Egg grade", type: "select", source: "grades", required: true },
      { name: "adjustment_type", label: "Type", type: "select", required: true, defaultValue: "increase", options: opts(["opening", "Opening stock"], ["increase", "Increase (count gain)"], ["decrease", "Decrease (count loss)"]) },
      { name: "quantity", label: "Eggs", type: "number", min: 1, integer: true, required: true },
      { name: "reason", label: "Reason", type: "textarea", required: true, wide: true },
    ],
  },
  egg_transfer: {
    title: "Stock transfer", table: "egg_stock_transfers", module: "inventory", submitLabel: "Transfer stock",
    fields: [
      date("transfer_date"),
      { name: "from_farm_id", label: "From", type: "select", source: "locations", required: true },
      { name: "to_farm_id", label: "To", type: "select", source: "locations", required: true },
      { name: "grade_id", label: "Egg grade", type: "select", source: "grades", required: true },
      { name: "quantity", label: "Eggs", type: "number", min: 1, integer: true, required: true },
      notes,
    ],
    refine: [(v) => (v.from_farm_id && v.from_farm_id === v.to_farm_id ? { path: "to_farm_id", message: "Choose a different location" } : null)],
  },
  egg_grade: {
    title: "Egg grade", table: "egg_grades", module: "inventory", editable: true,
    fields: [
      { name: "code", label: "Code", type: "text", required: true },
      { name: "name", label: "Name", type: "text", required: true },
      { name: "egg_size", label: "Size", type: "select", required: true, options: opts(["small", "Small"], ["medium", "Medium"], ["large", "Large"], ["xl", "Extra large"], ["jumbo", "Jumbo"], ["mixed", "Mixed"]) },
      { name: "grade_class", label: "Class", type: "select", required: true, defaultValue: "A", options: opts(["A", "Grade A"], ["B", "Grade B"], ["C", "Grade C"], ["dirty", "Dirty"]) },
      { name: "default_price", label: "Default price per egg", type: "money", min: 0, defaultValue: 0 },
      { name: "reorder_level", label: "Low-stock alert (eggs)", type: "number", min: 0, integer: true, defaultValue: 0 },
      { name: "sort_order", label: "Sort order", type: "number", integer: true, defaultValue: 0 },
      { name: "is_saleable", label: "Saleable", type: "checkbox", defaultValue: true },
      active,
    ],
  },
  packaging_type: {
    title: "Packaging unit", table: "packaging_types", module: "settings", editable: true,
    fields: [
      { name: "code", label: "Code", type: "text", required: true, createOnly: true, help: "Lowercase, e.g. tray" },
      { name: "name", label: "Name", type: "text", required: true },
      { name: "eggs_per_unit", label: "Eggs per unit", type: "number", min: 1, integer: true, required: true },
      { name: "sort_order", label: "Sort order", type: "number", integer: true, defaultValue: 0 },
      active,
    ],
  },
  packaging_item: {
    title: "Packaging material", table: "packaging_items", module: "inventory", editable: true,
    fields: [
      { name: "name", label: "Name", type: "text", required: true, placeholder: "Pulp egg tray (30)" },
      { name: "packaging_code", label: "Holds unit", type: "select", source: "units" },
      { name: "unit", label: "Stock unit", type: "text", defaultValue: "pcs", required: true },
      { name: "reorder_level", label: "Low-stock alert", type: "number", min: 0, integer: true, defaultValue: 0 },
      { name: "unit_cost", label: "Unit cost", type: "money", min: 0, defaultValue: 0 },
      active,
    ],
  },
  packaging_movement: {
    title: "Packaging stock movement", table: "packaging_movements", module: "inventory", submitLabel: "Post movement",
    fields: [
      date("movement_date"),
      { name: "item_id", label: "Item", type: "select", source: "packagingItems", required: true },
      { name: "movement_type", label: "Type", type: "select", required: true, defaultValue: "purchase", options: opts(["opening", "Opening stock"], ["purchase", "Purchase"], ["usage", "Usage"], ["damage", "Damage"], ["adjustment_in", "Adjustment in"], ["adjustment_out", "Adjustment out"]) },
      { name: "quantity", label: "Quantity", type: "number", min: 1, integer: true, required: true },
      { name: "unit_cost", label: "Unit cost", type: "money", min: 0, defaultValue: 0 },
      { name: "supplier_id", label: "Supplier", type: "select", source: "suppliers", showIf: { field: "movement_type", in: ["purchase"] } },
      { name: "invoice_no", label: "Invoice #", type: "text", showIf: { field: "movement_type", in: ["purchase"] } },
      ...paymentFields().map((f) => ({ ...f, showIf: { field: "movement_type", in: ["purchase"] } })),
      notes,
    ],
    refine: [
      requireAccountWhenPaid,
      (v) => (v.movement_type === "purchase" && !v.supplier_id ? { path: "supplier_id", message: "Supplier is required for purchases" } : null),
    ],
  },

  // --- Customers / suppliers ---------------------------------------------------
  customer: {
    title: "Customer", table: "customers", module: "customers", editable: true, deletable: true,
    fields: [
      { name: "name", label: "Customer name", type: "text", required: true },
      { name: "business_name", label: "Business name", type: "text" },
      { name: "code", label: "Code", type: "text" },
      { name: "phone", label: "Phone", type: "tel" },
      { name: "email", label: "Email", type: "email" },
      { name: "city", label: "City", type: "text" },
      { name: "address", label: "Address", type: "textarea", wide: true },
      { name: "opening_balance", label: "Opening balance (receivable)", type: "money", defaultValue: 0 },
      { name: "credit_limit", label: "Credit limit (blank = none)", type: "money", min: 0 },
      active, notes,
    ],
  },
  supplier: {
    title: "Supplier", table: "suppliers", module: "suppliers", editable: true, deletable: true,
    fields: [
      { name: "name", label: "Supplier name", type: "text", required: true },
      { name: "business_name", label: "Business name", type: "text" },
      { name: "supplier_type", label: "Type", type: "select", required: true, defaultValue: "egg", options: SUPPLIER_TYPES },
      { name: "code", label: "Code", type: "text" },
      { name: "phone", label: "Phone", type: "tel" },
      { name: "email", label: "Email", type: "email" },
      { name: "city", label: "City", type: "text" },
      { name: "address", label: "Address", type: "textarea", wide: true },
      { name: "opening_balance", label: "Opening balance (payable)", type: "money", defaultValue: 0 },
      active, notes,
    ],
  },

  // --- Feed & medicine ------------------------------------------------------------
  feed_category: {
    title: "Feed category", table: "feed_categories", module: "feed", editable: true, deletable: true,
    fields: [{ name: "name", label: "Name", type: "text", required: true }, { name: "description", label: "Description", type: "textarea", wide: true }, active],
  },
  feed_item: {
    title: "Feed item", table: "feed_inventory", module: "feed", editable: true,
    fields: [
      { name: "name", label: "Feed name", type: "text", required: true },
      { name: "category_id", label: "Category", type: "select", source: "feedCategories" },
      { name: "unit", label: "Unit", type: "select", required: true, defaultValue: "kg", options: opts(["kg", "Kg"], ["bag", "Bag"], ["ton", "Ton"]) },
      { name: "opening_stock", label: "Opening stock", type: "number", min: 0, step: 0.001, defaultValue: 0, createOnly: true },
      { name: "opening_cost", label: "Opening unit cost", type: "money", min: 0, defaultValue: 0, createOnly: true },
      { name: "reorder_level", label: "Low-stock alert", type: "number", min: 0, step: 0.001, defaultValue: 0 },
      active, notes,
    ],
  },
  feed_purchase: {
    title: "Feed purchase", table: "feed_purchases", module: "feed", submitLabel: "Record purchase",
    fields: [
      date("purchase_date", "Purchase date"),
      { name: "supplier_id", label: "Supplier", type: "select", source: "suppliers", required: true },
      { name: "feed_id", label: "Feed", type: "select", source: "feeds", required: true },
      { name: "invoice_no", label: "Invoice #", type: "text" },
      { name: "quantity", label: "Quantity", type: "number", min: 0.001, step: 0.001, required: true },
      { name: "unit_cost", label: "Unit cost", type: "money", min: 0, required: true },
      ...paymentFields(), notes,
    ],
    refine: [requireAccountWhenPaid],
  },
  feed_consumption: {
    title: "Feed consumption", table: "feed_consumption", module: "feed", submitLabel: "Record consumption",
    fields: [
      date("consumption_date"),
      { name: "farm_id", label: "Farm", type: "select", source: "farms", required: true },
      { name: "shed_id", label: "Shed", type: "select", source: "sheds", dependsOn: "farm_id", required: true },
      { name: "batch_id", label: "Batch", type: "select", source: "activeBatches" },
      { name: "feed_id", label: "Feed", type: "select", source: "feeds", required: true },
      { name: "quantity", label: "Quantity", type: "number", min: 0.001, step: 0.001, required: true },
      notes,
    ],
  },
  medicine: {
    title: "Medicine", table: "medicines", module: "medicine", editable: true, deletable: true,
    fields: [
      { name: "name", label: "Medicine name", type: "text", required: true },
      { name: "category", label: "Category", type: "select", required: true, defaultValue: "vaccine", options: MEDICINE_CATEGORIES },
      { name: "unit", label: "Unit", type: "select", required: true, defaultValue: "ml", options: MEDICINE_UNITS },
      { name: "manufacturer", label: "Manufacturer", type: "text" },
      { name: "reorder_level", label: "Low-stock alert", type: "number", min: 0, step: 0.001, defaultValue: 0 },
      active, notes,
    ],
  },
  medicine_purchase: {
    title: "Medicine purchase", table: "medicine_movements", module: "medicine", submitLabel: "Record purchase",
    constants: { movement_type: "purchase" },
    fields: [
      date("movement_date", "Purchase date"),
      { name: "medicine_id", label: "Medicine", type: "select", source: "medicines", required: true },
      { name: "supplier_id", label: "Supplier", type: "select", source: "suppliers", required: true },
      { name: "batch_no", label: "Batch number", type: "text", required: true },
      { name: "expiry_date", label: "Expiry date", type: "date" },
      { name: "quantity", label: "Quantity", type: "number", min: 0.001, step: 0.001, required: true },
      { name: "unit_cost", label: "Unit price", type: "money", min: 0, required: true },
      { name: "invoice_no", label: "Invoice #", type: "text" },
      ...paymentFields(), notes,
    ],
    refine: [requireAccountWhenPaid],
  },
  medicine_usage: {
    title: "Medication / usage", table: "medicine_movements", module: "medicine", submitLabel: "Record usage",
    fields: [
      date("movement_date"),
      { name: "medicine_id", label: "Medicine", type: "select", source: "medicines", required: true },
      { name: "medicine_batch_id", label: "Medicine batch (blank = first to expire)", type: "select", source: "medicineBatches", dependsOn: "medicine_id" },
      { name: "movement_type", label: "Type", type: "select", required: true, defaultValue: "usage", options: opts(["usage", "Given to birds"], ["expired", "Expired / disposed"], ["adjustment_out", "Adjustment out"], ["adjustment_in", "Adjustment in"]) },
      { name: "quantity", label: "Quantity", type: "number", min: 0.001, step: 0.001, required: true },
      { name: "chicken_batch_id", label: "Chicken batch", type: "select", source: "activeBatches", showIf: { field: "movement_type", in: ["usage"] } },
      { name: "administered_by", label: "Administered by", type: "text", showIf: { field: "movement_type", in: ["usage"] } },
      notes,
    ],
    refine: [(v) => (v.movement_type === "usage" && !v.chicken_batch_id ? { path: "chicken_batch_id", message: "Select the batch that received the medicine" } : null)],
  },

  // --- Expenses & accounting --------------------------------------------------
  expense_category: {
    title: "Expense category", table: "expense_categories", module: "expenses", editable: true, deletable: true,
    fields: [{ name: "name", label: "Name", type: "text", required: true }, { name: "description", label: "Description", type: "textarea", wide: true }, active],
  },
  expense: {
    title: "Expense", table: "expenses", module: "expenses", submitLabel: "Record expense",
    fields: [
      date("expense_date"),
      { name: "category_id", label: "Category", type: "select", source: "expenseCategories", required: true },
      { name: "amount", label: "Amount", type: "money", min: 0.01, required: true },
      { name: "payment_method", label: "Payment method", type: "select", options: PAYMENT_METHODS, defaultValue: "cash", required: true },
      { name: "cash_account_id", label: "Paid from", type: "select", source: "cashAccounts", required: true },
      { name: "farm_id", label: "Farm", type: "select", source: "locations" },
      { name: "payee", label: "Paid to", type: "text" },
      { name: "reference", label: "Reference / bill #", type: "text" },
      { name: "description", label: "Description", type: "textarea", wide: true },
    ],
  },
  cash_account: {
    title: "Cash / bank account", table: "cash_accounts", module: "accounting", editable: true,
    fields: [
      { name: "name", label: "Account name", type: "text", required: true },
      { name: "account_type", label: "Type", type: "select", required: true, defaultValue: "bank", options: opts(["cash", "Cash"], ["bank", "Bank"], ["mobile_wallet", "Mobile wallet"]) },
      { name: "bank_name", label: "Bank", type: "text" },
      { name: "account_number", label: "Account # / IBAN", type: "text" },
      { name: "opening_balance", label: "Opening balance", type: "money", defaultValue: 0, help: "Changes post a correction entry to the cashbook" },
      active, notes,
    ],
  },
  other_income: {
    title: "Other income / capital", table: "other_incomes", module: "accounting", submitLabel: "Record receipt",
    fields: [
      date("income_date"),
      { name: "category", label: "Category", type: "select", required: true, defaultValue: "manure", options: INCOME_CATEGORIES },
      { name: "amount", label: "Amount", type: "money", min: 0.01, required: true },
      { name: "cash_account_id", label: "Received into", type: "select", source: "cashAccounts", required: true },
      { name: "payment_method", label: "Method", type: "select", options: PAYMENT_METHODS, defaultValue: "cash", required: true },
      { name: "received_from", label: "Received from", type: "text" },
      { name: "description", label: "Description", type: "textarea", wide: true },
    ],
  },
  fund_transfer: {
    title: "Transfer between accounts", table: "fund_transfers", module: "accounting", submitLabel: "Transfer",
    fields: [
      date("transfer_date"),
      { name: "from_account_id", label: "From account", type: "select", source: "cashAccounts", required: true },
      { name: "to_account_id", label: "To account", type: "select", source: "cashAccounts", required: true },
      { name: "amount", label: "Amount", type: "money", min: 0.01, required: true },
      notes,
    ],
    refine: [(v) => (v.from_account_id && v.from_account_id === v.to_account_id ? { path: "to_account_id", message: "Choose a different account" } : null)],
  },
  customer_payment: {
    title: "Receive payment", table: "payments", module: "customers", mode: "rpc", rpc: "record_payment", submitLabel: "Save receipt",
    constants: { party_type: "customer" },
    fields: [
      { name: "customer_id", label: "Customer", type: "select", source: "customers", required: true },
      { name: "direction", label: "Type", type: "select", required: true, defaultValue: "in", options: opts(["in", "Receipt from customer"], ["out", "Refund to customer"]) },
      date("payment_date", "Payment date"),
      { name: "amount", label: "Amount", type: "money", min: 0.01, required: true },
      { name: "method", label: "Method", type: "select", options: PAYMENT_METHODS, defaultValue: "cash", required: true },
      { name: "cash_account_id", label: "Account", type: "select", source: "cashAccounts", required: true },
      { name: "reference_no", label: "Reference / cheque #", type: "text" },
      { name: "doc_type", label: "Doc type", type: "hidden" },
      { name: "doc_id", label: "Doc", type: "hidden" },
      notes,
    ],
  },
  supplier_payment: {
    title: "Pay supplier", table: "payments", module: "suppliers", mode: "rpc", rpc: "record_payment", submitLabel: "Save payment",
    constants: { party_type: "supplier" },
    fields: [
      { name: "supplier_id", label: "Supplier", type: "select", source: "suppliers", required: true },
      { name: "direction", label: "Type", type: "select", required: true, defaultValue: "out", options: opts(["out", "Payment to supplier"], ["in", "Refund from supplier"]) },
      date("payment_date", "Payment date"),
      { name: "amount", label: "Amount", type: "money", min: 0.01, required: true },
      { name: "method", label: "Method", type: "select", options: PAYMENT_METHODS, defaultValue: "cash", required: true },
      { name: "cash_account_id", label: "Account", type: "select", source: "cashAccounts", required: true },
      { name: "reference_no", label: "Reference / cheque #", type: "text" },
      { name: "doc_type", label: "Doc type", type: "hidden" },
      { name: "doc_id", label: "Doc", type: "hidden" },
      notes,
    ],
  },

  // --- Employees ------------------------------------------------------------------
  employee: {
    title: "Employee", table: "employees", module: "employees", editable: true,
    fields: [
      { name: "employee_code", label: "Employee ID", type: "text", required: true, placeholder: "EMP-006" },
      { name: "full_name", label: "Full name", type: "text", required: true },
      { name: "cnic", label: "CNIC", type: "text", placeholder: "35202-1234567-1" },
      { name: "phone", label: "Phone", type: "tel" },
      { name: "email", label: "Email", type: "email" },
      { name: "position", label: "Job position", type: "text", required: true },
      { name: "department", label: "Department", type: "text" },
      { name: "farm_id", label: "Farm / location", type: "select", source: "locations" },
      date("joining_date", "Joining date"),
      { name: "basic_salary", label: "Monthly basic salary", type: "money", min: 0, required: true },
      { name: "status", label: "Status", type: "select", required: true, defaultValue: "active", options: opts(["active", "Active"], ["inactive", "Inactive"], ["terminated", "Terminated"]) },
      { name: "leaving_date", label: "Leaving date", type: "date", showIf: { field: "status", in: ["terminated", "inactive"] } },
      { name: "address", label: "Address", type: "textarea", wide: true },
      notes,
    ],
  },
  attendance: {
    title: "Attendance", table: "attendance", module: "employees", mode: "upsert", conflict: "employee_id,attendance_date", submitLabel: "Save attendance",
    fields: [
      { name: "employee_id", label: "Employee", type: "select", source: "employees", required: true },
      date("attendance_date"),
      { name: "status", label: "Status", type: "select", required: true, defaultValue: "present", options: ATTENDANCE_STATUS },
      { name: "check_in", label: "Check in", type: "time" },
      { name: "check_out", label: "Check out", type: "time" },
      notes,
    ],
  },
  employee_advance: {
    title: "Salary advance", table: "employee_advances", module: "employees", submitLabel: "Pay advance",
    fields: [
      { name: "employee_id", label: "Employee", type: "select", source: "employees", required: true },
      date("advance_date"),
      { name: "amount", label: "Amount", type: "money", min: 0.01, required: true },
      { name: "cash_account_id", label: "Paid from", type: "select", source: "cashAccounts", required: true },
      { name: "payment_method", label: "Method", type: "select", options: PAYMENT_METHODS, defaultValue: "cash", required: true },
      notes,
    ],
  },
  salary: {
    title: "Monthly salary", table: "salary_records", module: "employees", editable: true, submitLabel: "Save salary",
    fields: [
      { name: "employee_id", label: "Employee", type: "select", source: "employees", required: true, createOnly: true },
      { name: "salary_month", label: "Month (first day)", type: "date", required: true, createOnly: true, help: "Use the 1st of the month" },
      { name: "working_days", label: "Working days", type: "number", min: 0, max: 31, integer: true },
      { name: "present_days", label: "Days present", type: "number", min: 0, step: 0.5 },
      { name: "basic_salary", label: "Basic salary", type: "money", min: 0, required: true },
      { name: "allowances", label: "Allowances", type: "money", min: 0, defaultValue: 0 },
      { name: "overtime", label: "Overtime", type: "money", min: 0, defaultValue: 0 },
      { name: "deductions", label: "Deductions (absence / penalties)", type: "money", min: 0, defaultValue: 0 },
      { name: "advance_deduction", label: "Advance recovery", type: "money", min: 0, defaultValue: 0 },
      notes,
    ],
    refine: [(v) => (typeof v.salary_month === "string" && !v.salary_month.endsWith("-01") ? { path: "salary_month", message: "Choose the first day of the month" } : null)],
  },
} satisfies Record<string, EntityDef>;

export type EntityKey = keyof typeof ENTITIES;

export function getEntity(key: string): EntityDef {
  const def = (ENTITIES as Record<string, EntityDef>)[key];
  if (!def) throw new Error(`Unknown form ${key}`);
  return def;
}
