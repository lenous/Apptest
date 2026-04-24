import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  Alert, ActivityIndicator, ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { NOTE_TYPE_CONFIG, STATIONS } from '@/constants/stations';
import type { NoteType } from '@/lib/types';

const NOTE_TYPES: NoteType[] = ['note', 'change_request', 'issue'];

export default function AddNoteScreen() {
  const { id: orderId } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();

  const [noteType, setNoteType] = useState<NoteType>('note');
  const [stationId, setStationId] = useState<number | null>(null);
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!content.trim()) { Alert.alert('Chyba', 'Vyplňte text poznámky.'); return; }
    setSaving(true);
    const { error } = await supabase.from('notes').insert({
      order_id: orderId,
      station_id: stationId,
      note_type: noteType,
      content: content.trim(),
      author_id: user?.id,
      resolved: false,
    });
    setSaving(false);
    if (error) { Alert.alert('Chyba', error.message); return; }
    router.back();
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.section}>
        <Text style={styles.label}>Typ poznámky</Text>
        <View style={styles.chipRow}>
          {NOTE_TYPES.map(t => {
            const cfg = NOTE_TYPE_CONFIG[t];
            return (
              <TouchableOpacity
                key={t}
                style={[styles.chip, noteType === t && { backgroundColor: cfg.color, borderColor: cfg.color }]}
                onPress={() => setNoteType(t)}
              >
                <Text style={[styles.chipText, noteType === t && { color: '#fff' }]}>{cfg.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Stanoviště (volitelné)</Text>
        <View style={styles.chipRow}>
          <TouchableOpacity
            style={[styles.chip, stationId === null && styles.chipSelected]}
            onPress={() => setStationId(null)}
          >
            <Text style={[styles.chipText, stationId === null && styles.chipTextSelected]}>Obecná</Text>
          </TouchableOpacity>
          {STATIONS.map(s => (
            <TouchableOpacity
              key={s.id}
              style={[styles.chip, stationId === s.id && styles.chipSelected]}
              onPress={() => setStationId(s.id)}
            >
              <Text style={[styles.chipText, stationId === s.id && styles.chipTextSelected]}>{s.id}. {s.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Text poznámky *</Text>
        <TextInput
          style={styles.textarea}
          placeholder="Napište poznámku, žádost o úpravu nebo popis problému..."
          placeholderTextColor="#9ca3af"
          multiline
          numberOfLines={5}
          value={content}
          onChangeText={setContent}
        />
      </View>

      <TouchableOpacity
        style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
        onPress={handleSave}
        disabled={saving}
      >
        {saving ? <ActivityIndicator color="#fff" /> : (
          <>
            <Ionicons name="send" size={18} color="#fff" />
            <Text style={styles.saveBtnText}>Odeslat poznámku</Text>
          </>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  content: { padding: 16, paddingBottom: 40 },
  section: { marginBottom: 20 },
  label: { fontSize: 13, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: '#fff' },
  chipSelected: { backgroundColor: '#1a56db', borderColor: '#1a56db' },
  chipText: { fontSize: 12, color: '#374151', fontWeight: '500' },
  chipTextSelected: { color: '#fff' },
  textarea: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 12,
    padding: 12, fontSize: 15, color: '#111827', height: 120, textAlignVertical: 'top',
  },
  saveBtn: {
    backgroundColor: '#1a56db', borderRadius: 12, padding: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
