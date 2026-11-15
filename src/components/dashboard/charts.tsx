"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const C = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "oklch(0.7 0.1 200)", "oklch(0.65 0.12 120)"];

const shortDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
const compact = (n: number) => (Math.abs(n) >= 100000 ? `${(n / 100000).toFixed(1)}L` : Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(0)}k` : String(n));

function ChartTooltip({ active, payload, label, money }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string; money?: boolean }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl glass-strong px-3 py-2 text-xs">
      {label ? <p className="mb-1 font-medium">{/^\d{4}-/.test(label) ? shortDate(label) : label}</p> : null}
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2">
          <span className="size-2 rounded-full" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}</span>
          <span className="tabular ml-auto font-medium">{money ? `Rs ${Number(p.value).toLocaleString()}` : Number(p.value).toLocaleString()}</span>
        </p>
      ))}
    </div>
  );
}

const axis = { tick: { fontSize: 11, fill: "var(--muted-foreground)" }, tickLine: false, axisLine: false } as const;

export function ProductionChart({ data }: { data: { date: string; total: number; saleable: number; broken: number; rate: number | null }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <defs>
          <linearGradient id="gProd" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={24} {...axis} />
        <YAxis tickFormatter={compact} {...axis} />
        <Tooltip content={<ChartTooltip />} />
        <Area type="monotone" dataKey="saleable" name="Saleable" stroke="var(--chart-1)" strokeWidth={2} fill="url(#gProd)" />
        <Area type="monotone" dataKey="broken" name="Broken / rejected" stroke="var(--chart-4)" strokeWidth={1.5} fill="transparent" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function RateChart({ data }: { data: { date: string; rate: number | null }[] }) {
  return (
    <ResponsiveContainer width="100%" height={120}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -28, bottom: 0 }}>
        <XAxis dataKey="date" hide />
        <YAxis domain={["dataMin - 3", "dataMax + 3"]} {...axis} tickFormatter={(v) => `${Math.round(v)}%`} />
        <Tooltip content={<ChartTooltip />} />
        <Line type="monotone" dataKey="rate" name="Production %" stroke="var(--chart-2)" strokeWidth={2} dot={false} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function SalesChart({ data, showRevenue }: { data: { date: string; revenue: number | null; eggs: number }[]; showRevenue: boolean }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={24} {...axis} />
        <YAxis tickFormatter={compact} {...axis} />
        <Tooltip content={<ChartTooltip money={showRevenue} />} cursor={{ fill: "var(--muted)" }} />
        {showRevenue ? (
          <Bar dataKey="revenue" name="Revenue" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={22} />
        ) : (
          <Bar dataKey="eggs" name="Eggs sold" fill="var(--chart-2)" radius={[4, 4, 0, 0]} maxBarSize={22} />
        )}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ExpenseChart({ data }: { data: { category: string; amount: number }[] }) {
  if (!data.length) return <p className="py-16 text-center text-sm text-muted-foreground">No expenses in this period</p>;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie data={data} dataKey="amount" nameKey="category" innerRadius={58} outerRadius={92} paddingAngle={2} stroke="var(--card)">
          {data.map((_, i) => (
            <Cell key={i} fill={C[i % C.length]} />
          ))}
        </Pie>
        <Tooltip content={<ChartTooltip money />} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
