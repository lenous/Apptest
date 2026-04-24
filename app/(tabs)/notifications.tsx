import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, Alert,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { NOTIF_CONFIG, NOTIF_PRIORITY_CONFIG } from '@/constants/stations';
import type { Notification, NotifPriority } from '@/lib/types';

type Filter = 'all' | 'unread' | 'high';

export default function NotificationsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<Notification[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchItems = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(200);
    if (data) setItems(data as Notification[]);
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => {
    fetchItems();
    if (!user) return;
    const channel = supabase
      .channel('notif-' + user.id)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        fetchItems)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, fetchItems]);

  const filtered = useMemo(() => {
    if (filter === 'unread') return items.filter((n) => !n.read_at);
    if (filter === 'high') return items.filter((n) => n.priority === 'high');
    return items;
  }, [items, filter]);

  const unreadCount = items.filter((n) => !n.read_at).length;

  async function markRead(n: Notification) {
    if (n.read_at) return;
    await supabase.from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', n.id);
  }

  async function deleteOne(n: Notification) {
    Alert.alert('Smazat notifikaci?', n.title, [
      { text: 'Zrušit', style: 'cancel' },
      {
        text: 'Smazat', style: 'destructive',
        onPress: async () => {
          await supabase.from('notifications').delete().eq('id', n.id);
          fetchItems();
        },
      },
    ]);
  }

  async function markAllRead() {
    if (!user || unreadCount === 0) return;
    await supabase.from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .is('read_at', null);
    fetchItems();
  }

  async function clearRead() {
    if (!user) return;
    Alert.alert('Smazat přečtené?', 'Smaže všechny přečtené notifikace.', [
      { text: 'Zrušit', style: 'cancel' },
      {
        text: 'Smazat', style: 'destructive',
        onPress: async () => {
          await supabase.from('notifications')
            .delete()
            .eq('user_id', user.id)
            .not('read_at', 'is', null);
          fetchItems();
        },
      },
    ]);
  }

  async function changePriority(n: Notification) {
    const next: NotifPriority = n.priority === 'low' ? 'normal' : n.priority === 'normal' ? 'high' : 'low';
    await supabase.from('notifications').update({ priority: next }).eq('id', n.id);
  }

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color="#1a56db" /></View>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.filterRow}>
          {(['all', 'unread', 'high'] as Filter[]).map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.filterChip, filter === f && styles.filterChipActive]}
              onPress={() => setFilter(f)}
            >
              <Text style={[styles.filterTxt, filter === f && styles.filterTxtActive]}>
                {f === 'all' ? `Vše (${items.length})` : f === 'unread' ? `Nepřečtené (${unreadCount})` : 'Důležité'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.actionRow}>
          <TouchableOpacity onPress={markAllRead} style={styles.actionBtn}>
            <Ionicons name="checkmark-done" size={16} color="#1a56db" />
            <Text style={styles.actionTxt}>Označit vše přečtené</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={clearRead} style={styles.actionBtn}>
            <Ionicons name="trash-outline" size={16} color="#b91c1c" />
            <Text style={[styles.actionTxt, { color: '#b91c1c' }]}>Smazat přečtené</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(n) => n.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchItems(); }} />}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const tCfg = NOTIF_CONFIG[item.type];
          const pCfg = NOTIF_PRIORITY_CONFIG[item.priority];
          return (
            <TouchableOpacity
              style={[
                styles.card,
                !item.read_at && styles.cardUnread,
                { borderLeftColor: pCfg.color, borderLeftWidth: 3 },
              ]}
              onPress={async () => {
                await markRead(item);
                if (item.order_id) router.push(`/order/${item.order_id}`);
                fetchItems();
              }}
              onLongPress={() => changePriority(item)}
            >
              <View style={styles.cardIcon}>
                <Ionicons name={tCfg.icon as any} size={20} color={tCfg.color} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.cardTitleRow}>
                  <Text style={[styles.cardTitle, !item.read_at && { fontWeight: '700' }]} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <View style={[styles.prioPill, { backgroundColor: pCfg.bg }]}>
                    <Text style={[styles.prioPillTxt, { color: pCfg.color }]}>{pCfg.label}</Text>
                  </View>
                </View>
                {item.body ? <Text style={styles.cardBody} numberOfLines={2}>{item.body}</Text> : null}
                <Text style={styles.cardMeta}>
                  {tCfg.label} · {new Date(item.created_at).toLocaleString('cs-CZ')}
                </Text>
              </View>
              <TouchableOpacity onPress={() => deleteOne(item)} style={styles.delBtn} hitSlop={10}>
                <Ionicons name="close" size={18} color="#9ca3af" />
              </TouchableOpacity>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="notifications-off-outline" size={48} color="#d1d5db" />
            <Text style={styles.emptyTxt}>Žádné notifikace</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { backgroundColor: '#fff', padding: 12, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  filterRow: { flexDirection: 'row', gap: 6 },
  filterChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
    backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb',
  },
  filterChipActive: { backgroundColor: '#1a56db', borderColor: '#1a56db' },
  filterTxt: { fontSize: 12, color: '#374151', fontWeight: '500' },
  filterTxtActive: { color: '#fff' },
  actionRow: { flexDirection: 'row', gap: 12, marginTop: 10 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionTxt: { fontSize: 12, color: '#1a56db', fontWeight: '500' },
  list: { padding: 12, paddingBottom: 40 },
  card: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8,
  },
  cardUnread: { backgroundColor: '#eff6ff' },
  cardIcon: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#f3f4f6',
    alignItems: 'center', justifyContent: 'center',
  },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { flex: 1, fontSize: 14, color: '#111827', fontWeight: '500' },
  cardBody: { fontSize: 13, color: '#374151', marginTop: 2 },
  cardMeta: { fontSize: 11, color: '#9ca3af', marginTop: 4 },
  prioPill: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1 },
  prioPillTxt: { fontSize: 10, fontWeight: '700' },
  delBtn: { padding: 4 },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyTxt: { fontSize: 14, color: '#9ca3af', marginTop: 10 },
});
