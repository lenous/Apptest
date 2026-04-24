import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, Alert,
  TouchableOpacity, Image, Linking,
} from 'react-native';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { DOC_TYPE_CONFIG } from '@/constants/stations';
import type { Document } from '@/lib/types';

export default function DocumentViewerScreen() {
  const { id: orderId, docId } = useLocalSearchParams<{ id: string; docId: string }>();
  const navigation = useNavigation();

  const [doc, setDoc] = useState<Document | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: docData } = await supabase
        .from('documents')
        .select('*')
        .eq('id', docId)
        .single();

      if (!docData) { setLoading(false); return; }
      setDoc(docData);
      navigation.setOptions({ title: docData.file_name });

      const { data: urlData } = await supabase.storage
        .from('order-documents')
        .createSignedUrl(docData.file_path, 3600);

      if (urlData) setSignedUrl(urlData.signedUrl);
      setLoading(false);
    }
    load();
  }, [docId, navigation]);

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color="#1a56db" /></View>;
  }

  if (!doc || !signedUrl) {
    return (
      <View style={styles.centered}>
        <Ionicons name="alert-circle-outline" size={48} color="#ef4444" />
        <Text style={styles.errorText}>Dokument nelze načíst</Text>
      </View>
    );
  }

  const cfg = DOC_TYPE_CONFIG[doc.doc_type];
  const isImage = doc.mime_type?.startsWith('image/');
  const isPdf = doc.mime_type === 'application/pdf';

  return (
    <View style={styles.container}>
      <View style={styles.docHeader}>
        <View style={styles.docIconContainer}>
          <Ionicons name={cfg.icon as any} size={28} color="#1d4ed8" />
        </View>
        <View style={styles.docHeaderInfo}>
          <Text style={styles.docName} numberOfLines={2}>{doc.file_name}</Text>
          <Text style={styles.docMeta}>
            {cfg.label}
            {doc.file_size ? ` · ${Math.round(doc.file_size / 1024)} KB` : ''}
            {` · ${new Date(doc.uploaded_at).toLocaleDateString('cs-CZ')}`}
          </Text>
        </View>
      </View>

      {isImage && signedUrl ? (
        <Image
          source={{ uri: signedUrl }}
          style={styles.image}
          resizeMode="contain"
        />
      ) : (
        <View style={styles.previewPlaceholder}>
          <Ionicons name="document-outline" size={64} color="#93c5fd" />
          <Text style={styles.previewText}>{doc.file_name}</Text>
          <Text style={styles.previewHint}>
            {isPdf ? 'PDF dokument' : 'Dokument'} · Pro plné zobrazení otevřete v prohlížeči
          </Text>
          <TouchableOpacity
            style={styles.openBtn}
            onPress={() => Linking.openURL(signedUrl)}
          >
            <Ionicons name="open-outline" size={18} color="#fff" />
            <Text style={styles.openBtnText}>Otevřít dokument</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  errorText: { fontSize: 16, color: '#ef4444' },
  docHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', padding: 14, borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
  },
  docIconContainer: { width: 48, height: 48, borderRadius: 10, backgroundColor: '#eff6ff', justifyContent: 'center', alignItems: 'center' },
  docHeaderInfo: { flex: 1 },
  docName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  docMeta: { fontSize: 12, color: '#6b7280', marginTop: 3 },
  image: { flex: 1, backgroundColor: '#000' },
  previewPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 24 },
  previewText: { fontSize: 16, fontWeight: '600', color: '#374151', textAlign: 'center' },
  previewHint: { fontSize: 13, color: '#9ca3af', textAlign: 'center' },
  openBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#1a56db', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 12, marginTop: 8,
  },
  openBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
