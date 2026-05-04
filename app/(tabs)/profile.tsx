import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { ROLE_CONFIG, STATIONS } from '@/constants/stations';
import type { Role } from '@/lib/types';

const ROLES: Role[] = ['operator', 'tpv', 'dispatcher', 'management', 'admin'];

export default function ProfileScreen() {
  const { user, profile, signOut, switchPreviewRole } = useAuth();
  const role = profile?.role ?? 'operator';
  const roleCfg = ROLE_CONFIG[role];
  const station = STATIONS.find((s) => s.id === profile?.default_station);

  function handleSignOut() {
    Alert.alert('Odhlásit se', 'Opravdu se chcete odhlásit?', [
      { text: 'Zrušit', style: 'cancel' },
      { text: 'Odhlásit', style: 'destructive', onPress: signOut },
    ]);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {profile?.full_name?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? '?'}
          </Text>
        </View>
        <Text style={styles.name}>{profile?.full_name ?? 'Uživatel'}</Text>
        <Text style={styles.email}>{user?.email}</Text>
        <View style={[styles.roleBadge, { backgroundColor: roleCfg.bg }]}>
          <Text style={[styles.roleText, { color: roleCfg.color }]}>{roleCfg.label}</Text>
        </View>
        {station && <Text style={styles.stationText}>Výchozí pracoviště: {station.id}. {station.name}</Text>}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Testovací role prototypu</Text>
        <View style={styles.roleGrid}>
          {ROLES.map((r) => {
            const cfg = ROLE_CONFIG[r];
            const selected = role === r;
            return (
              <TouchableOpacity
                key={r}
                style={[styles.roleChip, selected && { backgroundColor: cfg.color, borderColor: cfg.color }]}
                onPress={() => switchPreviewRole(r)}
              >
                <Text style={[styles.roleChipText, selected && styles.roleChipTextSelected]}>{cfg.shortLabel}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.hintText}>Přepínač slouží pro ověření návrhu. V ostrém provozu role nastavuje Admin u uživatele.</Text>
      </View>

      <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
        <Ionicons name="log-out-outline" size={20} color="#ef4444" />
        <Text style={styles.signOutText}>Odhlásit se</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  content: { padding: 20 },
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 24,
    alignItems: 'center', marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 6, elevation: 3,
  },
  avatar: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#1a56db', justifyContent: 'center', alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: { fontSize: 28, fontWeight: '700', color: '#fff' },
  name: { fontSize: 20, fontWeight: '700', color: '#111827' },
  email: { fontSize: 14, color: '#6b7280', marginTop: 4 },
  stationText: { fontSize: 12, color: '#6b7280', marginTop: 8 },
  roleBadge: {
    marginTop: 10,
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4,
  },
  roleText: { fontSize: 13, fontWeight: '600' },
  section: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 16 },
  sectionTitle: { fontSize: 13, color: '#6b7280', fontWeight: '700', textTransform: 'uppercase', marginBottom: 10 },
  roleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  roleChip: {
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 18,
    paddingHorizontal: 12, paddingVertical: 7, backgroundColor: '#fff',
  },
  roleChipText: { fontSize: 13, color: '#374151', fontWeight: '600' },
  roleChipTextSelected: { color: '#fff' },
  hintText: { fontSize: 12, color: '#6b7280', lineHeight: 17, marginTop: 10 },
  signOutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    gap: 8, borderWidth: 1, borderColor: '#fecaca',
  },
  signOutText: { fontSize: 15, color: '#ef4444', fontWeight: '600' },
});
