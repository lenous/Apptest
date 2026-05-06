import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/context/ThemeContext';
import { STATIONS, MACHINES } from '@/constants/stations';

type KpiData = {
  totalOrders: number;
  completedOrders: number;
  overdueOrders: number;
  onTimeOrders: number;
  totalParts: number;
  okParts: number;
  reworkParts: number;
  scrapParts: number;
  machineUsage: { machineId: string; name: string; orderCount: number }[];
  stationAvgTime: { stationId: number; name: string; avgMinutes: number | null }[];
  topIssueProducts: { name: string; code: string; issueCount: number }[];
};

export default function KpiScreen() {
  const { colors, isDark } = useTheme();
  const [kpi, setKpi] = useState<KpiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('30d');

  const fetchKpi = useCallback(async () => {
    try {
      const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
      const since = new Date();
      since.setDate(since.getDate() - days);
      const sinceISO = since.toISOString();

      const [ordersRes, stationsRes] = await Promise.all([
        supabase
          .from('orders')
          .select('id, due_date, created_at, machine_id, hidden_at, products(code, name)')
          .gte('created_at', sinceISO),
        supabase
          .from('order_stations')
          .select('order_id, station_id, status, qty_ok, qty_rework, qty_scrap, started_at, completed_at')
          .gte('updated_at', sinceISO),
      ]);

      const orders = ordersRes.data ?? [];
      const stations = stationsRes.data ?? [];

      // OTD
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      const completedOrderIds = new Set(
        stations
          .filter((s) => s.status === 'completed')
          .map((s) => s.order_id)
      );
      let completed = 0, onTime = 0, overdue = 0;
      for (const o of orders) {
        const allDone = stations
          .filter((s) => s.order_id === o.id)
          .every((s) => s.status === 'completed' || s.status === 'skipped');
        if (allDone) {
          completed++;
          if (o.due_date) {
            const due = new Date(o.due_date);
            onTime++;
            if (due < today) overdue++;
          } else {
            onTime++;
          }
        } else if (o.due_date && new Date(o.due_date) < today) {
          overdue++;
        }
      }

      // FPY
      let totalParts = 0, okParts = 0, reworkParts = 0, scrapParts = 0;
      for (const s of stations) {
        okParts += s.qty_ok ?? 0;
        reworkParts += s.qty_rework ?? 0;
        scrapParts += s.qty_scrap ?? 0;
      }
      totalParts = okParts + reworkParts + scrapParts;

      // Vytížení automatů
      const machineCounts: Record<string, number> = {};
      for (const o of orders) {
        if (o.machine_id) {
          machineCounts[o.machine_id] = (machineCounts[o.machine_id] ?? 0) + 1;
        }
      }
      const machineUsage = MACHINES.map((m) => ({
        machineId: m.id,
        name: m.name,
        orderCount: machineCounts[m.id] ?? 0,
      })).sort((a, b) => b.orderCount - a.orderCount);

      // Průměrný čas na stanovišti
      const stationTimes: Record<number, number[]> = {};
      for (const s of stations) {
        if (s.started_at && s.completed_at) {
          const diff = (new Date(s.completed_at).getTime() - new Date(s.started_at).getTime()) / 60000;
          if (!stationTimes[s.station_id]) stationTimes[s.station_id] = [];
          stationTimes[s.station_id].push(diff);
        }
      }
      const stationAvgTime = STATIONS.map((st) => {
        const times = stationTimes[st.id];
        const avg = times?.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null;
        return { stationId: st.id, name: st.name, avgMinutes: avg };
      });

      // Top problémové produkty (s issue na stanovišti)
      const issueStations = stations.filter((s) => s.status === 'issue');
      const productIssues: Record<string, { name: string; code: string; count: number }> = {};
      for (const s of issueStations) {
        const order = orders.find((o) => o.id === s.order_id);
        if (order?.products) {
          const p = order.products as any;
          const key = p.code ?? p.name ?? 'unknown';
          if (!productIssues[key]) productIssues[key] = { name: p.name ?? '', code: p.code ?? '', count: 0 };
          productIssues[key].count++;
        }
      }
      const topIssueProducts = Object.values(productIssues)
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
        .map((p) => ({ name: p.name, code: p.code, issueCount: p.count }));

      setKpi({
        totalOrders: orders.length,
        completedOrders: completed,
        overdueOrders: overdue,
        onTimeOrders: onTime,
        totalParts,
        okParts,
        reworkParts,
        scrapParts,
        machineUsage,
        stationAvgTime,
        topIssueProducts,
      });
    } catch (err) {
      console.error('KPI fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period]);

  useEffect(() => { fetchKpi(); }, [fetchKpi]);

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scroll: { padding: 16 },
    periodRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
    periodChip: {
      paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16,
      backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    },
    periodChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    periodChipTxt: { fontSize: 12, color: colors.textSecondary, fontWeight: '500' },
    periodChipTxtActive: { color: '#fff' },
    section: { marginBottom: 20 },
    sectionTitle: {
      fontSize: 12, fontWeight: '700', color: colors.textSecondary,
      textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10,
    },
    row: { flexDirection: 'row', gap: 10 },
    kpiCard: {
      flex: 1, backgroundColor: colors.card, borderRadius: 12, padding: 14,
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
      shadowOpacity: isDark ? 0.3 : 0.07, shadowRadius: 4, elevation: 2,
    },
    kpiValue: { fontSize: 26, fontWeight: '800', color: colors.text },
    kpiLabel: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
    kpiSub: { fontSize: 11, color: colors.textSecondary, marginTop: 4 },
    barContainer: { marginBottom: 10 },
    barLabel: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
    barLabelTxt: { fontSize: 13, color: colors.text, fontWeight: '500' },
    barLabelVal: { fontSize: 13, color: colors.textSecondary },
    bar: { height: 8, backgroundColor: colors.border, borderRadius: 4, overflow: 'hidden' },
    barFill: { height: 8, borderRadius: 4 },
    issueRow: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    issueProduct: { fontSize: 13, color: colors.text, fontWeight: '500' },
    issueCode: { fontSize: 11, color: colors.textSecondary },
    issueBadge: { backgroundColor: '#fee2e2', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
    issueBadgeTxt: { fontSize: 12, color: '#b91c1c', fontWeight: '700' },
    empty: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', paddingVertical: 12 },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
  });

  if (loading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const otdPct = kpi && kpi.totalOrders > 0
    ? Math.round((kpi.onTimeOrders / kpi.totalOrders) * 100)
    : 0;
  const fpyPct = kpi && kpi.totalParts > 0
    ? Math.round((kpi.okParts / kpi.totalParts) * 100)
    : 0;
  const completionPct = kpi && kpi.totalOrders > 0
    ? Math.round((kpi.completedOrders / kpi.totalOrders) * 100)
    : 0;

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={s.scroll}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchKpi(); }} />}
    >
      {/* Výběr období */}
      <View style={s.periodRow}>
        {(['7d', '30d', '90d'] as const).map((p) => (
          <TouchableOpacity
            key={p}
            style={[s.periodChip, period === p && s.periodChipActive]}
            onPress={() => setPeriod(p)}
          >
            <Text style={[s.periodChipTxt, period === p && s.periodChipTxtActive]}>
              {p === '7d' ? '7 dní' : p === '30d' ? '30 dní' : '90 dní'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Hlavní KPI */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>Klíčové ukazatele</Text>
        <View style={s.row}>
          <View style={s.kpiCard}>
            <Text style={[s.kpiValue, { color: otdPct >= 90 ? colors.success : otdPct >= 70 ? colors.warning : colors.danger }]}>
              {otdPct} %
            </Text>
            <Text style={s.kpiLabel}>OTD – včas dodáno</Text>
            <Text style={s.kpiSub}>{kpi?.onTimeOrders}/{kpi?.totalOrders} zakázek</Text>
          </View>
          <View style={s.kpiCard}>
            <Text style={[s.kpiValue, { color: fpyPct >= 95 ? colors.success : fpyPct >= 85 ? colors.warning : colors.danger }]}>
              {fpyPct} %
            </Text>
            <Text style={s.kpiLabel}>FPY – bez chyb</Text>
            <Text style={s.kpiSub}>{kpi?.okParts}/{kpi?.totalParts} ks</Text>
          </View>
        </View>
        <View style={[s.row, { marginTop: 10 }]}>
          <View style={s.kpiCard}>
            <Text style={[s.kpiValue, { color: colors.text }]}>{completionPct} %</Text>
            <Text style={s.kpiLabel}>Dokončení zakázek</Text>
            <Text style={s.kpiSub}>{kpi?.completedOrders} dokončeno</Text>
          </View>
          <View style={s.kpiCard}>
            <Text style={[s.kpiValue, { color: (kpi?.overdueOrders ?? 0) > 0 ? colors.danger : colors.success }]}>
              {kpi?.overdueOrders ?? 0}
            </Text>
            <Text style={s.kpiLabel}>Po termínu</Text>
            <Text style={s.kpiSub}>z {kpi?.totalOrders} zakázek</Text>
          </View>
        </View>
      </View>

      {/* Výstup kvality */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>Kvalita výstupu</Text>
        <View style={s.kpiCard}>
          {[
            { label: 'OK', value: kpi?.okParts ?? 0, total: kpi?.totalParts ?? 1, color: '#15803d' },
            { label: 'Na opravu', value: kpi?.reworkParts ?? 0, total: kpi?.totalParts ?? 1, color: '#d97706' },
            { label: 'Zmetek', value: kpi?.scrapParts ?? 0, total: kpi?.totalParts ?? 1, color: '#b91c1c' },
          ].map(({ label, value, total, color }) => {
            const pct = total > 0 ? (value / total) * 100 : 0;
            return (
              <View key={label} style={s.barContainer}>
                <View style={s.barLabel}>
                  <Text style={s.barLabelTxt}>{label}</Text>
                  <Text style={s.barLabelVal}>{value} ks ({Math.round(pct)} %)</Text>
                </View>
                <View style={s.bar}>
                  <View style={[s.barFill, { width: `${pct}%`, backgroundColor: color }]} />
                </View>
              </View>
            );
          })}
        </View>
      </View>

      {/* Vytížení automatů */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>Vytížení automatů</Text>
        <View style={s.kpiCard}>
          {(kpi?.machineUsage ?? []).map((m) => {
            const maxCount = Math.max(...(kpi?.machineUsage.map((x) => x.orderCount) ?? [1]), 1);
            const pct = maxCount > 0 ? (m.orderCount / maxCount) * 100 : 0;
            return (
              <View key={m.machineId} style={s.barContainer}>
                <View style={s.barLabel}>
                  <Text style={s.barLabelTxt}>{m.name}</Text>
                  <Text style={s.barLabelVal}>{m.orderCount} zakázek</Text>
                </View>
                <View style={s.bar}>
                  <View style={[s.barFill, { width: `${pct}%`, backgroundColor: colors.primary }]} />
                </View>
              </View>
            );
          })}
          {(kpi?.machineUsage ?? []).every((m) => m.orderCount === 0) && (
            <Text style={s.empty}>Žádné zakázky s přiřazeným automatem</Text>
          )}
        </View>
      </View>

      {/* Průměrné časy na stanovišti */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>Průměrné časy na stanovišti</Text>
        <View style={s.kpiCard}>
          {(kpi?.stationAvgTime ?? [])
            .filter((st) => st.avgMinutes !== null)
            .map((st) => (
              <View key={st.stationId} style={s.barContainer}>
                <View style={s.barLabel}>
                  <Text style={s.barLabelTxt} numberOfLines={1}>{st.stationId}. {st.name}</Text>
                  <Text style={s.barLabelVal}>
                    {st.avgMinutes! >= 60
                      ? `${Math.floor(st.avgMinutes! / 60)}h ${st.avgMinutes! % 60}min`
                      : `${st.avgMinutes} min`}
                  </Text>
                </View>
              </View>
            ))}
          {(kpi?.stationAvgTime ?? []).every((st) => st.avgMinutes === null) && (
            <Text style={s.empty}>Žádná dokončená stanoviště s časomírou</Text>
          )}
        </View>
      </View>

      {/* Top problémové produkty */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>Nejproblémovější produkty</Text>
        <View style={s.kpiCard}>
          {(kpi?.topIssueProducts ?? []).length === 0 ? (
            <Text style={s.empty}>Žádné problémy v tomto období 🎉</Text>
          ) : (
            (kpi?.topIssueProducts ?? []).map((p, i) => (
              <View key={i} style={s.issueRow}>
                <View>
                  <Text style={s.issueProduct}>{p.name || 'Neznámý produkt'}</Text>
                  {p.code ? <Text style={s.issueCode}>{p.code}</Text> : null}
                </View>
                <View style={s.issueBadge}>
                  <Text style={s.issueBadgeTxt}>{p.issueCount}×</Text>
                </View>
              </View>
            ))
          )}
        </View>
      </View>
    </ScrollView>
  );
}
