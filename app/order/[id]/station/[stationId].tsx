import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Alert, ActivityIndicator, TextInput, Modal,
} from 'react-native';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import {
  STATUS_CONFIG, STATIONS, MACHINES, SOLDERING_TYPES, NOTE_TYPE_CONFIG,
} from '@/constants/stations';
import type { OrderStation, Note, StationStatus } from '@/lib/types';

type NoteType = Note['note_type'];

export default function StationDetailScreen() {
  const { id: orderId, stationId } = useLocalSearchParams<{ id: string; stationId: string }>();
  const { user } = useAuth();
  const navigation = useNavigation();

  const stationNum = Number(stationId);
  const stationInfo = STATIONS.find(s => s.id === stationNum);

  const [os, setOs] = useState<OrderStation | null>(null);
  const [machineId, setMachineId] = useState<string | null>(null);
  const [waveProgram, setWaveProgram] = useState<string | null>(null);
  const [orderQty, setOrderQty] = useState<number>(0);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // New note form
  const [noteVisible, setNoteVisible] = useState(false);
  const [noteType, setNoteType] = useState<NoteType>('note');
  const [noteContent, setNoteContent] = useState('');

  // Soldering type (only station 7)
  const [solderingType, setSolderingType] = useState<string | null>(null);

  // Scrap tracking
  const [qtyOk, setQtyOk] = useState('0');
  const [qtyRework, setQtyRework] = useState('0');
  const [qtyScrap, setQtyScrap] = useState('0');
  const [qtyReceived, setQtyReceived] = useState(0);

  // Předat dál
  const [forwardModalVisible, setForwardModalVisible] = useState(false);
  const [forwardQty, setForwardQty] = useState('');
  const [nextStationId, setNextStationId] = useState<number | null>(null);

  const fetch = useCallback(async () => {
    const [osRes, notesRes, orderRes] = await Promise.all([
      supabase.from('order_stations').select('*').eq('order_id', orderId).eq('station_id', stationNum).single(),
      supabase.from('notes').select('*').eq('order_id', orderId).eq('station_id', stationNum).order('created_at', { ascending: false }),
      supabase.from('orders').select('machine_id, wave_program, quantity').eq('id', orderId).single(),
    ]);
    if (osRes.data) {
      setOs(osRes.data);
      setSolderingType(osRes.data.soldering_type);
      setQtyOk(String(osRes.data.qty_ok ?? 0));
      setQtyRework(String(osRes.data.qty_rework ?? 0));
      setQtyScrap(String(osRes.data.qty_scrap ?? 0));
      setQtyReceived(osRes.data.qty_received ?? 0);
    }
    if (notesRes.data) setNotes(notesRes.data);
    if (orderRes.data) {
      setMachineId(orderRes.data.machine_id);
      setWaveProgram(orderRes.data.wave_program);
      setOrderQty(orderRes.data.quantity ?? 0);
    }
    setLoading(false);
  }, [orderId, stationNum]);

  useEffect(() => {
    navigation.setOptions({ title: stationInfo?.name ?? 'Stanoviště' });
    fetch();
  }, [fetch, stationInfo, navigation]);

  /** Najde další aktivní (applicable) stanoviště v pořadí po aktuálním */
  async function findNextStation(): Promise<number | null> {
    const { data } = await supabase
      .from('order_stations')
      .select('station_id, applicable, status')
      .eq('order_id', orderId)
      .eq('applicable', true)
      .gt('station_id', stationNum)
      .order('station_id', { ascending: true })
      .limit(1)
      .single();
    return data?.station_id ?? null;
  }

  async function updateStatus(newStatus: StationStatus) {
    if (!os) return;
    setSaving(true);
    const now = new Date().toISOString();
    const update: Partial<OrderStation> = {
      status: newStatus,
      operator_id: user?.id,
    };
    if (newStatus === 'in_progress' && !os.started_at) update.started_at = now;
    if (newStatus === 'completed') update.completed_at = now;
    if (stationNum === 7 && solderingType) update.soldering_type = solderingType as any;

    update.qty_ok = parseInt(qtyOk, 10) || 0;
    update.qty_rework = parseInt(qtyRework, 10) || 0;
    update.qty_scrap = parseInt(qtyScrap, 10) || 0;

    const { error } = await supabase
      .from('order_stations')
      .update(update)
      .eq('id', os.id);

    setSaving(false);
    if (error) { Alert.alert('Chyba', error.message); return; }

    await supabase.from('audit_log').insert({
      order_id: orderId,
      station_id: stationNum,
      actor_id: user?.id ?? null,
      action: 'status_change',
      payload: { from: os.status, to: newStatus },
    });

    fetch();
  }

  async function saveCounts() {
    if (!os) return;
    setSaving(true);
    const { error } = await supabase.from('order_stations').update({
      qty_ok: parseInt(qtyOk, 10) || 0,
      qty_rework: parseInt(qtyRework, 10) || 0,
      qty_scrap: parseInt(qtyScrap, 10) || 0,
    }).eq('id', os.id);
    setSaving(false);
    if (error) Alert.alert('Chyba', error.message);
    else fetch();
  }

  async function openForwardModal() {
    const nextId = await findNextStation();
    setNextStationId(nextId);
    setForwardQty(String(parseInt(qtyOk, 10) || 0));
    setForwardModalVisible(true);
  }

  async function handleForward() {
    const qty = parseInt(forwardQty, 10);
    if (!qty || qty <= 0) {
      Alert.alert('Chyba', 'Zadejte platný počet kusů.');
      return;
    }
    if (!nextStationId) {
      Alert.alert('Chyba', 'Nebylo nalezeno další aktivní stanoviště.');
      return;
    }

    setSaving(true);
    setForwardModalVisible(false);

    // Navýšíme qty_received na dalším stanovišti
    const { data: nextOs } = await supabase
      .from('order_stations')
      .select('id, qty_received, status')
      .eq('order_id', orderId)
      .eq('station_id', nextStationId)
      .single();

    if (nextOs) {
      const newReceived = (nextOs.qty_received ?? 0) + qty;
      const updateData: any = { qty_received: newReceived };
      // Pokud stanoviště čeká a dostalo první kusy, přejde do in_progress
      if (nextOs.status === 'waiting') {
        updateData.status = 'in_progress';
        updateData.started_at = new Date().toISOString();
      }
      await supabase
        .from('order_stations')
        .update(updateData)
        .eq('id', nextOs.id);
    }

    // Audit log
    await supabase.from('audit_log').insert({
      order_id: orderId,
      station_id: stationNum,
      actor_id: user?.id ?? null,
      action: 'forward_qty',
      payload: { qty, to_station: nextStationId },
    });

    setSaving(false);
    fetch();

    const nextStName = STATIONS.find((s) => s.id === nextStationId)?.name ?? String(nextStationId);
    Alert.alert('Předáno', `${qty} ks předáno na stanoviště: ${nextStName}`);
  }

  async function addNote() {
    if (!noteContent.trim()) { Alert.alert('Chyba', 'Vyplňte text poznámky.'); return; }
    const { error } = await supabase.from('notes').insert({
      order_id: orderId,
      station_id: stationNum,
      note_type: noteType,
      content: noteContent.trim(),
      author_id: user?.id,
      resolved: false,
    });
    if (error) { Alert.alert('Chyba', error.message); return; }
    setNoteContent('');
    setNoteVisible(false);
    fetch();
  }

  if (loading || !os) {
    return <View style={styles.centered}><ActivityIndicator size="large" color="#1a56db" /></View>;
  }

  const cfg = STATUS_CONFIG[os.status];
  const machine = MACHINES.find(m => m.id === machineId);
  const NOTE_TYPES: NoteType[] = ['note', 'change_request', 'issue'];
  const qtyWip = qtyReceived - ((parseInt(qtyOk, 10) || 0) + (parseInt(qtyRework, 10) || 0) + (parseInt(qtyScrap, 10) || 0));

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* Status karta */}
      <View style={[styles.statusCard, { borderLeftColor: cfg.color }]}>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Aktuální stav</Text>
          <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
            <Text style={[styles.statusBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
        </View>
        {os.started_at && <Text style={styles.timeText}>Zahájeno: {new Date(os.started_at).toLocaleString('cs-CZ')}</Text>}
        {os.completed_at && <Text style={styles.timeText}>Dokončeno: {new Date(os.completed_at).toLocaleString('cs-CZ')}</Text>}
        {stationNum === 2 && machine && (
          <View style={styles.machineRow}>
            <Ionicons name="hardware-chip-outline" size={14} color="#1d4ed8" />
            <Text style={styles.machineText}>Přiřazený automat: {machine.name}</Text>
          </View>
        )}
      </View>

      {/* Průběh kusů (§13) */}
      {qtyReceived > 0 && (
        <View style={styles.qtyFlowCard}>
          <Text style={styles.qtyFlowTitle}>Tok kusů</Text>
          <View style={styles.qtyFlowRow}>
            <QtyFlowStat label="Přišlo" value={qtyReceived} total={orderQty} color="#6b7280" />
            <QtyFlowStat label="Zpracováno" value={(parseInt(qtyOk, 10) || 0) + (parseInt(qtyRework, 10) || 0) + (parseInt(qtyScrap, 10) || 0)} total={qtyReceived} color="#1d4ed8" />
            <QtyFlowStat label="Rozpracováno" value={Math.max(0, qtyWip)} total={qtyReceived} color="#d97706" />
          </View>
        </View>
      )}

      {/* Typ pájení (jen stanoviště 7) */}
      {stationNum === 7 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Typ pájení</Text>
          <View style={styles.chipRow}>
            {SOLDERING_TYPES.map(s => (
              <TouchableOpacity
                key={s.id}
                style={[styles.chip, solderingType === s.id && styles.chipSelected]}
                onPress={() => setSolderingType(s.id)}
              >
                <Text style={[styles.chipText, solderingType === s.id && styles.chipTextSelected]}>{s.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {solderingType === 'vlna' && waveProgram && (
            <View style={styles.waveBox}>
              <Ionicons name="code-working" size={16} color="#1d4ed8" />
              <Text style={styles.waveTxt}>Program vlny: <Text style={{ fontWeight: '700' }}>{waveProgram}</Text></Text>
            </View>
          )}
        </View>
      )}

      {/* Počty kusů */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Kusy {orderQty > 0 ? `(z ${orderQty})` : ''}</Text>
        <View style={styles.countRow}>
          <CountField label="OK" value={qtyOk} onChange={setQtyOk} color="#15803d" />
          <CountField label="Oprava" value={qtyRework} onChange={setQtyRework} color="#d97706" />
          <CountField label="Zmetek" value={qtyScrap} onChange={setQtyScrap} color="#b91c1c" />
        </View>
        <View style={styles.countBtnRow}>
          <TouchableOpacity style={styles.countSaveBtn} onPress={saveCounts} disabled={saving}>
            <Text style={styles.countSaveTxt}>{saving ? 'Ukládám…' : 'Uložit počty'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.forwardBtn}
            onPress={openForwardModal}
            disabled={saving}
          >
            <Ionicons name="arrow-forward-circle" size={16} color="#fff" />
            <Text style={styles.forwardBtnTxt}>Předat dál</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Akce */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Změnit stav</Text>
        <View style={styles.actionGrid}>
          {os.status !== 'in_progress' && os.status !== 'completed' && (
            <ActionBtn icon="play-circle" label="Zahájit" color="#1a56db" onPress={() => updateStatus('in_progress')} disabled={saving} />
          )}
          {os.status === 'in_progress' && (
            <ActionBtn icon="checkmark-circle" label="Dokončit" color="#15803d" onPress={() => updateStatus('completed')} disabled={saving} />
          )}
          {os.status !== 'completed' && (
            <ActionBtn icon="warning" label="Nahlásit problém" color="#b91c1c" onPress={() => updateStatus('issue')} disabled={saving} />
          )}
          {os.status !== 'waiting' && os.status !== 'completed' && (
            <ActionBtn icon="refresh" label="Resetovat" color="#6b7280" onPress={() => updateStatus('waiting')} disabled={saving} />
          )}
          <ActionBtn
            icon="arrow-forward-circle"
            label="Přeskočit"
            color="#92400e"
            onPress={() => {
              Alert.alert('Přeskočit stanoviště?', 'Toto stanoviště bude označeno jako přeskočené.', [
                { text: 'Zrušit', style: 'cancel' },
                { text: 'Přeskočit', onPress: () => updateStatus('skipped') },
              ]);
            }}
            disabled={saving}
          />
        </View>
      </View>

      {/* Poznámky */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Poznámky ({notes.length})</Text>
          <TouchableOpacity onPress={() => setNoteVisible(!noteVisible)}>
            <Ionicons name={noteVisible ? 'chevron-up' : 'add-circle-outline'} size={22} color="#1a56db" />
          </TouchableOpacity>
        </View>

        {noteVisible && (
          <View style={styles.noteForm}>
            <View style={styles.chipRow}>
              {NOTE_TYPES.map(t => {
                const ncfg = NOTE_TYPE_CONFIG[t];
                return (
                  <TouchableOpacity
                    key={t}
                    style={[styles.chip, noteType === t && { backgroundColor: ncfg.color, borderColor: ncfg.color }]}
                    onPress={() => setNoteType(t)}
                  >
                    <Text style={[styles.chipText, noteType === t && { color: '#fff' }]}>{ncfg.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TextInput
              style={styles.noteInput}
              placeholder="Text poznámky..."
              placeholderTextColor="#9ca3af"
              multiline
              numberOfLines={3}
              value={noteContent}
              onChangeText={setNoteContent}
            />
            <TouchableOpacity style={styles.noteSubmit} onPress={addNote}>
              <Text style={styles.noteSubmitText}>Odeslat</Text>
            </TouchableOpacity>
          </View>
        )}

        {notes.map(note => {
          const ncfg = NOTE_TYPE_CONFIG[note.note_type];
          return (
            <View key={note.id} style={[styles.noteCard, note.resolved && styles.noteResolved]}>
              <View style={styles.noteHeader}>
                <View style={[styles.noteBadge, { backgroundColor: ncfg.color + '20' }]}>
                  <Text style={[styles.noteBadgeText, { color: ncfg.color }]}>{ncfg.label}</Text>
                </View>
                {note.resolved && <Ionicons name="checkmark-circle" size={16} color="#15803d" />}
              </View>
              <Text style={styles.noteContent}>{note.content}</Text>
              <Text style={styles.noteMeta}>{new Date(note.created_at).toLocaleString('cs-CZ')}</Text>
            </View>
          );
        })}

        {notes.length === 0 && !noteVisible && (
          <Text style={styles.emptyText}>Žádné poznámky k tomuto stanovišti</Text>
        )}
      </View>

      {/* Modal: Předat dál */}
      <Modal
        visible={forwardModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setForwardModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Předat dál</Text>
            {nextStationId ? (
              <Text style={styles.modalSub}>
                Předat na: <Text style={{ fontWeight: '700' }}>
                  {STATIONS.find((s) => s.id === nextStationId)?.name ?? String(nextStationId)}
                </Text>
              </Text>
            ) : (
              <Text style={[styles.modalSub, { color: '#b91c1c' }]}>
                Žádné další aktivní stanoviště.
              </Text>
            )}

            <Text style={styles.modalLabel}>Počet kusů OK k předání</Text>
            <TextInput
              style={styles.modalInput}
              keyboardType="number-pad"
              value={forwardQty}
              onChangeText={(t) => setForwardQty(t.replace(/[^0-9]/g, ''))}
              placeholder="Počet ks"
              placeholderTextColor="#9ca3af"
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setForwardModalVisible(false)}
              >
                <Text style={styles.modalCancelTxt}>Zrušit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirmBtn, !nextStationId && { opacity: 0.4 }]}
                onPress={handleForward}
                disabled={!nextStationId}
              >
                <Ionicons name="arrow-forward-circle" size={18} color="#fff" />
                <Text style={styles.modalConfirmTxt}>Předat {forwardQty || '0'} ks</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function QtyFlowStat({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <View style={styles.qtyFlowStat}>
      <Text style={[styles.qtyFlowVal, { color }]}>{value}</Text>
      <Text style={styles.qtyFlowLbl}>{label}</Text>
      <Text style={[styles.qtyFlowPct, { color }]}>{pct} %</Text>
    </View>
  );
}

function CountField({ label, value, onChange, color }: {
  label: string; value: string; onChange: (v: string) => void; color: string;
}) {
  return (
    <View style={[styles.countCard, { borderColor: color + '66' }]}>
      <Text style={[styles.countLabel, { color }]}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <TouchableOpacity onPress={() => onChange(String(Math.max(0, (parseInt(value, 10) || 0) - 1)))} style={styles.countBtn}>
          <Ionicons name="remove" size={18} color={color} />
        </TouchableOpacity>
        <TextInput
          style={[styles.countValue, { color }]}
          keyboardType="number-pad"
          value={value}
          onChangeText={(t) => onChange(t.replace(/[^0-9]/g, ''))}
        />
        <TouchableOpacity onPress={() => onChange(String((parseInt(value, 10) || 0) + 1))} style={styles.countBtn}>
          <Ionicons name="add" size={18} color={color} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function ActionBtn({ icon, label, color, onPress, disabled }: {
  icon: string; label: string; color: string;
  onPress: () => void; disabled: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.actionBtn, { borderColor: color, opacity: disabled ? 0.5 : 1 }]}
      onPress={onPress}
      disabled={disabled}
    >
      <Ionicons name={icon as any} size={20} color={color} />
      <Text style={[styles.actionBtnText, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  content: { padding: 16 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  statusCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    marginBottom: 16, borderLeftWidth: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 4, elevation: 2,
  },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  statusLabel: { fontSize: 14, color: '#374151', fontWeight: '600' },
  statusBadge: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  statusBadgeText: { fontSize: 13, fontWeight: '700' },
  timeText: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  machineRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  machineText: { fontSize: 13, color: '#1d4ed8', fontWeight: '500' },
  // Tok kusů
  qtyFlowCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 1,
  },
  qtyFlowTitle: { fontSize: 13, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  qtyFlowRow: { flexDirection: 'row', gap: 8 },
  qtyFlowStat: { flex: 1, alignItems: 'center', backgroundColor: '#f9fafb', borderRadius: 8, padding: 10 },
  qtyFlowVal: { fontSize: 22, fontWeight: '800' },
  qtyFlowLbl: { fontSize: 10, color: '#6b7280', marginTop: 2, textAlign: 'center' },
  qtyFlowPct: { fontSize: 10, fontWeight: '600', marginTop: 1 },
  section: { marginBottom: 16 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: '#fff' },
  chipSelected: { backgroundColor: '#1a56db', borderColor: '#1a56db' },
  chipText: { fontSize: 13, color: '#374151', fontWeight: '500' },
  chipTextSelected: { color: '#fff' },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: '#fff',
  },
  actionBtnText: { fontSize: 13, fontWeight: '600' },
  noteForm: { backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 12, gap: 10 },
  noteInput: {
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8,
    padding: 10, fontSize: 14, color: '#111827', height: 80, textAlignVertical: 'top',
  },
  noteSubmit: { backgroundColor: '#1a56db', borderRadius: 8, padding: 10, alignItems: 'center' },
  noteSubmitText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  noteCard: { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8 },
  noteResolved: { opacity: 0.55 },
  noteHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  noteBadge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  noteBadgeText: { fontSize: 11, fontWeight: '600' },
  noteContent: { fontSize: 14, color: '#374151', lineHeight: 20 },
  noteMeta: { fontSize: 11, color: '#9ca3af', marginTop: 6 },
  emptyText: { fontSize: 13, color: '#9ca3af', textAlign: 'center', paddingVertical: 12 },
  waveBox: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10,
    backgroundColor: '#dbeafe', padding: 10, borderRadius: 8,
  },
  waveTxt: { fontSize: 13, color: '#1d4ed8' },
  countRow: { flexDirection: 'row', gap: 8 },
  countBtnRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  countCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 10,
    padding: 10, borderWidth: 1.5, alignItems: 'center',
  },
  countLabel: { fontSize: 11, fontWeight: '700', marginBottom: 6, textTransform: 'uppercase' },
  countValue: { fontSize: 22, fontWeight: '700', minWidth: 40, textAlign: 'center', padding: 0 },
  countBtn: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: '#f3f4f6',
    alignItems: 'center', justifyContent: 'center',
  },
  countSaveBtn: {
    flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#1a56db',
    borderRadius: 8, padding: 10, alignItems: 'center',
  },
  countSaveTxt: { color: '#1a56db', fontSize: 13, fontWeight: '600' },
  forwardBtn: {
    flex: 1, backgroundColor: '#1a56db', borderRadius: 8,
    padding: 10, alignItems: 'center', flexDirection: 'row',
    justifyContent: 'center', gap: 6,
  },
  forwardBtnTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },
  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 4 },
  modalSub: { fontSize: 14, color: '#6b7280', marginBottom: 16 },
  modalLabel: { fontSize: 12, fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', marginBottom: 8 },
  modalInput: {
    borderWidth: 1.5, borderColor: '#d1d5db', borderRadius: 10,
    padding: 14, fontSize: 24, fontWeight: '700', color: '#111827',
    textAlign: 'center', marginBottom: 20,
  },
  modalBtnRow: { flexDirection: 'row', gap: 10 },
  modalCancelBtn: {
    flex: 1, borderWidth: 1, borderColor: '#e5e7eb',
    borderRadius: 10, padding: 14, alignItems: 'center',
  },
  modalCancelTxt: { fontSize: 15, color: '#374151', fontWeight: '600' },
  modalConfirmBtn: {
    flex: 2, backgroundColor: '#1a56db', borderRadius: 10,
    padding: 14, alignItems: 'center', flexDirection: 'row',
    justifyContent: 'center', gap: 8,
  },
  modalConfirmTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
