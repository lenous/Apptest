import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import {
  STATIONS, STATUS_CONFIG, PRIORITY_CONFIG, DEADLINE_CONFIG, computeDeadlineState,
} from '@/constants/stations';
import type { OrderStation, StationStatus } from '@/lib/types';

// Mapování kvalifikace na station ID
const QUAL_TO_STATION: Record<string, number[]> = {
  sklad: [1],
  automat: [2],
  aoi: [3],
  rtg: [4],
  oprava_aoi: [5],
  osazovani: [6],
  pajeni_vlna: [7],
  pajeni_selektivni: [7],
  pajeni_rucni: [7],
  oprava_pajeni: [8],
  programovani: [9],
  lakovani: [10],
  vystupni_kontrola: [11],
  baleni: [12],
  testovani: [13],
};

function getQualifiedStationIds(qualifications: string[] | null | undefined): number[] {
  if (!qualifications || qualifications.length === 0) return STATIONS.map((s) => s.id);
  const ids = new Set<number>();
  for (const q of qualifications) {
    const stationIds = QUAL_TO_STATION[q] ?? [];
    stationIds.forEach((id) => ids.add(id));
  }
  return Array.from(ids).sort((a, b) => a - b);
}

type Row = OrderStation & {
  orders: {
    id: string;
    order_number: string;
    name: string;
    priority: 'low' | 'normal' | 'high' | 'urgent';
    due_date: string | null;
    quantity: number;
    hidden_at: string | null;
    customers: { name: string } | null;
    products: { code: string; name: string } | null;
  } | null;
};

export default function MyStationScreen() {
  const { profile } = useAuth();
  const router = useRouter();
  const [stationId, setStationId] = useState<number | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filtruj stanoviště podle kvalifikací operátora
  const qualifiedStationIds = getQualifiedStationIds(profile?.qualifications);
  const visibleStations = STATIONS.filter((s) => qualifiedStationIds.includes(s.id));

  useEffect(() => {
    // Nastav výchozí stanoviště: buď profile.default_station, nebo první kvalifikované
    const defaultId = profile?.default_station;
    if (defaultId && qualifiedStationIds.includes(defaultId)) {
      setStationId(defaultId);
    } else if (visibleStations.length > 0) {
      setStationId(visibleStations[0].id);
    }
  }, [profile?.default_station, profile?.qualifications]);

  const fetchQueue = useCallback(async () => {
    if (!stationId) return;
    const { data } = await supabase
      .from('order_stations')
      .select(`
        *,
        orders(
          id, order_number, name, priority, due_date, quantity, hidden_at,
          customers(name), products(code, name)
        )
      `)
      .eq('station_id', stationId)
      .eq('applicable', true)
      .in('status', ['waiting', 'in_progress', 'issue'])
      .order('updated_at', { ascending: true });
    if (data) {
      const filtered = (data as Row[]).filter((r) => r.orders && !r.orders.hidden_at);
      setRows(filtered);
    }
    setLoading(false);
    setRefreshing(false);
  }, [stationId]);

  useEffect(() => {
    fetchQueue();
    if (!stationId) return;
    const channel = supabase
      .channel(`my-station-${stationId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_stations' }, fetchQueue)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchQueue, stationId]);

  const station = STATIONS.find((s) => s.id === stationId);
  const inProgress = rows.filter((r) => r.status === 'in_progress').length;
  const waiting = rows.filter((r) => r.status === 'waiting').length;
  const issues = rows.filter((r) => r.status === 'issue').length;

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color="#1a56db" /></View>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{station?.name ?? 'Stanoviště'}</Text>
        <Text style={styles.headerSub}>{profile?.full_name ?? ''}</Text>
        <View style={styles.statsRow}>
          <Stat label="Ve frontě" value={waiting} color="#6b7280" />
          <Stat label="Probíhá" value={inProgress} color="#1d4ed8" />
          <Stat label="Problém" value={issues} color="#b91c1c" />
        </View>
      </View>

      {/* Přepínač stanovišť – jen ta, na která má operátor kvalifikaci */}
      {visibleStations.length > 1 && (
        <View style={styles.stationPicker}>
          <Text style={styles.pickerLabel}>Přepnout stanoviště:</Text>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={visibleStations}
            keyExtractor={(s) => String(s.id)}
            contentContainerStyle={{ gap: 6, paddingRight: 12 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.stChip, stationId === item.id && styles.stChipActive]}
                onPress={() => setStationId(item.id)}
              >
                <Text style={[styles.stChipTxt, stationId === item.id && styles.stChipTxtActive]}>
                  {item.id}. {item.name}
                </Text>
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchQueue(); }} />}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          if (!item.orders) return null;
          const o = item.orders;
          const cfg = STATUS_CONFIG[item.status as StationStatus];
          const prio = PRIORITY_CONFIG[o.priority];
          const dState = computeDeadlineState(o.due_date);
          const dCfg = DEADLINE_CONFIG[dState];
          return (
            <TouchableOpacity
              style={[styles.card, { borderLeftColor: item.status === 'issue' ? '#ef4444' : dCfg.border, borderLeftWidth: 3 }]}
              onPress={() => router.push(`/order/${o.id}/station/${item.station_id}`)}
            >
              <View style={styles.cardTop}>
                <Text style={styles.cardNumber}>#{o.order_number}</Text>
                <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
                  <Text style={[styles.statusTxt, { color: cfg.color }]}>{cfg.label}</Text>
                </View>
              </View>
              <Text style={styles.cardName} numberOfLines={1}>
                {o.customers?.name ? `${o.customers.name} · ` : ''}
                {o.products?.code ? `${o.products.code} · ` : ''}
                {o.name}
              </Text>
              <View style={styles.cardFoot}>
                <View style={[styles.prioBadge, { backgroundColor: prio.color + '20' }]}>
                  <Text style={[styles.prioTxt, { color: prio.color }]}>{prio.label}</Text>
                </View>
                {o.due_date && (
                  <Text style={[styles.dueTxt, { color: dCfg.color }]}>
                    <Ionicons name="calendar-outline" size={11} color={dCfg.color} />{' '}
                    {new Date(o.due_date).toLocaleDateString('cs-CZ')}
                  </Text>
                )}
                {o.quantity > 1 && <Text style={styles.qtyTxt}>{o.quantity} ks</Text>}
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="checkmark-done-circle-outline" size={64} color="#10b981" />
            <Text style={styles.emptyTitle}>Fronta je prázdná</Text>
            <Text style={styles.emptyTxt}>Na tomto stanovišti teď nic nečeká.</Text>
          </View>
        }
      />
    </View>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statVal, { color }]}>{value}</Text>
      <Text style={styles.statLbl}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { backgroundColor: '#fff', padding: 16, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#111827' },
  headerSub: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  statsRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  stat: { flex: 1, backgroundColor: '#f9fafb', borderRadius: 10, padding: 10, alignItems: 'center' },
  statVal: { fontSize: 20, fontWeight: '700' },
  statLbl: { fontSize: 11, color: '#6b7280', marginTop: 2 },
  stationPicker: { paddingVertical: 10, paddingLeft: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  pickerLabel: { fontSize: 11, color: '#6b7280', marginBottom: 6, textTransform: 'uppercase', fontWeight: '600' },
  stChip: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14,
    backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb',
  },
  stChipActive: { backgroundColor: '#1a56db', borderColor: '#1a56db' },
  stChipTxt: { fontSize: 12, color: '#374151', fontWeight: '500' },
  stChipTxtActive: { color: '#fff' },
  list: { padding: 12, paddingBottom: 40 },
  card: {
    backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 2, elevation: 1,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardNumber: { fontSize: 15, fontWeight: '700', color: '#111827' },
  cardName: { fontSize: 13, color: '#374151', marginTop: 4 },
  cardFoot: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  statusTxt: { fontSize: 11, fontWeight: '700' },
  prioBadge: { borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  prioTxt: { fontSize: 10, fontWeight: '600' },
  dueTxt: { fontSize: 11, fontWeight: '500' },
  qtyTxt: { fontSize: 11, color: '#9ca3af', marginLeft: 'auto' },
  empty: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#111827', marginTop: 16 },
  emptyTxt: { fontSize: 14, color: '#6b7280', marginTop: 4, textAlign: 'center' },
});
