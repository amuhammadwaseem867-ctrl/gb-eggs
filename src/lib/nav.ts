import type { ModuleCode } from "@/lib/types";

export interface NavItem {
  module: ModuleCode;
  href: string;
  icon: string;
}

/** Sidebar order (as specified). Icons are lucide-react names mapped in the sidebar. */
export const NAV_ITEMS: NavItem[] = [
  { module: "dashboard", href: "/dashboard", icon: "LayoutDashboard" },
  { module: "poultry", href: "/poultry", icon: "Bird" },
  { module: "production", href: "/production", icon: "Egg" },
  { module: "inventory", href: "/inventory", icon: "Boxes" },
  { module: "purchases", href: "/purchases", icon: "ShoppingCart" },
  { module: "sales", href: "/sales", icon: "ReceiptText" },
  { module: "customers", href: "/customers", icon: "Users" },
  { module: "suppliers", href: "/suppliers", icon: "Truck" },
  { module: "feed", href: "/feed", icon: "Wheat" },
  { module: "medicine", href: "/medicine", icon: "Syringe" },
  { module: "expenses", href: "/expenses", icon: "Wallet" },
  { module: "employees", href: "/employees", icon: "IdCard" },
  { module: "accounting", href: "/accounting", icon: "Landmark" },
  { module: "reports", href: "/reports", icon: "FileBarChart" },
  { module: "settings", href: "/settings", icon: "Settings" },
];
