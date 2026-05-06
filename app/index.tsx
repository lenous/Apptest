import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  AUTOMATS,
  QUALS,
  ROLE_LABELS,
  STATIONS,
  arrivedAt,
  canEditOrders,
  canHardDeleteOrders,
  canOperate,
  checklistForStation,
  createDefaultDb,
  currentUser,
  customerById,
  deadlineState,
  defaultScreenForRole,
  forwardedFrom,
  loadPreviewDb,
  nextApplicableStation,
  nowLabel,
  orderLabel,
  productById,
  pushAudit,
  resetPreviewDb,
  savePreviewDb,
  stationById,
  stationProgress,
  userById,
  type MaterialStatus,
  type Order,
  type PreviewDb,
  type Priority,
  type ProductionType,
  type Role,
  type Technology,
} from '@/lib/previewStore';

type Screen =
  | 'login'
  | 'queue'
  | 'station'
  | 'orders'
  | 'order'
  | 'newOrder'
  | 'notifications'
  | 'products'
  | 'product'
  | 'dashboard'
  | 'users'
  | 'newUser'
  | 'settings'
  | 'audit'
  | 'delete'
  | 'kpi';
type OrderTab = 'stations' | 'docs' | 'notes' | 'edit';
type NotificationFilter = 'unread' | 'all' | 'high';
type TransferModal = { orderId: string; stationId: number; qty: number; max: number };
type IssueModal = { orderId: string; stationId: number; note: string };

const priorityLabels: Record<Priority, string> = {
  low: 'Nízká',
  normal: 'Normální',
  high: 'Vysoká',
  urgent: 'Urgentní',
};

const typeLabels: Record<ProductionType, string> = {
  new: 'Nová',
  repeat: 'Opakovaná',
  revision: 'Revize',
};

const techLabels: Record<Technology, string> = {
  lead: 'OLOVO',
  leadfree: 'BEZOLOVO',
};

const statusLabels = {
  waiting: 'Čeká',
  active: 'Probíhá',
  done: 'Dokončeno',
  issue: 'Problém',
};

const statusColors = {
  waiting: '#64748b',
  active: '#36B0AE',
  done: '#15803d',
  issue: '#b91c1c',
};

const DEMO_PASSWORD = '1234';

const rolePermissions: Record<Role, string[]> = {
  operator: ['Fronta vlastního stanoviště', 'Zakázky', 'Zápis kusů', 'Checklist', 'Problém', 'Předání dál'],
  tpv: ['Produkty a dokumentace', 'Zakázky', 'Notifikace', 'Zápis kusů na stanovišti'],
  dispatcher: ['Přehled výroby', 'Zakázky', 'Nová zakázka', 'KPI', 'Řízení stanovišť', 'Zápis kusů'],
  management: ['Přehled výroby', 'Zakázky', 'KPI', 'Zápis kusů'],
  admin: ['Kompletní práva', 'Uživatelé a role', 'Nastavení', 'Audit log', 'Mazání', 'Všechny obrazovky'],
};

function parseQtyInput(value: string) {
  const digits = value.replace(/\D/g, '');
  return digits ? Number.parseInt(digits, 10) : 0;
}

const initialNewOrder = () => ({
  number: String(Math.floor(260000 + Math.random() * 1000)).padStart(6, '0'),
  qty: '100',
  due: '2026-04-30',
  customer: 'c1',
  product: 'p1',
  type: 'repeat' as ProductionType,
  priority: 'normal' as Priority,
  technology: 'leadfree' as Technology,
  stencilNumber: 'PL-1427',
});

const initialNewUser = () => ({
  name: '',
  email: '',
  role: 'operator' as Role,
  quals: ['aoi'],
  defaultStation: 3,
});

export default function ProductionApp() {
  const [db, setDb] = useState<PreviewDb>(createDefaultDb());
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [loginUserId, setLoginUserId] = useState('u1');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>('queue');
  const [selectedOrderId, setSelectedOrderId] = useState('o1');
  const [selectedStationId, setSelectedStationId] = useState(3);
  const [selectedProductId, setSelectedProductId] = useState('p1');
  const [selectedUserId, setSelectedUserId] = useState('u1');
  const [orderTab, setOrderTab] = useState<OrderTab>('stations');
  const [notifFilter, setNotifFilter] = useState<NotificationFilter>('unread');
  const [dashboardFilter, setDashboardFilter] = useState<'active' | 'issues' | 'due' | 'hidden'>('active');
  const [query, setQuery] = useState('');
  const [noteText, setNoteText] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [transferModal, setTransferModal] = useState<TransferModal | null>(null);
  const [issueModal, setIssueModal] = useState<IssueModal | null>(null);
  const [newOrder, setNewOrder] = useState(initialNewOrder);
  const [newUser, setNewUser] = useState(initialNewUser);

  useEffect(() => {
    loadPreviewDb().then((loaded) => {
      setDb(loaded);
      const loadedUser = currentUser(loaded);
      setLoginUserId(loadedUser.id);
      setSelectedUserId(loadedUser.id);
      setSelectedStationId(loadedUser.defaultStation ?? 3);
      setLoading(false);
    });
  }, []);

  const user = currentUser(db);
  const selectedOrder = db.orders.find((order) => order.id === selectedOrderId) ?? db.orders[0];
  const selectedProduct = db.products.find((product) => product.id === selectedProductId) ?? db.products[0];
  const selectedUser = db.users.find((item) => item.id === selectedUserId) ?? db.users[0];

  const navItems = useMemo(() => {
    if (!user) return [];
    if (user.role === 'operator') {
      return [
        ['queue', 'briefcase', 'Fronta'],
        ['orders', 'list', 'Zakázky'],
        ['notifications', 'notifications', 'Info'],
        ['login', 'person', 'Profil'],
      ] as const;
    }
    if (user.role === 'tpv') {
      return [
        ['products', 'cube', 'Produkty'],
        ['orders', 'list', 'Zakázky'],
        ['notifications', 'notifications', 'Info'],
        ['login', 'person', 'Profil'],
      ] as const;
    }
    if (user.role === 'admin') {
      return [
        ['dashboard', 'grid', 'Přehled'],
        ['orders', 'list', 'Zakázky'],
        ['newOrder', 'add-circle', 'Nová'],
        ['users', 'people', 'Uživatelé'],
        ['settings', 'settings', 'Nastavení'],
      ] as const;
    }
    if (user.role === 'management') {
      return [
        ['dashboard', 'grid', 'Přehled'],
        ['orders', 'list', 'Zakázky'],
        ['kpi', 'stats-chart', 'KPI'],
        ['login', 'person', 'Profil'],
      ] as const;
    }
    return [
      ['dashboard', 'grid', 'Přehled'],
      ['orders', 'list', 'Zakázky'],
      ['newOrder', 'add-circle', 'Nová'],
      ['kpi', 'stats-chart', 'KPI'],
    ] as const;
  }, [user]);

  async function updateDb(mutator: (draft: PreviewDb) => void) {
    const draft = JSON.parse(JSON.stringify(db)) as PreviewDb;
    mutator(draft);
    setDb(draft);
    await savePreviewDb(draft);
  }

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 1800);
  }

  function handleLogin() {
    const nextUser = db.users.find((item) => item.id === loginUserId) ?? db.users[0];
    if (loginPassword !== DEMO_PASSWORD) {
      setLoginError('Neplatné heslo. Pro demo použijte 1234.');
      return;
    }
    updateDb((draft) => {
      draft.sessionUserId = nextUser.id;
    });
    setLoggedIn(true);
    setLoginPassword('');
    setLoginError(null);
    setSelectedUserId(nextUser.id);
    setSelectedStationId(nextUser.defaultStation ?? 3);
    setScreen(defaultScreenForRole(nextUser.role) as Screen);
  }

  function logout() {
    setLoggedIn(false);
    setLoginPassword('');
    setLoginError(null);
    setScreen(defaultScreenForRole(user.role) as Screen);
  }

  function openOrder(orderId: string, tab: OrderTab = 'stations') {
    setSelectedOrderId(orderId);
    setOrderTab(tab);
    setScreen('order');
  }

  function openStation(orderId: string, stationId: number) {
    setSelectedOrderId(orderId);
    setSelectedStationId(stationId);
    setScreen('station');
  }

  function setOrderStationCount(orderId: string, stationId: number, field: 'ok' | 'rework' | 'scrap', value: number) {
    updateDb((draft) => {
      const order = draft.orders.find((item) => item.id === orderId);
      if (!order) return;
      const station = order.stations[stationId];
      station[field] = Math.max(0, value);
      pushAudit(draft, draft.sessionUserId, `${order.number} · Počty`, `${stationById(stationId)?.name}: ${field} = ${station[field]}`);
    });
  }

  function startStation(orderId: string, stationId: number) {
    updateDb((draft) => {
      const order = draft.orders.find((item) => item.id === orderId);
      if (!order) return;
      order.stations[stationId].status = 'active';
      order.stations[stationId].issueNote = null;
      pushAudit(draft, draft.sessionUserId, `${order.number} · Spuštěno`, `${stationById(stationId)?.name} zahájeno`);
    });
    showToast('Stanoviště spuštěno');
  }

  function openTransfer(order: Order, stationId: number) {
    const max = Math.max(0, order.stations[stationId].ok - forwardedFrom(order, stationId));
    if (!nextApplicableStation(order, stationId)) {
      showToast('Tohle je poslední aktivní stanoviště');
      return;
    }
    if (!max) {
      showToast('Není co předat. Nejdřív zapiš OK kusy.');
      return;
    }
    setTransferModal({ orderId: order.id, stationId, qty: max, max });
  }

  function doTransfer() {
    if (!transferModal) return;
    updateDb((draft) => {
      const order = draft.orders.find((item) => item.id === transferModal.orderId);
      if (!order) return;
      const nextStation = nextApplicableStation(order, transferModal.stationId);
      if (!nextStation) return;
      const qty = Math.min(transferModal.max, Math.max(1, transferModal.qty));
      order.transfers.push({ from: transferModal.stationId, to: nextStation, qty, at: nowLabel(), by: draft.sessionUserId });
      order.stations[transferModal.stationId].transferred += qty;
      if (order.stations[transferModal.stationId].transferred >= order.stations[transferModal.stationId].ok) {
        order.stations[transferModal.stationId].status = 'done';
      }
      if (order.stations[nextStation].status === 'waiting') order.stations[nextStation].status = 'active';
      draft.notifications.unshift({
        id: `n${Date.now()}`,
        user: draft.sessionUserId,
        icon: '>',
        title: 'Kusy předány',
        body: `${order.number} · ${qty} ks na ${stationById(nextStation)?.name}`,
        priority: 'normal',
        type: 'transfer',
        read: false,
        at: 'teď',
        order: order.id,
      });
      pushAudit(draft, draft.sessionUserId, `${order.number} · Transfer`, `${stationById(transferModal.stationId)?.name} -> ${stationById(nextStation)?.name}: ${qty} ks`);
    });
    setTransferModal(null);
    showToast('Kusy předány');
  }

  function doReportIssue() {
    if (!issueModal) return;
    updateDb((draft) => {
      const order = draft.orders.find((item) => item.id === issueModal.orderId);
      if (!order) return;
      const note = issueModal.note.trim() || 'Problém bez detailu';
      order.stations[issueModal.stationId].status = 'issue';
      order.stations[issueModal.stationId].issueNote = note;
      order.notes.unshift({ id: `note${Date.now()}`, at: nowLabel(), by: draft.sessionUserId, text: note, stationId: issueModal.stationId });
      for (const recipient of draft.users.filter((item) => item.role !== 'operator')) {
        draft.notifications.unshift({
          id: `n${Date.now()}-${recipient.id}`,
          user: recipient.id,
          icon: '!',
          title: `Problém: ${stationById(issueModal.stationId)?.name}`,
          body: `${order.number} · ${note}`,
          priority: 'high',
          type: 'issue',
          read: false,
          at: 'teď',
          order: order.id,
        });
      }
      pushAudit(draft, draft.sessionUserId, `${order.number} · Problém`, `${stationById(issueModal.stationId)?.name}: ${note}`);
    });
    setIssueModal(null);
    showToast('Problém nahlášen');
  }

  function addNote(orderId: string, stationId?: number) {
    const text = noteText.trim();
    if (!text) {
      showToast('Poznámka je prázdná');
      return;
    }
    updateDb((draft) => {
      const order = draft.orders.find((item) => item.id === orderId);
      if (!order) return;
      order.notes.unshift({ id: `note${Date.now()}`, at: nowLabel(), by: draft.sessionUserId, text, stationId });
      pushAudit(draft, draft.sessionUserId, `${order.number} · Poznámka`, text);
    });
    setNoteText('');
  }

  function createOrder() {
    if (!db) return;
    const number = newOrder.number.replace(/\D/g, '');
    const qty = Number.parseInt(newOrder.qty, 10);
    if (number.length !== 6 || !qty) {
      showToast('Vyplň 6místné číslo a množství');
      return;
    }
    if (db.orders.some((order) => order.number === number)) {
      showToast('Číslo zakázky už existuje');
      return;
    }
    updateDb((draft) => {
      const product = draft.products.find((item) => item.id === newOrder.product) ?? draft.products[0];
      const stations: Order['stations'] = {};
      for (const station of STATIONS) {
        stations[station.id] = {
          applicable: product.applicableStations.includes(station.id),
          status: 'waiting',
          arrived: station.id === 1 ? qty : 0,
          ok: 0,
          rework: 0,
          scrap: 0,
          transferred: 0,
          issueNote: null,
          checklist: [],
        };
      }
      const order: Order = {
        id: `o${Date.now()}`,
        number,
        customer: newOrder.customer,
        product: product.id,
        quantity: qty,
        priority: newOrder.priority,
        due: newOrder.due,
        created: '2026-04-24',
        type: newOrder.type,
        technology: newOrder.technology,
        stencilNumber: newOrder.stencilNumber.trim(),
        hidden: false,
        stations,
        transfers: [],
        notes: [],
      };
      draft.orders.unshift(order);
      if (order.stencilNumber) product.stencilNumber = order.stencilNumber;
      pushAudit(draft, draft.sessionUserId, `${number} · Vytvořeno`, `zakázka (${qty} ks, ${product.code}, ${techLabels[order.technology]})`);
      setSelectedOrderId(order.id);
    });
    showToast(newOrder.type === 'repeat' ? 'Zakázka vytvořena, dokumenty jsou z knihovny produktu' : 'Zakázka vytvořena, TPV zkontroluje dokumenty');
    setNewOrder(initialNewOrder());
    setScreen('order');
  }

  function createUser() {
    if (!newUser.name.trim() || !newUser.email.trim()) {
      showToast('Vyplň jméno a e-mail');
      return;
    }
    updateDb((draft) => {
      draft.users.push({
        id: `u${Date.now()}`,
        name: newUser.name.trim(),
        email: newUser.email.trim(),
        role: newUser.role,
        quals: newUser.role === 'operator' ? newUser.quals : [],
        defaultStation: newUser.role === 'operator' ? newUser.defaultStation : undefined,
      });
      pushAudit(draft, draft.sessionUserId, 'Uživatel vytvořen', newUser.email.trim());
    });
    setNewUser(initialNewUser());
    setScreen('users');
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator size="large" color="#36B0AE" />
      </SafeAreaView>
    );
  }

  if (!loggedIn) return renderLogin();

  const body = (() => {
    if (screen === 'login') return renderProfile();
    if (screen === 'queue') return renderQueue();
    if (screen === 'station' && selectedOrder) return renderStation(selectedOrder);
    if (screen === 'orders') return renderOrders();
    if (screen === 'order' && selectedOrder) return renderOrderDetail(selectedOrder);
    if (screen === 'newOrder') return renderNewOrder();
    if (screen === 'notifications') return renderNotifications();
    if (screen === 'products') return renderProducts();
    if (screen === 'product' && selectedProduct) return renderProduct(selectedProduct);
    if (screen === 'dashboard') return renderDashboard();
    if (screen === 'users') return renderUsers();
    if (screen === 'newUser') return renderNewUser();
    if (screen === 'settings') return renderSettings();
    if (screen === 'audit') return renderAudit();
    if (screen === 'delete') return renderDelete();
    if (screen === 'kpi') return renderKpi();
    return renderDashboard();
  })();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerKicker}>HC electronics · Aplikace pro výrobu</Text>
          <Text style={styles.headerTitle}>{user.name}</Text>
          <Text style={styles.headerSub}>{ROLE_LABELS[user.role]}</Text>
        </View>
        <TouchableOpacity style={styles.headerButton} onPress={() => setScreen('login')}>
          <Ionicons name="person-circle-outline" size={28} color="#E6C336" />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>{body}</View>

      <View style={styles.bottomNav}>
        {navItems.map(([target, icon, label]) => (
          <TouchableOpacity key={target} style={styles.navItem} onPress={() => setScreen(target as Screen)}>
            <Ionicons name={`${icon}${screen === target ? '' : '-outline'}` as any} size={21} color={screen === target ? '#E6C336' : '#94a3b8'} />
            <Text style={[styles.navText, screen === target && styles.navTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {toast && (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}

      {renderTransferModal()}
      {renderIssueModal()}
    </SafeAreaView>
  );

  function renderLogin() {
    const selectedLoginUser = db.users.find((item) => item.id === loginUserId) ?? db.users[0];
    return (
      <SafeAreaView style={styles.loginSafe}>
        <ScrollView contentContainerStyle={styles.loginScroll} keyboardShouldPersistTaps="handled">
          <View style={styles.loginLogoMark}>
            <Ionicons name="hardware-chip" size={34} color="#E6C336" />
          </View>
          <Text style={styles.loginBrand}>HC electronics</Text>
          <Text style={styles.loginTitle}>Výroba EMS</Text>
          <Text style={styles.loginSubtitle}>Demo přihlášení do výrobní aplikace. Všechny role používají heslo 1234.</Text>

          <View style={styles.loginPanel}>
            <Text style={styles.loginPanelTitle}>Vyber uživatele</Text>
            {db.users.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={[styles.loginUserRow, item.id === loginUserId && styles.loginUserRowActive]}
                onPress={() => {
                  setLoginUserId(item.id);
                  setLoginError(null);
                }}
              >
                <View style={styles.loginAvatar}>
                  <Text style={styles.loginAvatarText}>{item.name.slice(0, 1)}</Text>
                </View>
                <View style={styles.flex}>
                  <Text style={styles.loginUserName}>{item.name}</Text>
                  <Text style={styles.loginUserMeta}>{item.email} · {ROLE_LABELS[item.role]}</Text>
                </View>
                {item.id === loginUserId && <Ionicons name="checkmark-circle" size={22} color="#E6C336" />}
              </TouchableOpacity>
            ))}

            <Text style={styles.loginLabel}>Heslo</Text>
            <TextInput
              style={styles.loginInput}
              value={loginPassword}
              onChangeText={(value) => {
                setLoginPassword(value);
                setLoginError(null);
              }}
              placeholder="1234"
              placeholderTextColor="#64748b"
              secureTextEntry
              keyboardType="number-pad"
              onSubmitEditing={handleLogin}
            />
            {!!loginError && <Text style={styles.loginError}>{loginError}</Text>}
            <TouchableOpacity style={styles.loginButton} onPress={handleLogin}>
              <Ionicons name="log-in" size={18} color="#050505" />
              <Text style={styles.loginButtonText}>Přihlásit jako {selectedLoginUser.name}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  function renderProfile() {
    return (
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.faceCard}>
          <Ionicons name="hardware-chip-outline" size={82} color="#E6C336" />
          <Text style={styles.faceTitle}>{user.name}</Text>
          <Text style={styles.faceText}>{user.email} · {ROLE_LABELS[user.role]}</Text>
          <View style={styles.profileActionRow}>
            <TouchableOpacity style={styles.outlineButtonFlex} onPress={logout}>
              <Text style={styles.outlineButtonText}>Odhlásit se</Text>
            </TouchableOpacity>
            {user.role === 'admin' && (
              <TouchableOpacity style={styles.primaryButtonFlex} onPress={() => setScreen('settings')}>
                <Text style={styles.primaryButtonText}>Nastavení</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <Section title="Seznam uživatelů">
          {db.users.map((item) => (
            <View
              key={item.id}
              style={[styles.card, item.id === user.id && styles.cardActive]}
            >
              <View style={styles.rowBetween}>
                <View>
                  <Text style={styles.cardTitle}>{item.name}</Text>
                  <Text style={styles.muted}>{item.email} · heslo 1234</Text>
                </View>
                <Badge label={ROLE_LABELS[item.role]} tone={item.role === 'operator' ? 'blue' : 'green'} />
              </View>
            </View>
          ))}
        </Section>
      </ScrollView>
    );
  }

  function renderQueue() {
    const stationId = user.defaultStation ?? selectedStationId;
    const visible = db.orders.filter((order) => !order.hidden && order.stations[stationId]?.applicable);
    const queue = visible.filter((order) => order.stations[stationId].status !== 'done');
    const waiting = queue.filter((order) => order.stations[stationId].status === 'waiting').length;
    const active = queue.filter((order) => order.stations[stationId].status === 'active').length;
    const issues = queue.filter((order) => order.stations[stationId].status === 'issue').length;

    return (
      <ScrollView contentContainerStyle={styles.scroll}>
        <Section title={`Pracoviště: ${stationById(stationId)?.name}`}>
          <View style={styles.wrapRow}>
            {STATIONS.filter((station) => canOperate(user, station.id)).map((station) => (
              <Chip
                key={station.id}
                label={`${station.id}. ${station.name}`}
                selected={stationId === station.id}
                onPress={() => {
                  setSelectedStationId(station.id);
                  updateDb((draft) => {
                    const draftUser = draft.users.find((item) => item.id === user.id);
                    if (draftUser) draftUser.defaultStation = station.id;
                  });
                }}
              />
            ))}
          </View>
        </Section>

        <View style={styles.statsRow}>
          <Stat label="Fronta" value={waiting} color="#6b7280" />
          <Stat label="Probíhá" value={active} color="#36B0AE" />
          <Stat label="Problém" value={issues} color="#b91c1c" />
        </View>

        <Section title={`Aktivní zakázky (${queue.length})`}>
          {queue.length === 0 && <Empty text="Fronta je prázdná" />}
          {queue.map((order) => renderOrderCard(order, () => openStation(order.id, stationId), stationId))}
        </Section>
      </ScrollView>
    );
  }

  function renderStation(order: Order) {
    const stationId = selectedStationId;
    const station = order.stations[stationId];
    const product = productById(db, order.product);
    const arrived = arrivedAt(order, stationId);
    const forwarded = forwardedFrom(order, stationId);
    const processed = station.ok + station.rework + station.scrap;
    const remaining = Math.max(0, arrived - processed);
    const nextStation = nextApplicableStation(order, stationId);

    if (!station?.applicable) {
      return (
        <ScrollView contentContainerStyle={styles.scroll}>
          <BackRow title={`${order.number} · ${stationById(stationId)?.name}`} onBack={() => openOrder(order.id)} />
          <Empty text="Toto stanoviště je pro zakázku vypnuté." />
        </ScrollView>
      );
    }

    return (
      <ScrollView contentContainerStyle={styles.scroll}>
        <BackRow title={`${stationById(stationId)?.name}`} subtitle={`${order.number} · ${orderLabel(db, order)}`} onBack={() => openOrder(order.id)} />

        {stationId === 1 && (
          <Section title="Stav materiálu">
            <View style={styles.wrapRow}>
              {(['ok', 'substitute', 'missing'] as MaterialStatus[]).map((status) => (
                <Chip
                  key={status}
                  label={status === 'ok' ? 'OK - vše na skladě' : status === 'substitute' ? 'Náhrada' : 'Chybí'}
                  selected={(order.materialStatus ?? 'ok') === status}
                  onPress={() => updateDb((draft) => {
                    const item = draft.orders.find((draftOrder) => draftOrder.id === order.id);
                    if (!item) return;
                    item.materialStatus = status;
                    if (status === 'missing') {
                      item.stations[1].status = 'issue';
                      draft.notifications.unshift({
                        id: `n${Date.now()}`,
                        user: 'u3',
                        icon: '!',
                        title: 'Materiál chybí',
                        body: `${item.number} · sklad blokuje výrobu`,
                        priority: 'high',
                        type: 'issue',
                        read: false,
                        at: 'teď',
                        order: item.id,
                      });
                    }
                  })}
                />
              ))}
            </View>
            {(order.materialStatus === 'missing' || order.materialStatus === 'substitute') && (
              <TextInput
                style={styles.input}
                value={order.materialNote ?? ''}
                placeholder={order.materialStatus === 'missing' ? 'Co chybí?' : 'Jaká náhrada?'}
                onChangeText={(value) => updateDb((draft) => {
                  const item = draft.orders.find((draftOrder) => draftOrder.id === order.id);
                  if (item) item.materialNote = value;
                })}
              />
            )}
          </Section>
        )}

        {stationId === 2 && (
          <Section title="Automat">
            <View style={styles.wrapRow}>
              {AUTOMATS.map((automat) => (
                <Chip
                  key={automat}
                  label={automat}
                  selected={order.automat === automat}
                  onPress={() => updateDb((draft) => {
                    const item = draft.orders.find((draftOrder) => draftOrder.id === order.id);
                    if (item) item.automat = automat;
                  })}
                />
              ))}
            </View>
          </Section>
        )}

        {stationId === 7 && product?.waveProgram && (
          <View style={styles.infoBox}>
            <Text style={styles.infoText}>Program pájení vlnou: {product.waveProgram}</Text>
          </View>
        )}

        <View style={[styles.card, { borderLeftColor: statusColors[station.status], borderLeftWidth: 4 }]}>
          <View style={styles.rowBetween}>
            <Text style={styles.cardTitle}>Aktuální stav</Text>
            <Badge label={statusLabels[station.status]} tone={station.status === 'issue' ? 'red' : station.status === 'done' ? 'green' : 'blue'} />
          </View>
          <Text style={styles.muted}>Přišlo {arrived}/{order.quantity} · předáno dál {forwarded} · rozpracováno {remaining}</Text>
          {station.issueNote && <Text style={styles.errorText}>{station.issueNote}</Text>}
        </View>

        <Section title="Zapsat kusy">
          <View style={styles.countGrid}>
            <CountBox label="OK" color="#15803d" value={station.ok} onChange={(value) => setOrderStationCount(order.id, stationId, 'ok', value)} />
            <CountBox label="Oprava" color="#d97706" value={station.rework} onChange={(value) => setOrderStationCount(order.id, stationId, 'rework', value)} />
            <CountBox label="Zmetek" color="#b91c1c" value={station.scrap} onChange={(value) => setOrderStationCount(order.id, stationId, 'scrap', value)} />
          </View>
          {processed > arrived && <Text style={styles.errorText}>Zapsáno je víc kusů, než na stanoviště dorazilo.</Text>}
        </Section>

        <Section title="Checklist">
          {checklistForStation(stationId).map((item, index) => (
            <TouchableOpacity
              key={item}
              style={styles.checkRow}
              onPress={() => updateDb((draft) => {
                const target = draft.orders.find((draftOrder) => draftOrder.id === order.id)?.stations[stationId];
                if (!target) return;
                target.checklist[index] = !target.checklist[index];
              })}
            >
              <Ionicons name={station.checklist[index] ? 'checkbox' : 'square-outline'} size={22} color={station.checklist[index] ? '#15803d' : '#6b7280'} />
              <Text style={[styles.checkText, station.checklist[index] && styles.checkTextDone]}>{item}</Text>
            </TouchableOpacity>
          ))}
        </Section>

        <View style={styles.actionStack}>
          {station.status === 'waiting' && <PrimaryButton label="Spustit stanoviště" icon="play" onPress={() => startStation(order.id, stationId)} />}
          {station.status === 'active' && nextStation && <PrimaryButton label={`Předat dál na ${stationById(nextStation)?.name}`} icon="arrow-forward" onPress={() => openTransfer(order, stationId)} />}
          {station.status !== 'issue' && <DangerButton label="Nahlásit problém" onPress={() => setIssueModal({ orderId: order.id, stationId, note: '' })} />}
        </View>

        {renderNotes(order, stationId)}
      </ScrollView>
    );
  }

  function renderOrders() {
    const search = query.trim().toLowerCase();
    const filtered = db.orders.filter((order) => {
      if (user.role === 'operator') {
        const allowed = STATIONS.filter((station) => canOperate(user, station.id)).map((station) => station.id);
        if (!allowed.some((stationId) => order.stations[stationId]?.applicable)) return false;
      }
      if (dashboardFilter === 'active' && order.hidden) return false;
      if (dashboardFilter === 'hidden' && !order.hidden) return false;
      if (dashboardFilter === 'issues' && !Object.values(order.stations).some((station) => station.status === 'issue')) return false;
      if (dashboardFilter === 'due' && deadlineState(order.due) === 'ok') return false;
      if (!search) return true;
      return `${order.number} ${orderLabel(db, order)}`.toLowerCase().includes(search);
    });
    return (
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.rowBetween}>
          <Text style={styles.screenTitle}>Zakázky</Text>
          {(user.role === 'dispatcher' || user.role === 'admin') && <IconButton icon="add" onPress={() => setScreen('newOrder')} />}
        </View>
        <TextInput style={styles.input} value={query} onChangeText={setQuery} placeholder="Hledat číslo, zákazníka, produkt..." />
        <View style={styles.wrapRow}>
          <Chip label="Aktivní" selected={dashboardFilter === 'active'} onPress={() => setDashboardFilter('active')} />
          <Chip label="Problém" selected={dashboardFilter === 'issues'} onPress={() => setDashboardFilter('issues')} />
          <Chip label="Termíny" selected={dashboardFilter === 'due'} onPress={() => setDashboardFilter('due')} />
          <Chip label="Skryté" selected={dashboardFilter === 'hidden'} onPress={() => setDashboardFilter('hidden')} />
        </View>
        {filtered.length === 0 && <Empty text="Žádné zakázky" />}
        {filtered.map((order) => renderOrderCard(order, () => openOrder(order.id)))}
      </ScrollView>
    );
  }

  function renderOrderDetail(order: Order) {
    const progress = stationProgress(order);
    return (
      <ScrollView contentContainerStyle={styles.scroll}>
        <BackRow title={order.number} subtitle={orderLabel(db, order)} onBack={() => setScreen(user.role === 'operator' ? 'queue' : 'orders')} />
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <View>
              <Text style={styles.cardTitle}>{order.quantity} ks · {typeLabels[order.type]}</Text>
              <Text style={styles.muted}>{techLabels[order.technology]} · planžeta {order.stencilNumber || 'není'}</Text>
            </View>
            <Badge label={priorityLabels[order.priority]} tone={order.priority === 'urgent' ? 'red' : order.priority === 'high' ? 'orange' : 'blue'} />
          </View>
          <Progress percent={progress.percent} />
          <Text style={styles.muted}>{progress.done}/{progress.total} stanovišť hotovo · termín {formatDate(order.due)}</Text>
        </View>

        <View style={styles.tabRow}>
          {(['stations', 'docs', 'notes', 'edit'] as OrderTab[]).filter((tab) => tab !== 'edit' || canEditOrders(user.role)).map((tab) => (
            <TouchableOpacity key={tab} style={[styles.tab, orderTab === tab && styles.tabActive]} onPress={() => setOrderTab(tab)}>
              <Text style={[styles.tabText, orderTab === tab && styles.tabTextActive]}>
                {tab === 'stations' ? 'Stanoviště' : tab === 'docs' ? 'Dokumenty' : tab === 'notes' ? 'Poznámky' : 'Úpravy'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {orderTab === 'stations' && (
          <Section title="Tok zakázky">
            {STATIONS.map((station) => {
              const state = order.stations[station.id];
              if (!state.applicable) return null;
              const arr = arrivedAt(order, station.id);
              return (
                <TouchableOpacity key={station.id} style={[styles.stationRow, { borderLeftColor: statusColors[state.status] }]} onPress={() => openStation(order.id, station.id)}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.cardTitle}>{station.id}. {station.name}</Text>
                    <Badge label={statusLabels[state.status]} tone={state.status === 'issue' ? 'red' : state.status === 'done' ? 'green' : 'blue'} />
                  </View>
                  <Text style={styles.muted}>Přišlo {arr} · OK {state.ok} · oprava {state.rework} · zmetek {state.scrap}</Text>
                </TouchableOpacity>
              );
            })}
          </Section>
        )}

        {orderTab === 'docs' && (
          <Section title="Dokumenty produktu">
            {(productById(db, order.product)?.docs ?? []).map((doc) => (
              <View key={doc} style={styles.docRow}>
                <Ionicons name="document-text-outline" size={18} color="#36B0AE" />
                <Text style={styles.docText}>{doc}</Text>
              </View>
            ))}
            <PrimaryButton label="Přidat mock dokument" icon="cloud-upload" onPress={() => updateDb((draft) => {
              const product = draft.products.find((item) => item.id === order.product);
              product?.docs.push(`Doklad_${Date.now()}.pdf`);
            })} />
          </Section>
        )}

        {orderTab === 'notes' && renderNotes(order)}

        {orderTab === 'edit' && (
          <Section title="Úpravy zakázky">
            <FormField label="Množství" value={String(order.quantity)} keyboardType="number-pad" onChangeText={(value) => updateDb((draft) => {
              const item = draft.orders.find((draftOrder) => draftOrder.id === order.id);
              if (item) item.quantity = Math.max(1, Number.parseInt(value, 10) || item.quantity);
            })} />
            <FormField label="Termín" value={order.due} onChangeText={(value) => updateDb((draft) => {
              const item = draft.orders.find((draftOrder) => draftOrder.id === order.id);
              if (item) item.due = value;
            })} />
            <FormField label="Planžeta" value={order.stencilNumber} onChangeText={(value) => updateDb((draft) => {
              const item = draft.orders.find((draftOrder) => draftOrder.id === order.id);
              if (item) item.stencilNumber = value;
            })} />
            <View style={styles.wrapRow}>
              {(['low', 'normal', 'high', 'urgent'] as Priority[]).map((priority) => (
                <Chip key={priority} label={priorityLabels[priority]} selected={order.priority === priority} onPress={() => updateDb((draft) => {
                  const item = draft.orders.find((draftOrder) => draftOrder.id === order.id);
                  if (item) item.priority = priority;
                })} />
              ))}
            </View>
            <PrimaryButton label={order.hidden ? 'Obnovit zakázku' : 'Skrýt zakázku'} icon={order.hidden ? 'eye' : 'eye-off'} onPress={() => updateDb((draft) => {
              const item = draft.orders.find((draftOrder) => draftOrder.id === order.id);
              if (item) item.hidden = !item.hidden;
            })} />
            {canHardDeleteOrders(user.role) && <DangerButton label="Trvale smazat" onPress={() => deleteOrder(order.id)} />}
          </Section>
        )}
      </ScrollView>
    );
  }

  function renderNewOrder() {
    const products = db.products.filter((product) => product.customer === newOrder.customer);
    return (
      <ScrollView contentContainerStyle={styles.scroll}>
        <BackRow title="Nová zakázka" subtitle="Mistr / vedení / admin" onBack={() => setScreen('orders')} />
        <FormField label="Číslo zakázky" value={newOrder.number} keyboardType="number-pad" onChangeText={(value) => setNewOrder((draft) => ({ ...draft, number: value }))} />
        <FormField label="Množství" value={newOrder.qty} keyboardType="number-pad" onChangeText={(value) => setNewOrder((draft) => ({ ...draft, qty: value }))} />
        <FormField label="Termín" value={newOrder.due} onChangeText={(value) => setNewOrder((draft) => ({ ...draft, due: value }))} />
        <Section title="Zákazník">
          <View style={styles.wrapRow}>
            {db.customers.map((customer) => (
              <Chip key={customer.id} label={customer.name} selected={newOrder.customer === customer.id} onPress={() => {
                const product = db.products.find((item) => item.customer === customer.id) ?? db.products[0];
                setNewOrder((draft) => ({ ...draft, customer: customer.id, product: product.id, stencilNumber: product.stencilNumber ?? '' }));
              }} />
            ))}
          </View>
        </Section>
        <Section title="Produkt">
          <View style={styles.wrapRow}>
            {products.map((product) => (
              <Chip key={product.id} label={`${product.code} · ${product.name}`} selected={newOrder.product === product.id} onPress={() => setNewOrder((draft) => ({ ...draft, product: product.id, stencilNumber: product.stencilNumber ?? '' }))} />
            ))}
          </View>
        </Section>
        <Section title="Typ, technologie a priorita">
          <View style={styles.wrapRow}>
            {(['new', 'repeat', 'revision'] as ProductionType[]).map((type) => <Chip key={type} label={typeLabels[type]} selected={newOrder.type === type} onPress={() => setNewOrder((draft) => ({ ...draft, type }))} />)}
            {(['lead', 'leadfree'] as Technology[]).map((technology) => <Chip key={technology} label={techLabels[technology]} selected={newOrder.technology === technology} onPress={() => setNewOrder((draft) => ({ ...draft, technology }))} />)}
            {(['low', 'normal', 'high', 'urgent'] as Priority[]).map((priority) => <Chip key={priority} label={priorityLabels[priority]} selected={newOrder.priority === priority} onPress={() => setNewOrder((draft) => ({ ...draft, priority }))} />)}
          </View>
        </Section>
        <FormField label="Číslo planžety" value={newOrder.stencilNumber} onChangeText={(value) => setNewOrder((draft) => ({ ...draft, stencilNumber: value }))} />
        <PrimaryButton label="Vytvořit zakázku" icon="checkmark" onPress={createOrder} />
      </ScrollView>
    );
  }

  function renderNotifications() {
    const all = db.notifications.filter((item) => item.user === user.id);
    const list = notifFilter === 'unread' ? all.filter((item) => !item.read) : notifFilter === 'high' ? all.filter((item) => item.priority === 'high') : all;
    return (
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.rowBetween}>
          <Text style={styles.screenTitle}>Notifikace</Text>
          <Text style={styles.muted}>{all.filter((item) => !item.read).length} nepřečtené</Text>
        </View>
        <View style={styles.wrapRow}>
          <Chip label={`Nepřečtené (${all.filter((item) => !item.read).length})`} selected={notifFilter === 'unread'} onPress={() => setNotifFilter('unread')} />
          <Chip label={`Důležité (${all.filter((item) => item.priority === 'high').length})`} selected={notifFilter === 'high'} onPress={() => setNotifFilter('high')} />
          <Chip label={`Vše (${all.length})`} selected={notifFilter === 'all'} onPress={() => setNotifFilter('all')} />
        </View>
        <View style={styles.rowGap}>
          <TouchableOpacity onPress={() => updateDb((draft) => draft.notifications.forEach((item) => { if (item.user === user.id) item.read = true; }))}>
            <Text style={styles.link}>Označit vše přečtené</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => updateDb((draft) => { draft.notifications = draft.notifications.filter((item) => item.user !== user.id || !item.read); })}>
            <Text style={styles.dangerLink}>Smazat přečtené</Text>
          </TouchableOpacity>
        </View>
        {list.length === 0 && <Empty text="Žádné notifikace" />}
        {list.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={[styles.card, !item.read && styles.cardUnread, item.priority === 'high' && styles.cardDanger]}
            onPress={() => {
              updateDb((draft) => {
                const notification = draft.notifications.find((draftItem) => draftItem.id === item.id);
                if (notification) notification.read = true;
              });
              if (item.order) openOrder(item.order);
            }}
          >
            <View style={styles.rowBetween}>
              <View style={styles.flex}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.muted}>{item.body}</Text>
                <Text style={styles.tiny}>{item.at}</Text>
              </View>
              <View style={styles.rowGap}>
                <IconButton icon={item.priority === 'high' ? 'flash' : 'flash-outline'} onPress={() => updateDb((draft) => {
                  const notification = draft.notifications.find((draftItem) => draftItem.id === item.id);
                  if (notification) notification.priority = notification.priority === 'high' ? 'normal' : 'high';
                })} />
                <IconButton icon="trash-outline" danger onPress={() => updateDb((draft) => { draft.notifications = draft.notifications.filter((draftItem) => draftItem.id !== item.id); })} />
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  }

  function renderProducts() {
    const search = productSearch.trim().toLowerCase();
    const products = db.products.filter((product) => `${product.code} ${product.name} ${customerById(db, product.customer)?.name}`.toLowerCase().includes(search));
    return (
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.screenTitle}>Produkty a dokumentace</Text>
        <TextInput style={styles.input} value={productSearch} onChangeText={setProductSearch} placeholder="Hledat produkt nebo zákazníka..." />
        {products.map((product) => (
          <TouchableOpacity key={product.id} style={styles.card} onPress={() => { setSelectedProductId(product.id); setScreen('product'); }}>
            <View style={styles.rowBetween}>
              <View>
                <Text style={styles.cardTitle}>{product.code} · {product.name}</Text>
                <Text style={styles.muted}>{customerById(db, product.customer)?.name} · rev. {product.rev} · {product.docs.length} dokumentů</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  }

  function renderProduct(product: NonNullable<typeof selectedProduct>) {
    return (
      <ScrollView contentContainerStyle={styles.scroll}>
        <BackRow title={product.code} subtitle={`${product.name} · ${customerById(db, product.customer)?.name}`} onBack={() => setScreen('products')} />
        <Section title="Dokumenty knihovny">
          {product.docs.length === 0 && <Empty text="Produkt zatím nemá dokumenty" />}
          {product.docs.map((doc, index) => (
            <View key={`${doc}-${index}`} style={styles.docRow}>
              <Ionicons name="document-outline" size={18} color="#36B0AE" />
              <Text style={styles.docText}>{doc}</Text>
              <IconButton icon="trash-outline" danger onPress={() => updateDb((draft) => {
                const item = draft.products.find((draftProduct) => draftProduct.id === product.id);
                item?.docs.splice(index, 1);
              })} />
            </View>
          ))}
          <PrimaryButton label="Přidat mock dokument" icon="cloud-upload" onPress={() => updateDb((draft) => {
            const item = draft.products.find((draftProduct) => draftProduct.id === product.id);
            item?.docs.push(`Dokument_${Date.now()}.pdf`);
          })} />
        </Section>
        <Section title="Použitá stanoviště">
          {STATIONS.map((station) => {
            const selected = product.applicableStations.includes(station.id);
            const toggleStation = () => updateDb((draft) => {
              const item = draft.products.find((draftProduct) => draftProduct.id === product.id);
              if (!item) return;
              item.applicableStations = selected
                ? item.applicableStations.filter((id) => id !== station.id)
                : [...item.applicableStations, station.id].sort((a, b) => a - b);
            });
            return (
              <TouchableOpacity key={station.id} style={styles.toggleRow} onPress={toggleStation}>
                <Text style={styles.cardTitle}>{station.id}. {station.name}</Text>
                <Switch value={selected} onValueChange={toggleStation} />
              </TouchableOpacity>
            );
          })}
        </Section>
      </ScrollView>
    );
  }

  function renderDashboard() {
    const visible = db.orders.filter((order) => !order.hidden);
    const issueCount = visible.filter((order) => Object.values(order.stations).some((station) => station.status === 'issue')).length;
    const inProgress = visible.filter((order) => Object.values(order.stations).some((station) => station.status === 'active')).length;
    const overdue = visible.filter((order) => deadlineState(order.due) === 'overdue').length;
    const filtered = visible.filter((order) => {
      if (dashboardFilter === 'issues') return Object.values(order.stations).some((station) => station.status === 'issue');
      if (dashboardFilter === 'due') return deadlineState(order.due) !== 'ok';
      return true;
    });
    return (
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.screenTitle}>Přehled výroby</Text>
        <View style={styles.statsRow}>
          <TouchableOpacity style={styles.statBox} onPress={() => setDashboardFilter('active')}><Stat label="Aktivní" value={inProgress} color="#36B0AE" /></TouchableOpacity>
          <TouchableOpacity style={styles.statBox} onPress={() => setDashboardFilter('issues')}><Stat label="Problém" value={issueCount} color="#b91c1c" /></TouchableOpacity>
          <TouchableOpacity style={styles.statBox} onPress={() => setDashboardFilter('due')}><Stat label="Po termínu" value={overdue} color="#d97706" /></TouchableOpacity>
        </View>
        <Section title="Zakázky v přehledu">
          {filtered.map((order) => renderOrderCard(order, () => openOrder(order.id)))}
        </Section>
      </ScrollView>
    );
  }

  function renderUsers() {
    if (user.role !== 'admin') {
      return (
        <ScrollView contentContainerStyle={styles.scroll}>
          <Empty text="Správa uživatelů je dostupná jen pro Admina." />
        </ScrollView>
      );
    }
    return (
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.rowBetween}>
          <Text style={styles.screenTitle}>Správa uživatelů</Text>
          <IconButton icon="add" onPress={() => setScreen('newUser')} />
        </View>
        {db.users.map((item) => (
          <TouchableOpacity key={item.id} style={[styles.card, selectedUserId === item.id && styles.cardActive]} onPress={() => setSelectedUserId(item.id)}>
            <View style={styles.rowBetween}>
              <View>
                <Text style={styles.cardTitle}>{item.name}</Text>
                <Text style={styles.muted}>{item.email}</Text>
              </View>
              <Badge label={ROLE_LABELS[item.role]} tone={item.role === 'operator' ? 'blue' : 'green'} />
            </View>
            {selectedUserId === item.id && renderUserEditor(item)}
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  }

  function renderUserEditor(item: NonNullable<typeof selectedUser>) {
    return (
      <View style={styles.editorBlock}>
        <Text style={styles.sectionTitle}>Role</Text>
        <View style={styles.wrapRow}>
          {(Object.keys(ROLE_LABELS) as Role[]).map((role) => (
            <Chip key={role} label={ROLE_LABELS[role]} selected={item.role === role} onPress={() => updateDb((draft) => {
              const target = draft.users.find((draftUser) => draftUser.id === item.id);
              if (!target) return;
              target.role = role;
              if (role !== 'operator') target.quals = [];
            })} />
          ))}
        </View>
        {item.role === 'operator' && (
          <>
            <Text style={styles.sectionTitle}>Kvalifikace</Text>
            <View style={styles.wrapRow}>
              {QUALS.map((qual) => (
                <Chip key={qual} label={qual} selected={item.quals.includes(qual)} onPress={() => updateDb((draft) => {
                  const target = draft.users.find((draftUser) => draftUser.id === item.id);
                  if (!target) return;
                  target.quals = target.quals.includes(qual) ? target.quals.filter((q) => q !== qual) : [...target.quals, qual];
                })} />
              ))}
            </View>
            <Text style={styles.sectionTitle}>Výchozí stanoviště</Text>
            <View style={styles.wrapRow}>
              {STATIONS.filter((station) => item.quals.includes(station.qual)).map((station) => (
                <Chip key={station.id} label={`${station.id}. ${station.name}`} selected={item.defaultStation === station.id} onPress={() => updateDb((draft) => {
                  const target = draft.users.find((draftUser) => draftUser.id === item.id);
                  if (target) target.defaultStation = station.id;
                })} />
              ))}
            </View>
          </>
        )}
        <DangerButton label="Smazat uživatele" onPress={() => updateDb((draft) => { draft.users = draft.users.filter((draftUser) => draftUser.id !== item.id); })} />
      </View>
    );
  }

  function renderNewUser() {
    if (user.role !== 'admin') {
      return (
        <ScrollView contentContainerStyle={styles.scroll}>
          <Empty text="Nové uživatele může vytvářet jen Admin." />
        </ScrollView>
      );
    }
    return (
      <ScrollView contentContainerStyle={styles.scroll}>
        <BackRow title="Nový uživatel" onBack={() => setScreen('users')} />
        <FormField label="Jméno" value={newUser.name} onChangeText={(value) => setNewUser((draft) => ({ ...draft, name: value }))} />
        <FormField label="E-mail" value={newUser.email} onChangeText={(value) => setNewUser((draft) => ({ ...draft, email: value }))} />
        <Section title="Role">
          <View style={styles.wrapRow}>
            {(Object.keys(ROLE_LABELS) as Role[]).map((role) => (
              <Chip key={role} label={ROLE_LABELS[role]} selected={newUser.role === role} onPress={() => setNewUser((draft) => ({ ...draft, role, quals: role === 'operator' ? draft.quals : [] }))} />
            ))}
          </View>
        </Section>
        {newUser.role === 'operator' && (
          <Section title="Kvalifikace a stanoviště">
            <View style={styles.wrapRow}>
              {QUALS.map((qual) => (
                <Chip key={qual} label={qual} selected={newUser.quals.includes(qual)} onPress={() => setNewUser((draft) => ({ ...draft, quals: draft.quals.includes(qual) ? draft.quals.filter((q) => q !== qual) : [...draft.quals, qual] }))} />
              ))}
            </View>
            <View style={styles.wrapRow}>
              {STATIONS.filter((station) => newUser.quals.includes(station.qual)).map((station) => (
                <Chip key={station.id} label={`${station.id}. ${station.name}`} selected={newUser.defaultStation === station.id} onPress={() => setNewUser((draft) => ({ ...draft, defaultStation: station.id }))} />
              ))}
            </View>
          </Section>
        )}
        <PrimaryButton label="Vytvořit uživatele" icon="person-add" onPress={createUser} />
      </ScrollView>
    );
  }

  function renderSettings() {
    if (user.role !== 'admin') {
      return (
        <ScrollView contentContainerStyle={styles.scroll}>
          <Empty text="Nastavení aplikace může ovládat jen Admin." />
        </ScrollView>
      );
    }
    return (
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.screenTitle}>Nastavení aplikace</Text>
        <View style={styles.adminHero}>
          <Ionicons name="hardware-chip" size={30} color="#E6C336" />
          <View style={styles.flex}>
            <Text style={styles.adminHeroTitle}>HC electronics demo režim</Text>
            <Text style={styles.adminHeroText}>Role, přístupy a výrobní data jsou uložené lokálně v zařízení.</Text>
          </View>
        </View>

        <Section title="Admin nástroje">
          <View style={styles.adminGrid}>
            <TouchableOpacity style={styles.adminTile} onPress={() => setScreen('users')}>
              <Ionicons name="people" size={22} color="#E6C336" />
              <Text style={styles.adminTileTitle}>Uživatelé</Text>
              <Text style={styles.adminTileText}>Role a kvalifikace</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.adminTile} onPress={() => setScreen('audit')}>
              <Ionicons name="receipt" size={22} color="#E6C336" />
              <Text style={styles.adminTileTitle}>Audit log</Text>
              <Text style={styles.adminTileText}>Historie akcí</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.adminTile} onPress={() => setScreen('delete')}>
              <Ionicons name="trash" size={22} color="#E6C336" />
              <Text style={styles.adminTileTitle}>Mazání</Text>
              <Text style={styles.adminTileText}>Skryté zakázky</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.adminTile} onPress={() => setScreen('kpi')}>
              <Ionicons name="stats-chart" size={22} color="#E6C336" />
              <Text style={styles.adminTileTitle}>KPI</Text>
              <Text style={styles.adminTileText}>Výkon výroby</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.adminTile} onPress={() => setScreen('products')}>
              <Ionicons name="cube" size={22} color="#E6C336" />
              <Text style={styles.adminTileTitle}>Produkty</Text>
              <Text style={styles.adminTileText}>Dokumentace</Text>
            </TouchableOpacity>
          </View>
        </Section>

        <Section title="Role a oprávnění">
          {(Object.keys(ROLE_LABELS) as Role[]).map((role) => (
            <View key={role} style={styles.permissionCard}>
              <View style={styles.rowBetween}>
                <Text style={styles.cardTitle}>{ROLE_LABELS[role]}</Text>
                <Badge label={role} tone={role === 'admin' ? 'orange' : role === 'operator' ? 'blue' : 'green'} />
              </View>
              <Text style={styles.muted}>{rolePermissions[role].join(' · ')}</Text>
            </View>
          ))}
        </Section>

        <Section title="Demo data">
          <TouchableOpacity
            style={styles.dangerButton}
            onPress={() => {
              Alert.alert('Reset dat prototypu', 'Vrátit aplikaci do výchozího stavu?', [
                { text: 'Zrušit', style: 'cancel' },
                {
                  text: 'Resetovat',
                  style: 'destructive',
                  onPress: async () => {
                    const fresh = await resetPreviewDb();
                    const freshUser = fresh.users.find((item) => item.email === user.email) ?? currentUser(fresh);
                    fresh.sessionUserId = freshUser.id;
                    await savePreviewDb(fresh);
                    setDb(fresh);
                    setSelectedOrderId('o1');
                    setSelectedStationId(freshUser.defaultStation ?? 3);
                    setSelectedUserId(freshUser.id);
                    setLoginUserId(freshUser.id);
                    setScreen(defaultScreenForRole(freshUser.role) as Screen);
                  },
                },
              ]);
            }}
          >
            <Text style={styles.primaryButtonText}>Reset dat prototypu</Text>
          </TouchableOpacity>
        </Section>
      </ScrollView>
    );
  }

  function renderAudit() {
    if (user.role !== 'admin') {
      return (
        <ScrollView contentContainerStyle={styles.scroll}>
          <Empty text="Audit log je dostupný jen pro Admina." />
        </ScrollView>
      );
    }
    return (
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.screenTitle}>Audit log</Text>
        {db.audit.map((entry) => (
          <View key={entry.id} style={styles.card}>
            <Text style={styles.cardTitle}>{entry.title}</Text>
            <Text style={styles.muted}>{entry.at} · {userById(db, entry.who)?.name ?? entry.who}</Text>
            <Text style={styles.bodyText}>{entry.text}</Text>
          </View>
        ))}
      </ScrollView>
    );
  }

  function renderDelete() {
    if (user.role !== 'admin') {
      return (
        <ScrollView contentContainerStyle={styles.scroll}>
          <Empty text="Mazání je dostupné jen pro Admina." />
        </ScrollView>
      );
    }
    const hidden = db.orders.filter((order) => order.hidden);
    return (
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.screenTitle}>Skryté a trvalé mazání</Text>
        <Section title="Rychle skrýt aktivní">
          <View style={styles.wrapRow}>
            {db.orders.filter((order) => !order.hidden).map((order) => (
              <Chip key={order.id} label={`Skrýt ${order.number}`} onPress={() => updateDb((draft) => {
                const target = draft.orders.find((item) => item.id === order.id);
                if (target) target.hidden = true;
              })} />
            ))}
          </View>
        </Section>
        <Section title="Skryté zakázky">
          {hidden.length === 0 && <Empty text="Žádné skryté zakázky" />}
          {hidden.map((order) => (
            <View key={order.id} style={styles.card}>
              <Text style={styles.cardTitle}>{order.number}</Text>
              <Text style={styles.muted}>{orderLabel(db, order)}</Text>
              <View style={styles.rowGap}>
                <PrimaryButton compact label="Obnovit" icon="eye" onPress={() => updateDb((draft) => {
                  const target = draft.orders.find((item) => item.id === order.id);
                  if (target) target.hidden = false;
                })} />
                <DangerButton compact label="Smazat" onPress={() => deleteOrder(order.id)} />
              </View>
            </View>
          ))}
        </Section>
      </ScrollView>
    );
  }

  function renderKpi() {
    const activeOrders = db.orders.filter((order) => !order.hidden);
    const totalQty = activeOrders.reduce((sum, order) => sum + order.quantity, 0);
    const okQty = activeOrders.reduce((sum, order) => sum + Object.values(order.stations).reduce((inner, station) => inner + station.ok, 0), 0);
    const scrapQty = activeOrders.reduce((sum, order) => sum + Object.values(order.stations).reduce((inner, station) => inner + station.scrap, 0), 0);
    return (
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.screenTitle}>KPI dashboard</Text>
        <View style={styles.statsRow}>
          <Stat label="Zakázky" value={activeOrders.length} color="#111827" />
          <Stat label="Kusy" value={totalQty} color="#36B0AE" />
        </View>
        <View style={styles.statsRow}>
          <Stat label="OK zapsáno" value={okQty} color="#15803d" />
          <Stat label="Zmetky" value={scrapQty} color="#b91c1c" />
        </View>
        <Section title="Export reportu">
          <PrimaryButton label="Náhled PDF (mock)" icon="eye" onPress={() => showToast('Náhled PDF připraven')} />
          <PrimaryButton label="Export PDF (mock)" icon="document-text" onPress={() => showToast('PDF export připraven')} />
        </Section>
      </ScrollView>
    );
  }

  function renderNotes(order: Order, stationId?: number) {
    const notes = stationId ? order.notes.filter((note) => !note.stationId || note.stationId === stationId) : order.notes;
    return (
      <Section title={`Poznámky (${notes.length})`}>
        <TextInput style={[styles.input, styles.textArea]} value={noteText} onChangeText={setNoteText} placeholder="Přidat poznámku..." multiline />
        <PrimaryButton label="Uložit poznámku" icon="chatbubble" onPress={() => addNote(order.id, stationId)} />
        {notes.map((note) => (
          <View key={note.id} style={styles.noteCard}>
            <Text style={styles.muted}>{note.at} · {userById(db, note.by)?.name ?? ''}</Text>
            <Text style={styles.bodyText}>{note.text}</Text>
          </View>
        ))}
      </Section>
    );
  }

  function renderOrderCard(order: Order, onPress: () => void, stationId?: number) {
    const progress = stationProgress(order);
    const hasIssue = Object.values(order.stations).some((station) => station.status === 'issue');
    const deadline = deadlineState(order.due);
    const border = hasIssue ? '#b91c1c' : deadline === 'overdue' ? '#d97706' : deadline === 'soon' ? '#E6C336' : '#36B0AE';
    const station = stationId ? order.stations[stationId] : null;
    return (
      <TouchableOpacity key={order.id} style={[styles.card, { borderLeftColor: border, borderLeftWidth: 4 }]} onPress={onPress}>
        <View style={styles.rowBetween}>
          <View style={styles.flex}>
            <Text style={styles.cardTitle}>{order.number}</Text>
            <Text style={styles.muted}>{orderLabel(db, order)}</Text>
          </View>
          <Badge label={station ? statusLabels[station.status] : priorityLabels[order.priority]} tone={hasIssue ? 'red' : 'blue'} />
        </View>
        <Progress percent={progress.percent} />
        <View style={styles.rowBetween}>
          <Text style={styles.tiny}>{order.quantity} ks · {formatDate(order.due)}</Text>
          {station && <Text style={styles.tiny}>Přišlo {arrivedAt(order, stationId!)} · OK {station.ok}</Text>}
        </View>
      </TouchableOpacity>
    );
  }

  function renderTransferModal() {
    return (
      <Modal visible={!!transferModal} transparent animationType="slide" onRequestClose={() => setTransferModal(null)}>
        <View style={styles.modalShade}>
          <View style={styles.modalCard}>
            <Text style={styles.screenTitle}>Předat kusy</Text>
            <Text style={styles.muted}>Vyber množství OK kusů pro další stanoviště.</Text>
            <View style={styles.qtyPicker}>
              <TouchableOpacity style={styles.roundButton} onPress={() => transferModal && setTransferModal({ ...transferModal, qty: Math.max(1, transferModal.qty - 1) })}>
                <Text style={styles.roundButtonText}>-</Text>
              </TouchableOpacity>
              <TextInput
                style={styles.qtyNumber}
                value={String(transferModal?.qty ?? 0)}
                onChangeText={(value) => transferModal && setTransferModal({ ...transferModal, qty: Math.min(transferModal.max, Math.max(1, parseQtyInput(value))) })}
                keyboardType="number-pad"
                selectTextOnFocus
              />
              <TouchableOpacity style={styles.roundButton} onPress={() => transferModal && setTransferModal({ ...transferModal, qty: Math.min(transferModal.max, transferModal.qty + 1) })}>
                <Text style={styles.roundButtonText}>+</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.rowGap}>
              <TouchableOpacity style={styles.outlineButtonFlex} onPress={() => setTransferModal(null)}><Text style={styles.outlineButtonText}>Zrušit</Text></TouchableOpacity>
              <TouchableOpacity style={styles.primaryButtonFlex} onPress={doTransfer}><Text style={styles.primaryButtonText}>Předat</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  function renderIssueModal() {
    return (
      <Modal visible={!!issueModal} transparent animationType="slide" onRequestClose={() => setIssueModal(null)}>
        <View style={styles.modalShade}>
          <View style={styles.modalCard}>
            <Text style={styles.screenTitle}>Nahlásit problém</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={issueModal?.note ?? ''}
              onChangeText={(note) => issueModal && setIssueModal({ ...issueModal, note })}
              placeholder="Co se stalo?"
              multiline
            />
            <View style={styles.rowGap}>
              <TouchableOpacity style={styles.outlineButtonFlex} onPress={() => setIssueModal(null)}><Text style={styles.outlineButtonText}>Zrušit</Text></TouchableOpacity>
              <TouchableOpacity style={styles.dangerButtonFlex} onPress={doReportIssue}><Text style={styles.primaryButtonText}>Nahlásit</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  function deleteOrder(orderId: string) {
    Alert.alert('Trvale smazat?', 'Tato akce je nevratná.', [
      { text: 'Zrušit', style: 'cancel' },
      {
        text: 'Smazat',
        style: 'destructive',
        onPress: () => updateDb((draft) => {
          draft.orders = draft.orders.filter((order) => order.id !== orderId);
          pushAudit(draft, draft.sessionUserId, 'Zakázka smazána', orderId);
          if (selectedOrderId === orderId) setScreen('orders');
        }),
      },
    ]);
  }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress?: () => void }) {
  return (
    <TouchableOpacity style={[styles.chip, selected && styles.chipSelected]} onPress={onPress}>
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Badge({ label, tone = 'blue' }: { label: string; tone?: 'blue' | 'green' | 'red' | 'orange' }) {
  const toneStyle = tone === 'green' ? styles.badgeGreen : tone === 'red' ? styles.badgeRed : tone === 'orange' ? styles.badgeOrange : styles.badgeBlue;
  return (
    <View style={[styles.badge, toneStyle]}>
      <Text style={styles.badgeText}>{label}</Text>
    </View>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Progress({ percent }: { percent: number }) {
  return (
    <View style={styles.progress}>
      <View style={[styles.progressFill, { width: `${Math.max(0, Math.min(100, percent))}%` }]} />
    </View>
  );
}

function CountBox({ label, value, color, onChange }: { label: string; value: number; color: string; onChange: (value: number) => void }) {
  return (
    <View style={styles.countBox}>
      <TextInput
        style={[styles.countInput, { color }]}
        value={String(value)}
        onChangeText={(text) => onChange(parseQtyInput(text))}
        keyboardType="number-pad"
        selectTextOnFocus
      />
      <Text style={styles.countLabel}>{label}</Text>
      <View style={styles.countControls}>
        <TouchableOpacity style={styles.countButton} onPress={() => onChange(value - 1)}><Text style={styles.countButtonText}>-</Text></TouchableOpacity>
        <TouchableOpacity style={styles.countButton} onPress={() => onChange(value + 1)}><Text style={styles.countButtonText}>+</Text></TouchableOpacity>
      </View>
    </View>
  );
}

function BackRow({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack: () => void }) {
  return (
    <View style={styles.backRow}>
      <TouchableOpacity style={styles.backButton} onPress={onBack}>
        <Ionicons name="chevron-back" size={24} color="#E6C336" />
      </TouchableOpacity>
      <View style={styles.flex}>
        <Text style={styles.screenTitle}>{title}</Text>
        {!!subtitle && <Text style={styles.muted}>{subtitle}</Text>}
      </View>
    </View>
  );
}

function FormField({ label, value, onChangeText, keyboardType }: { label: string; value: string; onChangeText: (value: string) => void; keyboardType?: 'default' | 'number-pad' }) {
  return (
    <View style={styles.formField}>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={styles.input} value={value} onChangeText={onChangeText} keyboardType={keyboardType} />
    </View>
  );
}

function IconButton({ icon, onPress, danger }: { icon: string; onPress: () => void; danger?: boolean }) {
  return (
    <TouchableOpacity style={[styles.iconButton, danger && styles.iconButtonDanger]} onPress={onPress}>
      <Ionicons name={icon as any} size={18} color={danger ? '#b91c1c' : '#E6C336'} />
    </TouchableOpacity>
  );
}

function PrimaryButton({ label, icon, onPress, compact }: { label: string; icon: string; onPress: () => void; compact?: boolean }) {
  return (
    <TouchableOpacity style={[styles.primaryButton, compact && styles.compactButton]} onPress={onPress}>
      <Ionicons name={icon as any} size={17} color="#fff" />
      <Text style={styles.primaryButtonText}>{label}</Text>
    </TouchableOpacity>
  );
}

function DangerButton({ label, onPress, compact }: { label: string; onPress: () => void; compact?: boolean }) {
  return (
    <TouchableOpacity style={[styles.dangerButton, compact && styles.compactButton]} onPress={onPress}>
      <Text style={styles.primaryButtonText}>{label}</Text>
    </TouchableOpacity>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <View style={styles.empty}>
      <Ionicons name="cube-outline" size={34} color="#cbd5e1" />
      <Text style={styles.muted}>{text}</Text>
    </View>
  );
}

function formatDate(value: string) {
  if (!value) return 'bez termínu';
  return new Date(value).toLocaleDateString('cs-CZ');
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#050505' },
  safeDark: { backgroundColor: '#0f172a' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#050505' },
  loginSafe: { flex: 1, backgroundColor: '#050505' },
  loginScroll: { padding: 20, paddingBottom: 40 },
  loginLogoMark: { width: 58, height: 58, borderRadius: 29, borderWidth: 1.5, borderColor: '#E6C336', alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginTop: 20, marginBottom: 10, backgroundColor: '#102f35' },
  loginBrand: { color: '#36B0AE', fontSize: 15, fontWeight: '900', textAlign: 'center', textTransform: 'uppercase' },
  loginTitle: { color: '#fff', fontSize: 34, fontWeight: '900', textAlign: 'center', marginTop: 2 },
  loginSubtitle: { color: '#cbd5e1', fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 8, marginBottom: 18 },
  loginPanel: { backgroundColor: '#0b0f10', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#1D5B66' },
  loginPanelTitle: { color: '#fff', fontSize: 16, fontWeight: '900', marginBottom: 10 },
  loginUserRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#1f2937', backgroundColor: '#071a1d', marginBottom: 8 },
  loginUserRowActive: { borderColor: '#E6C336', backgroundColor: '#102f35' },
  loginAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#1D5B66', alignItems: 'center', justifyContent: 'center' },
  loginAvatarText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  loginUserName: { color: '#fff', fontSize: 14, fontWeight: '900' },
  loginUserMeta: { color: '#94a3b8', fontSize: 11, marginTop: 2 },
  loginLabel: { color: '#E6C336', fontSize: 12, fontWeight: '900', marginTop: 10, marginBottom: 5, textTransform: 'uppercase' },
  loginInput: { backgroundColor: '#050505', borderWidth: 1, borderColor: '#1D5B66', borderRadius: 10, minHeight: 46, paddingHorizontal: 12, color: '#fff', fontSize: 18, fontWeight: '900' },
  loginError: { color: '#fca5a5', fontSize: 12, fontWeight: '800', marginTop: 8 },
  loginButton: { marginTop: 12, backgroundColor: '#E6C336', borderRadius: 10, padding: 13, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  loginButtonText: { color: '#050505', fontWeight: '900', fontSize: 14 },
  header: { backgroundColor: '#050505', borderBottomWidth: 1, borderBottomColor: '#1D5B66', paddingHorizontal: 18, paddingTop: 12, paddingBottom: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerKicker: { color: '#36B0AE', fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '800' },
  headerSub: { color: '#E6C336', fontSize: 13, marginTop: 2 },
  headerButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  roleBar: { maxHeight: 54, backgroundColor: '#050505' },
  roleBarContent: { paddingHorizontal: 14, paddingBottom: 12, gap: 8 },
  content: { flex: 1 },
  scroll: { padding: 14, paddingBottom: 104 },
  bottomNav: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#1D5B66', backgroundColor: '#050505', paddingVertical: 6 },
  navItem: { flex: 1, alignItems: 'center', gap: 2 },
  navText: { fontSize: 10, color: '#94a3b8', fontWeight: '700' },
  navTextActive: { color: '#E6C336' },
  screenTitle: { fontSize: 21, fontWeight: '900', color: '#fff' },
  section: { marginTop: 14 },
  sectionTitle: { fontSize: 13, fontWeight: '900', color: '#36B0AE', marginBottom: 8, textTransform: 'uppercase' },
  card: { backgroundColor: '#0b0f10', borderRadius: 10, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#12383f' },
  cardActive: { borderWidth: 1.5, borderColor: '#E6C336' },
  cardUnread: { backgroundColor: '#102f35' },
  cardDanger: { borderLeftWidth: 4, borderLeftColor: '#b91c1c' },
  cardTitle: { fontSize: 15, fontWeight: '900', color: '#fff' },
  bodyText: { color: '#cbd5e1', fontSize: 14, marginTop: 5, lineHeight: 20 },
  muted: { color: '#94a3b8', fontSize: 12, marginTop: 3 },
  tiny: { color: '#94a3b8', fontSize: 11 },
  errorText: { color: '#fca5a5', fontSize: 12, fontWeight: '800', marginTop: 8 },
  infoBox: { backgroundColor: '#102f35', borderRadius: 10, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#1D5B66' },
  infoText: { color: '#E6C336', fontWeight: '800' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  rowGap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  flex: { flex: 1 },
  chip: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: '#1D5B66', backgroundColor: '#071a1d' },
  chipSelected: { backgroundColor: '#1D5B66', borderColor: '#E6C336' },
  chipText: { color: '#cbd5e1', fontSize: 12, fontWeight: '800' },
  chipTextSelected: { color: '#fff' },
  badge: { borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4 },
  badgeBlue: { backgroundColor: '#dbeafe' },
  badgeGreen: { backgroundColor: '#dcfce7' },
  badgeRed: { backgroundColor: '#fee2e2' },
  badgeOrange: { backgroundColor: '#fef3c7' },
  badgeText: { color: '#111827', fontSize: 11, fontWeight: '800' },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  statBox: { flex: 1 },
  stat: { flex: 1, backgroundColor: '#0b0f10', borderRadius: 10, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#12383f' },
  statValue: { fontSize: 22, fontWeight: '900' },
  statLabel: { color: '#94a3b8', fontSize: 11, fontWeight: '800' },
  progress: { height: 7, borderRadius: 4, backgroundColor: '#1f2937', overflow: 'hidden', marginTop: 10, marginBottom: 7 },
  progressFill: { height: '100%', backgroundColor: '#36B0AE' },
  stationRow: { backgroundColor: '#0b0f10', borderRadius: 10, padding: 12, marginBottom: 8, borderLeftWidth: 4, borderTopWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderTopColor: '#12383f', borderRightColor: '#12383f', borderBottomColor: '#12383f' },
  countGrid: { flexDirection: 'row', gap: 8 },
  countBox: { flex: 1, backgroundColor: '#071a1d', borderRadius: 10, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: '#1D5B66' },
  countValue: { fontSize: 24, fontWeight: '900' },
  countInput: { width: '100%', minHeight: 40, padding: 0, fontSize: 24, fontWeight: '900', textAlign: 'center' },
  countLabel: { fontSize: 11, color: '#94a3b8', fontWeight: '900', textTransform: 'uppercase' },
  countControls: { flexDirection: 'row', gap: 8, marginTop: 9 },
  countButton: { width: 34, height: 30, borderRadius: 8, backgroundColor: '#102f35', alignItems: 'center', justifyContent: 'center' },
  countButtonText: { fontSize: 18, fontWeight: '900', color: '#E6C336' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#0b0f10', padding: 12, borderRadius: 9, marginBottom: 7, borderWidth: 1, borderColor: '#12383f' },
  checkText: { flex: 1, color: '#cbd5e1', fontSize: 14 },
  checkTextDone: { color: '#15803d', textDecorationLine: 'line-through' },
  actionStack: { gap: 9, marginTop: 12 },
  primaryButton: { backgroundColor: '#1D5B66', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 8, borderWidth: 1, borderColor: '#36B0AE' },
  dangerButton: { backgroundColor: '#b91c1c', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  compactButton: { paddingVertical: 8, paddingHorizontal: 10, flex: 1 },
  primaryButtonText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  outlineButton: { borderWidth: 1.5, borderColor: '#E6C336', borderRadius: 10, padding: 12, alignItems: 'center', marginTop: 12 },
  outlineButtonText: { color: '#E6C336', fontWeight: '900' },
  outlineButtonFlex: { flex: 1, borderWidth: 1.5, borderColor: '#E6C336', borderRadius: 10, padding: 12, alignItems: 'center' },
  primaryButtonFlex: { flex: 1, backgroundColor: '#1D5B66', borderRadius: 10, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#36B0AE' },
  dangerButtonFlex: { flex: 1, backgroundColor: '#b91c1c', borderRadius: 10, padding: 12, alignItems: 'center' },
  iconButton: { width: 34, height: 34, borderRadius: 9, backgroundColor: '#102f35', alignItems: 'center', justifyContent: 'center' },
  iconButtonDanger: { backgroundColor: '#fee2e2' },
  input: { backgroundColor: '#071a1d', borderWidth: 1, borderColor: '#1D5B66', borderRadius: 10, minHeight: 43, paddingHorizontal: 12, fontSize: 15, color: '#fff' },
  textArea: { minHeight: 76, paddingTop: 10, textAlignVertical: 'top' },
  formField: { marginTop: 12 },
  label: { color: '#36B0AE', fontSize: 12, fontWeight: '900', marginBottom: 5 },
  tabRow: { flexDirection: 'row', backgroundColor: '#071a1d', borderRadius: 11, padding: 4, marginTop: 12, borderWidth: 1, borderColor: '#1D5B66' },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  tabActive: { backgroundColor: '#1D5B66' },
  tabText: { fontSize: 12, color: '#94a3b8', fontWeight: '900' },
  tabTextActive: { color: '#fff' },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: '#0b0f10', borderRadius: 9, padding: 12, marginBottom: 7, borderWidth: 1, borderColor: '#12383f' },
  docText: { flex: 1, color: '#cbd5e1', fontWeight: '800' },
  noteCard: { backgroundColor: '#0b0f10', borderRadius: 9, padding: 11, marginTop: 8, borderWidth: 1, borderColor: '#12383f' },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  backButton: { width: 38, height: 38, borderRadius: 10, backgroundColor: '#102f35', alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#0b0f10', borderRadius: 10, borderWidth: 1, borderColor: '#12383f' },
  link: { color: '#36B0AE', fontWeight: '900' },
  dangerLink: { color: '#b91c1c', fontWeight: '800' },
  toggleRow: { backgroundColor: '#0b0f10', borderRadius: 10, padding: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#12383f' },
  editorBlock: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#1D5B66' },
  toast: { position: 'absolute', left: 18, right: 18, bottom: 78, backgroundColor: '#111827', padding: 13, borderRadius: 12, alignItems: 'center' },
  toastText: { color: '#fff', fontWeight: '800' },
  modalShade: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#0b0f10', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 30, borderWidth: 1, borderColor: '#1D5B66' },
  qtyPicker: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18, marginVertical: 20 },
  roundButton: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#102f35', alignItems: 'center', justifyContent: 'center' },
  roundButtonText: { fontSize: 24, fontWeight: '900', color: '#E6C336' },
  qtyNumber: { fontSize: 36, fontWeight: '900', color: '#fff', minWidth: 96, textAlign: 'center', borderBottomWidth: 1, borderBottomColor: '#E6C336', padding: 0 },
  faceCard: { backgroundColor: '#0b0f10', borderRadius: 14, padding: 24, alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: '#1D5B66' },
  faceTitle: { color: '#fff', fontSize: 21, fontWeight: '900', marginTop: 8 },
  faceText: { color: '#cbd5e1', fontSize: 13, textAlign: 'center', lineHeight: 19, marginTop: 6 },
  profileActionRow: { flexDirection: 'row', gap: 8, marginTop: 16, width: '100%' },
  adminHero: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#102f35', borderRadius: 12, padding: 14, marginTop: 12, borderWidth: 1, borderColor: '#1D5B66' },
  adminHeroTitle: { color: '#fff', fontSize: 16, fontWeight: '900' },
  adminHeroText: { color: '#cbd5e1', fontSize: 12, lineHeight: 17, marginTop: 2 },
  adminGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  adminTile: { width: '48%', minHeight: 104, backgroundColor: '#0b0f10', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#1D5B66', justifyContent: 'space-between' },
  adminTileTitle: { color: '#fff', fontSize: 14, fontWeight: '900', marginTop: 8 },
  adminTileText: { color: '#94a3b8', fontSize: 11, marginTop: 2 },
  permissionCard: { backgroundColor: '#0b0f10', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#12383f', marginBottom: 8 },
});
