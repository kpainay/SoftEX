import { View } from 'react-native';
import { awayDay, isAway, type AwayFields } from '../lib/away';
import { useTheme } from '../lib/theme';
import { Icon } from './Icon';
import { T } from './kit';

/** "Maya is out of office until Fri, Nov 20", with their note. Shows nothing when they're around. */
export function AwayNotice({ person }: { person: AwayFields & { name: string } }) {
  const { c } = useTheme();
  if (!isAway(person)) return null;
  return (
    <View style={{ flexDirection: 'row', gap: 8, padding: 10, borderRadius: 12, backgroundColor: c.blueSoft, borderWidth: 1, borderColor: c.blueLine }} accessibilityLiveRegion="polite">
      <Icon name="away" size={16} color={c.blueInk} />
      <View style={{ flex: 1, gap: 2 }}>
        <T size={13} weight="bold" style={{ color: c.blueInk }}>
          {person.name.split(' ')[0]} is out of office until {awayDay(person.ooo_until!)}
        </T>
        {!!person.ooo_message?.trim() && <T size={13}>{person.ooo_message.trim()}</T>}
      </View>
    </View>
  );
}
