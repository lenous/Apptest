import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, ScrollView, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/context/ThemeContext';
import type { Profile, Role } from '@/lib/types';

const ROLE_LABELS: Record<Role, string> = {
  operator: 'Operátor',
  tpv: 'TPV',
  dispatcher: 'Mistr',
  management: 'Vedení',
  admin: 'Admin',
};

const ROLE_COLORS: Record<Role, string> = {
  operator: '#6b7280',
  tpv: '#7c3aed',
  dispatcher: '#1d4ed8',
  management: '#15803d',
  admin: '#b91c1c',
};

const ALL_QUALIFICATIONS = [
  'sklad', 'automat', 'aoi', 'rtg', 'oprava_aoi',
  'osazovani', 'pajeni_vlna', 'pajeni_selektivni', 'pajeni_rucni',
  'oprava_pajeni', 'programovani', 'lakovani', 'vystupni_kontrola', 'baleni',
  'testovani',
];

const QUALIFICATION_LABELS: Record<string, string> = {
  sklad: 'Sklad',
  automat: 'Automat',
  aoi: 'AOI',
  rtg: 'RTG',
  oprava_aoi: 'Oprava AOI',
  osazovani: 'Osazování',
  pajeni_vlna: 'Pájení vlna',
  pajeni_selektivni: 'Pájení sel.',
  pajeni_rucni: 'Pájení ruční',
  oprava_pajeni: 'Oprava pájení',
  programovani: 'Programování',
  lakovani: 'Lakování',
  vystupni_kontrola: 'Výstupní kont.',
  baleni: 'Balení',
  testovani: 'Testování',
};

type Tab = 'users';

export default function AdminScreen() {
  const { colors } = useTheme();
  const [tab] = useState<Tab>('users');
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editingUser, setEditingUser] = useState<Profile | null>(null);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchUsers = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .order('full_name', { ascending: true });
    if (data) setUsers(data as Profile[]);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  async function saveUser(updated: Profile) {
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        role: updated.role,
        qualifications: updated.qualifications,
        default_station: updated.default_station,
      })
      .eq('id', updated.id);
    setSaving(false);
    if (error) {
      Alert.alert('Chyba', error.message);
    } else {
      setEditingUser(null);
      fetchUsers();
    }
  }

  function toggleQualification(user: Profile, qual: string) {
    const current = user.qualifications ?? [];
    const next = current.includes(qual)
      ? current.filter((q) => q !== qual)
      : [...current, qual];
    setEditingUser({ ...user, qualifications: next });
  }

  const filtered = users.filter((u) =>
    !search || (u.full_name ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      backgroundColor: colors.card, padding: 12, borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    searchInput: {
      backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.inputBorder,
      borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14,
      color: colors.text,
    },
    list: { padding: 12 },
    userCard: {
      backgroundColor: colors.card, borderRadius: 12, padding: 14,
      marginBottom: 10, shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06,
      shadowRadius: 3, elevation: 1,
    },
    cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    userInfo: { flex: 1 },
    userName: { fontSize: 15, fontWeight: '700', color: colors.text },
    userEmail: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
    roleBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginTop: 2, alignSelf: 'flex-start' },
    roleTxt: { fontSize: 11, fontWeight: '700' },
    editBtn: { padding: 6 },
    qualsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 8 },
    qualChip: {
      paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
      backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border,
    },
    qualTxt: { fontSize: 10, color: colors.textSecondary, fontWeight: '500' },
    // Edit modal
    modalOverlay: {
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end',
    },
    modal: {
      backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20,
      padding: 20, maxHeight: '85%',
    },
    modalTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 16 },
    fieldLabel: { fontSize: 12, color: colors.textSecondary, fontWeight: '600', textTransform: 'uppercase', marginBottom: 6 },
    roleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
    roleChip: {
      paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16,
      borderWidth: 1, borderColor: colors.border, backgroundColor: colors.inputBg,
    },
    roleChipActive: { borderWidth: 2 },
    roleChipTxt: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
    qualGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 },
    qualEditChip: {
      paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12,
      borderWidth: 1, borderColor: colors.border, backgroundColor: colors.inputBg,
    },
    qualEditChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    qualEditTxt: { fontSize: 11, color: colors.textSecondary, fontWeight: '500' },
    qualEditTxtActive: { color: '#fff' },
    btnRow: { flexDirection: 'row', gap: 10 },
    saveBtn: {
      flex: 1, backgroundColor: colors.primary, borderRadius: 10,
      padding: 14, alignItems: 'center',
    },
    saveTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },
    cancelBtn: {
      flex: 1, backgroundColor: colors.inputBg, borderRadius: 10,
      padding: 14, alignItems: 'center', borderWidth: 1, borderColor: colors.border,
    },
    cancelTxt: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
    empty: { alignItems: 'center', paddingTop: 60 },
    emptyTxt: { fontSize: 15, color: colors.textSecondary, marginTop: 10 },
  });

  if (loading) {
    return <View style={s.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TextInput
          style={s.searchInput}
          placeholder="Hledat uživatele..."
          placeholderTextColor={colors.textSecondary}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(u) => u.id}
        contentContainerStyle={s.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchUsers(); }} />}
        renderItem={({ item }) => {
          const roleColor = ROLE_COLORS[item.role];
          const quals = item.qualifications ?? [];
          return (
            <View style={s.userCard}>
              <View style={s.cardRow}>
                <View style={s.userInfo}>
                  <Text style={s.userName}>{item.full_name ?? 'Bez jména'}</Text>
                  <View style={[s.roleBadge, { backgroundColor: roleColor + '20' }]}>
                    <Text style={[s.roleTxt, { color: roleColor }]}>{ROLE_LABELS[item.role]}</Text>
                  </View>
                  {quals.length > 0 && (
                    <View style={s.qualsRow}>
                      {quals.slice(0, 5).map((q) => (
                        <View key={q} style={s.qualChip}>
                          <Text style={s.qualTxt}>{QUALIFICATION_LABELS[q] ?? q}</Text>
                        </View>
                      ))}
                      {quals.length > 5 && (
                        <View style={s.qualChip}>
                          <Text style={s.qualTxt}>+{quals.length - 5}</Text>
                        </View>
                      )}
                    </View>
                  )}
                </View>
                <TouchableOpacity style={s.editBtn} onPress={() => setEditingUser(item)}>
                  <Ionicons name="pencil" size={18} color={colors.primary} />
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={s.empty}>
            <Ionicons name="people-outline" size={48} color={colors.border} />
            <Text style={s.emptyTxt}>Žádní uživatelé</Text>
          </View>
        }
      />

      {/* Edit panel */}
      {editingUser && (
        <View style={s.modalOverlay}>
          <ScrollView style={s.modal} keyboardShouldPersistTaps="handled">
            <Text style={s.modalTitle}>
              Upravit: {editingUser.full_name ?? 'Uživatel'}
            </Text>

            <Text style={s.fieldLabel}>Role</Text>
            <View style={s.roleRow}>
              {(Object.keys(ROLE_LABELS) as Role[]).map((r) => {
                const active = editingUser.role === r;
                const rc = ROLE_COLORS[r];
                return (
                  <TouchableOpacity
                    key={r}
                    style={[s.roleChip, active && s.roleChipActive, active && { borderColor: rc, backgroundColor: rc + '20' }]}
                    onPress={() => setEditingUser({ ...editingUser, role: r })}
                  >
                    <Text style={[s.roleChipTxt, active && { color: rc }]}>{ROLE_LABELS[r]}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={s.fieldLabel}>Kvalifikace</Text>
            <View style={s.qualGrid}>
              {ALL_QUALIFICATIONS.map((q) => {
                const active = (editingUser.qualifications ?? []).includes(q);
                return (
                  <TouchableOpacity
                    key={q}
                    style={[s.qualEditChip, active && s.qualEditChipActive]}
                    onPress={() => toggleQualification(editingUser, q)}
                  >
                    <Text style={[s.qualEditTxt, active && s.qualEditTxtActive]}>
                      {QUALIFICATION_LABELS[q] ?? q}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={s.btnRow}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setEditingUser(null)}>
                <Text style={s.cancelTxt}>Zrušit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.saveBtn, saving && { opacity: 0.6 }]}
                onPress={() => saveUser(editingUser)}
                disabled={saving}
              >
                <Text style={s.saveTxt}>{saving ? 'Ukládám…' : 'Uložit'}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      )}
    </View>
  );
}
