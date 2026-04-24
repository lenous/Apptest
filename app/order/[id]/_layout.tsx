import { Stack } from 'expo-router';

const headerStyle = {
  headerStyle: { backgroundColor: '#1a56db' },
  headerTintColor: '#fff' as const,
  headerTitleStyle: { fontWeight: '700' as const },
  headerBackTitle: 'Zpět',
};

export default function OrderLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Zakázka', ...headerStyle }} />
      <Stack.Screen name="upload" options={{ title: 'Nahrát dokument', ...headerStyle }} />
      <Stack.Screen name="note" options={{ title: 'Nová poznámka', ...headerStyle }} />
      <Stack.Screen name="document/[docId]" options={{ title: 'Dokument', ...headerStyle }} />
      <Stack.Screen name="station/[stationId]" options={{ title: 'Stanoviště', ...headerStyle }} />
    </Stack>
  );
}
