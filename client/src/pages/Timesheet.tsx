import { useEffect, useState } from 'react';
import { api, type TimeEntry } from '../api';
import { Icon } from '../components/Icon';
import { useShell } from '../components/Layout';
import { UpgradeNotice, usePlan } from '../components/Plan';
import { useElapsed } from '../components/Work';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, XAxis } from 'recharts';
import { EmptyState, ErrorState, IconButton, Loading, Page, PageHeader, useAction } from '@/components/kit';
import { Alert, AlertAction, AlertTitle } from '@/components/ui/alert';
import { ButtonGroup, ButtonGroupText } from '@/components/ui/button-group';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { duration } from '../format';
import { useApi } from '../hooks';
import { Button } from '@/components/ui/button';

interface Week {
  week: string;
  entries: (TimeEntry & { project_id: string | null })[];
  days: { date: string; minutes: number }[];
  total_minutes: number;
  running: TimeEntry | null;
}

const shift = (week: string, days: number) => {
  const d = new Date(`${week}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** My timesheet: the week's logged time, day by day (Harvest/ClickUp style). */
export function Timesheet() {
  const plan = usePlan();
  const act = useAction();
  const { openTask } = useShell();
  const [week, setWeek] = useState<string | undefined>(undefined);
  const { data, error, reload } = useApi<Week>(`/time/me${week ? `?week=${week}` : ''}`);
  const elapsed = useElapsed(data?.running?.started_at);
  useEffect(() => {
    window.addEventListener('kuu:time', reload);
    return () => window.removeEventListener('kuu:time', reload);
  }, [reload]);
  if (error) return <ErrorState error={error} retry={reload} />;
  if (!data) return <Loading />;
  // Without the feature, time logged earlier stays readable; logging more needs the plan.
  if (!plan.has('fields') && !data.days.some((d) => d.minutes > 0)) {
    return (
      <Page>
        <PageHeader title="Timesheet" />
        <UpgradeNotice feature="fields" />
      </Page>
    );
  }
  const today = new Date().toISOString().slice(0, 10);
  const chart = data.days.map((d) => ({
    day: new Date(`${d.date}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' }),
    hours: Math.round((d.minutes / 60) * 100) / 100,
    minutes: d.minutes,
    today: d.date === today,
  }));
  const config = { hours: { label: 'Hours', color: 'var(--chart-1)' } } satisfies ChartConfig;

  return (
    <Page>
      <PageHeader
        title="Timesheet"
        description="Time you’ve logged on tasks. Start a timer or log time from any task."
        actions={
          <>
            <ButtonGroup>
              <IconButton label="Previous week" variant="outline" onClick={() => setWeek(shift(data.week, -7))}>
                <Icon name="chevronLeft" />
              </IconButton>
              <ButtonGroupText className="bg-card">
                Week of {new Date(`${data.week}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })}
              </ButtonGroupText>
              <IconButton label="Next week" variant="outline" onClick={() => setWeek(shift(data.week, 7))}>
                <Icon name="chevronRight" />
              </IconButton>
            </ButtonGroup>
            {week && (
              <Button variant="outline" onClick={() => setWeek(undefined)}>
                This week
              </Button>
            )}
          </>
        }
      />
      {!plan.has('fields') && <UpgradeNotice feature="fields" compact readOnly />}

      {data.running && (
        <Alert className="border-destructive/30">
          <span className="mt-1.5 size-2 animate-pulse rounded-full bg-destructive" aria-hidden="true" />
          <AlertTitle className="flex flex-wrap items-center gap-2">
            <span className="tabular-nums">{elapsed}</span>
            <Button variant="link" size="inline" className="min-w-0 justify-start truncate" onClick={() => openTask(data.running!.task_id)}>
              {data.running.task_title}
            </Button>
          </AlertTitle>
          <AlertAction>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await act(() => api.post('/time/stop'));
                reload();
              }}
            >
              Stop
            </Button>
          </AlertAction>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-col gap-1">
            <span className="text-sm font-normal text-muted-foreground">Total this week: </span>
            <span className="font-heading text-3xl font-semibold tabular-nums">{duration(data.total_minutes)}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={config} className="aspect-auto h-48 w-full" role="img" aria-label={data.days.map((d) => `${d.date}: ${duration(d.minutes)}`).join(', ')}>
            <BarChart data={chart} margin={{ top: 20, left: 0, right: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} />
              <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel formatter={(_v, _n, item) => duration((item.payload as { minutes: number }).minutes)} />} />
              <Bar dataKey="hours" radius={4}>
                {chart.map((d) => (
                  <Cell key={d.day} fill={d.today ? 'var(--color-hours)' : 'color-mix(in oklab, var(--color-hours) 55%, transparent)'} />
                ))}
                <LabelList dataKey="minutes" position="top" className="fill-muted-foreground" fontSize={11} formatter={(v: unknown) => (Number(v) ? duration(Number(v)) : '')} />
              </Bar>
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card className="py-0">
        {!data.entries.length ? (
          <EmptyState icon="clock" title="No time logged this week" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Day</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Task</TableHead>
                <TableHead>Note</TableHead>
                <TableHead className="w-10">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.entries
                .slice()
                .reverse()
                .map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-muted-foreground">{new Date(e.started_at).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })}</TableCell>
                    <TableCell className="font-medium tabular-nums">{e.running ? elapsed : duration(e.minutes)}</TableCell>
                    <TableCell className="max-w-64">
                      <Button variant="link" size="inline" className="max-w-full justify-start truncate text-foreground" onClick={() => openTask(e.task_id)}>
                        {e.task_title}
                      </Button>
                    </TableCell>
                    <TableCell className="max-w-64 truncate text-muted-foreground">{e.note}</TableCell>
                    <TableCell>
                      {!e.running && (
                        <IconButton
                          label="Remove time entry"
                          size="icon-xs"
                          onClick={async () => {
                            await act(() => api.del(`/time/${e.id}`));
                            reload();
                          }}
                        >
                          <Icon name="x" />
                        </IconButton>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </Page>
  );
}
