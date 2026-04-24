import type { StationStatus, ProductionType, DeadlineState, NotifType, BomStatus, NotifPriority } from '@/lib/types';

export const STATIONS = [
  { id: 1,  name: 'Sklad' },
  { id: 2,  name: 'Automaty' },
  { id: 3,  name: 'AOI kontrola' },
  { id: 4,  name: 'RTG' },
  { id: 5,  name: 'Oprava po AOI / kontrola' },
  { id: 6,  name: 'Osazování' },
  { id: 7,  name: 'Pájení' },
  { id: 8,  name: 'Oprava+kontrola po pájení' },
  { id: 9,  name: 'Programování' },
  { id: 10, name: 'Lakování' },
  { id: 11, name: 'Výstupní kontrola' },
  { id: 12, name: 'Balení' },
] as const;

export const MACHINES = [
  { id: 'alfa',  name: 'Alfa' },
  { id: 'beta',  name: 'Beta' },
  { id: 'gama',  name: 'Gama' },
  { id: 'delta', name: 'Delta' },
  { id: 'eta',   name: 'Eta' },
  { id: 'theta', name: 'Theta' },
] as const;

export const SOLDERING_TYPES = [
  { id: 'vlna',       name: 'Vlna' },
  { id: 'selektivni', name: 'Selektivní' },
  { id: 'rucni',      name: 'Ruční' },
] as const;

export const PRODUCTION_TYPE_CONFIG: Record<ProductionType, { label: string; color: string; bg: string }> = {
  new:      { label: 'Nová',       color: '#1d4ed8', bg: '#dbeafe' },
  repeat:   { label: 'Opakovaná', color: '#15803d', bg: '#dcfce7' },
  revision: { label: 'Revize',    color: '#b45309', bg: '#fef3c7' },
};

export const STATUS_CONFIG: Record<StationStatus, { label: string; color: string; bg: string }> = {
  waiting:     { label: 'Čeká',       color: '#6b7280', bg: '#f3f4f6' },
  in_progress: { label: 'Probíhá',    color: '#1d4ed8', bg: '#dbeafe' },
  completed:   { label: 'Dokončeno',  color: '#15803d', bg: '#dcfce7' },
  issue:       { label: 'Problém',    color: '#b91c1c', bg: '#fee2e2' },
  skipped:     { label: 'Přeskočeno', color: '#92400e', bg: '#fef3c7' },
};

export const PRIORITY_CONFIG = {
  low:    { label: 'Nízká',    color: '#6b7280' },
  normal: { label: 'Normální', color: '#1d4ed8' },
  high:   { label: 'Vysoká',   color: '#d97706' },
  urgent: { label: 'Urgentní', color: '#b91c1c' },
};

export const DEADLINE_CONFIG: Record<DeadlineState, { label: string; color: string; border: string }> = {
  none:    { label: 'Bez termínu', color: '#6b7280', border: '#e5e7eb' },
  overdue: { label: 'Po termínu',  color: '#b91c1c', border: '#ef4444' },
  soon:    { label: 'Brzy',        color: '#d97706', border: '#f59e0b' },
  ok:      { label: 'V termínu',   color: '#15803d', border: '#22c55e' },
};

export const DOC_TYPE_CONFIG = {
  bom:           { label: 'BOM',           icon: 'document-text' },
  drawing:       { label: 'Výkres',        icon: 'image' },
  routing_sheet: { label: 'Průvodní list', icon: 'clipboard' },
  other:         { label: 'Ostatní',       icon: 'attach' },
};

export const NOTE_TYPE_CONFIG = {
  note:           { label: 'Poznámka',        color: '#1d4ed8' },
  change_request: { label: 'Žádost o úpravu', color: '#d97706' },
  issue:          { label: 'Problém',         color: '#b91c1c' },
};

export const NOTIF_CONFIG: Record<NotifType, { label: string; icon: string; color: string }> = {
  issue:     { label: 'Problém',      icon: 'alert-circle', color: '#b91c1c' },
  deadline:  { label: 'Termín',       icon: 'time',          color: '#d97706' },
  new_order: { label: 'Nová zakázka', icon: 'add-circle',    color: '#1d4ed8' },
  mention:   { label: 'Zmínka',       icon: 'at',            color: '#6b21a8' },
  change:    { label: 'Změna',        icon: 'pencil',        color: '#15803d' },
};

export const NOTIF_PRIORITY_CONFIG: Record<NotifPriority, { label: string; color: string; bg: string; icon: string }> = {
  low:    { label: 'Info',      color: '#6b7280', bg: '#f3f4f6', icon: 'information-circle-outline' },
  normal: { label: 'Běžná',     color: '#1d4ed8', bg: '#dbeafe', icon: 'notifications-outline' },
  high:   { label: 'Důležité',  color: '#b91c1c', bg: '#fee2e2', icon: 'alert-circle' },
};

export const BOM_STATUS_CONFIG: Record<BomStatus, { label: string; color: string; bg: string }> = {
  ok:      { label: 'OK',         color: '#15803d', bg: '#dcfce7' },
  partial: { label: 'Částečně',   color: '#d97706', bg: '#fef3c7' },
  missing: { label: 'Chybí',      color: '#b91c1c', bg: '#fee2e2' },
  unknown: { label: 'Neověřeno',  color: '#6b7280', bg: '#f3f4f6' },
};

/** Vygeneruj 6-místné číslo zakázky (YYMMRR – rok/měsíc + 2 náhodné) */
export function generateOrderNumber(): string {
  const d = new Date();
  const yy = String(d.getFullYear() % 100).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const rr = String(Math.floor(Math.random() * 100)).padStart(2, '0');
  return `${yy}${mm}${rr}`;
}

/** Spočítej stav termínu podle due_date */
export function computeDeadlineState(dueDate: string | null): DeadlineState {
  if (!dueDate) return 'none';
  const due = new Date(dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'overdue';
  if (diffDays <= 3) return 'soon';
  return 'ok';
}
