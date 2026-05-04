import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  TextInput, ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import {
  PRIORITY_CONFIG, PRODUCTION_TYPE_CONFIG, TECHNOLOGY_CONFIG,
  computeDeadlineState, DEADLINE_CONFIG, canManageOrders,
} from '@/constants/stations';
import type { Order, OrderStation, Customer, Product } from '@/lib/types';

type OrderRow = Order & {
  order_stations: Pick<OrderStation, 'status' | 'station_id' | 'applicable'>[];
  customers: Pick<Customer, 'name'> | null;
  products: Pick<Product, 'code' | 'name'> | null;
};

type Filter = 'active' | 'hidden' | 'all';

export default function OrdersScreen() {
  const { profile } = useAuth();
  const router = useRouter();
  const canManage = canManageOrders(profile?.role);

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('active');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchOrders = useCallback(async () => {
    let q = supabase
      .from('orders')
      .select('*, customers(name), products(code,name), order_stations(status,station_id,applicable)')
      .order('created_at', { ascending: false })
      .limit(200);
    if (filter === 'active') q = q.is('hidden_at', null);
    else if (filter === 'hidden') q = q.not('hidden_at', 'is', null);

    const { data } = await q;
    if (data) setOrders(data as OrderRow[]);
    setLoading(false);
    setRefreshing(false);
  }, [filter]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const visible = profile?.role === 'operator' && profile.default_station
      ? orders.filter((o) => o.order_stations.some((s) => s.station_id === profile.default_station && s.applicable !== false))
      : orders;
    if (!q) return visible;
    return visible.filter((o) =>
      o.order_number.toLowerCase().includes(q) ||
      o.name.toLowerCase().includes(q) ||
      o.customers?.name?.toLowerCase().includes(q) ||
      o.products?.code?.toLowerCase().includes(q) ||
      o.products?.name?.toLowerCase().includes(q)
    );
  }, [search, orders, profile?.role, profile?.default_station]);

  function getStatusLabel(o: OrderRow): { text: string; color: string } {
    const s = o.order_stations.map((x) => x.status);
    if (s.every((x) => x === 'completed' || x === 'skipped')) return { text: 'Dokončena', color: '#15803d' };
    if (s.some((x) => x === 'issue')) return { text: 'Problém', color: '#b91c1c' };
    if (s.some((x) => x === 'in_progress')) return { text: 'Probíhá', color: '#1d4ed8' };
    return { text: 'Čeká', color: '#6b7280' };
  }

  async function toggleHide(o: OrderRow) {
    const hide = !o.hidden_at;
    const { error } = await supabase
      .from('orders')
      .update({ hidden_at: hide ? new Date().toISOString() : null })
      .eq('id', o.id);
    if (error) Alert.alert('Chyba', error.message);
    else fetchOrders();
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1a56db" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <Ionicons name="search" size={18} color="#6b7280" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Hledat podle čísla, zákazníka, produktu…"
          placeholderTextColor="#9ca3af"
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color="#9ca3af" />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.filterRow}>
        {(['active', 'hidden', 'all'] as Filter[]).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterChip, filter === f && styles.filterChipActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterChipTxt, filter === f && styles.filterChipTxtActive]}>
              {f === 'active' ? 'Aktivní' : f === 'hidden' ? 'Skryté' : 'Vše'}
            </Text>
          </TouchableOpacity>
        ))}
        <View style={{ flex: 1 }} />
        <Text style={styles.countTxt}>{filtered.length}</Text>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchOrders(); }} />}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const prio = PRIORITY_CONFIG[item.priority];
          const ptype = PRODUCTION_TYPE_CONFIG[item.production_type];
          const technology = TECHNOLOGY_CONFIG[item.technology ?? 'leadfree'];
          const status = getStatusLabel(item);
          const hasIssue = item.order_stations.some((s) => s.status === 'issue');
          const dState = computeDeadlineState(item.due_date);
          const dCfg = DEADLINE_CONFIG[dState];

          return (
            <TouchableOpacity
              style={[styles.row, { borderLeftWidth: 3, borderLeftColor: hasIssue ? '#ef4444' : dCfg.border }]}
              onPress={() => router.push(`/order/${item.id}`)}
              onLongPress={() => canManage && Alert.alert(
                item.hidden_at ? 'Obnovit zakázku?' : 'Skrýt zakázku?',
                `${item.order_number} · ${item.name}`,
                [
                  { text: 'Zrušit', style: 'cancel' },
                  { text: item.hidden_at ? 'Obnovit' : 'Skrýt', onPress: () => toggleHide(item) },
                ],
              )}
            >
              <View style={styles.rowLeft}>
                <View style={styles.rowTitleRow}>
                  <Text style={styles.rowNumber}>{item.order_number}</Text>
                  <View style={[styles.ptypeBadge, { backgroundColor: ptype.bg }]}>
                    <Text style={[styles.ptypeTxt, { color: ptype.color }]}>{ptype.label}</Text>
                  </View>
                  <View style={[styles.ptypeBadge, { backgroundColor: technology.bg }]}>
                    <Text style={[styles.ptypeTxt, { color: technology.color }]}>{technology.label}</Text>
                  </View>
                </View>
                <Text style={styles.rowName} numberOfLines={1}>
                  {item.customers?.name ? `${item.customers.name} · ` : ''}
                  {item.products?.code ? `${item.products.code} · ` : ''}
                  {item.name}
                </Text>
                <View style={styles.rowMetaRow}>
                  {item.due_date && (
                    <Text style={[styles.rowDate, { color: dCfg.color }]}>
                      {new Date(item.due_date).toLocaleDateString('cs-CZ')}
                    </Text>
                  )}
                  {item.quantity > 1 && <Text style={styles.rowMeta}>· {item.quantity} ks</Text>}
                </View>
              </View>
              <View style={styles.rowRight}>
                <View style={[styles.prioBadge, { backgroundColor: prio.color + '20' }]}>
                  <Text style={[styles.prioText, { color: prio.color }]}>{prio.label}</Text>
                </View>
                <Text style={[styles.statusText, { color: status.color }]}>{status.text}</Text>
                <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="search-outline" size={40} color="#d1d5db" />
            <Text style={styles.emptyText}>Žádné výsledky</Text>
          </View>
        }
      />

      {canManage && (
        <TouchableOpacity style={styles.fab} onPress={() => router.push('/order/new')}>
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', margin: 12, marginBottom: 0,
    borderRadius: 10, paddingHorizontal: 12,
    borderWidth: 1, borderColor: '#e5e7eb',
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, height: 42, fontSize: 15, color: '#111827' },
  filterRow: { flexDirection: 'row', gap: 6, alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10 },
  filterChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb',
  },
  filterChipActive: { backgroundColor: '#1a56db', borderColor: '#1a56db' },
  filterChipTxt: { fontSize: 12, color: '#374151', fontWeight: '500' },
  filterChipTxtActive: { color: '#fff' },
  countTxt: { fontSize: 12, color: '#6b7280' },
  list: { paddingHorizontal: 12, paddingBottom: 80 },
  row: {
    backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 8,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 3, elevation: 1,
  },
  rowLeft: { flex: 1, gap: 2 },
  rowTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowNumber: { fontSize: 14, fontWeight: '700', color: '#111827' },
  rowName: { fontSize: 13, color: '#374151' },
  rowMetaRow: { flexDirection: 'row', gap: 4, marginTop: 2 },
  rowDate: { fontSize: 11, fontWeight: '500' },
  rowMeta: { fontSize: 11, color: '#9ca3af' },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ptypeBadge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1 },
  ptypeTxt: { fontSize: 10, fontWeight: '600' },
  prioBadge: { borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  prioText: { fontSize: 11, fontWeight: '600' },
  statusText: { fontSize: 12, fontWeight: '500' },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { fontSize: 15, color: '#9ca3af', marginTop: 10 },
  fab: {
    position: 'absolute', bottom: 24, right: 24,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#1a56db',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2, shadowRadius: 8, elevation: 6,
  },
});
