import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl, TextInput, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { STATIONS, TEST_FLOW_CONFIG, PRODUCTION_EVENT_CONFIG, PRODUCTION_RESULT_CONFIG } from '@/constants/stations';
import type { Product, Customer, TestFlow, ProductionEvent } from '@/lib/types';

type ProductWithCustomer = Product & { customers: Customer | null };
const TEST_FLOWS: TestFlow[] = ['none', 'output_control', 'separate_station'];

export default function ProductsScreen() {
  const { profile } = useAuth();
  const { colors } = useTheme();
  const [products, setProducts] = useState<ProductWithCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [productEvents, setProductEvents] = useState<Record<string, ProductionEvent[]>>({});

  const fetchProducts = useCallback(async () => {
    const { data } = await supabase
      .from('products')
      .select('*, customers(id, name, ico, contact, note, created_at)')
      .order('code', { ascending: true });
    if (data) setProducts(data as ProductWithCustomer[]);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  const filtered = products.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      p.code.toLowerCase().includes(q) ||
      p.name.toLowerCase().includes(q) ||
      (p.customers?.name ?? '').toLowerCase().includes(q)
    );
  });

  const canEdit = profile?.role === 'tpv' || profile?.role === 'dispatcher' || profile?.role === 'admin';

  async function loadProductHistory(productId: string) {
    if (productEvents[productId]) return;
    const { data } = await supabase
      .from('production_events')
      .select('*')
      .eq('product_id', productId)
      .order('created_at', { ascending: false })
      .limit(20);
    if (data) setProductEvents((current) => ({ ...current, [productId]: data as ProductionEvent[] }));
  }

  function updateLocalProduct(id: string, patch: Partial<Product>) {
    setProducts((current) => current.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  async function saveProductPatch(id: string, patch: Partial<Product>) {
    const { error } = await supabase.from('products').update(patch).eq('id', id);
    if (error) {
      Alert.alert('Chyba', error.message);
      fetchProducts();
    }
  }

  async function toggleStation(item: ProductWithCustomer, stationId: number) {
    if (!canEdit) return;
    const current = item.applicable_stations ?? [];
    const next = current.includes(stationId)
      ? current.filter((id) => id !== stationId)
      : [...current, stationId].sort((a, b) => a - b);
    updateLocalProduct(item.id, { applicable_stations: next });
    await saveProductPatch(item.id, { applicable_stations: next });
  }

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    searchBar: {
      backgroundColor: colors.card, padding: 12,
      borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    searchInput: {
      backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.inputBorder,
      borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
      fontSize: 14, color: colors.text,
    },
    list: { padding: 12 },
    card: {
      backgroundColor: colors.card, borderRadius: 12, padding: 14,
      marginBottom: 10, shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06,
      shadowRadius: 3, elevation: 1,
    },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    codeText: { fontSize: 16, fontWeight: '700', color: colors.text },
    nameText: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
    customerBadge: {
      backgroundColor: colors.inputBg, borderRadius: 6,
      paddingHorizontal: 8, paddingVertical: 3, marginTop: 6, alignSelf: 'flex-start',
    },
    customerTxt: { fontSize: 11, color: colors.textSecondary, fontWeight: '500' },
    expandBtn: { padding: 4 },
    details: { marginTop: 12, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 },
    detailRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
    detailLabel: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
    detailValue: { fontSize: 12, color: colors.text },
    editInput: {
      borderWidth: 1, borderColor: colors.inputBorder, backgroundColor: colors.inputBg,
      borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13,
      color: colors.text, marginBottom: 10,
    },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
    flowChip: {
      paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14,
      borderWidth: 1, borderColor: colors.border, backgroundColor: colors.inputBg,
    },
    flowChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    flowTxt: { fontSize: 11, color: colors.textSecondary, fontWeight: '600' },
    flowTxtActive: { color: '#fff' },
    stationsTitle: { fontSize: 12, color: colors.textSecondary, fontWeight: '600', marginBottom: 6 },
    stationsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
    stationChip: {
      paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
      backgroundColor: colors.primary + '20',
    },
    stationChipOff: { backgroundColor: colors.inputBg },
    stationTxt: { fontSize: 10, color: colors.primary, fontWeight: '600' },
    stationTxtOff: { color: colors.textSecondary },
    historyTitle: { fontSize: 12, color: colors.textSecondary, fontWeight: '600', marginTop: 12, marginBottom: 6 },
    historyRow: {
      flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8,
      borderTopWidth: 1, borderTopColor: colors.border,
    },
    historyIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    historyMain: { flex: 1 },
    historyText: { fontSize: 12, color: colors.text, fontWeight: '600' },
    historyMeta: { fontSize: 10, color: colors.textSecondary, marginTop: 1 },
    historyBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
    historyBadgeTxt: { fontSize: 10, fontWeight: '700' },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
    empty: { alignItems: 'center', paddingTop: 60 },
    emptyTxt: { fontSize: 15, color: colors.textSecondary, marginTop: 10 },
    countBadge: {
      backgroundColor: colors.inputBg, borderRadius: 16,
      paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start', marginBottom: 10,
    },
    countTxt: { fontSize: 12, color: colors.textSecondary },
  });

  if (loading) {
    return <View style={s.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  return (
    <View style={s.container}>
      <View style={s.searchBar}>
        <TextInput
          style={s.searchInput}
          placeholder="Hledat kód, název, zákazník..."
          placeholderTextColor={colors.textSecondary}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(p) => p.id}
        contentContainerStyle={s.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchProducts(); }} />}
        ListHeaderComponent={
          <View style={s.countBadge}>
            <Text style={s.countTxt}>{filtered.length} produktů</Text>
          </View>
        }
        renderItem={({ item }) => {
          const isExpanded = expandedId === item.id;
          return (
            <View style={s.card}>
              <View style={s.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={s.codeText}>{item.code}</Text>
                  <Text style={s.nameText}>{item.name}</Text>
                  {item.revision && (
                    <Text style={s.nameText}>Rev. {item.revision}</Text>
                  )}
                  {item.customers && (
                    <View style={s.customerBadge}>
                      <Text style={s.customerTxt}>{item.customers.name}</Text>
                    </View>
                  )}
                </View>
                <TouchableOpacity
                  style={s.expandBtn}
                  onPress={() => {
                    const next = isExpanded ? null : item.id;
                    setExpandedId(next);
                    if (next) loadProductHistory(item.id);
                  }}
                >
                  <Ionicons
                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                    size={20}
                    color={colors.textSecondary}
                  />
                </TouchableOpacity>
              </View>

              {isExpanded && (
                <View style={s.details}>
                  {item.wave_program && (
                    <View style={s.detailRow}>
                      <Text style={s.detailLabel}>Program vlny:</Text>
                      <Text style={s.detailValue}>{item.wave_program}</Text>
                    </View>
                  )}

                  <Text style={s.detailLabel}>Program selektivní vlny</Text>
                  <TextInput
                    style={s.editInput}
                    editable={canEdit}
                    placeholder="Nevyplněno"
                    placeholderTextColor={colors.textSecondary}
                    value={item.selective_wave_program ?? ''}
                    onChangeText={(value) => updateLocalProduct(item.id, { selective_wave_program: value })}
                    onBlur={() => saveProductPatch(item.id, { selective_wave_program: item.selective_wave_program?.trim() || null })}
                  />

                  <Text style={s.detailLabel}>Testování</Text>
                  <View style={s.chipRow}>
                    {TEST_FLOWS.map((flow) => {
                      const active = (item.test_flow ?? 'output_control') === flow;
                      return (
                        <TouchableOpacity
                          key={flow}
                          disabled={!canEdit}
                          style={[s.flowChip, active && s.flowChipActive]}
                          onPress={() => {
                            updateLocalProduct(item.id, { test_flow: flow });
                            saveProductPatch(item.id, { test_flow: flow });
                          }}
                        >
                          <Text style={[s.flowTxt, active && s.flowTxtActive]}>
                            {TEST_FLOW_CONFIG[flow].label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <Text style={s.stationsTitle}>Applicable stanoviště</Text>
                  <View style={s.stationsGrid}>
                    {STATIONS.map((st) => {
                      const active = item.applicable_stations?.includes(st.id);
                      return (
                        <TouchableOpacity
                          key={st.id}
                          style={[s.stationChip, !active && s.stationChipOff]}
                          disabled={!canEdit}
                          onPress={() => toggleStation(item, st.id)}
                        >
                          <Text style={[s.stationTxt, !active && s.stationTxtOff]}>
                            {st.id}. {st.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {item.note && (
                    <View style={{ marginTop: 10 }}>
                      <Text style={s.detailLabel}>Poznámka</Text>
                      <Text style={[s.detailValue, { marginTop: 2 }]}>{item.note}</Text>
                    </View>
                  )}

                  <Text style={s.historyTitle}>Historie výrobku</Text>
                  {(productEvents[item.id] ?? []).length === 0 ? (
                    <Text style={s.detailValue}>Zatím žádné výrobní záznamy.</Text>
                  ) : (
                    (productEvents[item.id] ?? []).map((event) => {
                      const cfg = PRODUCTION_EVENT_CONFIG[event.event_type];
                      const rcfg = PRODUCTION_RESULT_CONFIG[event.result];
                      return (
                        <View key={event.id} style={s.historyRow}>
                          <View style={[s.historyIcon, { backgroundColor: cfg.color + '20' }]}>
                            <Ionicons name={cfg.icon as any} size={15} color={cfg.color} />
                          </View>
                          <View style={s.historyMain}>
                            <Text style={s.historyText}>{cfg.label} · {event.qty_total || event.qty_ok || event.qty_nok} ks</Text>
                            <Text style={s.historyMeta}>{new Date(event.created_at).toLocaleString('cs-CZ')}</Text>
                          </View>
                          <View style={[s.historyBadge, { backgroundColor: rcfg.bg }]}>
                            <Text style={[s.historyBadgeTxt, { color: rcfg.color }]}>{rcfg.label}</Text>
                          </View>
                        </View>
                      );
                    })
                  )}
                </View>
              )}
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={s.empty}>
            <Ionicons name="cube-outline" size={48} color={colors.border} />
            <Text style={s.emptyTxt}>Žádné produkty</Text>
          </View>
        }
      />
    </View>
  );
}
