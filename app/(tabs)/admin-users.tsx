import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { ROLE_CONFIG, STATIONS, canUseAdmin } from '@/constants/stations';
import type { Profile, Role } from '@/lib/types';

const ROLES: Role[] = ['operator', 'tpv', 'dispatcher', 'management', 'admin'];

export default function AdminUsersScreen() {
  const { profile } = useAuth();
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('full_name');
    if (error) Alert.alert('Chyba', error.message);
    if (data) setUsers(data as Profile[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  if (!canUseAdmin(profile?.role)) {
    return (
      <View style={styles.centered}>
        <Ionicons name="lock-closed-outline" size={42} color="#9ca3af" />
        <Text style={styles.emptyText}>Správa uživatelů je dostupná jen pro Admina.</Text>
      </View>
    );
  }

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color="#1a56db" /></View>;
  }

  async function updateProfile(id: string, update: Partial<Profile>) {
    setSavingId(id);
    const { error } = await supabase.from('profiles').update(update).eq('id', id);
    setSavingId(null);
    if (error) {
      Alert.alert('Chyba', error.message);
      return;
    }
    setUsers((list) => list.map((u) => u.id === id ? { ...u, ...update } : u));
  }

  function toggleQualification(user: Profile, stationId: number) {
    const key = `station:${stationId}`;
    const current = user.qualifications ?? [];
    const next = current.includes(key)
      ? current.filter((q) => q !== key)
      : [...current, key];
    updateProfile(user.id, { qualifications: next });
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Uživatelé a oprávnění</Text>
        <TouchableOpacity
          style={styles.inviteBtn}
          onPress={() => Alert.alert('Nový uživatel', 'V produkci se účet založí v Supabase Auth. Tady už může Admin upravit roli a kvalifikace existujících profilů.')}
        >
          <Ionicons name="person-add-outline" size={18} color="#1a56db" />
          <Text style={styles.inviteText}>Nový</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={users}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const cfg = ROLE_CONFIG[item.role];
          const quals = item.qualifications ?? [];
          return (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.full_name ?? 'Bez jména'}</Text>
                  <Text style={styles.sub}>{item.id}</Text>
                </View>
                {savingId === item.id && <ActivityIndicator size="small" color="#1a56db" />}
              </View>

              <Text style={styles.sectionLabel}>Role</Text>
              <View style={styles.chipRow}>
                {ROLES.map((role) => {
                  const roleCfg = ROLE_CONFIG[role];
                  const selected = item.role === role;
                  return (
                    <TouchableOpacity
                      key={role}
                      style={[styles.chip, selected && { backgroundColor: roleCfg.color, borderColor: roleCfg.color }]}
                      onPress={() => updateProfile(item.id, { role })}
                    >
                      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{roleCfg.shortLabel}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={[styles.roleBadge, { backgroundColor: cfg.bg }]}>
                <Text style={[styles.roleBadgeText, { color: cfg.color }]}>Aktuálně: {cfg.label}</Text>
              </View>

              {item.role === 'operator' && (
                <>
                  <Text style={styles.sectionLabel}>Pracoviště operátora</Text>
                  <View style={styles.chipRow}>
                    {STATIONS.map((station) => {
                      const key = `station:${station.id}`;
                      const selected = quals.includes(key) || item.default_station === station.id;
                      return (
                        <TouchableOpacity
                          key={station.id}
                          style={[styles.stationChip, selected && styles.stationChipSelected]}
                          onPress={() => toggleQualification(item, station.id)}
                          onLongPress={() => updateProfile(item.id, { default_station: station.id })}
                        >
                          <Text style={[styles.stationChipText, selected && styles.stationChipTextSelected]}>
                            {station.id}. {station.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <Text style={styles.hint}>Klepnutí mění kvalifikaci. Dlouhý stisk nastaví výchozí pracoviště.</Text>
                </>
              )}
            </View>
          );
        }}
        ListEmptyComponent={<Text style={styles.emptyText}>Žádní uživatelé</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  title: { fontSize: 20, fontWeight: '800', color: '#111827' },
  inviteBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#eff6ff', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
  },
  inviteText: { color: '#1a56db', fontSize: 13, fontWeight: '700' },
  list: { padding: 16, paddingTop: 0 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  name: { fontSize: 15, color: '#111827', fontWeight: '800' },
  sub: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  sectionLabel: { fontSize: 11, color: '#6b7280', fontWeight: '800', textTransform: 'uppercase', marginBottom: 8, marginTop: 4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: {
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 16,
    paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#fff',
  },
  chipText: { fontSize: 12, color: '#374151', fontWeight: '700' },
  chipTextSelected: { color: '#fff' },
  roleBadge: { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, marginTop: 10 },
  roleBadgeText: { fontSize: 12, fontWeight: '800' },
  stationChip: {
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8,
    paddingHorizontal: 9, paddingVertical: 6, backgroundColor: '#fff',
  },
  stationChipSelected: { backgroundColor: '#dbeafe', borderColor: '#93c5fd' },
  stationChipText: { fontSize: 12, color: '#374151', fontWeight: '600' },
  stationChipTextSelected: { color: '#1d4ed8' },
  hint: { fontSize: 11, color: '#6b7280', lineHeight: 16, marginTop: 8 },
  emptyText: { fontSize: 14, color: '#9ca3af', textAlign: 'center' },
});
