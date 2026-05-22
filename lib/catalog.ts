import { supabase } from './supabase';
import type { Customer, Product, ProductDocument, TestFlow } from './types';

// ── Zákazníci ──────────────────────────────────────────────────

export async function searchCustomers(query: string, limit = 10): Promise<Customer[]> {
  const q = query.trim();
  let req = supabase.from('customers').select('*').order('name').limit(limit);
  if (q) req = req.ilike('name', `%${q}%`);
  const { data, error } = await req;
  if (error) throw error;
  return data ?? [];
}

export async function getOrCreateCustomer(name: string): Promise<Customer> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Jméno zákazníka je prázdné');

  const { data: existing } = await supabase
    .from('customers')
    .select('*')
    .ilike('name', trimmed)
    .maybeSingle();
  if (existing) return existing;

  const { data, error } = await supabase
    .from('customers')
    .insert({ name: trimmed })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

// ── Produkty ───────────────────────────────────────────────────

export async function searchProducts(
  customerId: string,
  query: string,
  limit = 10,
): Promise<Product[]> {
  const q = query.trim();
  let req = supabase
    .from('products')
    .select('*')
    .eq('customer_id', customerId)
    .order('code')
    .limit(limit);
  if (q) req = req.or(`code.ilike.%${q}%,name.ilike.%${q}%`);
  const { data, error } = await req;
  if (error) throw error;
  return data ?? [];
}

export async function getOrCreateProduct(args: {
  customerId: string;
  code: string;
  name: string;
  revision?: string;
  waveProgram?: string;
  selectiveWaveProgram?: string;
  testFlow?: TestFlow;
}): Promise<Product> {
  const { customerId, code, name, revision, waveProgram, selectiveWaveProgram, testFlow } = args;
  const trimmedCode = code.trim();
  if (!trimmedCode) throw new Error('Kód produktu je prázdný');

  const { data: existing } = await supabase
    .from('products')
    .select('*')
    .eq('customer_id', customerId)
    .ilike('code', trimmedCode)
    .maybeSingle();
  if (existing) return existing;

  const { data, error } = await supabase
    .from('products')
    .insert({
      customer_id: customerId,
      code: trimmedCode,
      name: name.trim() || trimmedCode,
      revision: revision?.trim() || null,
      wave_program: waveProgram?.trim() || null,
      selective_wave_program: selectiveWaveProgram?.trim() || null,
      test_flow: testFlow ?? 'output_control',
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

// ── Knihovna dokumentů u produktu ─────────────────────────────

export async function listProductDocuments(productId: string): Promise<ProductDocument[]> {
  const { data, error } = await supabase
    .from('product_documents')
    .select('*')
    .eq('product_id', productId)
    .order('uploaded_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/**
 * Při založení opakované zakázky zkopíruj dokumenty z knihovny produktu.
 * Ukládá jen odkaz na stejné úložiště (file_path) – neduplikuje soubory.
 */
export async function copyProductDocsToOrder(
  productId: string,
  orderId: string,
  uploadedBy: string | null,
): Promise<number> {
  const docs = await listProductDocuments(productId);
  if (!docs.length) return 0;

  const rows = docs.map((d) => ({
    order_id: orderId,
    source_product_doc_id: d.id,
    doc_type: d.doc_type,
    file_name: d.file_name,
    file_path: d.file_path,
    file_size: d.file_size,
    mime_type: d.mime_type,
    uploaded_by: uploadedBy,
  }));

  const { error } = await supabase.from('documents').insert(rows);
  if (error) throw error;
  return rows.length;
}
