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
    PostgrestVersion: "14.17"
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
          channel_property_code: string | null
          channel_type: string
          code: string
          created_at: string
          environment: string
          external_operations: string[]
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
          channel_property_code?: string | null
          channel_type?: string
          code: string
          created_at?: string
          environment?: string
          external_operations?: string[]
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
          channel_property_code?: string | null
          channel_type?: string
          code?: string
          created_at?: string
          environment?: string
          external_operations?: string[]
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
          external_room_code: string | null
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
          external_room_code?: string | null
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
          external_room_code?: string | null
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
      financial_account_counters: {
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
            foreignKeyName: "financial_account_counters_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_account_invoice_draft_items: {
        Row: {
          created_at: string
          draft_id: string
          id: string
          source_group_id: string
        }
        Insert: {
          created_at?: string
          draft_id: string
          id?: string
          source_group_id: string
        }
        Update: {
          created_at?: string
          draft_id?: string
          id?: string
          source_group_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_account_invoice_draft_items_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "financial_account_invoice_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_account_invoice_draft_items_source_group_id_fkey"
            columns: ["source_group_id"]
            isOneToOne: false
            referencedRelation: "folio_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_account_invoice_drafts: {
        Row: {
          created_at: string
          created_by_membership_id: string
          financial_account_id: string
          id: string
          notes: string | null
          restaurant_id: string
          updated_at: string
          updated_by_membership_id: string
        }
        Insert: {
          created_at?: string
          created_by_membership_id: string
          financial_account_id: string
          id?: string
          notes?: string | null
          restaurant_id: string
          updated_at?: string
          updated_by_membership_id: string
        }
        Update: {
          created_at?: string
          created_by_membership_id?: string
          financial_account_id?: string
          id?: string
          notes?: string | null
          restaurant_id?: string
          updated_at?: string
          updated_by_membership_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_account_invoice_drafts_account_fk"
            columns: ["financial_account_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "financial_account_invoice_drafts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_account_invoice_events: {
        Row: {
          actor_membership_id: string | null
          created_at: string
          event_type: string
          financial_account_id: string
          id: string
          invoice_id: string | null
          new_values: Json | null
          restaurant_id: string
        }
        Insert: {
          actor_membership_id?: string | null
          created_at?: string
          event_type: string
          financial_account_id: string
          id?: string
          invoice_id?: string | null
          new_values?: Json | null
          restaurant_id: string
        }
        Update: {
          actor_membership_id?: string | null
          created_at?: string
          event_type?: string
          financial_account_id?: string
          id?: string
          invoice_id?: string | null
          new_values?: Json | null
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_account_invoice_events_account_fk"
            columns: ["financial_account_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "financial_account_invoice_events_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_account_invoice_lines: {
        Row: {
          amount: number
          component_kind: string
          component_transaction_id: string
          created_at: string
          financial_account_id: string
          id: string
          invoice_id: string
          restaurant_id: string
          snapshot: Json
          source_group_id: string
        }
        Insert: {
          amount: number
          component_kind: string
          component_transaction_id: string
          created_at?: string
          financial_account_id: string
          id?: string
          invoice_id: string
          restaurant_id: string
          snapshot: Json
          source_group_id: string
        }
        Update: {
          amount?: number
          component_kind?: string
          component_transaction_id?: string
          created_at?: string
          financial_account_id?: string
          id?: string
          invoice_id?: string
          restaurant_id?: string
          snapshot?: Json
          source_group_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_account_invoice_lines_account_fk"
            columns: ["financial_account_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "financial_account_invoice_lines_component_transaction_id_fkey"
            columns: ["component_transaction_id"]
            isOneToOne: false
            referencedRelation: "folio_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_account_invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "financial_account_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_account_invoice_lines_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_account_invoices: {
        Row: {
          financial_account_id: string
          id: string
          idempotency_key: string | null
          issued_at: string
          issued_by_membership_id: string
          issued_number: string
          last_reprinted_at: string | null
          reprint_count: number
          restaurant_id: string
          sequence_number: number
          snapshot: Json
        }
        Insert: {
          financial_account_id: string
          id?: string
          idempotency_key?: string | null
          issued_at?: string
          issued_by_membership_id: string
          issued_number: string
          last_reprinted_at?: string | null
          reprint_count?: number
          restaurant_id: string
          sequence_number: number
          snapshot: Json
        }
        Update: {
          financial_account_id?: string
          id?: string
          idempotency_key?: string | null
          issued_at?: string
          issued_by_membership_id?: string
          issued_number?: string
          last_reprinted_at?: string | null
          reprint_count?: number
          restaurant_id?: string
          sequence_number?: number
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "financial_account_invoices_account_fk"
            columns: ["financial_account_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "financial_account_invoices_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_account_participants: {
        Row: {
          financial_account_id: string
          guest_folio_id: string
          linked_at: string
          restaurant_id: string
        }
        Insert: {
          financial_account_id: string
          guest_folio_id: string
          linked_at?: string
          restaurant_id: string
        }
        Update: {
          financial_account_id?: string
          guest_folio_id?: string
          linked_at?: string
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_account_participants_account_same_property"
            columns: ["financial_account_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "financial_account_participants_folio_same_property"
            columns: ["guest_folio_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "guest_folios"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "financial_account_participants_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_account_payment_allocations: {
        Row: {
          amount: number
          created_at: string
          created_by_membership_id: string | null
          financial_account_id: string
          id: string
          idempotency_key: string | null
          invoice_id: string
          operation_id: string
          payment_transaction_id: string
          reason: string | null
          restaurant_id: string
          reverses_allocation_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by_membership_id?: string | null
          financial_account_id: string
          id?: string
          idempotency_key?: string | null
          invoice_id: string
          operation_id: string
          payment_transaction_id: string
          reason?: string | null
          restaurant_id: string
          reverses_allocation_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by_membership_id?: string | null
          financial_account_id?: string
          id?: string
          idempotency_key?: string | null
          invoice_id?: string
          operation_id?: string
          payment_transaction_id?: string
          reason?: string | null
          restaurant_id?: string
          reverses_allocation_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "financial_account_payment_allocations_account_property"
            columns: ["financial_account_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "financial_account_payment_allocations_invoice_property"
            columns: ["invoice_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "financial_account_invoices"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "financial_account_payment_allocations_payment_property"
            columns: ["payment_transaction_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "folio_transactions"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "financial_account_payment_allocations_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_account_payment_allocations_reversal_property"
            columns: ["reverses_allocation_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "financial_account_payment_allocations"
            referencedColumns: ["id", "restaurant_id"]
          },
        ]
      }
      financial_accounts: {
        Row: {
          account_kind: string
          account_number: string
          closed_at: string | null
          created_at: string
          created_by_membership_id: string | null
          currency: string
          id: string
          master_id: string
          opened_at: string
          restaurant_id: string
          status: string
          updated_at: string
        }
        Insert: {
          account_kind: string
          account_number: string
          closed_at?: string | null
          created_at?: string
          created_by_membership_id?: string | null
          currency: string
          id?: string
          master_id: string
          opened_at?: string
          restaurant_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          account_kind?: string
          account_number?: string
          closed_at?: string | null
          created_at?: string
          created_by_membership_id?: string | null
          currency?: string
          id?: string
          master_id?: string
          opened_at?: string
          restaurant_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_accounts_created_by_membership_id_fkey"
            columns: ["created_by_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_accounts_master_same_property"
            columns: ["master_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "guest_account_masters"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "financial_accounts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_buyer_code_mappings: {
        Row: {
          active: boolean
          created_at: string
          external_value: string
          id: string
          integration_id: string
          internal_value: string
          mapping_type: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          external_value: string
          id?: string
          integration_id: string
          internal_value: string
          mapping_type: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          external_value?: string
          id?: string
          integration_id?: string
          internal_value?: string
          mapping_type?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_buyer_code_mappings_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "pms_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_buyer_code_mappings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_credential_refs: {
        Row: {
          created_at: string
          integration_id: string
          restaurant_id: string
          updated_at: string
          vault_secret_id: string
        }
        Insert: {
          created_at?: string
          integration_id: string
          restaurant_id: string
          updated_at?: string
          vault_secret_id: string
        }
        Update: {
          created_at?: string
          integration_id?: string
          restaurant_id?: string
          updated_at?: string
          vault_secret_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_credential_refs_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: true
            referencedRelation: "pms_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_credential_refs_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_integration_tokens: {
        Row: {
          access_token: string
          created_at: string
          expires_at: string
          id: string
          integration_id: string
          refresh_lease_until: string | null
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          access_token?: string
          created_at?: string
          expires_at?: string
          id?: string
          integration_id: string
          refresh_lease_until?: string | null
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          access_token?: string
          created_at?: string
          expires_at?: string
          id?: string
          integration_id?: string
          refresh_lease_until?: string | null
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_integration_tokens_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: true
            referencedRelation: "pms_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_integration_tokens_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_item_code_counters: {
        Row: {
          created_at: string
          last_code: number
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          last_code: number
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          last_code?: number
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_item_code_counters_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_item_mappings: {
        Row: {
          active: boolean
          charge_source: string | null
          created_at: string
          department_id: string | null
          external_item_code: string
          external_unit: string
          harmonization_code: string | null
          id: string
          integration_id: string
          is_default: boolean
          nature_of_supplies: string
          restaurant_id: string
          service_type_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          charge_source?: string | null
          created_at?: string
          department_id?: string | null
          external_item_code: string
          external_unit: string
          harmonization_code?: string | null
          id?: string
          integration_id: string
          is_default?: boolean
          nature_of_supplies: string
          restaurant_id: string
          service_type_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          charge_source?: string | null
          created_at?: string
          department_id?: string | null
          external_item_code?: string
          external_unit?: string
          harmonization_code?: string | null
          id?: string
          integration_id?: string
          is_default?: boolean
          nature_of_supplies?: string
          restaurant_id?: string
          service_type_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_item_mappings_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "pms_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_item_mappings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_mode_mappings: {
        Row: {
          active: boolean
          created_at: string
          document_context: string
          external_mode: string
          id: string
          integration_id: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          document_context: string
          external_mode: string
          id?: string
          integration_id: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          document_context?: string
          external_mode?: string
          id?: string
          integration_id?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_mode_mappings_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "pms_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_mode_mappings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_registration_attempts: {
        Row: {
          actor_membership_id: string | null
          attempt_number: number
          completed_at: string | null
          created_at: string
          endpoint: string
          error_code: string | null
          error_message: string | null
          http_status: number | null
          id: string
          latency_ms: number | null
          outcome: string
          registration_id: string
          request_body: Json | null
          request_hash: string | null
          response_body: Json | null
          started_at: string
        }
        Insert: {
          actor_membership_id?: string | null
          attempt_number: number
          completed_at?: string | null
          created_at?: string
          endpoint: string
          error_code?: string | null
          error_message?: string | null
          http_status?: number | null
          id?: string
          latency_ms?: number | null
          outcome: string
          registration_id: string
          request_body?: Json | null
          request_hash?: string | null
          response_body?: Json | null
          started_at?: string
        }
        Update: {
          actor_membership_id?: string | null
          attempt_number?: number
          completed_at?: string | null
          created_at?: string
          endpoint?: string
          error_code?: string | null
          error_message?: string | null
          http_status?: number | null
          id?: string
          latency_ms?: number | null
          outcome?: string
          registration_id?: string
          request_body?: Json | null
          request_hash?: string | null
          response_body?: Json | null
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_registration_attempts_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "fiscal_registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_registrations: {
        Row: {
          acknowledged_at: string | null
          acknowledged_at_raw: string | null
          attempt_count: number
          cancelled_at: string | null
          client_snapshot: string | null
          created_at: string
          created_by_membership_id: string | null
          device_id_snapshot: string | null
          external_document_number: string | null
          external_id: string | null
          external_irn: string | null
          external_rrn: string | null
          external_status: string | null
          fiscal_document_type: string
          id: string
          integration_id: string
          last_error_code: string | null
          last_error_message: string | null
          next_attempt_at: string | null
          registered_at: string | null
          related_registration_id: string | null
          request_hash: string | null
          request_snapshot: Json
          response_snapshot: Json | null
          restaurant_id: string
          signed_document: string | null
          signed_qr: string | null
          source_id: string
          source_type: string
          status: string
          taxpayer_tin_snapshot: string | null
          trnx_id: string
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_at_raw?: string | null
          attempt_count?: number
          cancelled_at?: string | null
          client_snapshot?: string | null
          created_at?: string
          created_by_membership_id?: string | null
          device_id_snapshot?: string | null
          external_document_number?: string | null
          external_id?: string | null
          external_irn?: string | null
          external_rrn?: string | null
          external_status?: string | null
          fiscal_document_type: string
          id?: string
          integration_id: string
          last_error_code?: string | null
          last_error_message?: string | null
          next_attempt_at?: string | null
          registered_at?: string | null
          related_registration_id?: string | null
          request_hash?: string | null
          request_snapshot?: Json
          response_snapshot?: Json | null
          restaurant_id: string
          signed_document?: string | null
          signed_qr?: string | null
          source_id: string
          source_type: string
          status?: string
          taxpayer_tin_snapshot?: string | null
          trnx_id: string
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_at_raw?: string | null
          attempt_count?: number
          cancelled_at?: string | null
          client_snapshot?: string | null
          created_at?: string
          created_by_membership_id?: string | null
          device_id_snapshot?: string | null
          external_document_number?: string | null
          external_id?: string | null
          external_irn?: string | null
          external_rrn?: string | null
          external_status?: string | null
          fiscal_document_type?: string
          id?: string
          integration_id?: string
          last_error_code?: string | null
          last_error_message?: string | null
          next_attempt_at?: string | null
          registered_at?: string | null
          related_registration_id?: string | null
          request_hash?: string | null
          request_snapshot?: Json
          response_snapshot?: Json | null
          restaurant_id?: string
          signed_document?: string | null
          signed_qr?: string | null
          source_id?: string
          source_type?: string
          status?: string
          taxpayer_tin_snapshot?: string | null
          trnx_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_registrations_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "pms_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_registrations_related_registration_id_fkey"
            columns: ["related_registration_id"]
            isOneToOne: false
            referencedRelation: "fiscal_registrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_registrations_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_tax_code_mappings: {
        Row: {
          active: boolean
          created_at: string
          external_item_code: string | null
          external_tax_code: string
          external_unit: string | null
          fiscal_treatment: string
          harmonization_code: string | null
          id: string
          integration_id: string
          mapping_kind: string
          nature_of_supplies: string | null
          pms_tax_id: string | null
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          external_item_code?: string | null
          external_tax_code: string
          external_unit?: string | null
          fiscal_treatment?: string
          harmonization_code?: string | null
          id?: string
          integration_id: string
          mapping_kind?: string
          nature_of_supplies?: string | null
          pms_tax_id?: string | null
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          external_item_code?: string | null
          external_tax_code?: string
          external_unit?: string | null
          fiscal_treatment?: string
          harmonization_code?: string | null
          id?: string
          integration_id?: string
          mapping_kind?: string
          nature_of_supplies?: string | null
          pms_tax_id?: string | null
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_tax_code_mappings_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "pms_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_tax_code_mappings_pms_tax_id_fkey"
            columns: ["pms_tax_id"]
            isOneToOne: false
            referencedRelation: "pms_taxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_tax_code_mappings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      fo_checkin_agreement_instances: {
        Row: {
          acknowledgements: Json
          agreement_version_id: string
          captured_by_membership_id: string | null
          created_at: string
          created_by_membership_id: string | null
          guest_id: string
          id: string
          reservation_id: string
          reservation_room_id: string | null
          restaurant_id: string
          signature_method: string | null
          signature_storage_path: string | null
          signed_at: string | null
        }
        Insert: {
          acknowledgements?: Json
          agreement_version_id: string
          captured_by_membership_id?: string | null
          created_at?: string
          created_by_membership_id?: string | null
          guest_id: string
          id?: string
          reservation_id: string
          reservation_room_id?: string | null
          restaurant_id: string
          signature_method?: string | null
          signature_storage_path?: string | null
          signed_at?: string | null
        }
        Update: {
          acknowledgements?: Json
          agreement_version_id?: string
          captured_by_membership_id?: string | null
          created_at?: string
          created_by_membership_id?: string | null
          guest_id?: string
          id?: string
          reservation_id?: string
          reservation_room_id?: string | null
          restaurant_id?: string
          signature_method?: string | null
          signature_storage_path?: string | null
          signed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fo_checkin_agreement_instances_guest_property"
            columns: ["guest_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "guest_profiles"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "fo_checkin_agreement_instances_reservation_property"
            columns: ["reservation_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "hotel_reservations"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "fo_checkin_agreement_instances_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fo_checkin_agreement_instances_room_property"
            columns: ["reservation_room_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "hotel_reservation_rooms"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "fo_checkin_agreement_instances_version_property"
            columns: ["agreement_version_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_registration_agreement_versions"
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
          reservation_room_id: string | null
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
          reservation_room_id?: string | null
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
          reservation_room_id?: string | null
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
            isOneToOne: false
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
          {
            foreignKeyName: "fo_checkin_progress_room_same_property"
            columns: ["reservation_room_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "hotel_reservation_rooms"
            referencedColumns: ["id", "restaurant_id"]
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
      folio_deposit_allocations: {
        Row: {
          actor_membership_id: string | null
          amount: number
          charge_transaction_id: string
          created_at: string
          deposit_transaction_id: string
          id: string
          idempotency_key: string | null
          restaurant_id: string
        }
        Insert: {
          actor_membership_id?: string | null
          amount: number
          charge_transaction_id: string
          created_at?: string
          deposit_transaction_id: string
          id?: string
          idempotency_key?: string | null
          restaurant_id: string
        }
        Update: {
          actor_membership_id?: string | null
          amount?: number
          charge_transaction_id?: string
          created_at?: string
          deposit_transaction_id?: string
          id?: string
          idempotency_key?: string | null
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "folio_deposit_allocations_actor_membership_id_fkey"
            columns: ["actor_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folio_deposit_allocations_charge_same_property"
            columns: ["charge_transaction_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "folio_transactions"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "folio_deposit_allocations_deposit_same_property"
            columns: ["deposit_transaction_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "folio_transactions"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "folio_deposit_allocations_restaurant_id_fkey"
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
          charge_snapshot: Json | null
          charge_source: string | null
          created_at: string
          department_id: string | null
          description: string
          financial_account_id: string | null
          folio_id: string | null
          folio_window_id: string | null
          hotel_cashier_shift_id: string | null
          id: string
          idempotency_key: string | null
          original_transaction_id: string | null
          payment_method: string | null
          posted_at: string
          posted_by_membership_id: string | null
          quantity: number | null
          reference_id: string | null
          reference_type: string | null
          reservation_room_id: string | null
          restaurant_id: string
          service_type_id: string | null
          tax_snapshot: Json | null
          transaction_type: string
          transfer_direction: string | null
          transfer_id: string | null
          unit_amount: number | null
        }
        Insert: {
          amount: number
          category: string
          charge_snapshot?: Json | null
          charge_source?: string | null
          created_at?: string
          department_id?: string | null
          description: string
          financial_account_id?: string | null
          folio_id?: string | null
          folio_window_id?: string | null
          hotel_cashier_shift_id?: string | null
          id?: string
          idempotency_key?: string | null
          original_transaction_id?: string | null
          payment_method?: string | null
          posted_at?: string
          posted_by_membership_id?: string | null
          quantity?: number | null
          reference_id?: string | null
          reference_type?: string | null
          reservation_room_id?: string | null
          restaurant_id: string
          service_type_id?: string | null
          tax_snapshot?: Json | null
          transaction_type: string
          transfer_direction?: string | null
          transfer_id?: string | null
          unit_amount?: number | null
        }
        Update: {
          amount?: number
          category?: string
          charge_snapshot?: Json | null
          charge_source?: string | null
          created_at?: string
          department_id?: string | null
          description?: string
          financial_account_id?: string | null
          folio_id?: string | null
          folio_window_id?: string | null
          hotel_cashier_shift_id?: string | null
          id?: string
          idempotency_key?: string | null
          original_transaction_id?: string | null
          payment_method?: string | null
          posted_at?: string
          posted_by_membership_id?: string | null
          quantity?: number | null
          reference_id?: string | null
          reference_type?: string | null
          reservation_room_id?: string | null
          restaurant_id?: string
          service_type_id?: string | null
          tax_snapshot?: Json | null
          transaction_type?: string
          transfer_direction?: string | null
          transfer_id?: string | null
          unit_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "folio_transactions_account_same_property"
            columns: ["financial_account_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "folio_transactions_department_fk"
            columns: ["department_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_departments"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "folio_transactions_folio_same_property"
            columns: ["folio_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "guest_folios"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "folio_transactions_hotel_shift_same_property"
            columns: ["hotel_cashier_shift_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "hotel_cashier_shifts"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "folio_transactions_original_same_folio"
            columns: ["original_transaction_id", "restaurant_id", "folio_id"]
            isOneToOne: false
            referencedRelation: "folio_transactions"
            referencedColumns: ["id", "restaurant_id", "folio_id"]
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
          {
            foreignKeyName: "folio_transactions_room_unit_same_property"
            columns: ["reservation_room_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "hotel_reservation_rooms"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "folio_transactions_service_type_fk"
            columns: ["service_type_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_guest_service_types"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "folio_transactions_window_same_property"
            columns: ["folio_window_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "guest_folio_windows"
            referencedColumns: ["id", "restaurant_id"]
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
          billing_currency_code: string | null
          billing_instruction: string | null
          booking_access: string
          booking_notes: string | null
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
          credit_days: number | null
          credit_limit_amount: number | null
          credit_limit_note: string | null
          credit_status: string | null
          default_billing_rule_id: string | null
          default_deposit_policy_id: string | null
          default_no_show_policy_id: string | null
          default_payment_method_id: string | null
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
          payment_timing: string | null
          phone: string | null
          phone_alt: string | null
          phone_normalized: string | null
          postal_code: string | null
          preferred_currency: string | null
          primary_contact_guest_id: string | null
          primary_contact_name: string | null
          primary_contact_title: string | null
          rate_cancellation_policy_id: string | null
          region: string | null
          restaurant_id: string
          source_code_id: string | null
          source_of_business: string | null
          special_requests: string | null
          tax_exempt: boolean
          tax_exemption_certificate_number: string | null
          tax_exemption_rule_id: string | null
          tax_exemption_valid_to: string | null
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
          billing_currency_code?: string | null
          billing_instruction?: string | null
          booking_access?: string
          booking_notes?: string | null
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
          credit_days?: number | null
          credit_limit_amount?: number | null
          credit_limit_note?: string | null
          credit_status?: string | null
          default_billing_rule_id?: string | null
          default_deposit_policy_id?: string | null
          default_no_show_policy_id?: string | null
          default_payment_method_id?: string | null
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
          payment_timing?: string | null
          phone?: string | null
          phone_alt?: string | null
          phone_normalized?: string | null
          postal_code?: string | null
          preferred_currency?: string | null
          primary_contact_guest_id?: string | null
          primary_contact_name?: string | null
          primary_contact_title?: string | null
          rate_cancellation_policy_id?: string | null
          region?: string | null
          restaurant_id: string
          source_code_id?: string | null
          source_of_business?: string | null
          special_requests?: string | null
          tax_exempt?: boolean
          tax_exemption_certificate_number?: string | null
          tax_exemption_rule_id?: string | null
          tax_exemption_valid_to?: string | null
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
          billing_currency_code?: string | null
          billing_instruction?: string | null
          booking_access?: string
          booking_notes?: string | null
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
          credit_days?: number | null
          credit_limit_amount?: number | null
          credit_limit_note?: string | null
          credit_status?: string | null
          default_billing_rule_id?: string | null
          default_deposit_policy_id?: string | null
          default_no_show_policy_id?: string | null
          default_payment_method_id?: string | null
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
          payment_timing?: string | null
          phone?: string | null
          phone_alt?: string | null
          phone_normalized?: string | null
          postal_code?: string | null
          preferred_currency?: string | null
          primary_contact_guest_id?: string | null
          primary_contact_name?: string | null
          primary_contact_title?: string | null
          rate_cancellation_policy_id?: string | null
          region?: string | null
          restaurant_id?: string
          source_code_id?: string | null
          source_of_business?: string | null
          special_requests?: string | null
          tax_exempt?: boolean
          tax_exemption_certificate_number?: string | null
          tax_exemption_rule_id?: string | null
          tax_exemption_valid_to?: string | null
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
            foreignKeyName: "guest_account_masters_default_billing_rule_fk"
            columns: ["default_billing_rule_id"]
            isOneToOne: false
            referencedRelation: "pms_billing_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_account_masters_default_deposit_policy_fk"
            columns: ["default_deposit_policy_id"]
            isOneToOne: false
            referencedRelation: "pms_deposit_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_account_masters_default_no_show_policy_fk"
            columns: ["default_no_show_policy_id"]
            isOneToOne: false
            referencedRelation: "pms_no_show_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_account_masters_default_payment_method_fk"
            columns: ["default_payment_method_id"]
            isOneToOne: false
            referencedRelation: "pms_payment_methods"
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
            foreignKeyName: "guest_account_masters_rate_cancellation_same_property"
            columns: ["rate_cancellation_policy_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_rate_cancellation_policies"
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
            foreignKeyName: "guest_account_masters_tax_exemption_rule_fk"
            columns: ["tax_exemption_rule_id"]
            isOneToOne: false
            referencedRelation: "pms_tax_exemption_rules"
            referencedColumns: ["id"]
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
          agreement_id: string | null
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
          agreement_id?: string | null
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
          agreement_id?: string | null
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
            foreignKeyName: "guest_company_documents_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "pms_corporate_agreements"
            referencedColumns: ["id"]
          },
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
      guest_deposit_invoice_allocations: {
        Row: {
          amount: number
          created_at: string
          created_by_membership_id: string | null
          deposit_transaction_id: string
          guest_folio_id: string
          id: string
          idempotency_key: string | null
          invoice_id: string
          operation_id: string
          reason: string | null
          restaurant_id: string
          reverses_allocation_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by_membership_id?: string | null
          deposit_transaction_id: string
          guest_folio_id: string
          id?: string
          idempotency_key?: string | null
          invoice_id: string
          operation_id: string
          reason?: string | null
          restaurant_id: string
          reverses_allocation_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by_membership_id?: string | null
          deposit_transaction_id?: string
          guest_folio_id?: string
          id?: string
          idempotency_key?: string | null
          invoice_id?: string
          operation_id?: string
          reason?: string | null
          restaurant_id?: string
          reverses_allocation_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guest_deposit_invoice_allocations_deposit_property"
            columns: ["deposit_transaction_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "folio_transactions"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "guest_deposit_invoice_allocations_folio_property"
            columns: ["guest_folio_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "guest_folios"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "guest_deposit_invoice_allocations_invoice_property"
            columns: ["invoice_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "guest_folio_invoices"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "guest_deposit_invoice_allocations_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_deposit_invoice_allocations_reversal_property"
            columns: ["reverses_allocation_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "guest_deposit_invoice_allocations"
            referencedColumns: ["id", "restaurant_id"]
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
      guest_folio_invoice_draft_items: {
        Row: {
          created_at: string
          draft_id: string
          id: string
          source_transaction_id: string
        }
        Insert: {
          created_at?: string
          draft_id: string
          id?: string
          source_transaction_id: string
        }
        Update: {
          created_at?: string
          draft_id?: string
          id?: string
          source_transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_folio_invoice_draft_items_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "guest_folio_invoice_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_folio_invoice_draft_items_source_transaction_id_fkey"
            columns: ["source_transaction_id"]
            isOneToOne: false
            referencedRelation: "folio_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_folio_invoice_drafts: {
        Row: {
          created_at: string
          created_by_membership_id: string
          folio_id: string
          id: string
          notes: string | null
          restaurant_id: string
          updated_at: string
          updated_by_membership_id: string
        }
        Insert: {
          created_at?: string
          created_by_membership_id: string
          folio_id: string
          id?: string
          notes?: string | null
          restaurant_id: string
          updated_at?: string
          updated_by_membership_id: string
        }
        Update: {
          created_at?: string
          created_by_membership_id?: string
          folio_id?: string
          id?: string
          notes?: string | null
          restaurant_id?: string
          updated_at?: string
          updated_by_membership_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_folio_invoice_drafts_folio_fk"
            columns: ["folio_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "guest_folios"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "guest_folio_invoice_drafts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_folio_invoice_lines: {
        Row: {
          amount: number
          component_kind: string
          component_transaction_id: string
          created_at: string
          folio_id: string
          id: string
          invoice_id: string
          restaurant_id: string
          snapshot: Json
          source_transaction_id: string
        }
        Insert: {
          amount: number
          component_kind: string
          component_transaction_id: string
          created_at?: string
          folio_id: string
          id?: string
          invoice_id: string
          restaurant_id: string
          snapshot: Json
          source_transaction_id: string
        }
        Update: {
          amount?: number
          component_kind?: string
          component_transaction_id?: string
          created_at?: string
          folio_id?: string
          id?: string
          invoice_id?: string
          restaurant_id?: string
          snapshot?: Json
          source_transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_folio_invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "guest_folio_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_folio_invoice_lines_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_folio_invoices: {
        Row: {
          coverage_scope: string
          folio_id: string
          id: string
          idempotency_key: string | null
          issued_at: string
          issued_by_membership_id: string
          issued_number: string
          last_reprinted_at: string | null
          reprint_count: number
          restaurant_id: string
          sequence_number: number
          snapshot: Json
        }
        Insert: {
          coverage_scope?: string
          folio_id: string
          id?: string
          idempotency_key?: string | null
          issued_at?: string
          issued_by_membership_id: string
          issued_number: string
          last_reprinted_at?: string | null
          reprint_count?: number
          restaurant_id: string
          sequence_number: number
          snapshot: Json
        }
        Update: {
          coverage_scope?: string
          folio_id?: string
          id?: string
          idempotency_key?: string | null
          issued_at?: string
          issued_by_membership_id?: string
          issued_number?: string
          last_reprinted_at?: string | null
          reprint_count?: number
          restaurant_id?: string
          sequence_number?: number
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "guest_folio_invoices_folio_fk"
            columns: ["folio_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "guest_folios"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "guest_folio_invoices_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_folio_windows: {
        Row: {
          created_at: string
          folio_id: string
          id: string
          is_primary: boolean
          label: string
          restaurant_id: string
          window_number: number
        }
        Insert: {
          created_at?: string
          folio_id: string
          id?: string
          is_primary?: boolean
          label?: string
          restaurant_id: string
          window_number: number
        }
        Update: {
          created_at?: string
          folio_id?: string
          id?: string
          is_primary?: boolean
          label?: string
          restaurant_id?: string
          window_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "guest_folio_windows_folio_same_property"
            columns: ["folio_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "guest_folios"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "guest_folio_windows_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
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
          settlement_exception: string | null
          settlement_exception_amount: number | null
          settlement_exception_at: string | null
          settlement_exception_kind: string | null
          settlement_exception_reason: string | null
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
          settlement_exception?: string | null
          settlement_exception_amount?: number | null
          settlement_exception_at?: string | null
          settlement_exception_kind?: string | null
          settlement_exception_reason?: string | null
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
          settlement_exception?: string | null
          settlement_exception_amount?: number | null
          settlement_exception_at?: string | null
          settlement_exception_kind?: string | null
          settlement_exception_reason?: string | null
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
      guest_payment_invoice_allocations: {
        Row: {
          amount: number
          created_at: string
          created_by_membership_id: string | null
          guest_folio_id: string
          id: string
          idempotency_key: string | null
          invoice_id: string
          operation_id: string
          payment_transaction_id: string
          reason: string | null
          restaurant_id: string
          reverses_allocation_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by_membership_id?: string | null
          guest_folio_id: string
          id?: string
          idempotency_key?: string | null
          invoice_id: string
          operation_id: string
          payment_transaction_id: string
          reason?: string | null
          restaurant_id: string
          reverses_allocation_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by_membership_id?: string | null
          guest_folio_id?: string
          id?: string
          idempotency_key?: string | null
          invoice_id?: string
          operation_id?: string
          payment_transaction_id?: string
          reason?: string | null
          restaurant_id?: string
          reverses_allocation_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guest_payment_invoice_allocations_folio_property"
            columns: ["guest_folio_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "guest_folios"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "guest_payment_invoice_allocations_invoice_property"
            columns: ["invoice_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "guest_folio_invoices"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "guest_payment_invoice_allocations_payment_property"
            columns: ["payment_transaction_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "folio_transactions"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "guest_payment_invoice_allocations_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_payment_invoice_allocations_reversal_property"
            columns: ["reverses_allocation_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "guest_payment_invoice_allocations"
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
          profile_origin: string
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
          profile_origin?: string
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
          profile_origin?: string
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
      guest_tax_identities: {
        Row: {
          city: string | null
          created_at: string
          created_by_membership_id: string | null
          email: string | null
          guest_profile_id: string
          id: string
          is_active: boolean
          is_default: boolean
          legal_name: string
          phone: string | null
          region: string | null
          registration_number: string | null
          restaurant_id: string
          tin: string
          updated_at: string
        }
        Insert: {
          city?: string | null
          created_at?: string
          created_by_membership_id?: string | null
          email?: string | null
          guest_profile_id: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          legal_name: string
          phone?: string | null
          region?: string | null
          registration_number?: string | null
          restaurant_id: string
          tin: string
          updated_at?: string
        }
        Update: {
          city?: string | null
          created_at?: string
          created_by_membership_id?: string | null
          email?: string | null
          guest_profile_id?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          legal_name?: string
          phone?: string | null
          region?: string | null
          registration_number?: string | null
          restaurant_id?: string
          tin?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_tax_identities_guest_property"
            columns: ["guest_profile_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "guest_profiles"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "guest_tax_identities_membership_property"
            columns: ["created_by_membership_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "guest_tax_identities_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
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
      hotel_cashier_shifts: {
        Row: {
          closed_at: string | null
          closing_count: number | null
          created_at: string
          id: string
          membership_id: string
          notes: string | null
          opened_at: string
          opening_cash: number
          restaurant_id: string
          status: string
        }
        Insert: {
          closed_at?: string | null
          closing_count?: number | null
          created_at?: string
          id?: string
          membership_id: string
          notes?: string | null
          opened_at?: string
          opening_cash: number
          restaurant_id: string
          status?: string
        }
        Update: {
          closed_at?: string | null
          closing_count?: number | null
          created_at?: string
          id?: string
          membership_id?: string
          notes?: string | null
          opened_at?: string
          opening_cash?: number
          restaurant_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotel_cashier_shifts_membership_same_property"
            columns: ["membership_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "hotel_cashier_shifts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      hotel_commercial_change_events: {
        Row: {
          action_type: string
          actor_membership_id: string | null
          after_state: Json | null
          before_state: Json | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          master_id: string | null
          metadata: Json
          operation_id: string
          reason: string | null
          restaurant_id: string
          source: string
        }
        Insert: {
          action_type: string
          actor_membership_id?: string | null
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          master_id?: string | null
          metadata?: Json
          operation_id: string
          reason?: string | null
          restaurant_id: string
          source: string
        }
        Update: {
          action_type?: string
          actor_membership_id?: string | null
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          master_id?: string | null
          metadata?: Json
          operation_id?: string
          reason?: string | null
          restaurant_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotel_commercial_change_events_actor_membership_id_fkey"
            columns: ["actor_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_commercial_change_events_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      hotel_competitor_provider_mappings: {
        Row: {
          active: boolean
          competitor_id: string
          created_at: string
          external_property_id: string
          external_property_name: string | null
          id: string
          last_verified_at: string | null
          provider: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          competitor_id: string
          created_at?: string
          external_property_id: string
          external_property_name?: string | null
          id?: string
          last_verified_at?: string | null
          provider: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          competitor_id?: string
          created_at?: string
          external_property_id?: string
          external_property_name?: string | null
          id?: string
          last_verified_at?: string | null
          provider?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotel_competitor_provider_mappings_competitor_fk"
            columns: ["competitor_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "hotel_competitors"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "hotel_competitor_provider_mappings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      hotel_competitor_rate_observations: {
        Row: {
          availability_status: string
          competitor_id: string
          created_at: string
          currency: string | null
          external_rate_plan_id: string | null
          external_rate_plan_name: string | null
          external_room_id: string | null
          external_room_name: string | null
          fetch_run_id: string
          id: string
          observed_at: string
          occupancy_adults: number | null
          occupancy_children: number | null
          provider: string
          provider_property_id: string
          rate_amount: number | null
          restaurant_id: string
          source_hash: string | null
          stay_date: string
          tax_basis: string
        }
        Insert: {
          availability_status?: string
          competitor_id: string
          created_at?: string
          currency?: string | null
          external_rate_plan_id?: string | null
          external_rate_plan_name?: string | null
          external_room_id?: string | null
          external_room_name?: string | null
          fetch_run_id: string
          id?: string
          observed_at?: string
          occupancy_adults?: number | null
          occupancy_children?: number | null
          provider: string
          provider_property_id: string
          rate_amount?: number | null
          restaurant_id: string
          source_hash?: string | null
          stay_date: string
          tax_basis?: string
        }
        Update: {
          availability_status?: string
          competitor_id?: string
          created_at?: string
          currency?: string | null
          external_rate_plan_id?: string | null
          external_rate_plan_name?: string | null
          external_room_id?: string | null
          external_room_name?: string | null
          fetch_run_id?: string
          id?: string
          observed_at?: string
          occupancy_adults?: number | null
          occupancy_children?: number | null
          provider?: string
          provider_property_id?: string
          rate_amount?: number | null
          restaurant_id?: string
          source_hash?: string | null
          stay_date?: string
          tax_basis?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotel_competitor_rate_observations_competitor_fk"
            columns: ["competitor_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "hotel_competitors"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "hotel_competitor_rate_observations_fetch_run_fk"
            columns: ["fetch_run_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "hotel_rate_shopping_fetch_runs"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "hotel_competitor_rate_observations_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      hotel_competitor_room_mappings: {
        Row: {
          active: boolean
          competitor_id: string
          created_at: string
          external_room_id: string
          external_room_name: string | null
          id: string
          mapping_status: string
          notes: string | null
          our_room_type_id: string
          provider: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          competitor_id: string
          created_at?: string
          external_room_id: string
          external_room_name?: string | null
          id?: string
          mapping_status?: string
          notes?: string | null
          our_room_type_id: string
          provider: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          competitor_id?: string
          created_at?: string
          external_room_id?: string
          external_room_name?: string | null
          id?: string
          mapping_status?: string
          notes?: string | null
          our_room_type_id?: string
          provider?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotel_competitor_room_mappings_competitor_fk"
            columns: ["competitor_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "hotel_competitors"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "hotel_competitor_room_mappings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_competitor_room_mappings_room_type_fk"
            columns: ["our_room_type_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id", "restaurant_id"]
          },
        ]
      }
      hotel_competitors: {
        Row: {
          active: boolean
          created_at: string
          id: string
          location_label: string | null
          name: string
          notes: string | null
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          location_label?: string | null
          name: string
          notes?: string | null
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          location_label?: string | null
          name?: string
          notes?: string | null
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotel_competitors_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      hotel_drawer_movements: {
        Row: {
          actor_membership_id: string | null
          amount: number
          created_at: string
          hotel_cashier_shift_id: string
          id: string
          idempotency_key: string | null
          movement_type: string
          notes: string | null
          restaurant_id: string
        }
        Insert: {
          actor_membership_id?: string | null
          amount: number
          created_at?: string
          hotel_cashier_shift_id: string
          id?: string
          idempotency_key?: string | null
          movement_type: string
          notes?: string | null
          restaurant_id: string
        }
        Update: {
          actor_membership_id?: string | null
          amount?: number
          created_at?: string
          hotel_cashier_shift_id?: string
          id?: string
          idempotency_key?: string | null
          movement_type?: string
          notes?: string | null
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotel_drawer_movements_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_drawer_movements_shift_same_property"
            columns: ["hotel_cashier_shift_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "hotel_cashier_shifts"
            referencedColumns: ["id", "restaurant_id"]
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
      hotel_package_activation_rate_plans: {
        Row: {
          activation_id: string
          created_at: string
          id: string
          rate_plan_id: string
          restaurant_id: string
        }
        Insert: {
          activation_id: string
          created_at?: string
          id?: string
          rate_plan_id: string
          restaurant_id: string
        }
        Update: {
          activation_id?: string
          created_at?: string
          id?: string
          rate_plan_id?: string
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotel_package_activation_rate_plans_activation_fk"
            columns: ["activation_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "hotel_package_activations"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "hotel_package_activation_rate_plans_plan_fk"
            columns: ["rate_plan_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "hotel_rate_plans"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "hotel_package_activation_rate_plans_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      hotel_package_activation_room_types: {
        Row: {
          activation_id: string
          created_at: string
          id: string
          restaurant_id: string
          room_type_id: string
        }
        Insert: {
          activation_id: string
          created_at?: string
          id?: string
          restaurant_id: string
          room_type_id: string
        }
        Update: {
          activation_id?: string
          created_at?: string
          id?: string
          restaurant_id?: string
          room_type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotel_package_activation_room_types_activation_fk"
            columns: ["activation_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "hotel_package_activations"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "hotel_package_activation_room_types_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_package_activation_room_types_type_fk"
            columns: ["room_type_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id", "restaurant_id"]
          },
        ]
      }
      hotel_package_activations: {
        Row: {
          active: boolean
          charge_basis: string
          components_snapshot: Json
          created_at: string
          created_by_membership_id: string | null
          id: string
          master_rate_plan_ids: Json
          master_room_type_ids: Json
          metadata: Json
          package_code: string
          package_id: string
          package_name: string
          package_price: number
          package_type: string | null
          reason: string | null
          restaurant_id: string
          updated_at: string
          valid_from: string
          valid_to: string
        }
        Insert: {
          active?: boolean
          charge_basis?: string
          components_snapshot?: Json
          created_at?: string
          created_by_membership_id?: string | null
          id?: string
          master_rate_plan_ids?: Json
          master_room_type_ids?: Json
          metadata?: Json
          package_code: string
          package_id: string
          package_name: string
          package_price: number
          package_type?: string | null
          reason?: string | null
          restaurant_id: string
          updated_at?: string
          valid_from: string
          valid_to: string
        }
        Update: {
          active?: boolean
          charge_basis?: string
          components_snapshot?: Json
          created_at?: string
          created_by_membership_id?: string | null
          id?: string
          master_rate_plan_ids?: Json
          master_room_type_ids?: Json
          metadata?: Json
          package_code?: string
          package_id?: string
          package_name?: string
          package_price?: number
          package_type?: string | null
          reason?: string | null
          restaurant_id?: string
          updated_at?: string
          valid_from?: string
          valid_to?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotel_package_activations_created_by_membership_id_fkey"
            columns: ["created_by_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_package_activations_package_fk"
            columns: ["package_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_packages"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "hotel_package_activations_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      hotel_promotion_activation_rate_plans: {
        Row: {
          activation_id: string
          created_at: string
          id: string
          rate_plan_id: string
          restaurant_id: string
        }
        Insert: {
          activation_id: string
          created_at?: string
          id?: string
          rate_plan_id: string
          restaurant_id: string
        }
        Update: {
          activation_id?: string
          created_at?: string
          id?: string
          rate_plan_id?: string
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotel_promotion_activation_rate_plans_activation_fk"
            columns: ["activation_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "hotel_promotion_activations"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "hotel_promotion_activation_rate_plans_plan_fk"
            columns: ["rate_plan_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "hotel_rate_plans"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "hotel_promotion_activation_rate_plans_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      hotel_promotion_activation_room_types: {
        Row: {
          activation_id: string
          created_at: string
          id: string
          restaurant_id: string
          room_type_id: string
        }
        Insert: {
          activation_id: string
          created_at?: string
          id?: string
          restaurant_id: string
          room_type_id: string
        }
        Update: {
          activation_id?: string
          created_at?: string
          id?: string
          restaurant_id?: string
          room_type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotel_promotion_activation_room_types_activation_fk"
            columns: ["activation_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "hotel_promotion_activations"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "hotel_promotion_activation_room_types_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_promotion_activation_room_types_type_fk"
            columns: ["room_type_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id", "restaurant_id"]
          },
        ]
      }
      hotel_promotion_activations: {
        Row: {
          active: boolean
          booking_from: string
          booking_to: string
          created_at: string
          created_by_membership_id: string | null
          id: string
          master_room_type_ids: Json
          master_valid_from: string | null
          master_valid_to: string | null
          metadata: Json
          priority: number
          promo_kind: string
          promo_value: number
          promotion_code: string
          promotion_id: string
          promotion_name: string
          reason: string | null
          restaurant_id: string
          updated_at: string
          valid_from: string
          valid_to: string
        }
        Insert: {
          active?: boolean
          booking_from: string
          booking_to: string
          created_at?: string
          created_by_membership_id?: string | null
          id?: string
          master_room_type_ids?: Json
          master_valid_from?: string | null
          master_valid_to?: string | null
          metadata?: Json
          priority?: number
          promo_kind: string
          promo_value: number
          promotion_code: string
          promotion_id: string
          promotion_name: string
          reason?: string | null
          restaurant_id: string
          updated_at?: string
          valid_from: string
          valid_to: string
        }
        Update: {
          active?: boolean
          booking_from?: string
          booking_to?: string
          created_at?: string
          created_by_membership_id?: string | null
          id?: string
          master_room_type_ids?: Json
          master_valid_from?: string | null
          master_valid_to?: string | null
          metadata?: Json
          priority?: number
          promo_kind?: string
          promo_value?: number
          promotion_code?: string
          promotion_id?: string
          promotion_name?: string
          reason?: string | null
          restaurant_id?: string
          updated_at?: string
          valid_from?: string
          valid_to?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotel_promotion_activations_created_by_membership_id_fkey"
            columns: ["created_by_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_promotion_activations_promotion_fk"
            columns: ["promotion_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_promotions"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "hotel_promotion_activations_restaurant_id_fkey"
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
      hotel_rate_change_events: {
        Row: {
          action_type: string
          actor_membership_id: string | null
          created_at: string
          currency: string
          id: string
          metadata: Json
          new_effective_rate: number
          new_override_rate: number | null
          operation_id: string
          previous_base_rate: number
          previous_effective_rate: number
          previous_override_rate: number | null
          rate_plan_id: string
          reason: string | null
          restaurant_id: string
          room_type_id: string
          source: string
          stay_date: string
        }
        Insert: {
          action_type: string
          actor_membership_id?: string | null
          created_at?: string
          currency: string
          id?: string
          metadata?: Json
          new_effective_rate: number
          new_override_rate?: number | null
          operation_id: string
          previous_base_rate: number
          previous_effective_rate: number
          previous_override_rate?: number | null
          rate_plan_id: string
          reason?: string | null
          restaurant_id: string
          room_type_id: string
          source: string
          stay_date: string
        }
        Update: {
          action_type?: string
          actor_membership_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          metadata?: Json
          new_effective_rate?: number
          new_override_rate?: number | null
          operation_id?: string
          previous_base_rate?: number
          previous_effective_rate?: number
          previous_override_rate?: number | null
          rate_plan_id?: string
          reason?: string | null
          restaurant_id?: string
          room_type_id?: string
          source?: string
          stay_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotel_rate_change_events_actor_membership_id_fkey"
            columns: ["actor_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_rate_change_events_plan_same_property"
            columns: ["rate_plan_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "hotel_rate_plans"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "hotel_rate_change_events_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_rate_change_events_type_same_property"
            columns: ["room_type_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id", "restaurant_id"]
          },
        ]
      }
      hotel_rate_plans: {
        Row: {
          active: boolean
          base_rate: number
          cancellation_policy_id: string | null
          code: string
          created_at: string
          created_by_membership_id: string | null
          currency: string
          deposit_policy_id: string | null
          description: string | null
          early_departure_policy_id: string | null
          id: string
          max_advance_days: number | null
          meal_plan_id: string | null
          min_advance_days: number | null
          name: string
          no_show_policy_id: string | null
          rate_category_id: string
          refundability_id: string | null
          restaurant_id: string
          room_type_id: string
          updated_at: string
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          active?: boolean
          base_rate: number
          cancellation_policy_id?: string | null
          code: string
          created_at?: string
          created_by_membership_id?: string | null
          currency: string
          deposit_policy_id?: string | null
          description?: string | null
          early_departure_policy_id?: string | null
          id?: string
          max_advance_days?: number | null
          meal_plan_id?: string | null
          min_advance_days?: number | null
          name: string
          no_show_policy_id?: string | null
          rate_category_id: string
          refundability_id?: string | null
          restaurant_id: string
          room_type_id: string
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          active?: boolean
          base_rate?: number
          cancellation_policy_id?: string | null
          code?: string
          created_at?: string
          created_by_membership_id?: string | null
          currency?: string
          deposit_policy_id?: string | null
          description?: string | null
          early_departure_policy_id?: string | null
          id?: string
          max_advance_days?: number | null
          meal_plan_id?: string | null
          min_advance_days?: number | null
          name?: string
          no_show_policy_id?: string | null
          rate_category_id?: string
          refundability_id?: string | null
          restaurant_id?: string
          room_type_id?: string
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hotel_rate_plans_cancellation_policy_fk"
            columns: ["cancellation_policy_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_rate_cancellation_policies"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "hotel_rate_plans_cancellation_same_property"
            columns: ["cancellation_policy_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_rate_cancellation_policies"
            referencedColumns: ["id", "restaurant_id"]
          },
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
            foreignKeyName: "hotel_rate_plans_deposit_same_property"
            columns: ["deposit_policy_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_deposit_policies"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "hotel_rate_plans_early_departure_same_property"
            columns: ["early_departure_policy_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_early_departure_policies"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "hotel_rate_plans_meal_plan_same_property"
            columns: ["meal_plan_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_meal_plans"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "hotel_rate_plans_no_show_same_property"
            columns: ["no_show_policy_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_no_show_policies"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "hotel_rate_plans_refundability_fk"
            columns: ["refundability_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_rate_refundability_codes"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "hotel_rate_plans_refundability_same_property"
            columns: ["refundability_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_rate_refundability_codes"
            referencedColumns: ["id", "restaurant_id"]
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
      hotel_rate_restriction_change_events: {
        Row: {
          action_type: string
          actor_membership_id: string | null
          created_at: string
          id: string
          metadata: Json
          new_closed_to_arrival: boolean
          new_closed_to_departure: boolean
          new_max_stay: number | null
          new_min_stay: number | null
          new_stop_sell: boolean
          operation_id: string
          previous_closed_to_arrival: boolean
          previous_closed_to_departure: boolean
          previous_max_stay: number | null
          previous_min_stay: number | null
          previous_stop_sell: boolean
          rate_plan_id: string
          reason: string | null
          restaurant_id: string
          room_type_id: string
          source: string
          stay_date: string
        }
        Insert: {
          action_type: string
          actor_membership_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          new_closed_to_arrival: boolean
          new_closed_to_departure: boolean
          new_max_stay?: number | null
          new_min_stay?: number | null
          new_stop_sell: boolean
          operation_id: string
          previous_closed_to_arrival: boolean
          previous_closed_to_departure: boolean
          previous_max_stay?: number | null
          previous_min_stay?: number | null
          previous_stop_sell: boolean
          rate_plan_id: string
          reason?: string | null
          restaurant_id: string
          room_type_id: string
          source: string
          stay_date: string
        }
        Update: {
          action_type?: string
          actor_membership_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          new_closed_to_arrival?: boolean
          new_closed_to_departure?: boolean
          new_max_stay?: number | null
          new_min_stay?: number | null
          new_stop_sell?: boolean
          operation_id?: string
          previous_closed_to_arrival?: boolean
          previous_closed_to_departure?: boolean
          previous_max_stay?: number | null
          previous_min_stay?: number | null
          previous_stop_sell?: boolean
          rate_plan_id?: string
          reason?: string | null
          restaurant_id?: string
          room_type_id?: string
          source?: string
          stay_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotel_rate_restriction_change_events_actor_membership_id_fkey"
            columns: ["actor_membership_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_rate_restriction_change_events_plan_same_property"
            columns: ["rate_plan_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "hotel_rate_plans"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "hotel_rate_restriction_change_events_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_rate_restriction_change_events_type_same_property"
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
      hotel_rate_shopping_fetch_runs: {
        Row: {
          competitor_count: number
          created_at: string
          error_count: number
          error_summary: string | null
          finished_at: string | null
          id: string
          observation_count: number
          provider: string
          requested_stay_from: string
          requested_stay_to: string
          restaurant_id: string
          started_at: string
          status: string
        }
        Insert: {
          competitor_count?: number
          created_at?: string
          error_count?: number
          error_summary?: string | null
          finished_at?: string | null
          id?: string
          observation_count?: number
          provider: string
          requested_stay_from: string
          requested_stay_to: string
          restaurant_id: string
          started_at?: string
          status?: string
        }
        Update: {
          competitor_count?: number
          created_at?: string
          error_count?: number
          error_summary?: string | null
          finished_at?: string | null
          id?: string
          observation_count?: number
          provider?: string
          requested_stay_from?: string
          requested_stay_to?: string
          restaurant_id?: string
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotel_rate_shopping_fetch_runs_restaurant_id_fkey"
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
      hotel_reservation_packages: {
        Row: {
          applied_amount: number
          applied_at: string
          charge_basis: string
          components_snapshot: Json
          created_at: string
          id: string
          package_activation_id: string
          package_code: string
          package_id: string
          package_name: string
          quantity: number
          reservation_id: string
          reservation_room_id: string | null
          restaurant_id: string
          snapshot: Json
          unit_amount: number
        }
        Insert: {
          applied_amount: number
          applied_at?: string
          charge_basis: string
          components_snapshot?: Json
          created_at?: string
          id?: string
          package_activation_id: string
          package_code: string
          package_id: string
          package_name: string
          quantity?: number
          reservation_id: string
          reservation_room_id?: string | null
          restaurant_id: string
          snapshot?: Json
          unit_amount: number
        }
        Update: {
          applied_amount?: number
          applied_at?: string
          charge_basis?: string
          components_snapshot?: Json
          created_at?: string
          id?: string
          package_activation_id?: string
          package_code?: string
          package_id?: string
          package_name?: string
          quantity?: number
          reservation_id?: string
          reservation_room_id?: string | null
          restaurant_id?: string
          snapshot?: Json
          unit_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "hotel_reservation_packages_activation_fk"
            columns: ["package_activation_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "hotel_package_activations"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "hotel_reservation_packages_package_fk"
            columns: ["package_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_packages"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "hotel_reservation_packages_reservation_fk"
            columns: ["reservation_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "hotel_reservations"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "hotel_reservation_packages_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_reservation_packages_room_unit_same_property"
            columns: ["reservation_room_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "hotel_reservation_rooms"
            referencedColumns: ["id", "restaurant_id"]
          },
        ]
      }
      hotel_reservation_promotions: {
        Row: {
          applied_at: string
          base_room_subtotal: number
          created_at: string
          discount_amount: number
          id: string
          promo_kind: string
          promo_value: number
          promotion_activation_id: string
          promotion_code: string
          promotion_id: string
          promotion_name: string
          reservation_id: string
          restaurant_id: string
          room_subtotal_after_promotion: number
          snapshot: Json
        }
        Insert: {
          applied_at?: string
          base_room_subtotal: number
          created_at?: string
          discount_amount: number
          id?: string
          promo_kind: string
          promo_value: number
          promotion_activation_id: string
          promotion_code: string
          promotion_id: string
          promotion_name: string
          reservation_id: string
          restaurant_id: string
          room_subtotal_after_promotion: number
          snapshot?: Json
        }
        Update: {
          applied_at?: string
          base_room_subtotal?: number
          created_at?: string
          discount_amount?: number
          id?: string
          promo_kind?: string
          promo_value?: number
          promotion_activation_id?: string
          promotion_code?: string
          promotion_id?: string
          promotion_name?: string
          reservation_id?: string
          restaurant_id?: string
          room_subtotal_after_promotion?: number
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "hotel_reservation_promotions_activation_fk"
            columns: ["promotion_activation_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "hotel_promotion_activations"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "hotel_reservation_promotions_promotion_fk"
            columns: ["promotion_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_promotions"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "hotel_reservation_promotions_reservation_fk"
            columns: ["reservation_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "hotel_reservations"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "hotel_reservation_promotions_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      hotel_reservation_room_guests: {
        Row: {
          created_at: string
          guest_id: string
          id: string
          is_primary: boolean
          reservation_id: string
          reservation_room_id: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          guest_id: string
          id?: string
          is_primary?: boolean
          reservation_id: string
          reservation_room_id: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          guest_id?: string
          id?: string
          is_primary?: boolean
          reservation_id?: string
          reservation_room_id?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotel_reservation_room_guests_guest_same_property"
            columns: ["guest_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "guest_profiles"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "hotel_reservation_room_guests_reservation_same_property"
            columns: ["reservation_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "hotel_reservations"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "hotel_reservation_room_guests_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_reservation_room_guests_room_same_reservation"
            columns: ["reservation_room_id", "restaurant_id", "reservation_id"]
            isOneToOne: false
            referencedRelation: "hotel_reservation_rooms"
            referencedColumns: ["id", "restaurant_id", "reservation_id"]
          },
        ]
      }
      hotel_reservation_rooms: {
        Row: {
          adults: number
          arrival_date: string
          assignment_notes: string | null
          children: number
          created_at: string
          currency: string | null
          departure_date: string
          id: string
          infants: number
          nightly_rate_snapshot: Json | null
          pms_group_block_id: string | null
          priced_at: string | null
          rate_plan_id: string | null
          reservation_id: string
          restaurant_id: string
          room_id: string | null
          room_subtotal: number | null
          room_type_id: string
          status: string
          unit_sequence: number
          updated_at: string
        }
        Insert: {
          adults: number
          arrival_date: string
          assignment_notes?: string | null
          children?: number
          created_at?: string
          currency?: string | null
          departure_date: string
          id?: string
          infants?: number
          nightly_rate_snapshot?: Json | null
          pms_group_block_id?: string | null
          priced_at?: string | null
          rate_plan_id?: string | null
          reservation_id: string
          restaurant_id: string
          room_id?: string | null
          room_subtotal?: number | null
          room_type_id: string
          status?: string
          unit_sequence: number
          updated_at?: string
        }
        Update: {
          adults?: number
          arrival_date?: string
          assignment_notes?: string | null
          children?: number
          created_at?: string
          currency?: string | null
          departure_date?: string
          id?: string
          infants?: number
          nightly_rate_snapshot?: Json | null
          pms_group_block_id?: string | null
          priced_at?: string | null
          rate_plan_id?: string | null
          reservation_id?: string
          restaurant_id?: string
          room_id?: string | null
          room_subtotal?: number | null
          room_type_id?: string
          status?: string
          unit_sequence?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotel_reservation_rooms_pms_group_block_same_property"
            columns: ["pms_group_block_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_group_blocks"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "hotel_reservation_rooms_rate_plan_same_property"
            columns: ["rate_plan_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "hotel_rate_plans"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "hotel_reservation_rooms_reservation_same_property"
            columns: ["reservation_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "hotel_reservations"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "hotel_reservation_rooms_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_reservation_rooms_room_same_type"
            columns: ["room_id", "restaurant_id", "room_type_id"]
            isOneToOne: false
            referencedRelation: "hotel_rooms"
            referencedColumns: ["id", "restaurant_id", "room_type_id"]
          },
          {
            foreignKeyName: "hotel_reservation_rooms_type_same_property"
            columns: ["room_type_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id", "restaurant_id"]
          },
        ]
      }
      hotel_reservations: {
        Row: {
          adults: number
          arrival_date: string
          arrival_transport: string | null
          billing_rule_id: string | null
          booker_guest_id: string | null
          cancellation_policy_snapshot: Json | null
          cancellation_reason: string | null
          children: number
          commercial_booking_source: string | null
          commercial_sales_channel: string | null
          company_contact_id: string | null
          company_master_id: string | null
          company_name: string | null
          confirmation_number: string
          created_at: string
          created_by_staff_membership_id: string | null
          currency: string | null
          departure_date: string
          deposit_policy_id: string | null
          deposit_requirement_snapshot: Json | null
          early_departure_policy_id: string | null
          early_departure_policy_snapshot: Json | null
          expected_arrival_at: string | null
          external_reference: string | null
          group_account_master_id: string | null
          group_name: string | null
          guarantee_method: string | null
          guest_id: string
          id: string
          infants: number
          late_checkout_granted: boolean
          late_checkout_note: string | null
          late_checkout_until: string | null
          market_segment: string | null
          nightly_rate_snapshot: Json | null
          no_show_policy_id: string | null
          no_show_policy_snapshot: Json | null
          notes: string | null
          notes_pinned: boolean
          pickup_note: string | null
          pms_group_block_id: string | null
          pms_group_id: string | null
          priced_at: string | null
          purpose_of_stay: string | null
          rate_notes: string | null
          rate_plan_id: string | null
          refundability_snapshot: Json | null
          reservation_mode: string
          restaurant_id: string
          room_id: string | null
          room_subtotal: number | null
          room_type_id: string
          rooms_requested: number
          source: string
          special_occasion: string | null
          special_request_category: string | null
          special_requests: string | null
          status: string
          travel_agent_contact_id: string | null
          travel_agent_master_id: string | null
          updated_at: string
        }
        Insert: {
          adults?: number
          arrival_date: string
          arrival_transport?: string | null
          billing_rule_id?: string | null
          booker_guest_id?: string | null
          cancellation_policy_snapshot?: Json | null
          cancellation_reason?: string | null
          children?: number
          commercial_booking_source?: string | null
          commercial_sales_channel?: string | null
          company_contact_id?: string | null
          company_master_id?: string | null
          company_name?: string | null
          confirmation_number: string
          created_at?: string
          created_by_staff_membership_id?: string | null
          currency?: string | null
          departure_date: string
          deposit_policy_id?: string | null
          deposit_requirement_snapshot?: Json | null
          early_departure_policy_id?: string | null
          early_departure_policy_snapshot?: Json | null
          expected_arrival_at?: string | null
          external_reference?: string | null
          group_account_master_id?: string | null
          group_name?: string | null
          guarantee_method?: string | null
          guest_id: string
          id?: string
          infants?: number
          late_checkout_granted?: boolean
          late_checkout_note?: string | null
          late_checkout_until?: string | null
          market_segment?: string | null
          nightly_rate_snapshot?: Json | null
          no_show_policy_id?: string | null
          no_show_policy_snapshot?: Json | null
          notes?: string | null
          notes_pinned?: boolean
          pickup_note?: string | null
          pms_group_block_id?: string | null
          pms_group_id?: string | null
          priced_at?: string | null
          purpose_of_stay?: string | null
          rate_notes?: string | null
          rate_plan_id?: string | null
          refundability_snapshot?: Json | null
          reservation_mode?: string
          restaurant_id: string
          room_id?: string | null
          room_subtotal?: number | null
          room_type_id: string
          rooms_requested?: number
          source?: string
          special_occasion?: string | null
          special_request_category?: string | null
          special_requests?: string | null
          status?: string
          travel_agent_contact_id?: string | null
          travel_agent_master_id?: string | null
          updated_at?: string
        }
        Update: {
          adults?: number
          arrival_date?: string
          arrival_transport?: string | null
          billing_rule_id?: string | null
          booker_guest_id?: string | null
          cancellation_policy_snapshot?: Json | null
          cancellation_reason?: string | null
          children?: number
          commercial_booking_source?: string | null
          commercial_sales_channel?: string | null
          company_contact_id?: string | null
          company_master_id?: string | null
          company_name?: string | null
          confirmation_number?: string
          created_at?: string
          created_by_staff_membership_id?: string | null
          currency?: string | null
          departure_date?: string
          deposit_policy_id?: string | null
          deposit_requirement_snapshot?: Json | null
          early_departure_policy_id?: string | null
          early_departure_policy_snapshot?: Json | null
          expected_arrival_at?: string | null
          external_reference?: string | null
          group_account_master_id?: string | null
          group_name?: string | null
          guarantee_method?: string | null
          guest_id?: string
          id?: string
          infants?: number
          late_checkout_granted?: boolean
          late_checkout_note?: string | null
          late_checkout_until?: string | null
          market_segment?: string | null
          nightly_rate_snapshot?: Json | null
          no_show_policy_id?: string | null
          no_show_policy_snapshot?: Json | null
          notes?: string | null
          notes_pinned?: boolean
          pickup_note?: string | null
          pms_group_block_id?: string | null
          pms_group_id?: string | null
          priced_at?: string | null
          purpose_of_stay?: string | null
          rate_notes?: string | null
          rate_plan_id?: string | null
          refundability_snapshot?: Json | null
          reservation_mode?: string
          restaurant_id?: string
          room_id?: string | null
          room_subtotal?: number | null
          room_type_id?: string
          rooms_requested?: number
          source?: string
          special_occasion?: string | null
          special_request_category?: string | null
          special_requests?: string | null
          status?: string
          travel_agent_contact_id?: string | null
          travel_agent_master_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotel_reservations_billing_rule_same_property"
            columns: ["billing_rule_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_billing_rules"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "hotel_reservations_booker_guest_same_property"
            columns: ["booker_guest_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "guest_profiles"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "hotel_reservations_company_contact_same_property"
            columns: ["company_contact_id"]
            isOneToOne: false
            referencedRelation: "guest_company_contacts"
            referencedColumns: ["id"]
          },
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
            foreignKeyName: "hotel_reservations_deposit_policy_same_property"
            columns: ["deposit_policy_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_deposit_policies"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "hotel_reservations_early_departure_same_property"
            columns: ["early_departure_policy_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_early_departure_policies"
            referencedColumns: ["id", "restaurant_id"]
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
            foreignKeyName: "hotel_reservations_no_show_same_property"
            columns: ["no_show_policy_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_no_show_policies"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "hotel_reservations_pms_group_block_same_property"
            columns: ["pms_group_block_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_group_blocks"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "hotel_reservations_pms_group_same_property"
            columns: ["pms_group_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_groups"
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
            foreignKeyName: "hotel_reservations_ta_contact_same_property"
            columns: ["travel_agent_contact_id"]
            isOneToOne: false
            referencedRelation: "guest_company_contacts"
            referencedColumns: ["id"]
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
      hotel_revenue_approval_events: {
        Row: {
          actor_id: string
          approval_request_id: string
          created_at: string
          event_type: string
          id: string
          metadata: Json | null
          reason: string | null
          restaurant_id: string
        }
        Insert: {
          actor_id: string
          approval_request_id: string
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json | null
          reason?: string | null
          restaurant_id: string
        }
        Update: {
          actor_id?: string
          approval_request_id?: string
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          reason?: string | null
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotel_revenue_approval_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_revenue_approval_events_request_fk"
            columns: ["approval_request_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "hotel_revenue_approval_requests"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "hotel_revenue_approval_events_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      hotel_revenue_approval_policy: {
        Row: {
          created_at: string
          enabled: boolean
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotel_revenue_approval_policy_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      hotel_revenue_approval_requests: {
        Row: {
          action_type: string
          applied_operation_id: string | null
          created_at: string
          display_snapshot: Json | null
          domain: string
          entity_id: string | null
          entity_type: string
          expected_version: string | null
          id: string
          proposal_payload: Json
          request_reason: string | null
          requested_at: string
          requested_by: string
          restaurant_id: string
          review_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          action_type: string
          applied_operation_id?: string | null
          created_at?: string
          display_snapshot?: Json | null
          domain: string
          entity_id?: string | null
          entity_type: string
          expected_version?: string | null
          id?: string
          proposal_payload: Json
          request_reason?: string | null
          requested_at?: string
          requested_by: string
          restaurant_id: string
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          action_type?: string
          applied_operation_id?: string | null
          created_at?: string
          display_snapshot?: Json | null
          domain?: string
          entity_id?: string | null
          entity_type?: string
          expected_version?: string | null
          id?: string
          proposal_payload?: Json
          request_reason?: string | null
          requested_at?: string
          requested_by?: string
          restaurant_id?: string
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotel_revenue_approval_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_revenue_approval_requests_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_revenue_approval_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id"]
          },
        ]
      }
      hotel_revenue_otb_snapshots: {
        Row: {
          adr: number
          as_of_business_date: string
          booked_room_revenue: number
          created_at: string
          currency: string | null
          id: string
          metadata: Json
          occupancy_percent: number
          priced_rooms: number
          priced_share: number
          restaurant_id: string
          revpar: number
          room_type_id: string
          rooms_available: number
          rooms_on_books: number
          rooms_remaining: number
          stay_date: string
        }
        Insert: {
          adr?: number
          as_of_business_date: string
          booked_room_revenue?: number
          created_at?: string
          currency?: string | null
          id?: string
          metadata?: Json
          occupancy_percent?: number
          priced_rooms?: number
          priced_share?: number
          restaurant_id: string
          revpar?: number
          room_type_id: string
          rooms_available: number
          rooms_on_books: number
          rooms_remaining: number
          stay_date: string
        }
        Update: {
          adr?: number
          as_of_business_date?: string
          booked_room_revenue?: number
          created_at?: string
          currency?: string | null
          id?: string
          metadata?: Json
          occupancy_percent?: number
          priced_rooms?: number
          priced_share?: number
          restaurant_id?: string
          revpar?: number
          room_type_id?: string
          rooms_available?: number
          rooms_on_books?: number
          rooms_remaining?: number
          stay_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotel_revenue_otb_snapshots_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_revenue_otb_snapshots_type_same_property"
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
      invoice_credit_note_draft_items: {
        Row: {
          created_at: string
          draft_id: string
          id: string
          requested_gross: number
          source_group_id: string
        }
        Insert: {
          created_at?: string
          draft_id: string
          id?: string
          requested_gross: number
          source_group_id: string
        }
        Update: {
          created_at?: string
          draft_id?: string
          id?: string
          requested_gross?: number
          source_group_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_credit_note_draft_items_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "invoice_credit_note_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_credit_note_draft_items_source_group_id_fkey"
            columns: ["source_group_id"]
            isOneToOne: false
            referencedRelation: "folio_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_credit_note_drafts: {
        Row: {
          account_invoice_id: string | null
          created_at: string
          created_by_membership_id: string
          guest_invoice_id: string | null
          id: string
          note_type: string
          reason: string
          restaurant_id: string
          updated_at: string
          updated_by_membership_id: string
        }
        Insert: {
          account_invoice_id?: string | null
          created_at?: string
          created_by_membership_id: string
          guest_invoice_id?: string | null
          id?: string
          note_type?: string
          reason: string
          restaurant_id: string
          updated_at?: string
          updated_by_membership_id: string
        }
        Update: {
          account_invoice_id?: string | null
          created_at?: string
          created_by_membership_id?: string
          guest_invoice_id?: string | null
          id?: string
          note_type?: string
          reason?: string
          restaurant_id?: string
          updated_at?: string
          updated_by_membership_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_credit_note_drafts_account_invoice_id_fkey"
            columns: ["account_invoice_id"]
            isOneToOne: false
            referencedRelation: "financial_account_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_credit_note_drafts_guest_invoice_id_fkey"
            columns: ["guest_invoice_id"]
            isOneToOne: false
            referencedRelation: "guest_folio_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_credit_note_drafts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_credit_note_events: {
        Row: {
          account_invoice_id: string | null
          actor_membership_id: string | null
          created_at: string
          credit_note_id: string | null
          event_type: string
          financial_account_id: string | null
          folio_id: string | null
          guest_invoice_id: string | null
          id: string
          new_values: Json | null
          restaurant_id: string
        }
        Insert: {
          account_invoice_id?: string | null
          actor_membership_id?: string | null
          created_at?: string
          credit_note_id?: string | null
          event_type: string
          financial_account_id?: string | null
          folio_id?: string | null
          guest_invoice_id?: string | null
          id?: string
          new_values?: Json | null
          restaurant_id: string
        }
        Update: {
          account_invoice_id?: string | null
          actor_membership_id?: string | null
          created_at?: string
          credit_note_id?: string | null
          event_type?: string
          financial_account_id?: string | null
          folio_id?: string | null
          guest_invoice_id?: string | null
          id?: string
          new_values?: Json | null
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_credit_note_events_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_credit_note_lines: {
        Row: {
          component_kind: string
          component_transaction_id: string
          created_at: string
          credit_note_id: string
          credited_amount: number
          description: string
          id: string
          ledger_transaction_id: string | null
          note_type: string
          original_amount: number
          restaurant_id: string
          snapshot: Json
          source_group_id: string
        }
        Insert: {
          component_kind: string
          component_transaction_id: string
          created_at?: string
          credit_note_id: string
          credited_amount: number
          description: string
          id?: string
          ledger_transaction_id?: string | null
          note_type?: string
          original_amount: number
          restaurant_id: string
          snapshot: Json
          source_group_id: string
        }
        Update: {
          component_kind?: string
          component_transaction_id?: string
          created_at?: string
          credit_note_id?: string
          credited_amount?: number
          description?: string
          id?: string
          ledger_transaction_id?: string | null
          note_type?: string
          original_amount?: number
          restaurant_id?: string
          snapshot?: Json
          source_group_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_credit_note_lines_component_transaction_id_fkey"
            columns: ["component_transaction_id"]
            isOneToOne: false
            referencedRelation: "folio_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_credit_note_lines_credit_note_id_fkey"
            columns: ["credit_note_id"]
            isOneToOne: false
            referencedRelation: "invoice_credit_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_credit_note_lines_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_credit_notes: {
        Row: {
          account_invoice_id: string | null
          created_at: string
          currency: string
          financial_account_id: string | null
          folio_id: string | null
          guest_invoice_id: string | null
          id: string
          idempotency_key: string | null
          issued_at: string
          issued_by_membership_id: string
          last_reprinted_at: string | null
          note_number: string
          note_type: string
          reason: string
          reprint_count: number
          restaurant_id: string
          sequence_number: number
          service_charge_delta: number
          snapshot: Json
          subtotal_delta: number
          tax_delta: number
          total_delta: number
        }
        Insert: {
          account_invoice_id?: string | null
          created_at?: string
          currency: string
          financial_account_id?: string | null
          folio_id?: string | null
          guest_invoice_id?: string | null
          id?: string
          idempotency_key?: string | null
          issued_at?: string
          issued_by_membership_id: string
          last_reprinted_at?: string | null
          note_number: string
          note_type?: string
          reason: string
          reprint_count?: number
          restaurant_id: string
          sequence_number: number
          service_charge_delta: number
          snapshot: Json
          subtotal_delta: number
          tax_delta: number
          total_delta: number
        }
        Update: {
          account_invoice_id?: string | null
          created_at?: string
          currency?: string
          financial_account_id?: string | null
          folio_id?: string | null
          guest_invoice_id?: string | null
          id?: string
          idempotency_key?: string | null
          issued_at?: string
          issued_by_membership_id?: string
          last_reprinted_at?: string | null
          note_number?: string
          note_type?: string
          reason?: string
          reprint_count?: number
          restaurant_id?: string
          sequence_number?: number
          service_charge_delta?: number
          snapshot?: Json
          subtotal_delta?: number
          tax_delta?: number
          total_delta?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_credit_notes_account_invoice_id_fkey"
            columns: ["account_invoice_id"]
            isOneToOne: false
            referencedRelation: "financial_account_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_credit_notes_guest_invoice_id_fkey"
            columns: ["guest_invoice_id"]
            isOneToOne: false
            referencedRelation: "guest_folio_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_credit_notes_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          company: string
          created_at: string
          email: string
          id: string
          message: string | null
          name: string
          notes: string | null
          phone: string | null
          property_type: string
          source: string
          status: string
        }
        Insert: {
          company: string
          created_at?: string
          email: string
          id?: string
          message?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          property_type: string
          source: string
          status?: string
        }
        Update: {
          company?: string
          created_at?: string
          email?: string
          id?: string
          message?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          property_type?: string
          source?: string
          status?: string
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
          commission_rule_id: string | null
          commission_type: string | null
          commission_value: number | null
          created_at: string
          currency: string
          id: string
          notes: string | null
          plan_id: string | null
          reservation_id: string
          restaurant_id: string
          rule_scope: string | null
          status: string
          updated_at: string
        }
        Insert: {
          agency_master_id: string
          amount?: number
          basis_amount?: number
          commission_rule_id?: string | null
          commission_type?: string | null
          commission_value?: number | null
          created_at?: string
          currency: string
          id?: string
          notes?: string | null
          plan_id?: string | null
          reservation_id: string
          restaurant_id: string
          rule_scope?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          agency_master_id?: string
          amount?: number
          basis_amount?: number
          commission_rule_id?: string | null
          commission_type?: string | null
          commission_value?: number | null
          created_at?: string
          currency?: string
          id?: string
          notes?: string | null
          plan_id?: string | null
          reservation_id?: string
          restaurant_id?: string
          rule_scope?: string | null
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
            foreignKeyName: "pms_agency_commission_entries_commission_rule_id_fkey"
            columns: ["commission_rule_id"]
            isOneToOne: false
            referencedRelation: "pms_agency_commission_rules"
            referencedColumns: ["id"]
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
      pms_agency_commission_rules: {
        Row: {
          active: boolean
          commission_plan_id: string
          commission_type: string
          commission_value: number
          created_at: string
          display_order: number
          id: string
          rate_plan_id: string | null
          restaurant_id: string
          room_type_id: string | null
          scope_type: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          commission_plan_id: string
          commission_type: string
          commission_value: number
          created_at?: string
          display_order?: number
          id?: string
          rate_plan_id?: string | null
          restaurant_id: string
          room_type_id?: string | null
          scope_type: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          commission_plan_id?: string
          commission_type?: string
          commission_value?: number
          created_at?: string
          display_order?: number
          id?: string
          rate_plan_id?: string | null
          restaurant_id?: string
          room_type_id?: string | null
          scope_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_agency_commission_rules_commission_plan_id_fkey"
            columns: ["commission_plan_id"]
            isOneToOne: false
            referencedRelation: "pms_agency_commission_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_agency_commission_rules_rate_plan_fk"
            columns: ["rate_plan_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "hotel_rate_plans"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_agency_commission_rules_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_agency_commission_rules_room_type_fk"
            columns: ["room_type_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id", "restaurant_id"]
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
      pms_agency_rate_defaults: {
        Row: {
          active: boolean
          agency_master_id: string
          created_at: string
          id: string
          rate_plan_id: string
          restaurant_id: string
          room_type_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          agency_master_id: string
          created_at?: string
          id?: string
          rate_plan_id: string
          restaurant_id: string
          room_type_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          agency_master_id?: string
          created_at?: string
          id?: string
          rate_plan_id?: string
          restaurant_id?: string
          room_type_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_agency_rate_defaults_agency_fk"
            columns: ["agency_master_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "guest_account_masters"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_agency_rate_defaults_rate_plan_fk"
            columns: ["rate_plan_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "hotel_rate_plans"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_agency_rate_defaults_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_agency_rate_defaults_room_type_fk"
            columns: ["room_type_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id", "restaurant_id"]
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
          applicable_profile_types: string[] | null
          code: string
          created_at: string
          description: string | null
          id: string
          is_default: boolean
          is_system: boolean
          name: string
          operational_status: string
          payer_kind: string
          payment_terms: string | null
          restaurant_id: string
          split_guest_percent: number | null
          system_code: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          applicable_profile_types?: string[] | null
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          is_system?: boolean
          name: string
          operational_status?: string
          payer_kind: string
          payment_terms?: string | null
          restaurant_id: string
          split_guest_percent?: number | null
          system_code?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          applicable_profile_types?: string[] | null
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          is_system?: boolean
          name?: string
          operational_status?: string
          payer_kind?: string
          payment_terms?: string | null
          restaurant_id?: string
          split_guest_percent?: number | null
          system_code?: string | null
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
          applies_to_company: boolean
          applies_to_contract: boolean
          applies_to_travel_agency: boolean
          code: string
          created_at: string
          description: string | null
          display_order: number
          id: string
          name: string
          required: boolean
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          applies_to_company?: boolean
          applies_to_contract?: boolean
          applies_to_travel_agency?: boolean
          code: string
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          name: string
          required?: boolean
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          applies_to_company?: boolean
          applies_to_contract?: boolean
          applies_to_travel_agency?: boolean
          code?: string
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          name?: string
          required?: boolean
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
      pms_contract_types: {
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
        }
        Relationships: [
          {
            foreignKeyName: "pms_contract_types_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_corporate_agreements: {
        Row: {
          active: boolean
          agency_master_id: string | null
          auto_renew: boolean
          code: string
          company_id: string
          contract_number: string
          contract_type_id: string | null
          created_at: string
          currency_code: string
          deposit_policy_id: string | null
          description: string | null
          discount_application: string
          discount_type: string | null
          discount_value: number | null
          file_storage_path: string | null
          id: string
          name: string
          no_show_policy_id: string | null
          notice_period_days: number | null
          pricing_method: string
          rate_cancellation_policy_id: string | null
          rate_plan_discounts: Json | null
          rate_plan_id: string | null
          rate_plan_ids: string[] | null
          rate_plan_scope: string
          restaurant_id: string
          signed_at: string | null
          signed_by: string | null
          status: string
          updated_at: string
          valid_from: string
          valid_to: string
        }
        Insert: {
          active?: boolean
          agency_master_id?: string | null
          auto_renew?: boolean
          code: string
          company_id: string
          contract_number: string
          contract_type_id?: string | null
          created_at?: string
          currency_code: string
          deposit_policy_id?: string | null
          description?: string | null
          discount_application?: string
          discount_type?: string | null
          discount_value?: number | null
          file_storage_path?: string | null
          id?: string
          name: string
          no_show_policy_id?: string | null
          notice_period_days?: number | null
          pricing_method?: string
          rate_cancellation_policy_id?: string | null
          rate_plan_discounts?: Json | null
          rate_plan_id?: string | null
          rate_plan_ids?: string[] | null
          rate_plan_scope?: string
          restaurant_id: string
          signed_at?: string | null
          signed_by?: string | null
          status?: string
          updated_at?: string
          valid_from: string
          valid_to: string
        }
        Update: {
          active?: boolean
          agency_master_id?: string | null
          auto_renew?: boolean
          code?: string
          company_id?: string
          contract_number?: string
          contract_type_id?: string | null
          created_at?: string
          currency_code?: string
          deposit_policy_id?: string | null
          description?: string | null
          discount_application?: string
          discount_type?: string | null
          discount_value?: number | null
          file_storage_path?: string | null
          id?: string
          name?: string
          no_show_policy_id?: string | null
          notice_period_days?: number | null
          pricing_method?: string
          rate_cancellation_policy_id?: string | null
          rate_plan_discounts?: Json | null
          rate_plan_id?: string | null
          rate_plan_ids?: string[] | null
          rate_plan_scope?: string
          restaurant_id?: string
          signed_at?: string | null
          signed_by?: string | null
          status?: string
          updated_at?: string
          valid_from?: string
          valid_to?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_corporate_agreements_agency_master_id_fkey"
            columns: ["agency_master_id"]
            isOneToOne: false
            referencedRelation: "guest_account_masters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_corporate_agreements_company_fk"
            columns: ["company_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "guest_account_masters"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_corporate_agreements_contract_type_id_fkey"
            columns: ["contract_type_id"]
            isOneToOne: false
            referencedRelation: "pms_contract_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_corporate_agreements_deposit_policy_id_fkey"
            columns: ["deposit_policy_id"]
            isOneToOne: false
            referencedRelation: "pms_deposit_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_corporate_agreements_no_show_policy_id_fkey"
            columns: ["no_show_policy_id"]
            isOneToOne: false
            referencedRelation: "pms_no_show_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_corporate_agreements_rate_cancellation_same_property"
            columns: ["rate_cancellation_policy_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_rate_cancellation_policies"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_corporate_agreements_rate_plan_id_fkey"
            columns: ["rate_plan_id"]
            isOneToOne: false
            referencedRelation: "hotel_rate_plans"
            referencedColumns: ["id"]
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
      pms_credit_note_counters: {
        Row: {
          last_sequence: number
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          last_sequence?: number
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          last_sequence?: number
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_credit_note_counters_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_debit_note_counters: {
        Row: {
          last_sequence: number
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          last_sequence?: number
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          last_sequence?: number
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_debit_note_counters_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
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
      pms_distribution_sync_events: {
        Row: {
          attempt_count: number
          channel: string | null
          created_at: string
          direction: string
          external_booking_id: string | null
          id: string
          operation: string
          provider: string
          response_message: string | null
          response_success: boolean | null
          restaurant_id: string
          retry_eligible: boolean
          status: string
        }
        Insert: {
          attempt_count?: number
          channel?: string | null
          created_at?: string
          direction: string
          external_booking_id?: string | null
          id?: string
          operation: string
          provider: string
          response_message?: string | null
          response_success?: boolean | null
          restaurant_id: string
          retry_eligible?: boolean
          status: string
        }
        Update: {
          attempt_count?: number
          channel?: string | null
          created_at?: string
          direction?: string
          external_booking_id?: string | null
          id?: string
          operation?: string
          provider?: string
          response_message?: string | null
          response_success?: boolean | null
          restaurant_id?: string
          retry_eligible?: boolean
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_distribution_sync_events_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_early_departure_policies: {
        Row: {
          active: boolean
          code: string
          created_at: string
          description: string | null
          id: string
          name: string
          penalty_type: string
          penalty_value: number
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
          penalty_type: string
          penalty_value?: number
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
          penalty_type?: string
          penalty_value?: number
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_early_departure_policies_restaurant_id_fkey"
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
      pms_external_reservation_mappings: {
        Row: {
          channel: string
          cm_booking_id: string | null
          created_at: string
          external_booking_id: string
          hotel_code: string
          id: string
          provider: string
          reservation_id: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          channel: string
          cm_booking_id?: string | null
          created_at?: string
          external_booking_id: string
          hotel_code: string
          id?: string
          provider: string
          reservation_id: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          channel?: string
          cm_booking_id?: string | null
          created_at?: string
          external_booking_id?: string
          hotel_code?: string
          id?: string
          provider?: string
          reservation_id?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_external_reservation_mappings_reservation_same_property"
            columns: ["reservation_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "hotel_reservations"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_external_reservation_mappings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_external_reservation_snapshots: {
        Row: {
          amount_after_tax: number | null
          amount_before_tax: number | null
          booked_on: string | null
          channel: string
          cm_booking_id: string | null
          commission: number | null
          created_at: string
          credit_card_present: boolean
          currency: string | null
          external_booking_id: string
          guest_address_line1: string | null
          guest_city: string | null
          guest_country: string | null
          guest_email: string | null
          guest_first_name: string | null
          guest_last_name: string | null
          guest_phone: string | null
          guest_state: string | null
          guest_zip: string | null
          hotel_code: string
          id: string
          pah: boolean | null
          provider: string
          reservation_id: string
          restaurant_id: string
          segment: string | null
          special_requests: string | null
          state_fingerprint: string
          tax: number | null
          tcs: number | null
          tds: number | null
          updated_at: string
        }
        Insert: {
          amount_after_tax?: number | null
          amount_before_tax?: number | null
          booked_on?: string | null
          channel: string
          cm_booking_id?: string | null
          commission?: number | null
          created_at?: string
          credit_card_present?: boolean
          currency?: string | null
          external_booking_id: string
          guest_address_line1?: string | null
          guest_city?: string | null
          guest_country?: string | null
          guest_email?: string | null
          guest_first_name?: string | null
          guest_last_name?: string | null
          guest_phone?: string | null
          guest_state?: string | null
          guest_zip?: string | null
          hotel_code: string
          id?: string
          pah?: boolean | null
          provider: string
          reservation_id: string
          restaurant_id: string
          segment?: string | null
          special_requests?: string | null
          state_fingerprint: string
          tax?: number | null
          tcs?: number | null
          tds?: number | null
          updated_at?: string
        }
        Update: {
          amount_after_tax?: number | null
          amount_before_tax?: number | null
          booked_on?: string | null
          channel?: string
          cm_booking_id?: string | null
          commission?: number | null
          created_at?: string
          credit_card_present?: boolean
          currency?: string | null
          external_booking_id?: string
          guest_address_line1?: string | null
          guest_city?: string | null
          guest_country?: string | null
          guest_email?: string | null
          guest_first_name?: string | null
          guest_last_name?: string | null
          guest_phone?: string | null
          guest_state?: string | null
          guest_zip?: string | null
          hotel_code?: string
          id?: string
          pah?: boolean | null
          provider?: string
          reservation_id?: string
          restaurant_id?: string
          segment?: string | null
          special_requests?: string | null
          state_fingerprint?: string
          tax?: number | null
          tcs?: number | null
          tds?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_external_reservation_snapshots_reservation_same_property"
            columns: ["reservation_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "hotel_reservations"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_external_reservation_snapshots_restaurant_id_fkey"
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
      pms_group_allotment_nights: {
        Row: {
          allotted: number
          group_block_id: string
          id: string
          inventory_block_id: string | null
          night: string
          restaurant_id: string
        }
        Insert: {
          allotted: number
          group_block_id: string
          id?: string
          inventory_block_id?: string | null
          night: string
          restaurant_id: string
        }
        Update: {
          allotted?: number
          group_block_id?: string
          id?: string
          inventory_block_id?: string | null
          night?: string
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_group_allotment_nights_block_same_property"
            columns: ["group_block_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_group_blocks"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_group_allotment_nights_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_group_blocks: {
        Row: {
          allotted: number
          created_at: string
          cutoff_date: string | null
          end_date: string
          group_id: string
          id: string
          reason: string | null
          restaurant_id: string
          room_type_id: string
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          allotted: number
          created_at?: string
          cutoff_date?: string | null
          end_date: string
          group_id: string
          id?: string
          reason?: string | null
          restaurant_id: string
          room_type_id: string
          start_date: string
          status?: string
          updated_at?: string
        }
        Update: {
          allotted?: number
          created_at?: string
          cutoff_date?: string | null
          end_date?: string
          group_id?: string
          id?: string
          reason?: string | null
          restaurant_id?: string
          room_type_id?: string
          start_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_group_blocks_group_same_property"
            columns: ["group_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_groups"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_group_blocks_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_group_blocks_type_fk"
            columns: ["room_type_id"]
            isOneToOne: false
            referencedRelation: "room_types"
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
      pms_group_history: {
        Row: {
          actor_membership_id: string | null
          created_at: string
          event_type: string
          group_id: string
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
          group_id: string
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
          group_id?: string
          id?: string
          new_values?: Json | null
          notes?: string | null
          previous_values?: Json | null
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_group_history_group_same_property"
            columns: ["group_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_groups"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_group_history_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_group_rooming_rows: {
        Row: {
          adults: number
          arrival_date: string
          children: number
          created_at: string
          departure_date: string
          group_block_id: string | null
          group_id: string
          guest_id: string | null
          guest_name: string
          id: string
          reservation_id: string | null
          restaurant_id: string
          room_type_id: string | null
          special_requests: string | null
          status: string
        }
        Insert: {
          adults?: number
          arrival_date: string
          children?: number
          created_at?: string
          departure_date: string
          group_block_id?: string | null
          group_id: string
          guest_id?: string | null
          guest_name: string
          id?: string
          reservation_id?: string | null
          restaurant_id: string
          room_type_id?: string | null
          special_requests?: string | null
          status?: string
        }
        Update: {
          adults?: number
          arrival_date?: string
          children?: number
          created_at?: string
          departure_date?: string
          group_block_id?: string | null
          group_id?: string
          guest_id?: string | null
          guest_name?: string
          id?: string
          reservation_id?: string | null
          restaurant_id?: string
          room_type_id?: string | null
          special_requests?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_group_rooming_rows_group_same_property"
            columns: ["group_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_groups"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_group_rooming_rows_restaurant_id_fkey"
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
      pms_groups: {
        Row: {
          arrival_date: string
          code: string | null
          company_master_id: string | null
          confirmation_number: string
          created_at: string
          created_by_membership_id: string | null
          cutoff_date: string | null
          departure_date: string
          external_reference: string | null
          group_account_master_id: string | null
          group_type: string
          id: string
          leader_guest_id: string | null
          market_segment: string | null
          name: string
          notes: string | null
          rate_plan_id: string | null
          restaurant_id: string
          source: string | null
          status: string
          travel_agent_master_id: string | null
          updated_at: string
        }
        Insert: {
          arrival_date: string
          code?: string | null
          company_master_id?: string | null
          confirmation_number: string
          created_at?: string
          created_by_membership_id?: string | null
          cutoff_date?: string | null
          departure_date: string
          external_reference?: string | null
          group_account_master_id?: string | null
          group_type?: string
          id?: string
          leader_guest_id?: string | null
          market_segment?: string | null
          name: string
          notes?: string | null
          rate_plan_id?: string | null
          restaurant_id: string
          source?: string | null
          status?: string
          travel_agent_master_id?: string | null
          updated_at?: string
        }
        Update: {
          arrival_date?: string
          code?: string | null
          company_master_id?: string | null
          confirmation_number?: string
          created_at?: string
          created_by_membership_id?: string | null
          cutoff_date?: string | null
          departure_date?: string
          external_reference?: string | null
          group_account_master_id?: string | null
          group_type?: string
          id?: string
          leader_guest_id?: string | null
          market_segment?: string | null
          name?: string
          notes?: string | null
          rate_plan_id?: string | null
          restaurant_id?: string
          source?: string | null
          status?: string
          travel_agent_master_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_groups_account_same_property"
            columns: ["group_account_master_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "guest_account_masters"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_groups_company_same_property"
            columns: ["company_master_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "guest_account_masters"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_groups_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_groups_ta_same_property"
            columns: ["travel_agent_master_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "guest_account_masters"
            referencedColumns: ["id", "restaurant_id"]
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
          document_number_active: boolean
          document_number_required: boolean
          expiry_date_active: boolean
          expiry_date_required: boolean
          id: string
          issue_date_active: boolean
          issue_date_required: boolean
          issuing_authority_active: boolean
          issuing_authority_required: boolean
          issuing_country_active: boolean
          issuing_country_required: boolean
          name: string
          required_at_check_in: boolean
          restaurant_id: string
          scan_image_allowed: boolean
          scan_image_required: boolean
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
          document_number_active?: boolean
          document_number_required?: boolean
          expiry_date_active?: boolean
          expiry_date_required?: boolean
          id?: string
          issue_date_active?: boolean
          issue_date_required?: boolean
          issuing_authority_active?: boolean
          issuing_authority_required?: boolean
          issuing_country_active?: boolean
          issuing_country_required?: boolean
          name: string
          required_at_check_in?: boolean
          restaurant_id: string
          scan_image_allowed?: boolean
          scan_image_required?: boolean
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
          document_number_active?: boolean
          document_number_required?: boolean
          expiry_date_active?: boolean
          expiry_date_required?: boolean
          id?: string
          issue_date_active?: boolean
          issue_date_required?: boolean
          issuing_authority_active?: boolean
          issuing_authority_required?: boolean
          issuing_country_active?: boolean
          issuing_country_required?: boolean
          name?: string
          required_at_check_in?: boolean
          restaurant_id?: string
          scan_image_allowed?: boolean
          scan_image_required?: boolean
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
          is_billing_department: boolean
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
          is_billing_department?: boolean
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
          is_billing_department?: boolean
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
          chargeable_to_folio: boolean
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
          chargeable_to_folio?: boolean
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
          chargeable_to_folio?: boolean
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
          external_property_code: string | null
          id: string
          last_error: string | null
          last_test_at: string | null
          last_test_result: string | null
          last_validated_at: string | null
          name: string
          partner_slug: string | null
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
          external_property_code?: string | null
          id?: string
          last_error?: string | null
          last_test_at?: string | null
          last_test_result?: string | null
          last_validated_at?: string | null
          name: string
          partner_slug?: string | null
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
          external_property_code?: string | null
          id?: string
          last_error?: string | null
          last_test_at?: string | null
          last_test_result?: string | null
          last_validated_at?: string | null
          name?: string
          partner_slug?: string | null
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
      pms_issued_invoice_counters: {
        Row: {
          created_at: string
          last_sequence: number
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          last_sequence: number
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          last_sequence?: number
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_issued_invoice_counters_restaurant_id_fkey"
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
      pms_meal_applicability_policies: {
        Row: {
          breakfast_department_id: string | null
          breakfast_include_arrival: boolean
          breakfast_include_departure: boolean
          breakfast_include_stay: boolean
          count_infants: boolean
          created_at: string
          dinner_department_id: string | null
          dinner_include_arrival: boolean
          dinner_include_departure: boolean
          dinner_include_stay: boolean
          lunch_department_id: string | null
          lunch_include_arrival: boolean
          lunch_include_departure: boolean
          lunch_include_stay: boolean
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          breakfast_department_id?: string | null
          breakfast_include_arrival?: boolean
          breakfast_include_departure?: boolean
          breakfast_include_stay?: boolean
          count_infants?: boolean
          created_at?: string
          dinner_department_id?: string | null
          dinner_include_arrival?: boolean
          dinner_include_departure?: boolean
          dinner_include_stay?: boolean
          lunch_department_id?: string | null
          lunch_include_arrival?: boolean
          lunch_include_departure?: boolean
          lunch_include_stay?: boolean
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          breakfast_department_id?: string | null
          breakfast_include_arrival?: boolean
          breakfast_include_departure?: boolean
          breakfast_include_stay?: boolean
          count_infants?: boolean
          created_at?: string
          dinner_department_id?: string | null
          dinner_include_arrival?: boolean
          dinner_include_departure?: boolean
          dinner_include_stay?: boolean
          lunch_department_id?: string | null
          lunch_include_arrival?: boolean
          lunch_include_departure?: boolean
          lunch_include_stay?: boolean
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_meal_applicability_policies_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
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
      pms_no_show_policies: {
        Row: {
          active: boolean
          code: string
          created_at: string
          description: string | null
          id: string
          is_default: boolean
          name: string
          penalty_type: string
          penalty_value: number
          release_hour: number
          restaurant_id: string
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
          penalty_type: string
          penalty_value?: number
          release_hour?: number
          restaurant_id: string
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
          penalty_type?: string
          penalty_value?: number
          release_hour?: number
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_no_show_policies_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
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
      pms_overbooking_date_limits: {
        Row: {
          created_at: string
          created_by_membership_id: string | null
          enabled: boolean
          end_date: string
          id: string
          maximum_overbooking: number | null
          percentage_limit: number | null
          restaurant_id: string
          room_type_id: string
          start_date: string
          updated_at: string
          updated_by_membership_id: string | null
        }
        Insert: {
          created_at?: string
          created_by_membership_id?: string | null
          enabled?: boolean
          end_date: string
          id?: string
          maximum_overbooking?: number | null
          percentage_limit?: number | null
          restaurant_id: string
          room_type_id: string
          start_date: string
          updated_at?: string
          updated_by_membership_id?: string | null
        }
        Update: {
          created_at?: string
          created_by_membership_id?: string | null
          enabled?: boolean
          end_date?: string
          id?: string
          maximum_overbooking?: number | null
          percentage_limit?: number | null
          restaurant_id?: string
          room_type_id?: string
          start_date?: string
          updated_at?: string
          updated_by_membership_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pms_overbooking_date_limits_created_by_fk"
            columns: ["created_by_membership_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_overbooking_date_limits_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_overbooking_date_limits_room_type_fk"
            columns: ["room_type_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_overbooking_date_limits_updated_by_fk"
            columns: ["updated_by_membership_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id", "restaurant_id"]
          },
        ]
      }
      pms_package_components: {
        Row: {
          component_kind: string
          created_at: string
          fo_service_id: string | null
          fulfillment_department_id: string | null
          id: string
          meal_plan_id: string | null
          package_id: string
          quantity: number
          requires_fulfillment: boolean
          restaurant_id: string
          room_amenity_id: string | null
          service_date_rule: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          component_kind: string
          created_at?: string
          fo_service_id?: string | null
          fulfillment_department_id?: string | null
          id?: string
          meal_plan_id?: string | null
          package_id: string
          quantity?: number
          requires_fulfillment?: boolean
          restaurant_id: string
          room_amenity_id?: string | null
          service_date_rule?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          component_kind?: string
          created_at?: string
          fo_service_id?: string | null
          fulfillment_department_id?: string | null
          id?: string
          meal_plan_id?: string | null
          package_id?: string
          quantity?: number
          requires_fulfillment?: boolean
          restaurant_id?: string
          room_amenity_id?: string | null
          service_date_rule?: string | null
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
          inclusion_type: string
          package_id: string
          rate_plan_id: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          inclusion_type?: string
          package_id: string
          rate_plan_id: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          inclusion_type?: string
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
          charge_basis: string
          code: string
          cover_image_path: string | null
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
          charge_basis?: string
          code: string
          cover_image_path?: string | null
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
          charge_basis?: string
          code?: string
          cover_image_path?: string | null
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
      pms_purpose_of_stay: {
        Row: {
          active: boolean
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
            foreignKeyName: "pms_purpose_of_stay_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_rate_cancellation_policies: {
        Row: {
          active: boolean
          code: string
          created_at: string
          cutoff_time: string | null
          deadline_hours: number | null
          description: string | null
          id: string
          name: string
          penalty_type: string
          penalty_value: number
          policy_kind: string
          restaurant_id: string
          updated_at: string
          window_unit: string
          window_value: number | null
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          cutoff_time?: string | null
          deadline_hours?: number | null
          description?: string | null
          id?: string
          name: string
          penalty_type?: string
          penalty_value?: number
          policy_kind?: string
          restaurant_id: string
          updated_at?: string
          window_unit?: string
          window_value?: number | null
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          cutoff_time?: string | null
          deadline_hours?: number | null
          description?: string | null
          id?: string
          name?: string
          penalty_type?: string
          penalty_value?: number
          policy_kind?: string
          restaurant_id?: string
          updated_at?: string
          window_unit?: string
          window_value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pms_rate_cancellation_policies_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_rate_refundability_codes: {
        Row: {
          active: boolean
          code: string
          created_at: string
          description: string | null
          id: string
          kind: string
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
          kind: string
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
          kind?: string
          name?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_rate_refundability_codes_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_registration_agreement_versions: {
        Row: {
          acknowledgement_intro: string | null
          acknowledgement_title: string | null
          acknowledgements: Json | null
          active: boolean
          agreement_sections: Json | null
          body: string
          created_at: string
          created_by_membership_id: string | null
          id: string
          intro: string | null
          lead_in: string | null
          published_at: string | null
          published_by: string | null
          resolved_check_in_time: string | null
          resolved_check_out_time: string | null
          restaurant_id: string
          title: string | null
          version_label: string
        }
        Insert: {
          acknowledgement_intro?: string | null
          acknowledgement_title?: string | null
          acknowledgements?: Json | null
          active?: boolean
          agreement_sections?: Json | null
          body: string
          created_at?: string
          created_by_membership_id?: string | null
          id?: string
          intro?: string | null
          lead_in?: string | null
          published_at?: string | null
          published_by?: string | null
          resolved_check_in_time?: string | null
          resolved_check_out_time?: string | null
          restaurant_id: string
          title?: string | null
          version_label: string
        }
        Update: {
          acknowledgement_intro?: string | null
          acknowledgement_title?: string | null
          acknowledgements?: Json | null
          active?: boolean
          agreement_sections?: Json | null
          body?: string
          created_at?: string
          created_by_membership_id?: string | null
          id?: string
          intro?: string | null
          lead_in?: string | null
          published_at?: string | null
          published_by?: string | null
          resolved_check_in_time?: string | null
          resolved_check_out_time?: string | null
          restaurant_id?: string
          title?: string | null
          version_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_registration_agreement_versions_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_report_access_events: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          filters_snapshot: Json
          id: string
          membership_id: string
          report_code: string
          restaurant_id: string
          row_count: number
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          filters_snapshot?: Json
          id?: string
          membership_id: string
          report_code: string
          restaurant_id: string
          row_count: number
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          filters_snapshot?: Json
          id?: string
          membership_id?: string
          report_code?: string
          restaurant_id?: string
          row_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "pms_report_access_events_membership_fk"
            columns: ["membership_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_report_access_events_restaurant_id_fkey"
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
      pms_reservation_overbooking_approvals: {
        Row: {
          approved_by_membership_id: string
          created_at: string
          id: string
          nights: Json
          reason: string | null
          requested_by_membership_id: string
          reservation_id: string
          restaurant_id: string
        }
        Insert: {
          approved_by_membership_id: string
          created_at?: string
          id?: string
          nights: Json
          reason?: string | null
          requested_by_membership_id: string
          reservation_id: string
          restaurant_id: string
        }
        Update: {
          approved_by_membership_id?: string
          created_at?: string
          id?: string
          nights?: Json
          reason?: string | null
          requested_by_membership_id?: string
          reservation_id?: string
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_reservation_overbooking_approvals_approver_fk"
            columns: ["approved_by_membership_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_reservation_overbooking_approvals_requester_fk"
            columns: ["requested_by_membership_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_reservation_overbooking_approvals_reservation_fk"
            columns: ["reservation_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "hotel_reservations"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_reservation_overbooking_approvals_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_reservation_service_entitlements: {
        Row: {
          adult_quantity: number
          building_snapshot: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          child_quantity: number
          component_id: string | null
          created_at: string
          department_id: string | null
          floor_snapshot: string | null
          fulfilled_at: string | null
          fulfilled_by_membership_id: string | null
          generation_key: string
          guest_id: string | null
          guest_name_snapshot: string
          id: string
          infant_quantity: number
          meal_code: string | null
          meal_plan_name_snapshot: string | null
          notes_snapshot: string | null
          reservation_id: string
          reservation_room_id: string
          restaurant_id: string
          room_number_snapshot: string
          service_date: string
          service_kind: string
          service_name_snapshot: string
          service_reference_id: string
          source_id: string
          source_type: string
          status: string
          total_quantity: number
          updated_at: string
        }
        Insert: {
          adult_quantity?: number
          building_snapshot?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          child_quantity?: number
          component_id?: string | null
          created_at?: string
          department_id?: string | null
          floor_snapshot?: string | null
          fulfilled_at?: string | null
          fulfilled_by_membership_id?: string | null
          generation_key: string
          guest_id?: string | null
          guest_name_snapshot?: string
          id?: string
          infant_quantity?: number
          meal_code?: string | null
          meal_plan_name_snapshot?: string | null
          notes_snapshot?: string | null
          reservation_id: string
          reservation_room_id: string
          restaurant_id: string
          room_number_snapshot?: string
          service_date: string
          service_kind: string
          service_name_snapshot: string
          service_reference_id: string
          source_id: string
          source_type: string
          status?: string
          total_quantity?: number
          updated_at?: string
        }
        Update: {
          adult_quantity?: number
          building_snapshot?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          child_quantity?: number
          component_id?: string | null
          created_at?: string
          department_id?: string | null
          floor_snapshot?: string | null
          fulfilled_at?: string | null
          fulfilled_by_membership_id?: string | null
          generation_key?: string
          guest_id?: string | null
          guest_name_snapshot?: string
          id?: string
          infant_quantity?: number
          meal_code?: string | null
          meal_plan_name_snapshot?: string | null
          notes_snapshot?: string | null
          reservation_id?: string
          reservation_room_id?: string
          restaurant_id?: string
          room_number_snapshot?: string
          service_date?: string
          service_kind?: string
          service_name_snapshot?: string
          service_reference_id?: string
          source_id?: string
          source_type?: string
          status?: string
          total_quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_reservation_service_entitlements_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_service_entitlements_reservation_fk"
            columns: ["reservation_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "hotel_reservations"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_service_entitlements_room_fk"
            columns: ["reservation_room_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "hotel_reservation_rooms"
            referencedColumns: ["id", "restaurant_id"]
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
      pms_room_type_overbooking_rules: {
        Row: {
          created_at: string
          created_by_membership_id: string | null
          enabled: boolean
          id: string
          maximum_overbooking: number | null
          percentage_limit: number | null
          restaurant_id: string
          room_type_id: string
          updated_at: string
          updated_by_membership_id: string | null
        }
        Insert: {
          created_at?: string
          created_by_membership_id?: string | null
          enabled?: boolean
          id?: string
          maximum_overbooking?: number | null
          percentage_limit?: number | null
          restaurant_id: string
          room_type_id: string
          updated_at?: string
          updated_by_membership_id?: string | null
        }
        Update: {
          created_at?: string
          created_by_membership_id?: string | null
          enabled?: boolean
          id?: string
          maximum_overbooking?: number | null
          percentage_limit?: number | null
          restaurant_id?: string
          room_type_id?: string
          updated_at?: string
          updated_by_membership_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pms_room_type_overbooking_rules_created_by_fk"
            columns: ["created_by_membership_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_room_type_overbooking_rules_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_room_type_overbooking_rules_room_type_fk"
            columns: ["room_type_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_room_type_overbooking_rules_updated_by_fk"
            columns: ["updated_by_membership_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_users"
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
          default_probability: number | null
          description: string | null
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
          default_probability?: number | null
          description?: string | null
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
          default_probability?: number | null
          description?: string | null
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
      pms_service_charge_department_targets: {
        Row: {
          created_at: string
          department_id: string
          id: string
          restaurant_id: string
          service_charge_id: string
        }
        Insert: {
          created_at?: string
          department_id: string
          id?: string
          restaurant_id: string
          service_charge_id: string
        }
        Update: {
          created_at?: string
          department_id?: string
          id?: string
          restaurant_id?: string
          service_charge_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_service_charge_department_targets_department_fk"
            columns: ["department_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_departments"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_service_charge_department_targets_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_service_charge_department_targets_rule_fk"
            columns: ["service_charge_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_service_charges"
            referencedColumns: ["id", "restaurant_id"]
          },
        ]
      }
      pms_service_charges: {
        Row: {
          active: boolean
          amount: number
          applicability_scope: string
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
          applicability_scope?: string
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
          applicability_scope?: string
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
      pms_tax_department_targets: {
        Row: {
          created_at: string
          department_id: string
          id: string
          restaurant_id: string
          tax_id: string
        }
        Insert: {
          created_at?: string
          department_id: string
          id?: string
          restaurant_id: string
          tax_id: string
        }
        Update: {
          created_at?: string
          department_id?: string
          id?: string
          restaurant_id?: string
          tax_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_tax_department_targets_department_fk"
            columns: ["department_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_departments"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_tax_department_targets_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_tax_department_targets_tax_fk"
            columns: ["tax_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_taxes"
            referencedColumns: ["id", "restaurant_id"]
          },
        ]
      }
      pms_tax_exemption_rules: {
        Row: {
          active: boolean
          approval_required: boolean
          code: string
          created_at: string
          custom_reason: string | null
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
          custom_reason?: string | null
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
          custom_reason?: string | null
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
          applicability_scope: string
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
          applicability_scope?: string
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
          applicability_scope?: string
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
      pms_waitlist_history: {
        Row: {
          actor_membership_id: string | null
          created_at: string
          event_type: string
          id: string
          new_values: Json | null
          notes: string | null
          previous_values: Json | null
          restaurant_id: string
          waitlist_request_id: string
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
          waitlist_request_id: string
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
          waitlist_request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_waitlist_history_request_same_property"
            columns: ["waitlist_request_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_waitlist_requests"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_waitlist_history_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_waitlist_offers: {
        Row: {
          arrival_date: string
          created_at: string
          created_by_membership_id: string | null
          departure_date: string
          expires_at: string
          id: string
          quoted_currency: string | null
          quoted_total: number | null
          rate_plan_id: string | null
          restaurant_id: string
          room_type_id: string
          status: string
          updated_at: string
          waitlist_request_id: string
        }
        Insert: {
          arrival_date: string
          created_at?: string
          created_by_membership_id?: string | null
          departure_date: string
          expires_at: string
          id?: string
          quoted_currency?: string | null
          quoted_total?: number | null
          rate_plan_id?: string | null
          restaurant_id: string
          room_type_id: string
          status?: string
          updated_at?: string
          waitlist_request_id: string
        }
        Update: {
          arrival_date?: string
          created_at?: string
          created_by_membership_id?: string | null
          departure_date?: string
          expires_at?: string
          id?: string
          quoted_currency?: string | null
          quoted_total?: number | null
          rate_plan_id?: string | null
          restaurant_id?: string
          room_type_id?: string
          status?: string
          updated_at?: string
          waitlist_request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_waitlist_offers_request_same_property"
            columns: ["waitlist_request_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "pms_waitlist_requests"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_waitlist_offers_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_waitlist_offers_room_type_same_property"
            columns: ["room_type_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id", "restaurant_id"]
          },
        ]
      }
      pms_waitlist_requests: {
        Row: {
          adults: number
          alternate_room_type_ids: string[]
          arrival_date: string
          children: number
          confirmation_number: string
          created_at: string
          created_by_membership_id: string | null
          departure_date: string
          flexible_dates: boolean
          guest_id: string
          id: string
          notes: string | null
          priority: number
          requested_room_type_id: string | null
          reservation_id: string | null
          restaurant_id: string
          status: string
          updated_at: string
        }
        Insert: {
          adults?: number
          alternate_room_type_ids?: string[]
          arrival_date: string
          children?: number
          confirmation_number: string
          created_at?: string
          created_by_membership_id?: string | null
          departure_date: string
          flexible_dates?: boolean
          guest_id: string
          id?: string
          notes?: string | null
          priority?: number
          requested_room_type_id?: string | null
          reservation_id?: string | null
          restaurant_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          adults?: number
          alternate_room_type_ids?: string[]
          arrival_date?: string
          children?: number
          confirmation_number?: string
          created_at?: string
          created_by_membership_id?: string | null
          departure_date?: string
          flexible_dates?: boolean
          guest_id?: string
          id?: string
          notes?: string | null
          priority?: number
          requested_room_type_id?: string | null
          reservation_id?: string | null
          restaurant_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pms_waitlist_requests_guest_same_property"
            columns: ["guest_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "guest_profiles"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "pms_waitlist_requests_reservation_fk"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "hotel_reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_waitlist_requests_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_waitlist_requests_room_type_same_property"
            columns: ["requested_room_type_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id", "restaurant_id"]
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
      reservation_traces: {
        Row: {
          assignee_name: string | null
          completed_at: string | null
          created_at: string
          department: string | null
          due_at: string | null
          id: string
          notes: string | null
          priority: string
          reservation_id: string
          restaurant_id: string
          status: string
          task: string
          updated_at: string
        }
        Insert: {
          assignee_name?: string | null
          completed_at?: string | null
          created_at?: string
          department?: string | null
          due_at?: string | null
          id?: string
          notes?: string | null
          priority?: string
          reservation_id: string
          restaurant_id: string
          status?: string
          task: string
          updated_at?: string
        }
        Update: {
          assignee_name?: string | null
          completed_at?: string | null
          created_at?: string
          department?: string | null
          due_at?: string | null
          id?: string
          notes?: string | null
          priority?: string
          reservation_id?: string
          restaurant_id?: string
          status?: string
          task?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservation_traces_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "hotel_reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_traces_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
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
          default_room_tax_group_id: string | null
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
          default_room_tax_group_id?: string | null
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
          default_room_tax_group_id?: string | null
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
        Relationships: [
          {
            foreignKeyName: "restaurants_default_room_tax_group_fk"
            columns: ["default_room_tax_group_id", "id"]
            isOneToOne: false
            referencedRelation: "pms_tax_groups"
            referencedColumns: ["id", "restaurant_id"]
          },
        ]
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
      withholding_certificates: {
        Row: {
          amount: number
          certificate_date: string
          created_at: string
          created_by_membership_id: string | null
          currency: string
          financial_account_id: string
          id: string
          idempotency_key: string | null
          invoice_id: string
          ledger_transaction_id: string
          pretax_base: number
          reason: string | null
          reference: string | null
          restaurant_id: string
          reverses_certificate_id: string | null
        }
        Insert: {
          amount: number
          certificate_date: string
          created_at?: string
          created_by_membership_id?: string | null
          currency: string
          financial_account_id: string
          id?: string
          idempotency_key?: string | null
          invoice_id: string
          ledger_transaction_id: string
          pretax_base: number
          reason?: string | null
          reference?: string | null
          restaurant_id: string
          reverses_certificate_id?: string | null
        }
        Update: {
          amount?: number
          certificate_date?: string
          created_at?: string
          created_by_membership_id?: string | null
          currency?: string
          financial_account_id?: string
          id?: string
          idempotency_key?: string | null
          invoice_id?: string
          ledger_transaction_id?: string
          pretax_base?: number
          reason?: string | null
          reference?: string | null
          restaurant_id?: string
          reverses_certificate_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "withholding_certificates_account_property"
            columns: ["financial_account_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "withholding_certificates_invoice_property"
            columns: ["invoice_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "financial_account_invoices"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "withholding_certificates_ledger_property"
            columns: ["ledger_transaction_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "folio_transactions"
            referencedColumns: ["id", "restaurant_id"]
          },
          {
            foreignKeyName: "withholding_certificates_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "withholding_certificates_reversal_property"
            columns: ["reverses_certificate_id", "restaurant_id"]
            isOneToOne: false
            referencedRelation: "withholding_certificates"
            referencedColumns: ["id", "restaurant_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      account_invoice_active_withholding: {
        Args: { _invoice_id: string; _restaurant_id: string }
        Returns: number
      }
      account_invoice_row_owned: {
        Args: {
          _account_id: string
          _restaurant_id: string
          _transaction_id: string
        }
        Returns: number
      }
      allocate_fiscal_item_code: {
        Args: {
          _except_mapping_id?: string
          _requested?: number
          _restaurant_id: string
        }
        Returns: number
      }
      allocate_transfer_shares: {
        Args: { _amount: number; _components: Json }
        Returns: Json
      }
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
          arrival_transport: string | null
          billing_rule_id: string | null
          booker_guest_id: string | null
          cancellation_policy_snapshot: Json | null
          cancellation_reason: string | null
          children: number
          commercial_booking_source: string | null
          commercial_sales_channel: string | null
          company_contact_id: string | null
          company_master_id: string | null
          company_name: string | null
          confirmation_number: string
          created_at: string
          created_by_staff_membership_id: string | null
          currency: string | null
          departure_date: string
          deposit_policy_id: string | null
          deposit_requirement_snapshot: Json | null
          early_departure_policy_id: string | null
          early_departure_policy_snapshot: Json | null
          expected_arrival_at: string | null
          external_reference: string | null
          group_account_master_id: string | null
          group_name: string | null
          guarantee_method: string | null
          guest_id: string
          id: string
          infants: number
          late_checkout_granted: boolean
          late_checkout_note: string | null
          late_checkout_until: string | null
          market_segment: string | null
          nightly_rate_snapshot: Json | null
          no_show_policy_id: string | null
          no_show_policy_snapshot: Json | null
          notes: string | null
          notes_pinned: boolean
          pickup_note: string | null
          pms_group_block_id: string | null
          pms_group_id: string | null
          priced_at: string | null
          purpose_of_stay: string | null
          rate_notes: string | null
          rate_plan_id: string | null
          refundability_snapshot: Json | null
          reservation_mode: string
          restaurant_id: string
          room_id: string | null
          room_subtotal: number | null
          room_type_id: string
          rooms_requested: number
          source: string
          special_occasion: string | null
          special_request_category: string | null
          special_requests: string | null
          status: string
          travel_agent_contact_id: string | null
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
      amend_hotel_reservation_overbooking: {
        Args: {
          _adults: number
          _arrival: string
          _children: number
          _departure: string
          _infants?: number
          _membership_id: string
          _notes: string
          _overbooking_reason: string
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
          arrival_transport: string | null
          billing_rule_id: string | null
          booker_guest_id: string | null
          cancellation_policy_snapshot: Json | null
          cancellation_reason: string | null
          children: number
          commercial_booking_source: string | null
          commercial_sales_channel: string | null
          company_contact_id: string | null
          company_master_id: string | null
          company_name: string | null
          confirmation_number: string
          created_at: string
          created_by_staff_membership_id: string | null
          currency: string | null
          departure_date: string
          deposit_policy_id: string | null
          deposit_requirement_snapshot: Json | null
          early_departure_policy_id: string | null
          early_departure_policy_snapshot: Json | null
          expected_arrival_at: string | null
          external_reference: string | null
          group_account_master_id: string | null
          group_name: string | null
          guarantee_method: string | null
          guest_id: string
          id: string
          infants: number
          late_checkout_granted: boolean
          late_checkout_note: string | null
          late_checkout_until: string | null
          market_segment: string | null
          nightly_rate_snapshot: Json | null
          no_show_policy_id: string | null
          no_show_policy_snapshot: Json | null
          notes: string | null
          notes_pinned: boolean
          pickup_note: string | null
          pms_group_block_id: string | null
          pms_group_id: string | null
          priced_at: string | null
          purpose_of_stay: string | null
          rate_notes: string | null
          rate_plan_id: string | null
          refundability_snapshot: Json | null
          reservation_mode: string
          restaurant_id: string
          room_id: string | null
          room_subtotal: number | null
          room_type_id: string
          rooms_requested: number
          source: string
          special_occasion: string | null
          special_request_category: string | null
          special_requests: string | null
          status: string
          travel_agent_contact_id: string | null
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
          _infants?: number
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
          arrival_transport: string | null
          billing_rule_id: string | null
          booker_guest_id: string | null
          cancellation_policy_snapshot: Json | null
          cancellation_reason: string | null
          children: number
          commercial_booking_source: string | null
          commercial_sales_channel: string | null
          company_contact_id: string | null
          company_master_id: string | null
          company_name: string | null
          confirmation_number: string
          created_at: string
          created_by_staff_membership_id: string | null
          currency: string | null
          departure_date: string
          deposit_policy_id: string | null
          deposit_requirement_snapshot: Json | null
          early_departure_policy_id: string | null
          early_departure_policy_snapshot: Json | null
          expected_arrival_at: string | null
          external_reference: string | null
          group_account_master_id: string | null
          group_name: string | null
          guarantee_method: string | null
          guest_id: string
          id: string
          infants: number
          late_checkout_granted: boolean
          late_checkout_note: string | null
          late_checkout_until: string | null
          market_segment: string | null
          nightly_rate_snapshot: Json | null
          no_show_policy_id: string | null
          no_show_policy_snapshot: Json | null
          notes: string | null
          notes_pinned: boolean
          pickup_note: string | null
          pms_group_block_id: string | null
          pms_group_id: string | null
          priced_at: string | null
          purpose_of_stay: string | null
          rate_notes: string | null
          rate_plan_id: string | null
          refundability_snapshot: Json | null
          reservation_mode: string
          restaurant_id: string
          room_id: string | null
          room_subtotal: number | null
          room_type_id: string
          rooms_requested: number
          source: string
          special_occasion: string | null
          special_request_category: string | null
          special_requests: string | null
          status: string
          travel_agent_contact_id: string | null
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
      append_folio_tax_and_service_lines: {
        Args: {
          _default_tax_group_id?: string
          _entered_amount: number
          _folio_id: string
          _folio_window_id?: string
          _membership_id: string
          _parent_id: string
          _restaurant_id: string
          _tax_basis: string
        }
        Returns: undefined
      }
      apply_external_reservation_event: {
        Args: { _payload: Json }
        Returns: Json
      }
      apply_financial_account_payment_allocations: {
        Args: {
          _account_id: string
          _expected_available: number
          _idempotency_key: string
          _membership_id: string
          _payment_id: string
          _restaurant_id: string
          _targets: Json
        }
        Returns: Json
      }
      apply_guest_deposit_invoice_allocations: {
        Args: {
          _deposit_id: string
          _expected_available: number
          _folio_id: string
          _idempotency_key: string
          _membership_id: string
          _restaurant_id: string
          _targets: Json
        }
        Returns: Json
      }
      apply_guest_payment_invoice_allocations: {
        Args: {
          _expected_available: number
          _folio_id: string
          _idempotency_key: string
          _membership_id: string
          _payment_id: string
          _restaurant_id: string
          _targets: Json
        }
        Returns: Json
      }
      apply_hotel_package_activation: {
        Args: { _membership_id: string; _payload: Json; _restaurant_id: string }
        Returns: Json
      }
      apply_hotel_promotion_activation: {
        Args: { _membership_id: string; _payload: Json; _restaurant_id: string }
        Returns: Json
      }
      apply_hotel_rate_changes: {
        Args: {
          _membership_id: string
          _operation_id: string
          _reason: string
          _restaurant_id: string
          _rule: Json
          _source: string
          _targets: Json
        }
        Returns: Json
      }
      apply_hotel_rate_restrictions: {
        Args: {
          _membership_id: string
          _operation: Json
          _operation_id: string
          _reason: string
          _restaurant_id: string
          _source: string
          _targets: Json
        }
        Returns: Json
      }
      apply_hotel_reservation_room_package: {
        Args: {
          _membership_id: string
          _package_activation_id: string
          _reservation_id: string
          _reservation_room_id: string
          _restaurant_id: string
        }
        Returns: string
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
      approve_hotel_revenue_approval: {
        Args: {
          _membership_id: string
          _request_id: string
          _restaurant_id: string
          _review_reason: string
        }
        Returns: Json
      }
      assert_account_charge_not_invoiced: {
        Args: {
          _account_id: string
          _error_code: string
          _restaurant_id: string
          _source_transaction_id: string
        }
        Returns: undefined
      }
      assert_guest_charge_not_invoiced: {
        Args: {
          _error_code: string
          _folio_id: string
          _restaurant_id: string
          _source_transaction_id: string
        }
        Returns: undefined
      }
      assert_hotel_reservation_package_mutable: {
        Args: { _reservation_id: string; _restaurant_id: string }
        Returns: undefined
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
      assert_reservation_room_unit_room: {
        Args: {
          _arrival: string
          _departure: string
          _reservation_id: string
          _restaurant_id: string
          _room_id: string
          _room_type_id: string
          _unit_id: string
        }
        Returns: undefined
      }
      assert_reservation_room_units: {
        Args: { _reservation_id: string; _restaurant_id: string }
        Returns: undefined
      }
      assert_reservation_unit_room_charge_reconcilable: {
        Args: {
          _reservation_id: string
          _reservation_room_id: string
          _restaurant_id: string
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
      assign_hotel_reservation_room_unit: {
        Args: {
          _membership_id: string
          _reservation_id: string
          _reservation_room_id?: string
          _restaurant_id: string
          _room_id: string
        }
        Returns: {
          adults: number
          arrival_date: string
          arrival_transport: string | null
          billing_rule_id: string | null
          booker_guest_id: string | null
          cancellation_policy_snapshot: Json | null
          cancellation_reason: string | null
          children: number
          commercial_booking_source: string | null
          commercial_sales_channel: string | null
          company_contact_id: string | null
          company_master_id: string | null
          company_name: string | null
          confirmation_number: string
          created_at: string
          created_by_staff_membership_id: string | null
          currency: string | null
          departure_date: string
          deposit_policy_id: string | null
          deposit_requirement_snapshot: Json | null
          early_departure_policy_id: string | null
          early_departure_policy_snapshot: Json | null
          expected_arrival_at: string | null
          external_reference: string | null
          group_account_master_id: string | null
          group_name: string | null
          guarantee_method: string | null
          guest_id: string
          id: string
          infants: number
          late_checkout_granted: boolean
          late_checkout_note: string | null
          late_checkout_until: string | null
          market_segment: string | null
          nightly_rate_snapshot: Json | null
          no_show_policy_id: string | null
          no_show_policy_snapshot: Json | null
          notes: string | null
          notes_pinned: boolean
          pickup_note: string | null
          pms_group_block_id: string | null
          pms_group_id: string | null
          priced_at: string | null
          purpose_of_stay: string | null
          rate_notes: string | null
          rate_plan_id: string | null
          refundability_snapshot: Json | null
          reservation_mode: string
          restaurant_id: string
          room_id: string | null
          room_subtotal: number | null
          room_type_id: string
          rooms_requested: number
          source: string
          special_occasion: string | null
          special_request_category: string | null
          special_requests: string | null
          status: string
          travel_agent_contact_id: string | null
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
      assign_reservation_room_guests: {
        Args: {
          _assignments: Json
          _reservation_id: string
          _restaurant_id: string
        }
        Returns: undefined
      }
      build_folio_charge_correction: {
        Args: {
          _amount: number
          _mode: string
          _restaurant_id: string
          _source_transaction_id: string
        }
        Returns: Json
      }
      build_guest_folio_invoice_snapshot: {
        Args: {
          _folio_id: string
          _issued_number: string
          _membership_id: string
          _restaurant_id: string
          _sequence_number: number
        }
        Returns: Json
      }
      can_manage_restaurant_storage: {
        Args: { _path: string }
        Returns: boolean
      }
      cancel_hotel_reservation_unit: {
        Args: {
          _membership_id: string
          _reason: string
          _reservation_id: string
          _reservation_room_id?: string
          _restaurant_id: string
        }
        Returns: {
          adults: number
          arrival_date: string
          arrival_transport: string | null
          billing_rule_id: string | null
          booker_guest_id: string | null
          cancellation_policy_snapshot: Json | null
          cancellation_reason: string | null
          children: number
          commercial_booking_source: string | null
          commercial_sales_channel: string | null
          company_contact_id: string | null
          company_master_id: string | null
          company_name: string | null
          confirmation_number: string
          created_at: string
          created_by_staff_membership_id: string | null
          currency: string | null
          departure_date: string
          deposit_policy_id: string | null
          deposit_requirement_snapshot: Json | null
          early_departure_policy_id: string | null
          early_departure_policy_snapshot: Json | null
          expected_arrival_at: string | null
          external_reference: string | null
          group_account_master_id: string | null
          group_name: string | null
          guarantee_method: string | null
          guest_id: string
          id: string
          infants: number
          late_checkout_granted: boolean
          late_checkout_note: string | null
          late_checkout_until: string | null
          market_segment: string | null
          nightly_rate_snapshot: Json | null
          no_show_policy_id: string | null
          no_show_policy_snapshot: Json | null
          notes: string | null
          notes_pinned: boolean
          pickup_note: string | null
          pms_group_block_id: string | null
          pms_group_id: string | null
          priced_at: string | null
          purpose_of_stay: string | null
          rate_notes: string | null
          rate_plan_id: string | null
          refundability_snapshot: Json | null
          reservation_mode: string
          restaurant_id: string
          room_id: string | null
          room_subtotal: number | null
          room_type_id: string
          rooms_requested: number
          source: string
          special_occasion: string | null
          special_request_category: string | null
          special_requests: string | null
          status: string
          travel_agent_contact_id: string | null
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
          arrival_transport: string | null
          billing_rule_id: string | null
          booker_guest_id: string | null
          cancellation_policy_snapshot: Json | null
          cancellation_reason: string | null
          children: number
          commercial_booking_source: string | null
          commercial_sales_channel: string | null
          company_contact_id: string | null
          company_master_id: string | null
          company_name: string | null
          confirmation_number: string
          created_at: string
          created_by_staff_membership_id: string | null
          currency: string | null
          departure_date: string
          deposit_policy_id: string | null
          deposit_requirement_snapshot: Json | null
          early_departure_policy_id: string | null
          early_departure_policy_snapshot: Json | null
          expected_arrival_at: string | null
          external_reference: string | null
          group_account_master_id: string | null
          group_name: string | null
          guarantee_method: string | null
          guest_id: string
          id: string
          infants: number
          late_checkout_granted: boolean
          late_checkout_note: string | null
          late_checkout_until: string | null
          market_segment: string | null
          nightly_rate_snapshot: Json | null
          no_show_policy_id: string | null
          no_show_policy_snapshot: Json | null
          notes: string | null
          notes_pinned: boolean
          pickup_note: string | null
          pms_group_block_id: string | null
          pms_group_id: string | null
          priced_at: string | null
          purpose_of_stay: string | null
          rate_notes: string | null
          rate_plan_id: string | null
          refundability_snapshot: Json | null
          reservation_mode: string
          restaurant_id: string
          room_id: string | null
          room_subtotal: number | null
          room_type_id: string
          rooms_requested: number
          source: string
          special_occasion: string | null
          special_request_category: string | null
          special_requests: string | null
          status: string
          travel_agent_contact_id: string | null
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
          _reservation_room_id?: string
          _restaurant_id: string
          _room_id: string
        }
        Returns: {
          adults: number
          arrival_date: string
          arrival_transport: string | null
          billing_rule_id: string | null
          booker_guest_id: string | null
          cancellation_policy_snapshot: Json | null
          cancellation_reason: string | null
          children: number
          commercial_booking_source: string | null
          commercial_sales_channel: string | null
          company_contact_id: string | null
          company_master_id: string | null
          company_name: string | null
          confirmation_number: string
          created_at: string
          created_by_staff_membership_id: string | null
          currency: string | null
          departure_date: string
          deposit_policy_id: string | null
          deposit_requirement_snapshot: Json | null
          early_departure_policy_id: string | null
          early_departure_policy_snapshot: Json | null
          expected_arrival_at: string | null
          external_reference: string | null
          group_account_master_id: string | null
          group_name: string | null
          guarantee_method: string | null
          guest_id: string
          id: string
          infants: number
          late_checkout_granted: boolean
          late_checkout_note: string | null
          late_checkout_until: string | null
          market_segment: string | null
          nightly_rate_snapshot: Json | null
          no_show_policy_id: string | null
          no_show_policy_snapshot: Json | null
          notes: string | null
          notes_pinned: boolean
          pickup_note: string | null
          pms_group_block_id: string | null
          pms_group_id: string | null
          priced_at: string | null
          purpose_of_stay: string | null
          rate_notes: string | null
          rate_plan_id: string | null
          refundability_snapshot: Json | null
          reservation_mode: string
          restaurant_id: string
          room_id: string | null
          room_subtotal: number | null
          room_type_id: string
          rooms_requested: number
          source: string
          special_occasion: string | null
          special_request_category: string | null
          special_requests: string | null
          status: string
          travel_agent_contact_id: string | null
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
          _reservation_room_id?: string
          _restaurant_id: string
        }
        Returns: {
          adults: number
          arrival_date: string
          arrival_transport: string | null
          billing_rule_id: string | null
          booker_guest_id: string | null
          cancellation_policy_snapshot: Json | null
          cancellation_reason: string | null
          children: number
          commercial_booking_source: string | null
          commercial_sales_channel: string | null
          company_contact_id: string | null
          company_master_id: string | null
          company_name: string | null
          confirmation_number: string
          created_at: string
          created_by_staff_membership_id: string | null
          currency: string | null
          departure_date: string
          deposit_policy_id: string | null
          deposit_requirement_snapshot: Json | null
          early_departure_policy_id: string | null
          early_departure_policy_snapshot: Json | null
          expected_arrival_at: string | null
          external_reference: string | null
          group_account_master_id: string | null
          group_name: string | null
          guarantee_method: string | null
          guest_id: string
          id: string
          infants: number
          late_checkout_granted: boolean
          late_checkout_note: string | null
          late_checkout_until: string | null
          market_segment: string | null
          nightly_rate_snapshot: Json | null
          no_show_policy_id: string | null
          no_show_policy_snapshot: Json | null
          notes: string | null
          notes_pinned: boolean
          pickup_note: string | null
          pms_group_block_id: string | null
          pms_group_id: string | null
          priced_at: string | null
          purpose_of_stay: string | null
          rate_notes: string | null
          rate_plan_id: string | null
          refundability_snapshot: Json | null
          reservation_mode: string
          restaurant_id: string
          room_id: string | null
          room_subtotal: number | null
          room_type_id: string
          rooms_requested: number
          source: string
          special_occasion: string | null
          special_request_category: string | null
          special_requests: string | null
          status: string
          travel_agent_contact_id: string | null
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
      claim_fiscal_registrations: {
        Args: { _limit: number }
        Returns: {
          acknowledged_at: string | null
          acknowledged_at_raw: string | null
          attempt_count: number
          cancelled_at: string | null
          client_snapshot: string | null
          created_at: string
          created_by_membership_id: string | null
          device_id_snapshot: string | null
          external_document_number: string | null
          external_id: string | null
          external_irn: string | null
          external_rrn: string | null
          external_status: string | null
          fiscal_document_type: string
          id: string
          integration_id: string
          last_error_code: string | null
          last_error_message: string | null
          next_attempt_at: string | null
          registered_at: string | null
          related_registration_id: string | null
          request_hash: string | null
          request_snapshot: Json
          response_snapshot: Json | null
          restaurant_id: string
          signed_document: string | null
          signed_qr: string | null
          source_id: string
          source_type: string
          status: string
          taxpayer_tin_snapshot: string | null
          trnx_id: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "fiscal_registrations"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_fiscal_token_refresh: {
        Args: { _integration_id: string; _restaurant_id: string }
        Returns: Json
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
          settlement_exception: string | null
          settlement_exception_amount: number | null
          settlement_exception_at: string | null
          settlement_exception_kind: string | null
          settlement_exception_reason: string | null
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
      close_hotel_cashier_shift: {
        Args: {
          _closing_count: number
          _membership_id: string
          _notes: string
          _restaurant_id: string
          _shift_id: string
        }
        Returns: Json
      }
      commercial_effective_scope: {
        Args: { _activation_ids: string[]; _master_ids: string[] }
        Returns: string[]
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
      complete_hotel_reservation_no_show: {
        Args: {
          _additional_notes?: string
          _membership_id: string
          _reason: string
          _reservation_id: string
          _reservation_room_id?: string
          _restaurant_id: string
        }
        Returns: Json
      }
      component_is_billed: {
        Args: { _component_id: string; _restaurant_id: string }
        Returns: boolean
      }
      compute_folio_tax_component_amount: {
        Args: {
          _base: number
          _calculation: string
          _charge_type: string
          _rate: number
        }
        Returns: number
      }
      correct_failed_company_sales_receipt_allocation: {
        Args: {
          _allocation_id: string
          _amount: number
          _idempotency_key: string
          _membership_id: string
          _provider_unregistered_confirmed?: boolean
          _restaurant_id: string
        }
        Returns: Json
      }
      correct_failed_guest_sales_receipt_allocation: {
        Args: {
          _allocation_id: string
          _amount: number
          _idempotency_key: string
          _membership_id: string
          _provider_unregistered_confirmed?: boolean
          _restaurant_id: string
        }
        Returns: Json
      }
      correctable_charge_remainder: {
        Args: { _charge_id: string; _restaurant_id: string }
        Returns: number
      }
      count_eligible_revenue_approvers: {
        Args: { _restaurant_id: string }
        Returns: number
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
          arrival_transport: string | null
          billing_rule_id: string | null
          booker_guest_id: string | null
          cancellation_policy_snapshot: Json | null
          cancellation_reason: string | null
          children: number
          commercial_booking_source: string | null
          commercial_sales_channel: string | null
          company_contact_id: string | null
          company_master_id: string | null
          company_name: string | null
          confirmation_number: string
          created_at: string
          created_by_staff_membership_id: string | null
          currency: string | null
          departure_date: string
          deposit_policy_id: string | null
          deposit_requirement_snapshot: Json | null
          early_departure_policy_id: string | null
          early_departure_policy_snapshot: Json | null
          expected_arrival_at: string | null
          external_reference: string | null
          group_account_master_id: string | null
          group_name: string | null
          guarantee_method: string | null
          guest_id: string
          id: string
          infants: number
          late_checkout_granted: boolean
          late_checkout_note: string | null
          late_checkout_until: string | null
          market_segment: string | null
          nightly_rate_snapshot: Json | null
          no_show_policy_id: string | null
          no_show_policy_snapshot: Json | null
          notes: string | null
          notes_pinned: boolean
          pickup_note: string | null
          pms_group_block_id: string | null
          pms_group_id: string | null
          priced_at: string | null
          purpose_of_stay: string | null
          rate_notes: string | null
          rate_plan_id: string | null
          refundability_snapshot: Json | null
          reservation_mode: string
          restaurant_id: string
          room_id: string | null
          room_subtotal: number | null
          room_type_id: string
          rooms_requested: number
          source: string
          special_occasion: string | null
          special_request_category: string | null
          special_requests: string | null
          status: string
          travel_agent_contact_id: string | null
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
      create_external_reservation_mapping: {
        Args: {
          _channel: string
          _cm_booking_id?: string
          _external_booking_id: string
          _hotel_code: string
          _provider: string
          _reservation_id: string
          _restaurant_id: string
        }
        Returns: {
          channel: string
          cm_booking_id: string | null
          created_at: string
          external_booking_id: string
          hotel_code: string
          id: string
          provider: string
          reservation_id: string
          restaurant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "pms_external_reservation_mappings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_financial_account_invoice_draft: {
        Args: {
          _account_id: string
          _membership_id: string
          _notes: string
          _restaurant_id: string
        }
        Returns: {
          created_at: string
          created_by_membership_id: string
          financial_account_id: string
          id: string
          notes: string | null
          restaurant_id: string
          updated_at: string
          updated_by_membership_id: string
        }
        SetofOptions: {
          from: "*"
          to: "financial_account_invoice_drafts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_guest_folio_invoice_draft: {
        Args: {
          _folio_id: string
          _membership_id: string
          _notes: string
          _restaurant_id: string
        }
        Returns: {
          created_at: string
          created_by_membership_id: string
          folio_id: string
          id: string
          notes: string | null
          restaurant_id: string
          updated_at: string
          updated_by_membership_id: string
        }
        SetofOptions: {
          from: "*"
          to: "guest_folio_invoice_drafts"
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
          arrival_transport: string | null
          billing_rule_id: string | null
          booker_guest_id: string | null
          cancellation_policy_snapshot: Json | null
          cancellation_reason: string | null
          children: number
          commercial_booking_source: string | null
          commercial_sales_channel: string | null
          company_contact_id: string | null
          company_master_id: string | null
          company_name: string | null
          confirmation_number: string
          created_at: string
          created_by_staff_membership_id: string | null
          currency: string | null
          departure_date: string
          deposit_policy_id: string | null
          deposit_requirement_snapshot: Json | null
          early_departure_policy_id: string | null
          early_departure_policy_snapshot: Json | null
          expected_arrival_at: string | null
          external_reference: string | null
          group_account_master_id: string | null
          group_name: string | null
          guarantee_method: string | null
          guest_id: string
          id: string
          infants: number
          late_checkout_granted: boolean
          late_checkout_note: string | null
          late_checkout_until: string | null
          market_segment: string | null
          nightly_rate_snapshot: Json | null
          no_show_policy_id: string | null
          no_show_policy_snapshot: Json | null
          notes: string | null
          notes_pinned: boolean
          pickup_note: string | null
          pms_group_block_id: string | null
          pms_group_id: string | null
          priced_at: string | null
          purpose_of_stay: string | null
          rate_notes: string | null
          rate_plan_id: string | null
          refundability_snapshot: Json | null
          reservation_mode: string
          restaurant_id: string
          room_id: string | null
          room_subtotal: number | null
          room_type_id: string
          rooms_requested: number
          source: string
          special_occasion: string | null
          special_request_category: string | null
          special_requests: string | null
          status: string
          travel_agent_contact_id: string | null
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
      create_hotel_reservation_overbooking: {
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
          _infants?: number
          _market_segment?: string
          _membership_id: string
          _notes: string
          _overbooking_reason: string
          _package_activation_ids?: string[]
          _promotion_activation_id?: string
          _quote_currency?: string
          _rate_plan_id: string
          _reservation_mode?: string
          _restaurant_id: string
          _room_guest_assignments?: Json
          _room_id: string
          _room_type_id: string
          _room_units?: Json
          _rooms?: number
          _special_requests: string
          _status: string
          _travel_agent_master_id?: string
        }
        Returns: {
          adults: number
          arrival_date: string
          arrival_transport: string | null
          billing_rule_id: string | null
          booker_guest_id: string | null
          cancellation_policy_snapshot: Json | null
          cancellation_reason: string | null
          children: number
          commercial_booking_source: string | null
          commercial_sales_channel: string | null
          company_contact_id: string | null
          company_master_id: string | null
          company_name: string | null
          confirmation_number: string
          created_at: string
          created_by_staff_membership_id: string | null
          currency: string | null
          departure_date: string
          deposit_policy_id: string | null
          deposit_requirement_snapshot: Json | null
          early_departure_policy_id: string | null
          early_departure_policy_snapshot: Json | null
          expected_arrival_at: string | null
          external_reference: string | null
          group_account_master_id: string | null
          group_name: string | null
          guarantee_method: string | null
          guest_id: string
          id: string
          infants: number
          late_checkout_granted: boolean
          late_checkout_note: string | null
          late_checkout_until: string | null
          market_segment: string | null
          nightly_rate_snapshot: Json | null
          no_show_policy_id: string | null
          no_show_policy_snapshot: Json | null
          notes: string | null
          notes_pinned: boolean
          pickup_note: string | null
          pms_group_block_id: string | null
          pms_group_id: string | null
          priced_at: string | null
          purpose_of_stay: string | null
          rate_notes: string | null
          rate_plan_id: string | null
          refundability_snapshot: Json | null
          reservation_mode: string
          restaurant_id: string
          room_id: string | null
          room_subtotal: number | null
          room_type_id: string
          rooms_requested: number
          source: string
          special_occasion: string | null
          special_request_category: string | null
          special_requests: string | null
          status: string
          travel_agent_contact_id: string | null
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
          _infants?: number
          _market_segment?: string
          _membership_id: string
          _notes: string
          _quote_currency?: string
          _rate_plan_id: string
          _reservation_mode?: string
          _restaurant_id: string
          _room_guest_assignments?: Json
          _room_id: string
          _room_type_id: string
          _room_units?: Json
          _rooms?: number
          _special_requests: string
          _status: string
          _travel_agent_master_id?: string
        }
        Returns: {
          adults: number
          arrival_date: string
          arrival_transport: string | null
          billing_rule_id: string | null
          booker_guest_id: string | null
          cancellation_policy_snapshot: Json | null
          cancellation_reason: string | null
          children: number
          commercial_booking_source: string | null
          commercial_sales_channel: string | null
          company_contact_id: string | null
          company_master_id: string | null
          company_name: string | null
          confirmation_number: string
          created_at: string
          created_by_staff_membership_id: string | null
          currency: string | null
          departure_date: string
          deposit_policy_id: string | null
          deposit_requirement_snapshot: Json | null
          early_departure_policy_id: string | null
          early_departure_policy_snapshot: Json | null
          expected_arrival_at: string | null
          external_reference: string | null
          group_account_master_id: string | null
          group_name: string | null
          guarantee_method: string | null
          guest_id: string
          id: string
          infants: number
          late_checkout_granted: boolean
          late_checkout_note: string | null
          late_checkout_until: string | null
          market_segment: string | null
          nightly_rate_snapshot: Json | null
          no_show_policy_id: string | null
          no_show_policy_snapshot: Json | null
          notes: string | null
          notes_pinned: boolean
          pickup_note: string | null
          pms_group_block_id: string | null
          pms_group_id: string | null
          priced_at: string | null
          purpose_of_stay: string | null
          rate_notes: string | null
          rate_plan_id: string | null
          refundability_snapshot: Json | null
          reservation_mode: string
          restaurant_id: string
          room_id: string | null
          room_subtotal: number | null
          room_type_id: string
          rooms_requested: number
          source: string
          special_occasion: string | null
          special_request_category: string | null
          special_requests: string | null
          status: string
          travel_agent_contact_id: string | null
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
      create_hotel_reservation_priced_commercial: {
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
          _infants?: number
          _market_segment?: string
          _membership_id: string
          _notes: string
          _package_activation_ids?: string[]
          _promotion_activation_id?: string
          _quote_currency?: string
          _rate_plan_id: string
          _reservation_mode?: string
          _restaurant_id: string
          _room_guest_assignments?: Json
          _room_id: string
          _room_type_id: string
          _room_units?: Json
          _rooms?: number
          _special_requests: string
          _status: string
          _travel_agent_master_id?: string
        }
        Returns: {
          adults: number
          arrival_date: string
          arrival_transport: string | null
          billing_rule_id: string | null
          booker_guest_id: string | null
          cancellation_policy_snapshot: Json | null
          cancellation_reason: string | null
          children: number
          commercial_booking_source: string | null
          commercial_sales_channel: string | null
          company_contact_id: string | null
          company_master_id: string | null
          company_name: string | null
          confirmation_number: string
          created_at: string
          created_by_staff_membership_id: string | null
          currency: string | null
          departure_date: string
          deposit_policy_id: string | null
          deposit_requirement_snapshot: Json | null
          early_departure_policy_id: string | null
          early_departure_policy_snapshot: Json | null
          expected_arrival_at: string | null
          external_reference: string | null
          group_account_master_id: string | null
          group_name: string | null
          guarantee_method: string | null
          guest_id: string
          id: string
          infants: number
          late_checkout_granted: boolean
          late_checkout_note: string | null
          late_checkout_until: string | null
          market_segment: string | null
          nightly_rate_snapshot: Json | null
          no_show_policy_id: string | null
          no_show_policy_snapshot: Json | null
          notes: string | null
          notes_pinned: boolean
          pickup_note: string | null
          pms_group_block_id: string | null
          pms_group_id: string | null
          priced_at: string | null
          purpose_of_stay: string | null
          rate_notes: string | null
          rate_plan_id: string | null
          refundability_snapshot: Json | null
          reservation_mode: string
          restaurant_id: string
          room_id: string | null
          room_subtotal: number | null
          room_type_id: string
          rooms_requested: number
          source: string
          special_occasion: string | null
          special_request_category: string | null
          special_requests: string | null
          status: string
          travel_agent_contact_id: string | null
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
      create_invoice_credit_note_draft: {
        Args: {
          _account_invoice_id: string
          _guest_invoice_id: string
          _membership_id: string
          _reason: string
          _restaurant_id: string
        }
        Returns: {
          account_invoice_id: string | null
          created_at: string
          created_by_membership_id: string
          guest_invoice_id: string | null
          id: string
          note_type: string
          reason: string
          restaurant_id: string
          updated_at: string
          updated_by_membership_id: string
        }
        SetofOptions: {
          from: "*"
          to: "invoice_credit_note_drafts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_invoice_debit_note_draft: {
        Args: {
          _account_invoice_id: string
          _guest_invoice_id: string
          _membership_id: string
          _reason: string
          _restaurant_id: string
        }
        Returns: {
          account_invoice_id: string | null
          created_at: string
          created_by_membership_id: string
          guest_invoice_id: string | null
          id: string
          note_type: string
          reason: string
          restaurant_id: string
          updated_at: string
          updated_by_membership_id: string
        }
        SetofOptions: {
          from: "*"
          to: "invoice_credit_note_drafts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      delete_financial_account_invoice_draft: {
        Args: {
          _draft_id: string
          _membership_id: string
          _restaurant_id: string
        }
        Returns: undefined
      }
      delete_guest_folio_invoice_draft: {
        Args: {
          _draft_id: string
          _membership_id: string
          _restaurant_id: string
        }
        Returns: undefined
      }
      delete_invoice_credit_note_draft: {
        Args: {
          _draft_id: string
          _membership_id: string
          _restaurant_id: string
        }
        Returns: undefined
      }
      delete_invoice_debit_note_draft: {
        Args: {
          _draft_id: string
          _membership_id: string
          _restaurant_id: string
        }
        Returns: undefined
      }
      ensure_primary_folio_window: {
        Args: { _folio_id: string; _restaurant_id: string }
        Returns: string
      }
      financial_account_balance: {
        Args: { _account_id: string; _restaurant_id: string }
        Returns: number
      }
      fiscal_read_api_credentials: {
        Args: { _integration_id: string }
        Returns: string
      }
      fiscal_store_api_credentials: {
        Args: {
          _api_password: string
          _api_username: string
          _integration_id: string
          _restaurant_id: string
        }
        Returns: undefined
      }
      folio_balance: { Args: { _folio_id: string }; Returns: number }
      folio_service_scope_matches: {
        Args: {
          _charge_source: string
          _department_id: string
          _restaurant_id: string
          _scope: string
          _service_charge_id: string
        }
        Returns: boolean
      }
      folio_tax_scope_matches: {
        Args: {
          _charge_source: string
          _department_id: string
          _restaurant_id: string
          _scope: string
          _tax_id: string
        }
        Returns: boolean
      }
      format_issued_invoice_number: {
        Args: { _padding: number; _prefix: string; _sequence: number }
        Returns: string
      }
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
      group_is_billed: {
        Args: { _group_id: string; _restaurant_id: string }
        Returns: boolean
      }
      guest_folio_has_legacy_invoice: {
        Args: { _folio_id: string; _restaurant_id: string }
        Returns: boolean
      }
      guest_invoice_deposit_cover: {
        Args: { _invoice_id: string; _restaurant_id: string }
        Returns: number
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
      hotel_drawer_figures: {
        Args: { _restaurant_id: string; _shift_id: string }
        Returns: Json
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
      invoice_credit_component_rows: {
        Args: {
          _account_invoice_id: string
          _guest_invoice_id: string
          _restaurant_id: string
        }
        Returns: {
          billed_via: string
          component_kind: string
          component_transaction_id: string
          credited_amount: number
          description: string
          original_amount: number
          snapshot: Json
          source_group_id: string
        }[]
      }
      is_platform_admin: { Args: never; Returns: boolean }
      is_restaurant_member: {
        Args: { _restaurant_id: string }
        Returns: boolean
      }
      issue_financial_account_invoice_draft: {
        Args: {
          _draft_id: string
          _idempotency_key?: string
          _membership_id: string
          _restaurant_id: string
        }
        Returns: {
          financial_account_id: string
          id: string
          idempotency_key: string | null
          issued_at: string
          issued_by_membership_id: string
          issued_number: string
          last_reprinted_at: string | null
          reprint_count: number
          restaurant_id: string
          sequence_number: number
          snapshot: Json
        }
        SetofOptions: {
          from: "*"
          to: "financial_account_invoices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      issue_guest_folio_invoice: {
        Args: {
          _folio_id: string
          _idempotency_key?: string
          _membership_id: string
          _restaurant_id: string
        }
        Returns: {
          coverage_scope: string
          folio_id: string
          id: string
          idempotency_key: string | null
          issued_at: string
          issued_by_membership_id: string
          issued_number: string
          last_reprinted_at: string | null
          reprint_count: number
          restaurant_id: string
          sequence_number: number
          snapshot: Json
        }
        SetofOptions: {
          from: "*"
          to: "guest_folio_invoices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      issue_guest_folio_invoice_draft: {
        Args: {
          _draft_id: string
          _idempotency_key?: string
          _membership_id: string
          _restaurant_id: string
        }
        Returns: {
          coverage_scope: string
          folio_id: string
          id: string
          idempotency_key: string | null
          issued_at: string
          issued_by_membership_id: string
          issued_number: string
          last_reprinted_at: string | null
          reprint_count: number
          restaurant_id: string
          sequence_number: number
          snapshot: Json
        }
        SetofOptions: {
          from: "*"
          to: "guest_folio_invoices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      issue_invoice_credit_note_draft: {
        Args: {
          _draft_id: string
          _idempotency_key?: string
          _membership_id: string
          _restaurant_id: string
        }
        Returns: {
          account_invoice_id: string | null
          created_at: string
          currency: string
          financial_account_id: string | null
          folio_id: string | null
          guest_invoice_id: string | null
          id: string
          idempotency_key: string | null
          issued_at: string
          issued_by_membership_id: string
          last_reprinted_at: string | null
          note_number: string
          note_type: string
          reason: string
          reprint_count: number
          restaurant_id: string
          sequence_number: number
          service_charge_delta: number
          snapshot: Json
          subtotal_delta: number
          tax_delta: number
          total_delta: number
        }
        SetofOptions: {
          from: "*"
          to: "invoice_credit_notes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      issue_invoice_debit_note_draft: {
        Args: {
          _draft_id: string
          _idempotency_key?: string
          _membership_id: string
          _restaurant_id: string
        }
        Returns: {
          account_invoice_id: string | null
          created_at: string
          currency: string
          financial_account_id: string | null
          folio_id: string | null
          guest_invoice_id: string | null
          id: string
          idempotency_key: string | null
          issued_at: string
          issued_by_membership_id: string
          last_reprinted_at: string | null
          note_number: string
          note_type: string
          reason: string
          reprint_count: number
          restaurant_id: string
          sequence_number: number
          service_charge_delta: number
          snapshot: Json
          subtotal_delta: number
          tax_delta: number
          total_delta: number
        }
        SetofOptions: {
          from: "*"
          to: "invoice_credit_notes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      list_chargeable_guest_services: {
        Args: { _folio_id: string; _restaurant_id: string }
        Returns: Json
      }
      list_financial_account_invoice_groups: {
        Args: { _account_id: string; _restaurant_id: string }
        Returns: Json
      }
      list_guest_folio_invoice_groups: {
        Args: { _folio_id: string; _restaurant_id: string }
        Returns: Json
      }
      list_hotel_drawers: { Args: { _restaurant_id: string }; Returns: Json }
      list_invoice_credit_board: {
        Args: {
          _account_invoice_id: string
          _guest_invoice_id: string
          _restaurant_id: string
        }
        Returns: Json
      }
      list_invoice_debit_board: {
        Args: {
          _account_invoice_id: string
          _guest_invoice_id: string
          _restaurant_id: string
        }
        Returns: Json
      }
      manage_reservation_room_guest: {
        Args: {
          _action: string
          _guest_id: string
          _membership_id: string
          _reservation_id: string
          _reservation_room_id: string
          _restaurant_id: string
        }
        Returns: undefined
      }
      mark_hotel_reservation_no_show: {
        Args: {
          _business_date: string
          _membership_id: string
          _reservation_id: string
          _reservation_room_id?: string
          _restaurant_id: string
        }
        Returns: {
          adults: number
          arrival_date: string
          arrival_transport: string | null
          billing_rule_id: string | null
          booker_guest_id: string | null
          cancellation_policy_snapshot: Json | null
          cancellation_reason: string | null
          children: number
          commercial_booking_source: string | null
          commercial_sales_channel: string | null
          company_contact_id: string | null
          company_master_id: string | null
          company_name: string | null
          confirmation_number: string
          created_at: string
          created_by_staff_membership_id: string | null
          currency: string | null
          departure_date: string
          deposit_policy_id: string | null
          deposit_requirement_snapshot: Json | null
          early_departure_policy_id: string | null
          early_departure_policy_snapshot: Json | null
          expected_arrival_at: string | null
          external_reference: string | null
          group_account_master_id: string | null
          group_name: string | null
          guarantee_method: string | null
          guest_id: string
          id: string
          infants: number
          late_checkout_granted: boolean
          late_checkout_note: string | null
          late_checkout_until: string | null
          market_segment: string | null
          nightly_rate_snapshot: Json | null
          no_show_policy_id: string | null
          no_show_policy_snapshot: Json | null
          notes: string | null
          notes_pinned: boolean
          pickup_note: string | null
          pms_group_block_id: string | null
          pms_group_id: string | null
          priced_at: string | null
          purpose_of_stay: string | null
          rate_notes: string | null
          rate_plan_id: string | null
          refundability_snapshot: Json | null
          reservation_mode: string
          restaurant_id: string
          room_id: string | null
          room_subtotal: number | null
          room_type_id: string
          rooms_requested: number
          source: string
          special_occasion: string | null
          special_request_category: string | null
          special_requests: string | null
          status: string
          travel_agent_contact_id: string | null
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
          _reservation_room_id?: string
          _restaurant_id: string
          _room_id: string
        }
        Returns: {
          adults: number
          arrival_date: string
          arrival_transport: string | null
          billing_rule_id: string | null
          booker_guest_id: string | null
          cancellation_policy_snapshot: Json | null
          cancellation_reason: string | null
          children: number
          commercial_booking_source: string | null
          commercial_sales_channel: string | null
          company_contact_id: string | null
          company_master_id: string | null
          company_name: string | null
          confirmation_number: string
          created_at: string
          created_by_staff_membership_id: string | null
          currency: string | null
          departure_date: string
          deposit_policy_id: string | null
          deposit_requirement_snapshot: Json | null
          early_departure_policy_id: string | null
          early_departure_policy_snapshot: Json | null
          expected_arrival_at: string | null
          external_reference: string | null
          group_account_master_id: string | null
          group_name: string | null
          guarantee_method: string | null
          guest_id: string
          id: string
          infants: number
          late_checkout_granted: boolean
          late_checkout_note: string | null
          late_checkout_until: string | null
          market_segment: string | null
          nightly_rate_snapshot: Json | null
          no_show_policy_id: string | null
          no_show_policy_snapshot: Json | null
          notes: string | null
          notes_pinned: boolean
          pickup_note: string | null
          pms_group_block_id: string | null
          pms_group_id: string | null
          priced_at: string | null
          purpose_of_stay: string | null
          rate_notes: string | null
          rate_plan_id: string | null
          refundability_snapshot: Json | null
          reservation_mode: string
          restaurant_id: string
          room_id: string | null
          room_subtotal: number | null
          room_type_id: string
          rooms_requested: number
          source: string
          special_occasion: string | null
          special_request_category: string | null
          special_requests: string | null
          status: string
          travel_agent_contact_id: string | null
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
      normalize_guest_tin: { Args: { _tin: string }; Returns: string }
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
      open_financial_account: {
        Args: {
          _account_kind: string
          _currency: string
          _master_id: string
          _membership_id: string
          _restaurant_id: string
        }
        Returns: {
          account_kind: string
          account_number: string
          closed_at: string | null
          created_at: string
          created_by_membership_id: string | null
          currency: string
          id: string
          master_id: string
          opened_at: string
          restaurant_id: string
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "financial_accounts"
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
          settlement_exception: string | null
          settlement_exception_amount: number | null
          settlement_exception_at: string | null
          settlement_exception_kind: string | null
          settlement_exception_reason: string | null
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
      open_hotel_cashier_shift: {
        Args: {
          _membership_id: string
          _notes: string
          _opening_cash: number
          _restaurant_id: string
        }
        Returns: Json
      }
      plan_invoice_credit: {
        Args: {
          _account_invoice_id: string
          _guest_invoice_id: string
          _items: Json
          _restaurant_id: string
        }
        Returns: Json
      }
      plan_invoice_debit: {
        Args: {
          _account_invoice_id: string
          _guest_invoice_id: string
          _restaurant_id: string
          _source_ids: string[]
        }
        Returns: Json
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
      pms_enforce_explicit_overbooking: {
        Args: {
          _membership_id: string
          _reason: string
          _reservation_id: string
          _restaurant_id: string
        }
        Returns: undefined
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
      pms_lock_overbooking_scope: {
        Args: {
          _arrival: string
          _departure: string
          _restaurant_id: string
          _room_type_ids: string[]
        }
        Returns: undefined
      }
      pms_prepare_explicit_overbooking: {
        Args: {
          _arrival: string
          _departure: string
          _membership_id: string
          _reason: string
          _restaurant_id: string
          _room_type_ids: string[]
        }
        Returns: undefined
      }
      pms_property_overbooking_board: {
        Args: { _end: string; _restaurant_id: string; _start: string }
        Returns: Json
      }
      pms_property_overbooking_night: {
        Args: {
          _exclude_reservation_id?: string
          _night: string
          _restaurant_id: string
        }
        Returns: Json
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
      pms_room_type_night_position: {
        Args: {
          _exclude_reservation_id?: string
          _night: string
          _restaurant_id: string
        }
        Returns: {
          configuration_invalid: boolean
          demand: number
          maximum_overbooking: number
          overbooking_enabled: boolean
          percentage_limit: number
          physical_available: number
          physical_capacity: number
          room_type_id: string
          room_type_name: string
          shortage: number
        }[]
      }
      pms_room_type_overbooking_allowance: {
        Args: {
          _maximum: number
          _percentage: number
          _physical_capacity: number
          _property_allowed: boolean
          _type_enabled: boolean
        }
        Returns: number
      }
      pms_room_type_overbooking_effective_limits: {
        Args: {
          _night: string
          _physical_capacity: number
          _restaurant_id: string
          _room_type_id: string
        }
        Returns: {
          enabled: boolean
          maximum_overbooking: number
          percentage_limit: number
        }[]
      }
      pms_room_unit_claims_room: {
        Args: {
          _exclude_reservation_id: string
          _night: string
          _restaurant_id: string
          _room_id: string
        }
        Returns: boolean
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
      pms_stay_overlaps_room: {
        Args: {
          _arrival: string
          _departure: string
          _exclude_reservation_id: string
          _restaurant_id: string
          _room_id: string
        }
        Returns: boolean
      }
      pms_unassigned_room_demand: {
        Args: {
          _exclude_reservation_id: string
          _night: string
          _pool_room_ids: string[]
          _restaurant_id: string
          _room_type_id: string
        }
        Returns: number
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
      post_channel_reservation_folio: {
        Args: { _reservation_id: string; _restaurant_id: string }
        Returns: undefined
      }
      post_cross_ledger_transfer: {
        Args: {
          _amount: number
          _description: string
          _destination_id: string
          _destination_type: string
          _idempotency_key: string
          _membership_id: string
          _restaurant_id: string
          _source_id: string
          _source_transaction_id: string
          _source_type: string
        }
        Returns: Json
      }
      post_financial_account_transaction: {
        Args: {
          _account_id: string
          _amount: number
          _category: string
          _description: string
          _idempotency_key?: string
          _membership_id: string
          _original_transaction_id?: string
          _payment_method?: string
          _restaurant_id: string
          _type: string
        }
        Returns: {
          amount: number
          category: string
          charge_snapshot: Json | null
          charge_source: string | null
          created_at: string
          department_id: string | null
          description: string
          financial_account_id: string | null
          folio_id: string | null
          folio_window_id: string | null
          hotel_cashier_shift_id: string | null
          id: string
          idempotency_key: string | null
          original_transaction_id: string | null
          payment_method: string | null
          posted_at: string
          posted_by_membership_id: string | null
          quantity: number | null
          reference_id: string | null
          reference_type: string | null
          reservation_room_id: string | null
          restaurant_id: string
          service_type_id: string | null
          tax_snapshot: Json | null
          transaction_type: string
          transfer_direction: string | null
          transfer_id: string | null
          unit_amount: number | null
        }
        SetofOptions: {
          from: "*"
          to: "folio_transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      post_folio_charge_correction: {
        Args: {
          _amount: number
          _description: string
          _idempotency_key: string
          _membership_id: string
          _mode: string
          _restaurant_id: string
          _source_transaction_id: string
        }
        Returns: Json
      }
      post_folio_charge_with_tax: {
        Args: {
          _amount: number
          _category: string
          _default_tax_group_id?: string
          _description: string
          _folio_id: string
          _folio_window_id?: string
          _idempotency_key?: string
          _membership_id: string
          _reference_id: string
          _reference_type: string
          _restaurant_id: string
          _tax_basis: string
        }
        Returns: {
          amount: number
          category: string
          charge_snapshot: Json | null
          charge_source: string | null
          created_at: string
          department_id: string | null
          description: string
          financial_account_id: string | null
          folio_id: string | null
          folio_window_id: string | null
          hotel_cashier_shift_id: string | null
          id: string
          idempotency_key: string | null
          original_transaction_id: string | null
          payment_method: string | null
          posted_at: string
          posted_by_membership_id: string | null
          quantity: number | null
          reference_id: string | null
          reference_type: string | null
          reservation_room_id: string | null
          restaurant_id: string
          service_type_id: string | null
          tax_snapshot: Json | null
          transaction_type: string
          transfer_direction: string | null
          transfer_id: string | null
          unit_amount: number | null
        }
        SetofOptions: {
          from: "*"
          to: "folio_transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      post_folio_service_charge: {
        Args: {
          _description: string
          _folio_id: string
          _idempotency_key: string
          _membership_id: string
          _quantity: number
          _restaurant_id: string
          _service_type_id: string
        }
        Returns: {
          amount: number
          category: string
          charge_snapshot: Json | null
          charge_source: string | null
          created_at: string
          department_id: string | null
          description: string
          financial_account_id: string | null
          folio_id: string | null
          folio_window_id: string | null
          hotel_cashier_shift_id: string | null
          id: string
          idempotency_key: string | null
          original_transaction_id: string | null
          payment_method: string | null
          posted_at: string
          posted_by_membership_id: string | null
          quantity: number | null
          reference_id: string | null
          reference_type: string | null
          reservation_room_id: string | null
          restaurant_id: string
          service_type_id: string | null
          tax_snapshot: Json | null
          transaction_type: string
          transfer_direction: string | null
          transfer_id: string | null
          unit_amount: number | null
        }
        SetofOptions: {
          from: "*"
          to: "folio_transactions"
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
          _idempotency_key?: string
          _membership_id: string
          _original_transaction_id?: string
          _payment_method?: string
          _reference_id: string
          _reference_type: string
          _restaurant_id: string
          _type: string
        }
        Returns: {
          amount: number
          category: string
          charge_snapshot: Json | null
          charge_source: string | null
          created_at: string
          department_id: string | null
          description: string
          financial_account_id: string | null
          folio_id: string | null
          folio_window_id: string | null
          hotel_cashier_shift_id: string | null
          id: string
          idempotency_key: string | null
          original_transaction_id: string | null
          payment_method: string | null
          posted_at: string
          posted_by_membership_id: string | null
          quantity: number | null
          reference_id: string | null
          reference_type: string | null
          reservation_room_id: string | null
          restaurant_id: string
          service_type_id: string | null
          tax_snapshot: Json | null
          transaction_type: string
          transfer_direction: string | null
          transfer_id: string | null
          unit_amount: number | null
        }
        SetofOptions: {
          from: "*"
          to: "folio_transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      post_folio_transfer: {
        Args: {
          _amount: number
          _description: string
          _idempotency_key: string
          _membership_id: string
          _restaurant_id: string
          _source_folio_id: string
          _source_transaction_id: string
          _target_folio_id: string
          _target_window_id: string
        }
        Returns: Json
      }
      post_hotel_drawer_movement: {
        Args: {
          _amount: number
          _idempotency_key: string
          _membership_id: string
          _movement_type: string
          _notes: string
          _restaurant_id: string
          _shift_id: string
        }
        Returns: Json
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
      post_reservation_package_charge: {
        Args: {
          _membership_id: string
          _package_row_id: string
          _restaurant_id: string
        }
        Returns: string
      }
      preview_financial_account_invoice_selection: {
        Args: {
          _account_id: string
          _restaurant_id: string
          _source_ids: string[]
        }
        Returns: Json
      }
      preview_financial_account_payment_allocation: {
        Args: {
          _account_id: string
          _payment_id: string
          _restaurant_id: string
          _targets: Json
        }
        Returns: Json
      }
      preview_folio_charge: {
        Args: { _amount: number; _folio_id: string; _restaurant_id: string }
        Returns: Json
      }
      preview_folio_charge_correction: {
        Args: {
          _amount: number
          _mode: string
          _restaurant_id: string
          _source_transaction_id: string
        }
        Returns: Json
      }
      preview_folio_charge_scoped: {
        Args: {
          _amount: number
          _charge_source: string
          _department_id: string
          _folio_id: string
          _restaurant_id: string
        }
        Returns: Json
      }
      preview_folio_service_charge: {
        Args: {
          _folio_id: string
          _quantity: number
          _restaurant_id: string
          _service_type_id: string
        }
        Returns: Json
      }
      preview_guest_deposit_invoice_allocation: {
        Args: {
          _deposit_id: string
          _folio_id: string
          _restaurant_id: string
          _targets: Json
        }
        Returns: Json
      }
      preview_guest_folio_invoice_selection: {
        Args: {
          _folio_id: string
          _restaurant_id: string
          _source_ids: string[]
        }
        Returns: Json
      }
      preview_guest_payment_invoice_allocation: {
        Args: {
          _folio_id: string
          _payment_id: string
          _restaurant_id: string
          _targets: Json
        }
        Returns: Json
      }
      preview_invoice_credit_note: {
        Args: {
          _account_invoice_id: string
          _guest_invoice_id: string
          _items: Json
          _restaurant_id: string
        }
        Returns: Json
      }
      preview_invoice_debit_note: {
        Args: {
          _account_invoice_id: string
          _guest_invoice_id: string
          _restaurant_id: string
          _source_ids: string[]
        }
        Returns: Json
      }
      price_hotel_stay: {
        Args: {
          _adults?: number
          _arrival: string
          _booking_date?: string
          _children?: number
          _departure: string
          _infants?: number
          _quote_currency?: string
          _rate_plan_id: string
          _restaurant_id: string
          _room_type_id: string
          _rooms?: number
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
      reconcile_reservation_unit_room_charge: {
        Args: {
          _membership_id: string
          _reservation_id: string
          _reservation_room_id: string
          _restaurant_id: string
        }
        Returns: undefined
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
      record_withholding_certificate: {
        Args: {
          _amount: number
          _certificate_date: string
          _idempotency_key: string
          _invoice_id: string
          _membership_id: string
          _pretax_base: number
          _reason: string
          _reference: string
          _restaurant_id: string
        }
        Returns: Json
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
      release_excess_account_invoice_allocation: {
        Args: {
          _idempotency_key: string
          _invoice_id: string
          _membership_id: string
          _note_number: string
          _projected_net: number
          _restaurant_id: string
        }
        Returns: number
      }
      release_excess_guest_deposit_invoice_allocation: {
        Args: {
          _idempotency_key: string
          _invoice_id: string
          _membership_id: string
          _note_number: string
          _projected_net: number
          _restaurant_id: string
        }
        Returns: number
      }
      release_excess_guest_invoice_allocation: {
        Args: {
          _idempotency_key: string
          _invoice_id: string
          _membership_id: string
          _note_number: string
          _projected_net: number
          _restaurant_id: string
        }
        Returns: number
      }
      release_hotel_reservation_room_package: {
        Args: {
          _membership_id: string
          _package_row_id: string
          _reservation_id: string
          _restaurant_id: string
          _selected_reservation_room_id?: string
          _stay_scope?: boolean
        }
        Returns: undefined
      }
      remove_hotel_reservation_promotion: {
        Args: {
          _membership_id: string
          _reservation_id: string
          _restaurant_id: string
        }
        Returns: undefined
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
          arrival_transport: string | null
          billing_rule_id: string | null
          booker_guest_id: string | null
          cancellation_policy_snapshot: Json | null
          cancellation_reason: string | null
          children: number
          commercial_booking_source: string | null
          commercial_sales_channel: string | null
          company_contact_id: string | null
          company_master_id: string | null
          company_name: string | null
          confirmation_number: string
          created_at: string
          created_by_staff_membership_id: string | null
          currency: string | null
          departure_date: string
          deposit_policy_id: string | null
          deposit_requirement_snapshot: Json | null
          early_departure_policy_id: string | null
          early_departure_policy_snapshot: Json | null
          expected_arrival_at: string | null
          external_reference: string | null
          group_account_master_id: string | null
          group_name: string | null
          guarantee_method: string | null
          guest_id: string
          id: string
          infants: number
          late_checkout_granted: boolean
          late_checkout_note: string | null
          late_checkout_until: string | null
          market_segment: string | null
          nightly_rate_snapshot: Json | null
          no_show_policy_id: string | null
          no_show_policy_snapshot: Json | null
          notes: string | null
          notes_pinned: boolean
          pickup_note: string | null
          pms_group_block_id: string | null
          pms_group_id: string | null
          priced_at: string | null
          purpose_of_stay: string | null
          rate_notes: string | null
          rate_plan_id: string | null
          refundability_snapshot: Json | null
          reservation_mode: string
          restaurant_id: string
          room_id: string | null
          room_subtotal: number | null
          room_type_id: string
          rooms_requested: number
          source: string
          special_occasion: string | null
          special_request_category: string | null
          special_requests: string | null
          status: string
          travel_agent_contact_id: string | null
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
      reprice_hotel_reservation_room: {
        Args: {
          _membership_id: string
          _rate_plan_id: string
          _reservation_id: string
          _reservation_room_id: string
          _restaurant_id: string
        }
        Returns: Json
      }
      reprint_financial_account_invoice: {
        Args: {
          _invoice_id: string
          _membership_id: string
          _restaurant_id: string
        }
        Returns: {
          financial_account_id: string
          id: string
          idempotency_key: string | null
          issued_at: string
          issued_by_membership_id: string
          issued_number: string
          last_reprinted_at: string | null
          reprint_count: number
          restaurant_id: string
          sequence_number: number
          snapshot: Json
        }
        SetofOptions: {
          from: "*"
          to: "financial_account_invoices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reprint_guest_folio_invoice: {
        Args: {
          _invoice_id: string
          _membership_id: string
          _restaurant_id: string
        }
        Returns: {
          coverage_scope: string
          folio_id: string
          id: string
          idempotency_key: string | null
          issued_at: string
          issued_by_membership_id: string
          issued_number: string
          last_reprinted_at: string | null
          reprint_count: number
          restaurant_id: string
          sequence_number: number
          snapshot: Json
        }
        SetofOptions: {
          from: "*"
          to: "guest_folio_invoices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reprint_invoice_credit_note: {
        Args: {
          _membership_id: string
          _note_id: string
          _restaurant_id: string
        }
        Returns: {
          account_invoice_id: string | null
          created_at: string
          currency: string
          financial_account_id: string | null
          folio_id: string | null
          guest_invoice_id: string | null
          id: string
          idempotency_key: string | null
          issued_at: string
          issued_by_membership_id: string
          last_reprinted_at: string | null
          note_number: string
          note_type: string
          reason: string
          reprint_count: number
          restaurant_id: string
          sequence_number: number
          service_charge_delta: number
          snapshot: Json
          subtotal_delta: number
          tax_delta: number
          total_delta: number
        }
        SetofOptions: {
          from: "*"
          to: "invoice_credit_notes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      require_revenue_approval_manager: {
        Args: { _membership_id: string; _restaurant_id: string }
        Returns: {
          active: boolean
          created_at: string
          hotel_role_id: string | null
          id: string
          restaurant_id: string
          role: string
          updated_at: string | null
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "restaurant_users"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      resolve_account_invoice_group: {
        Args: {
          _account_id: string
          _restaurant_id: string
          _source_group_id: string
        }
        Returns: Json
      }
      resolve_chargeable_guest_service: {
        Args: {
          _folio_currency: string
          _quantity: number
          _restaurant_id: string
          _service_type_id: string
        }
        Returns: Json
      }
      resolve_folio_service_charge_rows:
        | {
            Args: { _restaurant_id: string; _tax_basis: string }
            Returns: {
              amount: number
              basis: string
              charge_type: string
              code: string
              name: string
              service_id: string
            }[]
          }
        | {
            Args: {
              _charge_source: string
              _department_id: string
              _restaurant_id: string
              _tax_basis: string
            }
            Returns: {
              amount: number
              basis: string
              charge_type: string
              code: string
              name: string
              service_id: string
            }[]
          }
      resolve_folio_tax_rows:
        | {
            Args: {
              _default_tax_group_id?: string
              _restaurant_id: string
              _tax_basis: string
            }
            Returns: {
              amount: number
              basis: string
              calculation: string
              charge_type: string
              code: string
              name: string
              tax_id: string
            }[]
          }
        | {
            Args: {
              _charge_source: string
              _default_tax_group_id: string
              _department_id: string
              _restaurant_id: string
              _tax_basis: string
            }
            Returns: {
              amount: number
              basis: string
              calculation: string
              charge_type: string
              code: string
              name: string
              tax_id: string
            }[]
          }
      resolve_guest_invoice_charge_group: {
        Args: {
          _folio_id: string
          _restaurant_id: string
          _source_transaction_id: string
        }
        Returns: Json
      }
      resolve_reservation_room_unit: {
        Args: {
          _reservation_id: string
          _reservation_room_id: string
          _restaurant_id: string
        }
        Returns: {
          adults: number
          arrival_date: string
          assignment_notes: string | null
          children: number
          created_at: string
          currency: string | null
          departure_date: string
          id: string
          infants: number
          nightly_rate_snapshot: Json | null
          pms_group_block_id: string | null
          priced_at: string | null
          rate_plan_id: string | null
          reservation_id: string
          restaurant_id: string
          room_id: string | null
          room_subtotal: number | null
          room_type_id: string
          status: string
          unit_sequence: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "hotel_reservation_rooms"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reverse_financial_account_payment_allocation: {
        Args: {
          _allocation_id: string
          _idempotency_key: string
          _membership_id: string
          _reason: string
          _restaurant_id: string
        }
        Returns: Json
      }
      reverse_guest_payment_invoice_allocation: {
        Args: {
          _allocation_id: string
          _idempotency_key: string
          _membership_id: string
          _reason: string
          _restaurant_id: string
        }
        Returns: Json
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
      reverse_reservation_package_charge: {
        Args: {
          _membership_id: string
          _package_row_id: string
          _restaurant_id: string
        }
        Returns: undefined
      }
      reverse_withholding_certificate: {
        Args: {
          _certificate_id: string
          _idempotency_key: string
          _membership_id: string
          _reason: string
          _restaurant_id: string
        }
        Returns: Json
      }
      rollup_hotel_reservation_status: {
        Args: { _reservation_id: string; _restaurant_id: string }
        Returns: string
      }
      save_guest_tax_identity: {
        Args: {
          _city: string
          _email: string
          _guest_profile_id: string
          _identity_id: string
          _is_default: boolean
          _legal_name: string
          _membership_id: string
          _phone: string
          _region: string
          _registration_number: string
          _restaurant_id: string
          _tin: string
        }
        Returns: Json
      }
      search_all_accounts: {
        Args: {
          _booking_source?: string
          _currency?: string
          _folio_status?: string
          _limit?: number
          _market_segment?: string
          _offset?: number
          _payment_states?: string[]
          _rate_plan_id?: string
          _restaurant_id: string
          _room_type_id?: string
          _sales_channel?: string
          _search?: string
          _sort_by?: string
          _sort_dir?: string
          _stay_end?: string
          _stay_start?: string
          _stay_statuses?: string[]
          _unsettled_only?: boolean
        }
        Returns: Json
      }
      search_guest_folios: {
        Args: {
          _booking_source?: string
          _currency?: string
          _folio_status?: string
          _limit?: number
          _market_segment?: string
          _offset?: number
          _payment_states?: string[]
          _rate_plan_id?: string
          _restaurant_id: string
          _room_type_id?: string
          _sales_channel?: string
          _search?: string
          _sort_by?: string
          _sort_dir?: string
          _stay_end?: string
          _stay_start?: string
          _stay_statuses?: string[]
          _unsettled_only?: boolean
        }
        Returns: Json
      }
      set_default_guest_tax_identity: {
        Args: {
          _guest_profile_id: string
          _identity_id: string
          _restaurant_id: string
        }
        Returns: Json
      }
      set_guest_tax_identity_active: {
        Args: {
          _active: boolean
          _guest_profile_id: string
          _identity_id: string
          _restaurant_id: string
        }
        Returns: Json
      }
      submit_hotel_revenue_approval: {
        Args: {
          _action_type: string
          _display_snapshot: Json
          _domain: string
          _entity_id: string
          _entity_type: string
          _expected_version: string
          _membership_id: string
          _proposal_payload: Json
          _request_reason: string
          _restaurant_id: string
        }
        Returns: Json
      }
      sync_hotel_reservation_packages: {
        Args: {
          _mode: string
          _package_activation_ids: string[]
          _reservation_id: string
          _restaurant_id: string
        }
        Returns: undefined
      }
      sync_hotel_reservation_promotion: {
        Args: {
          _mode: string
          _promotion_activation_id: string
          _reservation_id: string
          _restaurant_id: string
        }
        Returns: undefined
      }
      sync_reservation_room_total: {
        Args: { _reservation_id: string; _restaurant_id: string }
        Returns: undefined
      }
      transferable_charge_group_remainder: {
        Args: { _parent_transaction_id: string; _restaurant_id: string }
        Returns: Json
      }
      transferable_charge_remainder: {
        Args: { _charge_id: string; _restaurant_id: string }
        Returns: number
      }
      transition_hotel_revenue_approval: {
        Args: {
          _event_type: string
          _membership_id: string
          _reason: string
          _request_id: string
          _restaurant_id: string
        }
        Returns: Json
      }
      update_financial_account_invoice_draft: {
        Args: {
          _draft_id: string
          _membership_id: string
          _notes: string
          _restaurant_id: string
          _source_ids: string[]
        }
        Returns: {
          created_at: string
          created_by_membership_id: string
          financial_account_id: string
          id: string
          notes: string | null
          restaurant_id: string
          updated_at: string
          updated_by_membership_id: string
        }
        SetofOptions: {
          from: "*"
          to: "financial_account_invoice_drafts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_guest_folio_invoice_draft: {
        Args: {
          _draft_id: string
          _membership_id: string
          _notes: string
          _restaurant_id: string
          _source_ids: string[]
        }
        Returns: {
          created_at: string
          created_by_membership_id: string
          folio_id: string
          id: string
          notes: string | null
          restaurant_id: string
          updated_at: string
          updated_by_membership_id: string
        }
        SetofOptions: {
          from: "*"
          to: "guest_folio_invoice_drafts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_invoice_credit_note_draft: {
        Args: {
          _draft_id: string
          _items: Json
          _membership_id: string
          _reason: string
          _restaurant_id: string
        }
        Returns: {
          account_invoice_id: string | null
          created_at: string
          created_by_membership_id: string
          guest_invoice_id: string | null
          id: string
          note_type: string
          reason: string
          restaurant_id: string
          updated_at: string
          updated_by_membership_id: string
        }
        SetofOptions: {
          from: "*"
          to: "invoice_credit_note_drafts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_invoice_debit_note_draft: {
        Args: {
          _draft_id: string
          _membership_id: string
          _reason: string
          _restaurant_id: string
          _source_ids: string[]
        }
        Returns: {
          account_invoice_id: string | null
          created_at: string
          created_by_membership_id: string
          guest_invoice_id: string | null
          id: string
          note_type: string
          reason: string
          restaurant_id: string
          updated_at: string
          updated_by_membership_id: string
        }
        SetofOptions: {
          from: "*"
          to: "invoice_credit_note_drafts"
          isOneToOne: true
          isSetofReturn: false
        }
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
