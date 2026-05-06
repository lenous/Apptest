export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type Role = 'operator' | 'tpv' | 'dispatcher' | 'management' | 'admin';
export type StationStatus = 'waiting' | 'in_progress' | 'completed' | 'issue' | 'skipped';
export type Priority = 'low' | 'normal' | 'high' | 'urgent';
export type ProductionType = 'new' | 'repeat' | 'revision';
export type DocType = 'bom' | 'drawing' | 'routing_sheet' | 'other';
export type NoteType = 'note' | 'change_request' | 'issue';
export type SolderingType = 'vlna' | 'selektivni' | 'rucni';
export type BomStatus = 'ok' | 'partial' | 'missing' | 'unknown';
export type NotifType = 'issue' | 'deadline' | 'new_order' | 'mention' | 'change';
export type DeadlineState = 'none' | 'overdue' | 'soon' | 'ok';
export type NotifPriority = 'low' | 'normal' | 'high';

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          role: Role;
          pin_code: string | null;
          default_station: number | null;
          qualifications: string[] | null;
          push_token: string | null;
          dark_mode: boolean;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['profiles']['Row']> & { id: string };
        Update: Partial<Database['public']['Tables']['profiles']['Row']>;
      };
      stations: {
        Row: { id: number; name: string; order_index: number };
        Insert: never;
        Update: never;
      };
      machines: {
        Row: { id: string; name: string; active: boolean };
        Insert: never;
        Update: never;
      };
      customers: {
        Row: {
          id: string;
          name: string;
          ico: string | null;
          contact: string | null;
          note: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['customers']['Row'], 'id' | 'created_at'> & { id?: string };
        Update: Partial<Database['public']['Tables']['customers']['Insert']>;
      };
      products: {
        Row: {
          id: string;
          customer_id: string;
          code: string;
          name: string;
          revision: string | null;
          wave_program: string | null;
          applicable_stations: number[];
          note: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['products']['Row'], 'id' | 'created_at'> & { id?: string };
        Update: Partial<Database['public']['Tables']['products']['Insert']>;
      };
      product_documents: {
        Row: {
          id: string;
          product_id: string;
          doc_type: DocType;
          file_name: string;
          file_path: string;
          file_size: number | null;
          mime_type: string | null;
          version: number;
          uploaded_by: string | null;
          uploaded_at: string;
        };
        Insert: Omit<Database['public']['Tables']['product_documents']['Row'], 'id' | 'uploaded_at' | 'version'> & { id?: string; version?: number };
        Update: Partial<Database['public']['Tables']['product_documents']['Insert']>;
      };
      orders: {
        Row: {
          id: string;
          order_number: string;
          customer_id: string | null;
          product_id: string | null;
          name: string;
          description: string | null;
          production_type: ProductionType;
          quantity: number;
          priority: Priority;
          order_date: string | null;
          due_date: string | null;
          machine_id: string | null;
          wave_program: string | null;
          qr_code: string | null;
          hidden_at: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['orders']['Row'], 'id' | 'created_at' | 'updated_at' | 'qr_code'> & { id?: string; qr_code?: string | null };
        Update: Partial<Database['public']['Tables']['orders']['Insert']>;
      };
      order_stations: {
        Row: {
          id: string;
          order_id: string;
          station_id: number;
          status: StationStatus;
          soldering_type: SolderingType | null;
          applicable: boolean;
          qty_ok: number;
          qty_rework: number;
          qty_scrap: number;
          qty_received: number;
          started_at: string | null;
          completed_at: string | null;
          operator_id: string | null;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['order_stations']['Row'], 'id' | 'updated_at'> & { id?: string };
        Update: Partial<Database['public']['Tables']['order_stations']['Insert']>;
      };
      checklist_templates: {
        Row: {
          id: string;
          station_id: number | null;
          product_id: string | null;
          title: string;
          items: { id: string; label: string; required: boolean }[];
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['checklist_templates']['Row'], 'id' | 'created_at'> & { id?: string };
        Update: Partial<Database['public']['Tables']['checklist_templates']['Insert']>;
      };
      checklist_runs: {
        Row: {
          id: string;
          order_station_id: string;
          template_id: string | null;
          completed_items: string[];
          completed_by: string | null;
          completed_at: string;
        };
        Insert: Omit<Database['public']['Tables']['checklist_runs']['Row'], 'id' | 'completed_at'> & { id?: string };
        Update: Partial<Database['public']['Tables']['checklist_runs']['Insert']>;
      };
      documents: {
        Row: {
          id: string;
          order_id: string;
          source_product_doc_id: string | null;
          doc_type: DocType;
          file_name: string;
          file_path: string;
          file_size: number | null;
          mime_type: string | null;
          uploaded_by: string | null;
          uploaded_at: string;
        };
        Insert: Omit<Database['public']['Tables']['documents']['Row'], 'id' | 'uploaded_at'> & { id?: string };
        Update: Partial<Database['public']['Tables']['documents']['Insert']>;
      };
      notes: {
        Row: {
          id: string;
          order_id: string | null;
          product_id: string | null;
          station_id: number | null;
          note_type: NoteType;
          content: string;
          photo_paths: string[] | null;
          voice_path: string | null;
          resolved: boolean;
          author_id: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['notes']['Row'], 'id' | 'created_at'> & { id?: string };
        Update: Partial<Database['public']['Tables']['notes']['Insert']>;
      };
      audit_log: {
        Row: {
          id: string;
          order_id: string | null;
          station_id: number | null;
          actor_id: string | null;
          action: string;
          payload: Json | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['audit_log']['Row'], 'id' | 'created_at'> & { id?: string };
        Update: Partial<Database['public']['Tables']['audit_log']['Insert']>;
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          order_id: string | null;
          type: NotifType;
          priority: NotifPriority;
          title: string;
          body: string | null;
          read_at: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['notifications']['Row'], 'id' | 'created_at'> & { id?: string };
        Update: Partial<Database['public']['Tables']['notifications']['Insert']>;
      };
      bom_checks: {
        Row: {
          id: string;
          order_id: string;
          material_code: string;
          material_name: string | null;
          required_qty: number;
          available_qty: number | null;
          status: BomStatus;
          checked_by: string | null;
          checked_at: string | null;
        };
        Insert: Omit<Database['public']['Tables']['bom_checks']['Row'], 'id'> & { id?: string };
        Update: Partial<Database['public']['Tables']['bom_checks']['Insert']>;
      };
    };
    Views: {
      orders_dashboard: {
        Row: Database['public']['Tables']['orders']['Row'] & {
          customer_name: string | null;
          product_code: string | null;
          product_name: string | null;
          stations_done: number;
          stations_issue: number;
          stations_total: number;
          deadline_state: DeadlineState;
        };
      };
    };
  };
};

// ── Convenience types ──────────────────────────────────────────
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Customer = Database['public']['Tables']['customers']['Row'];
export type Product = Database['public']['Tables']['products']['Row'];
export type ProductDocument = Database['public']['Tables']['product_documents']['Row'];
export type Order = Database['public']['Tables']['orders']['Row'];
export type OrderStation = Database['public']['Tables']['order_stations']['Row'];
export type Document = Database['public']['Tables']['documents']['Row'];
export type Note = Database['public']['Tables']['notes']['Row'];
export type Station = Database['public']['Tables']['stations']['Row'];
export type Machine = Database['public']['Tables']['machines']['Row'];
export type ChecklistTemplate = Database['public']['Tables']['checklist_templates']['Row'];
export type ChecklistRun = Database['public']['Tables']['checklist_runs']['Row'];
export type AuditLog = Database['public']['Tables']['audit_log']['Row'];
export type Notification = Database['public']['Tables']['notifications']['Row'];
export type BomCheck = Database['public']['Tables']['bom_checks']['Row'];
export type OrderDashboard = Database['public']['Views']['orders_dashboard']['Row'];

export type OrderWithStations = Order & {
  order_stations: (OrderStation & { stations: Station })[];
  customers?: Customer | null;
  products?: Product | null;
};
