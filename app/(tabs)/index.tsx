import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import {
  PRIORITY_CONFIG, STATUS_CONFIG, STATIONS, DEADLINE_CONFIG, computeDeadlineState, canManageOrders,
} from '@/constants/stations';
import type { OrderWithStations } from '@/lib/types';

type Filter = 'active' | 'issues' | 'overdue' | 'hidden' | 'all';

export default function DashboardScreen() {
  const { profile } = useAuth();
  const router = useRouter();
  const [orders, setOrders] = useState<OrderWithStations[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>('active');
  const [online, setOnline] = useState(true);

  const fetchOrders = useCallback(async () => {
    let q = supabase
      .from('orders')
      .select(`*, customers(name), products(code,name), order_stations ( *, stations(*) )`)
      .order('created_at', { ascending: false })
      .limit(100);

    if (filter === 'active') q = q.is('hidden_at', null);
    else if (filter === 'hidden') q = q.not('hidden_at', 'is', null);

    const { data } = await q;
    if (data) setOrders(data as OrderWithStations[]);
    setLoading(false);
    setRefreshing(false);
  }, [filter]);

  useEffect(() => {
    fetchOrders();
    const channel = supabase
      .channel('orders-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchOrders)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_stations' }, fetchOrders)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchOrders]);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((s) => setOnline(!!s.isConnected));
    return () => unsub();
  }, []);

  const stats = useMemo(() => {
    let inProgress = 0, issues = 0, overdue = 0;
    const scope = profile?.role === 'operator' && profile.default_station
      ? orders.filter((o) => o.order_stations.some((s) => s.station_id === profile.default_station && s.applicable !== false))
      : orders;
    for (const o of scope) {
      if (o.order_stations.some((s) => s.status === 'in_progress')) inProgress++;
      if (o.order_stations.some((s) => s.status === 'issue')) issues++;
      if (computeDeadlineState(o.due_date) === 'overdue') overdue++;
    }
    return { total: scope.length, inProgress, issues, overdue };
  }, [orders, profile?.role, profile?.default_station]);

  const visibleOrders = useMemo(() => {
    const byRole = profile?.role === 'operator' && profile.default_station
      ? orders.filter((o) => o.order_stations.some((s) => s.station_id === profile.default_station && s.applicable !== false))
      : orders;
    if (filter === 'issues') return byRole.filter((o) => o.order_stations.some((s) => s.status === 'issue'));
    if (filter === 'overdue') return byRole.filter((o) => computeDeadlineState(o.due_date) === 'overdue');
    return byRole;
  }, [orders, filter, profile?.role, profile?.default_station]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1a56db" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {!online && (
        <View style={styles.offline}>
          <Ionicons name="cloud-offline" size={14} color="#fff" />
          <Text style={styles.offlineTxt}>Offline – data se zobrazují z posledního načtení</Text>
        </View>
      )}

      <FlatList
        data={visibleOrders}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchOrders(); }} />}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View>
            <View style={styles.header}>
              <Text style={styles.greeting}>Přehled výroby</Text>
              <Text style={styles.count}>{visibleOrders.length} zakázek</Text>
            </View>
            <View style={styles.statsRow}>
              <Stat label="Aktivních" value={stats.inProgress} color="#1d4ed8" onPress={() => setFilter('active')} />
              <Stat label="Problém" value={stats.issues} color="#b91c1c" onPress={() => setFilter('issues')} />
              <Stat label="Po termínu" value={stats.overdue} color="#d97706" onPress={() => setFilter('overdue')} />
              <Stat label="Celkem" value={stats.total} color="#111827" onPress={() => setFilter('all')} />
            </View>
            <View style={styles.filterRow}>
              {(['active', 'issues', 'overdue', 'hidden', 'all'] as Filter[]).map((f) => (
                <TouchableOpacity
                  key={f}
                  style={[styles.filterChip, filter === f && styles.filterChipActive]}
                  onPress={() => setFilter(f)}
                >
                  <Text style={[styles.filterChipTxt, filter === f && styles.filterChipTxtActive]}>
                    {f === 'active' ? 'Aktivní' : f === 'issues' ? 'Problémy' : f === 'overdue' ? 'Po termínu' : f === 'hidden' ? 'Skryté' : 'Vše'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        }
        renderItem={({ item }) => {
          const active = item.order_stations.filter((s) => s.status === 'in_progress' || s.status === 'issue');
          const completed = item.order_stations.filter((s) => s.status === 'completed').length;
          const prio = PRIORITY_CONFIG[item.priority];
          const hasIssue = item.order_stations.some((s) => s.status === 'issue');
          const dState = computeDeadlineState(item.due_date);
          const dCfg = DEADLINE_CONFIG[dState];
          const cust = (item as any).customers?.name;
          const prodCode = (item as any).products?.code;

          return (
            <TouchableOpacity
              style={[
                styles.card,
                { borderLeftWidth: 3, borderLeftColor: hasIssue ? '#ef4444' : dCfg.border },
              ]}
              onPress={() => router.push(`/order/${item.id}`)}
            >
              <View style={styles.cardHeader}>
                <View style={styles.cardTitleRow}>
                  <Text style={styles.orderNumber}>{item.order_number}</Text>
                  <View style={[styles.priorityBadge, { backgroundColor: prio.color + '20' }]}>
                    <Text style={[styles.priorityText, { color: prio.color }]}>{prio.label}</Text>
                  </View>
                </View>
                <Text style={styles.orderName} numberOfLines={1}>
                  {cust ? `${cust} · ` : ''}{prodCode ? `${prodCode} · ` : ''}{item.name}
                </Text>
              </View>

              <View style={styles.progressRow}>
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, { width: `${(completed / 12) * 100}%` }]} />
                </View>
                <Text style={styles.progressText}>{completed}/12</Text>
              </View>

              {active.length > 0 ? (
                <View style={styles.activeRow}>
                  {active.map((s) => {
                    const stName = STATIONS.find((st) => st.id === s.station_id)?.name ?? '';
                    const cfg = STATUS_CONFIG[s.status];
                    return (
                      <View key={s.id} style={[styles.activeBadge, { backgroundColor: cfg.bg }]}>
                        {s.status === 'issue' && <Ionicons name="warning" size={12} color={cfg.color} style={{ marginRight: 3 }} />}
                        <Text style={[styles.activeBadgeText, { color: cfg.color }]} numberOfLines={1}>{stName}</Text>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <Text style={styles.noActive}>Žádné aktivní stanoviště</Text>
              )}

              <View style={styles.footRow}>
                {item.due_date && (
                  <Text style={[styles.dueDate, { color: dCfg.color }]}>
                    <Ionicons name="calendar-outline" size={11} color={dCfg.color} />{' '}
                    {new Date(item.due_date).toLocaleDateString('cs-CZ')} · {dCfg.label}
                  </Text>
                )}
                {item.quantity > 1 && (
                  <Text style={styles.qtyTxt}>{item.quantity} ks</Text>
                )}
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="cube-outline" size={48} color="#d1d5db" />
            <Text style={styles.emptyText}>Žádné zakázky</Text>
          </View>
        }
      />

      {canManageOrders(profile?.role) && (
        <TouchableOpacity style={styles.fab} onPress={() => router.push('/order/new')}>
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );
}

function Stat({ label, value, color, onPress }: { label: string; value: number; color: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.stat} onPress={onPress}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  offline: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#dc2626', paddingHorizontal: 12, paddingVertical: 6,
  },
  offlineTxt: { color: '#fff', fontSize: 12, fontWeight: '500' },
  list: { padding: 16 },
  header: { marginBottom: 12 },
  greeting: { fontSize: 20, fontWeight: '700', color: '#111827' },
  count: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  stat: { flex: 1, backgroundColor: '#fff', borderRadius: 10, padding: 10, alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: '700' },
  statLabel: { fontSize: 11, color: '#6b7280', marginTop: 2 },
  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  filterChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb',
  },
  filterChipActive: { backgroundColor: '#1a56db', borderColor: '#1a56db' },
  filterChipTxt: { fontSize: 12, color: '#374151', fontWeight: '500' },
  filterChipTxtActive: { color: '#fff' },
  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, shadowRadius: 4, elevation: 2,
  },
  cardHeader: { marginBottom: 10 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  orderNumber: { fontSize: 15, fontWeight: '700', color: '#111827' },
  orderName: { fontSize: 13, color: '#374151', marginTop: 2 },
  priorityBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  priorityText: { fontSize: 11, fontWeight: '600' },
  progressRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  progressBar: { flex: 1, height: 6, backgroundColor: '#e5e7eb', borderRadius: 3, marginRight: 8 },
  progressFill: { height: 6, backgroundColor: '#1a56db', borderRadius: 3 },
  progressText: { fontSize: 11, color: '#6b7280', width: 32, textAlign: 'right' },
  activeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 6 },
  activeBadge: { flexDirection: 'row', alignItems: 'center', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  activeBadgeText: { fontSize: 11, fontWeight: '500' },
  noActive: { fontSize: 12, color: '#9ca3af', marginBottom: 4 },
  footRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  dueDate: { fontSize: 11, fontWeight: '500' },
  qtyTxt: { fontSize: 11, color: '#6b7280' },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { fontSize: 16, color: '#9ca3af', marginTop: 12 },
  fab: {
    position: 'absolute', bottom: 24, right: 24, width: 56, height: 56,
    borderRadius: 28, backgroundColor: '#1a56db',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2, shadowRadius: 8, elevation: 6,
  },
});
