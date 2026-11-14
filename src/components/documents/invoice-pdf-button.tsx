"use client";

import { FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface InvoicePdfData {
  title: string;
  number: string;
  date: string;
  status: string;
  company: { name: string; address?: string | null; phone?: string | null; email?: string | null; ntn?: string | null };
  party: { label: string; name: string; business?: string | null; phone?: string | null; address?: string | null };
  lines: { description: string; qty: string; eggs: number; price: number; amount: number }[];
  totals: [string, number][];
  footer?: string | null;
}

const money = (n: number) => `Rs ${Number(n).toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Generates a branded A4 PDF invoice in the browser. */
export function InvoicePdfButton({ data }: { data: InvoicePdfData }) {
  const generate = async () => {
    const { jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const W = doc.internal.pageSize.getWidth();
    const emerald: [number, number, number] = [16, 150, 110];
    const navy: [number, number, number] = [22, 30, 58];

    doc.setFillColor(...navy);
    doc.rect(0, 0, W, 92, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold").setFontSize(20).text(data.company.name, 40, 44);
    doc.setFont("helvetica", "normal").setFontSize(9);
    doc.text([data.company.address, [data.company.phone, data.company.email].filter(Boolean).join("  ·  "), data.company.ntn ? `NTN ${data.company.ntn}` : ""].filter(Boolean) as string[], 40, 60);
    doc.setFont("helvetica", "bold").setFontSize(16).text(data.title.toUpperCase(), W - 40, 44, { align: "right" });
    doc.setFont("helvetica", "normal").setFontSize(10).text([`No. ${data.number}`, `Date ${data.date}`, data.status], W - 40, 60, { align: "right" });

    doc.setTextColor(...navy);
    doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(...emerald).text(data.party.label.toUpperCase(), 40, 124);
    doc.setTextColor(...navy).setFontSize(12).text(data.party.name, 40, 140);
    doc.setFont("helvetica", "normal").setFontSize(9);
    doc.text([data.party.business, data.party.phone, data.party.address].filter(Boolean) as string[], 40, 154);

    autoTable(doc, {
      startY: 196,
      head: [["#", "Description", "Qty", "Eggs", "Rate", "Amount"]],
      body: data.lines.map((l, i) => [String(i + 1), l.description, l.qty, l.eggs.toLocaleString(), money(l.price), money(l.amount)]),
      styles: { fontSize: 9, cellPadding: 6 },
      headStyles: { fillColor: emerald, textColor: 255 },
      columnStyles: { 0: { cellWidth: 24 }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" } },
      margin: { left: 40, right: 40 },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let y = ((doc as any).lastAutoTable?.finalY ?? 220) + 16;
    for (const [label, value] of data.totals) {
      const bold = label === "Total" || label === "Balance due";
      doc.setFont("helvetica", bold ? "bold" : "normal").setFontSize(bold ? 11 : 9.5);
      doc.text(label, W - 200, y);
      doc.text(money(value), W - 40, y, { align: "right" });
      y += bold ? 18 : 15;
    }
    if (data.footer) {
      doc.setFont("helvetica", "italic").setFontSize(9).setTextColor(110, 110, 110).text(data.footer, W / 2, doc.internal.pageSize.getHeight() - 40, { align: "center" });
    }
    doc.save(`${data.number}.pdf`);
  };
  return (
    <Button variant="outline" onClick={generate}>
      <FileDown /> PDF
    </Button>
  );
}
