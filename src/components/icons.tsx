/**
 * Central icon set for GB Eggs. Uses Phosphor icons (duotone by default) for a
 * richer, more premium look. Names mirror the previous lucide names so pages
 * can switch import source without other changes. Works in server and client
 * components (the /ssr build has no React context).
 */
import type { ComponentProps, ComponentType } from "react";
import type { IconWeight } from "@phosphor-icons/react";
import * as P from "@phosphor-icons/react/ssr";

export type AppIconProps = Omit<ComponentProps<typeof P.Egg>, "ref"> & { weight?: IconWeight };
export type AppIcon = ComponentType<AppIconProps>;
/** Kept so existing `type LucideIcon` imports keep compiling. */
export type LucideIcon = AppIcon;

function make(Base: typeof P.Egg, weight: IconWeight = "duotone", name?: string): AppIcon {
  const Icon = (props: AppIconProps) => <Base weight={weight} aria-hidden {...props} />;
  Icon.displayName = name ?? "AppIcon";
  return Icon;
}

// Domain
export const Egg = make(P.Egg, "duotone", "Egg");
export const EggCrack = make(P.EggCrack, "duotone", "EggCrack");
export const Bird = make(P.Bird, "duotone", "Bird");
export const Barn = make(P.Barn, "duotone", "Barn");
export const Warehouse = make(P.Warehouse, "duotone", "Warehouse");
export const Skull = make(P.Skull, "duotone", "Skull");
export const HeartPulse = make(P.Heartbeat, "duotone", "HeartPulse");
export const Wheat = make(P.Grains, "duotone", "Wheat");
export const Syringe = make(P.Syringe, "duotone", "Syringe");
export const Pill = make(P.Pill, "duotone", "Pill");
export const FirstAid = make(P.FirstAidKit, "duotone", "FirstAid");
export const Truck = make(P.Truck, "duotone", "Truck");
export const Storefront = make(P.Storefront, "duotone", "Storefront");
export const Leaf = make(P.Leaf, "duotone", "Leaf");
export const Sparkle = make(P.Sparkle, "fill", "Sparkle");
export const Bell = make(P.Bell, "duotone", "Bell");

// Navigation / modules
export const LayoutDashboard = make(P.SquaresFour, "duotone", "LayoutDashboard");
export const Boxes = make(P.Package, "duotone", "Boxes");
export const ShoppingCart = make(P.ShoppingCart, "duotone", "ShoppingCart");
export const ReceiptText = make(P.Invoice, "duotone", "ReceiptText");
export const Receipt = make(P.Receipt, "duotone", "Receipt");
export const Users = make(P.Users, "duotone", "Users");
export const Wallet = make(P.Wallet, "duotone", "Wallet");
export const IdCard = make(P.IdentificationCard, "duotone", "IdCard");
export const Landmark = make(P.Bank, "duotone", "Landmark");
export const FileBarChart = make(P.ChartBar, "duotone", "FileBarChart");
export const Settings = make(P.GearSix, "duotone", "Settings");
export const PanelLeft = make(P.SidebarSimple, "duotone", "PanelLeft");

// Finance
export const Banknote = make(P.Money, "duotone", "Banknote");
export const Coins = make(P.Coins, "duotone", "Coins");
export const HandCoins = make(P.HandCoins, "duotone", "HandCoins");
export const CircleDollarSign = make(P.CurrencyCircleDollar, "duotone", "CircleDollarSign");
export const Scale = make(P.Scales, "duotone", "Scale");
export const TrendingUp = make(P.TrendUp, "bold", "TrendingUp");
export const ArrowDownLeft = make(P.ArrowDownLeft, "bold", "ArrowDownLeft");
export const ArrowUpRight = make(P.ArrowUpRight, "bold", "ArrowUpRight");
export const Percent = make(P.Percent, "duotone", "Percent");
export const Gauge = make(P.Gauge, "duotone", "Gauge");
export const Layers = make(P.Stack, "duotone", "Layers");
export const ChartPie = make(P.ChartPieSlice, "duotone", "ChartPie");
export const ChartLine = make(P.ChartLineUp, "duotone", "ChartLine");

// Stock / status
export const PackageMinus = make(P.EggCrack, "duotone", "PackageMinus");
export const PackageX = make(P.EggCrack, "duotone", "PackageX");
export const PackageSearch = make(P.Package, "duotone", "PackageSearch");
export const AlertTriangle = make(P.Warning, "duotone", "AlertTriangle");
export const AlertOctagon = make(P.WarningOctagon, "duotone", "AlertOctagon");
export const ShieldAlert = make(P.ShieldWarning, "duotone", "ShieldAlert");
export const Inbox = make(P.Tray, "duotone", "Inbox");
export const CalendarClock = make(P.CalendarDots, "duotone", "CalendarClock");
export const CalendarDays = make(P.CalendarBlank, "duotone", "CalendarDays");
export const CalendarRange = make(P.CalendarCheck, "duotone", "CalendarRange");
export const CalendarPlus = make(P.CalendarPlus, "duotone", "CalendarPlus");
export const UserCheck = make(P.UserCheck, "duotone", "UserCheck");
export const UserPlus = make(P.UserPlus, "duotone", "UserPlus");
export const UserRound = make(P.User, "duotone", "UserRound");

// Actions
export const Plus = make(P.Plus, "bold", "Plus");
export const Pencil = make(P.PencilSimple, "duotone", "Pencil");
export const Trash2 = make(P.Trash, "duotone", "Trash2");
export const Ban = make(P.Prohibit, "duotone", "Ban");
export const Save = make(P.FloppyDisk, "duotone", "Save");
export const Printer = make(P.Printer, "duotone", "Printer");
export const FileDown = make(P.FileArrowDown, "duotone", "FileDown");
export const FileSpreadsheet = make(P.FileXls, "duotone", "FileSpreadsheet");
export const FileText = make(P.FileText, "duotone", "FileText");
export const Upload = make(P.UploadSimple, "bold", "Upload");
export const Undo2 = make(P.ArrowUUpLeft, "bold", "Undo2");
export const RotateCcw = make(P.ArrowCounterClockwise, "bold", "RotateCcw");
export const Search = make(P.MagnifyingGlass, "bold", "Search");
export const LogOut = make(P.SignOut, "duotone", "LogOut");
export const Menu = make(P.List, "bold", "Menu");
export const ArrowLeft = make(P.ArrowLeft, "bold", "ArrowLeft");
export const ChevronLeft = make(P.CaretLeft, "bold", "ChevronLeft");
export const ChevronRight = make(P.CaretRight, "bold", "ChevronRight");
export const ChevronsUpDown = make(P.CaretUpDown, "bold", "ChevronsUpDown");
export const Check = make(P.Check, "bold", "Check");
export const CheckCircle2 = make(P.CheckCircle, "duotone", "CheckCircle2");
export const X = make(P.X, "bold", "X");
export const XCircle = make(P.XCircle, "duotone", "XCircle");
export const Loader2 = make(P.CircleNotch, "bold", "Loader2");
