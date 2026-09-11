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
      cashier_shifts: {
        Row: {
          closed_at: string | null
          closing_cash: number | null
          created_at: string
          expected_cash: number | null
          id: string
          membership_id: string
          notes: string | null
          opened_at: string
          opening_cash: number | null
          restaurant_id: string
          status: string
        }
        Insert: {
          closed_at?: string | null
          closing_cash?: number | null
          created_at?: string
          expected_cash?: number | null
          id?: string
          membership_id: string
          notes?: string | null
          opened_at?: string
          opening_cash?: number | null
          restaurant_id: string
          status?: string
        }
        Update: {
          closed_at?: string | null
          closing_cash?: number | null
          created_at?: string
          expected_cash?: number | null
          id?: string
          membership_id?: string
          notes?: string | null
          opened_at?: string
          opening_cash?: number | null
          restaurant_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "cashier_shifts_membership_same_property"
            columns: ["membership_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "cashier_shifts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      distribution_channels: {
        Row: {
          channel_type: string
          code: string
          created_at: string
          id: string
          name: string
          notes: string | null
          restaurant_id: string
          status: string
          updated_at: string
        }
        Insert: {
          channel_type?: string
          code: string
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          restaurant_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          channel_type?: string
          code?: string
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          restaurant_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "distribution_channels_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      distribution_logs: {
        Row: {
          channel_id: string | null
          created_at: string
          event_type: string
          id: string
          message: string | null
          payload_summary: Json | null
          reference_id: string | null
          reference_type: string | null
          restaurant_id: string
          status: string
        }
        Insert: {
          channel_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          message?: string | null
          payload_summary?: Json | null
          reference_id?: string | null
          reference_type?: string | null
          restaurant_id: string
          status?: string
        }
        Update: {
          channel_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          message?: string | null
          payload_summary?: Json | null
          reference_id?: string | null
          reference_type?: string | null
          restaurant_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "distribution_logs_channel_fk"
            columns: ["channel_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "distribution_channels"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "distribution_logs_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      distribution_rate_mappings: {
        Row: {
          active: boolean
          channel_id: string
          created_at: string
          external_rate_code: string | null
          id: string
          rate_plan_id: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          channel_id: string
          created_at?: string
          external_rate_code?: string | null
          id?: string
          rate_plan_id: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          channel_id?: string
          created_at?: string
          external_rate_code?: string | null
          id?: string
          rate_plan_id?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "distribution_rate_mappings_channel_fk"
            columns: ["channel_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "distribution_channels"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "distribution_rate_mappings_plan_fk"
            columns: ["rate_plan_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "hotel_rate_plans"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "distribution_rate_mappings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      distribution_room_mappings: {
        Row: {
          active: boolean
          channel_id: string
          created_at: string
          external_room_code: string | null
          id: string
          restaurant_id: string
          room_type_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          channel_id: string
          created_at?: string
          external_room_code?: string | null
          id?: string
          restaurant_id: string
          room_type_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          channel_id?: string
          created_at?: string
          external_room_code?: string | null
          id?: string
          restaurant_id?: string
          room_type_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "distribution_room_mappings_channel_fk"
            columns: ["channel_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "distribution_channels"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "distribution_room_mappings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distribution_room_mappings_type_fk"
            columns: ["room_type_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id", "restaurant_id"]
          },
        ]
      }
      folio_history: {
        Row: {
          actor_membership_id: string | null
          cashier_shift_id: string | null
          created_at: string
          event_type: string
          folio_id: string | null
          id: string
          new_values: Json | null
          notes: string | null
          previous_values: Json | null
          restaurant_id: string
        }
        Insert: {
          actor_membership_id?: string | null
          cashier_shift_id?: string | null
          created_at?: string
          event_type: string
          folio_id?: string | null
          id?: string
          new_values?: Json | null
          notes?: string | null
          previous_values?: Json | null
          restaurant_id: string
        }
        Update: {
          actor_membership_id?: string | null
          cashier_shift_id?: string | null
          created_at?: string
          event_type?: string
          folio_id?: string | null
          id?: string
          new_values?: Json | null
          notes?: string | null
          previous_values?: Json | null
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "folio_history_actor_membership_id_fkey"
            columns: ["actor_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folio_history_folio_same_property"
            columns: ["folio_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "guest_folios"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "folio_history_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folio_history_shift_same_property"
            columns: ["cashier_shift_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "cashier_shifts"
            referencedColumns: ["id", "restaurant_id"]
          },
        ]
      }
      folio_transactions: {
        Row: {
          amount: number
          category: string
          created_at: string
          description: string
          folio_id: string
          id: string
          payment_method: string | null
          posted_at: string
          posted_by_membership_id: string | null
          reference_id: string | null
          reference_type: string | null
          restaurant_id: string
          transaction_type: string
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          description: string
          folio_id: string
          id?: string
          payment_method?: string | null
          posted_at?: string
          posted_by_membership_id?: string | null
          reference_id?: string | null
          reference_type?: string | null
          restaurant_id: string
          transaction_type: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          description?: string
          folio_id?: string
          id?: string
          payment_method?: string | null
          posted_at?: string
          posted_by_membership_id?: string | null
          reference_id?: string | null
          reference_type?: string | null
          restaurant_id?: string
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "folio_transactions_folio_same_property"
            columns: ["folio_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "guest_folios"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "folio_transactions_posted_by_membership_id_fkey"
            columns: ["posted_by_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folio_transactions_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_folio_counters: {
        Row: {
          last_number: number
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          last_number?: number
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          last_number?: number
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_folio_counters_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_folios: {
        Row: {
          closed_at: string | null
          created_at: string
          created_by_membership_id: string | null
          currency: string
          folio_number: string
          guest_id: string
          id: string
          opened_at: string
          reservation_id: string | null
          restaurant_id: string
          status: string
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          created_by_membership_id?: string | null
          currency: string
          folio_number: string
          guest_id: string
          id?: string
          opened_at?: string
          reservation_id?: string | null
          restaurant_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          created_by_membership_id?: string | null
          currency?: string
          folio_number?: string
          guest_id?: string
          id?: string
          opened_at?: string
          reservation_id?: string | null
          restaurant_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_folios_created_by_membership_id_fkey"
            columns: ["created_by_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_folios_guest_same_property"
            columns: ["guest_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "guest_profiles"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "guest_folios_reservation_same_property"
            columns: ["reservation_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "hotel_reservations"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "guest_folios_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_preferences: {
        Row: {
          accessibility_requirements: string | null
          bed_preference: string | null
          communication_preference: string | null
          created_at: string
          floor_preference: string | null
          food_preference: string | null
          guest_id: string
          id: string
          restaurant_id: string
          room_preference: string | null
          special_requests: string | null
          updated_at: string
          view_preference: string | null
        }
        Insert: {
          accessibility_requirements?: string | null
          bed_preference?: string | null
          communication_preference?: string | null
          created_at?: string
          floor_preference?: string | null
          food_preference?: string | null
          guest_id: string
          id?: string
          restaurant_id: string
          room_preference?: string | null
          special_requests?: string | null
          updated_at?: string
          view_preference?: string | null
        }
        Update: {
          accessibility_requirements?: string | null
          bed_preference?: string | null
          communication_preference?: string | null
          created_at?: string
          floor_preference?: string | null
          food_preference?: string | null
          guest_id?: string
          id?: string
          restaurant_id?: string
          room_preference?: string | null
          special_requests?: string | null
          updated_at?: string
          view_preference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guest_preferences_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_preferences_same_property"
            columns: ["guest_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "guest_profiles"
            referencedColumns: ["id", "restaurant_id"]
          },
        ]
      }
      guest_profile_history: {
        Row: {
          actor_membership_id: string | null
          created_at: string
          event_type: string
          guest_id: string
          id: string
          new_values: Json | null
          notes: string | null
          previous_values: Json | null
          restaurant_id: string
        }
        Insert: {
          actor_membership_id?: string | null
          created_at?: string
          event_type: string
          guest_id: string
          id?: string
          new_values?: Json | null
          notes?: string | null
          previous_values?: Json | null
          restaurant_id: string
        }
        Update: {
          actor_membership_id?: string | null
          created_at?: string
          event_type?: string
          guest_id?: string
          id?: string
          new_values?: Json | null
          notes?: string | null
          previous_values?: Json | null
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_profile_history_actor_membership_id_fkey"
            columns: ["actor_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_profile_history_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_profile_history_same_property"
            columns: ["guest_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "guest_profiles"
            referencedColumns: ["id", "restaurant_id"]
          },
        ]
      }
      guest_profiles: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          city: string | null
          country: string | null
          created_at: string
          created_by_staff_membership_id: string | null
          date_of_birth: string | null
          email: string | null
          email_normalized: string | null
          first_name: string
          guest_status: string
          id: string
          language: string | null
          last_name: string | null
          linked_customer_user_id: string | null
          nationality: string | null
          notes: string | null
          phone: string | null
          phone_normalized: string | null
          postal_code: string | null
          region: string | null
          restaurant_id: string
          updated_at: string
          vip_status: boolean
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          created_by_staff_membership_id?: string | null
          date_of_birth?: string | null
          email?: string | null
          email_normalized?: string | null
          first_name: string
          guest_status?: string
          id?: string
          language?: string | null
          last_name?: string | null
          linked_customer_user_id?: string | null
          nationality?: string | null
          notes?: string | null
          phone?: string | null
          phone_normalized?: string | null
          postal_code?: string | null
          region?: string | null
          restaurant_id: string
          updated_at?: string
          vip_status?: boolean
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          created_by_staff_membership_id?: string | null
          date_of_birth?: string | null
          email?: string | null
          email_normalized?: string | null
          first_name?: string
          guest_status?: string
          id?: string
          language?: string | null
          last_name?: string | null
          linked_customer_user_id?: string | null
          nationality?: string | null
          notes?: string | null
          phone?: string | null
          phone_normalized?: string | null
          postal_code?: string | null
          region?: string | null
          restaurant_id?: string
          updated_at?: string
          vip_status?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "guest_profiles_created_by_staff_membership_id_fkey"
            columns: ["created_by_staff_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_profiles_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      hotel_rate_calendar: {
        Row: {
          created_at: string
          created_by_membership_id: string | null
          id: string
          nightly_rate: number
          rate_date: string
          rate_plan_id: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by_membership_id?: string | null
          id?: string
          nightly_rate: number
          rate_date: string
          rate_plan_id: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_membership_id?: string | null
          id?: string
          nightly_rate?: number
          rate_date?: string
          rate_plan_id?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotel_rate_calendar_created_by_membership_id_fkey"
            columns: ["created_by_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_rate_calendar_plan_same_property"
            columns: ["rate_plan_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "hotel_rate_plans"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "hotel_rate_calendar_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      hotel_rate_categories: {
        Row: {
          active: boolean
          code: string
          created_at: string
          created_by_membership_id: string | null
          description: string | null
          id: string
          name: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          created_by_membership_id?: string | null
          description?: string | null
          id?: string
          name: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          created_by_membership_id?: string | null
          description?: string | null
          id?: string
          name?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotel_rate_categories_created_by_membership_id_fkey"
            columns: ["created_by_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_rate_categories_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      hotel_rate_plans: {
        Row: {
          active: boolean
          base_rate: number
          code: string
          created_at: string
          created_by_membership_id: string | null
          currency: string
          description: string | null
          id: string
          name: string
          rate_category_id: string
          restaurant_id: string
          room_type_id: string
          updated_at: string
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          active?: boolean
          base_rate: number
          code: string
          created_at?: string
          created_by_membership_id?: string | null
          currency: string
          description?: string | null
          id?: string
          name: string
          rate_category_id: string
          restaurant_id: string
          room_type_id: string
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          active?: boolean
          base_rate?: number
          code?: string
          created_at?: string
          created_by_membership_id?: string | null
          currency?: string
          description?: string | null
          id?: string
          name?: string
          rate_category_id?: string
          restaurant_id?: string
          room_type_id?: string
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hotel_rate_plans_category_same_property"
            columns: ["rate_category_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "hotel_rate_categories"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "hotel_rate_plans_created_by_membership_id_fkey"
            columns: ["created_by_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_rate_plans_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_rate_plans_type_same_property"
            columns: ["room_type_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id", "restaurant_id"]
          },
        ]
      }
      hotel_rate_restrictions: {
        Row: {
          closed_to_arrival: boolean
          closed_to_departure: boolean
          created_at: string
          created_by_membership_id: string | null
          id: string
          max_stay: number | null
          min_stay: number | null
          rate_plan_id: string
          restaurant_id: string
          restriction_date: string
          stop_sell: boolean
          updated_at: string
        }
        Insert: {
          closed_to_arrival?: boolean
          closed_to_departure?: boolean
          created_at?: string
          created_by_membership_id?: string | null
          id?: string
          max_stay?: number | null
          min_stay?: number | null
          rate_plan_id: string
          restaurant_id: string
          restriction_date: string
          stop_sell?: boolean
          updated_at?: string
        }
        Update: {
          closed_to_arrival?: boolean
          closed_to_departure?: boolean
          created_at?: string
          created_by_membership_id?: string | null
          id?: string
          max_stay?: number | null
          min_stay?: number | null
          rate_plan_id?: string
          restaurant_id?: string
          restriction_date?: string
          stop_sell?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotel_rate_restrictions_created_by_membership_id_fkey"
            columns: ["created_by_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_rate_restrictions_plan_same_property"
            columns: ["rate_plan_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "hotel_rate_plans"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "hotel_rate_restrictions_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      hotel_reservation_counters: {
        Row: {
          last_number: number
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          last_number?: number
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          last_number?: number
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotel_reservation_counters_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      hotel_reservation_history: {
        Row: {
          actor_membership_id: string | null
          created_at: string
          event_type: string
          id: string
          new_values: Json | null
          notes: string | null
          previous_values: Json | null
          reservation_id: string
          restaurant_id: string
        }
        Insert: {
          actor_membership_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          new_values?: Json | null
          notes?: string | null
          previous_values?: Json | null
          reservation_id: string
          restaurant_id: string
        }
        Update: {
          actor_membership_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          new_values?: Json | null
          notes?: string | null
          previous_values?: Json | null
          reservation_id?: string
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotel_reservation_history_actor_membership_id_fkey"
            columns: ["actor_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_reservation_history_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_reservation_history_same_property"
            columns: ["reservation_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "hotel_reservations"
            referencedColumns: ["id", "restaurant_id"]
          },
        ]
      }
      hotel_reservations: {
        Row: {
          adults: number
          arrival_date: string
          cancellation_reason: string | null
          children: number
          confirmation_number: string
          created_at: string
          created_by_staff_membership_id: string | null
          currency: string | null
          departure_date: string
          guest_id: string
          id: string
          nightly_rate_snapshot: Json | null
          notes: string | null
          priced_at: string | null
          rate_plan_id: string | null
          restaurant_id: string
          room_id: string | null
          room_subtotal: number | null
          room_type_id: string
          source: string
          special_requests: string | null
          status: string
          updated_at: string
        }
        Insert: {
          adults?: number
          arrival_date: string
          cancellation_reason?: string | null
          children?: number
          confirmation_number: string
          created_at?: string
          created_by_staff_membership_id?: string | null
          currency?: string | null
          departure_date: string
          guest_id: string
          id?: string
          nightly_rate_snapshot?: Json | null
          notes?: string | null
          priced_at?: string | null
          rate_plan_id?: string | null
          restaurant_id: string
          room_id?: string | null
          room_subtotal?: number | null
          room_type_id: string
          source?: string
          special_requests?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          adults?: number
          arrival_date?: string
          cancellation_reason?: string | null
          children?: number
          confirmation_number?: string
          created_at?: string
          created_by_staff_membership_id?: string | null
          currency?: string | null
          departure_date?: string
          guest_id?: string
          id?: string
          nightly_rate_snapshot?: Json | null
          notes?: string | null
          priced_at?: string | null
          rate_plan_id?: string | null
          restaurant_id?: string
          room_id?: string | null
          room_subtotal?: number | null
          room_type_id?: string
          source?: string
          special_requests?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotel_reservations_created_by_staff_membership_id_fkey"
            columns: ["created_by_staff_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_reservations_guest_same_property"
            columns: ["guest_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "guest_profiles"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "hotel_reservations_rate_plan_same_property"
            columns: ["rate_plan_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "hotel_rate_plans"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "hotel_reservations_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_reservations_room_same_type"
            columns: ["room_id", "restaurant_id", "room_type_id"]
            isOneToOne: false
            referencedRelation: "hotel_rooms"
            referencedColumns: ["id", "restaurant_id", "room_type_id"]
          },
          {
            foreignKeyName: "hotel_reservations_type_same_property"
            columns: ["room_type_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id", "restaurant_id"]
          },
        ]
      }
      hotel_rooms: {
        Row: {
          accessible: boolean
          active: boolean
          building: string | null
          created_at: string
          created_by_staff_membership_id: string | null
          floor: string | null
          housekeeping_status: string
          id: string
          notes: string | null
          restaurant_id: string
          restriction_expected_return: string | null
          restriction_reason: string | null
          room_number: string
          room_type_id: string
          smoking: boolean
          status: string
          updated_at: string
          wing: string | null
        }
        Insert: {
          accessible?: boolean
          active?: boolean
          building?: string | null
          created_at?: string
          created_by_staff_membership_id?: string | null
          floor?: string | null
          housekeeping_status?: string
          id?: string
          notes?: string | null
          restaurant_id: string
          restriction_expected_return?: string | null
          restriction_reason?: string | null
          room_number: string
          room_type_id: string
          smoking?: boolean
          status?: string
          updated_at?: string
          wing?: string | null
        }
        Update: {
          accessible?: boolean
          active?: boolean
          building?: string | null
          created_at?: string
          created_by_staff_membership_id?: string | null
          floor?: string | null
          housekeeping_status?: string
          id?: string
          notes?: string | null
          restaurant_id?: string
          restriction_expected_return?: string | null
          restriction_reason?: string | null
          room_number?: string
          room_type_id?: string
          smoking?: boolean
          status?: string
          updated_at?: string
          wing?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hotel_rooms_created_by_staff_membership_id_fkey"
            columns: ["created_by_staff_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_rooms_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_rooms_type_same_property"
            columns: ["room_type_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id", "restaurant_id"]
          },
        ]
      }
      housekeeping_discrepancies: {
        Row: {
          actual_hk_status: string | null
          actual_occupancy: string | null
          created_at: string
          id: string
          reason: string | null
          reported_by_membership_id: string | null
          reported_hk_status: string | null
          reported_occupancy: string | null
          resolved_at: string | null
          resolved_by_membership_id: string | null
          restaurant_id: string
          room_id: string
          status: string
        }
        Insert: {
          actual_hk_status?: string | null
          actual_occupancy?: string | null
          created_at?: string
          id?: string
          reason?: string | null
          reported_by_membership_id?: string | null
          reported_hk_status?: string | null
          reported_occupancy?: string | null
          resolved_at?: string | null
          resolved_by_membership_id?: string | null
          restaurant_id: string
          room_id: string
          status?: string
        }
        Update: {
          actual_hk_status?: string | null
          actual_occupancy?: string | null
          created_at?: string
          id?: string
          reason?: string | null
          reported_by_membership_id?: string | null
          reported_hk_status?: string | null
          reported_occupancy?: string | null
          resolved_at?: string | null
          resolved_by_membership_id?: string | null
          restaurant_id?: string
          room_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "housekeeping_discrepancies_reported_by_membership_id_fkey"
            columns: ["reported_by_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "housekeeping_discrepancies_resolved_by_membership_id_fkey"
            columns: ["resolved_by_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "housekeeping_discrepancies_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "housekeeping_discrepancies_room_same_property"
            columns: ["room_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "hotel_rooms"
            referencedColumns: ["id", "restaurant_id"]
          },
        ]
      }
      housekeeping_history: {
        Row: {
          actor_membership_id: string | null
          created_at: string
          event_type: string
          id: string
          new_values: Json | null
          notes: string | null
          previous_values: Json | null
          restaurant_id: string
          room_id: string | null
        }
        Insert: {
          actor_membership_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          new_values?: Json | null
          notes?: string | null
          previous_values?: Json | null
          restaurant_id: string
          room_id?: string | null
        }
        Update: {
          actor_membership_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          new_values?: Json | null
          notes?: string | null
          previous_values?: Json | null
          restaurant_id?: string
          room_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "housekeeping_history_actor_membership_id_fkey"
            columns: ["actor_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "housekeeping_history_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "housekeeping_history_room_same_property"
            columns: ["room_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "hotel_rooms"
            referencedColumns: ["id", "restaurant_id"]
          },
        ]
      }
      housekeeping_inspections: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          inspector_membership_id: string | null
          notes: string | null
          restaurant_id: string
          room_id: string
          status: string
          task_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          inspector_membership_id?: string | null
          notes?: string | null
          restaurant_id: string
          room_id: string
          status?: string
          task_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          inspector_membership_id?: string | null
          notes?: string | null
          restaurant_id?: string
          room_id?: string
          status?: string
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "housekeeping_inspections_inspector_membership_id_fkey"
            columns: ["inspector_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "housekeeping_inspections_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "housekeeping_inspections_room_same_property"
            columns: ["room_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "hotel_rooms"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "housekeeping_inspections_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "housekeeping_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      housekeeping_maintenance_requests: {
        Row: {
          category: string
          created_at: string
          created_by_membership_id: string | null
          description: string
          id: string
          priority: string
          resolved_at: string | null
          resolved_by_membership_id: string | null
          restaurant_id: string
          room_id: string
          status: string
        }
        Insert: {
          category: string
          created_at?: string
          created_by_membership_id?: string | null
          description: string
          id?: string
          priority?: string
          resolved_at?: string | null
          resolved_by_membership_id?: string | null
          restaurant_id: string
          room_id: string
          status?: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by_membership_id?: string | null
          description?: string
          id?: string
          priority?: string
          resolved_at?: string | null
          resolved_by_membership_id?: string | null
          restaurant_id?: string
          room_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "housekeeping_maintenance_request_resolved_by_membership_id_fkey"
            columns: ["resolved_by_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "housekeeping_maintenance_requests_created_by_membership_id_fkey"
            columns: ["created_by_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "housekeeping_maintenance_requests_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "housekeeping_maintenance_room_same_property"
            columns: ["room_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "hotel_rooms"
            referencedColumns: ["id", "restaurant_id"]
          },
        ]
      }
      housekeeping_tasks: {
        Row: {
          assigned_membership_id: string | null
          completed_at: string | null
          created_at: string
          created_by_membership_id: string | null
          id: string
          notes: string | null
          priority: string
          restaurant_id: string
          room_id: string
          started_at: string | null
          status: string
          task_type: string
          updated_at: string
        }
        Insert: {
          assigned_membership_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by_membership_id?: string | null
          id?: string
          notes?: string | null
          priority?: string
          restaurant_id: string
          room_id: string
          started_at?: string | null
          status?: string
          task_type: string
          updated_at?: string
        }
        Update: {
          assigned_membership_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by_membership_id?: string | null
          id?: string
          notes?: string | null
          priority?: string
          restaurant_id?: string
          room_id?: string
          started_at?: string | null
          status?: string
          task_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "housekeeping_tasks_assigned_membership_id_fkey"
            columns: ["assigned_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "housekeeping_tasks_created_by_membership_id_fkey"
            columns: ["created_by_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "housekeeping_tasks_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "housekeeping_tasks_room_same_property"
            columns: ["room_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "hotel_rooms"
            referencedColumns: ["id", "restaurant_id"]
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
          purchase_order_id: string | null
          purchase_order_item_id: string | null
          quantity: number
          reason: string | null
          restaurant_id: string
          supplier_id: string | null
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
          purchase_order_id?: string | null
          purchase_order_item_id?: string | null
          quantity: number
          reason?: string | null
          restaurant_id: string
          supplier_id?: string | null
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
          purchase_order_id?: string | null
          purchase_order_item_id?: string | null
          quantity?: number
          reason?: string | null
          restaurant_id?: string
          supplier_id?: string | null
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
            foreignKeyName: "inventory_stock_movements_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_stock_movements_purchase_order_item_id_fkey"
            columns: ["purchase_order_item_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_items"
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
            foreignKeyName: "inventory_stock_movements_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "restaurant_suppliers"
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
      menu_item_recipe_components: {
        Row: {
          created_at: string
          created_by_staff_membership_id: string | null
          display_quantity: number
          display_unit_id: string
          id: string
          inventory_item_id: string
          menu_item_id: string
          quantity_base: number
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by_staff_membership_id?: string | null
          display_quantity: number
          display_unit_id: string
          id?: string
          inventory_item_id: string
          menu_item_id: string
          quantity_base: number
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_staff_membership_id?: string | null
          display_quantity?: number
          display_unit_id?: string
          id?: string
          inventory_item_id?: string
          menu_item_id?: string
          quantity_base?: number
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_recipe_components_created_by_staff_membership_id_fkey"
            columns: ["created_by_staff_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_recipe_components_display_unit_id_fkey"
            columns: ["display_unit_id"]
            isOneToOne: false
            referencedRelation: "inventory_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_recipe_components_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_recipe_components_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_recipe_components_restaurant_id_fkey"
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
      marketing_content_revisions: {
        Row: {
          content: Json
          published_at: string | null
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          content: Json
          published_at?: string | null
          status: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          content?: Json
          published_at?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      night_audit_exceptions: {
        Row: {
          created_at: string
          exception_type: string
          id: string
          message: string
          night_audit_run_id: string
          reference_id: string | null
          reference_type: string | null
          resolution_note: string | null
          resolved_at: string | null
          resolved_by_membership_id: string | null
          restaurant_id: string
          severity: string
          status: string
        }
        Insert: {
          created_at?: string
          exception_type: string
          id?: string
          message: string
          night_audit_run_id: string
          reference_id?: string | null
          reference_type?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by_membership_id?: string | null
          restaurant_id: string
          severity: string
          status?: string
        }
        Update: {
          created_at?: string
          exception_type?: string
          id?: string
          message?: string
          night_audit_run_id?: string
          reference_id?: string | null
          reference_type?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by_membership_id?: string | null
          restaurant_id?: string
          severity?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "night_audit_exceptions_night_audit_run_id_fkey"
            columns: ["night_audit_run_id"]
            isOneToOne: false
            referencedRelation: "night_audit_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "night_audit_exceptions_resolved_by_membership_id_fkey"
            columns: ["resolved_by_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "night_audit_exceptions_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      night_audit_runs: {
        Row: {
          business_date: string
          closed_at: string | null
          closed_by_membership_id: string | null
          created_at: string
          id: string
          notes: string | null
          restaurant_id: string
          started_at: string
          started_by_membership_id: string | null
          status: string
          summary: Json | null
          updated_at: string
        }
        Insert: {
          business_date: string
          closed_at?: string | null
          closed_by_membership_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          restaurant_id: string
          started_at?: string
          started_by_membership_id?: string | null
          status?: string
          summary?: Json | null
          updated_at?: string
        }
        Update: {
          business_date?: string
          closed_at?: string | null
          closed_by_membership_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          restaurant_id?: string
          started_at?: string
          started_by_membership_id?: string | null
          status?: string
          summary?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "night_audit_runs_closed_by_membership_id_fkey"
            columns: ["closed_by_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "night_audit_runs_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "night_audit_runs_started_by_membership_id_fkey"
            columns: ["started_by_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
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
      order_payments: {
        Row: {
          amount: number
          cashier_shift_id: string | null
          change_amount: number
          created_at: string
          id: string
          membership_id: string | null
          method: string
          order_id: string
          reference: string | null
          restaurant_id: string
          tendered_amount: number | null
          updated_at: string
        }
        Insert: {
          amount: number
          cashier_shift_id?: string | null
          change_amount?: number
          created_at?: string
          id?: string
          membership_id?: string | null
          method: string
          order_id: string
          reference?: string | null
          restaurant_id: string
          tendered_amount?: number | null
          updated_at?: string
        }
        Update: {
          amount?: number
          cashier_shift_id?: string | null
          change_amount?: number
          created_at?: string
          id?: string
          membership_id?: string | null
          method?: string
          order_id?: string
          reference?: string | null
          restaurant_id?: string
          tendered_amount?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_payments_cashier_shift_id_fkey"
            columns: ["cashier_shift_id"]
            isOneToOne: false
            referencedRelation: "cashier_shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_payments_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_payments_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_refund_lines: {
        Row: {
          amount: number
          created_at: string
          id: string
          order_id: string
          order_item_id: string
          quantity: number
          refund_id: string
          restaurant_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          order_id: string
          order_item_id: string
          quantity: number
          refund_id: string
          restaurant_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          order_id?: string
          order_item_id?: string
          quantity?: number
          refund_id?: string
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_refund_lines_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_refund_lines_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_refund_lines_refund_id_fkey"
            columns: ["refund_id"]
            isOneToOne: false
            referencedRelation: "order_refunds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_refund_lines_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_refunds: {
        Row: {
          amount: number
          authorized_by_membership_id: string | null
          cashier_shift_id: string | null
          created_at: string
          id: string
          method: string
          no_open_shift: boolean
          order_id: string
          payment_id: string | null
          processed_by_membership_id: string | null
          reason: string
          restaurant_id: string
        }
        Insert: {
          amount: number
          authorized_by_membership_id?: string | null
          cashier_shift_id?: string | null
          created_at?: string
          id?: string
          method: string
          no_open_shift?: boolean
          order_id: string
          payment_id?: string | null
          processed_by_membership_id?: string | null
          reason: string
          restaurant_id: string
        }
        Update: {
          amount?: number
          authorized_by_membership_id?: string | null
          cashier_shift_id?: string | null
          created_at?: string
          id?: string
          method?: string
          no_open_shift?: boolean
          order_id?: string
          payment_id?: string | null
          processed_by_membership_id?: string | null
          reason?: string
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_refunds_authorized_by_membership_id_fkey"
            columns: ["authorized_by_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_refunds_cashier_shift_id_fkey"
            columns: ["cashier_shift_id"]
            isOneToOne: false
            referencedRelation: "cashier_shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_refunds_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_refunds_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "order_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_refunds_processed_by_membership_id_fkey"
            columns: ["processed_by_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_refunds_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
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
          billing_method: string | null
          cashier_shift_id: string | null
          created_at: string
          created_by_staff_membership_id: string | null
          created_by_staff_name_snapshot: string | null
          customer_id: string | null
          guest_token_hash: string | null
          id: string
          order_number: number
          order_source: string
          order_type: string | null
          paid_at: string | null
          refunded_amount: number
          restaurant_id: string | null
          restaurant_table_id: string | null
          room_charge_folio_id: string | null
          room_charge_posted_at: string | null
          room_charge_posted_by_membership_id: string | null
          room_charge_reservation_id: string | null
          status: string
          table_number: string
          total: number
          updated_at: string
        }
        Insert: {
          assigned_waiter_membership_id?: string | null
          assigned_waiter_name_snapshot?: string | null
          billing_method?: string | null
          cashier_shift_id?: string | null
          created_at?: string
          created_by_staff_membership_id?: string | null
          created_by_staff_name_snapshot?: string | null
          customer_id?: string | null
          guest_token_hash?: string | null
          id?: string
          order_number?: number
          order_source?: string
          order_type?: string | null
          paid_at?: string | null
          refunded_amount?: number
          restaurant_id?: string | null
          restaurant_table_id?: string | null
          room_charge_folio_id?: string | null
          room_charge_posted_at?: string | null
          room_charge_posted_by_membership_id?: string | null
          room_charge_reservation_id?: string | null
          status?: string
          table_number: string
          total?: number
          updated_at?: string
        }
        Update: {
          assigned_waiter_membership_id?: string | null
          assigned_waiter_name_snapshot?: string | null
          billing_method?: string | null
          cashier_shift_id?: string | null
          created_at?: string
          created_by_staff_membership_id?: string | null
          created_by_staff_name_snapshot?: string | null
          customer_id?: string | null
          guest_token_hash?: string | null
          id?: string
          order_number?: number
          order_source?: string
          order_type?: string | null
          paid_at?: string | null
          refunded_amount?: number
          restaurant_id?: string | null
          restaurant_table_id?: string | null
          room_charge_folio_id?: string | null
          room_charge_posted_at?: string | null
          room_charge_posted_by_membership_id?: string | null
          room_charge_reservation_id?: string | null
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
            foreignKeyName: "orders_cashier_shift_id_fkey"
            columns: ["cashier_shift_id"]
            isOneToOne: false
            referencedRelation: "cashier_shifts"
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
          {
            foreignKeyName: "orders_room_charge_folio_fkey"
            columns: ["room_charge_folio_id"]
            isOneToOne: false
            referencedRelation: "guest_folios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_room_charge_posted_by_membership_id_fkey"
            columns: ["room_charge_posted_by_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_room_charge_reservation_fkey"
            columns: ["room_charge_reservation_id"]
            isOneToOne: false
            referencedRelation: "hotel_reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_cashier_shifts: {
        Row: {
          business_date: string
          closed_at: string | null
          closed_by_membership_id: string | null
          closing_cash: number | null
          created_at: string
          expected_cash: number | null
          id: string
          notes: string | null
          opened_at: string
          opened_by_membership_id: string
          opening_float: number
          register_id: string
          restaurant_id: string
          status: string
          updated_at: string
          variance: number | null
        }
        Insert: {
          business_date: string
          closed_at?: string | null
          closed_by_membership_id?: string | null
          closing_cash?: number | null
          created_at?: string
          expected_cash?: number | null
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by_membership_id: string
          opening_float?: number
          register_id: string
          restaurant_id: string
          status?: string
          updated_at?: string
          variance?: number | null
        }
        Update: {
          business_date?: string
          closed_at?: string | null
          closed_by_membership_id?: string | null
          closing_cash?: number | null
          created_at?: string
          expected_cash?: number | null
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by_membership_id?: string
          opening_float?: number
          register_id?: string
          restaurant_id?: string
          status?: string
          updated_at?: string
          variance?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_cashier_shifts_closed_by_membership_id_fkey"
            columns: ["closed_by_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_cashier_shifts_opened_by_membership_id_fkey"
            columns: ["opened_by_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_cashier_shifts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_shifts_register_same_property"
            columns: ["register_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pos_registers"
            referencedColumns: ["id", "restaurant_id"]
          },
        ]
      }
      pos_categories: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          restaurant_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          restaurant_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          restaurant_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_categories_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_payments: {
        Row: {
          amount: number
          change_amount: number
          created_at: string
          id: string
          payment_method: string
          received_by_membership_id: string
          reference: string | null
          restaurant_id: string
          sale_id: string
          shift_id: string | null
          status: string
          tendered_amount: number | null
        }
        Insert: {
          amount: number
          change_amount?: number
          created_at?: string
          id?: string
          payment_method: string
          received_by_membership_id: string
          reference?: string | null
          restaurant_id: string
          sale_id: string
          shift_id?: string | null
          status?: string
          tendered_amount?: number | null
        }
        Update: {
          amount?: number
          change_amount?: number
          created_at?: string
          id?: string
          payment_method?: string
          received_by_membership_id?: string
          reference?: string | null
          restaurant_id?: string
          sale_id?: string
          shift_id?: string | null
          status?: string
          tendered_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_payments_received_by_membership_id_fkey"
            columns: ["received_by_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_payments_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_payments_sale_same_property"
            columns: ["sale_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pos_sales"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pos_payments_shift_same_property"
            columns: ["shift_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pos_cashier_shifts"
            referencedColumns: ["id", "restaurant_id"]
          },
        ]
      }
      pos_products: {
        Row: {
          active: boolean
          barcode: string | null
          category_id: string | null
          cost_price: number | null
          created_at: string
          description: string | null
          id: string
          name: string
          restaurant_id: string
          sku: string | null
          sort_order: number
          tax_rate: number | null
          unit_price: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          barcode?: string | null
          category_id?: string | null
          cost_price?: number | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          restaurant_id: string
          sku?: string | null
          sort_order?: number
          tax_rate?: number | null
          unit_price?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          barcode?: string | null
          category_id?: string | null
          cost_price?: number | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          restaurant_id?: string
          sku?: string | null
          sort_order?: number
          tax_rate?: number | null
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_products_category_same_property"
            columns: ["category_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pos_categories"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pos_products_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_refunds: {
        Row: {
          amount: number
          authorized_by_membership_id: string | null
          created_at: string
          id: string
          line_detail: Json | null
          method: string
          payment_id: string | null
          processed_by_membership_id: string
          reason: string | null
          restaurant_id: string
          sale_id: string
          shift_id: string | null
        }
        Insert: {
          amount: number
          authorized_by_membership_id?: string | null
          created_at?: string
          id?: string
          line_detail?: Json | null
          method: string
          payment_id?: string | null
          processed_by_membership_id: string
          reason?: string | null
          restaurant_id: string
          sale_id: string
          shift_id?: string | null
        }
        Update: {
          amount?: number
          authorized_by_membership_id?: string | null
          created_at?: string
          id?: string
          line_detail?: Json | null
          method?: string
          payment_id?: string | null
          processed_by_membership_id?: string
          reason?: string | null
          restaurant_id?: string
          sale_id?: string
          shift_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_refunds_authorized_by_membership_id_fkey"
            columns: ["authorized_by_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_refunds_payment_same_property"
            columns: ["payment_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pos_payments"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pos_refunds_processed_by_membership_id_fkey"
            columns: ["processed_by_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_refunds_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_refunds_sale_same_property"
            columns: ["sale_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pos_sales"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pos_refunds_shift_same_property"
            columns: ["shift_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pos_cashier_shifts"
            referencedColumns: ["id", "restaurant_id"]
          },
        ]
      }
      pos_registers: {
        Row: {
          active: boolean
          created_at: string
          id: string
          location_label: string | null
          name: string
          restaurant_id: string
          settings: Json
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          location_label?: string | null
          name: string
          restaurant_id: string
          settings?: Json
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          location_label?: string | null
          name?: string
          restaurant_id?: string
          settings?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_registers_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_sale_counters: {
        Row: {
          last_number: number
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          last_number?: number
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          last_number?: number
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_sale_counters_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_sale_items: {
        Row: {
          created_at: string
          discount_amount: number
          id: string
          line_subtotal: number
          line_total: number
          note: string | null
          product_id: string | null
          product_name_snapshot: string
          quantity: number
          restaurant_id: string
          sale_id: string
          sku_snapshot: string | null
          tax_amount: number
          tax_rate_snapshot: number
          unit_price_snapshot: number
        }
        Insert: {
          created_at?: string
          discount_amount?: number
          id?: string
          line_subtotal?: number
          line_total?: number
          note?: string | null
          product_id?: string | null
          product_name_snapshot: string
          quantity: number
          restaurant_id: string
          sale_id: string
          sku_snapshot?: string | null
          tax_amount?: number
          tax_rate_snapshot?: number
          unit_price_snapshot: number
        }
        Update: {
          created_at?: string
          discount_amount?: number
          id?: string
          line_subtotal?: number
          line_total?: number
          note?: string | null
          product_id?: string | null
          product_name_snapshot?: string
          quantity?: number
          restaurant_id?: string
          sale_id?: string
          sku_snapshot?: string | null
          tax_amount?: number
          tax_rate_snapshot?: number
          unit_price_snapshot?: number
        }
        Relationships: [
          {
            foreignKeyName: "pos_sale_items_product_same_property"
            columns: ["product_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pos_products"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pos_sale_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sale_items_sale_same_property"
            columns: ["sale_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pos_sales"
            referencedColumns: ["id", "restaurant_id"]
          },
        ]
      }
      pos_sales: {
        Row: {
          business_date: string
          cashier_name_snapshot: string | null
          completed_at: string | null
          completed_by_membership_id: string | null
          created_at: string
          currency_code: string
          customer_reference: string | null
          discount_amount: number
          discount_reason: string | null
          id: string
          note: string | null
          opened_by_membership_id: string
          refunded_amount: number
          register_id: string
          restaurant_id: string
          sale_number: number | null
          sale_reference: string | null
          shift_id: string | null
          status: string
          subtotal: number
          tax_amount: number
          total: number
          updated_at: string
          voided_at: string | null
        }
        Insert: {
          business_date: string
          cashier_name_snapshot?: string | null
          completed_at?: string | null
          completed_by_membership_id?: string | null
          created_at?: string
          currency_code: string
          customer_reference?: string | null
          discount_amount?: number
          discount_reason?: string | null
          id?: string
          note?: string | null
          opened_by_membership_id: string
          refunded_amount?: number
          register_id: string
          restaurant_id: string
          sale_number?: number | null
          sale_reference?: string | null
          shift_id?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          total?: number
          updated_at?: string
          voided_at?: string | null
        }
        Update: {
          business_date?: string
          cashier_name_snapshot?: string | null
          completed_at?: string | null
          completed_by_membership_id?: string | null
          created_at?: string
          currency_code?: string
          customer_reference?: string | null
          discount_amount?: number
          discount_reason?: string | null
          id?: string
          note?: string | null
          opened_by_membership_id?: string
          refunded_amount?: number
          register_id?: string
          restaurant_id?: string
          sale_number?: number | null
          sale_reference?: string | null
          shift_id?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          total?: number
          updated_at?: string
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_sales_completed_by_membership_id_fkey"
            columns: ["completed_by_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sales_opened_by_membership_id_fkey"
            columns: ["opened_by_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sales_register_same_property"
            columns: ["register_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pos_registers"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pos_sales_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sales_shift_same_property"
            columns: ["shift_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pos_cashier_shifts"
            referencedColumns: ["id", "restaurant_id"]
          },
        ]
      }
      pos_settings: {
        Row: {
          created_at: string
          default_tax_rate: number
          receipt_footer: string | null
          receipt_header: string | null
          restaurant_id: string
          tax_inclusive: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_tax_rate?: number
          receipt_footer?: string | null
          receipt_header?: string | null
          restaurant_id: string
          tax_inclusive?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_tax_rate?: number
          receipt_footer?: string | null
          receipt_header?: string | null
          restaurant_id?: string
          tax_inclusive?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_settings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
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
      purchase_order_history: {
        Row: {
          created_at: string
          created_by_staff_membership_id: string | null
          event_type: string
          id: string
          new_values: Json | null
          notes: string | null
          previous_values: Json | null
          purchase_order_id: string
          restaurant_id: string
        }
        Insert: {
          created_at?: string
          created_by_staff_membership_id?: string | null
          event_type: string
          id?: string
          new_values?: Json | null
          notes?: string | null
          previous_values?: Json | null
          purchase_order_id: string
          restaurant_id: string
        }
        Update: {
          created_at?: string
          created_by_staff_membership_id?: string | null
          event_type?: string
          id?: string
          new_values?: Json | null
          notes?: string | null
          previous_values?: Json | null
          purchase_order_id?: string
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_history_created_by_staff_membership_id_fkey"
            columns: ["created_by_staff_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_history_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_history_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          created_at: string
          id: string
          inventory_item_id: string
          item_name_snapshot: string
          line_total: number
          ordered_quantity: number
          purchase_order_id: string
          received_quantity: number
          restaurant_id: string
          unit_cost: number
          unit_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          inventory_item_id: string
          item_name_snapshot: string
          line_total?: number
          ordered_quantity: number
          purchase_order_id: string
          received_quantity?: number
          restaurant_id: string
          unit_cost?: number
          unit_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          inventory_item_id?: string
          item_name_snapshot?: string
          line_total?: number
          ordered_quantity?: number
          purchase_order_id?: string
          received_quantity?: number
          restaurant_id?: string
          unit_cost?: number
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "inventory_units"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          created_at: string
          created_by_staff_membership_id: string | null
          expected_delivery_date: string | null
          id: string
          notes: string | null
          order_date: string
          ordered_by_staff_membership_id: string | null
          po_number: string
          restaurant_id: string
          status: string
          subtotal: number
          supplier_id: string
          total: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by_staff_membership_id?: string | null
          expected_delivery_date?: string | null
          id?: string
          notes?: string | null
          order_date?: string
          ordered_by_staff_membership_id?: string | null
          po_number: string
          restaurant_id: string
          status?: string
          subtotal?: number
          supplier_id: string
          total?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_staff_membership_id?: string | null
          expected_delivery_date?: string | null
          id?: string
          notes?: string | null
          order_date?: string
          ordered_by_staff_membership_id?: string | null
          po_number?: string
          restaurant_id?: string
          status?: string
          subtotal?: number
          supplier_id?: string
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_created_by_staff_membership_id_fkey"
            columns: ["created_by_staff_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_ordered_by_staff_membership_id_fkey"
            columns: ["ordered_by_staff_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "restaurant_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_asset_history: {
        Row: {
          asset_id: string
          created_at: string
          created_by_staff_membership_id: string | null
          event_type: string
          id: string
          new_values: Json | null
          notes: string | null
          previous_values: Json | null
          restaurant_id: string
        }
        Insert: {
          asset_id: string
          created_at?: string
          created_by_staff_membership_id?: string | null
          event_type: string
          id?: string
          new_values?: Json | null
          notes?: string | null
          previous_values?: Json | null
          restaurant_id: string
        }
        Update: {
          asset_id?: string
          created_at?: string
          created_by_staff_membership_id?: string | null
          event_type?: string
          id?: string
          new_values?: Json | null
          notes?: string | null
          previous_values?: Json | null
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_asset_history_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "restaurant_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_asset_history_created_by_staff_membership_id_fkey"
            columns: ["created_by_staff_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_asset_history_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_assets: {
        Row: {
          asset_code: string | null
          asset_type: string
          condition: string
          created_at: string
          created_by_staff_membership_id: string | null
          id: string
          location: string | null
          name: string
          notes: string | null
          purchase_cost: number | null
          purchase_date: string | null
          quantity: number
          restaurant_id: string
          serial_number: string | null
          status: string
          updated_at: string
          warranty_expiry: string | null
        }
        Insert: {
          asset_code?: string | null
          asset_type: string
          condition?: string
          created_at?: string
          created_by_staff_membership_id?: string | null
          id?: string
          location?: string | null
          name: string
          notes?: string | null
          purchase_cost?: number | null
          purchase_date?: string | null
          quantity?: number
          restaurant_id: string
          serial_number?: string | null
          status?: string
          updated_at?: string
          warranty_expiry?: string | null
        }
        Update: {
          asset_code?: string | null
          asset_type?: string
          condition?: string
          created_at?: string
          created_by_staff_membership_id?: string | null
          id?: string
          location?: string | null
          name?: string
          notes?: string | null
          purchase_cost?: number | null
          purchase_date?: string | null
          quantity?: number
          restaurant_id?: string
          serial_number?: string | null
          status?: string
          updated_at?: string
          warranty_expiry?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_assets_created_by_staff_membership_id_fkey"
            columns: ["created_by_staff_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_assets_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
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
      restaurant_package_entitlements: {
        Row: {
          activated_at: string | null
          created_at: string
          enabled: boolean
          expires_at: string | null
          id: string
          package_key: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          created_at?: string
          enabled?: boolean
          expires_at?: string | null
          id?: string
          package_key: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          created_at?: string
          enabled?: boolean
          expires_at?: string | null
          id?: string
          package_key?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_package_entitlements_restaurant_id_fkey"
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
      restaurant_suppliers: {
        Row: {
          active: boolean
          address: string | null
          contact_name: string | null
          created_at: string
          created_by_staff_membership_id: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          restaurant_id: string
          tax_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          contact_name?: string | null
          created_at?: string
          created_by_staff_membership_id?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          restaurant_id: string
          tax_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          contact_name?: string | null
          created_at?: string
          created_by_staff_membership_id?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          restaurant_id?: string
          tax_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_suppliers_created_by_staff_membership_id_fkey"
            columns: ["created_by_staff_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_suppliers_restaurant_id_fkey"
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
          booking_contact_email: string | null
          booking_contact_phone: string | null
          booking_message: string | null
          business_date: string | null
          city: string | null
          country: string | null
          created_at: string
          currency_code: string
          direct_booking_enabled: boolean
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
          booking_contact_email?: string | null
          booking_contact_phone?: string | null
          booking_message?: string | null
          business_date?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          currency_code?: string
          direct_booking_enabled?: boolean
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
          booking_contact_email?: string | null
          booking_contact_phone?: string | null
          booking_message?: string | null
          business_date?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          currency_code?: string
          direct_booking_enabled?: boolean
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
      room_amenities: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          restaurant_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          restaurant_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_amenities_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      room_type_amenities: {
        Row: {
          amenity_id: string
          created_at: string
          id: string
          restaurant_id: string
          room_type_id: string
        }
        Insert: {
          amenity_id: string
          created_at?: string
          id?: string
          restaurant_id: string
          room_type_id: string
        }
        Update: {
          amenity_id?: string
          created_at?: string
          id?: string
          restaurant_id?: string
          room_type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_type_amenities_amenity_fk"
            columns: ["amenity_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "room_amenities"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "room_type_amenities_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_type_amenities_type_fk"
            columns: ["room_type_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id", "restaurant_id"]
          },
        ]
      }
      room_type_images: {
        Row: {
          alt_text: string | null
          created_at: string
          display_order: number
          id: string
          is_cover: boolean
          restaurant_id: string
          room_type_id: string
          storage_path: string
          uploaded_by_staff_membership_id: string | null
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          display_order?: number
          id?: string
          is_cover?: boolean
          restaurant_id: string
          room_type_id: string
          storage_path: string
          uploaded_by_staff_membership_id?: string | null
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          display_order?: number
          id?: string
          is_cover?: boolean
          restaurant_id?: string
          room_type_id?: string
          storage_path?: string
          uploaded_by_staff_membership_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "room_type_images_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_type_images_type_fk"
            columns: ["room_type_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "room_type_images_uploaded_by_staff_membership_id_fkey"
            columns: ["uploaded_by_staff_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
        ]
      }
      room_types: {
        Row: {
          active: boolean
          adult_capacity: number
          bed_count: number | null
          bed_type: string | null
          child_capacity: number
          code: string
          created_at: string
          created_by_staff_membership_id: string | null
          description: string | null
          id: string
          max_occupancy: number
          name: string
          restaurant_id: string
          room_size: string | null
          room_view: string | null
          sellable: boolean
          updated_at: string
        }
        Insert: {
          active?: boolean
          adult_capacity?: number
          bed_count?: number | null
          bed_type?: string | null
          child_capacity?: number
          code: string
          created_at?: string
          created_by_staff_membership_id?: string | null
          description?: string | null
          id?: string
          max_occupancy?: number
          name: string
          restaurant_id: string
          room_size?: string | null
          room_view?: string | null
          sellable?: boolean
          updated_at?: string
        }
        Update: {
          active?: boolean
          adult_capacity?: number
          bed_count?: number | null
          bed_type?: string | null
          child_capacity?: number
          code?: string
          created_at?: string
          created_by_staff_membership_id?: string | null
          description?: string | null
          id?: string
          max_occupancy?: number
          name?: string
          restaurant_id?: string
          room_size?: string | null
          room_view?: string | null
          sellable?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_types_created_by_staff_membership_id_fkey"
            columns: ["created_by_staff_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_types_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
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
      staff_action_grants: {
        Row: {
          action_key: string
          created_at: string
          created_by_membership_id: string | null
          enabled: boolean
          id: string
          membership_id: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          action_key: string
          created_at?: string
          created_by_membership_id?: string | null
          enabled?: boolean
          id?: string
          membership_id: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          action_key?: string
          created_at?: string
          created_by_membership_id?: string | null
          enabled?: boolean
          id?: string
          membership_id?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_action_grants_created_by_membership_id_fkey"
            columns: ["created_by_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_action_grants_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_action_grants_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_module_access: {
        Row: {
          created_at: string
          created_by_membership_id: string | null
          enabled: boolean
          id: string
          membership_id: string
          module_key: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by_membership_id?: string | null
          enabled?: boolean
          id?: string
          membership_id: string
          module_key: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_membership_id?: string | null
          enabled?: boolean
          id?: string
          membership_id?: string
          module_key?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_module_access_created_by_membership_id_fkey"
            columns: ["created_by_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_module_access_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_module_access_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      amend_hotel_reservation: {
        Args: {
          _adults: number
          _arrival: string
          _children: number
          _departure: string
          _membership_id: string
          _notes: string
          _reservation_id: string
          _restaurant_id: string
          _room_id: string
          _room_type_id: string
          _special_requests: string
        }
        Returns: {
          adults: number
          arrival_date: string
          cancellation_reason: string | null
          children: number
          confirmation_number: string
          created_at: string
          created_by_staff_membership_id: string | null
          currency: string | null
          departure_date: string
          guest_id: string
          id: string
          nightly_rate_snapshot: Json | null
          notes: string | null
          priced_at: string | null
          rate_plan_id: string | null
          restaurant_id: string
          room_id: string | null
          room_subtotal: number | null
          room_type_id: string
          source: string
          special_requests: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "hotel_reservations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      amend_hotel_reservation_priced: {
        Args: {
          _adults: number
          _arrival: string
          _children: number
          _departure: string
          _membership_id: string
          _notes: string
          _rate_plan_id: string
          _reservation_id: string
          _restaurant_id: string
          _room_id: string
          _room_type_id: string
          _special_requests: string
        }
        Returns: {
          adults: number
          arrival_date: string
          cancellation_reason: string | null
          children: number
          confirmation_number: string
          created_at: string
          created_by_staff_membership_id: string | null
          currency: string | null
          departure_date: string
          guest_id: string
          id: string
          nightly_rate_snapshot: Json | null
          notes: string | null
          priced_at: string | null
          rate_plan_id: string | null
          restaurant_id: string
          room_id: string | null
          room_subtotal: number | null
          room_type_id: string
          source: string
          special_requests: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "hotel_reservations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
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
      assert_reservation_capacity: {
        Args: {
          _arrival: string
          _departure: string
          _exclude_reservation_id: string
          _restaurant_id: string
          _room_id: string
          _room_type_id: string
        }
        Returns: undefined
      }
      assert_room_assignable: {
        Args: {
          _arrival: string
          _departure: string
          _exclude_reservation_id: string
          _restaurant_id: string
          _room_id: string
          _room_type_id: string
        }
        Returns: undefined
      }
      can_manage_restaurant_storage: {
        Args: { _path: string }
        Returns: boolean
      }
      change_hotel_stay_dates: {
        Args: {
          _departure: string
          _membership_id: string
          _reservation_id: string
          _restaurant_id: string
        }
        Returns: {
          adults: number
          arrival_date: string
          cancellation_reason: string | null
          children: number
          confirmation_number: string
          created_at: string
          created_by_staff_membership_id: string | null
          currency: string | null
          departure_date: string
          guest_id: string
          id: string
          nightly_rate_snapshot: Json | null
          notes: string | null
          priced_at: string | null
          rate_plan_id: string | null
          restaurant_id: string
          room_id: string | null
          room_subtotal: number | null
          room_type_id: string
          source: string
          special_requests: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "hotel_reservations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      check_in_hotel_reservation: {
        Args: {
          _membership_id: string
          _reservation_id: string
          _restaurant_id: string
          _room_id: string
        }
        Returns: {
          adults: number
          arrival_date: string
          cancellation_reason: string | null
          children: number
          confirmation_number: string
          created_at: string
          created_by_staff_membership_id: string | null
          currency: string | null
          departure_date: string
          guest_id: string
          id: string
          nightly_rate_snapshot: Json | null
          notes: string | null
          priced_at: string | null
          rate_plan_id: string | null
          restaurant_id: string
          room_id: string | null
          room_subtotal: number | null
          room_type_id: string
          source: string
          special_requests: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "hotel_reservations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      check_out_hotel_reservation: {
        Args: {
          _membership_id: string
          _reservation_id: string
          _restaurant_id: string
        }
        Returns: {
          adults: number
          arrival_date: string
          cancellation_reason: string | null
          children: number
          confirmation_number: string
          created_at: string
          created_by_staff_membership_id: string | null
          currency: string | null
          departure_date: string
          guest_id: string
          id: string
          nightly_rate_snapshot: Json | null
          notes: string | null
          priced_at: string | null
          rate_plan_id: string | null
          restaurant_id: string
          room_id: string | null
          room_subtotal: number | null
          room_type_id: string
          source: string
          special_requests: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "hotel_reservations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      close_business_date: {
        Args: {
          _membership_id: string
          _restaurant_id: string
          _run_id: string
          _summary: Json
        }
        Returns: {
          business_date: string
          closed_at: string | null
          closed_by_membership_id: string | null
          created_at: string
          id: string
          notes: string | null
          restaurant_id: string
          started_at: string
          started_by_membership_id: string | null
          status: string
          summary: Json | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "night_audit_runs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      close_cashier_shift: {
        Args: {
          _closing_cash: number
          _membership_id: string
          _notes: string
          _restaurant_id: string
          _shift_id: string
        }
        Returns: {
          closed_at: string | null
          closing_cash: number | null
          created_at: string
          expected_cash: number | null
          id: string
          membership_id: string
          notes: string | null
          opened_at: string
          opening_cash: number | null
          restaurant_id: string
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "cashier_shifts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      close_guest_folio: {
        Args: {
          _folio_id: string
          _membership_id: string
          _restaurant_id: string
        }
        Returns: {
          closed_at: string | null
          created_at: string
          created_by_membership_id: string | null
          currency: string
          folio_number: string
          guest_id: string
          id: string
          opened_at: string
          reservation_id: string | null
          restaurant_id: string
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "guest_folios"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      count_reserved_rooms: {
        Args: {
          _arrival: string
          _departure: string
          _exclude_reservation_id?: string
          _restaurant_id: string
          _room_type_id: string
        }
        Returns: number
      }
      count_sellable_rooms: {
        Args: { _restaurant_id: string; _room_type_id: string }
        Returns: number
      }
      create_direct_booking: {
        Args: {
          _adults: number
          _arrival: string
          _children: number
          _departure: string
          _guest_id: string
          _rate_plan_id: string
          _restaurant_id: string
          _room_type_id: string
          _special_requests: string
        }
        Returns: {
          adults: number
          arrival_date: string
          cancellation_reason: string | null
          children: number
          confirmation_number: string
          created_at: string
          created_by_staff_membership_id: string | null
          currency: string | null
          departure_date: string
          guest_id: string
          id: string
          nightly_rate_snapshot: Json | null
          notes: string | null
          priced_at: string | null
          rate_plan_id: string | null
          restaurant_id: string
          room_id: string | null
          room_subtotal: number | null
          room_type_id: string
          source: string
          special_requests: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "hotel_reservations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_hotel_reservation: {
        Args: {
          _adults: number
          _arrival: string
          _children: number
          _departure: string
          _guest_id: string
          _membership_id: string
          _notes: string
          _restaurant_id: string
          _room_id: string
          _room_type_id: string
          _special_requests: string
          _status: string
        }
        Returns: {
          adults: number
          arrival_date: string
          cancellation_reason: string | null
          children: number
          confirmation_number: string
          created_at: string
          created_by_staff_membership_id: string | null
          currency: string | null
          departure_date: string
          guest_id: string
          id: string
          nightly_rate_snapshot: Json | null
          notes: string | null
          priced_at: string | null
          rate_plan_id: string | null
          restaurant_id: string
          room_id: string | null
          room_subtotal: number | null
          room_type_id: string
          source: string
          special_requests: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "hotel_reservations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_hotel_reservation_priced: {
        Args: {
          _adults: number
          _arrival: string
          _children: number
          _departure: string
          _guest_id: string
          _membership_id: string
          _notes: string
          _rate_plan_id: string
          _restaurant_id: string
          _room_id: string
          _room_type_id: string
          _special_requests: string
          _status: string
        }
        Returns: {
          adults: number
          arrival_date: string
          cancellation_reason: string | null
          children: number
          confirmation_number: string
          created_at: string
          created_by_staff_membership_id: string | null
          currency: string | null
          departure_date: string
          guest_id: string
          id: string
          nightly_rate_snapshot: Json | null
          notes: string | null
          priced_at: string | null
          rate_plan_id: string | null
          restaurant_id: string
          room_id: string | null
          room_subtotal: number | null
          room_type_id: string
          source: string
          special_requests: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "hotel_reservations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      folio_balance: { Args: { _folio_id: string }; Returns: number }
      has_any_restaurant_role: {
        Args: { _restaurant_id: string; _roles: string[] }
        Returns: boolean
      }
      has_kitchen_access: { Args: { _restaurant_id: string }; Returns: boolean }
      has_restaurant_role: {
        Args: { _restaurant_id: string; _role: string }
        Returns: boolean
      }
      housekeeping_complete_task: {
        Args: {
          _membership_id: string
          _restaurant_id: string
          _task_id: string
        }
        Returns: undefined
      }
      housekeeping_create_task: {
        Args: {
          _membership_id: string
          _notes: string
          _priority: string
          _restaurant_id: string
          _room_id: string
          _task_type: string
        }
        Returns: string
      }
      housekeeping_inspect_room: {
        Args: {
          _membership_id: string
          _notes: string
          _restaurant_id: string
          _result: string
          _room_id: string
          _task_id: string
        }
        Returns: string
      }
      housekeeping_set_room_restriction: {
        Args: {
          _expected_return: string
          _membership_id: string
          _reason: string
          _restaurant_id: string
          _room_id: string
          _status: string
        }
        Returns: undefined
      }
      is_platform_admin: { Args: never; Returns: boolean }
      is_restaurant_member: {
        Args: { _restaurant_id: string }
        Returns: boolean
      }
      mark_hotel_reservation_no_show: {
        Args: {
          _business_date: string
          _membership_id: string
          _reservation_id: string
          _restaurant_id: string
        }
        Returns: {
          adults: number
          arrival_date: string
          cancellation_reason: string | null
          children: number
          confirmation_number: string
          created_at: string
          created_by_staff_membership_id: string | null
          currency: string | null
          departure_date: string
          guest_id: string
          id: string
          nightly_rate_snapshot: Json | null
          notes: string | null
          priced_at: string | null
          rate_plan_id: string | null
          restaurant_id: string
          room_id: string | null
          room_subtotal: number | null
          room_type_id: string
          source: string
          special_requests: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "hotel_reservations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      move_hotel_reservation_room: {
        Args: {
          _membership_id: string
          _reason: string
          _reservation_id: string
          _restaurant_id: string
          _room_id: string
        }
        Returns: {
          adults: number
          arrival_date: string
          cancellation_reason: string | null
          children: number
          confirmation_number: string
          created_at: string
          created_by_staff_membership_id: string | null
          currency: string | null
          departure_date: string
          guest_id: string
          id: string
          nightly_rate_snapshot: Json | null
          notes: string | null
          priced_at: string | null
          rate_plan_id: string | null
          restaurant_id: string
          room_id: string | null
          room_subtotal: number | null
          room_type_id: string
          source: string
          special_requests: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "hotel_reservations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      open_cashier_shift: {
        Args: {
          _membership_id: string
          _notes: string
          _opening_cash: number
          _restaurant_id: string
        }
        Returns: {
          closed_at: string | null
          closing_cash: number | null
          created_at: string
          id: string
          membership_id: string
          notes: string | null
          opened_at: string
          opening_cash: number | null
          restaurant_id: string
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "cashier_shifts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      open_folio_for_reservation: {
        Args: {
          _membership_id: string
          _reservation_id: string
          _restaurant_id: string
        }
        Returns: {
          closed_at: string | null
          created_at: string
          created_by_membership_id: string | null
          currency: string
          folio_number: string
          guest_id: string
          id: string
          opened_at: string
          reservation_id: string | null
          restaurant_id: string
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "guest_folios"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      pos_complete_sale: {
        Args: {
          _membership_id: string
          _restaurant_id: string
          _sale_id: string
        }
        Returns: {
          business_date: string
          cashier_name_snapshot: string | null
          completed_at: string | null
          completed_by_membership_id: string | null
          created_at: string
          currency_code: string
          customer_reference: string | null
          discount_amount: number
          discount_reason: string | null
          id: string
          note: string | null
          opened_by_membership_id: string
          refunded_amount: number
          register_id: string
          restaurant_id: string
          sale_number: number | null
          sale_reference: string | null
          shift_id: string | null
          status: string
          subtotal: number
          tax_amount: number
          total: number
          updated_at: string
          voided_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "pos_sales"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      pos_refund_sale_allocated: {
        Args: {
          _amount: number
          _membership_id: string
          _payment_id: string
          _reason: string
          _restaurant_id: string
          _sale_id: string
          _shift_id: string
        }
        Returns: {
          business_date: string
          cashier_name_snapshot: string | null
          completed_at: string | null
          completed_by_membership_id: string | null
          created_at: string
          currency_code: string
          customer_reference: string | null
          discount_amount: number
          discount_reason: string | null
          id: string
          note: string | null
          opened_by_membership_id: string
          refunded_amount: number
          register_id: string
          restaurant_id: string
          sale_number: number | null
          sale_reference: string | null
          shift_id: string | null
          status: string
          subtotal: number
          tax_amount: number
          total: number
          updated_at: string
          voided_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "pos_sales"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      post_folio_transaction: {
        Args: {
          _amount: number
          _category: string
          _description: string
          _folio_id: string
          _membership_id: string
          _reference_id: string
          _reference_type: string
          _restaurant_id: string
          _type: string
        }
        Returns: {
          amount: number
          category: string
          created_at: string
          description: string
          folio_id: string
          id: string
          payment_method: string | null
          posted_at: string
          posted_by_membership_id: string | null
          reference_id: string | null
          reference_type: string | null
          restaurant_id: string
          transaction_type: string
        }
        SetofOptions: {
          from: "*"
          to: "folio_transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      post_order_room_charge: {
        Args: {
          _folio_id: string
          _membership_id: string
          _order_id: string
          _restaurant_id: string
        }
        Returns: Json
      }
      price_hotel_stay: {
        Args: {
          _arrival: string
          _departure: string
          _rate_plan_id: string
          _restaurant_id: string
          _room_type_id: string
        }
        Returns: Json
      }
      receive_purchase_order_goods: {
        Args: {
          _lines: Json
          _membership_id: string
          _notes?: string
          _purchase_order_id: string
          _restaurant_id: string
        }
        Returns: string
      }
      refund_restaurant_order: {
        Args: {
          _amount: number
          _lines: Json
          _membership_id: string
          _order_id: string
          _payment_id: string
          _reason: string
          _restaurant_id: string
          _shift_id: string
        }
        Returns: {
          amount: number
          authorized_by_membership_id: string | null
          cashier_shift_id: string | null
          created_at: string
          id: string
          method: string
          no_open_shift: boolean
          order_id: string
          payment_id: string | null
          processed_by_membership_id: string | null
          reason: string
          restaurant_id: string
        }
        SetofOptions: {
          from: "*"
          to: "order_refunds"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_pos_order_payment: {
        Args: {
          _amount: number
          _membership_id: string
          _method: string
          _order_id: string
          _reference: string
          _restaurant_id: string
          _shift_id: string
          _tendered: number
        }
        Returns: {
          amount: number
          cashier_shift_id: string | null
          change_amount: number
          created_at: string
          id: string
          membership_id: string | null
          method: string
          order_id: string
          reference: string | null
          restaurant_id: string
          tendered_amount: number | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "order_payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reprice_hotel_reservation: {
        Args: {
          _membership_id: string
          _rate_plan_id: string
          _reservation_id: string
          _restaurant_id: string
        }
        Returns: {
          adults: number
          arrival_date: string
          cancellation_reason: string | null
          children: number
          confirmation_number: string
          created_at: string
          created_by_staff_membership_id: string | null
          currency: string | null
          departure_date: string
          guest_id: string
          id: string
          nightly_rate_snapshot: Json | null
          notes: string | null
          priced_at: string | null
          rate_plan_id: string | null
          restaurant_id: string
          room_id: string | null
          room_subtotal: number | null
          room_type_id: string
          source: string
          special_requests: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "hotel_reservations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reverse_order_room_charge: {
        Args: {
          _membership_id: string
          _order_id: string
          _reason: string
          _restaurant_id: string
        }
        Returns: Json
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
