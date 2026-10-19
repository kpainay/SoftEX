import { Bar, BarChart as RBarChart, CartesianGrid, Cell, LabelList, Line, LineChart as RLineChart, Pie, PieChart, XAxis, YAxis } from 'recharts';
import { LABEL_COLORS } from '../api';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { cn } from '@/lib/utils';

/**
 * Dashboard charts on shadcn/ui charts (Recharts). Colours come from the theme's chart and status
 * tokens, so they follow light and dark mode; every chart carries visible values or a legend with
 * values, plus a text alternative for screen readers.
 */

export interface SeriesItem {
  key: string;
  label: string;
  value: number;
  color?: string;
}

/** Status words keep their meaning across every chart (and match the pills). */
const NAMED: Record<string, string> = {
  todo: 'var(--muted-foreground)',
  in_progress: 'var(--info)',
  blocked: 'var(--destructive)',
  review: 'var(--warning)',
  done: 'var(--success)',
  urgent: 'var(--destructive)',
  high: 'var(--warning)',
  medium: 'var(--chart-4)',
  low: 'var(--chart-2)',
  on_track: 'var(--success)',
  at_risk: 'var(--warning)',
  off_track: 'var(--destructive)',
};
const PALETTE = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];

/** A fill for a series item: its own label colour, a known status, or the chart palette in fixed order. */
export function colorFor(item: { key: string; color?: string }, index: number) {
  if (item.color && (LABEL_COLORS as string[]).includes(item.color)) return `var(--c-${item.color})`;
  if (NAMED[item.key]) return NAMED[item.key];
  if (item.key === '' || item.key === 'none') return 'var(--border)';
  return PALETTE[index % PALETTE.length];
}

const fmt = (n: number) => (Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 1 }));

function configFor(items: SeriesItem[]): ChartConfig {
  return Object.fromEntries(items.map((item, i) => [item.key || `none-${i}`, { label: item.label, color: colorFor(item, i) }]));
}

/** Horizontal bars with labels: easy to read on a phone and with long names. Click a value to drill in. */
export function BarChart({ items, unit, onSelect }: { items: SeriesItem[]; unit?: string; onSelect?: (item: SeriesItem) => void }) {
  const data = items.map((item, i) => ({ ...item, id: item.key || `none-${i}`, fill: colorFor(item, i) }));
  return (
    <div className="bar-chart" aria-label={`Bar chart: ${items.map((i) => `${i.label} ${fmt(i.value)}`).join(', ')}`} role="img">
      <ChartContainer config={configFor(items)} className="aspect-auto w-full" style={{ height: Math.max(80, items.length * 34 + 8) }}>
        <RBarChart data={data} layout="vertical" margin={{ left: 0, right: 48, top: 4, bottom: 4 }} barCategoryGap={6}>
          <YAxis dataKey="label" type="category" tickLine={false} axisLine={false} width={110} tickMargin={6} tickFormatter={(v: string) => (v.length > 16 ? `${v.slice(0, 15)}…` : v)} />
          <XAxis type="number" hide domain={[0, 'dataMax']} />
          <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel nameKey="id" />} />
          <Bar
            dataKey="value"
            radius={4}
            minPointSize={2}
            className={cn(onSelect && 'cursor-pointer')}
            onClick={onSelect ? (d: { payload?: SeriesItem }) => d.payload && onSelect(items.find((i) => i.key === d.payload!.key) ?? d.payload) : undefined}
          >
            {data.map((d) => (
              <Cell key={d.id} fill={d.fill} />
            ))}
            <LabelList dataKey="value" position="right" offset={8} className="fill-foreground font-medium" formatter={(v: unknown) => `${fmt(Number(v))}${unit ? ` ${unit}` : ''}`} />
          </Bar>
        </RBarChart>
      </ChartContainer>
    </div>
  );
}

/** A donut with a legend; the centre shows the total. */
export function DonutChart({ items, label = 'total' }: { items: SeriesItem[]; label?: string }) {
  const total = items.reduce((s, i) => s + i.value, 0);
  const data = items.map((item, i) => ({ ...item, id: item.key || `none-${i}`, fill: colorFor(item, i) }));
  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="relative size-40 shrink-0" role="img" aria-label={items.map((i) => `${i.label}: ${i.value}`).join(', ')}>
        <ChartContainer config={configFor(items)} className="aspect-square size-40">
          <PieChart>
            <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel nameKey="id" />} />
            <Pie data={total ? data : [{ id: 'empty', value: 1, fill: 'var(--muted)' }]} dataKey="value" nameKey="id" innerRadius={50} outerRadius={72} paddingAngle={total ? 2 : 0} stroke="var(--card)" strokeWidth={2}>
              {(total ? data : [{ id: 'empty', fill: 'var(--muted)' }]).map((d) => (
                <Cell key={d.id} fill={d.fill} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold tabular-nums">{fmt(total)}</span>
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
      </div>
      <ul className="flex min-w-40 flex-1 flex-col gap-1.5 text-sm">
        {data.map((item) => (
          <li key={item.id} className="flex items-center gap-2">
            <i className="size-2.5 shrink-0 rounded-[3px]" style={{ background: item.fill }} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            <strong className="tabular-nums">{fmt(item.value)}</strong>
            {total > 0 && <span className="w-9 text-right text-xs text-muted-foreground tabular-nums">{Math.round((item.value / total) * 100)}%</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

const shortDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
const LINE_COLORS = ['var(--chart-1)', 'var(--chart-3)', 'var(--chart-2)', 'var(--chart-4)'];

/** Lines over weeks, with a crosshair tooltip and each series' total in the legend. */
export function LineChart({ labels, series }: { labels: string[]; series: { key: string; label: string; values: number[] }[] }) {
  const config: ChartConfig = Object.fromEntries(series.map((s, i) => [s.key, { label: s.label, color: LINE_COLORS[i % LINE_COLORS.length] }]));
  const data = labels.map((week, i) => ({ week, ...Object.fromEntries(series.map((s) => [s.key, s.values[i] ?? 0])) }));
  return (
    <div className="line-chart flex flex-col gap-2">
      <div role="img" aria-label={series.map((s) => `${s.label}: ${s.values.join(', ')}`).join('; ')}>
        <ChartContainer config={config} className="aspect-auto h-48 w-full">
          <RLineChart data={data} margin={{ left: -16, right: 8, top: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="week" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} tickFormatter={shortDate} />
            <YAxis tickLine={false} axisLine={false} allowDecimals={false} tickMargin={4} />
            <ChartTooltip content={<ChartTooltipContent labelFormatter={(v) => `Week of ${shortDate(String(v))}`} />} />
            {series.map((s) => (
              <Line key={s.key} dataKey={s.key} type="monotone" stroke={`var(--color-${s.key})`} strokeWidth={2} dot={{ r: 3, fill: `var(--color-${s.key})`, strokeWidth: 0 }} activeDot={{ r: 5 }} />
            ))}
          </RLineChart>
        </ChartContainer>
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {series.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            <i className="size-2.5 rounded-[3px]" style={{ background: config[s.key]?.color }} aria-hidden="true" />
            <span>{s.label}</span>
            <strong className="tabular-nums">{s.values.reduce((a, b) => a + b, 0)}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}
