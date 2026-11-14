import type { ModuleCode } from "@/lib/types";

export type Lang = "en" | "ur";

type Dict = Record<string, string>;

const en: Dict = {
  "nav.dashboard": "Dashboard",
  "nav.poultry": "Poultry Management",
  "nav.production": "Egg Production",
  "nav.inventory": "Egg Inventory",
  "nav.purchases": "Egg Purchases",
  "nav.sales": "Egg Sales",
  "nav.customers": "Customers",
  "nav.suppliers": "Suppliers",
  "nav.feed": "Feed Management",
  "nav.medicine": "Medicine Management",
  "nav.expenses": "Expenses",
  "nav.employees": "Employees",
  "nav.accounting": "Accounting",
  "nav.reports": "Reports",
  "nav.settings": "Settings",
  "common.search": "Search…",
  "common.signOut": "Sign out",
  "common.collapse": "Collapse sidebar",
  "common.new": "New",
  "common.save": "Save",
  "common.cancel": "Cancel",
  "common.noData": "Nothing here yet",
  "dash.liveBirds": "Live chickens",
  "dash.collected": "Eggs collected today",
  "dash.purchased": "Eggs purchased today",
  "dash.sold": "Eggs sold today",
  "dash.stock": "Available egg stock",
  "dash.broken": "Broken & damaged today",
  "dash.customers": "Customers",
  "dash.receivables": "Outstanding receivables",
  "dash.revenue": "Today's revenue",
  "dash.expenses": "Today's expenses",
  "dash.profit": "Today's net profit",
};

const ur: Dict = {
  "nav.dashboard": "ڈیش بورڈ",
  "nav.poultry": "پولٹری مینجمنٹ",
  "nav.production": "انڈوں کی پیداوار",
  "nav.inventory": "انڈوں کا اسٹاک",
  "nav.purchases": "انڈوں کی خریداری",
  "nav.sales": "انڈوں کی فروخت",
  "nav.customers": "گاہک",
  "nav.suppliers": "سپلائرز",
  "nav.feed": "فیڈ مینجمنٹ",
  "nav.medicine": "ادویات",
  "nav.expenses": "اخراجات",
  "nav.employees": "ملازمین",
  "nav.accounting": "اکاؤنٹنگ",
  "nav.reports": "رپورٹس",
  "nav.settings": "ترتیبات",
  "common.search": "تلاش کریں…",
  "common.signOut": "لاگ آؤٹ",
  "common.collapse": "سائیڈبار بند کریں",
  "common.new": "نیا",
  "common.save": "محفوظ کریں",
  "common.cancel": "منسوخ",
  "common.noData": "ابھی کوئی ریکارڈ نہیں",
  "dash.liveBirds": "زندہ مرغیاں",
  "dash.collected": "آج جمع شدہ انڈے",
  "dash.purchased": "آج خریدے گئے انڈے",
  "dash.sold": "آج فروخت شدہ انڈے",
  "dash.stock": "دستیاب اسٹاک",
  "dash.broken": "آج ٹوٹے / خراب انڈے",
  "dash.customers": "گاہک",
  "dash.receivables": "واجب الوصول رقم",
  "dash.revenue": "آج کی آمدنی",
  "dash.expenses": "آج کے اخراجات",
  "dash.profit": "آج کا خالص منافع",
};

const dictionaries: Record<Lang, Dict> = { en, ur };

export function getDictionary(lang: Lang | string | null | undefined): Dict {
  return dictionaries[(lang as Lang) in dictionaries ? (lang as Lang) : "en"];
}

export function t(dict: Dict, key: string) {
  return dict[key] ?? en[key] ?? key;
}

export const navKey = (m: ModuleCode) => `nav.${m}`;
export const isRtl = (lang: string | null | undefined) => lang === "ur";
