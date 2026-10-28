import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { useEffect, useRef, useState } from 'react';
import { AppState, Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, T } from '../ui/kit';
import { useTheme } from './theme';

/**
 * Over-the-air updates (EAS Update). Store builds download new JavaScript and assets
 * from their channel without a store release: on launch, and when the app comes back
 * to the front. A downloaded update is used on the next launch, or straight away when
 * the person taps Restart. Updates only reach builds with the same native runtime
 * (the fingerprint in app.json), so a change to native code still needs a new build.
 */

/** Development and the web preview don't use EAS Update. */
const enabled = Platform.OS !== 'web' && !__DEV__ && Updates.isEnabled;
const CHECK_EVERY_MS = 15 * 60 * 1000;

/** Look for a newer update and download it. Resolves true when one is ready to use. */
export async function fetchLatestUpdate() {
  if (!enabled) return false;
  const check = await Updates.checkForUpdateAsync();
  if (!check.isAvailable) return false;
  const result = await Updates.fetchUpdateAsync();
  return result.isNew;
}

export const restartWithUpdate = () => Updates.reloadAsync();

/** "1.0.0 · preview · update 3f2a91c" for Help and Settings. */
export function versionLabel() {
  const parts = [Constants.expoConfig?.version ?? '1.0.0'];
  if (Updates.channel) parts.push(Updates.channel);
  if (enabled && !Updates.isEmbeddedLaunch && Updates.updateId) parts.push(`update ${Updates.updateId.slice(0, 7)}`);
  else if (enabled) parts.push('built-in');
  return parts.join(' · ');
}

export const updatesEnabled = enabled;

/** Checks when the app returns to the front, and offers a restart once an update is downloaded. */
export function UpdateBanner() {
  if (!enabled) return null;
  return <Banner />;
}

function Banner() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { isUpdatePending } = Updates.useUpdates();
  const [dismissed, setDismissed] = useState(false);
  const lastCheck = useRef(Date.now());

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || Date.now() - lastCheck.current < CHECK_EVERY_MS) return;
      lastCheck.current = Date.now();
      fetchLatestUpdate().catch(() => {});
    });
    return () => sub.remove();
  }, []);

  if (!isUpdatePending || dismissed) return null;
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        position: 'absolute',
        left: 12,
        right: 12,
        bottom: insets.bottom + 70,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: c.nav,
        borderRadius: 14,
        paddingLeft: 16,
        paddingRight: 8,
        paddingVertical: 8,
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowRadius: 12,
        elevation: 4,
      }}
    >
      <T size={14} weight="semibold" style={{ color: c.navText, flex: 1 }}>
        A new version of Küü is ready.
      </T>
      <Button title="Later" variant="ghost" small onPress={() => setDismissed(true)} style={{ borderColor: 'transparent' }} />
      <Button title="Restart" variant="primary" small onPress={restartWithUpdate} />
    </View>
  );
}
