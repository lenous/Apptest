import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView,
  TouchableOpacity, Alert, ActivityIndicator, Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import {
  MACHINES, PRIORITY_CONFIG, PRODUCTION_TYPE_CONFIG, TECHNOLOGY_CONFIG, generateOrderNumber,
} from '@/constants/stations';
import {
  searchCustomers, getOrCreateCustomer,
  searchProducts, getOrCreateProduct,
  listProductDocuments, copyProductDocsToOrder,
} from '@/lib/catalog';
import type { Priority, ProductionType, Customer, Product, Technology } from '@/lib/types';

const PRIORITIES: Priority[] = ['low', 'normal', 'high', 'urgent'];
const PRODUCTION_TYPES: ProductionType[] = ['new', 'repeat', 'revision'];
const TECHNOLOGIES: Technology[] = ['leadfree', 'lead'];

export default function NewOrderScreen() {
  const { user } = useAuth();
  const router = useRouter();

  // Základní
  const [orderNumber, setOrderNumber] = useState(generateOrderNumber());
  const [productionType, setProductionType] = useState<ProductionType>('new');
  const [technology, setTechnology] = useState<Technology>('leadfree');
  const [stencilNumber, setStencilNumber] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  // Zákazník (autocomplete)
  const [customerQuery, setCustomerQuery] = useState('');
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [customerSuggestions, setCustomerSuggestions] = useState<Customer[]>([]);

  // Produkt (autocomplete)
  const [productQuery, setProductQuery] = useState('');
  const [product, setProduct] = useState<Product | null>(null);
  const [productSuggestions, setProductSuggestions] = useState<Product[]>([]);
  const [productRevision, setProductRevision] = useState('');
  const [productHasDocs, setProductHasDocs] = useState<number | null>(null);

  // Termíny a priorita
  const [orderDate, setOrderDate] = useState(formatToday());
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<Priority>('normal');

  // Stroj + vlna
  const [machineId, setMachineId] = useState<string | null>(null);
  const [waveProgram, setWaveProgram] = useState('');

  const [saving, setSaving] = useState(false);

  // ── Autocomplete zákazník ──
  useEffect(() => {
    if (customer) return;
    const t = setTimeout(async () => {
      try {
        const res = await searchCustomers(customerQuery, 6);
        setCustomerSuggestions(res);
      } catch {}
    }, 250);
    return () => clearTimeout(t);
  }, [customerQuery, customer]);

  // ── Autocomplete produkt ──
  useEffect(() => {
    if (!customer || product) return;
    const t = setTimeout(async () => {
      try {
        const res = await searchProducts(customer.id, productQuery, 6);
        setProductSuggestions(res);
      } catch {}
    }, 250);
    return () => clearTimeout(t);
  }, [productQuery, customer, product]);

  // ── Kontrola dostupných dokumentů u produktu ──
  useEffect(() => {
    if (!product) { setProductHasDocs(null); return; }
    listProductDocuments(product.id).then(d => setProductHasDocs(d.length)).catch(() => {});
    if (product.wave_program && !waveProgram) setWaveProgram(product.wave_program);
  }, [product]);

  function parseDate(str: string): string | null | 'invalid' {
    const s = str.trim();
    if (!s) return null;
    const parts = s.split('.');
    if (parts.length !== 3) return 'invalid';
    const [d, m, y] = parts;
    if (!d || !m || !y) return 'invalid';
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  async function handleSave() {
    if (!/^[0-9]{6}$/.test(orderNumber.trim())) {
      Alert.alert('Chyba', 'Číslo zakázky musí být 6-místné číslo.');
      return;
    }
    if (!customerQuery.trim() && !customer) {
      Alert.alert('Chyba', 'Vyplňte zákazníka.');
      return;
    }
    if (!productQuery.trim() && !product) {
      Alert.alert('Chyba', 'Vyplňte produkt / kód.');
      return;
    }
    const qty = parseInt(quantity, 10);
    if (!qty || qty < 1) {
      Alert.alert('Chyba', 'Množství musí být kladné číslo.');
      return;
    }
    const parsedDue = parseDate(dueDate);
    const parsedOrder = parseDate(orderDate);
    if (parsedDue === 'invalid' || parsedOrder === 'invalid') {
      Alert.alert('Chyba', 'Datum zadejte ve formátu DD.MM.RRRR');
      return;
    }

    setSaving(true);
    try {
      // 1) zákazník
      const cust = customer ?? await getOrCreateCustomer(customerQuery);
      // 2) produkt
      const prod = product ?? await getOrCreateProduct({
        customerId: cust.id,
        code: productQuery,
        name: name.trim() || productQuery,
        revision: productRevision,
        waveProgram,
      });
      // 3) zakázka
      const { data: orderRow, error } = await supabase.from('orders').insert({
        order_number: orderNumber.trim(),
        customer_id: cust.id,
        product_id: prod.id,
        name: name.trim() || prod.name,
        description: description.trim() || null,
        production_type: productionType,
        technology,
        stencil_number: productionType === 'repeat' ? stencilNumber.trim() || null : null,
        quantity: qty,
        priority,
        order_date: parsedOrder,
        due_date: parsedDue,
        machine_id: machineId,
        wave_program: waveProgram.trim() || prod.wave_program || null,
        created_by: user?.id ?? null,
      }).select('id').single();
      if (error) throw error;

      // 4) smart dokumenty: opakovaná zakázka → zkopíruj knihovnu
      if (productionType === 'repeat' && orderRow) {
        try {
          await copyProductDocsToOrder(prod.id, orderRow.id, user?.id ?? null);
        } catch (e) { /* nenechat spadnout */ }
      }

      router.back();
    } catch (e: any) {
      if (e?.code === '23505') Alert.alert('Chyba', 'Zakázka s tímto číslem již existuje.');
      else Alert.alert('Chyba', e?.message ?? 'Nepodařilo se uložit.');
    } finally {
      setSaving(false);
    }
  }

  const needsDocPrompt = product && (productionType === 'new' || productionType === 'revision');

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

      <Section title="Základní informace">
        <Field label="Číslo zakázky * (6 číslic)">
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="260321"
              placeholderTextColor="#9ca3af"
              value={orderNumber}
              onChangeText={(t) => setOrderNumber(t.replace(/[^0-9]/g, '').slice(0, 6))}
              keyboardType="number-pad"
              maxLength={6}
            />
            <TouchableOpacity style={styles.iconBtn} onPress={() => setOrderNumber(generateOrderNumber())}>
              <Ionicons name="refresh" size={18} color="#1a56db" />
            </TouchableOpacity>
          </View>
        </Field>

        <Field label="Typ výroby *">
          <View style={styles.chipRow}>
            {PRODUCTION_TYPES.map((t) => {
              const cfg = PRODUCTION_TYPE_CONFIG[t];
              const sel = productionType === t;
              return (
                <TouchableOpacity
                  key={t}
                  onPress={() => setProductionType(t)}
                  style={[styles.chip, sel && { backgroundColor: cfg.color, borderColor: cfg.color }]}
                >
                  <Text style={[styles.chipText, sel && { color: '#fff' }]}>{cfg.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Field>

        <Field label="Množství *">
          <TextInput
            style={styles.input}
            placeholder="100"
            placeholderTextColor="#9ca3af"
            keyboardType="number-pad"
            value={quantity}
            onChangeText={(t) => setQuantity(t.replace(/[^0-9]/g, ''))}
          />
        </Field>

        <Field label="Technologie *">
          <View style={styles.chipRow}>
            {TECHNOLOGIES.map((t) => {
              const cfg = TECHNOLOGY_CONFIG[t];
              const sel = technology === t;
              return (
                <TouchableOpacity
                  key={t}
                  onPress={() => setTechnology(t)}
                  style={[styles.chip, sel && { backgroundColor: cfg.color, borderColor: cfg.color }]}
                >
                  <Text style={[styles.chipText, sel && { color: '#fff' }]}>{cfg.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Field>

        {productionType === 'repeat' && (
          <Field label="Číslo planžety">
            <TextInput
              style={styles.input}
              placeholder="např. PL-1427"
              placeholderTextColor="#9ca3af"
              value={stencilNumber}
              onChangeText={setStencilNumber}
              autoCapitalize="characters"
            />
          </Field>
        )}
      </Section>

      <Section title="Zákazník">
        <Field label="Zákazník *">
          <TextInput
            style={styles.input}
            placeholder="Začněte psát…"
            placeholderTextColor="#9ca3af"
            value={customer?.name ?? customerQuery}
            editable={!customer}
            onChangeText={setCustomerQuery}
          />
          {customer && (
            <TouchableOpacity onPress={() => { setCustomer(null); setProduct(null); setProductQuery(''); }} style={styles.clearRow}>
              <Ionicons name="close-circle" size={16} color="#6b7280" />
              <Text style={styles.clearTxt}>Změnit zákazníka</Text>
            </TouchableOpacity>
          )}
          {!customer && customerSuggestions.length > 0 && customerQuery.length > 0 && (
            <View style={styles.suggestBox}>
              {customerSuggestions.map((c) => (
                <Pressable key={c.id} onPress={() => { setCustomer(c); setCustomerQuery(c.name); }} style={styles.suggestRow}>
                  <Ionicons name="business-outline" size={16} color="#6b7280" />
                  <Text style={styles.suggestTxt}>{c.name}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </Field>
      </Section>

      {(customer || customerQuery) && (
        <Section title="Produkt">
          <Field label="Kód / označení *">
            <TextInput
              style={styles.input}
              placeholder="např. PCB-A-001"
              placeholderTextColor="#9ca3af"
              value={product?.code ?? productQuery}
              editable={!product}
              onChangeText={setProductQuery}
            />
            {product && (
              <TouchableOpacity onPress={() => setProduct(null)} style={styles.clearRow}>
                <Ionicons name="close-circle" size={16} color="#6b7280" />
                <Text style={styles.clearTxt}>Změnit produkt</Text>
              </TouchableOpacity>
            )}
            {!product && customer && productSuggestions.length > 0 && productQuery.length > 0 && (
              <View style={styles.suggestBox}>
                {productSuggestions.map((p) => (
                  <Pressable key={p.id} onPress={() => {
                    setProduct(p);
                    setProductQuery(p.code);
                    if (!name) setName(p.name);
                  }} style={styles.suggestRow}>
                    <Ionicons name="cube-outline" size={16} color="#6b7280" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.suggestTxt}>{p.code}</Text>
                      <Text style={styles.suggestSub}>{p.name}{p.revision ? ` · rev ${p.revision}` : ''}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            )}
          </Field>

          <Field label="Název / popis">
            <TextInput
              style={styles.input}
              placeholder="Název výrobku"
              placeholderTextColor="#9ca3af"
              value={name}
              onChangeText={setName}
            />
          </Field>

          {!product && (
            <Field label="Revize (volitelná)">
              <TextInput
                style={styles.input}
                placeholder="např. B"
                placeholderTextColor="#9ca3af"
                value={productRevision}
                onChangeText={setProductRevision}
              />
            </Field>
          )}

          {product && productHasDocs !== null && (
            <View style={[styles.infoBox, productionType === 'repeat' ? styles.infoOk : styles.infoWarn]}>
              <Ionicons
                name={productionType === 'repeat' ? 'checkmark-circle' : 'information-circle'}
                size={18}
                color={productionType === 'repeat' ? '#15803d' : '#b45309'}
              />
              <Text style={[styles.infoTxt, { color: productionType === 'repeat' ? '#166534' : '#92400e' }]}>
                {productionType === 'repeat'
                  ? `V knihovně produktu je ${productHasDocs} dokument(ů). Automaticky se zkopírují k zakázce.`
                  : needsDocPrompt
                    ? `Typ "${PRODUCTION_TYPE_CONFIG[productionType].label}" – nahrajte nové dokumenty po vytvoření zakázky (${productHasDocs} v knihovně).`
                    : ''}
              </Text>
            </View>
          )}
        </Section>
      )}

      <Section title="Termíny">
        <Field label="Datum zakázky">
          <TextInput
            style={styles.input}
            placeholder="DD.MM.RRRR"
            placeholderTextColor="#9ca3af"
            value={orderDate}
            onChangeText={setOrderDate}
            keyboardType="numbers-and-punctuation"
          />
        </Field>
        <Field label="Termín dodání">
          <TextInput
            style={styles.input}
            placeholder="DD.MM.RRRR"
            placeholderTextColor="#9ca3af"
            value={dueDate}
            onChangeText={setDueDate}
            keyboardType="numbers-and-punctuation"
          />
        </Field>
      </Section>

      <Section title="Priorita">
        <View style={styles.chipRow}>
          {PRIORITIES.map((p) => {
            const cfg = PRIORITY_CONFIG[p];
            const sel = priority === p;
            return (
              <TouchableOpacity
                key={p}
                style={[styles.chip, sel && { backgroundColor: cfg.color, borderColor: cfg.color }]}
                onPress={() => setPriority(p)}
              >
                <Text style={[styles.chipText, sel && { color: '#fff' }]}>{cfg.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Section>

      <Section title="Automat">
        <View style={styles.chipRow}>
          <TouchableOpacity
            style={[styles.chip, machineId === null && styles.chipSelected]}
            onPress={() => setMachineId(null)}
          >
            <Text style={[styles.chipText, machineId === null && styles.chipTextSelected]}>Nepřiřazen</Text>
          </TouchableOpacity>
          {MACHINES.map((m) => (
            <TouchableOpacity
              key={m.id}
              style={[styles.chip, machineId === m.id && styles.chipSelected]}
              onPress={() => setMachineId(m.id)}
            >
              <Text style={[styles.chipText, machineId === m.id && styles.chipTextSelected]}>{m.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Section>

      <Section title="Pájení vlnou">
        <Field label="Číslo programu (volitelné)">
          <TextInput
            style={styles.input}
            placeholder="např. W-142"
            placeholderTextColor="#9ca3af"
            value={waveProgram}
            onChangeText={setWaveProgram}
            autoCapitalize="characters"
          />
        </Field>
      </Section>

      <Section title="Poznámky">
        <Field label="Popis / interní poznámky">
          <TextInput
            style={[styles.input, styles.textarea]}
            placeholder="Specifikace, poznámky k výrobě…"
            placeholderTextColor="#9ca3af"
            multiline
            numberOfLines={3}
            value={description}
            onChangeText={setDescription}
          />
        </Field>
      </Section>

      <TouchableOpacity
        style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
        onPress={handleSave}
        disabled={saving}
      >
        {saving
          ? <ActivityIndicator color="#fff" />
          : <>
              <Ionicons name="checkmark-circle" size={20} color="#fff" />
              <Text style={styles.saveBtnText}>Vytvořit zakázku</Text>
            </>
        }
      </TouchableOpacity>
    </ScrollView>
  );
}

function formatToday(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  content: { padding: 16, paddingBottom: 40 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginLeft: 4 },
  sectionCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, gap: 4 },
  field: { marginBottom: 12 },
  fieldLabel: { fontSize: 13, color: '#374151', fontWeight: '500', marginBottom: 4 },
  input: {
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8,
    padding: 10, fontSize: 15, color: '#111827', backgroundColor: '#f9fafb',
  },
  textarea: { height: 80, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 7, backgroundColor: '#fff',
  },
  chipSelected: { backgroundColor: '#1a56db', borderColor: '#1a56db' },
  chipText: { fontSize: 13, color: '#374151', fontWeight: '500' },
  chipTextSelected: { color: '#fff' },
  iconBtn: {
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8,
    paddingHorizontal: 12, justifyContent: 'center', backgroundColor: '#fff',
  },
  suggestBox: {
    marginTop: 6, borderRadius: 8, backgroundColor: '#fff',
    borderWidth: 1, borderColor: '#e5e7eb', overflow: 'hidden',
  },
  suggestRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  suggestTxt: { fontSize: 14, color: '#111827', fontWeight: '500' },
  suggestSub: { fontSize: 12, color: '#6b7280', marginTop: 1 },
  clearRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  clearTxt: { fontSize: 12, color: '#6b7280' },
  infoBox: {
    flexDirection: 'row', gap: 8, padding: 10, borderRadius: 8, marginTop: 6,
  },
  infoOk: { backgroundColor: '#dcfce7' },
  infoWarn: { backgroundColor: '#fef3c7' },
  infoTxt: { flex: 1, fontSize: 12, lineHeight: 16 },
  saveBtn: {
    backgroundColor: '#1a56db', borderRadius: 12, padding: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
