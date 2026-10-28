import { Redirect, useLocalSearchParams } from 'expo-router';

/** Inbox is now Activities. Links in emails, pushes and older notifications still say /inbox. */
export default function InboxRedirect() {
  const params = useLocalSearchParams<Record<string, string>>();
  return <Redirect href={{ pathname: '/activities', params }} />;
}
