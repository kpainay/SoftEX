import { Tabs } from 'expo-router/js-tabs';
import { Platform } from 'react-native';
import { useSession } from '@/lib/session';
import { useShell } from '@/lib/shell';
import { fonts, useTheme } from '@/lib/theme';
import { AppHeader } from '@/ui/header';
import { Icon } from '@/ui/Icon';

const TITLES: Record<string, string> = { index: 'Home', chats: 'Chats', activities: 'Activities', 'my-work': 'My work', more: 'More' };

export default function TabsLayout() {
  const { c } = useTheme();
  const { counts } = useShell();
  const { me } = useSession();
  const tab = (name: string, icon: string, badge?: number) => (
    <Tabs.Screen
      name={name}
      options={{
        title: TITLES[name],
        tabBarIcon: ({ color }) => <Icon name={icon} size={23} color={String(color)} />,
        tabBarBadge: badge ? (badge > 99 ? '99+' : badge) : undefined,
      }}
    />
  );
  return (
    <Tabs
      screenOptions={({ route }) => ({
        header: () => <AppHeader title={route.name === 'index' ? me?.workspace.name ?? 'Home' : TITLES[route.name]} />,
        sceneStyle: { backgroundColor: c.canvas },
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.muted,
        tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 11 },
        tabBarBadgeStyle: { backgroundColor: c.accent, color: c.onAccent, fontFamily: fonts.bold, fontSize: 10 },
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.line, ...(Platform.OS === 'web' ? { height: 62 } : {}) },
      })}
    >
      {tab('index', 'home')}
      {tab('chats', 'chat', counts.chats)}
      {/* Activities sits in the middle: what needs you, front and centre (as on the web). */}
      {tab('activities', 'inbox', counts.inbox)}
      {tab('my-work', 'check', counts.work)}
      {tab('more', 'menu', counts.channels)}
    </Tabs>
  );
}
