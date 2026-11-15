import type { ReactNode } from "react";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination } from "@/components/shared/table-controls";
import { cn } from "@/lib/utils";
import type { Row } from "@/lib/types";

export interface Column<T extends Row = Row> {
  key: string;
  header: ReactNode;
  cell?: (row: T) => ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
  /** Hide on small screens. */
  hideOnMobile?: boolean;
}

interface Props<T extends Row> {
  columns: Column<T>[];
  rows: T[];
  total?: number;
  page?: number;
  pageSize?: number;
  empty?: ReactNode;
  footer?: ReactNode;
  rowKey?: (row: T) => string;
  dense?: boolean;
}

/** Server-rendered table with optional URL-driven pagination. */
export function DataTable<T extends Row>({ columns, rows, total, page = 1, pageSize = 25, empty, footer, rowKey, dense }: Props<T>) {
  const alignClass = (a?: string) => (a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left");
  return (
    <div className="overflow-hidden rounded-2xl glass">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-white/60 bg-white/40 hover:bg-white/40">
              {columns.map((c) => (
                <TableHead
                  key={c.key}
                  className={cn("h-11 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase", alignClass(c.align), c.hideOnMobile && "hidden md:table-cell", c.className)}
                >
                  {c.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length} className="p-0">
                  {empty ?? <EmptyState />}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r, i) => (
                <TableRow key={rowKey ? rowKey(r) : (r.id as string) ?? i} className="border-white/50 transition-colors hover:bg-white/55">
                  {columns.map((c) => (
                    <TableCell
                      key={c.key}
                      className={cn(dense ? "py-1.5" : "py-2.5", "tabular", alignClass(c.align), c.hideOnMobile && "hidden md:table-cell", c.className)}
                    >
                      {c.cell ? c.cell(r) : (r[c.key] as ReactNode) ?? "—"}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
          {footer && rows.length > 0 ? <TableFooter>{footer}</TableFooter> : null}
        </Table>
      </div>
      {total !== undefined && total > pageSize ? <Pagination total={total} page={page} pageSize={pageSize} /> : null}
    </div>
  );
}
