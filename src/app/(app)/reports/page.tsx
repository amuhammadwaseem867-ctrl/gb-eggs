import Link from "next/link";
import { FileBarChart } from "@/components/icons";
import { PageHeader } from "@/components/shared/page-header";
import { DateRangeFilter, FilterSelect, Toolbar } from "@/components/shared/table-controls";
import { ExportButtons } from "@/components/reports/export-buttons";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { can, requirePage } from "@/lib/auth";
import { loadOptions } from "@/lib/data/options";
import { dateRange, isUuid, type PageSearchProps, param, startOfMonth, todayIn } from "@/lib/data/query";
import { REPORTS, type ReportResult } from "@/lib/reports";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Reports" };

export default async function ReportsPage({ searchParams }: PageSearchProps) {
  const session = await requirePage("reports");
  const sp = await searchParams;
  const today = todayIn(session.settings.timezone);
  const available = REPORTS.filter((r) => can(session, r.module) || r.module === "reports");
  const key = param(sp, "report") ?? available[0]?.key;
  const report = available.find((r) => r.key === key);
  const range = sp.from || sp.to ? dateRange(sp, today) : { from: startOfMonth(today), to: today };
  const options = await loadOptions(["farms", "sheds", "customers", "suppliers", "grades", "expenseCategories", "cashAccounts", "batches"]);
  const uuid = (k: string) => (isUuid(param(sp, k)) ? param(sp, k)! : null);
  const params = { ...range, farm: uuid("farm"), shed: uuid("shed"), customer: uuid("customer"), supplier: uuid("supplier"), grade: uuid("grade"), category: uuid("category"), account: uuid("account"), batch: uuid("batch") };

  let result: ReportResult | null = null;
  let error: string | null = null;
  const missing = report?.requires && !params[report.requires as keyof typeof params];
  if (report && !missing) {
    try {
      result = await report.run(await createClient(), params);
    } catch (e) {
      error = (e as Error).message;
    }
  }

  const fmt = (v: unknown, type?: string) =>
    v === null || v === undefined || v === "" ? "" : type === "money" ? Number(v).toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : type === "number" ? formatNumber(v as number) : String(v);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Reports" description="Filter any report by date and the relevant farm, shed, customer, supplier or category, then download it as PDF or Excel." />
      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <nav className="flex h-fit gap-1 overflow-x-auto rounded-2xl glass p-1.5 lg:sticky lg:top-24 lg:flex-col" aria-label="Reports">
          {available.map((r) => {
            const next = new URLSearchParams();
            next.set("report", r.key);
            if (sp.from) next.set("from", String(sp.from));
            if (sp.to) next.set("to", String(sp.to));
            return (
              <Link
                key={r.key}
                href={`/reports?${next}`}
                aria-current={r.key === key ? "page" : undefined}
                className={cn("shrink-0 rounded-xl px-3 py-2 text-sm transition-all", r.key === key ? "bg-brand font-medium text-white shadow-glow" : "text-muted-foreground hover:bg-surface/60 hover:text-foreground")}
              >
                {r.title}
              </Link>
            );
          })}
        </nav>
        <div className="flex min-w-0 flex-col gap-4">
          {report ? (
            <>
              <div>
                <h2 className="text-lg font-semibold">{report.title}</h2>
                <p className="text-sm text-muted-foreground">{report.description}</p>
              </div>
              <Toolbar>
                {report.filters.includes("range") ? <DateRangeFilter defaultFrom={range.from} defaultTo={range.to} /> : null}
                {report.filters.includes("farm") ? <FilterSelect param="farm" placeholder="All farms" options={options.farms ?? []} /> : null}
                {report.filters.includes("shed") ? <FilterSelect param="shed" placeholder="All sheds" options={(options.sheds ?? []).filter((s) => !params.farm || s.parent === params.farm)} /> : null}
                {report.filters.includes("customer") ? <FilterSelect param="customer" placeholder={report.requires === "customer" ? "Select customer" : "All customers"} options={options.customers ?? []} /> : null}
                {report.filters.includes("supplier") ? <FilterSelect param="supplier" placeholder={report.requires === "supplier" ? "Select supplier" : "All suppliers"} options={options.suppliers ?? []} /> : null}
                {report.filters.includes("category") ? <FilterSelect param="category" placeholder="All categories" options={options.expenseCategories ?? []} /> : null}
                {report.filters.includes("account") ? <FilterSelect param="account" placeholder="All accounts" options={options.cashAccounts ?? []} /> : null}
                {report.filters.includes("batch") ? <FilterSelect param="batch" placeholder="All batches" options={options.batches ?? []} /> : null}
                {result ? (
                  <div className="sm:ml-auto">
                    <ExportButtons
                      title={report.title}
                      subtitle={report.filters.includes("range") ? `${formatDate(range.from)} – ${formatDate(range.to)}` : undefined}
                      company={session.settings.company_name}
                      fileName={`${report.key}_${range.from}_${range.to}`}
                      columns={result.columns}
                      rows={result.rows}
                      totals={result.totals}
                    />
                  </div>
                ) : null}
              </Toolbar>
              {result?.note ? <p className="text-xs text-muted-foreground">{result.note}</p> : null}
              {missing ? <EmptyState icon={FileBarChart} title={`Select a ${report.requires} to run this report`} /> : null}
              {error ? <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p> : null}
              {result ? (
                <Card className="py-0">
                  <CardContent className="px-0">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-surface/40">
                            {result.columns.map((c) => (
                              <TableHead key={c.key} className={cn("text-xs font-semibold whitespace-nowrap uppercase", (c.type === "money" || c.type === "number") && "text-right")}>{c.header}</TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {result.rows.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={result.columns.length}>
                                <EmptyState title="No data for these filters" />
                              </TableCell>
                            </TableRow>
                          ) : (
                            result.rows.slice(0, 2000).map((r, i) => (
                              <TableRow key={i}>
                                {result!.columns.map((c) => (
                                  <TableCell key={c.key} className={cn("tabular py-1.5 whitespace-nowrap", (c.type === "money" || c.type === "number") && "text-right")}>{fmt(r[c.key], c.type)}</TableCell>
                                ))}
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                        {result.totals && result.rows.length ? (
                          <TableFooter>
                            <TableRow className="font-semibold">
                              {result.columns.map((c) => (
                                <TableCell key={c.key} className={cn("tabular whitespace-nowrap", (c.type === "money" || c.type === "number") && "text-right")}>{fmt(result!.totals![c.key], c.type)}</TableCell>
                              ))}
                            </TableRow>
                          </TableFooter>
                        ) : null}
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              ) : null}
              {result && result.rows.length > 2000 ? <p className="text-xs text-muted-foreground">Showing the first 2,000 of {formatNumber(result.rows.length)} rows on screen; exports include every row.</p> : null}
            </>
          ) : (
            <EmptyState title="No reports available for your role" />
          )}
        </div>
      </div>
    </div>
  );
}
