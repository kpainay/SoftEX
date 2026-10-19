import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { HealthPill } from '@/components/kit';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { AvatarStack } from './Avatar';
import { Icon } from './Icon';

/** A project's colour tile with its folder icon. */
export function ProjectIcon({ color, size = 'md' }: { color: string; size?: 'sm' | 'md' }) {
  return (
    <span
      className={size === 'sm' ? 'flex size-6 shrink-0 items-center justify-center rounded-md text-white' : 'flex size-9 shrink-0 items-center justify-center rounded-xl text-white'}
      style={{ background: `var(--c-${color})` }}
      aria-hidden="true"
    >
      <Icon name="folder" size={size === 'sm' ? 13 : 17} />
    </span>
  );
}

/** A project at a glance: name, progress, people and health. Links to the project. */
export function ProjectCard({
  project,
  description,
  badges,
  progressLabel = 'Progress',
  children,
}: {
  project: { id: string; name: string; color: string; health: string; progress: number; members: { id: string; name: string; color: string }[]; member_count: number };
  description?: ReactNode;
  badges?: ReactNode;
  progressLabel?: ReactNode;
  /** Extra lines under the progress bar (overdue, blocked…). */
  children?: ReactNode;
}) {
  return (
    <Link to={`/projects/${project.id}`} className="group/project rounded-[min(var(--radius-4xl),24px)] outline-none focus-visible:ring-3 focus-visible:ring-ring/40">
      <Card size="sm" className="h-full transition-shadow group-hover/project:shadow-md">
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <ProjectIcon color={project.color} />
            {badges}
          </div>
          <CardTitle className="truncate pt-1">{project.name}</CardTitle>
          <CardDescription className="line-clamp-2 text-xs">
            {description ?? `${project.member_count} member${project.member_count === 1 ? '' : 's'}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{progressLabel}</span>
            <strong className="tabular-nums">{project.progress}%</strong>
          </div>
          <Progress value={project.progress} aria-label={`${project.name} progress`} />
          {children}
        </CardContent>
        <CardFooter className="mt-auto justify-between">
          <AvatarStack users={project.members} total={project.member_count} />
          <HealthPill health={project.health} />
        </CardFooter>
      </Card>
    </Link>
  );
}
