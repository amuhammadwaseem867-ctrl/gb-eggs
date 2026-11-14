import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { can, getSession } from "@/lib/auth";
import { getDictionary, isRtl, navKey, t } from "@/lib/i18n";
import { NAV_ITEMS } from "@/lib/nav";
import { todayIn } from "@/lib/data/query";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const dict = getDictionary(session.settings.language);
  const items = NAV_ITEMS.filter((i) => can(session, i.module, "view")).map((i) => ({
    href: i.href,
    icon: i.icon,
    label: t(dict, navKey(i.module)),
  }));
  const today = todayIn(session.settings.timezone);

  return (
    <div dir={isRtl(session.settings.language) ? "rtl" : "ltr"} lang={session.settings.language} className="flex min-h-svh">
      <Sidebar items={items} companyName={session.settings.company_name} collapseLabel={t(dict, "common.collapse")} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          items={items}
          companyName={session.settings.company_name}
          user={{ name: session.fullName, email: session.email, role: session.role }}
          today={today}
          signOutLabel={t(dict, "common.signOut")}
        />
        <main className="mx-auto w-full max-w-[1500px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {session.isActive ? (
            children
          ) : (
            <div className="rounded-xl border bg-card p-8 text-center">
              <p className="font-medium">Your account is inactive.</p>
              <p className="text-sm text-muted-foreground">Ask an administrator to activate it.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
