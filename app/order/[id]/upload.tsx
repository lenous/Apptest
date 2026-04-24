import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { DOC_TYPE_CONFIG } from '@/constants/stations';
import type { DocType } from '@/lib/types';

const DOC_TYPES: DocType[] = ['bom', 'drawing', 'routing_sheet', 'other'];

export default function UploadScreen() {
  const { id: orderId } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();

  const [docType, setDocType] = useState<DocType>('bom');
  const [file, setFile] = useState<{ name: string; uri: string; size?: number; mimeType?: string } | null>(null);
  const [uploading, setUploading] = useState(false);

  async function pickFile() {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/jpeg', 'image/png',
             'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
      copyToCacheDirectory: true,
    });
    if (!result.canceled && result.assets[0]) {
      setFile(result.assets[0]);
    }
  }

  async function handleUpload() {
    if (!file) { Alert.alert('Chyba', 'Vyberte soubor.'); return; }
    setUploading(true);

    const ext = file.name.split('.').pop() ?? 'bin';
    const filePath = `${orderId}/${Date.now()}.${ext}`;

    // Read file as ArrayBuffer
    const response = await fetch(file.uri);
    const arrayBuffer = await response.arrayBuffer();

    const { error: uploadError } = await supabase.storage
      .from('order-documents')
      .upload(filePath, arrayBuffer, { contentType: file.mimeType ?? 'application/octet-stream' });

    if (uploadError) {
      setUploading(false);
      Alert.alert('Chyba při nahrávání', uploadError.message);
      return;
    }

    const { error: dbError } = await supabase.from('documents').insert({
      order_id: orderId,
      doc_type: docType,
      file_name: file.name,
      file_path: filePath,
      file_size: file.size ?? null,
      mime_type: file.mimeType ?? null,
      uploaded_by: user?.id,
    });

    setUploading(false);
    if (dbError) { Alert.alert('Chyba', dbError.message); return; }
    Alert.alert('Hotovo', 'Dokument byl nahrán.', [{ text: 'OK', onPress: () => router.back() }]);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Typ dokumentu</Text>
        <View style={styles.chipRow}>
          {DOC_TYPES.map(t => {
            const cfg = DOC_TYPE_CONFIG[t];
            return (
              <TouchableOpacity
                key={t}
                style={[styles.chip, docType === t && styles.chipSelected]}
                onPress={() => setDocType(t)}
              >
                <Ionicons name={cfg.icon as any} size={14} color={docType === t ? '#fff' : '#374151'} />
                <Text style={[styles.chipText, docType === t && styles.chipTextSelected]}>{cfg.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <TouchableOpacity style={styles.pickerBtn} onPress={pickFile}>
        {file ? (
          <View style={styles.fileInfo}>
            <Ionicons name="document" size={28} color="#1a56db" />
            <View style={{ flex: 1 }}>
              <Text style={styles.fileName} numberOfLines={2}>{file.name}</Text>
              {file.size && <Text style={styles.fileSize}>{Math.round(file.size / 1024)} KB</Text>}
            </View>
            <Ionicons name="swap-horizontal" size={18} color="#6b7280" />
          </View>
        ) : (
          <View style={styles.pickerEmpty}>
            <Ionicons name="cloud-upload-outline" size={40} color="#93c5fd" />
            <Text style={styles.pickerText}>Klepněte pro výběr souboru</Text>
            <Text style={styles.pickerHint}>PDF, JPG, PNG, XLS, XLSX</Text>
          </View>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.uploadBtn, (!file || uploading) && styles.uploadBtnDisabled]}
        onPress={handleUpload}
        disabled={!file || uploading}
      >
        {uploading ? <ActivityIndicator color="#fff" /> : (
          <>
            <Ionicons name="cloud-upload" size={20} color="#fff" />
            <Text style={styles.uploadBtnText}>Nahrát dokument</Text>
          </>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  content: { padding: 16 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#fff' },
  chipSelected: { backgroundColor: '#1a56db', borderColor: '#1a56db' },
  chipText: { fontSize: 13, color: '#374151', fontWeight: '500' },
  chipTextSelected: { color: '#fff' },
  pickerBtn: {
    backgroundColor: '#fff', borderRadius: 16, borderWidth: 2, borderColor: '#bfdbfe',
    borderStyle: 'dashed', marginBottom: 20, overflow: 'hidden',
  },
  pickerEmpty: { alignItems: 'center', padding: 32, gap: 8 },
  pickerText: { fontSize: 15, color: '#374151', fontWeight: '500' },
  pickerHint: { fontSize: 12, color: '#9ca3af' },
  fileInfo: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  fileName: { fontSize: 14, fontWeight: '600', color: '#111827' },
  fileSize: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  uploadBtn: {
    backgroundColor: '#1a56db', borderRadius: 12, padding: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  uploadBtnDisabled: { opacity: 0.5 },
  uploadBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
