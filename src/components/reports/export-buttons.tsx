"use client";

import * as React from "react";
import { FileDown, FileSpreadsheet, Loader2 } from "@/components/icons";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export interface ExportColumn {
  key: string;
  header: string;
  type?: "text" | "number" | "money" | "date";
}

export interface ExportProps {
  title: string;
  subtitle?: string;
  columns: ExportColumn[];
  rows: Record<string, string | number | null>[];
  totals?: Record<string, string | number | null>;
  company?: string;
  fileName?: string;
}

const fmt = (v: unknown, type?: ExportColumn["type"]) => {
  if (v === null || v === undefined || v === "") return "";
  if (type === "money") return Number(v).toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (type === "number") return Number(v).toLocaleString("en-PK", { maximumFractionDigits: 3 });
  return String(v);
};

const safeName = (s: string) => s.replace(/[^a-z0-9-_]+/gi, "_").replace(/_+/g, "_").slice(0, 80);

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function exportPdf({ title, subtitle, columns, rows, totals, company = "GB Eggs", fileName }: ExportProps) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const landscape = columns.length > 6;
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: landscape ? "landscape" : "portrait" });
  const W = doc.internal.pageSize.getWidth();
  doc.setFillColor(22, 30, 58).rect(0, 0, W, 58, "F");
  doc.setTextColor(255, 255, 255).setFont("helvetica", "bold").setFontSize(14).text(company, 32, 26);
  doc.setFont("helvetica", "normal").setFontSize(10).text(title, 32, 44);
  doc.setFontSize(8).text(`Generated ${new Date().toLocaleString("en-GB")}`, W - 32, 26, { align: "right" });
  if (subtitle) doc.text(subtitle, W - 32, 44, { align: "right" });
  const right = new Set(columns.map((c, i) => (c.type === "money" || c.type === "number" ? i : -1)).filter((i) => i >= 0));
  autoTable(doc, {
    startY: 74,
    head: [columns.map((c) => c.header)],
    body: rows.map((r) => columns.map((c) => fmt(r[c.key], c.type))),
    foot: totals ? [columns.map((c) => fmt(totals[c.key], c.type))] : undefined,
    styles: { fontSize: 7.5, cellPadding: 4 },
    headStyles: { fillColor: [16, 150, 110], textColor: 255 },
    footStyles: { fillColor: [235, 240, 245], textColor: [22, 30, 58], fontStyle: "bold" },
    columnStyles: Object.fromEntries([...right].map((i) => [i, { halign: "right" as const }])),
    margin: { left: 32, right: 32 },
    didDrawPage: () => {
      const h = doc.internal.pageSize.getHeight();
      doc.setFontSize(7).setTextColor(130, 130, 130).text(`Page ${doc.getNumberOfPages()}`, W - 32, h - 16, { align: "right" });
    },
  });
  doc.save(`${safeName(fileName ?? title)}.pdf`);
}

export async function exportExcel({ title, subtitle, columns, rows, totals, company = "GB Eggs", fileName }: ExportProps) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = company;
  const ws = wb.addWorksheet(title.slice(0, 31).replace(/[\\/?*[\]:]/g, " "));
  ws.addRow([company]).font = { bold: true, size: 14 };
  ws.addRow([title + (subtitle ? ` — ${subtitle}` : "")]).font = { size: 11 };
  ws.addRow([]);
  const header = ws.addRow(columns.map((c) => c.header));
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.eachCell((cell) => (cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF10966E" } }));
  for (const r of rows) {
    ws.addRow(columns.map((c) => (c.type === "money" || c.type === "number" ? (r[c.key] === null || r[c.key] === "" ? null : Number(r[c.key])) : r[c.key] ?? "")));
  }
  if (totals) {
    const t = ws.addRow(columns.map((c) => (c.type === "money" || c.type === "number" ? (totals[c.key] === undefined || totals[c.key] === null ? null : Number(totals[c.key])) : totals[c.key] ?? "")));
    t.font = { bold: true };
  }
  columns.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    col.width = Math.min(Math.max(c.header.length + 4, 12), 40);
    if (c.type === "money") col.numFmt = "#,##0.00";
    if (c.type === "number") col.numFmt = "#,##0.###";
  });
  const buf = await wb.xlsx.writeBuffer();
  download(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${safeName(fileName ?? title)}.xlsx`);
}

export function ExportButtons(props: ExportProps) {
  const [busy, setBusy] = React.useState<"pdf" | "xlsx" | null>(null);
  const run = async (kind: "pdf" | "xlsx") => {
    try {
      setBusy(kind);
      if (kind === "pdf") await exportPdf(props);
      else await exportExcel(props);
    } catch (e) {
      toast.error(`Export failed: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };
  const empty = props.rows.length === 0;
  return (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={() => run("pdf")} disabled={!!busy || empty}>
        {busy === "pdf" ? <Loader2 className="animate-spin" /> : <FileDown />} PDF
      </Button>
      <Button variant="outline" size="sm" onClick={() => run("xlsx")} disabled={!!busy || empty}>
        {busy === "xlsx" ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />} Excel
      </Button>
    </div>
  );
}

export function LedgerExport({ title, rows }: { title: string; rows: Record<string, string | number | null>[] }) {
  return (
    <ExportButtons
      title={title}
      columns={[
        { key: "date", header: "Date", type: "date" },
        { key: "type", header: "Type" },
        { key: "reference", header: "Reference" },
        { key: "description", header: "Description" },
        { key: "debit", header: "Debit", type: "money" },
        { key: "credit", header: "Credit", type: "money" },
        { key: "balance", header: "Balance", type: "money" },
      ]}
      rows={rows}
    />
  );
}
