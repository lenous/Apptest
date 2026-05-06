import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';

const BIOMETRIC_ENABLED_KEY = 'biometric_enabled';
const LAST_ACTIVE_KEY = 'last_active_at';
const LOCK_TIMEOUT_MS = 8 * 60 * 60 * 1000; // 8 hodin

type AuthContextType = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  isLocked: boolean;
  biometricAvailable: boolean;
  biometricEnabled: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  unlockWithBiometrics: () => Promise<boolean>;
  setBiometricEnabled: (enabled: boolean) => Promise<void>;
  recordActivity: () => void;
};

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLocked, setIsLocked] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabledState] = useState(false);

  useEffect(() => {
    checkBiometricAvailability();

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      if (session) {
        await fetchProfile(session.user.id);
        await checkLockStatus();
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        fetchProfile(session.user.id);
        if (_event === 'SIGNED_IN') {
          setIsLocked(false);
          recordActivity();
        }
      } else {
        setProfile(null);
        setIsLocked(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function checkBiometricAvailability() {
    try {
      // Dynamicky importujeme expo-local-authentication, aby app nezlomila
      // pokud balíček chybí (před npm install)
      const LocalAuthentication = await import('expo-local-authentication').catch(() => null);
      if (!LocalAuthentication) {
        setBiometricAvailable(false);
        return;
      }
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      const available = hasHardware && isEnrolled;
      setBiometricAvailable(available);

      if (available) {
        const enabled = await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY);
        setBiometricEnabledState(enabled === 'true');
      }
    } catch {
      setBiometricAvailable(false);
    }
  }

  async function checkLockStatus() {
    const enabled = await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY);
    if (enabled !== 'true') return;

    const lastActive = await SecureStore.getItemAsync(LAST_ACTIVE_KEY);
    if (lastActive) {
      const elapsed = Date.now() - parseInt(lastActive, 10);
      if (elapsed > LOCK_TIMEOUT_MS) {
        setIsLocked(true);
        return;
      }
    } else {
      setIsLocked(true);
    }
  }

  async function fetchProfile(userId: string) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (data) setProfile(data);
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) {
      recordActivity();
    }
    return { error: error?.message ?? null };
  }

  async function signOut() {
    await supabase.auth.signOut();
    await SecureStore.deleteItemAsync(LAST_ACTIVE_KEY);
  }

  async function unlockWithBiometrics(): Promise<boolean> {
    try {
      const LocalAuthentication = await import('expo-local-authentication').catch(() => null);
      if (!LocalAuthentication) return false;

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Ověřte svou identitu',
        cancelLabel: 'Zrušit',
        disableDeviceFallback: false,
      });

      if (result.success) {
        setIsLocked(false);
        recordActivity();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  async function setBiometricEnabled(enabled: boolean) {
    await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, enabled ? 'true' : 'false');
    setBiometricEnabledState(enabled);
  }

  function recordActivity() {
    SecureStore.setItemAsync(LAST_ACTIVE_KEY, String(Date.now()));
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        loading,
        isLocked,
        biometricAvailable,
        biometricEnabled,
        signIn,
        signOut,
        unlockWithBiometrics,
        setBiometricEnabled,
        recordActivity,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
