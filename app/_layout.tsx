import { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ThemeProvider } from '@/context/ThemeContext';

function LockScreen() {
  const { unlockWithBiometrics, signOut, biometricAvailable } = useAuth();

  async function handleUnlock() {
    const ok = await unlockWithBiometrics();
    if (!ok) {
      // neúspěch – nic neděláme, uživatel zkusí znovu nebo se odhlásí
    }
  }

  return (
    <View style={styles.lockContainer}>
      <View style={styles.lockCard}>
        <View style={styles.lockIcon}>
          <Ionicons name="lock-closed" size={40} color="#1a56db" />
        </View>
        <Text style={styles.lockTitle}>Výroba</Text>
        <Text style={styles.lockSubtitle}>Aplikace je uzamčena</Text>

        {biometricAvailable && (
          <TouchableOpacity style={styles.biometricBtn} onPress={handleUnlock}>
            <Ionicons name="finger-print" size={24} color="#fff" />
            <Text style={styles.biometricBtnText}>Odemknout biometrikou</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.signOutLink} onPress={signOut}>
          <Text style={styles.signOutLinkText}>Odhlásit se</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function RootLayoutNav() {
  const { session, loading, isLocked } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === '(auth)';
    const isDemoIndex = (segments as string[]).length === 0;
    if (!session && !inAuthGroup && !isDemoIndex) {
      router.replace('/(auth)/login');
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [session, loading, segments]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1a56db' }}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  if (session && isLocked) {
    return <LockScreen />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="order/new" options={{
        headerShown: true,
        title: 'Nová zakázka',
        headerBackTitle: 'Zpět',
        headerStyle: { backgroundColor: '#1a56db' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
      }} />
      <Stack.Screen name="order/[id]" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <StatusBar style="light" />
        <RootLayoutNav />
      </AuthProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  lockContainer: {
    flex: 1,
    backgroundColor: '#1a56db',
    justifyContent: 'center',
    padding: 24,
  },
  lockCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 10,
  },
  lockIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#dbeafe',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  lockTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1a56db',
    marginBottom: 4,
  },
  lockSubtitle: {
    fontSize: 15,
    color: '#6b7280',
    marginBottom: 28,
  },
  biometricBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#1a56db',
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 14,
    marginBottom: 16,
    width: '100%',
    justifyContent: 'center',
  },
  biometricBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  signOutLink: {
    paddingVertical: 8,
  },
  signOutLinkText: {
    color: '#6b7280',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
});
