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
          activated_at: string | null
          channel_type: string
          code: string
          created_at: string
          environment: string
          id: string
          integration_id: string | null
          mapping_status: string
          name: string
          notes: string | null
          restaurant_id: string
          status: string
          sync_active: boolean
          sync_config: Json
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          channel_type?: string
          code: string
          created_at?: string
          environment?: string
          id?: string
          integration_id?: string | null
          mapping_status?: string
          name: string
          notes?: string | null
          restaurant_id: string
          status?: string
          sync_active?: boolean
          sync_config?: Json
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          channel_type?: string
          code?: string
          created_at?: string
          environment?: string
          id?: string
          integration_id?: string | null
          mapping_status?: string
          name?: string
          notes?: string | null
          restaurant_id?: string
          status?: string
          sync_active?: boolean
          sync_config?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "distribution_channels_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "pms_integrations"
            referencedColumns: ["id"]
          },
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
      distribution_meal_mappings: {
        Row: {
          active: boolean
          channel_id: string
          created_at: string
          external_entity_id: string | null
          id: string
          meal_plan_id: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          channel_id: string
          created_at?: string
          external_entity_id?: string | null
          id?: string
          meal_plan_id: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          channel_id?: string
          created_at?: string
          external_entity_id?: string | null
          id?: string
          meal_plan_id?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "distribution_meal_mappings_channel_fk"
            columns: ["channel_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "distribution_channels"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "distribution_meal_mappings_plan_fk"
            columns: ["meal_plan_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_meal_plans"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "distribution_meal_mappings_restaurant_id_fkey"
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
          external_entity_id: string | null
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
          external_entity_id?: string | null
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
          external_entity_id?: string | null
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
          external_entity_id: string | null
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
          external_entity_id?: string | null
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
          external_entity_id?: string | null
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
      fo_checkin_progress: {
        Row: {
          completed_at: string | null
          created_at: string
          deposit_amount: number | null
          deposit_method: string | null
          deposit_transaction_id: string | null
          deposit_waived: boolean
          deposit_waived_at: string | null
          deposit_waived_by: string | null
          deposit_waiver_reason: string | null
          id: string
          key_access_type: string | null
          key_count: number | null
          key_identifier: string | null
          key_issued_at: string | null
          key_issued_by: string | null
          key_waived: boolean
          key_waived_at: string | null
          key_waived_by: string | null
          key_waiver_reason: string | null
          registration_snapshot: Json | null
          registration_waived: boolean
          registration_waived_at: string | null
          registration_waived_by: string | null
          registration_waiver_reason: string | null
          reservation_id: string
          restaurant_id: string
          updated_at: string
          walk_in_incomplete: boolean
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          deposit_amount?: number | null
          deposit_method?: string | null
          deposit_transaction_id?: string | null
          deposit_waived?: boolean
          deposit_waived_at?: string | null
          deposit_waived_by?: string | null
          deposit_waiver_reason?: string | null
          id?: string
          key_access_type?: string | null
          key_count?: number | null
          key_identifier?: string | null
          key_issued_at?: string | null
          key_issued_by?: string | null
          key_waived?: boolean
          key_waived_at?: string | null
          key_waived_by?: string | null
          key_waiver_reason?: string | null
          registration_snapshot?: Json | null
          registration_waived?: boolean
          registration_waived_at?: string | null
          registration_waived_by?: string | null
          registration_waiver_reason?: string | null
          reservation_id: string
          restaurant_id: string
          updated_at?: string
          walk_in_incomplete?: boolean
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          deposit_amount?: number | null
          deposit_method?: string | null
          deposit_transaction_id?: string | null
          deposit_waived?: boolean
          deposit_waived_at?: string | null
          deposit_waived_by?: string | null
          deposit_waiver_reason?: string | null
          id?: string
          key_access_type?: string | null
          key_count?: number | null
          key_identifier?: string | null
          key_issued_at?: string | null
          key_issued_by?: string | null
          key_waived?: boolean
          key_waived_at?: string | null
          key_waived_by?: string | null
          key_waiver_reason?: string | null
          registration_snapshot?: Json | null
          registration_waived?: boolean
          registration_waived_at?: string | null
          registration_waived_by?: string | null
          registration_waiver_reason?: string | null
          reservation_id?: string
          restaurant_id?: string
          updated_at?: string
          walk_in_incomplete?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "fo_checkin_progress_deposit_transaction_id_fkey"
            columns: ["deposit_transaction_id"]
            isOneToOne: false
            referencedRelation: "folio_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fo_checkin_progress_deposit_waived_by_fkey"
            columns: ["deposit_waived_by"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fo_checkin_progress_key_issued_by_fkey"
            columns: ["key_issued_by"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fo_checkin_progress_key_waived_by_fkey"
            columns: ["key_waived_by"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fo_checkin_progress_registration_waived_by_fkey"
            columns: ["registration_waived_by"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fo_checkin_progress_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: true
            referencedRelation: "hotel_reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fo_checkin_progress_reservation_same_property"
            columns: ["reservation_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "hotel_reservations"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "fo_checkin_progress_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      fo_guest_requests: {
        Row: {
          actor_membership_id: string | null
          created_at: string
          id: string
          request_text: string
          reservation_id: string
          restaurant_id: string
          status: string
          updated_at: string
        }
        Insert: {
          actor_membership_id?: string | null
          created_at?: string
          id?: string
          request_text: string
          reservation_id: string
          restaurant_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          actor_membership_id?: string | null
          created_at?: string
          id?: string
          request_text?: string
          reservation_id?: string
          restaurant_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fo_guest_requests_actor_membership_id_fkey"
            columns: ["actor_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fo_guest_requests_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "hotel_reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fo_guest_requests_reservation_same_property"
            columns: ["reservation_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "hotel_reservations"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "fo_guest_requests_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      fo_service_catalogue: {
        Row: {
          active: boolean
          default_amount: number
          id: string
          name: string
          restaurant_id: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          default_amount?: number
          id?: string
          name: string
          restaurant_id: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          default_amount?: number
          id?: string
          name?: string
          restaurant_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "fo_service_catalogue_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      fo_stay_companions: {
        Row: {
          created_at: string
          guest_id: string
          id: string
          reservation_id: string
          restaurant_id: string
        }
        Insert: {
          created_at?: string
          guest_id: string
          id?: string
          reservation_id: string
          restaurant_id: string
        }
        Update: {
          created_at?: string
          guest_id?: string
          id?: string
          reservation_id?: string
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fo_stay_companions_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guest_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fo_stay_companions_guest_same_property"
            columns: ["guest_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "guest_profiles"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "fo_stay_companions_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "hotel_reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fo_stay_companions_reservation_same_property"
            columns: ["reservation_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "hotel_reservations"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "fo_stay_companions_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
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
      guest_account_history: {
        Row: {
          actor_membership_id: string | null
          created_at: string
          event_type: string
          id: string
          master_id: string
          new_values: Json | null
          notes: string | null
          previous_values: Json | null
          restaurant_id: string
        }
        Insert: {
          actor_membership_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          master_id: string
          new_values?: Json | null
          notes?: string | null
          previous_values?: Json | null
          restaurant_id: string
        }
        Update: {
          actor_membership_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          master_id?: string
          new_values?: Json | null
          notes?: string | null
          previous_values?: Json | null
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_account_history_actor_membership_id_fkey"
            columns: ["actor_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_account_history_master_same_property"
            columns: ["master_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "guest_account_masters"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "guest_account_history_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_account_links: {
        Row: {
          created_at: string
          created_by_staff_membership_id: string | null
          guest_id: string
          id: string
          master_id: string
          member_status: string | null
          reservation_id: string | null
          restaurant_id: string
          role: string
          special_requests: string | null
        }
        Insert: {
          created_at?: string
          created_by_staff_membership_id?: string | null
          guest_id: string
          id?: string
          master_id: string
          member_status?: string | null
          reservation_id?: string | null
          restaurant_id: string
          role: string
          special_requests?: string | null
        }
        Update: {
          created_at?: string
          created_by_staff_membership_id?: string | null
          guest_id?: string
          id?: string
          master_id?: string
          member_status?: string | null
          reservation_id?: string | null
          restaurant_id?: string
          role?: string
          special_requests?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guest_account_links_created_by_staff_membership_id_fkey"
            columns: ["created_by_staff_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_account_links_guest_same_property"
            columns: ["guest_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "guest_profiles"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "guest_account_links_master_same_property"
            columns: ["master_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "guest_account_masters"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "guest_account_links_reservation_fk"
            columns: ["reservation_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "hotel_reservations"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "guest_account_links_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_account_masters: {
        Row: {
          account_operations: Json
          account_status: string
          account_type: string
          address_line1: string | null
          address_line2: string | null
          agency_type: string | null
          agency_type_other: string | null
          anonymised_at: string | null
          anonymised_by_membership_id: string | null
          arrival_date: string | null
          billing_contact_name: string | null
          billing_instruction: string | null
          booking_access: string
          business_profile_type_id: string | null
          business_registration_number: string | null
          city: string | null
          code: string | null
          commission_currency_note: string | null
          commission_label: string | null
          commission_type: string | null
          company_master_id: string | null
          company_type: string | null
          company_type_other: string | null
          contract_end_date: string | null
          contract_reference: string | null
          contract_signed_with: string | null
          contract_start_date: string | null
          contract_status: string | null
          corporate_account_reference: string | null
          country: string | null
          created_at: string
          created_by_staff_membership_id: string | null
          credit_account_enabled: boolean
          credit_limit_amount: number | null
          credit_limit_note: string | null
          default_travel_agent_master_id: string | null
          departure_date: string | null
          email: string | null
          email_alt: string | null
          email_normalized: string | null
          expected_pax: number | null
          expected_rooms: number | null
          group_bookings_allowed: boolean
          group_operations: Json
          group_type_id: string | null
          iata_license_number: string | null
          id: string
          license_expiry_date: string | null
          logo_storage_path: string | null
          market_segment_id: string | null
          max_advance_booking_days: number | null
          max_stay_nights: number | null
          min_stay_nights: number | null
          name: string
          negotiated_rate_reference: string | null
          notes: string | null
          payment_terms: string | null
          phone: string | null
          phone_alt: string | null
          phone_normalized: string | null
          postal_code: string | null
          preferred_currency: string | null
          primary_contact_guest_id: string | null
          primary_contact_name: string | null
          primary_contact_title: string | null
          region: string | null
          restaurant_id: string
          source_code_id: string | null
          source_of_business: string | null
          special_requests: string | null
          tax_id: string | null
          trade_name: string | null
          travel_agent_master_id: string | null
          updated_at: string
          updated_by_staff_membership_id: string | null
          website: string | null
        }
        Insert: {
          account_operations?: Json
          account_status?: string
          account_type: string
          address_line1?: string | null
          address_line2?: string | null
          agency_type?: string | null
          agency_type_other?: string | null
          anonymised_at?: string | null
          anonymised_by_membership_id?: string | null
          arrival_date?: string | null
          billing_contact_name?: string | null
          billing_instruction?: string | null
          booking_access?: string
          business_profile_type_id?: string | null
          business_registration_number?: string | null
          city?: string | null
          code?: string | null
          commission_currency_note?: string | null
          commission_label?: string | null
          commission_type?: string | null
          company_master_id?: string | null
          company_type?: string | null
          company_type_other?: string | null
          contract_end_date?: string | null
          contract_reference?: string | null
          contract_signed_with?: string | null
          contract_start_date?: string | null
          contract_status?: string | null
          corporate_account_reference?: string | null
          country?: string | null
          created_at?: string
          created_by_staff_membership_id?: string | null
          credit_account_enabled?: boolean
          credit_limit_amount?: number | null
          credit_limit_note?: string | null
          default_travel_agent_master_id?: string | null
          departure_date?: string | null
          email?: string | null
          email_alt?: string | null
          email_normalized?: string | null
          expected_pax?: number | null
          expected_rooms?: number | null
          group_bookings_allowed?: boolean
          group_operations?: Json
          group_type_id?: string | null
          iata_license_number?: string | null
          id?: string
          license_expiry_date?: string | null
          logo_storage_path?: string | null
          market_segment_id?: string | null
          max_advance_booking_days?: number | null
          max_stay_nights?: number | null
          min_stay_nights?: number | null
          name: string
          negotiated_rate_reference?: string | null
          notes?: string | null
          payment_terms?: string | null
          phone?: string | null
          phone_alt?: string | null
          phone_normalized?: string | null
          postal_code?: string | null
          preferred_currency?: string | null
          primary_contact_guest_id?: string | null
          primary_contact_name?: string | null
          primary_contact_title?: string | null
          region?: string | null
          restaurant_id: string
          source_code_id?: string | null
          source_of_business?: string | null
          special_requests?: string | null
          tax_id?: string | null
          trade_name?: string | null
          travel_agent_master_id?: string | null
          updated_at?: string
          updated_by_staff_membership_id?: string | null
          website?: string | null
        }
        Update: {
          account_operations?: Json
          account_status?: string
          account_type?: string
          address_line1?: string | null
          address_line2?: string | null
          agency_type?: string | null
          agency_type_other?: string | null
          anonymised_at?: string | null
          anonymised_by_membership_id?: string | null
          arrival_date?: string | null
          billing_contact_name?: string | null
          billing_instruction?: string | null
          booking_access?: string
          business_profile_type_id?: string | null
          business_registration_number?: string | null
          city?: string | null
          code?: string | null
          commission_currency_note?: string | null
          commission_label?: string | null
          commission_type?: string | null
          company_master_id?: string | null
          company_type?: string | null
          company_type_other?: string | null
          contract_end_date?: string | null
          contract_reference?: string | null
          contract_signed_with?: string | null
          contract_start_date?: string | null
          contract_status?: string | null
          corporate_account_reference?: string | null
          country?: string | null
          created_at?: string
          created_by_staff_membership_id?: string | null
          credit_account_enabled?: boolean
          credit_limit_amount?: number | null
          credit_limit_note?: string | null
          default_travel_agent_master_id?: string | null
          departure_date?: string | null
          email?: string | null
          email_alt?: string | null
          email_normalized?: string | null
          expected_pax?: number | null
          expected_rooms?: number | null
          group_bookings_allowed?: boolean
          group_operations?: Json
          group_type_id?: string | null
          iata_license_number?: string | null
          id?: string
          license_expiry_date?: string | null
          logo_storage_path?: string | null
          market_segment_id?: string | null
          max_advance_booking_days?: number | null
          max_stay_nights?: number | null
          min_stay_nights?: number | null
          name?: string
          negotiated_rate_reference?: string | null
          notes?: string | null
          payment_terms?: string | null
          phone?: string | null
          phone_alt?: string | null
          phone_normalized?: string | null
          postal_code?: string | null
          preferred_currency?: string | null
          primary_contact_guest_id?: string | null
          primary_contact_name?: string | null
          primary_contact_title?: string | null
          region?: string | null
          restaurant_id?: string
          source_code_id?: string | null
          source_of_business?: string | null
          special_requests?: string | null
          tax_id?: string | null
          trade_name?: string | null
          travel_agent_master_id?: string | null
          updated_at?: string
          updated_by_staff_membership_id?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guest_account_masters_anonymised_by_membership_id_fkey"
            columns: ["anonymised_by_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_account_masters_business_profile_type_id_fkey"
            columns: ["business_profile_type_id"]
            isOneToOne: false
            referencedRelation: "pms_business_profile_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_account_masters_company_master_fk"
            columns: ["company_master_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "guest_account_masters"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "guest_account_masters_created_by_staff_membership_id_fkey"
            columns: ["created_by_staff_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_account_masters_default_ta_same_property"
            columns: ["default_travel_agent_master_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "guest_account_masters"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "guest_account_masters_group_type_fk"
            columns: ["group_type_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_group_types"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "guest_account_masters_market_segment_fk"
            columns: ["market_segment_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_market_segments"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "guest_account_masters_primary_contact_guest_fk"
            columns: ["primary_contact_guest_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "guest_profiles"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "guest_account_masters_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_account_masters_source_code_fk"
            columns: ["source_code_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_source_codes"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "guest_account_masters_travel_agent_master_fk"
            columns: ["travel_agent_master_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "guest_account_masters"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "guest_account_masters_updated_by_fk"
            columns: ["updated_by_staff_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_company_contact_roles: {
        Row: {
          contact_id: string
          role_id: string
        }
        Insert: {
          contact_id: string
          role_id: string
        }
        Update: {
          contact_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_company_contact_roles_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "guest_company_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_company_contact_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "pms_business_contact_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_company_contacts: {
        Row: {
          code: string | null
          company_master_id: string
          created_at: string
          department_id: string | null
          email: string | null
          email_normalized: string | null
          id: string
          is_primary: boolean
          name: string
          notes: string | null
          phone: string | null
          phone_normalized: string | null
          photo_storage_path: string | null
          position: string | null
          restaurant_id: string
          status: string
          updated_at: string
          whatsapp: string | null
          whatsapp_normalized: string | null
        }
        Insert: {
          code?: string | null
          company_master_id: string
          created_at?: string
          department_id?: string | null
          email?: string | null
          email_normalized?: string | null
          id?: string
          is_primary?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          phone_normalized?: string | null
          photo_storage_path?: string | null
          position?: string | null
          restaurant_id: string
          status?: string
          updated_at?: string
          whatsapp?: string | null
          whatsapp_normalized?: string | null
        }
        Update: {
          code?: string | null
          company_master_id?: string
          created_at?: string
          department_id?: string | null
          email?: string | null
          email_normalized?: string | null
          id?: string
          is_primary?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          phone_normalized?: string | null
          photo_storage_path?: string | null
          position?: string | null
          restaurant_id?: string
          status?: string
          updated_at?: string
          whatsapp?: string | null
          whatsapp_normalized?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guest_company_contacts_company_same_property"
            columns: ["company_master_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "guest_account_masters"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "guest_company_contacts_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "pms_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_company_contacts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_company_documents: {
        Row: {
          company_master_id: string
          created_at: string
          document_type_id: string
          expiry_date: string | null
          id: string
          issue_date: string | null
          name: string
          reference_number: string | null
          restaurant_id: string
          review_note: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by_membership_id: string | null
          storage_path: string | null
          updated_at: string
          uploaded_by_membership_id: string | null
        }
        Insert: {
          company_master_id: string
          created_at?: string
          document_type_id: string
          expiry_date?: string | null
          id?: string
          issue_date?: string | null
          name: string
          reference_number?: string | null
          restaurant_id: string
          review_note?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by_membership_id?: string | null
          storage_path?: string | null
          updated_at?: string
          uploaded_by_membership_id?: string | null
        }
        Update: {
          company_master_id?: string
          created_at?: string
          document_type_id?: string
          expiry_date?: string | null
          id?: string
          issue_date?: string | null
          name?: string
          reference_number?: string | null
          restaurant_id?: string
          review_note?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by_membership_id?: string | null
          storage_path?: string | null
          updated_at?: string
          uploaded_by_membership_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guest_company_documents_company_same_property"
            columns: ["company_master_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "guest_account_masters"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "guest_company_documents_document_type_id_fkey"
            columns: ["document_type_id"]
            isOneToOne: false
            referencedRelation: "pms_company_document_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_company_documents_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_documents: {
        Row: {
          back_storage_path: string | null
          created_at: string
          document_number: string | null
          expiry_date: string | null
          guest_id: string
          id: string
          id_type_id: string | null
          issue_date: string | null
          issuing_authority: string | null
          issuing_country: string | null
          kind: string
          mime_type: string | null
          notes: string | null
          rejection_reason: string | null
          restaurant_id: string
          size_bytes: number | null
          storage_path: string | null
          updated_at: string
          uploaded_by_membership_id: string | null
          verification_status: string
          verified_at: string | null
          verified_by_membership_id: string | null
        }
        Insert: {
          back_storage_path?: string | null
          created_at?: string
          document_number?: string | null
          expiry_date?: string | null
          guest_id: string
          id?: string
          id_type_id?: string | null
          issue_date?: string | null
          issuing_authority?: string | null
          issuing_country?: string | null
          kind?: string
          mime_type?: string | null
          notes?: string | null
          rejection_reason?: string | null
          restaurant_id: string
          size_bytes?: number | null
          storage_path?: string | null
          updated_at?: string
          uploaded_by_membership_id?: string | null
          verification_status?: string
          verified_at?: string | null
          verified_by_membership_id?: string | null
        }
        Update: {
          back_storage_path?: string | null
          created_at?: string
          document_number?: string | null
          expiry_date?: string | null
          guest_id?: string
          id?: string
          id_type_id?: string | null
          issue_date?: string | null
          issuing_authority?: string | null
          issuing_country?: string | null
          kind?: string
          mime_type?: string | null
          notes?: string | null
          rejection_reason?: string | null
          restaurant_id?: string
          size_bytes?: number | null
          storage_path?: string | null
          updated_at?: string
          uploaded_by_membership_id?: string | null
          verification_status?: string
          verified_at?: string | null
          verified_by_membership_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guest_documents_id_type_id_fkey"
            columns: ["id_type_id"]
            isOneToOne: false
            referencedRelation: "pms_guest_id_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_documents_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_documents_same_property"
            columns: ["guest_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "guest_profiles"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "guest_documents_uploaded_by_membership_id_fkey"
            columns: ["uploaded_by_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_documents_verified_by_membership_id_fkey"
            columns: ["verified_by_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_emergency_contacts: {
        Row: {
          created_at: string
          email: string | null
          guest_id: string
          id: string
          name: string
          phone: string | null
          relationship: string | null
          restaurant_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          guest_id: string
          id?: string
          name: string
          phone?: string | null
          relationship?: string | null
          restaurant_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          guest_id?: string
          id?: string
          name?: string
          phone?: string | null
          relationship?: string | null
          restaurant_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_emergency_contacts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_emergency_contacts_same_property"
            columns: ["guest_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "guest_profiles"
            referencedColumns: ["id", "restaurant_id"]
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
      guest_merge_ledger: {
        Row: {
          created_at: string
          created_by_staff_membership_id: string | null
          id: string
          payload: Json
          restaurant_id: string
          retired_id: string
          reverted_at: string | null
          survivor_id: string
        }
        Insert: {
          created_at?: string
          created_by_staff_membership_id?: string | null
          id?: string
          payload: Json
          restaurant_id: string
          retired_id: string
          reverted_at?: string | null
          survivor_id: string
        }
        Update: {
          created_at?: string
          created_by_staff_membership_id?: string | null
          id?: string
          payload?: Json
          restaurant_id?: string
          retired_id?: string
          reverted_at?: string | null
          survivor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_merge_ledger_created_by_staff_membership_id_fkey"
            columns: ["created_by_staff_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_merge_ledger_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_merge_ledger_retired_same_property"
            columns: ["retired_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "guest_profiles"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "guest_merge_ledger_survivor_same_property"
            columns: ["survivor_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "guest_profiles"
            referencedColumns: ["id", "restaurant_id"]
          },
        ]
      }
      guest_preference_values: {
        Row: {
          created_at: string
          guest_id: string
          id: string
          preference_type_id: string
          restaurant_id: string
          updated_at: string
          value_json: Json
        }
        Insert: {
          created_at?: string
          guest_id: string
          id?: string
          preference_type_id: string
          restaurant_id: string
          updated_at?: string
          value_json?: Json
        }
        Update: {
          created_at?: string
          guest_id?: string
          id?: string
          preference_type_id?: string
          restaurant_id?: string
          updated_at?: string
          value_json?: Json
        }
        Relationships: [
          {
            foreignKeyName: "guest_preference_values_guest_fk"
            columns: ["guest_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "guest_profiles"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "guest_preference_values_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_preference_values_type_fk"
            columns: ["preference_type_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_guest_preference_types"
            referencedColumns: ["id", "restaurant_id"]
          },
        ]
      }
      guest_preferences: {
        Row: {
          accessibility_requirements: string | null
          apply_to_future_reservations: boolean
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
          apply_to_future_reservations?: boolean
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
          apply_to_future_reservations?: boolean
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
      guest_profile_counters: {
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
            foreignKeyName: "guest_profile_counters_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
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
          anonymised_at: string | null
          anonymised_by_membership_id: string | null
          blacklisted: boolean
          city: string | null
          country: string | null
          created_at: string
          created_by_staff_membership_id: string | null
          data_processing_consent: string
          data_processing_consent_recorded_at: string | null
          data_processing_consent_recorded_by: string | null
          date_of_birth: string | null
          department: string | null
          email: string | null
          email_alt: string | null
          email_normalized: string | null
          employment_position: string | null
          first_name: string
          gender: string | null
          geo_latitude: number | null
          geo_longitude: number | null
          guest_status: string
          id: string
          id_document_expiry: string | null
          id_document_number: string | null
          id_document_type: string | null
          language: string | null
          last_name: string | null
          linked_customer_user_id: string | null
          marketing_consent: string
          marketing_consent_recorded_at: string | null
          marketing_consent_recorded_by: string | null
          merged_into_guest_id: string | null
          middle_name: string | null
          nationality: string | null
          notes: string | null
          phone: string | null
          phone_alt: string | null
          phone_normalized: string | null
          photo_storage_path: string | null
          postal_code: string | null
          preferred_contact_method: string | null
          preferred_contact_time: string | null
          preferred_name: string | null
          profile_number: string | null
          profile_type_id: string | null
          region: string | null
          restaurant_id: string
          restricted: boolean
          restriction_reason: string | null
          restriction_set_at: string | null
          restriction_set_by_membership_id: string | null
          restriction_severity: string | null
          restriction_until: string | null
          source_of_business: string | null
          title: string | null
          updated_at: string
          vip_status: boolean
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          anonymised_at?: string | null
          anonymised_by_membership_id?: string | null
          blacklisted?: boolean
          city?: string | null
          country?: string | null
          created_at?: string
          created_by_staff_membership_id?: string | null
          data_processing_consent?: string
          data_processing_consent_recorded_at?: string | null
          data_processing_consent_recorded_by?: string | null
          date_of_birth?: string | null
          department?: string | null
          email?: string | null
          email_alt?: string | null
          email_normalized?: string | null
          employment_position?: string | null
          first_name: string
          gender?: string | null
          geo_latitude?: number | null
          geo_longitude?: number | null
          guest_status?: string
          id?: string
          id_document_expiry?: string | null
          id_document_number?: string | null
          id_document_type?: string | null
          language?: string | null
          last_name?: string | null
          linked_customer_user_id?: string | null
          marketing_consent?: string
          marketing_consent_recorded_at?: string | null
          marketing_consent_recorded_by?: string | null
          merged_into_guest_id?: string | null
          middle_name?: string | null
          nationality?: string | null
          notes?: string | null
          phone?: string | null
          phone_alt?: string | null
          phone_normalized?: string | null
          photo_storage_path?: string | null
          postal_code?: string | null
          preferred_contact_method?: string | null
          preferred_contact_time?: string | null
          preferred_name?: string | null
          profile_number?: string | null
          profile_type_id?: string | null
          region?: string | null
          restaurant_id: string
          restricted?: boolean
          restriction_reason?: string | null
          restriction_set_at?: string | null
          restriction_set_by_membership_id?: string | null
          restriction_severity?: string | null
          restriction_until?: string | null
          source_of_business?: string | null
          title?: string | null
          updated_at?: string
          vip_status?: boolean
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          anonymised_at?: string | null
          anonymised_by_membership_id?: string | null
          blacklisted?: boolean
          city?: string | null
          country?: string | null
          created_at?: string
          created_by_staff_membership_id?: string | null
          data_processing_consent?: string
          data_processing_consent_recorded_at?: string | null
          data_processing_consent_recorded_by?: string | null
          date_of_birth?: string | null
          department?: string | null
          email?: string | null
          email_alt?: string | null
          email_normalized?: string | null
          employment_position?: string | null
          first_name?: string
          gender?: string | null
          geo_latitude?: number | null
          geo_longitude?: number | null
          guest_status?: string
          id?: string
          id_document_expiry?: string | null
          id_document_number?: string | null
          id_document_type?: string | null
          language?: string | null
          last_name?: string | null
          linked_customer_user_id?: string | null
          marketing_consent?: string
          marketing_consent_recorded_at?: string | null
          marketing_consent_recorded_by?: string | null
          merged_into_guest_id?: string | null
          middle_name?: string | null
          nationality?: string | null
          notes?: string | null
          phone?: string | null
          phone_alt?: string | null
          phone_normalized?: string | null
          photo_storage_path?: string | null
          postal_code?: string | null
          preferred_contact_method?: string | null
          preferred_contact_time?: string | null
          preferred_name?: string | null
          profile_number?: string | null
          profile_type_id?: string | null
          region?: string | null
          restaurant_id?: string
          restricted?: boolean
          restriction_reason?: string | null
          restriction_set_at?: string | null
          restriction_set_by_membership_id?: string | null
          restriction_severity?: string | null
          restriction_until?: string | null
          source_of_business?: string | null
          title?: string | null
          updated_at?: string
          vip_status?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "guest_profiles_anonymised_by_membership_id_fkey"
            columns: ["anonymised_by_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_profiles_created_by_staff_membership_id_fkey"
            columns: ["created_by_staff_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_profiles_data_processing_consent_recorded_by_fkey"
            columns: ["data_processing_consent_recorded_by"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_profiles_marketing_consent_recorded_by_fkey"
            columns: ["marketing_consent_recorded_by"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_profiles_merged_same_property"
            columns: ["merged_into_guest_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "guest_profiles"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "guest_profiles_profile_type_fk"
            columns: ["profile_type_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_guest_profile_types"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "guest_profiles_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_profiles_restriction_set_by_membership_id_fkey"
            columns: ["restriction_set_by_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_service_counters: {
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
            foreignKeyName: "guest_service_counters_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_service_history: {
        Row: {
          amount: number | null
          assigned_membership_id: string | null
          cancelled_at: string | null
          completed_at: string | null
          created_at: string
          created_by_membership_id: string | null
          currency: string | null
          guest_id: string
          id: string
          notes: string | null
          preferred_at: string | null
          priority: string
          request_number: string | null
          requested_at: string
          reservation_id: string | null
          restaurant_id: string
          service_type_id: string
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number | null
          assigned_membership_id?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          created_by_membership_id?: string | null
          currency?: string | null
          guest_id: string
          id?: string
          notes?: string | null
          preferred_at?: string | null
          priority?: string
          request_number?: string | null
          requested_at?: string
          reservation_id?: string | null
          restaurant_id: string
          service_type_id: string
          status: string
          updated_at?: string
        }
        Update: {
          amount?: number | null
          assigned_membership_id?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          created_by_membership_id?: string | null
          currency?: string | null
          guest_id?: string
          id?: string
          notes?: string | null
          preferred_at?: string | null
          priority?: string
          request_number?: string | null
          requested_at?: string
          reservation_id?: string | null
          restaurant_id?: string
          service_type_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_service_history_assigned_membership_id_fkey"
            columns: ["assigned_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_service_history_created_by_membership_id_fkey"
            columns: ["created_by_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_service_history_guest_fk"
            columns: ["guest_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "guest_profiles"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "guest_service_history_reservation_fk"
            columns: ["reservation_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "hotel_reservations"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "guest_service_history_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_service_history_type_fk"
            columns: ["service_type_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_guest_service_types"
            referencedColumns: ["id", "restaurant_id"]
          },
        ]
      }
      hotel_buildings: {
        Row: {
          active: boolean
          building_type: string | null
          code: string
          created_at: string
          description: string | null
          floor_count: number | null
          id: string
          location: string | null
          name: string
          restaurant_id: string
          status: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          building_type?: string | null
          code: string
          created_at?: string
          description?: string | null
          floor_count?: number | null
          id?: string
          location?: string | null
          name: string
          restaurant_id: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          building_type?: string | null
          code?: string
          created_at?: string
          description?: string | null
          floor_count?: number | null
          id?: string
          location?: string | null
          name?: string
          restaurant_id?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotel_buildings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      hotel_floors: {
        Row: {
          active: boolean
          building_id: string
          code: string
          created_at: string
          description: string | null
          floor_number: number | null
          id: string
          name: string
          restaurant_id: string
          status: string | null
          updated_at: string
          wing_id: string | null
        }
        Insert: {
          active?: boolean
          building_id: string
          code: string
          created_at?: string
          description?: string | null
          floor_number?: number | null
          id?: string
          name: string
          restaurant_id: string
          status?: string | null
          updated_at?: string
          wing_id?: string | null
        }
        Update: {
          active?: boolean
          building_id?: string
          code?: string
          created_at?: string
          description?: string | null
          floor_number?: number | null
          id?: string
          name?: string
          restaurant_id?: string
          status?: string | null
          updated_at?: string
          wing_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hotel_floors_building_fk"
            columns: ["building_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "hotel_buildings"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "hotel_floors_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_floors_wing_fk"
            columns: ["wing_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "hotel_wings"
            referencedColumns: ["id", "restaurant_id"]
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
          commercial_booking_source: string | null
          company_master_id: string | null
          company_name: string | null
          confirmation_number: string
          created_at: string
          created_by_staff_membership_id: string | null
          currency: string | null
          departure_date: string
          expected_arrival_at: string | null
          external_reference: string | null
          group_account_master_id: string | null
          group_name: string | null
          guarantee_method: string | null
          guest_id: string
          id: string
          late_checkout_granted: boolean
          late_checkout_note: string | null
          late_checkout_until: string | null
          market_segment: string | null
          nightly_rate_snapshot: Json | null
          notes: string | null
          priced_at: string | null
          pms_group_block_id: string | null
          pms_group_id: string | null
          rate_plan_id: string | null
          restaurant_id: string
          room_id: string | null
          room_subtotal: number | null
          room_type_id: string
          source: string
          special_request_category: string | null
          special_requests: string | null
          status: string
          travel_agent_master_id: string | null
          updated_at: string
        }
        Insert: {
          adults?: number
          arrival_date: string
          cancellation_reason?: string | null
          children?: number
          commercial_booking_source?: string | null
          company_master_id?: string | null
          company_name?: string | null
          confirmation_number: string
          created_at?: string
          created_by_staff_membership_id?: string | null
          currency?: string | null
          departure_date: string
          expected_arrival_at?: string | null
          external_reference?: string | null
          group_account_master_id?: string | null
          group_name?: string | null
          guarantee_method?: string | null
          guest_id: string
          id?: string
          late_checkout_granted?: boolean
          late_checkout_note?: string | null
          late_checkout_until?: string | null
          market_segment?: string | null
          nightly_rate_snapshot?: Json | null
          notes?: string | null
          priced_at?: string | null
          pms_group_block_id?: string | null
          pms_group_id?: string | null
          rate_plan_id?: string | null
          restaurant_id: string
          room_id?: string | null
          room_subtotal?: number | null
          room_type_id: string
          source?: string
          special_request_category?: string | null
          special_requests?: string | null
          status?: string
          travel_agent_master_id?: string | null
          updated_at?: string
        }
        Update: {
          adults?: number
          arrival_date?: string
          cancellation_reason?: string | null
          children?: number
          commercial_booking_source?: string | null
          company_master_id?: string | null
          company_name?: string | null
          confirmation_number?: string
          created_at?: string
          created_by_staff_membership_id?: string | null
          currency?: string | null
          departure_date?: string
          expected_arrival_at?: string | null
          external_reference?: string | null
          group_account_master_id?: string | null
          group_name?: string | null
          guarantee_method?: string | null
          guest_id?: string
          id?: string
          late_checkout_granted?: boolean
          late_checkout_note?: string | null
          late_checkout_until?: string | null
          market_segment?: string | null
          nightly_rate_snapshot?: Json | null
          notes?: string | null
          priced_at?: string | null
          pms_group_block_id?: string | null
          pms_group_id?: string | null
          rate_plan_id?: string | null
          restaurant_id?: string
          room_id?: string | null
          room_subtotal?: number | null
          room_type_id?: string
          source?: string
          special_request_category?: string | null
          special_requests?: string | null
          status?: string
          travel_agent_master_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotel_reservations_company_master_same_property"
            columns: ["company_master_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "guest_account_masters"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "hotel_reservations_created_by_staff_membership_id_fkey"
            columns: ["created_by_staff_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_reservations_group_account_master_same_property"
            columns: ["group_account_master_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "guest_account_masters"
            referencedColumns: ["id", "restaurant_id"]
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
            foreignKeyName: "hotel_reservations_travel_agent_master_same_property"
            columns: ["travel_agent_master_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "guest_account_masters"
            referencedColumns: ["id", "restaurant_id"]
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
      hotel_room_amenity_overrides: {
        Row: {
          amenity_id: string
          created_at: string
          id: string
          kind: string
          restaurant_id: string
          room_id: string
        }
        Insert: {
          amenity_id: string
          created_at?: string
          id?: string
          kind: string
          restaurant_id: string
          room_id: string
        }
        Update: {
          amenity_id?: string
          created_at?: string
          id?: string
          kind?: string
          restaurant_id?: string
          room_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotel_room_amenity_overrides_amenity_fk"
            columns: ["amenity_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "room_amenities"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "hotel_room_amenity_overrides_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_room_amenity_overrides_room_fk"
            columns: ["room_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "hotel_rooms"
            referencedColumns: ["id", "restaurant_id"]
          },
        ]
      }
      hotel_room_links: {
        Row: {
          created_at: string
          id: string
          kind: string
          other_room_id: string
          restaurant_id: string
          room_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          other_room_id: string
          restaurant_id: string
          room_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          other_room_id?: string
          restaurant_id?: string
          room_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotel_room_links_other_fk"
            columns: ["other_room_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "hotel_rooms"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "hotel_room_links_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_room_links_room_fk"
            columns: ["room_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "hotel_rooms"
            referencedColumns: ["id", "restaurant_id"]
          },
        ]
      }
      hotel_rooms: {
        Row: {
          accessible: boolean
          active: boolean
          building: string | null
          building_id: string | null
          created_at: string
          created_by_staff_membership_id: string | null
          floor: string | null
          floor_id: string | null
          housekeeping_status: string
          id: string
          maintenance_status: string
          notes: string | null
          restaurant_id: string
          restriction_approved_by_membership_id: string | null
          restriction_expected_return: string | null
          restriction_maintenance_request_id: string | null
          restriction_placed_at: string | null
          restriction_placed_by_membership_id: string | null
          restriction_reason: string | null
          room_code: string | null
          room_features: string[]
          room_number: string
          room_type_id: string
          sellable: boolean
          smoking: boolean
          status: string
          updated_at: string
          wing: string | null
          wing_id: string | null
        }
        Insert: {
          accessible?: boolean
          active?: boolean
          building?: string | null
          building_id?: string | null
          created_at?: string
          created_by_staff_membership_id?: string | null
          floor?: string | null
          floor_id?: string | null
          housekeeping_status?: string
          id?: string
          maintenance_status?: string
          notes?: string | null
          restaurant_id: string
          restriction_approved_by_membership_id?: string | null
          restriction_expected_return?: string | null
          restriction_maintenance_request_id?: string | null
          restriction_placed_at?: string | null
          restriction_placed_by_membership_id?: string | null
          restriction_reason?: string | null
          room_code?: string | null
          room_features?: string[]
          room_number: string
          room_type_id: string
          sellable?: boolean
          smoking?: boolean
          status?: string
          updated_at?: string
          wing?: string | null
          wing_id?: string | null
        }
        Update: {
          accessible?: boolean
          active?: boolean
          building?: string | null
          building_id?: string | null
          created_at?: string
          created_by_staff_membership_id?: string | null
          floor?: string | null
          floor_id?: string | null
          housekeeping_status?: string
          id?: string
          maintenance_status?: string
          notes?: string | null
          restaurant_id?: string
          restriction_approved_by_membership_id?: string | null
          restriction_expected_return?: string | null
          restriction_maintenance_request_id?: string | null
          restriction_placed_at?: string | null
          restriction_placed_by_membership_id?: string | null
          restriction_reason?: string | null
          room_code?: string | null
          room_features?: string[]
          room_number?: string
          room_type_id?: string
          sellable?: boolean
          smoking?: boolean
          status?: string
          updated_at?: string
          wing?: string | null
          wing_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hotel_rooms_building_fk"
            columns: ["building_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "hotel_buildings"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "hotel_rooms_created_by_staff_membership_id_fkey"
            columns: ["created_by_staff_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_rooms_floor_fk"
            columns: ["floor_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "hotel_floors"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "hotel_rooms_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_rooms_restriction_approved_by_fk"
            columns: ["restriction_approved_by_membership_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "hotel_rooms_restriction_maintenance_request_fk"
            columns: ["restriction_maintenance_request_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "housekeeping_maintenance_requests"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "hotel_rooms_restriction_placed_by_fk"
            columns: ["restriction_placed_by_membership_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "hotel_rooms_type_same_property"
            columns: ["room_type_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "hotel_rooms_wing_fk"
            columns: ["wing_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "hotel_wings"
            referencedColumns: ["id", "restaurant_id"]
          },
        ]
      }
      hotel_wings: {
        Row: {
          active: boolean
          code: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          parent_building_id: string | null
          parent_floor_id: string | null
          restaurant_id: string
          status: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          parent_building_id?: string | null
          parent_floor_id?: string | null
          restaurant_id: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          parent_building_id?: string | null
          parent_floor_id?: string | null
          restaurant_id?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotel_wings_building_fk"
            columns: ["parent_building_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "hotel_buildings"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "hotel_wings_floor_fk"
            columns: ["parent_floor_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "hotel_floors"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "hotel_wings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
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
      order_adjustments: {
        Row: {
          actor_membership_id: string | null
          amount: number
          created_at: string
          id: string
          kind: string
          order_id: string
          payable_now: number | null
          payable_was: number | null
          payload: Json
          reason: string
          restaurant_id: string
        }
        Insert: {
          actor_membership_id?: string | null
          amount?: number
          created_at?: string
          id?: string
          kind: string
          order_id: string
          payable_now?: number | null
          payable_was?: number | null
          payload?: Json
          reason: string
          restaurant_id: string
        }
        Update: {
          actor_membership_id?: string | null
          amount?: number
          created_at?: string
          id?: string
          kind?: string
          order_id?: string
          payable_now?: number | null
          payable_was?: number | null
          payload?: Json
          reason?: string
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_adjustments_actor_membership_id_fkey"
            columns: ["actor_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_adjustments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_adjustments_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          comp_amount: number
          comp_reason: string | null
          comped: boolean
          comped_at: string | null
          comped_by_membership_id: string | null
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
          comp_amount?: number
          comp_reason?: string | null
          comped?: boolean
          comped_at?: string | null
          comped_by_membership_id?: string | null
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
          comp_amount?: number
          comp_reason?: string | null
          comped?: boolean
          comped_at?: string | null
          comped_by_membership_id?: string | null
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
            foreignKeyName: "order_items_comped_by_membership_id_fkey"
            columns: ["comped_by_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
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
      order_receipts: {
        Row: {
          created_at: string
          id: string
          last_reprinted_at: string | null
          order_id: string
          reprint_count: number
          restaurant_id: string
          snapshot: Json
        }
        Insert: {
          created_at?: string
          id?: string
          last_reprinted_at?: string | null
          order_id: string
          reprint_count?: number
          restaurant_id: string
          snapshot: Json
        }
        Update: {
          created_at?: string
          id?: string
          last_reprinted_at?: string | null
          order_id?: string
          reprint_count?: number
          restaurant_id?: string
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "order_receipts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_receipts_restaurant_id_fkey"
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
          check_comped: boolean
          comp_amount: number
          created_at: string
          created_by_staff_membership_id: string | null
          created_by_staff_name_snapshot: string | null
          customer_id: string | null
          discount_amount: number
          discount_applied_at: string | null
          discount_applied_by_membership_id: string | null
          discount_reason: string | null
          discount_type: string | null
          discount_value: number | null
          guest_token_hash: string | null
          id: string
          merchandise_subtotal: number | null
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
          service_amount: number | null
          service_enabled_snapshot: boolean | null
          service_rate_snapshot: number | null
          status: string
          table_number: string
          tax_amount: number | null
          tax_inclusive_snapshot: boolean | null
          tax_rate_snapshot: number | null
          total: number
          updated_at: string
        }
        Insert: {
          assigned_waiter_membership_id?: string | null
          assigned_waiter_name_snapshot?: string | null
          billing_method?: string | null
          cashier_shift_id?: string | null
          check_comped?: boolean
          comp_amount?: number
          created_at?: string
          created_by_staff_membership_id?: string | null
          created_by_staff_name_snapshot?: string | null
          customer_id?: string | null
          discount_amount?: number
          discount_applied_at?: string | null
          discount_applied_by_membership_id?: string | null
          discount_reason?: string | null
          discount_type?: string | null
          discount_value?: number | null
          guest_token_hash?: string | null
          id?: string
          merchandise_subtotal?: number | null
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
          service_amount?: number | null
          service_enabled_snapshot?: boolean | null
          service_rate_snapshot?: number | null
          status?: string
          table_number: string
          tax_amount?: number | null
          tax_inclusive_snapshot?: boolean | null
          tax_rate_snapshot?: number | null
          total?: number
          updated_at?: string
        }
        Update: {
          assigned_waiter_membership_id?: string | null
          assigned_waiter_name_snapshot?: string | null
          billing_method?: string | null
          cashier_shift_id?: string | null
          check_comped?: boolean
          comp_amount?: number
          created_at?: string
          created_by_staff_membership_id?: string | null
          created_by_staff_name_snapshot?: string | null
          customer_id?: string | null
          discount_amount?: number
          discount_applied_at?: string | null
          discount_applied_by_membership_id?: string | null
          discount_reason?: string | null
          discount_type?: string | null
          discount_value?: number | null
          guest_token_hash?: string | null
          id?: string
          merchandise_subtotal?: number | null
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
          service_amount?: number | null
          service_enabled_snapshot?: boolean | null
          service_rate_snapshot?: number | null
          status?: string
          table_number?: string
          tax_amount?: number | null
          tax_inclusive_snapshot?: boolean | null
          tax_rate_snapshot?: number | null
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
            foreignKeyName: "orders_discount_applied_by_membership_id_fkey"
            columns: ["discount_applied_by_membership_id"]
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
      pms_account_create_drafts: {
        Row: {
          account_kind: string
          created_at: string
          created_by_membership_id: string
          id: string
          payload: Json
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          account_kind: string
          created_at?: string
          created_by_membership_id: string
          id?: string
          payload?: Json
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          account_kind?: string
          created_at?: string
          created_by_membership_id?: string
          id?: string
          payload?: Json
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_account_create_drafts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_account_type_labels: {
        Row: {
          active: boolean
          attrs: Json
          code: string
          created_at: string
          description: string
          id: string
          name: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          attrs?: Json
          code: string
          created_at?: string
          description?: string
          id?: string
          name: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          attrs?: Json
          code?: string
          created_at?: string
          description?: string
          id?: string
          name?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_account_type_labels_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_agency_allotments: {
        Row: {
          agency_master_id: string
          allocated_qty: number
          created_at: string
          end_date: string
          id: string
          notes: string | null
          release_days: number
          restaurant_id: string
          room_type_id: string
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          agency_master_id: string
          allocated_qty: number
          created_at?: string
          end_date: string
          id?: string
          notes?: string | null
          release_days?: number
          restaurant_id: string
          room_type_id: string
          start_date: string
          status?: string
          updated_at?: string
        }
        Update: {
          agency_master_id?: string
          allocated_qty?: number
          created_at?: string
          end_date?: string
          id?: string
          notes?: string | null
          release_days?: number
          restaurant_id?: string
          room_type_id?: string
          start_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_agency_allotments_agency_fk"
            columns: ["agency_master_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "guest_account_masters"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_agency_allotments_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_agency_allotments_room_type_fk"
            columns: ["room_type_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id", "restaurant_id"]
          },
        ]
      }
      pms_agency_allowed_room_types: {
        Row: {
          agency_master_id: string
          created_at: string
          restaurant_id: string
          room_type_id: string
        }
        Insert: {
          agency_master_id: string
          created_at?: string
          restaurant_id: string
          room_type_id: string
        }
        Update: {
          agency_master_id?: string
          created_at?: string
          restaurant_id?: string
          room_type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_agency_allowed_room_types_agency_fk"
            columns: ["agency_master_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "guest_account_masters"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_agency_allowed_room_types_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_agency_allowed_room_types_room_fk"
            columns: ["room_type_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id", "restaurant_id"]
          },
        ]
      }
      pms_agency_commission_entries: {
        Row: {
          agency_master_id: string
          amount: number
          basis_amount: number
          created_at: string
          currency: string
          id: string
          notes: string | null
          plan_id: string | null
          reservation_id: string
          restaurant_id: string
          status: string
          updated_at: string
        }
        Insert: {
          agency_master_id: string
          amount?: number
          basis_amount?: number
          created_at?: string
          currency: string
          id?: string
          notes?: string | null
          plan_id?: string | null
          reservation_id: string
          restaurant_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          agency_master_id?: string
          amount?: number
          basis_amount?: number
          created_at?: string
          currency?: string
          id?: string
          notes?: string | null
          plan_id?: string | null
          reservation_id?: string
          restaurant_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_agency_commission_entries_agency_fk"
            columns: ["agency_master_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "guest_account_masters"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_agency_commission_entries_plan_fk"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "pms_agency_commission_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_agency_commission_entries_reservation_fk"
            columns: ["reservation_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "hotel_reservations"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_agency_commission_entries_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_agency_commission_plans: {
        Row: {
          active: boolean
          agency_master_id: string
          agreement_id: string | null
          commission_type: string
          created_at: string
          currency: string
          effective_on: string
          expires_on: string | null
          id: string
          notes: string | null
          rate_value: number
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          agency_master_id: string
          agreement_id?: string | null
          commission_type: string
          created_at?: string
          currency: string
          effective_on: string
          expires_on?: string | null
          id?: string
          notes?: string | null
          rate_value: number
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          agency_master_id?: string
          agreement_id?: string | null
          commission_type?: string
          created_at?: string
          currency?: string
          effective_on?: string
          expires_on?: string | null
          id?: string
          notes?: string | null
          rate_value?: number
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_agency_commission_plans_agency_fk"
            columns: ["agency_master_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "guest_account_masters"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_agency_commission_plans_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_agency_notification_prefs: {
        Row: {
          agency_master_id: string
          channel: string
          created_at: string
          enabled: boolean
          event_key: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          agency_master_id: string
          channel?: string
          created_at?: string
          enabled?: boolean
          event_key: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          agency_master_id?: string
          channel?: string
          created_at?: string
          enabled?: boolean
          event_key?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_agency_notification_prefs_agency_fk"
            columns: ["agency_master_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "guest_account_masters"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_agency_notification_prefs_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_approval_rules: {
        Row: {
          active: boolean
          approver_role_id: string
          created_at: string
          id: string
          permission_id: string
          restaurant_id: string
          threshold_amount: number | null
          threshold_unit: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          approver_role_id: string
          created_at?: string
          id?: string
          permission_id: string
          restaurant_id: string
          threshold_amount?: number | null
          threshold_unit?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          approver_role_id?: string
          created_at?: string
          id?: string
          permission_id?: string
          restaurant_id?: string
          threshold_amount?: number | null
          threshold_unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_approval_rules_approver_fk"
            columns: ["approver_role_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_hotel_roles"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_approval_rules_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "pms_permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_approval_rules_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_audit_categories: {
        Row: {
          active: boolean
          code: string
          created_at: string
          default_severity: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          default_severity?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          default_severity?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      pms_audit_category_settings: {
        Row: {
          category_id: string
          created_at: string
          critical: boolean
          enabled: boolean
          id: string
          restaurant_id: string
          severity: string | null
          updated_at: string
        }
        Insert: {
          category_id: string
          created_at?: string
          critical?: boolean
          enabled?: boolean
          id?: string
          restaurant_id: string
          severity?: string | null
          updated_at?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          critical?: boolean
          enabled?: boolean
          id?: string
          restaurant_id?: string
          severity?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_audit_category_settings_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "pms_audit_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_audit_category_settings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_audit_policies: {
        Row: {
          active: boolean
          created_at: string
          enabled: boolean
          id: string
          mask_id_numbers: boolean
          restaurant_id: string
          restrict_guest_export: boolean
          retention_days: number | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          enabled?: boolean
          id?: string
          mask_id_numbers?: boolean
          restaurant_id: string
          restrict_guest_export?: boolean
          retention_days?: number | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          enabled?: boolean
          id?: string
          mask_id_numbers?: boolean
          restaurant_id?: string
          restrict_guest_export?: boolean
          retention_days?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_audit_policies_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_audit_sensitive_coverage: {
        Row: {
          coverage: string
          created_at: string
          id: string
          notes: string | null
          permission_id: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          coverage?: string
          created_at?: string
          id?: string
          notes?: string | null
          permission_id: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          coverage?: string
          created_at?: string
          id?: string
          notes?: string | null
          permission_id?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_audit_sensitive_coverage_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "pms_permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_audit_sensitive_coverage_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_billing_rules: {
        Row: {
          active: boolean
          code: string
          created_at: string
          description: string | null
          id: string
          is_default: boolean
          name: string
          payer_kind: string
          payment_terms: string | null
          restaurant_id: string
          split_guest_percent: number | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          name: string
          payer_kind: string
          payment_terms?: string | null
          restaurant_id: string
          split_guest_percent?: number | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          name?: string
          payer_kind?: string
          payment_terms?: string | null
          restaurant_id?: string
          split_guest_percent?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_billing_rules_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_business_contact_roles: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
          name: string
          restaurant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          name: string
          restaurant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
          name?: string
          restaurant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pms_business_contact_roles_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_business_profile_settings: {
        Row: {
          auto_approval: boolean
          created_at: string
          default_business_type_id: string | null
          enabled: boolean
          restaurant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          auto_approval?: boolean
          created_at?: string
          default_business_type_id?: string | null
          enabled?: boolean
          restaurant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          auto_approval?: boolean
          created_at?: string
          default_business_type_id?: string | null
          enabled?: boolean
          restaurant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pms_business_profile_settings_default_business_type_id_fkey"
            columns: ["default_business_type_id"]
            isOneToOne: false
            referencedRelation: "pms_business_profile_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_business_profile_settings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_business_profile_types: {
        Row: {
          active: boolean
          code: string
          contact_required: boolean
          created_at: string
          credit_account_allowed: boolean
          description: string | null
          id: string
          name: string
          required_field_ids: string[]
          restaurant_id: string
          tax_id_required: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          code: string
          contact_required?: boolean
          created_at?: string
          credit_account_allowed?: boolean
          description?: string | null
          id?: string
          name: string
          required_field_ids?: string[]
          restaurant_id: string
          tax_id_required?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          code?: string
          contact_required?: boolean
          created_at?: string
          credit_account_allowed?: boolean
          description?: string | null
          id?: string
          name?: string
          required_field_ids?: string[]
          restaurant_id?: string
          tax_id_required?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pms_business_profile_types_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_commercial_restriction_room_types: {
        Row: {
          created_at: string
          id: string
          restaurant_id: string
          restriction_id: string
          room_type_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          restaurant_id: string
          restriction_id: string
          room_type_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          restaurant_id?: string
          restriction_id?: string
          room_type_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_commercial_restriction_room_types_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_commercial_restriction_room_types_restriction_fk"
            columns: ["restriction_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_commercial_restrictions"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_commercial_restriction_room_types_room_type_fk"
            columns: ["room_type_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id", "restaurant_id"]
          },
        ]
      }
      pms_commercial_restrictions: {
        Row: {
          active: boolean
          code: string
          created_at: string
          description: string | null
          id: string
          min_stay_nights: number | null
          name: string
          restaurant_id: string
          restriction_kind: string
          updated_at: string
          valid_from: string
          valid_to: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          description?: string | null
          id?: string
          min_stay_nights?: number | null
          name: string
          restaurant_id: string
          restriction_kind: string
          updated_at?: string
          valid_from: string
          valid_to: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          min_stay_nights?: number | null
          name?: string
          restaurant_id?: string
          restriction_kind?: string
          updated_at?: string
          valid_from?: string
          valid_to?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_commercial_restrictions_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_communication_automation_rules: {
        Row: {
          active: boolean
          channel_type: string
          conditions: Json
          created_at: string
          event_id: string
          id: string
          name: string
          recipients: Json
          restaurant_id: string
          schedule: Json
          template_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          channel_type?: string
          conditions?: Json
          created_at?: string
          event_id: string
          id?: string
          name: string
          recipients?: Json
          restaurant_id: string
          schedule?: Json
          template_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          channel_type?: string
          conditions?: Json
          created_at?: string
          event_id?: string
          id?: string
          name?: string
          recipients?: Json
          restaurant_id?: string
          schedule?: Json
          template_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pms_communication_automation_rules_event_tenant_fk"
            columns: ["event_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_communication_notification_events"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_communication_automation_rules_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_communication_automation_rules_template_tenant_fk"
            columns: ["template_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_communication_templates"
            referencedColumns: ["id", "restaurant_id"]
          },
        ]
      }
      pms_communication_channels: {
        Row: {
          active: boolean
          auth_method: string
          channel_type: string
          created_at: string
          id: string
          provider: string
          provider_config: Json
          reply_to_email: string | null
          restaurant_id: string
          sender_email: string | null
          sender_name: string
          signature: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          auth_method?: string
          channel_type: string
          created_at?: string
          id?: string
          provider: string
          provider_config?: Json
          reply_to_email?: string | null
          restaurant_id: string
          sender_email?: string | null
          sender_name: string
          signature?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          auth_method?: string
          channel_type?: string
          created_at?: string
          id?: string
          provider?: string
          provider_config?: Json
          reply_to_email?: string | null
          restaurant_id?: string
          sender_email?: string | null
          sender_name?: string
          signature?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pms_communication_channels_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_communication_defaults: {
        Row: {
          attach_branding: boolean
          created_at: string
          currency_code: string
          date_format: string
          default_guest_channel_id: string | null
          default_internal_channel_id: string | null
          default_language: string
          default_marketing_channel_id: string | null
          default_sender_id: string | null
          delivery_time: string
          guest_notifications_enabled: boolean
          id: string
          internal_notifications_enabled: boolean
          marketing_communications_enabled: boolean
          reply_to_email: string | null
          restaurant_id: string
          signature: string | null
          template_category: string
          time_format: string
          timezone: string
          updated_at: string
          updated_by: string | null
          use_guest_language: boolean
        }
        Insert: {
          attach_branding?: boolean
          created_at?: string
          currency_code: string
          date_format?: string
          default_guest_channel_id?: string | null
          default_internal_channel_id?: string | null
          default_language?: string
          default_marketing_channel_id?: string | null
          default_sender_id?: string | null
          delivery_time?: string
          guest_notifications_enabled?: boolean
          id?: string
          internal_notifications_enabled?: boolean
          marketing_communications_enabled?: boolean
          reply_to_email?: string | null
          restaurant_id: string
          signature?: string | null
          template_category?: string
          time_format?: string
          timezone: string
          updated_at?: string
          updated_by?: string | null
          use_guest_language?: boolean
        }
        Update: {
          attach_branding?: boolean
          created_at?: string
          currency_code?: string
          date_format?: string
          default_guest_channel_id?: string | null
          default_internal_channel_id?: string | null
          default_language?: string
          default_marketing_channel_id?: string | null
          default_sender_id?: string | null
          delivery_time?: string
          guest_notifications_enabled?: boolean
          id?: string
          internal_notifications_enabled?: boolean
          marketing_communications_enabled?: boolean
          reply_to_email?: string | null
          restaurant_id?: string
          signature?: string | null
          template_category?: string
          time_format?: string
          timezone?: string
          updated_at?: string
          updated_by?: string | null
          use_guest_language?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "pms_communication_defaults_guest_channel_fk"
            columns: ["default_guest_channel_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_communication_channels"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_communication_defaults_internal_channel_fk"
            columns: ["default_internal_channel_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_communication_channels"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_communication_defaults_marketing_channel_fk"
            columns: ["default_marketing_channel_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_communication_channels"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_communication_defaults_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_communication_defaults_sender_fk"
            columns: ["default_sender_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_communication_sender_settings"
            referencedColumns: ["id", "restaurant_id"]
          },
        ]
      }
      pms_communication_notification_events: {
        Row: {
          active: boolean
          category: string
          code: string
          created_at: string
          default_channel_type: string
          default_template_id: string | null
          description: string | null
          id: string
          is_system: boolean
          module: string
          name: string
          restaurant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          category: string
          code: string
          created_at?: string
          default_channel_type?: string
          default_template_id?: string | null
          description?: string | null
          id?: string
          is_system?: boolean
          module: string
          name: string
          restaurant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          category?: string
          code?: string
          created_at?: string
          default_channel_type?: string
          default_template_id?: string | null
          description?: string | null
          id?: string
          is_system?: boolean
          module?: string
          name?: string
          restaurant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pms_communication_notification_events_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_communication_notification_events_template_tenant_fk"
            columns: ["default_template_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_communication_templates"
            referencedColumns: ["id", "restaurant_id"]
          },
        ]
      }
      pms_communication_sender_settings: {
        Row: {
          active: boolean
          auth_method: string
          channel_type: string
          created_at: string
          id: string
          provider: string
          provider_config: Json
          reply_to_email: string | null
          restaurant_id: string
          sender_email: string | null
          sender_name: string
          signature: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          auth_method?: string
          channel_type: string
          created_at?: string
          id?: string
          provider: string
          provider_config?: Json
          reply_to_email?: string | null
          restaurant_id: string
          sender_email?: string | null
          sender_name: string
          signature?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          auth_method?: string
          channel_type?: string
          created_at?: string
          id?: string
          provider?: string
          provider_config?: Json
          reply_to_email?: string | null
          restaurant_id?: string
          sender_email?: string | null
          sender_name?: string
          signature?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pms_communication_sender_settings_channel_fk"
            columns: ["restaurant_id", "channel_type"]
            isOneToOne: true
            referencedRelation: "pms_communication_channels"
            referencedColumns: ["restaurant_id", "channel_type"]
          },
          {
            foreignKeyName: "pms_communication_sender_settings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_communication_templates: {
        Row: {
          active: boolean
          allow_manual_sending: boolean
          attach_pdf: boolean
          category: string
          channel_type: string
          code: string
          created_at: string
          event_trigger: string
          id: string
          language: string
          message: string
          name: string
          restaurant_id: string
          subject: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          allow_manual_sending?: boolean
          attach_pdf?: boolean
          category: string
          channel_type: string
          code: string
          created_at?: string
          event_trigger: string
          id?: string
          language?: string
          message: string
          name: string
          restaurant_id: string
          subject: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          allow_manual_sending?: boolean
          attach_pdf?: boolean
          category?: string
          channel_type?: string
          code?: string
          created_at?: string
          event_trigger?: string
          id?: string
          language?: string
          message?: string
          name?: string
          restaurant_id?: string
          subject?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pms_communication_templates_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_company_document_types: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
          name: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          name: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
          name?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_company_document_types_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_contract_rates: {
        Row: {
          active: boolean
          agreement_id: string
          amount: number
          created_at: string
          id: string
          rate_kind: string
          restaurant_id: string
          room_type_id: string
          updated_at: string
          valid_from: string
          valid_to: string
        }
        Insert: {
          active?: boolean
          agreement_id: string
          amount: number
          created_at?: string
          id?: string
          rate_kind: string
          restaurant_id: string
          room_type_id: string
          updated_at?: string
          valid_from: string
          valid_to: string
        }
        Update: {
          active?: boolean
          agreement_id?: string
          amount?: number
          created_at?: string
          id?: string
          rate_kind?: string
          restaurant_id?: string
          room_type_id?: string
          updated_at?: string
          valid_from?: string
          valid_to?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_contract_rates_agreement_fk"
            columns: ["agreement_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_corporate_agreements"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_contract_rates_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_contract_rates_room_type_fk"
            columns: ["room_type_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id", "restaurant_id"]
          },
        ]
      }
      pms_corporate_agreements: {
        Row: {
          active: boolean
          auto_renew: boolean
          code: string
          company_id: string
          contract_number: string
          created_at: string
          currency_code: string
          description: string | null
          file_storage_path: string | null
          id: string
          name: string
          notice_period_days: number | null
          restaurant_id: string
          signed_at: string | null
          signed_by: string | null
          updated_at: string
          valid_from: string
          valid_to: string
        }
        Insert: {
          active?: boolean
          auto_renew?: boolean
          code: string
          company_id: string
          contract_number: string
          created_at?: string
          currency_code: string
          description?: string | null
          file_storage_path?: string | null
          id?: string
          name: string
          notice_period_days?: number | null
          restaurant_id: string
          signed_at?: string | null
          signed_by?: string | null
          updated_at?: string
          valid_from: string
          valid_to: string
        }
        Update: {
          active?: boolean
          auto_renew?: boolean
          code?: string
          company_id?: string
          contract_number?: string
          created_at?: string
          currency_code?: string
          description?: string | null
          file_storage_path?: string | null
          id?: string
          name?: string
          notice_period_days?: number | null
          restaurant_id?: string
          signed_at?: string | null
          signed_by?: string | null
          updated_at?: string
          valid_from?: string
          valid_to?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_corporate_agreements_company_fk"
            columns: ["company_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "guest_account_masters"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_corporate_agreements_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_department_routing_rules: {
        Row: {
          active: boolean
          created_at: string
          default_role: string
          department_id: string
          description: string | null
          id: string
          restaurant_id: string
          service_key: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          default_role: string
          department_id: string
          description?: string | null
          id?: string
          restaurant_id: string
          service_key: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          default_role?: string
          department_id?: string
          description?: string | null
          id?: string
          restaurant_id?: string
          service_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_department_routing_rules_department_fk"
            columns: ["department_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_departments"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_department_routing_rules_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_departments: {
        Row: {
          active: boolean
          code: string
          cost_center: string | null
          created_at: string
          default_language: string | null
          default_notification_channel: string | null
          default_priority: string | null
          default_sla_minutes: number | null
          department_type: string
          description: string | null
          escalation_manager_user_id: string | null
          id: string
          manager_user_id: string | null
          name: string
          operating_hours: Json
          parent_id: string | null
          responsible_role: string | null
          restaurant_id: string
          revenue_center: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          cost_center?: string | null
          created_at?: string
          default_language?: string | null
          default_notification_channel?: string | null
          default_priority?: string | null
          default_sla_minutes?: number | null
          department_type?: string
          description?: string | null
          escalation_manager_user_id?: string | null
          id?: string
          manager_user_id?: string | null
          name: string
          operating_hours?: Json
          parent_id?: string | null
          responsible_role?: string | null
          restaurant_id: string
          revenue_center?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          cost_center?: string | null
          created_at?: string
          default_language?: string | null
          default_notification_channel?: string | null
          default_priority?: string | null
          default_sla_minutes?: number | null
          department_type?: string
          description?: string | null
          escalation_manager_user_id?: string | null
          id?: string
          manager_user_id?: string | null
          name?: string
          operating_hours?: Json
          parent_id?: string | null
          responsible_role?: string | null
          restaurant_id?: string
          revenue_center?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_departments_escalation_manager_fk"
            columns: ["restaurant_id", "escalation_manager_user_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["restaurant_id", "user_id"]
          },
          {
            foreignKeyName: "pms_departments_manager_fk"
            columns: ["restaurant_id", "manager_user_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["restaurant_id", "user_id"]
          },
          {
            foreignKeyName: "pms_departments_parent_fk"
            columns: ["parent_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_departments"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_departments_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_deposit_policies: {
        Row: {
          active: boolean
          code: string
          created_at: string
          deposit_type: string
          deposit_value: number
          description: string | null
          id: string
          is_default: boolean
          name: string
          required: boolean
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          deposit_type: string
          deposit_value?: number
          description?: string | null
          id?: string
          is_default?: boolean
          name: string
          required?: boolean
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          deposit_type?: string
          deposit_value?: number
          description?: string | null
          id?: string
          is_default?: boolean
          name?: string
          required?: boolean
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_deposit_policies_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_event_contract_defaults: {
        Row: {
          active: boolean
          approval_required: boolean
          cancellation_policy: string | null
          contract_type: string
          created_at: string
          default_validity_days: number | null
          deposit_policy_id: string | null
          id: string
          payment_terms: string | null
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          approval_required?: boolean
          cancellation_policy?: string | null
          contract_type: string
          created_at?: string
          default_validity_days?: number | null
          deposit_policy_id?: string | null
          id?: string
          payment_terms?: string | null
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          approval_required?: boolean
          cancellation_policy?: string | null
          contract_type?: string
          created_at?: string
          default_validity_days?: number | null
          deposit_policy_id?: string | null
          id?: string
          payment_terms?: string | null
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_event_contract_defaults_deposit_fk"
            columns: ["deposit_policy_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_deposit_policies"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_event_contract_defaults_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_event_package_template_outlets: {
        Row: {
          created_at: string
          id: string
          outlet_id: string
          restaurant_id: string
          template_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          outlet_id: string
          restaurant_id: string
          template_id: string
        }
        Update: {
          created_at?: string
          id?: string
          outlet_id?: string
          restaurant_id?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_event_package_template_outlets_outlet_fk"
            columns: ["outlet_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_outlets"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_event_package_template_outlets_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_event_package_template_outlets_template_fk"
            columns: ["template_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_event_package_templates"
            referencedColumns: ["id", "restaurant_id"]
          },
        ]
      }
      pms_event_package_template_services: {
        Row: {
          created_at: string
          fo_service_id: string
          id: string
          restaurant_id: string
          template_id: string
        }
        Insert: {
          created_at?: string
          fo_service_id: string
          id?: string
          restaurant_id: string
          template_id: string
        }
        Update: {
          created_at?: string
          fo_service_id?: string
          id?: string
          restaurant_id?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_event_package_template_services_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_event_package_template_services_service_fk"
            columns: ["fo_service_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "fo_service_catalogue"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_event_package_template_services_template_fk"
            columns: ["template_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_event_package_templates"
            referencedColumns: ["id", "restaurant_id"]
          },
        ]
      }
      pms_event_package_templates: {
        Row: {
          active: boolean
          code: string
          created_at: string
          currency_code: string | null
          default_price: number | null
          event_type_id: string | null
          id: string
          name: string
          pricing_method: string
          restaurant_id: string
          tax_group_id: string | null
          updated_at: string
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          currency_code?: string | null
          default_price?: number | null
          event_type_id?: string | null
          id?: string
          name: string
          pricing_method?: string
          restaurant_id: string
          tax_group_id?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          currency_code?: string | null
          default_price?: number | null
          event_type_id?: string | null
          id?: string
          name?: string
          pricing_method?: string
          restaurant_id?: string
          tax_group_id?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pms_event_package_templates_currency_fk"
            columns: ["restaurant_id", "currency_code"]
            isOneToOne: false
            referencedRelation: "pms_property_currencies"
            referencedColumns: ["restaurant_id", "code"]
          },
          {
            foreignKeyName: "pms_event_package_templates_event_type_fk"
            columns: ["event_type_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_event_types"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_event_package_templates_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_event_package_templates_tax_group_fk"
            columns: ["tax_group_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_tax_groups"
            referencedColumns: ["id", "restaurant_id"]
          },
        ]
      }
      pms_event_statuses: {
        Row: {
          active: boolean
          code: string
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
          code: string
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
          code?: string
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
            foreignKeyName: "pms_event_statuses_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_event_types: {
        Row: {
          active: boolean
          attrs: Json
          code: string
          created_at: string
          description: string
          id: string
          name: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          attrs?: Json
          code: string
          created_at?: string
          description?: string
          id?: string
          name: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          attrs?: Json
          code?: string
          created_at?: string
          description?: string
          id?: string
          name?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_event_types_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_exchange_rates: {
        Row: {
          created_at: string
          effective_date: string
          id: string
          quote_currency_code: string
          rate: number
          restaurant_id: string
          source: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          effective_date: string
          id?: string
          quote_currency_code: string
          rate: number
          restaurant_id: string
          source?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          effective_date?: string
          id?: string
          quote_currency_code?: string
          rate?: number
          restaurant_id?: string
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_exchange_rates_quote_fk"
            columns: ["restaurant_id", "quote_currency_code"]
            isOneToOne: false
            referencedRelation: "pms_property_currencies"
            referencedColumns: ["restaurant_id", "code"]
          },
          {
            foreignKeyName: "pms_exchange_rates_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_fees: {
        Row: {
          active: boolean
          amount: number
          basis: string
          charge_type: string
          code: string
          created_at: string
          id: string
          name: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          amount: number
          basis?: string
          charge_type?: string
          code: string
          created_at?: string
          id?: string
          name: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          amount?: number
          basis?: string
          charge_type?: string
          code?: string
          created_at?: string
          id?: string
          name?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_fees_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_financial_settings: {
        Row: {
          allow_multi_currency: boolean
          created_at: string
          default_fx_source: string
          fiscal_year_start_day: number
          fiscal_year_start_month: number
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          allow_multi_currency?: boolean
          created_at?: string
          default_fx_source?: string
          fiscal_year_start_day?: number
          fiscal_year_start_month?: number
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          allow_multi_currency?: boolean
          created_at?: string
          default_fx_source?: string
          fiscal_year_start_day?: number
          fiscal_year_start_month?: number
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_financial_settings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_function_space_labels: {
        Row: {
          active: boolean
          attrs: Json
          code: string
          created_at: string
          description: string
          id: string
          name: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          attrs?: Json
          code: string
          created_at?: string
          description?: string
          id?: string
          name: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          attrs?: Json
          code?: string
          created_at?: string
          description?: string
          id?: string
          name?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_function_space_labels_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_function_space_outlets: {
        Row: {
          active: boolean
          created_at: string
          function_space_label_id: string
          id: string
          outlet_id: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          function_space_label_id: string
          id?: string
          outlet_id: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          function_space_label_id?: string
          id?: string
          outlet_id?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_function_space_outlets_label_fk"
            columns: ["function_space_label_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_function_space_labels"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_function_space_outlets_outlet_fk"
            columns: ["outlet_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_outlets"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_function_space_outlets_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_golive_plans: {
        Row: {
          business_date_confirmed: boolean
          created_at: string
          cutover_lock_acknowledgement: boolean
          future_reservations_confirmed: boolean
          id: string
          notes: string | null
          opening_state_confirmed: boolean
          restaurant_id: string
          sandbox_acknowledgement: boolean
          status: string
          updated_at: string
        }
        Insert: {
          business_date_confirmed?: boolean
          created_at?: string
          cutover_lock_acknowledgement?: boolean
          future_reservations_confirmed?: boolean
          id?: string
          notes?: string | null
          opening_state_confirmed?: boolean
          restaurant_id: string
          sandbox_acknowledgement?: boolean
          status?: string
          updated_at?: string
        }
        Update: {
          business_date_confirmed?: boolean
          created_at?: string
          cutover_lock_acknowledgement?: boolean
          future_reservations_confirmed?: boolean
          id?: string
          notes?: string | null
          opening_state_confirmed?: boolean
          restaurant_id?: string
          sandbox_acknowledgement?: boolean
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_golive_plans_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_golive_tasks: {
        Row: {
          category: string
          created_at: string
          golive_plan_id: string
          id: string
          notes: string | null
          owner_department_id: string | null
          owner_user_id: string | null
          required: boolean
          restaurant_id: string
          sort_order: number
          status: string
          task_key: string
          title: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          golive_plan_id: string
          id?: string
          notes?: string | null
          owner_department_id?: string | null
          owner_user_id?: string | null
          required?: boolean
          restaurant_id: string
          sort_order?: number
          status?: string
          task_key: string
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          golive_plan_id?: string
          id?: string
          notes?: string | null
          owner_department_id?: string | null
          owner_user_id?: string | null
          required?: boolean
          restaurant_id?: string
          sort_order?: number
          status?: string
          task_key?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_golive_tasks_department_fk"
            columns: ["owner_department_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_departments"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_golive_tasks_owner_fk"
            columns: ["restaurant_id", "owner_user_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["restaurant_id", "user_id"]
          },
          {
            foreignKeyName: "pms_golive_tasks_plan_fk"
            columns: ["golive_plan_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_golive_plans"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_golive_tasks_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_group_create_drafts: {
        Row: {
          created_at: string
          created_by_membership_id: string
          id: string
          payload: Json
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by_membership_id: string
          id?: string
          payload?: Json
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_membership_id?: string
          id?: string
          payload?: Json
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_group_create_drafts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_group_templates: {
        Row: {
          active: boolean
          created_at: string
          description: string
          id: string
          name: string
          payload: Json
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string
          id?: string
          name: string
          payload?: Json
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string
          id?: string
          name?: string
          payload?: Json
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_group_templates_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_group_types: {
        Row: {
          active: boolean
          code: string
          created_at: string
          description: string
          id: string
          name: string
          restaurant_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          description?: string
          id?: string
          name: string
          restaurant_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          description?: string
          id?: string
          name?: string
          restaurant_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_group_types_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_guest_create_drafts: {
        Row: {
          created_at: string
          created_by_membership_id: string
          id: string
          payload: Json
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by_membership_id: string
          id?: string
          payload?: Json
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_membership_id?: string
          id?: string
          payload?: Json
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_guest_create_drafts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_guest_fields: {
        Row: {
          active: boolean
          check_in: boolean
          code: string
          created_at: string
          description: string | null
          display_order: number
          document_type_ids: string[]
          field_type: string
          id: string
          lookup_source: string | null
          max_value: number | null
          min_value: number | null
          name: string
          options: Json
          required: boolean
          reservation: boolean
          restaurant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          check_in?: boolean
          code: string
          created_at?: string
          description?: string | null
          display_order?: number
          document_type_ids?: string[]
          field_type: string
          id?: string
          lookup_source?: string | null
          max_value?: number | null
          min_value?: number | null
          name: string
          options?: Json
          required?: boolean
          reservation?: boolean
          restaurant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          check_in?: boolean
          code?: string
          created_at?: string
          description?: string | null
          display_order?: number
          document_type_ids?: string[]
          field_type?: string
          id?: string
          lookup_source?: string | null
          max_value?: number | null
          min_value?: number | null
          name?: string
          options?: Json
          required?: boolean
          reservation?: boolean
          restaurant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pms_guest_fields_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_guest_id_types: {
        Row: {
          active: boolean
          code: string
          created_at: string
          description: string | null
          display_order: number
          document_number_required: boolean
          expiry_date_required: boolean
          id: string
          issuing_country_required: boolean
          name: string
          required_at_check_in: boolean
          restaurant_id: string
          scan_image_allowed: boolean
          updated_at: string
          updated_by: string | null
          valid_for_profile_type_ids: string[]
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          description?: string | null
          display_order?: number
          document_number_required?: boolean
          expiry_date_required?: boolean
          id?: string
          issuing_country_required?: boolean
          name: string
          required_at_check_in?: boolean
          restaurant_id: string
          scan_image_allowed?: boolean
          updated_at?: string
          updated_by?: string | null
          valid_for_profile_type_ids?: string[]
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          description?: string | null
          display_order?: number
          document_number_required?: boolean
          expiry_date_required?: boolean
          id?: string
          issuing_country_required?: boolean
          name?: string
          required_at_check_in?: boolean
          restaurant_id?: string
          scan_image_allowed?: boolean
          updated_at?: string
          updated_by?: string | null
          valid_for_profile_type_ids?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "pms_guest_id_types_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_guest_preference_categories: {
        Row: {
          active: boolean
          code: string
          created_at: string
          description: string | null
          display_order: number
          id: string
          name: string
          restaurant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          name: string
          restaurant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          name?: string
          restaurant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pms_guest_preference_categories_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_guest_preference_types: {
        Row: {
          active: boolean
          category_id: string
          code: string
          created_at: string
          display_order: number
          id: string
          name: string
          options: Json
          required: boolean
          restaurant_id: string
          updated_at: string
          updated_by: string | null
          value_type: string
        }
        Insert: {
          active?: boolean
          category_id: string
          code: string
          created_at?: string
          display_order?: number
          id?: string
          name: string
          options?: Json
          required?: boolean
          restaurant_id: string
          updated_at?: string
          updated_by?: string | null
          value_type: string
        }
        Update: {
          active?: boolean
          category_id?: string
          code?: string
          created_at?: string
          display_order?: number
          id?: string
          name?: string
          options?: Json
          required?: boolean
          restaurant_id?: string
          updated_at?: string
          updated_by?: string | null
          value_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_guest_preference_types_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "pms_guest_preference_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_guest_preference_types_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_guest_profile_types: {
        Row: {
          active: boolean
          code: string
          created_at: string
          defaults: Json
          description: string | null
          document_type_ids: string[]
          icon: string
          id: string
          name: string
          preference_type_ids: string[]
          required_field_ids: string[]
          restaurant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          defaults?: Json
          description?: string | null
          document_type_ids?: string[]
          icon?: string
          id?: string
          name: string
          preference_type_ids?: string[]
          required_field_ids?: string[]
          restaurant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          defaults?: Json
          description?: string | null
          document_type_ids?: string[]
          icon?: string
          id?: string
          name?: string
          preference_type_ids?: string[]
          required_field_ids?: string[]
          restaurant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pms_guest_profile_types_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_guest_request_types: {
        Row: {
          active: boolean
          code: string
          created_at: string
          department_id: string | null
          id: string
          name: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          department_id?: string | null
          id?: string
          name: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          department_id?: string | null
          id?: string
          name?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_guest_request_types_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "pms_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_guest_request_types_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_guest_service_availability: {
        Row: {
          active: boolean
          created_at: string
          id: string
          restaurant_id: string
          service_type_id: string
          updated_at: string
          updated_by: string | null
          weekly_schedule: Json
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          restaurant_id: string
          service_type_id: string
          updated_at?: string
          updated_by?: string | null
          weekly_schedule?: Json
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          restaurant_id?: string
          service_type_id?: string
          updated_at?: string
          updated_by?: string | null
          weekly_schedule?: Json
        }
        Relationships: [
          {
            foreignKeyName: "pms_guest_service_availability_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_guest_service_availability_type_tenant_fk"
            columns: ["service_type_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_guest_service_types"
            referencedColumns: ["id", "restaurant_id"]
          },
        ]
      }
      pms_guest_service_categories: {
        Row: {
          active: boolean
          code: string
          created_at: string
          description: string | null
          display_order: number
          id: string
          name: string
          restaurant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          name: string
          restaurant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          name?: string
          restaurant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pms_guest_service_categories_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_guest_service_department_assignments: {
        Row: {
          active: boolean
          created_at: string
          department_id: string
          id: string
          restaurant_id: string
          service_type_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          department_id: string
          id?: string
          restaurant_id: string
          service_type_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          department_id?: string
          id?: string
          restaurant_id?: string
          service_type_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pms_guest_service_department_assignments_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_guest_service_dept_assign_dept_tenant_fk"
            columns: ["department_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_departments"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_guest_service_dept_assign_type_tenant_fk"
            columns: ["service_type_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_guest_service_types"
            referencedColumns: ["id", "restaurant_id"]
          },
        ]
      }
      pms_guest_service_pricing: {
        Row: {
          active: boolean
          amount: number
          created_at: string
          currency_code: string
          id: string
          pricing_unit: string
          restaurant_id: string
          service_type_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          amount: number
          created_at?: string
          currency_code: string
          id?: string
          pricing_unit: string
          restaurant_id: string
          service_type_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          amount?: number
          created_at?: string
          currency_code?: string
          id?: string
          pricing_unit?: string
          restaurant_id?: string
          service_type_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pms_guest_service_pricing_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_guest_service_pricing_service_type_tenant_fk"
            columns: ["service_type_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_guest_service_types"
            referencedColumns: ["id", "restaurant_id"]
          },
        ]
      }
      pms_guest_service_sla_rules: {
        Row: {
          active: boolean
          created_at: string
          id: string
          resolution_minutes: number
          response_minutes: number
          restaurant_id: string
          service_type_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          resolution_minutes: number
          response_minutes: number
          restaurant_id: string
          service_type_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          resolution_minutes?: number
          response_minutes?: number
          restaurant_id?: string
          service_type_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pms_guest_service_sla_rules_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_guest_service_sla_type_tenant_fk"
            columns: ["service_type_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_guest_service_types"
            referencedColumns: ["id", "restaurant_id"]
          },
        ]
      }
      pms_guest_service_types: {
        Row: {
          active: boolean
          category_id: string
          code: string
          created_at: string
          description: string | null
          display_order: number
          id: string
          name: string
          restaurant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          category_id: string
          code: string
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          name: string
          restaurant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          category_id?: string
          code?: string
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          name?: string
          restaurant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pms_guest_service_types_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "pms_guest_service_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_guest_service_types_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_guest_vip_levels: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
          name: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          name: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
          name?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_guest_vip_levels_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_hotel_roles: {
        Row: {
          active: boolean
          code: string
          created_at: string
          department_id: string | null
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
          department_id?: string | null
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
          department_id?: string | null
          description?: string | null
          id?: string
          name?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_hotel_roles_department_fk"
            columns: ["department_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_departments"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_hotel_roles_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_housekeeping_priority_rules: {
        Row: {
          created_at: string
          enabled: boolean
          event_code: string
          id: string
          priority_code: string
          rank: number
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          event_code: string
          id?: string
          priority_code: string
          rank: number
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          event_code?: string
          id?: string
          priority_code?: string
          rank?: number
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_housekeeping_priority_rules_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_housekeeping_settings: {
        Row: {
          assignment_override_allowed: boolean
          automatic_status_change_enabled: boolean
          clean_required: boolean
          created_at: string
          default_housekeeping_status: string
          enabled: boolean
          inspection_required: boolean
          maintenance_clear_required: boolean
          manual_status_change_allowed: boolean
          override_permission: string | null
          override_reason_required: boolean
          restaurant_id: string
          room_release_rule: string
          saved_at: string | null
          supervisor_approval_required: boolean
          updated_at: string
        }
        Insert: {
          assignment_override_allowed?: boolean
          automatic_status_change_enabled?: boolean
          clean_required?: boolean
          created_at?: string
          default_housekeeping_status?: string
          enabled?: boolean
          inspection_required?: boolean
          maintenance_clear_required?: boolean
          manual_status_change_allowed?: boolean
          override_permission?: string | null
          override_reason_required?: boolean
          restaurant_id: string
          room_release_rule?: string
          saved_at?: string | null
          supervisor_approval_required?: boolean
          updated_at?: string
        }
        Update: {
          assignment_override_allowed?: boolean
          automatic_status_change_enabled?: boolean
          clean_required?: boolean
          created_at?: string
          default_housekeeping_status?: string
          enabled?: boolean
          inspection_required?: boolean
          maintenance_clear_required?: boolean
          manual_status_change_allowed?: boolean
          override_permission?: string | null
          override_reason_required?: boolean
          restaurant_id?: string
          room_release_rule?: string
          saved_at?: string | null
          supervisor_approval_required?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_housekeeping_settings_default_status_fk"
            columns: ["restaurant_id", "default_housekeeping_status"]
            isOneToOne: false
            referencedRelation: "pms_housekeeping_status_catalog"
            referencedColumns: ["restaurant_id", "code"]
          },
          {
            foreignKeyName: "pms_housekeeping_settings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_housekeeping_status_catalog: {
        Row: {
          active: boolean
          code: string
          created_at: string
          domain: string
          id: string
          is_core: boolean
          name: string
          operational: boolean
          restaurant_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          domain: string
          id?: string
          is_core?: boolean
          name: string
          operational?: boolean
          restaurant_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          domain?: string
          id?: string
          is_core?: boolean
          name?: string
          operational?: boolean
          restaurant_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_housekeeping_status_catalog_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_housekeeping_transition_rules: {
        Row: {
          approval_required: boolean
          created_at: string
          enabled: boolean
          event_code: string
          from_status_code: string
          id: string
          restaurant_id: string
          to_status_code: string
          updated_at: string
        }
        Insert: {
          approval_required?: boolean
          created_at?: string
          enabled?: boolean
          event_code: string
          from_status_code: string
          id?: string
          restaurant_id: string
          to_status_code: string
          updated_at?: string
        }
        Update: {
          approval_required?: boolean
          created_at?: string
          enabled?: boolean
          event_code?: string
          from_status_code?: string
          id?: string
          restaurant_id?: string
          to_status_code?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_housekeeping_transition_from_fk"
            columns: ["restaurant_id", "from_status_code"]
            isOneToOne: false
            referencedRelation: "pms_housekeeping_status_catalog"
            referencedColumns: ["restaurant_id", "code"]
          },
          {
            foreignKeyName: "pms_housekeeping_transition_rules_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_housekeeping_transition_to_fk"
            columns: ["restaurant_id", "to_status_code"]
            isOneToOne: false
            referencedRelation: "pms_housekeeping_status_catalog"
            referencedColumns: ["restaurant_id", "code"]
          },
        ]
      }
      pms_import_duplicate_policies: {
        Row: {
          action: string
          created_at: string
          id: string
          import_type_id: string
          match_keys: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          action?: string
          created_at?: string
          id?: string
          import_type_id: string
          match_keys: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          import_type_id?: string
          match_keys?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_import_duplicate_policies_import_type_id_fkey"
            columns: ["import_type_id"]
            isOneToOne: false
            referencedRelation: "pms_import_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_import_duplicate_policies_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_import_field_definitions: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
          import_type_id: string
          name: string
          required: boolean
          updated_at: string
          value_kind: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          import_type_id: string
          name: string
          required?: boolean
          updated_at?: string
          value_kind: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
          import_type_id?: string
          name?: string
          required?: boolean
          updated_at?: string
          value_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_import_field_definitions_import_type_id_fkey"
            columns: ["import_type_id"]
            isOneToOne: false
            referencedRelation: "pms_import_types"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_import_job_issues: {
        Row: {
          code: string
          created_at: string
          id: string
          job_id: string
          message: string
          restaurant_id: string
          row_number: number | null
          severity: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          job_id: string
          message: string
          restaurant_id: string
          row_number?: number | null
          severity: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          job_id?: string
          message?: string
          restaurant_id?: string
          row_number?: number | null
          severity?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_import_job_issues_job_fk"
            columns: ["job_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_import_jobs"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_import_job_issues_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_import_jobs: {
        Row: {
          actor_user_id: string | null
          created_at: string
          id: string
          import_type_id: string
          notes: string | null
          original_filename: string | null
          restaurant_id: string
          row_count: number | null
          status: string
          updated_at: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          id?: string
          import_type_id: string
          notes?: string | null
          original_filename?: string | null
          restaurant_id: string
          row_count?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          id?: string
          import_type_id?: string
          notes?: string | null
          original_filename?: string | null
          restaurant_id?: string
          row_count?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_import_jobs_import_type_id_fkey"
            columns: ["import_type_id"]
            isOneToOne: false
            referencedRelation: "pms_import_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_import_jobs_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_import_mapping_template_fields: {
        Row: {
          created_at: string
          field_definition_id: string
          id: string
          restaurant_id: string
          source_column: string
          template_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          field_definition_id: string
          id?: string
          restaurant_id: string
          source_column: string
          template_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          field_definition_id?: string
          id?: string
          restaurant_id?: string
          source_column?: string
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_import_mapping_template_fields_field_definition_id_fkey"
            columns: ["field_definition_id"]
            isOneToOne: false
            referencedRelation: "pms_import_field_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_import_mapping_template_fields_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_import_mapping_template_fields_template_fk"
            columns: ["template_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_import_mapping_templates"
            referencedColumns: ["id", "restaurant_id"]
          },
        ]
      }
      pms_import_mapping_templates: {
        Row: {
          active: boolean
          created_at: string
          id: string
          import_type_id: string
          name: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          import_type_id: string
          name: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          import_type_id?: string
          name?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_import_mapping_templates_import_type_id_fkey"
            columns: ["import_type_id"]
            isOneToOne: false
            referencedRelation: "pms_import_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_import_mapping_templates_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_import_policies: {
        Row: {
          active: boolean
          allowed_format: string
          created_at: string
          enabled: boolean
          id: string
          max_rows: number
          owner_manager_execute_only: boolean
          preview_required: boolean
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          allowed_format?: string
          created_at?: string
          enabled?: boolean
          id?: string
          max_rows?: number
          owner_manager_execute_only?: boolean
          preview_required?: boolean
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          allowed_format?: string
          created_at?: string
          enabled?: boolean
          id?: string
          max_rows?: number
          owner_manager_execute_only?: boolean
          preview_required?: boolean
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_import_policies_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_import_type_settings: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          import_type_id: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          import_type_id: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          import_type_id?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_import_type_settings_import_type_id_fkey"
            columns: ["import_type_id"]
            isOneToOne: false
            referencedRelation: "pms_import_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_import_type_settings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_import_types: {
        Row: {
          active: boolean
          code: string
          created_at: string
          description: string | null
          handler_key: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          description?: string | null
          handler_key: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          description?: string | null
          handler_key?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      pms_import_validation_rules: {
        Row: {
          created_at: string
          enabled: boolean
          field_code: string
          id: string
          import_type_id: string
          restaurant_id: string
          rule_kind: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          field_code: string
          id?: string
          import_type_id: string
          restaurant_id: string
          rule_kind: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          field_code?: string
          id?: string
          import_type_id?: string
          restaurant_id?: string
          rule_kind?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_import_validation_rules_import_type_id_fkey"
            columns: ["import_type_id"]
            isOneToOne: false
            referencedRelation: "pms_import_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_import_validation_rules_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_integration_activity: {
        Row: {
          actor_user_id: string | null
          created_at: string
          detail: string | null
          event: string
          id: string
          integration_id: string | null
          integration_name: string
          restaurant_id: string
          simulated: boolean
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          detail?: string | null
          event: string
          id?: string
          integration_id?: string | null
          integration_name: string
          restaurant_id: string
          simulated?: boolean
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          detail?: string | null
          event?: string
          id?: string
          integration_id?: string | null
          integration_name?: string
          restaurant_id?: string
          simulated?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "pms_integration_activity_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "pms_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_integration_activity_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_integrations: {
        Row: {
          auth_method: string | null
          category: string
          config: Json
          created_at: string
          description: string | null
          enabled: boolean
          environment: string
          events: string[]
          id: string
          last_test_at: string | null
          last_test_result: string | null
          name: string
          provider: string
          restaurant_id: string
          status: string
          updated_at: string
          webhook_path: string | null
        }
        Insert: {
          auth_method?: string | null
          category: string
          config?: Json
          created_at?: string
          description?: string | null
          enabled?: boolean
          environment?: string
          events?: string[]
          id?: string
          last_test_at?: string | null
          last_test_result?: string | null
          name: string
          provider: string
          restaurant_id: string
          status?: string
          updated_at?: string
          webhook_path?: string | null
        }
        Update: {
          auth_method?: string | null
          category?: string
          config?: Json
          created_at?: string
          description?: string | null
          enabled?: boolean
          environment?: string
          events?: string[]
          id?: string
          last_test_at?: string | null
          last_test_result?: string | null
          name?: string
          provider?: string
          restaurant_id?: string
          status?: string
          updated_at?: string
          webhook_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pms_integrations_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_inventory_block_type_rules: {
        Row: {
          approval_required: boolean
          block_type: string
          created_at: string
          enabled: boolean
          id: string
          inventory_impact: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          approval_required?: boolean
          block_type: string
          created_at?: string
          enabled?: boolean
          id?: string
          inventory_impact?: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          approval_required?: boolean
          block_type?: string
          created_at?: string
          enabled?: boolean
          id?: string
          inventory_impact?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_inventory_block_type_rules_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_inventory_rules"
            referencedColumns: ["restaurant_id"]
          },
        ]
      }
      pms_inventory_rules: {
        Row: {
          automatic_assignment_allowed: boolean
          created_at: string
          date_based_limit_enabled: boolean
          housekeeping_affects_assignment: boolean
          housekeeping_readiness_required: boolean
          housekeeping_update_required: boolean
          id: string
          inventory_recalculation_required: boolean
          maintenance_affects_availability: boolean
          maintenance_clear_required: boolean
          maintenance_validation_required: boolean
          manager_approval_required: boolean
          manual_assignment_allowed: boolean
          maximum_overbooking: number | null
          move_approval_required: boolean
          move_reason_required: boolean
          operational_availability_required: boolean
          out_of_order_removes_inventory: boolean
          out_of_service_removes_inventory: boolean
          overbooking_alert_enabled: boolean
          overbooking_allowed: boolean
          overbooking_reason_required: boolean
          override_permission_required: boolean
          percentage_limit: number | null
          rate_recalculation_required: boolean
          require_accessibility_match: boolean
          require_bed_type_match: boolean
          require_connecting_room_match: boolean
          require_housekeeping_readiness: boolean
          require_maintenance_availability: boolean
          require_occupancy_match: boolean
          require_room_type_match: boolean
          restaurant_id: string
          room_block_removes_inventory: boolean
          room_move_allowed: boolean
          room_type_change_allowed: boolean
          room_type_limit_enabled: boolean
          sellable_status_required: boolean
          updated_at: string
          use_building_preference: boolean
          use_floor_preference: boolean
          use_guest_preference: boolean
        }
        Insert: {
          automatic_assignment_allowed?: boolean
          created_at?: string
          date_based_limit_enabled?: boolean
          housekeeping_affects_assignment?: boolean
          housekeeping_readiness_required?: boolean
          housekeeping_update_required?: boolean
          id?: string
          inventory_recalculation_required?: boolean
          maintenance_affects_availability?: boolean
          maintenance_clear_required?: boolean
          maintenance_validation_required?: boolean
          manager_approval_required?: boolean
          manual_assignment_allowed?: boolean
          maximum_overbooking?: number | null
          move_approval_required?: boolean
          move_reason_required?: boolean
          operational_availability_required?: boolean
          out_of_order_removes_inventory?: boolean
          out_of_service_removes_inventory?: boolean
          overbooking_alert_enabled?: boolean
          overbooking_allowed?: boolean
          overbooking_reason_required?: boolean
          override_permission_required?: boolean
          percentage_limit?: number | null
          rate_recalculation_required?: boolean
          require_accessibility_match?: boolean
          require_bed_type_match?: boolean
          require_connecting_room_match?: boolean
          require_housekeeping_readiness?: boolean
          require_maintenance_availability?: boolean
          require_occupancy_match?: boolean
          require_room_type_match?: boolean
          restaurant_id: string
          room_block_removes_inventory?: boolean
          room_move_allowed?: boolean
          room_type_change_allowed?: boolean
          room_type_limit_enabled?: boolean
          sellable_status_required?: boolean
          updated_at?: string
          use_building_preference?: boolean
          use_floor_preference?: boolean
          use_guest_preference?: boolean
        }
        Update: {
          automatic_assignment_allowed?: boolean
          created_at?: string
          date_based_limit_enabled?: boolean
          housekeeping_affects_assignment?: boolean
          housekeeping_readiness_required?: boolean
          housekeeping_update_required?: boolean
          id?: string
          inventory_recalculation_required?: boolean
          maintenance_affects_availability?: boolean
          maintenance_clear_required?: boolean
          maintenance_validation_required?: boolean
          manager_approval_required?: boolean
          manual_assignment_allowed?: boolean
          maximum_overbooking?: number | null
          move_approval_required?: boolean
          move_reason_required?: boolean
          operational_availability_required?: boolean
          out_of_order_removes_inventory?: boolean
          out_of_service_removes_inventory?: boolean
          overbooking_alert_enabled?: boolean
          overbooking_allowed?: boolean
          overbooking_reason_required?: boolean
          override_permission_required?: boolean
          percentage_limit?: number | null
          rate_recalculation_required?: boolean
          require_accessibility_match?: boolean
          require_bed_type_match?: boolean
          require_connecting_room_match?: boolean
          require_housekeeping_readiness?: boolean
          require_maintenance_availability?: boolean
          require_occupancy_match?: boolean
          require_room_type_match?: boolean
          restaurant_id?: string
          room_block_removes_inventory?: boolean
          room_move_allowed?: boolean
          room_type_change_allowed?: boolean
          room_type_limit_enabled?: boolean
          sellable_status_required?: boolean
          updated_at?: string
          use_building_preference?: boolean
          use_floor_preference?: boolean
          use_guest_preference?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "pms_inventory_rules_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_invoice_settings: {
        Row: {
          created_at: string
          invoice_format: string
          number_padding: number
          prefix: string
          restaurant_id: string
          starting_number: number
          tax_display: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          invoice_format?: string
          number_padding?: number
          prefix: string
          restaurant_id: string
          starting_number?: number
          tax_display?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          invoice_format?: string
          number_padding?: number
          prefix?: string
          restaurant_id?: string
          starting_number?: number
          tax_display?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_invoice_settings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_lead_types: {
        Row: {
          active: boolean
          code: string
          created_at: string
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
          description?: string | null
          id?: string
          name?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_lead_types_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_maintenance_categories: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
          name: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          name: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
          name?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_maintenance_categories_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_maintenance_priorities: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
          name: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          name: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
          name?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_maintenance_priorities_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_maintenance_rules: {
        Row: {
          created_at: string
          default_maintenance_frequency: string
          id: string
          maintenance_management_enabled: boolean
          maintenance_status_change_notes_required: boolean
          maintenance_status_change_reason_required: boolean
          manual_status_change_allowed: boolean
          operational_ooo_approval_required: boolean
          operational_ooo_assignment_restricted: boolean
          operational_ooo_check_in_restricted: boolean
          operational_ooo_enabled: boolean
          operational_ooo_maintenance_clearance_required: boolean
          operational_ooo_maintenance_ticket_required: boolean
          operational_ooo_manager_approval_required: boolean
          operational_ooo_reason_required: boolean
          operational_ooo_reopening_inspection_required: boolean
          operational_oos_approval_required: boolean
          operational_oos_assignment_restricted: boolean
          operational_oos_enabled: boolean
          operational_oos_expected_completion_required: boolean
          operational_oos_maintenance_clearance_required: boolean
          operational_oos_reason_required: boolean
          operational_oos_reopening_inspection_required: boolean
          operational_oos_supervisor_approval_required: boolean
          preventive_assigned_department_id: string | null
          preventive_inspection_required: boolean
          preventive_maintenance_enabled: boolean
          preventive_reminder_enabled: boolean
          preventive_reminder_lead_days: number | null
          requires_supervisor_approval: boolean
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_maintenance_frequency?: string
          id?: string
          maintenance_management_enabled?: boolean
          maintenance_status_change_notes_required?: boolean
          maintenance_status_change_reason_required?: boolean
          manual_status_change_allowed?: boolean
          operational_ooo_approval_required?: boolean
          operational_ooo_assignment_restricted?: boolean
          operational_ooo_check_in_restricted?: boolean
          operational_ooo_enabled?: boolean
          operational_ooo_maintenance_clearance_required?: boolean
          operational_ooo_maintenance_ticket_required?: boolean
          operational_ooo_manager_approval_required?: boolean
          operational_ooo_reason_required?: boolean
          operational_ooo_reopening_inspection_required?: boolean
          operational_oos_approval_required?: boolean
          operational_oos_assignment_restricted?: boolean
          operational_oos_enabled?: boolean
          operational_oos_expected_completion_required?: boolean
          operational_oos_maintenance_clearance_required?: boolean
          operational_oos_reason_required?: boolean
          operational_oos_reopening_inspection_required?: boolean
          operational_oos_supervisor_approval_required?: boolean
          preventive_assigned_department_id?: string | null
          preventive_inspection_required?: boolean
          preventive_maintenance_enabled?: boolean
          preventive_reminder_enabled?: boolean
          preventive_reminder_lead_days?: number | null
          requires_supervisor_approval?: boolean
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_maintenance_frequency?: string
          id?: string
          maintenance_management_enabled?: boolean
          maintenance_status_change_notes_required?: boolean
          maintenance_status_change_reason_required?: boolean
          manual_status_change_allowed?: boolean
          operational_ooo_approval_required?: boolean
          operational_ooo_assignment_restricted?: boolean
          operational_ooo_check_in_restricted?: boolean
          operational_ooo_enabled?: boolean
          operational_ooo_maintenance_clearance_required?: boolean
          operational_ooo_maintenance_ticket_required?: boolean
          operational_ooo_manager_approval_required?: boolean
          operational_ooo_reason_required?: boolean
          operational_ooo_reopening_inspection_required?: boolean
          operational_oos_approval_required?: boolean
          operational_oos_assignment_restricted?: boolean
          operational_oos_enabled?: boolean
          operational_oos_expected_completion_required?: boolean
          operational_oos_maintenance_clearance_required?: boolean
          operational_oos_reason_required?: boolean
          operational_oos_reopening_inspection_required?: boolean
          operational_oos_supervisor_approval_required?: boolean
          preventive_assigned_department_id?: string | null
          preventive_inspection_required?: boolean
          preventive_maintenance_enabled?: boolean
          preventive_reminder_enabled?: boolean
          preventive_reminder_lead_days?: number | null
          requires_supervisor_approval?: boolean
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_maintenance_rules_department_fk"
            columns: ["preventive_assigned_department_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_departments"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_maintenance_rules_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_maintenance_status_rules: {
        Row: {
          active: boolean
          created_at: string
          id: string
          maintenance_status: string
          prevents_check_in: boolean
          prevents_room_assignment: boolean
          requires_inspection_before_release: boolean
          requires_maintenance_clearance: boolean
          requires_supervisor_approval: boolean
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          maintenance_status: string
          prevents_check_in?: boolean
          prevents_room_assignment?: boolean
          requires_inspection_before_release?: boolean
          requires_maintenance_clearance?: boolean
          requires_supervisor_approval?: boolean
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          maintenance_status?: string
          prevents_check_in?: boolean
          prevents_room_assignment?: boolean
          requires_inspection_before_release?: boolean
          requires_maintenance_clearance?: boolean
          requires_supervisor_approval?: boolean
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_maintenance_status_rules_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_maintenance_rules"
            referencedColumns: ["restaurant_id"]
          },
        ]
      }
      pms_maintenance_type_tags: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
          name: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          name: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
          name?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_maintenance_type_tags_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_market_segments: {
        Row: {
          active: boolean
          attrs: Json
          code: string
          created_at: string
          description: string
          id: string
          name: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          attrs?: Json
          code: string
          created_at?: string
          description?: string
          id?: string
          name: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          attrs?: Json
          code?: string
          created_at?: string
          description?: string
          id?: string
          name?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_market_segments_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_meal_plans: {
        Row: {
          active: boolean
          applicable_outlet_ids: string[]
          chargeable: Json
          code: string
          created_at: string
          description: string | null
          id: string
          included: Json
          includes_breakfast: boolean
          includes_dinner: boolean
          includes_lunch: boolean
          name: string
          restaurant_id: string
          tax_posture: string
          type: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          applicable_outlet_ids?: string[]
          chargeable?: Json
          code: string
          created_at?: string
          description?: string | null
          id?: string
          included?: Json
          includes_breakfast?: boolean
          includes_dinner?: boolean
          includes_lunch?: boolean
          name: string
          restaurant_id: string
          tax_posture?: string
          type: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          applicable_outlet_ids?: string[]
          chargeable?: Json
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          included?: Json
          includes_breakfast?: boolean
          includes_dinner?: boolean
          includes_lunch?: boolean
          name?: string
          restaurant_id?: string
          tax_posture?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_meal_plans_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_metric_definition_settings: {
        Row: {
          created_at: string
          display_name: string | null
          enabled: boolean
          id: string
          metric_id: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          enabled?: boolean
          id?: string
          metric_id: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          enabled?: boolean
          id?: string
          metric_id?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_metric_definition_settings_metric_id_fkey"
            columns: ["metric_id"]
            isOneToOne: false
            referencedRelation: "pms_metric_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_metric_definition_settings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_metric_definitions: {
        Row: {
          active: boolean
          code: string
          created_at: string
          description: string | null
          formula_notes: string | null
          id: string
          name: string
          query_key: string
          unit: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          description?: string | null
          formula_notes?: string | null
          id?: string
          name: string
          query_key: string
          unit: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          description?: string | null
          formula_notes?: string | null
          id?: string
          name?: string
          query_key?: string
          unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      pms_notification_templates: {
        Row: {
          active: boolean
          body: string
          channel: string
          code: string
          created_at: string
          id: string
          name: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          body?: string
          channel: string
          code: string
          created_at?: string
          id?: string
          name: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          body?: string
          channel?: string
          code?: string
          created_at?: string
          id?: string
          name?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_notification_templates_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_offline_capabilities: {
        Row: {
          active: boolean
          capability_key: string
          controlled_financial: boolean
          created_at: string
          id: string
          policy_state: string
          restaurant_id: string
          sync_priority: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          capability_key: string
          controlled_financial?: boolean
          created_at?: string
          id?: string
          policy_state?: string
          restaurant_id: string
          sync_priority?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          capability_key?: string
          controlled_financial?: boolean
          created_at?: string
          id?: string
          policy_state?: string
          restaurant_id?: string
          sync_priority?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_offline_capabilities_policy_fk"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_offline_policies"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "pms_offline_capabilities_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_offline_policies: {
        Row: {
          cache_future_days: number
          cache_previous_days: number
          configured: boolean
          conflict_policy: string
          created_at: string
          failed_event_policy: string
          financial_offline_policy: string
          id: string
          maximum_retry_attempts: number
          offline_mode_enabled: boolean
          restaurant_id: string
          retry_interval_minutes: number
          sync_interval_minutes: number
          sync_mode: string
          updated_at: string
        }
        Insert: {
          cache_future_days?: number
          cache_previous_days?: number
          configured?: boolean
          conflict_policy?: string
          created_at?: string
          failed_event_policy?: string
          financial_offline_policy?: string
          id?: string
          maximum_retry_attempts?: number
          offline_mode_enabled?: boolean
          restaurant_id: string
          retry_interval_minutes?: number
          sync_interval_minutes?: number
          sync_mode?: string
          updated_at?: string
        }
        Update: {
          cache_future_days?: number
          cache_previous_days?: number
          configured?: boolean
          conflict_policy?: string
          created_at?: string
          failed_event_policy?: string
          financial_offline_policy?: string
          id?: string
          maximum_retry_attempts?: number
          offline_mode_enabled?: boolean
          restaurant_id?: string
          retry_interval_minutes?: number
          sync_interval_minutes?: number
          sync_mode?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_offline_policies_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_operational_inventory_blocks: {
        Row: {
          activated_at: string | null
          activated_by_membership_id: string | null
          approval_required: boolean
          approved_at: string | null
          approved_by_membership_id: string | null
          block_type: string
          cancelled_at: string | null
          cancelled_by_membership_id: string | null
          created_at: string
          created_by_membership_id: string
          end_date: string
          group_id: string | null
          id: string
          inventory_impact: string
          notes: string | null
          quantity: number | null
          reason: string
          release_reason: string | null
          released_at: string | null
          released_by_membership_id: string | null
          restaurant_id: string
          room_id: string | null
          room_type_id: string
          start_date: string
          status: string
          target_kind: string
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          activated_by_membership_id?: string | null
          approval_required: boolean
          approved_at?: string | null
          approved_by_membership_id?: string | null
          block_type: string
          cancelled_at?: string | null
          cancelled_by_membership_id?: string | null
          created_at?: string
          created_by_membership_id: string
          end_date: string
          group_id?: string | null
          id?: string
          inventory_impact: string
          notes?: string | null
          quantity?: number | null
          reason: string
          release_reason?: string | null
          released_at?: string | null
          released_by_membership_id?: string | null
          restaurant_id: string
          room_id?: string | null
          room_type_id: string
          start_date: string
          status: string
          target_kind: string
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          activated_by_membership_id?: string | null
          approval_required?: boolean
          approved_at?: string | null
          approved_by_membership_id?: string | null
          block_type?: string
          cancelled_at?: string | null
          cancelled_by_membership_id?: string | null
          created_at?: string
          created_by_membership_id?: string
          end_date?: string
          group_id?: string | null
          id?: string
          inventory_impact?: string
          notes?: string | null
          quantity?: number | null
          reason?: string
          release_reason?: string | null
          released_at?: string | null
          released_by_membership_id?: string | null
          restaurant_id?: string
          room_id?: string | null
          room_type_id?: string
          start_date?: string
          status?: string
          target_kind?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_operational_inventory_blocks_activated_by_fk"
            columns: ["activated_by_membership_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_operational_inventory_blocks_approved_by_fk"
            columns: ["approved_by_membership_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_operational_inventory_blocks_cancelled_by_fk"
            columns: ["cancelled_by_membership_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_operational_inventory_blocks_created_by_fk"
            columns: ["created_by_membership_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_operational_inventory_blocks_released_by_fk"
            columns: ["released_by_membership_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_operational_inventory_blocks_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_operational_inventory_blocks_room_fk"
            columns: ["room_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "hotel_rooms"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_operational_inventory_blocks_type_fk"
            columns: ["room_type_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id", "restaurant_id"]
          },
        ]
      }
      pms_outlets: {
        Row: {
          active: boolean
          advance_booking_required: boolean | null
          availability_mode: string
          building_id: string | null
          chargeable: boolean | null
          code: string
          created_at: string
          currency_code: string | null
          default_posting_label: string | null
          department_id: string | null
          department_text: string | null
          description: string | null
          facility_category: string
          facility_type_code: string
          features: Json
          floor_id: string | null
          id: string
          is_default_rooms: boolean
          manager_user_id: string | null
          maximum_capacity: number | null
          minimum_capacity: number | null
          minimum_lead_minutes: number | null
          name: string
          operating_hours: Json
          reservation_required: boolean | null
          responsible_role: string | null
          restaurant_id: string
          revenue_center: string | null
          standard_capacity: number | null
          tax_group_id: string | null
          type: string
          updated_at: string
          wing_id: string | null
        }
        Insert: {
          active?: boolean
          advance_booking_required?: boolean | null
          availability_mode?: string
          building_id?: string | null
          chargeable?: boolean | null
          code: string
          created_at?: string
          currency_code?: string | null
          default_posting_label?: string | null
          department_id?: string | null
          department_text?: string | null
          description?: string | null
          facility_category?: string
          facility_type_code?: string
          features?: Json
          floor_id?: string | null
          id?: string
          is_default_rooms?: boolean
          manager_user_id?: string | null
          maximum_capacity?: number | null
          minimum_capacity?: number | null
          minimum_lead_minutes?: number | null
          name: string
          operating_hours?: Json
          reservation_required?: boolean | null
          responsible_role?: string | null
          restaurant_id: string
          revenue_center?: string | null
          standard_capacity?: number | null
          tax_group_id?: string | null
          type: string
          updated_at?: string
          wing_id?: string | null
        }
        Update: {
          active?: boolean
          advance_booking_required?: boolean | null
          availability_mode?: string
          building_id?: string | null
          chargeable?: boolean | null
          code?: string
          created_at?: string
          currency_code?: string | null
          default_posting_label?: string | null
          department_id?: string | null
          department_text?: string | null
          description?: string | null
          facility_category?: string
          facility_type_code?: string
          features?: Json
          floor_id?: string | null
          id?: string
          is_default_rooms?: boolean
          manager_user_id?: string | null
          maximum_capacity?: number | null
          minimum_capacity?: number | null
          minimum_lead_minutes?: number | null
          name?: string
          operating_hours?: Json
          reservation_required?: boolean | null
          responsible_role?: string | null
          restaurant_id?: string
          revenue_center?: string | null
          standard_capacity?: number | null
          tax_group_id?: string | null
          type?: string
          updated_at?: string
          wing_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pms_outlets_building_fk"
            columns: ["building_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "hotel_buildings"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_outlets_currency_fk"
            columns: ["restaurant_id", "currency_code"]
            isOneToOne: false
            referencedRelation: "pms_property_currencies"
            referencedColumns: ["restaurant_id", "code"]
          },
          {
            foreignKeyName: "pms_outlets_department_fk"
            columns: ["department_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_departments"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_outlets_floor_fk"
            columns: ["floor_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "hotel_floors"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_outlets_manager_fk"
            columns: ["restaurant_id", "manager_user_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["restaurant_id", "user_id"]
          },
          {
            foreignKeyName: "pms_outlets_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_outlets_tax_group_fk"
            columns: ["tax_group_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_tax_groups"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_outlets_wing_fk"
            columns: ["wing_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "hotel_wings"
            referencedColumns: ["id", "restaurant_id"]
          },
        ]
      }
      pms_package_components: {
        Row: {
          component_kind: string
          created_at: string
          fo_service_id: string | null
          id: string
          meal_plan_id: string | null
          package_id: string
          quantity: number
          restaurant_id: string
          room_amenity_id: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          component_kind: string
          created_at?: string
          fo_service_id?: string | null
          id?: string
          meal_plan_id?: string | null
          package_id: string
          quantity?: number
          restaurant_id: string
          room_amenity_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          component_kind?: string
          created_at?: string
          fo_service_id?: string | null
          id?: string
          meal_plan_id?: string | null
          package_id?: string
          quantity?: number
          restaurant_id?: string
          room_amenity_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_package_components_fo_service_fk"
            columns: ["fo_service_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "fo_service_catalogue"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_package_components_meal_plan_fk"
            columns: ["meal_plan_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_meal_plans"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_package_components_package_fk"
            columns: ["package_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_packages"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_package_components_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_package_components_room_amenity_fk"
            columns: ["room_amenity_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "room_amenities"
            referencedColumns: ["id", "restaurant_id"]
          },
        ]
      }
      pms_package_rate_plans: {
        Row: {
          created_at: string
          id: string
          package_id: string
          rate_plan_id: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          package_id: string
          rate_plan_id: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          package_id?: string
          rate_plan_id?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_package_rate_plans_package_fk"
            columns: ["package_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_packages"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_package_rate_plans_rate_plan_fk"
            columns: ["rate_plan_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "hotel_rate_plans"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_package_rate_plans_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_package_room_types: {
        Row: {
          created_at: string
          id: string
          package_id: string
          restaurant_id: string
          room_type_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          package_id: string
          restaurant_id: string
          room_type_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          package_id?: string
          restaurant_id?: string
          room_type_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_package_room_types_package_fk"
            columns: ["package_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_packages"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_package_room_types_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_package_room_types_room_type_fk"
            columns: ["room_type_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id", "restaurant_id"]
          },
        ]
      }
      pms_packages: {
        Row: {
          active: boolean
          code: string
          created_at: string
          description: string | null
          id: string
          inclusion: Json
          name: string
          package_price: number
          restaurant_id: string
          type: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          description?: string | null
          id?: string
          inclusion?: Json
          name: string
          package_price?: number
          restaurant_id: string
          type: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          inclusion?: Json
          name?: string
          package_price?: number
          restaurant_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_packages_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_payment_methods: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
          name: string
          notes: string
          restaurant_id: string
          type_class: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          name: string
          notes?: string
          restaurant_id: string
          type_class?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
          name?: string
          notes?: string
          restaurant_id?: string
          type_class?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_payment_methods_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_permissions: {
        Row: {
          action: string
          active: boolean
          code: string
          created_at: string
          description: string | null
          function: string
          id: string
          module: string
          name: string
          sensitive: boolean
          updated_at: string
        }
        Insert: {
          action: string
          active?: boolean
          code: string
          created_at?: string
          description?: string | null
          function: string
          id?: string
          module: string
          name: string
          sensitive?: boolean
          updated_at?: string
        }
        Update: {
          action?: string
          active?: boolean
          code?: string
          created_at?: string
          description?: string | null
          function?: string
          id?: string
          module?: string
          name?: string
          sensitive?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      pms_preference_options: {
        Row: {
          active: boolean
          category: string
          code: string
          created_at: string
          id: string
          name: string
          restaurant_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          category: string
          code: string
          created_at?: string
          id?: string
          name: string
          restaurant_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string
          code?: string
          created_at?: string
          id?: string
          name?: string
          restaurant_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_preference_options_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_promotion_room_types: {
        Row: {
          created_at: string
          id: string
          promotion_id: string
          restaurant_id: string
          room_type_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          promotion_id: string
          restaurant_id: string
          room_type_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          promotion_id?: string
          restaurant_id?: string
          room_type_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_promotion_room_types_promotion_fk"
            columns: ["promotion_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_promotions"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_promotion_room_types_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_promotion_room_types_room_type_fk"
            columns: ["room_type_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id", "restaurant_id"]
          },
        ]
      }
      pms_promotions: {
        Row: {
          active: boolean
          code: string
          conditions: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          promo_kind: string
          promo_value: number
          restaurant_id: string
          updated_at: string
          valid_from: string
          valid_to: string
        }
        Insert: {
          active?: boolean
          code: string
          conditions?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          promo_kind: string
          promo_value?: number
          restaurant_id: string
          updated_at?: string
          valid_from: string
          valid_to: string
        }
        Update: {
          active?: boolean
          code?: string
          conditions?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          promo_kind?: string
          promo_value?: number
          restaurant_id?: string
          updated_at?: string
          valid_from?: string
          valid_to?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_promotions_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_property_areas: {
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
            foreignKeyName: "pms_property_areas_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_property_currencies: {
        Row: {
          active: boolean
          code: string
          created_at: string
          decimal_places: number
          id: string
          name: string
          restaurant_id: string
          rounding: string
          symbol: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          decimal_places?: number
          id?: string
          name: string
          restaurant_id: string
          rounding?: string
          symbol: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          decimal_places?: number
          id?: string
          name?: string
          restaurant_id?: string
          rounding?: string
          symbol?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_property_currencies_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_property_department_contacts: {
        Row: {
          active: boolean
          contact_name: string | null
          created_at: string
          department_id: string
          email: string | null
          id: string
          phone: string | null
          restaurant_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          contact_name?: string | null
          created_at?: string
          department_id: string
          email?: string | null
          id?: string
          phone?: string | null
          restaurant_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          contact_name?: string | null
          created_at?: string
          department_id?: string
          email?: string | null
          id?: string
          phone?: string | null
          restaurant_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_property_department_contacts_department_fk"
            columns: ["department_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_departments"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_property_department_contacts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_report_categories: {
        Row: {
          active: boolean
          code: string
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      pms_report_definition_settings: {
        Row: {
          created_at: string
          definition_id: string
          enabled: boolean
          id: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          definition_id: string
          enabled?: boolean
          id?: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          definition_id?: string
          enabled?: boolean
          id?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_report_definition_settings_definition_id_fkey"
            columns: ["definition_id"]
            isOneToOne: false
            referencedRelation: "pms_report_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_report_definition_settings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_report_definitions: {
        Row: {
          active: boolean
          category_id: string
          code: string
          created_at: string
          description: string | null
          id: string
          name: string
          query_key: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          category_id: string
          code: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          query_key: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          category_id?: string
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          query_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_report_definitions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "pms_report_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_report_permissions: {
        Row: {
          created_at: string
          definition_id: string
          id: string
          permission_id: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          definition_id: string
          id?: string
          permission_id: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          definition_id?: string
          id?: string
          permission_id?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_report_permissions_definition_id_fkey"
            columns: ["definition_id"]
            isOneToOne: false
            referencedRelation: "pms_report_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_report_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "pms_permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_report_permissions_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_report_policies: {
        Row: {
          active: boolean
          created_at: string
          default_date_range_days: number
          export_allowed: boolean
          export_csv: boolean
          export_pdf: boolean
          id: string
          mask_guest_names: boolean
          owner_manager_export_only: boolean
          period_basis: string
          restaurant_id: string
          schedule_cadence: string | null
          schedule_intent_enabled: boolean
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          default_date_range_days?: number
          export_allowed?: boolean
          export_csv?: boolean
          export_pdf?: boolean
          id?: string
          mask_guest_names?: boolean
          owner_manager_export_only?: boolean
          period_basis?: string
          restaurant_id: string
          schedule_cadence?: string | null
          schedule_intent_enabled?: boolean
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          default_date_range_days?: number
          export_allowed?: boolean
          export_csv?: boolean
          export_pdf?: boolean
          id?: string
          mask_guest_names?: boolean
          owner_manager_export_only?: boolean
          period_basis?: string
          restaurant_id?: string
          schedule_cadence?: string | null
          schedule_intent_enabled?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_report_policies_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_restriction_reasons: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
          name: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          name: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
          name?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_restriction_reasons_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_role_permissions: {
        Row: {
          allowed: boolean
          created_at: string
          data_scope: string
          id: string
          permission_id: string
          restaurant_id: string
          role_id: string
          updated_at: string
        }
        Insert: {
          allowed?: boolean
          created_at?: string
          data_scope?: string
          id?: string
          permission_id: string
          restaurant_id: string
          role_id: string
          updated_at?: string
        }
        Update: {
          allowed?: boolean
          created_at?: string
          data_scope?: string
          id?: string
          permission_id?: string
          restaurant_id?: string
          role_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "pms_permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_role_permissions_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_role_permissions_role_fk"
            columns: ["role_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_hotel_roles"
            referencedColumns: ["id", "restaurant_id"]
          },
        ]
      }
      pms_room_inventory_events: {
        Row: {
          actor_membership_id: string
          block_id: string | null
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
          actor_membership_id: string
          block_id?: string | null
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
          actor_membership_id?: string
          block_id?: string | null
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
            foreignKeyName: "pms_room_inventory_events_actor_fk"
            columns: ["actor_membership_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_room_inventory_events_block_fk"
            columns: ["block_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_operational_inventory_blocks"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_room_inventory_events_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_room_inventory_events_room_fk"
            columns: ["room_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "hotel_rooms"
            referencedColumns: ["id", "restaurant_id"]
          },
        ]
      }
      pms_sales_channel_labels: {
        Row: {
          active: boolean
          attrs: Json
          code: string
          created_at: string
          description: string
          id: string
          name: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          attrs?: Json
          code: string
          created_at?: string
          description?: string
          id?: string
          name: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          attrs?: Json
          code?: string
          created_at?: string
          description?: string
          id?: string
          name?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_sales_channel_labels_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_sales_pipeline_stages: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
          is_terminal: boolean
          name: string
          restaurant_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          is_terminal?: boolean
          name: string
          restaurant_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
          is_terminal?: boolean
          name?: string
          restaurant_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_sales_pipeline_stages_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_season_room_types: {
        Row: {
          created_at: string
          id: string
          restaurant_id: string
          room_type_id: string
          season_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          restaurant_id: string
          room_type_id: string
          season_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          restaurant_id?: string
          room_type_id?: string
          season_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_season_room_types_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_season_room_types_room_type_fk"
            columns: ["room_type_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_season_room_types_season_fk"
            columns: ["season_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_seasons"
            referencedColumns: ["id", "restaurant_id"]
          },
        ]
      }
      pms_seasons: {
        Row: {
          active: boolean
          code: string
          created_at: string
          description: string | null
          id: string
          name: string
          rate_adjustment_percent: number | null
          restaurant_id: string
          season_type: string
          updated_at: string
          valid_from: string
          valid_to: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          rate_adjustment_percent?: number | null
          restaurant_id: string
          season_type: string
          updated_at?: string
          valid_from: string
          valid_to: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          rate_adjustment_percent?: number | null
          restaurant_id?: string
          season_type?: string
          updated_at?: string
          valid_from?: string
          valid_to?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_seasons_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_service_charges: {
        Row: {
          active: boolean
          amount: number
          basis: string
          charge_type: string
          code: string
          created_at: string
          id: string
          name: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          amount: number
          basis?: string
          charge_type?: string
          code: string
          created_at?: string
          id?: string
          name: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          amount?: number
          basis?: string
          charge_type?: string
          code?: string
          created_at?: string
          id?: string
          name?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_service_charges_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_shift_definitions: {
        Row: {
          active: boolean
          code: string
          created_at: string
          end_time: string | null
          id: string
          name: string
          notes: string
          restaurant_id: string
          start_time: string | null
          type_class: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          end_time?: string | null
          id?: string
          name: string
          notes?: string
          restaurant_id: string
          start_time?: string | null
          type_class?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          end_time?: string | null
          id?: string
          name?: string
          notes?: string
          restaurant_id?: string
          start_time?: string | null
          type_class?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_shift_definitions_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_source_codes: {
        Row: {
          active: boolean
          attrs: Json
          code: string
          created_at: string
          description: string
          id: string
          name: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          attrs?: Json
          code: string
          created_at?: string
          description?: string
          id?: string
          name: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          attrs?: Json
          code?: string
          created_at?: string
          description?: string
          id?: string
          name?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_source_codes_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_tax_exemption_rules: {
        Row: {
          active: boolean
          approval_required: boolean
          code: string
          created_at: string
          description: string | null
          documentation_required: boolean
          id: string
          name: string
          reason_category: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          approval_required?: boolean
          code: string
          created_at?: string
          description?: string | null
          documentation_required?: boolean
          id?: string
          name: string
          reason_category?: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          approval_required?: boolean
          code?: string
          created_at?: string
          description?: string | null
          documentation_required?: boolean
          id?: string
          name?: string
          reason_category?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_tax_exemption_rules_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_tax_group_taxes: {
        Row: {
          created_at: string
          id: string
          restaurant_id: string
          tax_group_id: string
          tax_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          restaurant_id: string
          tax_group_id: string
          tax_id: string
        }
        Update: {
          created_at?: string
          id?: string
          restaurant_id?: string
          tax_group_id?: string
          tax_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_tax_group_taxes_group_fk"
            columns: ["tax_group_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_tax_groups"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_tax_group_taxes_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_tax_group_taxes_tax_fk"
            columns: ["tax_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_taxes"
            referencedColumns: ["id", "restaurant_id"]
          },
        ]
      }
      pms_tax_groups: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
          name: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          name: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
          name?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_tax_groups_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_taxes: {
        Row: {
          active: boolean
          amount: number
          basis: string
          calculation: string
          charge_type: string
          code: string
          created_at: string
          id: string
          name: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          amount: number
          basis?: string
          calculation?: string
          charge_type?: string
          code: string
          created_at?: string
          id?: string
          name: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          amount?: number
          basis?: string
          calculation?: string
          charge_type?: string
          code?: string
          created_at?: string
          id?: string
          name?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_taxes_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_work_centers: {
        Row: {
          active: boolean
          code: string
          created_at: string
          department_id: string
          id: string
          name: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          department_id: string
          id?: string
          name: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          department_id?: string
          id?: string
          name?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_work_centers_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "pms_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_work_centers_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
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
          hotel_role_id: string | null
          id: string
          restaurant_id: string
          role: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          hotel_role_id?: string | null
          id?: string
          restaurant_id: string
          role: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          hotel_role_id?: string | null
          id?: string
          restaurant_id?: string
          role?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_users_hotel_role_fk"
            columns: ["hotel_role_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_hotel_roles"
            referencedColumns: ["id", "restaurant_id"]
          },
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
          address_house_no: string | null
          address_kebele: string | null
          address_region: string | null
          address_subcity: string | null
          address_woreda: string | null
          address_zone: string | null
          approved: boolean
          approved_at: string | null
          approved_by: string | null
          booking_contact_email: string | null
          booking_contact_phone: string | null
          booking_message: string | null
          brand_affiliation: string | null
          brand_code: string | null
          brand_name: string | null
          business_date: string | null
          business_date_blockers: Json
          business_date_config: Json
          business_type: string | null
          cancel_fee_basis: string | null
          cancel_window_hours: number | null
          chain_name: string | null
          check_in_time: string | null
          check_out_time: string | null
          checkin_ops: Json
          checkin_policy_text: string | null
          checkout_policy_text: string | null
          city: string | null
          country: string | null
          cover_image_url: string | null
          created_at: string
          currency_code: string
          default_language: string | null
          department_contacts: Json
          deposit_required: boolean | null
          deposit_type: string | null
          deposit_value: number | null
          direct_booking_enabled: boolean
          early_checkin_allowed: boolean | null
          early_checkin_fee: number | null
          early_checkin_needs_approval: boolean | null
          early_checkin_policy_text: string | null
          email: string | null
          emergency_contacts: Json
          fo_cancel_fee_default: number
          fo_cancel_fee_required: boolean
          fo_noshow_fee_default: number
          fo_noshow_fee_required: boolean
          full_address: string | null
          hotel_day_open: boolean | null
          id: string
          identity_toggles: Json
          late_checkout_allowed: boolean | null
          late_checkout_fee: number | null
          late_checkout_needs_approval: boolean | null
          late_checkout_policy_text: string | null
          latitude: number | null
          legal_entity_name: string | null
          legal_entity_type: string | null
          legal_extras: Json
          legal_name: string | null
          legal_upload_refs: Json
          licence_number: string | null
          location_extras: Json
          logo_url: string | null
          longitude: number | null
          name: string
          noshow_fee_basis: string | null
          opening_date: string | null
          phone: string | null
          pms_admin_controls: Json
          pms_audit_retention_posture: Json
          pms_distribution_channel_posture: Json
          pms_distribution_mapping_posture: Json
          pms_guest_profile_rules: Json
          pms_hk_cleaning_posture: Json
          pms_hk_status_rules: Json
          pms_maintenance_sla: Json
          pms_notification_channels: Json
          pms_notification_event_rules: Json
          pms_offline_enablement_posture: Json
          pms_offline_sync_posture: Json
          pms_ooo_oos_posture: Json
          pms_property_setup_status: Json
          pms_rate_package_rules: Json
          pms_reports_catalogue_posture: Json
          pms_reports_schedule_access_posture: Json
          pms_routing_defaults: Json
          pms_session_access_posture: Json
          pms_set1_live: boolean
          postcode: string | null
          primary_brand_colour: string | null
          property_areas: Json
          property_code: string | null
          property_type: string | null
          registration_number: string | null
          rejection_reason: string | null
          secondary_brand_colour: string | null
          service_enabled: boolean
          service_rate: number
          short_description: string | null
          single_building_mode: boolean
          slug: string
          social_contacts: Json
          star_rating: number | null
          status_updated_at: string | null
          structure_rules_posture: Json
          suspension_reason: string | null
          tax_identities: Json
          tax_inclusive: boolean
          tax_name: string | null
          tax_rate: number
          tax_upload_refs: Json
          timezone: string
          tin_number: string | null
          trading_name: string | null
          updated_at: string
          vat_number: string | null
          vat_registered: boolean
          website_url: string | null
          whatsapp: string | null
        }
        Insert: {
          active?: boolean
          address?: string | null
          address_house_no?: string | null
          address_kebele?: string | null
          address_region?: string | null
          address_subcity?: string | null
          address_woreda?: string | null
          address_zone?: string | null
          approved?: boolean
          approved_at?: string | null
          approved_by?: string | null
          booking_contact_email?: string | null
          booking_contact_phone?: string | null
          booking_message?: string | null
          brand_affiliation?: string | null
          brand_code?: string | null
          brand_name?: string | null
          business_date?: string | null
          business_date_blockers?: Json
          business_date_config?: Json
          business_type?: string | null
          cancel_fee_basis?: string | null
          cancel_window_hours?: number | null
          chain_name?: string | null
          check_in_time?: string | null
          check_out_time?: string | null
          checkin_ops?: Json
          checkin_policy_text?: string | null
          checkout_policy_text?: string | null
          city?: string | null
          country?: string | null
          cover_image_url?: string | null
          created_at?: string
          currency_code?: string
          default_language?: string | null
          department_contacts?: Json
          deposit_required?: boolean | null
          deposit_type?: string | null
          deposit_value?: number | null
          direct_booking_enabled?: boolean
          early_checkin_allowed?: boolean | null
          early_checkin_fee?: number | null
          early_checkin_needs_approval?: boolean | null
          early_checkin_policy_text?: string | null
          email?: string | null
          emergency_contacts?: Json
          fo_cancel_fee_default?: number
          fo_cancel_fee_required?: boolean
          fo_noshow_fee_default?: number
          fo_noshow_fee_required?: boolean
          full_address?: string | null
          hotel_day_open?: boolean | null
          id?: string
          identity_toggles?: Json
          late_checkout_allowed?: boolean | null
          late_checkout_fee?: number | null
          late_checkout_needs_approval?: boolean | null
          late_checkout_policy_text?: string | null
          latitude?: number | null
          legal_entity_name?: string | null
          legal_entity_type?: string | null
          legal_extras?: Json
          legal_name?: string | null
          legal_upload_refs?: Json
          licence_number?: string | null
          location_extras?: Json
          logo_url?: string | null
          longitude?: number | null
          name: string
          noshow_fee_basis?: string | null
          opening_date?: string | null
          phone?: string | null
          pms_admin_controls?: Json
          pms_audit_retention_posture?: Json
          pms_distribution_channel_posture?: Json
          pms_distribution_mapping_posture?: Json
          pms_guest_profile_rules?: Json
          pms_hk_cleaning_posture?: Json
          pms_hk_status_rules?: Json
          pms_maintenance_sla?: Json
          pms_notification_channels?: Json
          pms_notification_event_rules?: Json
          pms_offline_enablement_posture?: Json
          pms_offline_sync_posture?: Json
          pms_ooo_oos_posture?: Json
          pms_property_setup_status?: Json
          pms_rate_package_rules?: Json
          pms_reports_catalogue_posture?: Json
          pms_reports_schedule_access_posture?: Json
          pms_routing_defaults?: Json
          pms_session_access_posture?: Json
          pms_set1_live?: boolean
          postcode?: string | null
          primary_brand_colour?: string | null
          property_areas?: Json
          property_code?: string | null
          property_type?: string | null
          registration_number?: string | null
          rejection_reason?: string | null
          secondary_brand_colour?: string | null
          service_enabled?: boolean
          service_rate?: number
          short_description?: string | null
          single_building_mode?: boolean
          slug: string
          social_contacts?: Json
          star_rating?: number | null
          status_updated_at?: string | null
          structure_rules_posture?: Json
          suspension_reason?: string | null
          tax_identities?: Json
          tax_inclusive?: boolean
          tax_name?: string | null
          tax_rate?: number
          tax_upload_refs?: Json
          timezone?: string
          tin_number?: string | null
          trading_name?: string | null
          updated_at?: string
          vat_number?: string | null
          vat_registered?: boolean
          website_url?: string | null
          whatsapp?: string | null
        }
        Update: {
          active?: boolean
          address?: string | null
          address_house_no?: string | null
          address_kebele?: string | null
          address_region?: string | null
          address_subcity?: string | null
          address_woreda?: string | null
          address_zone?: string | null
          approved?: boolean
          approved_at?: string | null
          approved_by?: string | null
          booking_contact_email?: string | null
          booking_contact_phone?: string | null
          booking_message?: string | null
          brand_affiliation?: string | null
          brand_code?: string | null
          brand_name?: string | null
          business_date?: string | null
          business_date_blockers?: Json
          business_date_config?: Json
          business_type?: string | null
          cancel_fee_basis?: string | null
          cancel_window_hours?: number | null
          chain_name?: string | null
          check_in_time?: string | null
          check_out_time?: string | null
          checkin_ops?: Json
          checkin_policy_text?: string | null
          checkout_policy_text?: string | null
          city?: string | null
          country?: string | null
          cover_image_url?: string | null
          created_at?: string
          currency_code?: string
          default_language?: string | null
          department_contacts?: Json
          deposit_required?: boolean | null
          deposit_type?: string | null
          deposit_value?: number | null
          direct_booking_enabled?: boolean
          early_checkin_allowed?: boolean | null
          early_checkin_fee?: number | null
          early_checkin_needs_approval?: boolean | null
          early_checkin_policy_text?: string | null
          email?: string | null
          emergency_contacts?: Json
          fo_cancel_fee_default?: number
          fo_cancel_fee_required?: boolean
          fo_noshow_fee_default?: number
          fo_noshow_fee_required?: boolean
          full_address?: string | null
          hotel_day_open?: boolean | null
          id?: string
          identity_toggles?: Json
          late_checkout_allowed?: boolean | null
          late_checkout_fee?: number | null
          late_checkout_needs_approval?: boolean | null
          late_checkout_policy_text?: string | null
          latitude?: number | null
          legal_entity_name?: string | null
          legal_entity_type?: string | null
          legal_extras?: Json
          legal_name?: string | null
          legal_upload_refs?: Json
          licence_number?: string | null
          location_extras?: Json
          logo_url?: string | null
          longitude?: number | null
          name?: string
          noshow_fee_basis?: string | null
          opening_date?: string | null
          phone?: string | null
          pms_admin_controls?: Json
          pms_audit_retention_posture?: Json
          pms_distribution_channel_posture?: Json
          pms_distribution_mapping_posture?: Json
          pms_guest_profile_rules?: Json
          pms_hk_cleaning_posture?: Json
          pms_hk_status_rules?: Json
          pms_maintenance_sla?: Json
          pms_notification_channels?: Json
          pms_notification_event_rules?: Json
          pms_offline_enablement_posture?: Json
          pms_offline_sync_posture?: Json
          pms_ooo_oos_posture?: Json
          pms_property_setup_status?: Json
          pms_rate_package_rules?: Json
          pms_reports_catalogue_posture?: Json
          pms_reports_schedule_access_posture?: Json
          pms_routing_defaults?: Json
          pms_session_access_posture?: Json
          pms_set1_live?: boolean
          postcode?: string | null
          primary_brand_colour?: string | null
          property_areas?: Json
          property_code?: string | null
          property_type?: string | null
          registration_number?: string | null
          rejection_reason?: string | null
          secondary_brand_colour?: string | null
          service_enabled?: boolean
          service_rate?: number
          short_description?: string | null
          single_building_mode?: boolean
          slug?: string
          social_contacts?: Json
          star_rating?: number | null
          status_updated_at?: string | null
          structure_rules_posture?: Json
          suspension_reason?: string | null
          tax_identities?: Json
          tax_inclusive?: boolean
          tax_name?: string | null
          tax_rate?: number
          tax_upload_refs?: Json
          timezone?: string
          tin_number?: string | null
          trading_name?: string | null
          updated_at?: string
          vat_number?: string | null
          vat_registered?: boolean
          website_url?: string | null
          whatsapp?: string | null
        }
        Relationships: []
      }
      room_amenities: {
        Row: {
          active: boolean
          category: string | null
          code: string | null
          complimentary: boolean
          created_at: string
          description: string | null
          display_to_guest: boolean
          icon: string | null
          id: string
          internal_only: boolean
          name: string
          restaurant_id: string
        }
        Insert: {
          active?: boolean
          category?: string | null
          code?: string | null
          complimentary?: boolean
          created_at?: string
          description?: string | null
          display_to_guest?: boolean
          icon?: string | null
          id?: string
          internal_only?: boolean
          name: string
          restaurant_id: string
        }
        Update: {
          active?: boolean
          category?: string | null
          code?: string | null
          complimentary?: boolean
          created_at?: string
          description?: string | null
          display_to_guest?: boolean
          icon?: string | null
          id?: string
          internal_only?: boolean
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
      room_type_beds: {
        Row: {
          bed_count: number
          bed_size: string | null
          bed_type: string
          created_at: string
          id: string
          restaurant_id: string
          room_type_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          bed_count: number
          bed_size?: string | null
          bed_type: string
          created_at?: string
          id?: string
          restaurant_id: string
          room_type_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          bed_count?: number
          bed_size?: string | null
          bed_type?: string
          created_at?: string
          id?: string
          restaurant_id?: string
          room_type_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_type_beds_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_type_beds_type_fk"
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
          accessible_eligible: boolean
          active: boolean
          adult_capacity: number
          bed_count: number | null
          bed_type: string | null
          category: string | null
          child_capacity: number
          class: string | null
          code: string
          connecting_eligible: boolean
          created_at: string
          created_by_staff_membership_id: string | null
          default_building_id: string | null
          default_wing_id: string | null
          description: string | null
          display_name: string | null
          extra_bed_allowed: boolean
          extra_guest_allowed: boolean
          id: string
          infant_capacity: number
          max_occupancy: number
          name: string
          preferred_floor_id: string | null
          restaurant_id: string
          room_size: string | null
          room_view: string | null
          sellable: boolean
          short_name: string | null
          smoking_policy: string
          standard_occupancy: number
          updated_at: string
        }
        Insert: {
          accessible_eligible?: boolean
          active?: boolean
          adult_capacity?: number
          bed_count?: number | null
          bed_type?: string | null
          category?: string | null
          child_capacity?: number
          class?: string | null
          code: string
          connecting_eligible?: boolean
          created_at?: string
          created_by_staff_membership_id?: string | null
          default_building_id?: string | null
          default_wing_id?: string | null
          description?: string | null
          display_name?: string | null
          extra_bed_allowed?: boolean
          extra_guest_allowed?: boolean
          id?: string
          infant_capacity?: number
          max_occupancy?: number
          name: string
          preferred_floor_id?: string | null
          restaurant_id: string
          room_size?: string | null
          room_view?: string | null
          sellable?: boolean
          short_name?: string | null
          smoking_policy?: string
          standard_occupancy?: number
          updated_at?: string
        }
        Update: {
          accessible_eligible?: boolean
          active?: boolean
          adult_capacity?: number
          bed_count?: number | null
          bed_type?: string | null
          category?: string | null
          child_capacity?: number
          class?: string | null
          code?: string
          connecting_eligible?: boolean
          created_at?: string
          created_by_staff_membership_id?: string | null
          default_building_id?: string | null
          default_wing_id?: string | null
          description?: string | null
          display_name?: string | null
          extra_bed_allowed?: boolean
          extra_guest_allowed?: boolean
          id?: string
          infant_capacity?: number
          max_occupancy?: number
          name?: string
          preferred_floor_id?: string | null
          restaurant_id?: string
          room_size?: string | null
          room_view?: string | null
          sellable?: boolean
          short_name?: string | null
          smoking_policy?: string
          standard_occupancy?: number
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
            foreignKeyName: "room_types_default_building_fk"
            columns: ["default_building_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "hotel_buildings"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "room_types_default_wing_fk"
            columns: ["default_wing_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "hotel_wings"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "room_types_preferred_floor_fk"
            columns: ["preferred_floor_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "hotel_floors"
            referencedColumns: ["id", "restaurant_id"]
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
          commercial_booking_source: string | null
          company_master_id: string | null
          company_name: string | null
          confirmation_number: string
          created_at: string
          created_by_staff_membership_id: string | null
          currency: string | null
          departure_date: string
          external_reference: string | null
          group_account_master_id: string | null
          group_name: string | null
          guarantee_method: string | null
          guest_id: string
          id: string
          market_segment: string | null
          nightly_rate_snapshot: Json | null
          notes: string | null
          priced_at: string | null
          rate_plan_id: string | null
          restaurant_id: string
          room_id: string | null
          room_subtotal: number | null
          room_type_id: string
          source: string
          special_request_category: string | null
          special_requests: string | null
          status: string
          travel_agent_master_id: string | null
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
          commercial_booking_source: string | null
          company_master_id: string | null
          company_name: string | null
          confirmation_number: string
          created_at: string
          created_by_staff_membership_id: string | null
          currency: string | null
          departure_date: string
          external_reference: string | null
          group_account_master_id: string | null
          group_name: string | null
          guarantee_method: string | null
          guest_id: string
          id: string
          market_segment: string | null
          nightly_rate_snapshot: Json | null
          notes: string | null
          priced_at: string | null
          rate_plan_id: string | null
          restaurant_id: string
          room_id: string | null
          room_subtotal: number | null
          room_type_id: string
          source: string
          special_request_category: string | null
          special_requests: string | null
          status: string
          travel_agent_master_id: string | null
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
      apply_rm_order_comp: {
        Args: {
          _comp_amount: number
          _discount_amount: number
          _discount_type: string
          _discount_value: number
          _lines: Json
          _membership_id: string
          _order_id: string
          _reason: string
          _restaurant_id: string
          _scope: string
          _service_amount: number
          _tax_amount: number
          _total: number
        }
        Returns: {
          assigned_waiter_membership_id: string | null
          assigned_waiter_name_snapshot: string | null
          billing_method: string | null
          cashier_shift_id: string | null
          check_comped: boolean
          comp_amount: number
          created_at: string
          created_by_staff_membership_id: string | null
          created_by_staff_name_snapshot: string | null
          customer_id: string | null
          discount_amount: number
          discount_applied_at: string | null
          discount_applied_by_membership_id: string | null
          discount_reason: string | null
          discount_type: string | null
          discount_value: number | null
          guest_token_hash: string | null
          id: string
          merchandise_subtotal: number | null
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
          service_amount: number | null
          service_enabled_snapshot: boolean | null
          service_rate_snapshot: number | null
          status: string
          table_number: string
          tax_amount: number | null
          tax_inclusive_snapshot: boolean | null
          tax_rate_snapshot: number | null
          total: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      apply_rm_order_discount: {
        Args: {
          _comp_amount: number
          _discount_amount: number
          _discount_type: string
          _discount_value: number
          _membership_id: string
          _order_id: string
          _reason: string
          _restaurant_id: string
          _service_amount: number
          _tax_amount: number
          _total: number
        }
        Returns: {
          assigned_waiter_membership_id: string | null
          assigned_waiter_name_snapshot: string | null
          billing_method: string | null
          cashier_shift_id: string | null
          check_comped: boolean
          comp_amount: number
          created_at: string
          created_by_staff_membership_id: string | null
          created_by_staff_name_snapshot: string | null
          customer_id: string | null
          discount_amount: number
          discount_applied_at: string | null
          discount_applied_by_membership_id: string | null
          discount_reason: string | null
          discount_type: string | null
          discount_value: number | null
          guest_token_hash: string | null
          id: string
          merchandise_subtotal: number | null
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
          service_amount: number | null
          service_enabled_snapshot: boolean | null
          service_rate_snapshot: number | null
          status: string
          table_number: string
          tax_amount: number | null
          tax_inclusive_snapshot: boolean | null
          tax_rate_snapshot: number | null
          total: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
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
          _arrival: string
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
          commercial_booking_source: string | null
          company_master_id: string | null
          company_name: string | null
          confirmation_number: string
          created_at: string
          created_by_staff_membership_id: string | null
          currency: string | null
          departure_date: string
          external_reference: string | null
          group_account_master_id: string | null
          group_name: string | null
          guarantee_method: string | null
          guest_id: string
          id: string
          market_segment: string | null
          nightly_rate_snapshot: Json | null
          notes: string | null
          priced_at: string | null
          rate_plan_id: string | null
          restaurant_id: string
          room_id: string | null
          room_subtotal: number | null
          room_type_id: string
          source: string
          special_request_category: string | null
          special_requests: string | null
          status: string
          travel_agent_master_id: string | null
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
          commercial_booking_source: string | null
          company_master_id: string | null
          company_name: string | null
          confirmation_number: string
          created_at: string
          created_by_staff_membership_id: string | null
          currency: string | null
          departure_date: string
          external_reference: string | null
          group_account_master_id: string | null
          group_name: string | null
          guarantee_method: string | null
          guest_id: string
          id: string
          market_segment: string | null
          nightly_rate_snapshot: Json | null
          notes: string | null
          priced_at: string | null
          rate_plan_id: string | null
          restaurant_id: string
          room_id: string | null
          room_subtotal: number | null
          room_type_id: string
          source: string
          special_request_category: string | null
          special_requests: string | null
          status: string
          travel_agent_master_id: string | null
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
          commercial_booking_source: string | null
          company_master_id: string | null
          company_name: string | null
          confirmation_number: string
          created_at: string
          created_by_staff_membership_id: string | null
          currency: string | null
          departure_date: string
          external_reference: string | null
          group_account_master_id: string | null
          group_name: string | null
          guarantee_method: string | null
          guest_id: string
          id: string
          market_segment: string | null
          nightly_rate_snapshot: Json | null
          notes: string | null
          priced_at: string | null
          rate_plan_id: string | null
          restaurant_id: string
          room_id: string | null
          room_subtotal: number | null
          room_type_id: string
          source: string
          special_request_category: string | null
          special_requests: string | null
          status: string
          travel_agent_master_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "hotel_reservations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      clear_rm_order_discount: {
        Args: {
          _comp_amount: number
          _membership_id: string
          _order_id: string
          _reason: string
          _restaurant_id: string
          _service_amount: number
          _tax_amount: number
          _total: number
        }
        Returns: {
          assigned_waiter_membership_id: string | null
          assigned_waiter_name_snapshot: string | null
          billing_method: string | null
          cashier_shift_id: string | null
          check_comped: boolean
          comp_amount: number
          created_at: string
          created_by_staff_membership_id: string | null
          created_by_staff_name_snapshot: string | null
          customer_id: string | null
          discount_amount: number
          discount_applied_at: string | null
          discount_applied_by_membership_id: string | null
          discount_reason: string | null
          discount_type: string | null
          discount_value: number | null
          guest_token_hash: string | null
          id: string
          merchandise_subtotal: number | null
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
          service_amount: number | null
          service_enabled_snapshot: boolean | null
          service_rate_snapshot: number | null
          status: string
          table_number: string
          tax_amount: number | null
          tax_inclusive_snapshot: boolean | null
          tax_rate_snapshot: number | null
          total: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "orders"
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
      complete_comped_order: {
        Args: {
          _membership_id: string
          _order_id: string
          _restaurant_id: string
        }
        Returns: {
          assigned_waiter_membership_id: string | null
          assigned_waiter_name_snapshot: string | null
          billing_method: string | null
          cashier_shift_id: string | null
          check_comped: boolean
          comp_amount: number
          created_at: string
          created_by_staff_membership_id: string | null
          created_by_staff_name_snapshot: string | null
          customer_id: string | null
          discount_amount: number
          discount_applied_at: string | null
          discount_applied_by_membership_id: string | null
          discount_reason: string | null
          discount_type: string | null
          discount_value: number | null
          guest_token_hash: string | null
          id: string
          merchandise_subtotal: number | null
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
          service_amount: number | null
          service_enabled_snapshot: boolean | null
          service_rate_snapshot: number | null
          status: string
          table_number: string
          tax_amount: number | null
          tax_inclusive_snapshot: boolean | null
          tax_rate_snapshot: number | null
          total: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "orders"
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
          commercial_booking_source: string | null
          company_master_id: string | null
          company_name: string | null
          confirmation_number: string
          created_at: string
          created_by_staff_membership_id: string | null
          currency: string | null
          departure_date: string
          external_reference: string | null
          group_account_master_id: string | null
          group_name: string | null
          guarantee_method: string | null
          guest_id: string
          id: string
          market_segment: string | null
          nightly_rate_snapshot: Json | null
          notes: string | null
          priced_at: string | null
          rate_plan_id: string | null
          restaurant_id: string
          room_id: string | null
          room_subtotal: number | null
          room_type_id: string
          source: string
          special_request_category: string | null
          special_requests: string | null
          status: string
          travel_agent_master_id: string | null
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
          _commercial_booking_source?: string
          _company_master_id?: string
          _departure: string
          _external_reference?: string
          _guarantee_method?: string
          _guest_id: string
          _market_segment?: string
          _membership_id: string
          _notes: string
          _restaurant_id: string
          _room_id: string
          _room_type_id: string
          _special_requests: string
          _status: string
          _travel_agent_master_id?: string
        }
        Returns: {
          adults: number
          arrival_date: string
          cancellation_reason: string | null
          children: number
          commercial_booking_source: string | null
          company_master_id: string | null
          company_name: string | null
          confirmation_number: string
          created_at: string
          created_by_staff_membership_id: string | null
          currency: string | null
          departure_date: string
          external_reference: string | null
          group_account_master_id: string | null
          group_name: string | null
          guarantee_method: string | null
          guest_id: string
          id: string
          market_segment: string | null
          nightly_rate_snapshot: Json | null
          notes: string | null
          priced_at: string | null
          rate_plan_id: string | null
          restaurant_id: string
          room_id: string | null
          room_subtotal: number | null
          room_type_id: string
          source: string
          special_request_category: string | null
          special_requests: string | null
          status: string
          travel_agent_master_id: string | null
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
          _commercial_booking_source?: string
          _company_master_id?: string
          _departure: string
          _external_reference?: string
          _guarantee_method?: string
          _guest_id: string
          _market_segment?: string
          _membership_id: string
          _notes: string
          _rate_plan_id: string
          _restaurant_id: string
          _room_id: string
          _room_type_id: string
          _special_requests: string
          _status: string
          _travel_agent_master_id?: string
        }
        Returns: {
          adults: number
          arrival_date: string
          cancellation_reason: string | null
          children: number
          commercial_booking_source: string | null
          company_master_id: string | null
          company_name: string | null
          confirmation_number: string
          created_at: string
          created_by_staff_membership_id: string | null
          currency: string | null
          departure_date: string
          external_reference: string | null
          group_account_master_id: string | null
          group_name: string | null
          guarantee_method: string | null
          guest_id: string
          id: string
          market_segment: string | null
          nightly_rate_snapshot: Json | null
          notes: string | null
          priced_at: string | null
          rate_plan_id: string | null
          restaurant_id: string
          room_id: string | null
          room_subtotal: number | null
          room_type_id: string
          source: string
          special_request_category: string | null
          special_requests: string | null
          status: string
          travel_agent_master_id: string | null
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
      freeze_order_receipt: {
        Args: { _order_id: string; _restaurant_id: string; _snapshot: Json }
        Returns: {
          created_at: string
          id: string
          last_reprinted_at: string | null
          order_id: string
          reprint_count: number
          restaurant_id: string
          snapshot: Json
        }
        SetofOptions: {
          from: "*"
          to: "order_receipts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
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
          commercial_booking_source: string | null
          company_master_id: string | null
          company_name: string | null
          confirmation_number: string
          created_at: string
          created_by_staff_membership_id: string | null
          currency: string | null
          departure_date: string
          external_reference: string | null
          group_account_master_id: string | null
          group_name: string | null
          guarantee_method: string | null
          guest_id: string
          id: string
          market_segment: string | null
          nightly_rate_snapshot: Json | null
          notes: string | null
          priced_at: string | null
          rate_plan_id: string | null
          restaurant_id: string
          room_id: string | null
          room_subtotal: number | null
          room_type_id: string
          source: string
          special_request_category: string | null
          special_requests: string | null
          status: string
          travel_agent_master_id: string | null
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
          commercial_booking_source: string | null
          company_master_id: string | null
          company_name: string | null
          confirmation_number: string
          created_at: string
          created_by_staff_membership_id: string | null
          currency: string | null
          departure_date: string
          external_reference: string | null
          group_account_master_id: string | null
          group_name: string | null
          guarantee_method: string | null
          guest_id: string
          id: string
          market_segment: string | null
          nightly_rate_snapshot: Json | null
          notes: string | null
          priced_at: string | null
          rate_plan_id: string | null
          restaurant_id: string
          room_id: string | null
          room_subtotal: number | null
          room_type_id: string
          source: string
          special_request_category: string | null
          special_requests: string | null
          status: string
          travel_agent_master_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "hotel_reservations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      next_guest_profile_number: {
        Args: { _restaurant_id: string }
        Returns: string
      }
      next_guest_service_number: {
        Args: { _restaurant_id: string }
        Returns: string
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
      pms_activate_operational_block: {
        Args: {
          _block_id: string
          _membership_id: string
          _restaurant_id: string
        }
        Returns: undefined
      }
      pms_approve_operational_block: {
        Args: {
          _approver_membership_id: string
          _block_id: string
          _restaurant_id: string
        }
        Returns: undefined
      }
      pms_assert_operational_block_activatable: {
        Args: { _block_id: string; _restaurant_id: string }
        Returns: undefined
      }
      pms_cancel_operational_block: {
        Args: {
          _block_id: string
          _membership_id: string
          _notes: string
          _restaurant_id: string
        }
        Returns: undefined
      }
      pms_count_available_inventory: {
        Args: {
          _arrival: string
          _departure: string
          _exclude_reservation_id?: string
          _restaurant_id: string
          _room_type_id: string
        }
        Returns: number
      }
      pms_create_operational_block: {
        Args: {
          _block_type: string
          _end_date: string
          _group_id: string
          _membership_id: string
          _notes: string
          _quantity: number
          _reason: string
          _restaurant_id: string
          _room_id: string
          _room_type_id: string
          _start_date: string
          _target_kind: string
        }
        Returns: string
      }
      pms_evaluate_room_assignment: {
        Args: {
          _accessible_required?: boolean
          _adults?: number
          _arrival: string
          _children?: number
          _connecting_required?: boolean
          _departure: string
          _exclude_reservation_id?: string
          _for_check_in?: boolean
          _guest_preference_matched?: boolean
          _preferred_building_id?: string
          _preferred_floor_id?: string
          _required_bed_type?: string
          _restaurant_id: string
          _room_id: string
          _room_type_id: string
        }
        Returns: Json
      }
      pms_housekeeping_event_priority: {
        Args: { _event_code: string; _fallback: string; _restaurant_id: string }
        Returns: string
      }
      pms_housekeeping_transition_target: {
        Args: { _event_code: string; _fallback: string; _restaurant_id: string }
        Returns: string
      }
      pms_integration_config_is_safe: {
        Args: { _config: Json }
        Returns: boolean
      }
      pms_release_operational_block: {
        Args: {
          _block_id: string
          _membership_id: string
          _release_reason: string
          _restaurant_id: string
        }
        Returns: undefined
      }
      pms_room_type_availability: {
        Args: {
          _arrival: string
          _departure: string
          _exclude_reservation_id?: string
          _restaurant_id: string
          _room_type_id: string
        }
        Returns: {
          arrival: string
          available: number
          business_date: string
          departure: string
          limiting_date: string
          nightly: Json
          overbooking_allowance: number
          physical_capacity: number
          room_type_id: string
        }[]
      }
      pms_set_room_operational_restriction: {
        Args: {
          _approver_membership_id?: string
          _expected_return: string
          _maintenance_request_id?: string
          _membership_id: string
          _reason: string
          _reopening_inspection_id?: string
          _restaurant_id: string
          _room_id: string
          _status: string
        }
        Returns: undefined
      }
      pms_write_room_inventory_event: {
        Args: {
          _actor_membership_id: string
          _block_id: string
          _event_type: string
          _new_values: Json
          _notes: string
          _previous_values: Json
          _restaurant_id: string
          _room_id: string
        }
        Returns: undefined
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
      record_order_receipt_reprint: {
        Args: { _order_id: string; _restaurant_id: string }
        Returns: {
          created_at: string
          id: string
          last_reprinted_at: string | null
          order_id: string
          reprint_count: number
          restaurant_id: string
          snapshot: Json
        }
        SetofOptions: {
          from: "*"
          to: "order_receipts"
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
          commercial_booking_source: string | null
          company_master_id: string | null
          company_name: string | null
          confirmation_number: string
          created_at: string
          created_by_staff_membership_id: string | null
          currency: string | null
          departure_date: string
          external_reference: string | null
          group_account_master_id: string | null
          group_name: string | null
          guarantee_method: string | null
          guest_id: string
          id: string
          market_segment: string | null
          nightly_rate_snapshot: Json | null
          notes: string | null
          priced_at: string | null
          rate_plan_id: string | null
          restaurant_id: string
          room_id: string | null
          room_subtotal: number | null
          room_type_id: string
          source: string
          special_request_category: string | null
          special_requests: string | null
          status: string
          travel_agent_master_id: string | null
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
