import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter, Plus_Jakarta_Sans } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"], weight: ["500", "600", "700"] });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "GB Eggs — Poultry & Egg ERP", template: "%s · GB Eggs" },
  description: "GB Eggs poultry farm and egg business management system",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#121a33",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${jakarta.variable} ${mono.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full bg-background">
        <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
        <Toaster richColors position="top-right" closeButton />
      </body>
    </html>
  );
}
