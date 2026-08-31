export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          action: string
          admin_user_id: string | null
          created_at: string
          id: string
          metadata: Json | null
          reason: string | null
          restaurant_id: string | null
          target_user_id: string | null
        }
        Insert: {
          action: string
          admin_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          reason?: string | null
          restaurant_id?: string | null
          target_user_id?: string | null
        }
        Update: {
          action?: string
          admin_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          reason?: string | null
          restaurant_id?: string | null
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_audit_log_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          active: boolean
          base_unit_id: string
          created_at: string
          created_by_staff_membership_id: string | null
          current_quantity: number
          id: string
          inventory_type: string
          minimum_stock_level: number
          name: string
          notes: string | null
          restaurant_id: string
          unit_cost: number | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          base_unit_id: string
          created_at?: string
          created_by_staff_membership_id?: string | null
          current_quantity?: number
          id?: string
          inventory_type: string
          minimum_stock_level?: number
          name: string
          notes?: string | null
          restaurant_id: string
          unit_cost?: number | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          base_unit_id?: string
          created_at?: string
          created_by_staff_membership_id?: string | null
          current_quantity?: number
          id?: string
          inventory_type?: string
          minimum_stock_level?: number
          name?: string
          notes?: string | null
          restaurant_id?: string
          unit_cost?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_base_unit_id_fkey"
            columns: ["base_unit_id"]
            isOneToOne: false
            referencedRelation: "inventory_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_created_by_staff_membership_id_fkey"
            columns: ["created_by_staff_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_stock_movements: {
        Row: {
          balance_after: number | null
          created_at: string
          created_by_staff_membership_id: string | null
          id: string
          inventory_item_id: string
          movement_type: string
          quantity: number
          reason: string | null
          restaurant_id: string
          unit_cost: number | null
          unit_id: string
        }
        Insert: {
          balance_after?: number | null
          created_at?: string
          created_by_staff_membership_id?: string | null
          id?: string
          inventory_item_id: string
          movement_type: string
          quantity: number
          reason?: string | null
          restaurant_id: string
          unit_cost?: number | null
          unit_id: string
        }
        Update: {
          balance_after?: number | null
          created_at?: string
          created_by_staff_membership_id?: string | null
          id?: string
          inventory_item_id?: string
          movement_type?: string
          quantity?: number
          reason?: string | null
          restaurant_id?: string
          unit_cost?: number | null
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_stock_movements_created_by_staff_membership_id_fkey"
            columns: ["created_by_staff_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_stock_movements_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_stock_movements_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_stock_movements_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "inventory_units"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_units: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          unit_type: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          unit_type: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          unit_type?: string
        }
        Relationships: []
      }
      menu_categories: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          name: string
          restaurant_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name: string
          restaurant_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          restaurant_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_categories_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          available: boolean
          category: string
          category_id: string | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          name: string
          price: number
          restaurant_id: string | null
          updated_at: string
        }
        Insert: {
          available?: boolean
          category: string
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name: string
          price?: number
          restaurant_id?: string | null
          updated_at?: string
        }
        Update: {
          available?: boolean
          category?: string
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name?: string
          price?: number
          restaurant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "menu_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          item_name: string
          line_total: number | null
          menu_item_id: string | null
          order_id: string
          price: number
          quantity: number
          special_instructions: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          item_name: string
          line_total?: number | null
          menu_item_id?: string | null
          order_id: string
          price?: number
          quantity?: number
          special_instructions?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          item_name?: string
          line_total?: number | null
          menu_item_id?: string | null
          order_id?: string
          price?: number
          quantity?: number
          special_instructions?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_history: {
        Row: {
          changed_by: string | null
          created_at: string
          id: string
          order_id: string
          status: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          id?: string
          order_id: string
          status: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          id?: string
          order_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          assigned_waiter_membership_id: string | null
          assigned_waiter_name_snapshot: string | null
          created_at: string
          created_by_staff_membership_id: string | null
          created_by_staff_name_snapshot: string | null
          customer_id: string | null
          guest_token_hash: string | null
          id: string
          order_number: number
          order_source: string
          restaurant_id: string | null
          restaurant_table_id: string | null
          status: string
          table_number: string
          total: number
          updated_at: string
        }
        Insert: {
          assigned_waiter_membership_id?: string | null
          assigned_waiter_name_snapshot?: string | null
          created_at?: string
          created_by_staff_membership_id?: string | null
          created_by_staff_name_snapshot?: string | null
          customer_id?: string | null
          guest_token_hash?: string | null
          id?: string
          order_number?: number
          order_source?: string
          restaurant_id?: string | null
          restaurant_table_id?: string | null
          status?: string
          table_number: string
          total?: number
          updated_at?: string
        }
        Update: {
          assigned_waiter_membership_id?: string | null
          assigned_waiter_name_snapshot?: string | null
          created_at?: string
          created_by_staff_membership_id?: string | null
          created_by_staff_name_snapshot?: string | null
          customer_id?: string | null
          guest_token_hash?: string | null
          id?: string
          order_number?: number
          order_source?: string
          restaurant_id?: string | null
          restaurant_table_id?: string | null
          status?: string
          table_number?: string
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_assigned_waiter_membership_id_fkey"
            columns: ["assigned_waiter_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_created_by_staff_membership_id_fkey"
            columns: ["created_by_staff_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_restaurant_table_id_fkey"
            columns: ["restaurant_table_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_type: string
          created_at: string
          email: string | null
          first_name: string | null
          id: string
          last_name: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          account_type?: string
          created_at?: string
          email?: string | null
          first_name?: string | null
          id: string
          last_name?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          account_type?: string
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      restaurant_opening_hours: {
        Row: {
          close_time: string
          created_at: string
          day_of_week: number
          id: string
          is_closed: boolean
          open_time: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          close_time?: string
          created_at?: string
          day_of_week: number
          id?: string
          is_closed?: boolean
          open_time?: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          close_time?: string
          created_at?: string
          day_of_week?: number
          id?: string
          is_closed?: boolean
          open_time?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_opening_hours_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_staff_audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          id: string
          metadata: Json | null
          new_active: boolean | null
          new_role: string | null
          old_active: boolean | null
          old_role: string | null
          restaurant_id: string
          target_user_id: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          new_active?: boolean | null
          new_role?: string | null
          old_active?: boolean | null
          old_role?: string | null
          restaurant_id: string
          target_user_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          new_active?: boolean | null
          new_role?: string | null
          old_active?: boolean | null
          old_role?: string | null
          restaurant_id?: string
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_staff_audit_log_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_tables: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string | null
          qr_token: string
          restaurant_id: string
          table_number: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string | null
          qr_token: string
          restaurant_id: string
          table_number: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string | null
          qr_token?: string
          restaurant_id?: string
          table_number?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_tables_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_users: {
        Row: {
          active: boolean
          created_at: string
          id: string
          restaurant_id: string
          role: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          restaurant_id: string
          role: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          restaurant_id?: string
          role?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_users_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurants: {
        Row: {
          active: boolean
          address: string | null
          approved: boolean
          approved_at: string | null
          approved_by: string | null
          city: string | null
          country: string | null
          created_at: string
          currency_code: string
          email: string | null
          id: string
          logo_url: string | null
          name: string
          phone: string | null
          postcode: string | null
          rejection_reason: string | null
          slug: string
          status_updated_at: string | null
          suspension_reason: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          approved?: boolean
          approved_at?: string | null
          approved_by?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          currency_code?: string
          email?: string | null
          id?: string
          logo_url?: string | null
          name: string
          phone?: string | null
          postcode?: string | null
          rejection_reason?: string | null
          slug: string
          status_updated_at?: string | null
          suspension_reason?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          approved?: boolean
          approved_at?: string | null
          approved_by?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          currency_code?: string
          email?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          phone?: string | null
          postcode?: string | null
          rejection_reason?: string | null
          slug?: string
          status_updated_at?: string | null
          suspension_reason?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      staff_attendance: {
        Row: {
          check_in_at: string | null
          check_out_at: string | null
          created_at: string
          id: string
          notes: string | null
          restaurant_id: string
          shift_id: string
          staff_membership_id: string
          status: string
          updated_at: string
        }
        Insert: {
          check_in_at?: string | null
          check_out_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          restaurant_id: string
          shift_id: string
          staff_membership_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          check_in_at?: string | null
          check_out_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          restaurant_id?: string
          shift_id?: string
          staff_membership_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_attendance_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_attendance_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "staff_shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_attendance_staff_membership_id_fkey"
            columns: ["staff_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_shifts: {
        Row: {
          created_at: string
          created_by: string | null
          end_time: string
          id: string
          restaurant_id: string
          shift_date: string
          staff_membership_id: string
          start_time: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          end_time: string
          id?: string
          restaurant_id: string
          shift_date: string
          staff_membership_id: string
          start_time: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          end_time?: string
          id?: string
          restaurant_id?: string
          shift_date?: string
          staff_membership_id?: string
          start_time?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_shifts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_shifts_staff_membership_id_fkey"
            columns: ["staff_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_table_assignments: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          restaurant_id: string
          restaurant_table_id: string
          shift_id: string
          staff_membership_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          restaurant_id: string
          restaurant_table_id: string
          shift_id: string
          staff_membership_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          restaurant_id?: string
          restaurant_table_id?: string
          shift_id?: string
          staff_membership_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_table_assignments_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_table_assignments_restaurant_table_id_fkey"
            columns: ["restaurant_table_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_table_assignments_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "staff_shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_table_assignments_staff_membership_id_fkey"
            columns: ["staff_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_users: {
        Row: {
          active: boolean
          created_at: string
          email: string
          id: string
          name: string | null
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          email: string
          id?: string
          name?: string | null
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string
          id?: string
          name?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_inventory_movement: {
        Args: {
          _allow_negative?: boolean
          _item_id: string
          _membership_id: string
          _movement_type: string
          _reason: string
          _restaurant_id: string
          _signed_quantity: number
          _unit_cost: number
        }
        Returns: number
      }
      can_manage_restaurant_storage: {
        Args: { _path: string }
        Returns: boolean
      }
      has_kitchen_access: { Args: { _restaurant_id: string }; Returns: boolean }
      has_restaurant_role: {
        Args: { _restaurant_id: string; _role: string }
        Returns: boolean
      }
      is_active_staff: { Args: never; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      is_restaurant_member: {
        Args: { _restaurant_id: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
