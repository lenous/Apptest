import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import {
  STATUS_CONFIG, PRIORITY_CONFIG, MACHINES,
  SOLDERING_TYPES, DOC_TYPE_CONFIG, NOTE_TYPE_CONFIG,
  PRODUCTION_EVENT_CONFIG, PRODUCTION_RESULT_CONFIG,
} from '@/constants/stations';
import type { OrderWithStations, Document, Note, ProductionEvent, AuditLog, ProductionEventType } from '@/lib/types';

type Tab = 'stations' | 'tracking' | 'history' | 'documents' | 'notes';

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const router = useRouter();
  const navigation = useNavigation();

  const [order, setOrder] = useState<OrderWithStations | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [events, setEvents] = useState<ProductionEvent[]>([]);
  const [audit, setAudit] = useState<AuditLog[]>([]);
  const [tab, setTab] = useState<Tab>('stations');
  const [loading, setLoading] = useState(true);

  const fetchOrder = useCallback(async () => {
    const { data } = await supabase
      .from('orders')
      .select('*, order_stations(*, stations(*))')
      .eq('id', id)
      .single();
    if (data) {
      setOrder(data as OrderWithStations);
      navigation.setOptions({ title: data.order_number });
    }
    setLoading(false);
  }, [id]);

  const fetchDocuments = useCallback(async () => {
    const { data } = await supabase
      .from('documents')
      .select('*')
      .eq('order_id', id)
      .order('uploaded_at', { ascending: false });
    if (data) setDocuments(data);
  }, [id]);

  const fetchNotes = useCallback(async () => {
    const { data } = await supabase
      .from('notes')
      .select('*')
      .eq('order_id', id)
      .order('created_at', { ascending: false });
    if (data) setNotes(data);
  }, [id]);

  const fetchEvents = useCallback(async () => {
    const { data } = await supabase
      .from('production_events')
      .select('*')
      .eq('order_id', id)
      .order('created_at', { ascending: false });
    if (data) setEvents(data as ProductionEvent[]);
  }, [id]);

  const fetchAudit = useCallback(async () => {
    const { data } = await supabase
      .from('audit_log')
      .select('*')
      .eq('order_id', id)
      .order('created_at', { ascending: false })
      .limit(80);
    if (data) setAudit(data as AuditLog[]);
  }, [id]);

  useEffect(() => {
    fetchOrder();
    fetchDocuments();
    fetchNotes();
    fetchEvents();
    fetchAudit();
  }, [fetchOrder, fetchDocuments, fetchNotes, fetchEvents, fetchAudit]);

  if (loading || !order) {
    return <View style={styles.centered}><ActivityIndicator size="large" color="#1a56db" /></View>;
  }

  const prio = PRIORITY_CONFIG[order.priority];
  const machine = MACHINES.find(m => m.id === order.machine_id);
  const sortedStations = [...order.order_stations].sort((a, b) => a.station_id - b.station_id);
  const trackingSummary = events.reduce<Record<ProductionEventType, {
    total: number; ok: number; nok: number; rework: number; scrap: number; count: number;
  }>>((acc, event) => {
    const current = acc[event.event_type] ?? { total: 0, ok: 0, nok: 0, rework: 0, scrap: 0, count: 0 };
    current.total += event.qty_total ?? 0;
    current.ok += event.qty_ok ?? 0;
    current.nok += event.qty_nok ?? 0;
    current.rework += event.qty_rework ?? 0;
    current.scrap += event.qty_scrap ?? 0;
    current.count += 1;
    acc[event.event_type] = current;
    return acc;
  }, {} as Record<ProductionEventType, { total: number; ok: number; nok: number; rework: number; scrap: number; count: number }>);
  const timeline = [
    ...events.map((event) => ({ kind: 'event' as const, at: event.created_at, event })),
    ...notes.map((note) => ({ kind: 'note' as const, at: note.created_at, note })),
    ...audit.map((entry) => ({ kind: 'audit' as const, at: entry.created_at, entry })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return (
    <View style={styles.container}>
      <View style={styles.orderHeader}>
        <View style={styles.orderHeaderTop}>
          <Text style={styles.orderNumber}>{order.order_number}</Text>
          <View style={[styles.prioBadge, { backgroundColor: prio.color + '20' }]}>
            <Text style={[styles.prioText, { color: prio.color }]}>{prio.label}</Text>
          </View>
        </View>
        <Text style={styles.orderName}>{order.name}</Text>
        {order.description ? <Text style={styles.orderDesc}>{order.description}</Text> : null}
        <View style={styles.orderMeta}>
          {machine && (
            <View style={styles.metaChip}>
              <Ionicons name="hardware-chip-outline" size={13} color="#1d4ed8" />
              <Text style={styles.metaChipText}>{machine.name}</Text>
            </View>
          )}
          {order.due_date && (
            <View style={styles.metaChip}>
              <Ionicons name="calendar-outline" size={13} color="#6b7280" />
              <Text style={styles.metaChipText}>{new Date(order.due_date).toLocaleDateString('cs-CZ')}</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.tabs}>
        {(['stations', 'tracking', 'history', 'documents', 'notes'] as Tab[]).map(t => (
          <TouchableOpacity key={t} style={[styles.tab, tab === t && styles.tabActive]} onPress={() => setTab(t)}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'stations'
                ? 'Stanoviště'
                : t === 'tracking'
                  ? 'Sledování'
                  : t === 'history'
                    ? 'Historie'
                    : t === 'documents'
                      ? `Dokumenty (${documents.length})`
                      : `Poznámky (${notes.length})`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {tab === 'stations' && (
          <View>
            {(profile?.role === 'dispatcher' || profile?.role === 'admin') && (
              <Text style={styles.hintTxt}>
                Tip: dlouhý stisk stanoviště → zapnout/vypnout pro tuto zakázku
              </Text>
            )}
            {sortedStations.map((os, idx) => {
              const cfg = STATUS_CONFIG[os.status];
              const isLast = idx === sortedStations.length - 1;
              const soldering = SOLDERING_TYPES.find(s => s.id === os.soldering_type);
              const notUsed = !os.applicable;
              const canToggle = profile?.role === 'dispatcher' || profile?.role === 'admin';
              return (
                <TouchableOpacity
                  key={os.id}
                  style={[styles.stationRow, notUsed && { opacity: 0.45 }]}
                  onPress={() => {
                    if (notUsed) {
                      Alert.alert('Stanoviště není potřeba', 'Toto stanoviště není pro tuto zakázku aktivní.');
                      return;
                    }
                    router.push(`/order/${id}/station/${os.station_id}`);
                  }}
                  onLongPress={() => {
                    if (!canToggle) return;
                    Alert.alert(
                      notUsed ? 'Zapnout stanoviště?' : 'Vypnout stanoviště?',
                      `${(os as any).stations?.name} – ${notUsed ? 'zakázka toto stanoviště bude potřebovat.' : 'zakázka toto stanoviště přeskočí.'}`,
                      [
                        { text: 'Zrušit', style: 'cancel' },
                        {
                          text: notUsed ? 'Zapnout' : 'Vypnout',
                          onPress: async () => {
                            await supabase.from('order_stations')
                              .update({ applicable: notUsed })
                              .eq('id', os.id);
                            fetchOrder();
                          },
                        },
                      ],
                    );
                  }}
                >
                  <View style={styles.timelineCol}>
                    <View style={[styles.timelineDot, { backgroundColor: notUsed ? '#d1d5db' : cfg.color }]} />
                    {!isLast && <View style={styles.timelineLine} />}
                  </View>
                  <View style={[styles.stationCard, { borderLeftColor: notUsed ? '#d1d5db' : cfg.color }]}>
                    <View style={styles.stationCardHeader}>
                      <Text style={styles.stationName}>
                        {idx + 1}. {(os as any).stations?.name}
                        {notUsed ? '  (nepoužito)' : ''}
                      </Text>
                      <View style={[styles.statusBadge, { backgroundColor: notUsed ? '#f3f4f6' : cfg.bg }]}>
                        <Text style={[styles.statusText, { color: notUsed ? '#6b7280' : cfg.color }]}>
                          {notUsed ? '—' : cfg.label}
                        </Text>
                      </View>
                    </View>
                    {os.station_id === 2 && order.machine_id && (
                      <Text style={styles.stationDetail}>
                        Automat: {machine?.name}
                      </Text>
                    )}
                    {os.station_id === 7 && soldering && (
                      <Text style={styles.stationDetail}>Typ: {soldering.name}</Text>
                    )}
                    {os.started_at && (
                      <Text style={styles.stationTime}>Zahájeno: {new Date(os.started_at).toLocaleString('cs-CZ')}</Text>
                    )}
                    {os.completed_at && (
                      <Text style={styles.stationTime}>Dokončeno: {new Date(os.completed_at).toLocaleString('cs-CZ')}</Text>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {tab === 'documents' && (
          <View>
            {(profile?.role === 'dispatcher' || profile?.role === 'admin') && (
              <TouchableOpacity style={styles.uploadBtn} onPress={() => router.push(`/order/${id}/upload` as any)}>
                <Ionicons name="cloud-upload-outline" size={20} color="#1a56db" />
                <Text style={styles.uploadBtnText}>Nahrát dokument</Text>
              </TouchableOpacity>
            )}
            {documents.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="documents-outline" size={40} color="#d1d5db" />
                <Text style={styles.emptyText}>Žádné dokumenty</Text>
              </View>
            ) : (
              documents.map(doc => {
                const cfg = DOC_TYPE_CONFIG[doc.doc_type];
                return (
                  <TouchableOpacity
                    key={doc.id}
                    style={styles.docRow}
                    onPress={() => router.push(`/order/${id}/document/${doc.id}`)}
                  >
                    <View style={styles.docIcon}>
                      <Ionicons name={cfg.icon as any} size={22} color="#1d4ed8" />
                    </View>
                    <View style={styles.docInfo}>
                      <Text style={styles.docName} numberOfLines={1}>{doc.file_name}</Text>
                      <Text style={styles.docMeta}>
                        {cfg.label} · {doc.file_size ? `${Math.round(doc.file_size / 1024)} KB` : ''} · {new Date(doc.uploaded_at).toLocaleDateString('cs-CZ')}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        )}

        {tab === 'tracking' && (
          <View>
            {events.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="analytics-outline" size={40} color="#d1d5db" />
                <Text style={styles.emptyText}>Žádné výrobní záznamy</Text>
              </View>
            ) : (
              (Object.keys(trackingSummary) as ProductionEventType[]).map((type) => {
                const cfg = PRODUCTION_EVENT_CONFIG[type];
                const row = trackingSummary[type];
                return (
                  <View key={type} style={styles.trackCard}>
                    <View style={styles.trackHeader}>
                      <View style={[styles.trackIcon, { backgroundColor: cfg.color + '20' }]}>
                        <Ionicons name={cfg.icon as any} size={18} color={cfg.color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.trackTitle}>{cfg.label}</Text>
                        <Text style={styles.trackMeta}>{row.count} záznamů</Text>
                      </View>
                    </View>
                    <View style={styles.trackStats}>
                      <TrackStat label="Celkem" value={row.total} color="#6b7280" />
                      <TrackStat label="OK/Pass" value={row.ok} color="#15803d" />
                      <TrackStat label="NOK/Fail" value={row.nok} color="#b91c1c" />
                      <TrackStat label="Oprava" value={row.rework} color="#d97706" />
                      <TrackStat label="Zmetek" value={row.scrap} color="#991b1b" />
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}

        {tab === 'history' && (
          <View>
            {timeline.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="time-outline" size={40} color="#d1d5db" />
                <Text style={styles.emptyText}>Historie je prázdná</Text>
              </View>
            ) : (
              timeline.map((item, idx) => {
                if (item.kind === 'event') {
                  const event = item.event;
                  const cfg = PRODUCTION_EVENT_CONFIG[event.event_type];
                  const rcfg = PRODUCTION_RESULT_CONFIG[event.result];
                  return (
                    <View key={`event-${event.id}`} style={styles.timelineItem}>
                      <View style={[styles.timelineIcon, { backgroundColor: cfg.color + '20' }]}>
                        <Ionicons name={cfg.icon as any} size={16} color={cfg.color} />
                      </View>
                      <View style={styles.timelineBody}>
                        <View style={styles.timelineTop}>
                          <Text style={styles.timelineTitle}>{cfg.label}</Text>
                          <View style={[styles.resultBadge, { backgroundColor: rcfg.bg }]}>
                            <Text style={[styles.resultTxt, { color: rcfg.color }]}>{rcfg.label}</Text>
                          </View>
                        </View>
                        <Text style={styles.timelineText}>
                          Celkem {event.qty_total} · OK {event.qty_ok} · NOK {event.qty_nok} · Oprava {event.qty_rework} · Zmetek {event.qty_scrap}
                        </Text>
                        {event.note ? <Text style={styles.timelineText}>{event.note}</Text> : null}
                        <Text style={styles.timelineTime}>{new Date(event.created_at).toLocaleString('cs-CZ')}</Text>
                      </View>
                    </View>
                  );
                }
                if (item.kind === 'note') {
                  const note = item.note;
                  const cfg = NOTE_TYPE_CONFIG[note.note_type];
                  return (
                    <View key={`note-${note.id}`} style={styles.timelineItem}>
                      <View style={[styles.timelineIcon, { backgroundColor: cfg.color + '20' }]}>
                        <Ionicons name="chatbox-outline" size={16} color={cfg.color} />
                      </View>
                      <View style={styles.timelineBody}>
                        <Text style={styles.timelineTitle}>{cfg.label}</Text>
                        <Text style={styles.timelineText}>{note.content}</Text>
                        <Text style={styles.timelineTime}>{new Date(note.created_at).toLocaleString('cs-CZ')}</Text>
                      </View>
                    </View>
                  );
                }
                const entry = item.entry;
                return (
                  <View key={`audit-${entry.id}-${idx}`} style={styles.timelineItem}>
                    <View style={[styles.timelineIcon, { backgroundColor: '#f3f4f6' }]}>
                      <Ionicons name="shield-checkmark-outline" size={16} color="#6b7280" />
                    </View>
                    <View style={styles.timelineBody}>
                      <Text style={styles.timelineTitle}>{entry.action}</Text>
                      <Text style={styles.timelineTime}>{new Date(entry.created_at).toLocaleString('cs-CZ')}</Text>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}

        {tab === 'notes' && (
          <View>
            <TouchableOpacity style={styles.uploadBtn} onPress={() => router.push(`/order/${id}/note` as any)}>
              <Ionicons name="add-circle-outline" size={20} color="#1a56db" />
              <Text style={styles.uploadBtnText}>Přidat poznámku</Text>
            </TouchableOpacity>
            {notes.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="chatbox-outline" size={40} color="#d1d5db" />
                <Text style={styles.emptyText}>Žádné poznámky</Text>
              </View>
            ) : (
              notes.map(note => {
                const cfg = NOTE_TYPE_CONFIG[note.note_type];
                return (
                  <View key={note.id} style={[styles.noteCard, note.resolved && styles.noteResolved]}>
                    <View style={styles.noteHeader}>
                      <View style={[styles.noteBadge, { backgroundColor: cfg.color + '20' }]}>
                        <Text style={[styles.noteBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
                      </View>
                      {note.resolved && (
                        <View style={styles.resolvedBadge}>
                          <Ionicons name="checkmark-circle" size={14} color="#15803d" />
                          <Text style={styles.resolvedText}>Vyřešeno</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.noteContent}>{note.content}</Text>
                    <Text style={styles.noteMeta}>{new Date(note.created_at).toLocaleString('cs-CZ')}</Text>
                  </View>
                );
              })
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function TrackStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.trackStat}>
      <Text style={[styles.trackStatValue, { color }]}>{value}</Text>
      <Text style={styles.trackStatLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  orderHeader: { backgroundColor: '#fff', padding: 16, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  orderHeaderTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  orderNumber: { fontSize: 18, fontWeight: '800', color: '#111827' },
  orderName: { fontSize: 15, color: '#374151', marginBottom: 4 },
  orderDesc: { fontSize: 13, color: '#6b7280', marginBottom: 8 },
  prioBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  prioText: { fontSize: 12, fontWeight: '600' },
  orderMeta: { flexDirection: 'row', gap: 8, marginTop: 4 },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#f3f4f6', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  metaChipText: { fontSize: 12, color: '#374151' },
  tabs: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#1a56db' },
  tabText: { fontSize: 13, color: '#6b7280', fontWeight: '500' },
  tabTextActive: { color: '#1a56db', fontWeight: '700' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },
  stationRow: { flexDirection: 'row', marginBottom: 4 },
  timelineCol: { width: 24, alignItems: 'center', paddingTop: 14 },
  timelineDot: { width: 12, height: 12, borderRadius: 6 },
  timelineLine: { flex: 1, width: 2, backgroundColor: '#e5e7eb', marginTop: 2, marginBottom: -4 },
  stationCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 10, padding: 12,
    marginLeft: 8, marginBottom: 8, borderLeftWidth: 3,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 3, elevation: 1,
  },
  stationCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stationName: { fontSize: 14, fontWeight: '600', color: '#111827', flex: 1 },
  statusBadge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, marginLeft: 8 },
  statusText: { fontSize: 11, fontWeight: '600' },
  stationDetail: { fontSize: 12, color: '#6b7280', marginTop: 4 },
  stationTime: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  uploadBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#eff6ff', borderRadius: 10, padding: 12, marginBottom: 12,
    borderWidth: 1, borderColor: '#bfdbfe', borderStyle: 'dashed',
  },
  uploadBtnText: { color: '#1a56db', fontSize: 14, fontWeight: '600' },
  docRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 10, padding: 12, marginBottom: 8, gap: 10,
  },
  docIcon: { width: 40, height: 40, borderRadius: 8, backgroundColor: '#eff6ff', justifyContent: 'center', alignItems: 'center' },
  docInfo: { flex: 1 },
  docName: { fontSize: 14, fontWeight: '600', color: '#111827' },
  docMeta: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  noteCard: { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8 },
  noteResolved: { opacity: 0.6 },
  noteHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  noteBadge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  noteBadgeText: { fontSize: 11, fontWeight: '600' },
  resolvedBadge: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  resolvedText: { fontSize: 11, color: '#15803d' },
  noteContent: { fontSize: 14, color: '#374151', lineHeight: 20 },
  noteMeta: { fontSize: 11, color: '#9ca3af', marginTop: 6 },
  hintTxt: {
    fontSize: 12, color: '#6b7280', backgroundColor: '#f9fafb',
    padding: 8, borderRadius: 6, marginBottom: 10,
  },
  empty: { alignItems: 'center', paddingTop: 40 },
  emptyText: { fontSize: 14, color: '#9ca3af', marginTop: 10 },
  trackCard: {
    backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 2, elevation: 1,
  },
  trackHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  trackIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  trackTitle: { fontSize: 14, fontWeight: '700', color: '#111827' },
  trackMeta: { fontSize: 11, color: '#6b7280', marginTop: 1 },
  trackStats: { flexDirection: 'row', gap: 6 },
  trackStat: { flex: 1, backgroundColor: '#f9fafb', borderRadius: 8, padding: 8, alignItems: 'center' },
  trackStatValue: { fontSize: 16, fontWeight: '800' },
  trackStatLabel: { fontSize: 9, color: '#6b7280', textAlign: 'center', marginTop: 2 },
  timelineItem: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  timelineIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  timelineBody: { flex: 1, backgroundColor: '#fff', borderRadius: 10, padding: 12 },
  timelineTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  timelineTitle: { fontSize: 13, fontWeight: '700', color: '#111827' },
  timelineText: { fontSize: 12, color: '#374151', marginTop: 4, lineHeight: 17 },
  timelineTime: { fontSize: 11, color: '#9ca3af', marginTop: 6 },
  resultBadge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  resultTxt: { fontSize: 10, fontWeight: '700' },
});
