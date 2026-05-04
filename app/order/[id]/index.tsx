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
  SOLDERING_TYPES, DOC_TYPE_CONFIG, NOTE_TYPE_CONFIG, TECHNOLOGY_CONFIG, canManageOrders,
} from '@/constants/stations';
import type { OrderWithStations, Document, Note } from '@/lib/types';

type Tab = 'stations' | 'documents' | 'notes';

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const router = useRouter();
  const navigation = useNavigation();

  const [order, setOrder] = useState<OrderWithStations | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
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

  useEffect(() => {
    fetchOrder();
    fetchDocuments();
    fetchNotes();
  }, [fetchOrder, fetchDocuments, fetchNotes]);

  if (loading || !order) {
    return <View style={styles.centered}><ActivityIndicator size="large" color="#1a56db" /></View>;
  }

  const prio = PRIORITY_CONFIG[order.priority];
  const technology = TECHNOLOGY_CONFIG[order.technology ?? 'leadfree'];
  const machine = MACHINES.find(m => m.id === order.machine_id);
  const canManage = canManageOrders(profile?.role);
  const sortedStations = [...order.order_stations].sort((a, b) => a.station_id - b.station_id);

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
          <View style={[styles.metaChip, { backgroundColor: technology.bg }]}>
            <Ionicons name="flash-outline" size={13} color={technology.color} />
            <Text style={[styles.metaChipText, { color: technology.color }]}>{technology.label}</Text>
          </View>
          {order.stencil_number && (
            <View style={styles.metaChip}>
              <Ionicons name="barcode-outline" size={13} color="#6b7280" />
              <Text style={styles.metaChipText}>Planžeta {order.stencil_number}</Text>
            </View>
          )}
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
        {(['stations', 'documents', 'notes'] as Tab[]).map(t => (
          <TouchableOpacity key={t} style={[styles.tab, tab === t && styles.tabActive]} onPress={() => setTab(t)}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'stations' ? 'Stanoviště' : t === 'documents' ? `Dokumenty (${documents.length})` : `Poznámky (${notes.length})`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {tab === 'stations' && (
          <View>
            {canManage && (
              <Text style={styles.hintTxt}>
                Tip: dlouhý stisk stanoviště → zapnout/vypnout pro tuto zakázku
              </Text>
            )}
            {sortedStations.map((os, idx) => {
              const cfg = STATUS_CONFIG[os.status];
              const isLast = idx === sortedStations.length - 1;
              const soldering = SOLDERING_TYPES.find(s => s.id === os.soldering_type);
              const notUsed = !os.applicable;
              const canToggle = canManage;
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
            {canManage && (
              <TouchableOpacity style={styles.uploadBtn} onPress={() => router.push(`/order/${id}/upload`)}>
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

        {tab === 'notes' && (
          <View>
            <TouchableOpacity style={styles.uploadBtn} onPress={() => router.push(`/order/${id}/note`)}>
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
});
