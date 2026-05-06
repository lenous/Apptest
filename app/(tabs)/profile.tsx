import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Switch, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';

const ROLE_LABELS: Record<string, string> = {
  operator: 'Operátor',
  tpv: 'TPV',
  dispatcher: 'Mistr / vedoucí výroby',
  management: 'Vedení',
  admin: 'Administrátor',
};

const QUALIFICATION_LABELS: Record<string, string> = {
  sklad: 'Sklad',
  automat: 'Automat',
  aoi: 'AOI kontrola',
  rtg: 'RTG',
  oprava_aoi: 'Oprava po AOI',
  osazovani: 'Osazování',
  pajeni_vlna: 'Pájení – vlna',
  pajeni_selektivni: 'Pájení – selektivní',
  pajeni_rucni: 'Pájení – ruční',
  oprava_pajeni: 'Oprava po pájení',
  programovani: 'Programování',
  lakovani: 'Lakování',
  vystupni_kontrola: 'Výstupní kontrola',
  baleni: 'Balení',
};

export default function ProfileScreen() {
  const { user, profile, signOut, biometricAvailable, biometricEnabled, setBiometricEnabled } = useAuth();
  const { isDark, toggleTheme, colors } = useTheme();

  const canDarkMode = profile?.role === 'management' || profile?.role === 'admin';

  function handleSignOut() {
    Alert.alert('Odhlásit se', 'Opravdu se chcete odhlásit?', [
      { text: 'Zrušit', style: 'cancel' },
      { text: 'Odhlásit', style: 'destructive', onPress: signOut },
    ]);
  }

  async function handleBiometricToggle(value: boolean) {
    await setBiometricEnabled(value);
  }

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scroll: { padding: 20 },
    avatarCard: {
      backgroundColor: colors.card, borderRadius: 16, padding: 24,
      alignItems: 'center', marginBottom: 16,
      shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08, shadowRadius: 6, elevation: 3,
    },
    avatar: {
      width: 72, height: 72, borderRadius: 36,
      backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center',
      marginBottom: 12,
    },
    avatarText: { fontSize: 28, fontWeight: '700', color: '#fff' },
    name: { fontSize: 20, fontWeight: '700', color: colors.text },
    email: { fontSize: 14, color: colors.textSecondary, marginTop: 4 },
    roleBadge: {
      marginTop: 10, backgroundColor: colors.primary + '20',
      borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4,
    },
    roleText: { fontSize: 13, color: colors.primary, fontWeight: '600' },
    section: {
      backgroundColor: colors.card, borderRadius: 14, marginBottom: 14,
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06, shadowRadius: 4, elevation: 2, overflow: 'hidden',
    },
    sectionTitle: {
      fontSize: 11, fontWeight: '700', color: colors.textSecondary,
      textTransform: 'uppercase', letterSpacing: 0.8,
      paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4,
    },
    settingRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingVertical: 14,
      borderTopWidth: 1, borderTopColor: colors.border,
    },
    settingLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
    settingLabel: { fontSize: 15, color: colors.text, fontWeight: '500' },
    settingDesc: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
    qualsTitle: {
      fontSize: 11, fontWeight: '700', color: colors.textSecondary,
      textTransform: 'uppercase', letterSpacing: 0.8,
      paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8,
    },
    qualsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 16, paddingBottom: 14 },
    qualChip: {
      paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10,
      backgroundColor: colors.primary + '20',
    },
    qualTxt: { fontSize: 12, color: colors.primary, fontWeight: '500' },
    noQuals: { fontSize: 13, color: colors.textSecondary, paddingHorizontal: 16, paddingBottom: 14 },
    signOutBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      backgroundColor: colors.card, borderRadius: 12, padding: 14,
      gap: 8, borderWidth: 1, borderColor: '#fecaca', marginTop: 4,
    },
    signOutText: { fontSize: 15, color: '#ef4444', fontWeight: '600' },
  });

  const quals = profile?.qualifications ?? [];

  return (
    <ScrollView style={s.container} contentContainerStyle={s.scroll}>
      {/* Avatar karta */}
      <View style={s.avatarCard}>
        <View style={s.avatar}>
          <Text style={s.avatarText}>
            {profile?.full_name?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? '?'}
          </Text>
        </View>
        <Text style={s.name}>{profile?.full_name ?? 'Uživatel'}</Text>
        <Text style={s.email}>{user?.email}</Text>
        <View style={s.roleBadge}>
          <Text style={s.roleText}>{ROLE_LABELS[profile?.role ?? 'operator']}</Text>
        </View>
      </View>

      {/* Kvalifikace (jen operátoři) */}
      {profile?.role === 'operator' && (
        <View style={s.section}>
          <Text style={s.qualsTitle}>Mé kvalifikace</Text>
          {quals.length > 0 ? (
            <View style={s.qualsGrid}>
              {quals.map((q) => (
                <View key={q} style={s.qualChip}>
                  <Text style={s.qualTxt}>{QUALIFICATION_LABELS[q] ?? q}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={s.noQuals}>Žádné kvalifikace – kontaktujte admina</Text>
          )}
        </View>
      )}

      {/* Nastavení */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>Nastavení</Text>

        {/* Biometrický unlock */}
        {biometricAvailable && (
          <View style={s.settingRow}>
            <View style={s.settingLeft}>
              <Ionicons name="finger-print" size={22} color={colors.primary} />
              <View>
                <Text style={s.settingLabel}>Face ID / Touch ID</Text>
                <Text style={s.settingDesc}>Odemknout aplikaci biometrikou</Text>
              </View>
            </View>
            <Switch
              value={biometricEnabled}
              onValueChange={handleBiometricToggle}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#fff"
            />
          </View>
        )}

        {/* Dark mode – jen management a admin */}
        {canDarkMode && (
          <View style={s.settingRow}>
            <View style={s.settingLeft}>
              <Ionicons name={isDark ? 'moon' : 'sunny-outline'} size={22} color={colors.primary} />
              <View>
                <Text style={s.settingLabel}>Tmavý režim</Text>
                <Text style={s.settingDesc}>{isDark ? 'Zapnutý' : 'Vypnutý'}</Text>
              </View>
            </View>
            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#fff"
            />
          </View>
        )}
      </View>

      {/* Odhlásit */}
      <TouchableOpacity style={s.signOutBtn} onPress={handleSignOut}>
        <Ionicons name="log-out-outline" size={20} color="#ef4444" />
        <Text style={s.signOutText}>Odhlásit se</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
