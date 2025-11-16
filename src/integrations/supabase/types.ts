export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      events: {
        Row: {
          created_at: string
          created_by: string
          event_date: string
          id: string
          name: string
          range_end: number
          range_start: number
          bulk_sold_range_start: number | null
          bulk_sold_range_end: number | null
          bulk_buyer_name: string | null
          bulk_buyer_email: string | null
          bulk_buyer_phone: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          event_date: string
          id?: string
          name: string
          range_end: number
          range_start: number
          bulk_sold_range_start?: number | null
          bulk_sold_range_end?: number | null
          bulk_buyer_name?: string | null
          bulk_buyer_email?: string | null
          bulk_buyer_phone?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          event_date?: string
          id?: string
          name?: string
          range_end?: number
          range_start?: number
          bulk_sold_range_start?: number | null
          bulk_sold_range_end?: number | null
          bulk_buyer_name?: string | null
          bulk_buyer_email?: string | null
          bulk_buyer_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string
          banned: boolean
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          name: string
          banned?: boolean
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string
          banned?: boolean
        }
        Relationships: []
      }
      sales: {
        Row: {
          amount: number
          cashier_id: string
          created_at: string
          id: string
          payment_mode: Database["public"]["Enums"]["payment_mode"]
          sale_timestamp: string
          ticket_id: string
        }
        Insert: {
          amount: number
          cashier_id: string
          created_at?: string
          id?: string
          payment_mode?: Database["public"]["Enums"]["payment_mode"]
          sale_timestamp?: string
          ticket_id: string
        }
        Update: {
          amount?: number
          cashier_id?: string
          created_at?: string
          id?: string
          payment_mode?: Database["public"]["Enums"]["payment_mode"]
          sale_timestamp?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_cashier_id_fkey"
            columns: ["cashier_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          buyer_email: string | null
          buyer_name: string | null
          buyer_phone: string | null
          created_at: string
          event_id: string
          id: string
          qr_data: string
          scanned_at: string | null
          scanned_by: string | null
          sold_at: string | null
          sold_by: string | null
          status: Database["public"]["Enums"]["ticket_status"]
          ticket_code: string
          ticket_number: number
          sale_type: Database["public"]["Enums"]["sale_type"]
        }
        Insert: {
          buyer_email?: string | null
          buyer_name?: string | null
          buyer_phone?: string | null
          created_at?: string
          event_id: string
          id?: string
          qr_data: string
          scanned_at?: string | null
          scanned_by?: string | null
          sold_at?: string | null
          sold_by?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          ticket_code: string
          ticket_number: number
          sale_type?: Database["public"]["Enums"]["sale_type"]
        }
        Update: {
          buyer_email?: string | null
          buyer_name?: string | null
          buyer_phone?: string | null
          created_at?: string
          event_id?: string
          id?: string
          qr_data?: string
          scanned_at?: string | null
          scanned_by?: string | null
          sold_at?: string | null
          sold_by?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          ticket_code?: string
          ticket_number?: number
          sale_type?: Database["public"]["Enums"]["sale_type"]
        }
        Relationships: [
          {
            foreignKeyName: "tickets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_scanned_by_fkey"
            columns: ["scanned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_sold_by_fkey"
            columns: ["sold_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_any_admin: { 
        Args: Record<string, never>
        Returns: boolean 
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      update_event_bulk_range: {
        Args: {
          _event_id: string
          _bulk_range_start: number
          _bulk_range_end: number
          _buyer_name: string
          _buyer_email?: string | null
          _buyer_phone?: string | null
        }
        Returns: Json
      }
      delete_user_cascade: {
        Args: {
          _user_id: string
        }
        Returns: Json
      }
    }
    Enums: {
       app_role: "admin" | "cashier" | "scanner"
       payment_mode: "cash" | "card" | "mobile"
       sale_type: "cashier" | "bulk"
       ticket_status: "available" | "sold" | "used"
     }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never