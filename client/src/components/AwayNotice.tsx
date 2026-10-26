import { awayDay, isAway, type AwayFields } from '../away';
import { Callout } from '@/components/kit';

/** "Maya is out of office until Fri, Nov 20", with their note. Shows nothing when they're around. */
export function AwayNotice({ person, className }: { person: AwayFields & { name: string }; className?: string }) {
  if (!isAway(person)) return null;
  const first = person.name.split(' ')[0];
  return (
    <Callout tone="info" className={className} title={`${first} is out of office until ${awayDay(person.ooo_until!)}`}>
      {person.ooo_message?.trim() && <p className="whitespace-pre-line">{person.ooo_message.trim()}</p>}
    </Callout>
  );
}
