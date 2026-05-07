import AsyncStorage from '@react-native-async-storage/async-storage';

export type Role = 'operator' | 'tpv' | 'dispatcher' | 'management' | 'admin';
export type StationStatus = 'waiting' | 'active' | 'done' | 'issue';
export type Priority = 'low' | 'normal' | 'high' | 'urgent';
export type ProductionType = 'new' | 'repeat' | 'revision';
export type Technology = 'lead' | 'leadfree';
export type MaterialStatus = 'ok' | 'substitute' | 'missing';

export type StationDef = { id: number; name: string; qual: string };
export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  quals: string[];
  defaultStation?: number;
};
export type Customer = { id: string; name: string };
export type Product = {
  id: string;
  customer: string;
  code: string;
  name: string;
  rev: string;
  waveProgram: string | null;
  stencilNumber: string | null;
  applicableStations: number[];
  docs: string[];
};
export type OrderStation = {
  applicable: boolean;
  status: StationStatus;
  arrived: number;
  ok: number;
  rework: number;
  scrap: number;
  transferred: number;
  issueNote: string | null;
  checklist: boolean[];
};
export type Transfer = { from: number; to: number; qty: number; at: string; by: string };
export type Note = { id: string; at: string; by: string; text: string; stationId?: number };
export type Order = {
  id: string;
  number: string;
  customer: string;
  product: string;
  quantity: number;
  priority: Priority;
  due: string;
  created: string;
  type: ProductionType;
  technology: Technology;
  stencilNumber: string;
  automat?: string;
  automatProgram?: string;
  materialStatus?: MaterialStatus;
  materialNote?: string;
  hidden: boolean;
  stations: Record<number, OrderStation>;
  transfers: Transfer[];
  notes: Note[];
};
export type Notification = {
  id: string;
  user: string;
  icon: string;
  title: string;
  body: string;
  priority: 'low' | 'normal' | 'high';
  type: 'issue' | 'due' | 'transfer' | 'system';
  read: boolean;
  at: string;
  order: string | null;
};
export type AuditEntry = { id: string; at: string; who: string; title: string; text: string };
export type PreviewDb = {
  users: User[];
  customers: Customer[];
  products: Product[];
  orders: Order[];
  notifications: Notification[];
  audit: AuditEntry[];
  sessionUserId: string;
  darkMode: boolean;
};

export const STORAGE_KEY = 'aplikace-pro-vyrobu-preview-v6';

export const STATIONS: StationDef[] = [
  { id: 1, name: 'Sklad', qual: 'sklad' },
  { id: 2, name: 'Automaty', qual: 'automat' },
  { id: 3, name: 'AOI kontrola', qual: 'aoi' },
  { id: 4, name: 'RTG', qual: 'rtg' },
  { id: 5, name: 'Oprava po AOI', qual: 'oprava_aoi' },
  { id: 6, name: 'Osazování', qual: 'osazovani' },
  { id: 7, name: 'Pájení vlnou', qual: 'pajeni_vlna' },
  { id: 8, name: 'Oprava po pájení', qual: 'pajeni_rucni' },
  { id: 9, name: 'Programování', qual: 'programovani' },
  { id: 10, name: 'Lakování', qual: 'lakovani' },
  { id: 11, name: 'Výstupní kontrola', qual: 'vystupni_kontrola' },
  { id: 12, name: 'Balení', qual: 'baleni' },
];

export const AUTOMATS = ['Alfa', 'Beta', 'Gama', 'Delta', 'Eta', 'Theta'];
export const QUALS = [
  'sklad',
  'automat',
  'aoi',
  'rtg',
  'oprava_aoi',
  'osazovani',
  'pajeni_vlna',
  'pajeni_selektivni',
  'pajeni_rucni',
  'programovani',
  'lakovani',
  'vystupni_kontrola',
  'baleni',
  'myti',
  'testovani',
];

export const ROLE_LABELS: Record<Role, string> = {
  operator: 'Operátor',
  tpv: 'TPV',
  dispatcher: 'Mistr',
  management: 'Vedení',
  admin: 'Admin',
};

export function stationById(id: number) {
  return STATIONS.find((station) => station.id === id);
}

export function defaultScreenForRole(role: Role) {
  return role === 'operator'
    ? 'queue'
    : role === 'tpv'
      ? 'products'
      : role === 'admin'
        ? 'users'
        : 'dashboard';
}

export function createDefaultDb(): PreviewDb {
  return {
    users: [
      { id: 'u1', name: 'Jan Novák', email: 'jan.novak@firma.cz', role: 'operator', quals: ['aoi', 'oprava_aoi', 'vystupni_kontrola'], defaultStation: 3 },
      { id: 'u2', name: 'Petr Dvořák', email: 'petr.dvorak@firma.cz', role: 'tpv', quals: [] },
      { id: 'u3', name: 'Martin Svoboda', email: 'martin.svoboda@firma.cz', role: 'dispatcher', quals: [] },
      { id: 'u4', name: 'Eva Králová', email: 'eva.kralova@firma.cz', role: 'management', quals: [] },
      { id: 'u5', name: 'IT Admin', email: 'admin@firma.cz', role: 'admin', quals: [] },
      { id: 'u6', name: 'Lucie Bláhová', email: 'lucie@firma.cz', role: 'operator', quals: ['automat', 'osazovani', 'pajeni_vlna'], defaultStation: 2 },
      { id: 'u7', name: 'Karel Malý', email: 'karel@firma.cz', role: 'operator', quals: ['baleni', 'vystupni_kontrola'], defaultStation: 12 },
    ],
    customers: [
      { id: 'c1', name: 'Siemens' },
      { id: 'c2', name: 'Bosch' },
      { id: 'c3', name: 'ABB' },
    ],
    products: [
      { id: 'p1', customer: 'c1', code: 'PCB-A-007', name: 'Řídicí deska', rev: 'B', waveProgram: 'W-142', stencilNumber: 'PL-1427', applicableStations: [1, 2, 3, 5, 6, 7, 8, 11, 12], docs: ['BOM_PCB-A-007_v3.xlsx', 'Vykres_PCB-A-007.pdf', 'Pruvodni_list.pdf'] },
      { id: 'p2', customer: 'c1', code: 'PCB-A-008', name: 'Ovladač', rev: 'A', waveProgram: 'W-118', stencilNumber: 'PL-1184', applicableStations: [1, 2, 3, 5, 6, 7, 11, 12], docs: ['BOM_PCB-A-008_v1.xlsx', 'Vykres_PCB-A-008.pdf'] },
      { id: 'p3', customer: 'c1', code: 'PCB-A-009', name: 'Zesilovač', rev: 'A', waveProgram: null, stencilNumber: null, applicableStations: [1, 2, 3, 6, 11, 12], docs: [] },
      { id: 'p4', customer: 'c2', code: 'MB-012', name: 'Napájecí zdroj', rev: 'C', waveProgram: 'W-091', stencilNumber: 'PL-0912', applicableStations: [1, 2, 3, 4, 5, 6, 7, 8, 11, 12], docs: ['BOM_MB-012.xlsx'] },
      { id: 'p5', customer: 'c3', code: 'RB-004', name: 'Snímač', rev: 'D', waveProgram: null, stencilNumber: 'PL-004D', applicableStations: [1, 2, 3, 6, 11, 12], docs: ['BOM_RB-004.xlsx', 'Vykres_RB-004.pdf'] },
    ],
    orders: [
      makeOrder({
        id: 'o1',
        number: '260321',
        customer: 'c1',
        product: 'p1',
        quantity: 1000,
        priority: 'urgent',
        due: '2026-04-27',
        created: '2026-04-22',
        type: 'repeat',
        technology: 'leadfree',
        stencilNumber: 'PL-1427',
        automat: 'Alfa',
        stationPresets: {
          1: { status: 'done', arrived: 1000, ok: 1000, transferred: 1000 },
          2: { status: 'active', arrived: 1000, ok: 800, transferred: 800 },
          3: { status: 'active', arrived: 800, ok: 200, rework: 5, transferred: 205 },
          4: { off: true },
          5: { status: 'active', arrived: 5 },
          6: { status: 'active', arrived: 195, ok: 50, transferred: 50 },
          7: { status: 'waiting', arrived: 50 },
          8: { status: 'waiting' },
          11: { status: 'waiting' },
          12: { status: 'waiting' },
        },
        transfers: [
          { from: 1, to: 2, qty: 1000, at: '22.4. 08:15', by: 'u1' },
          { from: 2, to: 3, qty: 300, at: '22.4. 09:02', by: 'u6' },
          { from: 2, to: 3, qty: 500, at: '22.4. 09:45', by: 'u6' },
          { from: 3, to: 6, qty: 200, at: '22.4. 10:20', by: 'u1' },
          { from: 3, to: 5, qty: 5, at: '22.4. 10:22', by: 'u1' },
          { from: 6, to: 7, qty: 50, at: '22.4. 11:14', by: 'u6' },
        ],
      }),
      makeOrder({
        id: 'o2',
        number: '260318',
        customer: 'c2',
        product: 'p4',
        quantity: 500,
        priority: 'normal',
        due: '2026-04-25',
        created: '2026-04-20',
        type: 'new',
        technology: 'lead',
        stencilNumber: '',
        stationPresets: {
          1: { status: 'done', arrived: 500, ok: 500, transferred: 500 },
          2: { status: 'active', arrived: 500, ok: 100, transferred: 100 },
          3: { status: 'waiting', arrived: 100 },
          4: { status: 'waiting' },
          5: { status: 'waiting' },
          6: { status: 'waiting' },
          7: { status: 'waiting' },
          8: { status: 'waiting' },
          11: { status: 'waiting' },
          12: { status: 'waiting' },
        },
        transfers: [
          { from: 1, to: 2, qty: 500, at: '20.4. 10:00', by: 'u1' },
          { from: 2, to: 3, qty: 100, at: '23.4. 08:30', by: 'u6' },
        ],
      }),
      makeOrder({
        id: 'o3',
        number: '260315',
        customer: 'c3',
        product: 'p5',
        quantity: 200,
        priority: 'high',
        due: '2026-04-22',
        created: '2026-04-15',
        type: 'repeat',
        technology: 'leadfree',
        stencilNumber: 'PL-004D',
        stationPresets: {
          1: { status: 'done', arrived: 200, ok: 200, transferred: 200 },
          2: { status: 'done', arrived: 200, ok: 200, transferred: 200 },
          3: { status: 'issue', arrived: 200, ok: 80, rework: 15, scrap: 5, issueNote: 'AOI hlásí nesprávné pájení R12 - zastaveno.' },
          6: { status: 'waiting', arrived: 80 },
          11: { status: 'waiting' },
          12: { status: 'waiting' },
        },
        transfers: [
          { from: 1, to: 2, qty: 200, at: '15.4. 09:00', by: 'u1' },
          { from: 2, to: 3, qty: 200, at: '16.4. 14:30', by: 'u6' },
          { from: 3, to: 6, qty: 80, at: '18.4. 11:20', by: 'u1' },
        ],
      }),
    ],
    notifications: [
      { id: 'n1', user: 'u1', icon: '!', title: 'Problém na AOI', body: '260315 · ABB - vadné R12', priority: 'high', type: 'issue', read: false, at: 'před 5 min', order: 'o3' },
      { id: 'n2', user: 'u1', icon: 'T', title: 'Termín do 2 dnů', body: '260318 · Bosch · MB-012', priority: 'normal', type: 'due', read: false, at: 'před 1 hod', order: 'o2' },
      { id: 'n3', user: 'u1', icon: '>', title: 'Přišly kusy z AOI', body: '260321 · 5 ks k opravě', priority: 'normal', type: 'transfer', read: false, at: 'před 3 hod', order: 'o1' },
      { id: 'n4', user: 'u1', icon: 'i', title: 'Kvalifikace přidána', body: 'Výstupní kontrola', priority: 'low', type: 'system', read: true, at: 'včera', order: null },
    ],
    audit: [
      { id: 'a1', at: '23.4. 09:45', who: 'u6', title: '260321 · Automat -> AOI', text: 'předal 500 ks na AOI' },
      { id: 'a2', at: '23.4. 09:20', who: 'u6', title: '260321 · Status change', text: 'Automat z waiting na active' },
      { id: 'a3', at: '23.4. 09:15', who: 'u2', title: '260321 · Dokumenty', text: 'nahrál BOM_PCB-A-007_v3.xlsx' },
      { id: 'a4', at: '22.4. 14:32', who: 'u3', title: '260321 · Vytvořeno', text: 'vytvořil zakázku (1000 ks)' },
    ],
    sessionUserId: 'u1',
    darkMode: false,
  };
}

export async function loadPreviewDb() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultDb();
    return normalizeDb(JSON.parse(raw) as PreviewDb);
  } catch {
    return createDefaultDb();
  }
}

export async function savePreviewDb(db: PreviewDb) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

export async function resetPreviewDb() {
  const db = createDefaultDb();
  await savePreviewDb(db);
  return db;
}

export function userById(db: PreviewDb, id: string) {
  return db.users.find((user) => user.id === id);
}

export function currentUser(db: PreviewDb) {
  return userById(db, db.sessionUserId) ?? db.users[0];
}

export function customerById(db: PreviewDb, id: string) {
  return db.customers.find((customer) => customer.id === id);
}

export function productById(db: PreviewDb, id: string) {
  return db.products.find((product) => product.id === id);
}

export function orderLabel(db: PreviewDb, order: Order) {
  const customer = customerById(db, order.customer)?.name ?? 'Bez zákazníka';
  const product = productById(db, order.product);
  return `${customer} · ${product?.code ?? 'Produkt'} · ${product?.name ?? order.product}`;
}

export function stationProgress(order: Order) {
  const applicable = Object.values(order.stations).filter((station) => station.applicable);
  const done = applicable.filter((station) => station.status === 'done').length;
  return { done, total: applicable.length || 1, percent: Math.round((done / (applicable.length || 1)) * 100) };
}

export function arrivedAt(order: Order, stationId: number) {
  if (stationId === 1) return order.quantity;
  return order.transfers.filter((transfer) => transfer.to === stationId).reduce((sum, transfer) => sum + transfer.qty, 0);
}

export function forwardedFrom(order: Order, stationId: number) {
  return order.transfers.filter((transfer) => transfer.from === stationId).reduce((sum, transfer) => sum + transfer.qty, 0);
}

export function cappedStationCount(order: Order, stationId: number, field: 'ok' | 'rework' | 'scrap', value: number) {
  const station = order.stations[stationId];
  if (!station) return 0;
  const arrived = arrivedAt(order, stationId);
  const other = (field === 'ok' ? 0 : station.ok)
    + (field === 'rework' ? 0 : station.rework)
    + (field === 'scrap' ? 0 : station.scrap);
  return Math.min(Math.max(0, value), Math.max(0, arrived - other));
}

export function nextApplicableStation(order: Order, from: number) {
  for (let id = from + 1; id <= 12; id += 1) {
    if (order.stations[id]?.applicable) return id;
  }
  return null;
}

export function canCreateOrder(role: Role) {
  return role === 'dispatcher' || role === 'management' || role === 'admin';
}

export function canEditOrders(role: Role) {
  return role === 'dispatcher' || role === 'management' || role === 'admin';
}

export function canHardDeleteOrders(role: Role) {
  return role === 'admin';
}

export function canOperate(user: User, stationId: number) {
  const qual = stationById(stationId)?.qual;
  return user.role !== 'operator' || !qual || user.quals.includes(qual);
}

export function deadlineState(due: string) {
  if (!due) return 'none';
  const now = new Date('2026-04-23');
  const diff = (new Date(due).getTime() - now.getTime()) / 86400000;
  if (diff < 0) return 'overdue';
  if (diff <= 3) return 'soon';
  return 'ok';
}

export function nowLabel() {
  const date = new Date();
  return `${date.getDate()}.${date.getMonth() + 1}. ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function checklistForStation(stationId: number) {
  const custom: Record<number, string[]> = {
    1: ['Materiál vychystán', 'Šarže zkontrolována', 'Materiál předán dál'],
    2: ['Program automatu zapsán', 'První kus zkontrolován', 'RTG kontrola provedena', 'Počty zapsané'],
    3: ['AOI program spuštěn', 'Podezřelé kusy odděleny', 'Výsledek zapsán'],
    7: ['Program vlny ověřen', 'Teplota a flux OK', 'Vzorek po pájení zkontrolován'],
    12: ['Štítek vytištěn', 'Počet balení sedí', 'Zakázka připravena k expedici', 'Fotka balení přiložena'],
  };
  return custom[stationId] ?? ['Pracovní instrukce přečtena', 'Kontrola prvního kusu', 'Počty zapsané'];
}

export function pushAudit(db: PreviewDb, actorId: string, title: string, text: string) {
  db.audit.unshift({ id: `a${Date.now()}`, at: nowLabel(), who: actorId, title, text });
}

function normalizeDb(db: PreviewDb): PreviewDb {
  const fresh = createDefaultDb();
  const merged = { ...fresh, ...db };
  merged.users = merged.users.length ? merged.users : fresh.users;
  merged.customers = merged.customers.length ? merged.customers : fresh.customers;
  merged.products = merged.products.length ? merged.products : fresh.products;
  merged.orders = merged.orders.map((order) => {
    const stations = { ...order.stations };
    for (const station of STATIONS) {
      const existing = stations[station.id];
      stations[station.id] = Object.assign({
        applicable: false,
        status: 'waiting',
        arrived: 0,
        ok: 0,
        rework: 0,
        scrap: 0,
        transferred: 0,
        issueNote: null,
        checklist: [],
      }, existing ?? {});
    }
    const normalized = { ...order, stations, transfers: order.transfers ?? [], notes: order.notes ?? [], hidden: !!order.hidden, automatProgram: order.automatProgram ?? '' };
    clampOrderStationCounts(normalized);
    return normalized;
  });
  return merged;
}

function clampOrderStationCounts(order: Order) {
  for (const stationDef of STATIONS) {
    const station = order.stations[stationDef.id];
    if (!station) continue;
    const arrived = arrivedAt(order, stationDef.id);
    station.ok = Math.min(Math.max(0, station.ok), arrived);
    station.rework = Math.min(Math.max(0, station.rework), Math.max(0, arrived - station.ok));
    station.scrap = Math.min(Math.max(0, station.scrap), Math.max(0, arrived - station.ok - station.rework));
  }
}

type OrderSeed = Omit<Order, 'stations' | 'hidden' | 'notes'> & {
  stationPresets: Record<number, Partial<OrderStation> & { off?: boolean }>;
};

function makeOrder(seed: OrderSeed): Order {
  const stations: Record<number, OrderStation> = {};
  for (const station of STATIONS) {
    const preset = seed.stationPresets[station.id];
    stations[station.id] = {
      applicable: !!preset && !preset.off,
      status: preset?.off ? 'waiting' : preset?.status ?? 'waiting',
      arrived: preset?.arrived ?? 0,
      ok: preset?.ok ?? 0,
      rework: preset?.rework ?? 0,
      scrap: preset?.scrap ?? 0,
      transferred: preset?.transferred ?? 0,
      issueNote: preset?.issueNote ?? null,
      checklist: preset?.checklist ?? [],
    };
  }
  const { stationPresets: _stationPresets, ...order } = seed;
  return {
    ...order,
    stations,
    hidden: false,
    notes: [],
  };
}
