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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
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
  public: {
    Tables: {
      abbreviations: {
        Row: {
          confidence: string | null
          created_at: string | null
          id: string
          item_code: string | null
          shorthand: string
        }
        Insert: {
          confidence?: string | null
          created_at?: string | null
          id?: string
          item_code?: string | null
          shorthand: string
        }
        Update: {
          confidence?: string | null
          created_at?: string | null
          id?: string
          item_code?: string | null
          shorthand?: string
        }
        Relationships: [
          {
            foreignKeyName: "abbreviations_item_code_fkey"
            columns: ["item_code"]
            isOneToOne: false
            referencedRelation: "nhia_items"
            referencedColumns: ["code"]
          },
        ]
      }
      archived_deleted_authorizations: {
        Row: {
          authorization_code: string | null
          deleted_at: string
          deleted_by: string | null
          deleted_claim_lines_count: number | null
          deleted_claims_count: number | null
          deletion_reason: string | null
          diagnosis: string | null
          hospital_name: string | null
          id: string
          original_request_id: string | null
          patient_name: string | null
          policy_number: string | null
          total_amount: number | null
          treatment: string | null
        }
        Insert: {
          authorization_code?: string | null
          deleted_at?: string
          deleted_by?: string | null
          deleted_claim_lines_count?: number | null
          deleted_claims_count?: number | null
          deletion_reason?: string | null
          diagnosis?: string | null
          hospital_name?: string | null
          id?: string
          original_request_id?: string | null
          patient_name?: string | null
          policy_number?: string | null
          total_amount?: number | null
          treatment?: string | null
        }
        Update: {
          authorization_code?: string | null
          deleted_at?: string
          deleted_by?: string | null
          deleted_claim_lines_count?: number | null
          deleted_claims_count?: number | null
          deletion_reason?: string | null
          diagnosis?: string | null
          hospital_name?: string | null
          id?: string
          original_request_id?: string | null
          patient_name?: string | null
          policy_number?: string | null
          total_amount?: number | null
          treatment?: string | null
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          action_type: string | null
          actor_name: string | null
          actor_role: string | null
          actor_user_id: string | null
          created_at: string
          details: Json
          device_info: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          ip_address: unknown
          new_values: Json
          previous_values: Json
          reason: string | null
          severity: string
          user_id: string | null
        }
        Insert: {
          action: string
          action_type?: string | null
          actor_name?: string | null
          actor_role?: string | null
          actor_user_id?: string | null
          created_at?: string
          details?: Json
          device_info?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: unknown
          new_values?: Json
          previous_values?: Json
          reason?: string | null
          severity?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          action_type?: string | null
          actor_name?: string | null
          actor_role?: string | null
          actor_user_id?: string | null
          created_at?: string
          details?: Json
          device_info?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: unknown
          new_values?: Json
          previous_values?: Json
          reason?: string | null
          severity?: string
          user_id?: string | null
        }
        Relationships: []
      }
      auth_code_sequence: {
        Row: {
          current_value: number
          id: number
        }
        Insert: {
          current_value?: number
          id?: number
        }
        Update: {
          current_value?: number
          id?: number
        }
        Relationships: []
      }
      authorization_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          performed_by: string | null
          request_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          performed_by?: string | null
          request_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          performed_by?: string | null
          request_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "authorization_logs_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "authorization_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      authorization_requests: {
        Row: {
          approval_code_invalidated_at: string | null
          approval_code_invalidated_reason: string | null
          approved_by: string | null
          approved_items: Json
          approved_tariff_amount: number | null
          approved_tariff_category: string | null
          approved_tariff_code: string | null
          approved_tariff_name: string | null
          authorization_code: string | null
          authorized_by_email: string | null
          authorized_by_name: string | null
          claim_status: string
          claimed: boolean
          claiming_hospital_id: string | null
          claiming_hospital_name: string | null
          clinical_notes: string | null
          created_at: string
          current_treatment_diagnosis: string | null
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          deletion_reason: string | null
          deletion_requested_at: string | null
          deletion_requested_by: string | null
          deletion_reviewed_at: string | null
          deletion_status: string
          diagnosis: string
          doctor_name: string | null
          doctor_report_url: string | null
          duplicate_status: string
          hospital_id: string | null
          hospital_name: string | null
          id: string
          is_historical: boolean | null
          is_unlocked: boolean | null
          nurse_initials: string | null
          patient_email: string | null
          patient_name: string
          patient_phone: string | null
          policy_number: string
          previous_authorization_code: string | null
          referral_notes: string | null
          referral_status: string | null
          referred_hospital_id: string | null
          referred_hospital_name: string | null
          referring_hospital_id: string | null
          referring_hospital_name: string | null
          related_request_id: string | null
          request_id: string | null
          requested_amount: number | null
          requesting_hospital_id: string | null
          requesting_hospital_name: string | null
          source: string | null
          status: string
          submitted_by: string | null
          total_amount: number
          treatment: string
          treatment_submitted_at: string | null
          updated_at: string
          urgency: string | null
          whatsapp_message_id: string | null
          whatsapp_raw_message: string | null
        }
        Insert: {
          approval_code_invalidated_at?: string | null
          approval_code_invalidated_reason?: string | null
          approved_by?: string | null
          approved_items?: Json
          approved_tariff_amount?: number | null
          approved_tariff_category?: string | null
          approved_tariff_code?: string | null
          approved_tariff_name?: string | null
          authorization_code?: string | null
          authorized_by_email?: string | null
          authorized_by_name?: string | null
          claim_status?: string
          claimed?: boolean
          claiming_hospital_id?: string | null
          claiming_hospital_name?: string | null
          clinical_notes?: string | null
          created_at?: string
          current_treatment_diagnosis?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          deletion_requested_at?: string | null
          deletion_requested_by?: string | null
          deletion_reviewed_at?: string | null
          deletion_status?: string
          diagnosis: string
          doctor_name?: string | null
          doctor_report_url?: string | null
          duplicate_status?: string
          hospital_id?: string | null
          hospital_name?: string | null
          id?: string
          is_historical?: boolean | null
          is_unlocked?: boolean | null
          nurse_initials?: string | null
          patient_email?: string | null
          patient_name: string
          patient_phone?: string | null
          policy_number: string
          previous_authorization_code?: string | null
          referral_notes?: string | null
          referral_status?: string | null
          referred_hospital_id?: string | null
          referred_hospital_name?: string | null
          referring_hospital_id?: string | null
          referring_hospital_name?: string | null
          related_request_id?: string | null
          request_id?: string | null
          requested_amount?: number | null
          requesting_hospital_id?: string | null
          requesting_hospital_name?: string | null
          source?: string | null
          status?: string
          submitted_by?: string | null
          total_amount?: number
          treatment: string
          treatment_submitted_at?: string | null
          updated_at?: string
          urgency?: string | null
          whatsapp_message_id?: string | null
          whatsapp_raw_message?: string | null
        }
        Update: {
          approval_code_invalidated_at?: string | null
          approval_code_invalidated_reason?: string | null
          approved_by?: string | null
          approved_items?: Json
          approved_tariff_amount?: number | null
          approved_tariff_category?: string | null
          approved_tariff_code?: string | null
          approved_tariff_name?: string | null
          authorization_code?: string | null
          authorized_by_email?: string | null
          authorized_by_name?: string | null
          claim_status?: string
          claimed?: boolean
          claiming_hospital_id?: string | null
          claiming_hospital_name?: string | null
          clinical_notes?: string | null
          created_at?: string
          current_treatment_diagnosis?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          deletion_requested_at?: string | null
          deletion_requested_by?: string | null
          deletion_reviewed_at?: string | null
          deletion_status?: string
          diagnosis?: string
          doctor_name?: string | null
          doctor_report_url?: string | null
          duplicate_status?: string
          hospital_id?: string | null
          hospital_name?: string | null
          id?: string
          is_historical?: boolean | null
          is_unlocked?: boolean | null
          nurse_initials?: string | null
          patient_email?: string | null
          patient_name?: string
          patient_phone?: string | null
          policy_number?: string
          previous_authorization_code?: string | null
          referral_notes?: string | null
          referral_status?: string | null
          referred_hospital_id?: string | null
          referred_hospital_name?: string | null
          referring_hospital_id?: string | null
          referring_hospital_name?: string | null
          related_request_id?: string | null
          request_id?: string | null
          requested_amount?: number | null
          requesting_hospital_id?: string | null
          requesting_hospital_name?: string | null
          source?: string | null
          status?: string
          submitted_by?: string | null
          total_amount?: number
          treatment?: string
          treatment_submitted_at?: string | null
          updated_at?: string
          urgency?: string | null
          whatsapp_message_id?: string | null
          whatsapp_raw_message?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "authorization_requests_claiming_hospital_id_fkey"
            columns: ["claiming_hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "authorization_requests_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "authorization_requests_referred_hospital_id_fkey"
            columns: ["referred_hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "authorization_requests_referring_hospital_id_fkey"
            columns: ["referring_hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "authorization_requests_related_request_id_fkey"
            columns: ["related_request_id"]
            isOneToOne: false
            referencedRelation: "authorization_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "authorization_requests_requesting_hospital_id_fkey"
            columns: ["requesting_hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
        ]
      }
      authorization_requests_backup_20260330: {
        Row: {
          authorization_code: string | null
          clinical_notes: string | null
          created_at: string | null
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          diagnosis: string | null
          doctor_name: string | null
          hospital_id: string | null
          hospital_name: string | null
          id: string | null
          patient_name: string | null
          policy_number: string | null
          request_id: string | null
          source: string | null
          status: string | null
          submitted_by: string | null
          treatment: string | null
          updated_at: string | null
          urgency: string | null
          whatsapp_raw_message: string | null
        }
        Insert: {
          authorization_code?: string | null
          clinical_notes?: string | null
          created_at?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          diagnosis?: string | null
          doctor_name?: string | null
          hospital_id?: string | null
          hospital_name?: string | null
          id?: string | null
          patient_name?: string | null
          policy_number?: string | null
          request_id?: string | null
          source?: string | null
          status?: string | null
          submitted_by?: string | null
          treatment?: string | null
          updated_at?: string | null
          urgency?: string | null
          whatsapp_raw_message?: string | null
        }
        Update: {
          authorization_code?: string | null
          clinical_notes?: string | null
          created_at?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          diagnosis?: string | null
          doctor_name?: string | null
          hospital_id?: string | null
          hospital_name?: string | null
          id?: string | null
          patient_name?: string | null
          policy_number?: string | null
          request_id?: string | null
          source?: string | null
          status?: string | null
          submitted_by?: string | null
          treatment?: string | null
          updated_at?: string | null
          urgency?: string | null
          whatsapp_raw_message?: string | null
        }
        Relationships: []
      }
      claim_status_history: {
        Row: {
          actor_name: string | null
          actor_role: string | null
          actor_user_id: string | null
          claim_id: string
          claim_number: string | null
          created_at: string
          id: string
          new_status: string | null
          new_values: Json
          previous_status: string | null
          previous_values: Json
          reason: string | null
        }
        Insert: {
          actor_name?: string | null
          actor_role?: string | null
          actor_user_id?: string | null
          claim_id: string
          claim_number?: string | null
          created_at?: string
          id?: string
          new_status?: string | null
          new_values?: Json
          previous_status?: string | null
          previous_values?: Json
          reason?: string | null
        }
        Update: {
          actor_name?: string | null
          actor_role?: string | null
          actor_user_id?: string | null
          claim_id?: string
          claim_number?: string | null
          created_at?: string
          id?: string
          new_status?: string | null
          new_values?: Json
          previous_status?: string | null
          previous_values?: Json
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "claim_status_history_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "hospital_claims"
            referencedColumns: ["id"]
          },
        ]
      }
      clinical_tariffs: {
        Row: {
          category: string | null
          code: string | null
          created_at: string
          id: string
          name: string
          price: number
        }
        Insert: {
          category?: string | null
          code?: string | null
          created_at?: string
          id?: string
          name: string
          price: number
        }
        Update: {
          category?: string | null
          code?: string | null
          created_at?: string
          id?: string
          name?: string
          price?: number
        }
        Relationships: []
      }
      consent_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          ip_address: string | null
          policy_version: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          ip_address?: string | null
          policy_version: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          policy_version?: string
          user_id?: string
        }
        Relationships: []
      }
      email_logs: {
        Row: {
          authorization_id: string | null
          created_at: string
          error_message: string | null
          id: string
          provider: string
          recipient: string
          response_id: string | null
          status: string
          subject: string | null
        }
        Insert: {
          authorization_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          provider?: string
          recipient: string
          response_id?: string | null
          status?: string
          subject?: string | null
        }
        Update: {
          authorization_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          provider?: string
          recipient?: string
          response_id?: string | null
          status?: string
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_logs_authorization_id_fkey"
            columns: ["authorization_id"]
            isOneToOne: false
            referencedRelation: "authorization_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      excel_imports: {
        Row: {
          created_at: string
          errors: Json | null
          failed_rows: number | null
          file_type: string | null
          filename: string
          id: string
          imported_by: string | null
          successful_rows: number | null
          total_rows: number | null
        }
        Insert: {
          created_at?: string
          errors?: Json | null
          failed_rows?: number | null
          file_type?: string | null
          filename: string
          id?: string
          imported_by?: string | null
          successful_rows?: number | null
          total_rows?: number | null
        }
        Update: {
          created_at?: string
          errors?: Json | null
          failed_rows?: number | null
          file_type?: string | null
          filename?: string
          id?: string
          imported_by?: string | null
          successful_rows?: number | null
          total_rows?: number | null
        }
        Relationships: []
      }
      global_policies: {
        Row: {
          id: string
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      historical_code_import_batches: {
        Row: {
          completed_at: string | null
          created_at: string
          created_count: number
          duplicate_count: number
          error_count: number
          file_name: string | null
          id: string
          imported_by: string | null
          imported_by_name: string | null
          reconciliation_count: number
          skipped_count: number
          source: string
          status: string
          total_rows: number
          unique_rows: number
          updated_count: number
          validation_results: Json
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_count?: number
          duplicate_count?: number
          error_count?: number
          file_name?: string | null
          id?: string
          imported_by?: string | null
          imported_by_name?: string | null
          reconciliation_count?: number
          skipped_count?: number
          source?: string
          status?: string
          total_rows?: number
          unique_rows?: number
          updated_count?: number
          validation_results?: Json
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_count?: number
          duplicate_count?: number
          error_count?: number
          file_name?: string | null
          id?: string
          imported_by?: string | null
          imported_by_name?: string | null
          reconciliation_count?: number
          skipped_count?: number
          source?: string
          status?: string
          total_rows?: number
          unique_rows?: number
          updated_count?: number
          validation_results?: Json
        }
        Relationships: []
      }
      historical_code_import_results: {
        Row: {
          action: string
          batch_id: string | null
          created_at: string
          historical_code_id: string | null
          id: string
          message: string | null
          new_values: Json
          original_code: string | null
          previous_values: Json
          record_type: string | null
          row_number: number | null
        }
        Insert: {
          action: string
          batch_id?: string | null
          created_at?: string
          historical_code_id?: string | null
          id?: string
          message?: string | null
          new_values?: Json
          original_code?: string | null
          previous_values?: Json
          record_type?: string | null
          row_number?: number | null
        }
        Update: {
          action?: string
          batch_id?: string | null
          created_at?: string
          historical_code_id?: string | null
          id?: string
          message?: string | null
          new_values?: Json
          original_code?: string | null
          previous_values?: Json
          record_type?: string | null
          row_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "historical_code_import_results_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "historical_code_import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historical_code_import_results_historical_code_id_fkey"
            columns: ["historical_code_id"]
            isOneToOne: false
            referencedRelation: "historical_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      historical_codes: {
        Row: {
          authorization_code: string | null
          beneficiary_code: string | null
          claim_number: string | null
          created_at: string
          date_of_birth: string | null
          hospital_code: string | null
          hospital_name: string | null
          id: string
          import_batch_id: string | null
          imported_by: string | null
          invoice_number: string | null
          last_synchronized_at: string
          legacy_creation_date: string | null
          normalized_code: string
          original_code: string
          patient_name: string | null
          payment_reference: string | null
          policy_number: string | null
          provider_code: string | null
          raw_data: Json
          reconciliation: Json
          record_type: string
          source: string
          synchronized: boolean
          updated_at: string
        }
        Insert: {
          authorization_code?: string | null
          beneficiary_code?: string | null
          claim_number?: string | null
          created_at?: string
          date_of_birth?: string | null
          hospital_code?: string | null
          hospital_name?: string | null
          id?: string
          import_batch_id?: string | null
          imported_by?: string | null
          invoice_number?: string | null
          last_synchronized_at?: string
          legacy_creation_date?: string | null
          normalized_code: string
          original_code: string
          patient_name?: string | null
          payment_reference?: string | null
          policy_number?: string | null
          provider_code?: string | null
          raw_data?: Json
          reconciliation?: Json
          record_type: string
          source?: string
          synchronized?: boolean
          updated_at?: string
        }
        Update: {
          authorization_code?: string | null
          beneficiary_code?: string | null
          claim_number?: string | null
          created_at?: string
          date_of_birth?: string | null
          hospital_code?: string | null
          hospital_name?: string | null
          id?: string
          import_batch_id?: string | null
          imported_by?: string | null
          invoice_number?: string | null
          last_synchronized_at?: string
          legacy_creation_date?: string | null
          normalized_code?: string
          original_code?: string
          patient_name?: string | null
          payment_reference?: string | null
          policy_number?: string | null
          provider_code?: string | null
          raw_data?: Json
          reconciliation?: Json
          record_type?: string
          source?: string
          synchronized?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "historical_codes_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "historical_code_import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      hmo_announcements: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          priority: string
          title: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          priority?: string
          title: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          priority?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      hospital_claim_lines: {
        Row: {
          charge: number
          claim_id: string
          code: string
          created_at: string
          description: string
          id: string
          units: number
          updated_at: string
        }
        Insert: {
          charge?: number
          claim_id: string
          code: string
          created_at?: string
          description: string
          id?: string
          units?: number
          updated_at?: string
        }
        Update: {
          charge?: number
          claim_id?: string
          code?: string
          created_at?: string
          description?: string
          id?: string
          units?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hospital_claim_lines_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "hospital_claims"
            referencedColumns: ["id"]
          },
        ]
      }
      hospital_claims: {
        Row: {
          approved_amount: number | null
          approved_at: string | null
          approved_by: string | null
          approved_for: string
          approved_items: Json
          audit_items: Json
          audit_note: string | null
          audit_summary: Json
          audited_at: string | null
          audited_by: string | null
          auth_code: string
          claim_number: string
          claiming_hospital_id: string | null
          claiming_hospital_name: string | null
          contest_deadline: string | null
          contest_documents: Json
          contest_note: string | null
          contest_resolved_at: string | null
          contest_submitted_at: string | null
          created_at: string
          created_by: string
          declined_amount: number
          diagnosis: string
          hospital_id: string
          hospital_name: string
          id: string
          line_items: Json
          notes: string
          original_amount: number | null
          paid_at: string | null
          paid_by: string | null
          patient_name: string
          payment_batch_id: string | null
          payment_note: string | null
          payment_reference: string | null
          payment_status: string | null
          policy_number: string
          referred_hospital_id: string | null
          referred_hospital_name: string | null
          referring_hospital_id: string | null
          referring_hospital_name: string | null
          request_id: string
          requesting_hospital_id: string | null
          requesting_hospital_name: string | null
          status: string
          submitted_at: string | null
          total_amount: number
          under_contest_amount: number
          updated_at: string
        }
        Insert: {
          approved_amount?: number | null
          approved_at?: string | null
          approved_by?: string | null
          approved_for: string
          approved_items?: Json
          audit_items?: Json
          audit_note?: string | null
          audit_summary?: Json
          audited_at?: string | null
          audited_by?: string | null
          auth_code: string
          claim_number: string
          claiming_hospital_id?: string | null
          claiming_hospital_name?: string | null
          contest_deadline?: string | null
          contest_documents?: Json
          contest_note?: string | null
          contest_resolved_at?: string | null
          contest_submitted_at?: string | null
          created_at?: string
          created_by: string
          declined_amount?: number
          diagnosis: string
          hospital_id: string
          hospital_name: string
          id?: string
          line_items?: Json
          notes?: string
          original_amount?: number | null
          paid_at?: string | null
          paid_by?: string | null
          patient_name: string
          payment_batch_id?: string | null
          payment_note?: string | null
          payment_reference?: string | null
          payment_status?: string | null
          policy_number: string
          referred_hospital_id?: string | null
          referred_hospital_name?: string | null
          referring_hospital_id?: string | null
          referring_hospital_name?: string | null
          request_id: string
          requesting_hospital_id?: string | null
          requesting_hospital_name?: string | null
          status?: string
          submitted_at?: string | null
          total_amount?: number
          under_contest_amount?: number
          updated_at?: string
        }
        Update: {
          approved_amount?: number | null
          approved_at?: string | null
          approved_by?: string | null
          approved_for?: string
          approved_items?: Json
          audit_items?: Json
          audit_note?: string | null
          audit_summary?: Json
          audited_at?: string | null
          audited_by?: string | null
          auth_code?: string
          claim_number?: string
          claiming_hospital_id?: string | null
          claiming_hospital_name?: string | null
          contest_deadline?: string | null
          contest_documents?: Json
          contest_note?: string | null
          contest_resolved_at?: string | null
          contest_submitted_at?: string | null
          created_at?: string
          created_by?: string
          declined_amount?: number
          diagnosis?: string
          hospital_id?: string
          hospital_name?: string
          id?: string
          line_items?: Json
          notes?: string
          original_amount?: number | null
          paid_at?: string | null
          paid_by?: string | null
          patient_name?: string
          payment_batch_id?: string | null
          payment_note?: string | null
          payment_reference?: string | null
          payment_status?: string | null
          policy_number?: string
          referred_hospital_id?: string | null
          referred_hospital_name?: string | null
          referring_hospital_id?: string | null
          referring_hospital_name?: string | null
          request_id?: string
          requesting_hospital_id?: string | null
          requesting_hospital_name?: string | null
          status?: string
          submitted_at?: string | null
          total_amount?: number
          under_contest_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hospital_claims_claiming_hospital_id_fkey"
            columns: ["claiming_hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospital_claims_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospital_claims_payment_batch_id_fkey"
            columns: ["payment_batch_id"]
            isOneToOne: false
            referencedRelation: "payment_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospital_claims_referred_hospital_id_fkey"
            columns: ["referred_hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospital_claims_referring_hospital_id_fkey"
            columns: ["referring_hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospital_claims_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "authorization_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospital_claims_requesting_hospital_id_fkey"
            columns: ["requesting_hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
        ]
      }
      hospital_whatsapp_audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          contact_id: string | null
          created_at: string
          details: Json
          hospital_id: string
          id: string
          new_status: string | null
          old_status: string | null
          phone_number: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          contact_id?: string | null
          created_at?: string
          details?: Json
          hospital_id: string
          id?: string
          new_status?: string | null
          old_status?: string | null
          phone_number: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          contact_id?: string | null
          created_at?: string
          details?: Json
          hospital_id?: string
          id?: string
          new_status?: string | null
          old_status?: string | null
          phone_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "hospital_whatsapp_audit_logs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "hospital_whatsapp_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospital_whatsapp_audit_logs_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
        ]
      }
      hospital_whatsapp_contacts: {
        Row: {
          contact_name: string | null
          contact_role: string | null
          created_at: string
          created_by: string | null
          hospital_id: string
          id: string
          phone_number: string
          status: string
          updated_at: string
        }
        Insert: {
          contact_name?: string | null
          contact_role?: string | null
          created_at?: string
          created_by?: string | null
          hospital_id: string
          id?: string
          phone_number: string
          status?: string
          updated_at?: string
        }
        Update: {
          contact_name?: string | null
          contact_role?: string | null
          created_at?: string
          created_by?: string | null
          hospital_id?: string
          id?: string
          phone_number?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hospital_whatsapp_contacts_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
        ]
      }
      hospitals: {
        Row: {
          address: string | null
          code: string
          created_at: string
          email: string | null
          id: string
          is_active: boolean | null
          name: string
          phone: string | null
          state: string | null
          updated_at: string
          user_id: string | null
          whatsapp_number: string | null
        }
        Insert: {
          address?: string | null
          code: string
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          phone?: string | null
          state?: string | null
          updated_at?: string
          user_id?: string | null
          whatsapp_number?: string | null
        }
        Update: {
          address?: string | null
          code?: string
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          phone?: string | null
          state?: string | null
          updated_at?: string
          user_id?: string | null
          whatsapp_number?: string | null
        }
        Relationships: []
      }
      knowledge_candidates: {
        Row: {
          category: string
          confidence: number
          created_at: string
          created_by: string | null
          evidence: Json
          evidence_count: number
          expires_at: string | null
          first_observed_at: string
          id: string
          last_observed_at: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          summary: string
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          confidence?: number
          created_at?: string
          created_by?: string | null
          evidence?: Json
          evidence_count?: number
          expires_at?: string | null
          first_observed_at?: string
          id?: string
          last_observed_at?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          summary: string
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          confidence?: number
          created_at?: string
          created_by?: string | null
          evidence?: Json
          evidence_count?: number
          expires_at?: string | null
          first_observed_at?: string
          id?: string
          last_observed_at?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          summary?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      learning_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          occurred_at: string
          payload: Json
          source: string
          subject_key: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          occurred_at?: string
          payload?: Json
          source: string
          subject_key?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          occurred_at?: string
          payload?: Json
          source?: string
          subject_key?: string | null
        }
        Relationships: []
      }
      nhia_items: {
        Row: {
          amount: number
          category: string
          code: string
          common_abbreviations: string[] | null
          created_at: string | null
          description: string | null
          dosage_form: string | null
          is_active: boolean | null
          name: string
          presentation: string | null
          strengths: string | null
          subcategory: string | null
        }
        Insert: {
          amount: number
          category: string
          code: string
          common_abbreviations?: string[] | null
          created_at?: string | null
          description?: string | null
          dosage_form?: string | null
          is_active?: boolean | null
          name: string
          presentation?: string | null
          strengths?: string | null
          subcategory?: string | null
        }
        Update: {
          amount?: number
          category?: string
          code?: string
          common_abbreviations?: string[] | null
          created_at?: string | null
          description?: string | null
          dosage_form?: string | null
          is_active?: boolean | null
          name?: string
          presentation?: string | null
          strengths?: string | null
          subcategory?: string | null
        }
        Relationships: []
      }
      nhis_beneficiaries: {
        Row: {
          created_at: string
          dob: string | null
          first_name: string
          full_name: string
          gender: string | null
          hcp_code: string | null
          hcp_name: string | null
          id: string
          member_type: string
          plan_code: string | null
          policy_number: string
          surname: string
        }
        Insert: {
          created_at?: string
          dob?: string | null
          first_name: string
          full_name: string
          gender?: string | null
          hcp_code?: string | null
          hcp_name?: string | null
          id?: string
          member_type: string
          plan_code?: string | null
          policy_number: string
          surname: string
        }
        Update: {
          created_at?: string
          dob?: string | null
          first_name?: string
          full_name?: string
          gender?: string | null
          hcp_code?: string | null
          hcp_name?: string | null
          id?: string
          member_type?: string
          plan_code?: string | null
          policy_number?: string
          surname?: string
        }
        Relationships: []
      }
      nhis_update_runs: {
        Row: {
          administrator_name: string | null
          completed_at: string | null
          confirmed_at: string | null
          created_at: string
          csv_path: string | null
          duplicate_records: number
          hcp_summary: Json
          id: string
          invalid_dates: number
          logs: string[]
          missing_fields: number
          new_record_count: number | null
          original_filename: string
          pdf_path: string | null
          previous_record_count: number | null
          processing_ms: number | null
          records_added: number | null
          records_removed: number | null
          status: string
          total_records: number
          unique_policy_numbers: number
          updated_at: string
          uploaded_by: string | null
          validation_results: Json
          xlsx_path: string | null
        }
        Insert: {
          administrator_name?: string | null
          completed_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          csv_path?: string | null
          duplicate_records?: number
          hcp_summary?: Json
          id?: string
          invalid_dates?: number
          logs?: string[]
          missing_fields?: number
          new_record_count?: number | null
          original_filename: string
          pdf_path?: string | null
          previous_record_count?: number | null
          processing_ms?: number | null
          records_added?: number | null
          records_removed?: number | null
          status?: string
          total_records?: number
          unique_policy_numbers?: number
          updated_at?: string
          uploaded_by?: string | null
          validation_results?: Json
          xlsx_path?: string | null
        }
        Update: {
          administrator_name?: string | null
          completed_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          csv_path?: string | null
          duplicate_records?: number
          hcp_summary?: Json
          id?: string
          invalid_dates?: number
          logs?: string[]
          missing_fields?: number
          new_record_count?: number | null
          original_filename?: string
          pdf_path?: string | null
          previous_record_count?: number | null
          processing_ms?: number | null
          records_added?: number | null
          records_removed?: number | null
          status?: string
          total_records?: number
          unique_policy_numbers?: number
          updated_at?: string
          uploaded_by?: string | null
          validation_results?: Json
          xlsx_path?: string | null
        }
        Relationships: []
      }
      nhis_update_staging: {
        Row: {
          created_at: string
          dob: string | null
          first_name: string
          full_name: string
          gender: string | null
          hcp_code: string | null
          hcp_name: string | null
          id: string
          member_type: string
          policy_number: string
          row_number: number
          run_id: string
          surname: string
        }
        Insert: {
          created_at?: string
          dob?: string | null
          first_name: string
          full_name: string
          gender?: string | null
          hcp_code?: string | null
          hcp_name?: string | null
          id?: string
          member_type: string
          policy_number: string
          row_number: number
          run_id: string
          surname: string
        }
        Update: {
          created_at?: string
          dob?: string | null
          first_name?: string
          full_name?: string
          gender?: string | null
          hcp_code?: string | null
          hcp_name?: string | null
          id?: string
          member_type?: string
          policy_number?: string
          row_number?: number
          run_id?: string
          surname?: string
        }
        Relationships: [
          {
            foreignKeyName: "nhis_update_staging_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "nhis_update_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      otp_verifications: {
        Row: {
          authorization_id: string
          consumed_at: string | null
          created_at: string
          created_by: string | null
          email: string
          expires_at: string
          hospital_id: string | null
          id: string
          otp_hash: string
          otp_type: string | null
          otp_value: string | null
          verified: boolean
          viewed_by_nurse_at: string | null
        }
        Insert: {
          authorization_id: string
          consumed_at?: string | null
          created_at?: string
          created_by?: string | null
          email: string
          expires_at?: string
          hospital_id?: string | null
          id?: string
          otp_hash: string
          otp_type?: string | null
          otp_value?: string | null
          verified?: boolean
          viewed_by_nurse_at?: string | null
        }
        Update: {
          authorization_id?: string
          consumed_at?: string | null
          created_at?: string
          created_by?: string | null
          email?: string
          expires_at?: string
          hospital_id?: string | null
          id?: string
          otp_hash?: string
          otp_type?: string | null
          otp_value?: string | null
          verified?: boolean
          viewed_by_nurse_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "otp_verifications_authorization_id_fkey"
            columns: ["authorization_id"]
            isOneToOne: false
            referencedRelation: "authorization_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "otp_verifications_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          created_at: string
          date_of_birth: string | null
          email: string | null
          expiry_date: string | null
          first_name: string
          gender: string | null
          id: string
          phone: string | null
          plan_code: string | null
          policy_number: string
          role: string
          subscription_status: string | null
          surname: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          expiry_date?: string | null
          first_name: string
          gender?: string | null
          id?: string
          phone?: string | null
          plan_code?: string | null
          policy_number: string
          role?: string
          subscription_status?: string | null
          surname: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          expiry_date?: string | null
          first_name?: string
          gender?: string | null
          id?: string
          phone?: string | null
          plan_code?: string | null
          policy_number?: string
          role?: string
          subscription_status?: string | null
          surname?: string
          updated_at?: string
        }
        Relationships: []
      }
      payment_batches: {
        Row: {
          bank_reference: string | null
          batch_reference: string
          created_at: string | null
          created_by: string | null
          id: string
          month: string
          paid_at: string | null
          paid_by: string | null
          provider_id: string
          receipt_name: string | null
          receipt_url: string | null
          status: string | null
          total_amount: number | null
          total_claims: number | null
        }
        Insert: {
          bank_reference?: string | null
          batch_reference: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          month: string
          paid_at?: string | null
          paid_by?: string | null
          provider_id: string
          receipt_name?: string | null
          receipt_url?: string | null
          status?: string | null
          total_amount?: number | null
          total_claims?: number | null
        }
        Update: {
          bank_reference?: string | null
          batch_reference?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          month?: string
          paid_at?: string | null
          paid_by?: string | null
          provider_id?: string
          receipt_name?: string | null
          receipt_url?: string | null
          status?: string | null
          total_amount?: number | null
          total_claims?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_batches_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
        ]
      }
      policy_email_registry: {
        Row: {
          created_at: string
          email: string
          family_policy_number: string
          id: string
        }
        Insert: {
          created_at?: string
          email: string
          family_policy_number: string
          id?: string
        }
        Update: {
          created_at?: string
          email?: string
          family_policy_number?: string
          id?: string
        }
        Relationships: []
      }
      policy_phone_registry: {
        Row: {
          created_at: string
          family_policy_number: string
          id: string
          phone: string
        }
        Insert: {
          created_at?: string
          family_policy_number: string
          id?: string
          phone: string
        }
        Update: {
          created_at?: string
          family_policy_number?: string
          id?: string
          phone?: string
        }
        Relationships: []
      }
      profile_name_update_requests: {
        Row: {
          created_at: string
          current_name: string
          decided_at: string | null
          decided_by: string | null
          id: string
          requested_name: string
          role: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_name: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          requested_name: string
          role: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_name?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          requested_name?: string
          role?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      referral_code_sequence: {
        Row: {
          current_value: number
          id: number
        }
        Insert: {
          current_value?: number
          id: number
        }
        Update: {
          current_value?: number
          id?: number
        }
        Relationships: []
      }
      support_ai_feedback: {
        Row: {
          conversation_id: string
          created_at: string
          escalate_to_human: boolean
          feedback: string | null
          id: string
          message_id: string | null
          resolved: boolean | null
          user_id: string | null
        }
        Insert: {
          conversation_id: string
          created_at?: string
          escalate_to_human?: boolean
          feedback?: string | null
          id?: string
          message_id?: string | null
          resolved?: boolean | null
          user_id?: string | null
        }
        Update: {
          conversation_id?: string
          created_at?: string
          escalate_to_human?: boolean
          feedback?: string | null
          id?: string
          message_id?: string | null
          resolved?: boolean | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_ai_feedback_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "support_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_ai_feedback_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "support_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      support_conversations: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          assigned_to: string | null
          auto_close_at: string | null
          closed_at: string | null
          closed_reason: string | null
          created_at: string
          created_by: string | null
          department: string
          first_response_at: string | null
          hospital_id: string | null
          hospital_user_id: string | null
          id: string
          last_message: string | null
          last_message_at: string | null
          linked_request_id: string | null
          nurse_alert_seen_at: string | null
          nurse_alerted_at: string | null
          nurse_user_id: string | null
          priority: string
          request_metadata: Json
          request_reference: string | null
          request_ticket_status: string
          sla_due_at: string | null
          status: string
          subject: string
          tags: string[]
          ticket_number: string | null
          ticket_type: string
          updated_at: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_to?: string | null
          auto_close_at?: string | null
          closed_at?: string | null
          closed_reason?: string | null
          created_at?: string
          created_by?: string | null
          department?: string
          first_response_at?: string | null
          hospital_id?: string | null
          hospital_user_id?: string | null
          id?: string
          last_message?: string | null
          last_message_at?: string | null
          linked_request_id?: string | null
          nurse_alert_seen_at?: string | null
          nurse_alerted_at?: string | null
          nurse_user_id?: string | null
          priority?: string
          request_metadata?: Json
          request_reference?: string | null
          request_ticket_status?: string
          sla_due_at?: string | null
          status?: string
          subject?: string
          tags?: string[]
          ticket_number?: string | null
          ticket_type?: string
          updated_at?: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_to?: string | null
          auto_close_at?: string | null
          closed_at?: string | null
          closed_reason?: string | null
          created_at?: string
          created_by?: string | null
          department?: string
          first_response_at?: string | null
          hospital_id?: string | null
          hospital_user_id?: string | null
          id?: string
          last_message?: string | null
          last_message_at?: string | null
          linked_request_id?: string | null
          nurse_alert_seen_at?: string | null
          nurse_alerted_at?: string | null
          nurse_user_id?: string | null
          priority?: string
          request_metadata?: Json
          request_reference?: string | null
          request_ticket_status?: string
          sla_due_at?: string | null
          status?: string
          subject?: string
          tags?: string[]
          ticket_number?: string | null
          ticket_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_conversations_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_conversations_linked_request_id_fkey"
            columns: ["linked_request_id"]
            isOneToOne: false
            referencedRelation: "authorization_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      support_messages: {
        Row: {
          attachment_name: string | null
          attachment_url: string | null
          body: string
          conversation_id: string
          created_at: string
          id: string
          is_internal: boolean
          message_type: string
          read_by: string[]
          sender_id: string | null
          sender_name: string | null
          sender_role: string | null
        }
        Insert: {
          attachment_name?: string | null
          attachment_url?: string | null
          body: string
          conversation_id: string
          created_at?: string
          id?: string
          is_internal?: boolean
          message_type?: string
          read_by?: string[]
          sender_id?: string | null
          sender_name?: string | null
          sender_role?: string | null
        }
        Update: {
          attachment_name?: string | null
          attachment_url?: string | null
          body?: string
          conversation_id?: string
          created_at?: string
          id?: string
          is_internal?: boolean
          message_type?: string
          read_by?: string[]
          sender_id?: string | null
          sender_name?: string | null
          sender_role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "support_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      support_notifications: {
        Row: {
          conversation_id: string
          created_at: string
          id: string
          is_read: boolean
          linked_request_id: string | null
          message: string
          title: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          id?: string
          is_read?: boolean
          linked_request_id?: string | null
          message: string
          title: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          id?: string
          is_read?: boolean
          linked_request_id?: string | null
          message?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_notifications_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "support_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_notifications_linked_request_id_fkey"
            columns: ["linked_request_id"]
            isOneToOne: false
            referencedRelation: "authorization_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          access_status: string
          created_at: string
          email: string | null
          failed_attempts: number
          full_name: string | null
          hospital_id: string | null
          id: string
          invite_status: string
          is_team_lead: boolean
          last_sign_in: string | null
          onboarding_completed: boolean
          onboarding_completed_at: string | null
          phone: string | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          access_status?: string
          created_at?: string
          email?: string | null
          failed_attempts?: number
          full_name?: string | null
          hospital_id?: string | null
          id?: string
          invite_status?: string
          is_team_lead?: boolean
          last_sign_in?: string | null
          onboarding_completed?: boolean
          onboarding_completed_at?: string | null
          phone?: string | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          access_status?: string
          created_at?: string
          email?: string | null
          failed_attempts?: number
          full_name?: string | null
          hospital_id?: string | null
          id?: string
          invite_status?: string
          is_team_lead?: boolean
          last_sign_in?: string | null
          onboarding_completed?: boolean
          onboarding_completed_at?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_conversations: {
        Row: {
          active_authorization_id: string | null
          active_intent: string | null
          created_at: string | null
          id: string
          last_message_at: string | null
          last_patient_name: string | null
          last_policy_number: string | null
          pending_data: Json | null
          phone_number: string
          updated_at: string | null
        }
        Insert: {
          active_authorization_id?: string | null
          active_intent?: string | null
          created_at?: string | null
          id?: string
          last_message_at?: string | null
          last_patient_name?: string | null
          last_policy_number?: string | null
          pending_data?: Json | null
          phone_number: string
          updated_at?: string | null
        }
        Update: {
          active_authorization_id?: string | null
          active_intent?: string | null
          created_at?: string | null
          id?: string
          last_message_at?: string | null
          last_patient_name?: string | null
          last_policy_number?: string | null
          pending_data?: Json | null
          phone_number?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_conversations_active_authorization_id_fkey"
            columns: ["active_authorization_id"]
            isOneToOne: false
            referencedRelation: "authorization_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_messages: {
        Row: {
          attempts: number
          authorization_request_id: string | null
          correlation_id: string | null
          created_at: string
          error_message: string | null
          extracted: Json | null
          id: string
          internal_request_id: string | null
          last_error: string | null
          media_url: string | null
          message_body: string | null
          message_id: string
          message_type: string
          next_attempt_at: string
          phone_number: string
          phone_number_id: string | null
          processed_at: string | null
          processing_heartbeat_at: string | null
          processing_lease_expires_at: string | null
          processing_owner: string | null
          raw_message: Json | null
          received_at: string
          status: string
          status_updated_at: string | null
          template_sent_at: string | null
        }
        Insert: {
          attempts?: number
          authorization_request_id?: string | null
          correlation_id?: string | null
          created_at?: string
          error_message?: string | null
          extracted?: Json | null
          id?: string
          internal_request_id?: string | null
          last_error?: string | null
          media_url?: string | null
          message_body?: string | null
          message_id: string
          message_type?: string
          next_attempt_at?: string
          phone_number: string
          phone_number_id?: string | null
          processed_at?: string | null
          processing_heartbeat_at?: string | null
          processing_lease_expires_at?: string | null
          processing_owner?: string | null
          raw_message?: Json | null
          received_at?: string
          status?: string
          status_updated_at?: string | null
          template_sent_at?: string | null
        }
        Update: {
          attempts?: number
          authorization_request_id?: string | null
          correlation_id?: string | null
          created_at?: string
          error_message?: string | null
          extracted?: Json | null
          id?: string
          internal_request_id?: string | null
          last_error?: string | null
          media_url?: string | null
          message_body?: string | null
          message_id?: string
          message_type?: string
          next_attempt_at?: string
          phone_number?: string
          phone_number_id?: string | null
          processed_at?: string | null
          processing_heartbeat_at?: string | null
          processing_lease_expires_at?: string | null
          processing_owner?: string | null
          raw_message?: Json | null
          received_at?: string
          status?: string
          status_updated_at?: string | null
          template_sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_authorization_request_id_fkey"
            columns: ["authorization_request_id"]
            isOneToOne: false
            referencedRelation: "authorization_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_notifications: {
        Row: {
          attempts: number | null
          authorization_request_id: string | null
          created_at: string | null
          id: string
          last_error: string | null
          message_body: string | null
          notification_type: string
          phone_number: string | null
          sent_at: string | null
          status: string | null
        }
        Insert: {
          attempts?: number | null
          authorization_request_id?: string | null
          created_at?: string | null
          id?: string
          last_error?: string | null
          message_body?: string | null
          notification_type: string
          phone_number?: string | null
          sent_at?: string | null
          status?: string | null
        }
        Update: {
          attempts?: number | null
          authorization_request_id?: string | null
          created_at?: string | null
          id?: string
          last_error?: string | null
          message_body?: string | null
          notification_type?: string
          phone_number?: string | null
          sent_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_notifications_authorization_request_id_fkey"
            columns: ["authorization_request_id"]
            isOneToOne: false
            referencedRelation: "authorization_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_outbound_ledger: {
        Row: {
          attempt_count: number
          authorization_request_id: string | null
          content_hash: string | null
          created_at: string
          destination_phone: string | null
          id: string
          last_error: string | null
          lease_expires_at: string | null
          lease_owner: string | null
          message_id: string
          operation_key: string
          outbound_state: string
          provider_message_id: string | null
          sent_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          authorization_request_id?: string | null
          content_hash?: string | null
          created_at?: string
          destination_phone?: string | null
          id?: string
          last_error?: string | null
          lease_expires_at?: string | null
          lease_owner?: string | null
          message_id: string
          operation_key?: string
          outbound_state?: string
          provider_message_id?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          authorization_request_id?: string | null
          content_hash?: string | null
          created_at?: string
          destination_phone?: string | null
          id?: string
          last_error?: string | null
          lease_expires_at?: string | null
          lease_owner?: string | null
          message_id?: string
          operation_key?: string
          outbound_state?: string
          provider_message_id?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_outbound_ledger_authorization_request_id_fkey"
            columns: ["authorization_request_id"]
            isOneToOne: false
            referencedRelation: "authorization_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_processing_log: {
        Row: {
          correlation_id: string | null
          created_at: string
          detail: Json | null
          id: string
          message_id: string
          stage: string
          status: string
        }
        Insert: {
          correlation_id?: string | null
          created_at?: string
          detail?: Json | null
          id?: string
          message_id: string
          stage: string
          status: string
        }
        Update: {
          correlation_id?: string | null
          created_at?: string
          detail?: Json | null
          id?: string
          message_id?: string
          stage?: string
          status?: string
        }
        Relationships: []
      }
      whatsapp_sessions: {
        Row: {
          created_at: string | null
          expires_at: string | null
          metadata: Json | null
          session_data: string
          session_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          metadata?: Json | null
          session_data: string
          session_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          metadata?: Json | null
          session_data?: string
          session_id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      actor_snapshot: { Args: { _user_id: string }; Returns: Json }
      admin_get_users_mfa_status: {
        Args: never
        Returns: {
          mfa_enabled: boolean
          user_id: string
        }[]
      }
      admin_unenroll_mfa: { Args: { p_user_id: string }; Returns: undefined }
      assert_support_participant: {
        Args: { _allow_internal?: boolean; _conversation_id: string }
        Returns: boolean
      }
      check_invite_status: {
        Args: { p_user_id: string }
        Returns: {
          hospital_id: string
          invite_status: string
          onboarding_completed: boolean
          role: Database["public"]["Enums"]["app_role"]
        }[]
      }
      claim_whatsapp_outbound_operation: {
        Args: {
          p_authorization_request_id: string
          p_content_hash: string
          p_destination_phone: string
          p_lease_owner: string
          p_lease_seconds?: number
          p_message_id: string
          p_operation_key: string
        }
        Returns: boolean
      }
      claims_reconciliation_report: {
        Args: { _from?: string; _hospital_id?: string; _to?: string }
        Returns: {
          approved_amount: number
          auth_code: string
          authorized_amount: number
          claim_number: string
          claim_status: string
          claimed_amount: number
          hospital_name: string
          outstanding_balance: number
          paid_amount: number
          patient_name: string
          policy_number: string
        }[]
      }
      claims_report_export: {
        Args: {
          _from?: string
          _hospital_id?: string
          _status?: string
          _to?: string
        }
        Returns: {
          approved_amount: number
          audit_note: string
          auth_code: string
          claim_id: string
          claim_number: string
          created_at: string
          declined_amount: number
          hospital_name: string
          original_amount: number
          paid_at: string
          patient_name: string
          payment_note: string
          payment_reference: string
          policy_number: string
          status: string
          submitted_at: string
          total_amount: number
        }[]
      }
      claims_volume_performance: {
        Args: { _bucket?: string; _from?: string; _to?: string }
        Returns: {
          approved_count: number
          approved_value: number
          audit_savings: number
          avg_processing_hours: number
          declined_count: number
          declined_value: number
          partial_count: number
          period_start: string
          submitted_count: number
          total_claim_value: number
          under_audit_count: number
        }[]
      }
      cleanup_whatsapp_queue: { Args: never; Returns: undefined }
      close_inactive_support_conversations: { Args: never; Returns: number }
      create_audit_log: {
        Args: { p_action: string; p_details?: Json; p_severity?: string }
        Returns: string
      }
      create_payment_batch_transactional: {
        Args: {
          p_batch_reference: string
          p_claim_ids: string[]
          p_created_by: string
          p_month: string
          p_provider_id: string
          p_total_amount: number
          p_total_claims: number
        }
        Returns: string
      }
      create_request_support_ticket: {
        Args: {
          _initial_message: string
          _priority?: string
          _request_id: string
        }
        Returns: Json
      }
      create_support_ticket:
        | {
            Args: {
              _department?: string
              _initial_message?: string
              _priority?: string
              _subject: string
            }
            Returns: Json
          }
        | {
            Args: {
              _department?: string
              _initial_message?: string
              _linked_request_id?: string
              _priority?: string
              _subject: string
              _ticket_type?: string
            }
            Returns: Json
          }
      dashboard_claims_activity_7d: {
        Args: never
        Returns: {
          approved: number
          day: string
          day_label: string
          volume: number
        }[]
      }
      dashboard_finance_activity_7d: {
        Args: never
        Returns: {
          amount: number
          day: string
          day_label: string
          volume: number
        }[]
      }
      dashboard_live_activity_7d: {
        Args: never
        Returns: {
          approved: number
          day: string
          day_label: string
          volume: number
        }[]
      }
      dashboard_payment_activity_7d: {
        Args: never
        Returns: {
          approved: number
          day: string
          day_label: string
          volume: number
        }[]
      }
      decide_profile_name_request: {
        Args: { _decided_by: string; _request_id: string; _status: string }
        Returns: Json
      }
      find_support_assignee: { Args: { _department?: string }; Returns: string }
      fn_submit_authorization_claim: {
        Args: { p_request_id: string }
        Returns: Json
      }
      generate_auth_code:
        | { Args: never; Returns: string }
        | { Args: { nurse_initials?: string }; Returns: string }
      generate_batch_reference: { Args: never; Returns: string }
      generate_referral_code: {
        Args: { nurse_initials?: string }
        Returns: string
      }
      get_dashboard_stats: { Args: never; Returns: Json }
      get_otp_for_request: {
        Args: { p_request_id: string }
        Returns: {
          created_at: string
          email: string
          expires_at: string
          otp_hash: string
          otp_id: string
          verified: boolean
        }[]
      }
      get_otp_value: {
        Args: { p_otp_type?: string; p_request_id: string }
        Returns: {
          consumed_at: string
          email: string
          expires_at: string
          hospital_id: string
          otp_type: string
          otp_value: string
          verified: boolean
        }[]
      }
      get_otp_values_batch: {
        Args: { p_request_ids: string[] }
        Returns: {
          authorization_id: string
          email: string
          expires_at: string
          otp_value: string
          verified: boolean
        }[]
      }
      get_referral_hospitals: {
        Args: never
        Returns: {
          code: string
          id: string
          name: string
          state: string
        }[]
      }
      get_referral_visibility_log: {
        Args: { p_request_id: string }
        Returns: {
          field: string
          value: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      heal_hospital_user_link: {
        Args: { p_email: string; p_user_id: string }
        Returns: {
          out_full_name: string
          out_role: string
        }[]
      }
      import_historical_codes: {
        Args: { _file_name: string; _mode?: string; _rows: Json }
        Returns: Json
      }
      is_admin: { Args: { user_id: string }; Returns: boolean }
      link_support_conversation_to_request: {
        Args: { _conversation_id: string; _request_id: string }
        Returns: Json
      }
      log_ai_feedback: {
        Args: {
          _conversation_id: string
          _escalate_to_human?: boolean
          _feedback?: string
          _message_id?: string
          _resolved?: boolean
        }
        Returns: Json
      }
      log_hospital_whatsapp_audit_event: {
        Args: {
          _action: string
          _contact_id: string
          _details?: Json
          _hospital_id: string
          _new_status?: string
          _old_status?: string
          _phone_number: string
        }
        Returns: string
      }
      mark_support_notifications_read: {
        Args: { _conversation_id: string }
        Returns: number
      }
      normalize_beneficiary_name: { Args: { _name: string }; Returns: string }
      normalize_legacy_code: { Args: { _value: string }; Returns: string }
      normalize_patient_phone: { Args: { p_phone: string }; Returns: string }
      normalize_whatsapp_phone: { Args: { _phone: string }; Returns: string }
      permanently_delete_authorization: {
        Args: { _request_id: string }
        Returns: Json
      }
      reconcile_historical_code: { Args: { _record: Json }; Returns: Json }
      record_failed_login: { Args: { p_email: string }; Returns: Json }
      recover_stale_whatsapp_processing: { Args: never; Returns: number }
      register_policy_email: {
        Args: { p_email: string; p_family_policy: string }
        Returns: Json
      }
      register_policy_phone: {
        Args: { p_family_policy: string; p_phone: string }
        Returns: Json
      }
      replace_nhis_beneficiaries: { Args: { _run_id: string }; Returns: Json }
      request_support_ticket_metadata: {
        Args: { _request_id: string }
        Returns: Json
      }
      reset_failed_login: { Args: { p_email: string }; Returns: Json }
      resolve_nhis_family_members: {
        Args: { _policy: string }
        Returns: {
          created_at: string
          dob: string | null
          first_name: string
          full_name: string
          gender: string | null
          hcp_code: string | null
          hcp_name: string | null
          id: string
          member_type: string
          plan_code: string | null
          policy_number: string
          surname: string
        }[]
        SetofOptions: {
          from: "*"
          to: "nhis_beneficiaries"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      resolve_whatsapp_authorization_context: {
        Args: {
          _message_id: string
          _patient_name: string
          _policy_number: string
        }
        Returns: Json
      }
      resolve_whatsapp_hospital_contact: {
        Args: { _phone: string }
        Returns: Json
      }
      review_knowledge_candidate: {
        Args: { _candidate_id: string; _review_note?: string; _status: string }
        Returns: {
          category: string
          confidence: number
          created_at: string
          created_by: string | null
          evidence: Json
          evidence_count: number
          expires_at: string | null
          first_observed_at: string
          id: string
          last_observed_at: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          summary: string
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "knowledge_candidates"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_approve_name_change: {
        Args: {
          p_new_name: string
          p_request_id: string
          p_target_user_id: string
        }
        Returns: undefined
      }
      rpc_delete_authorization_request: {
        Args: { p_reason: string; p_request_id: string }
        Returns: undefined
      }
      rpc_delete_user: {
        Args: { p_target_user_id: string }
        Returns: undefined
      }
      rpc_get_claims_analysis_summary: { Args: never; Returns: Json }
      rpc_hard_delete_authorization_request: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      rpc_link_user_to_hospital: {
        Args: { p_hospital_id: string; p_user_id: string }
        Returns: undefined
      }
      rpc_mark_message_read: {
        Args: { p_message_id: string; p_user_id: string }
        Returns: undefined
      }
      rpc_reject_name_change: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      rpc_remove_claim_from_batch: {
        Args: { p_claim_id: string }
        Returns: undefined
      }
      rpc_request_deletion_approval: {
        Args: { p_reason: string; p_request_id: string }
        Returns: undefined
      }
      rpc_resolve_delete_request: {
        Args: { p_action: string; p_request_id: string }
        Returns: undefined
      }
      rpc_submit_hospital_claim: {
        Args: { p_claim_id: string }
        Returns: undefined
      }
      rpc_toggle_hospital_status: {
        Args: { p_hospital_id: string; p_is_active: boolean }
        Returns: undefined
      }
      rpc_toggle_user_access: {
        Args: { p_is_active: boolean; p_target_user_id: string }
        Returns: undefined
      }
      rpc_update_announcement: {
        Args: { p_announcement_id: string; p_payload: Json }
        Returns: undefined
      }
      rpc_update_claim_payment_status: {
        Args: { p_claim_id: string; p_status: string }
        Returns: undefined
      }
      rpc_update_claim_status: {
        Args: { p_claim_id: string; p_details: Json; p_status: string }
        Returns: undefined
      }
      rpc_update_hospital_profile: {
        Args: { p_hospital_id: string; p_payload: Json }
        Returns: undefined
      }
      rpc_update_payment_batch: {
        Args: { p_batch_id: string; p_payload: Json }
        Returns: undefined
      }
      rpc_update_support_conversation_status: {
        Args: { p_conversation_id: string; p_status: string }
        Returns: undefined
      }
      rpc_update_user_role: {
        Args: { p_role: string; p_target_user_id: string }
        Returns: undefined
      }
      run_learning_observation: { Args: { _lookback?: string }; Returns: Json }
      safe_parse_date: { Args: { _val: string }; Returns: string }
      send_ai_support_message: {
        Args: { _body: string; _conversation_id: string; _intent?: string }
        Returns: Json
      }
      send_support_message: {
        Args: {
          _attachment_name?: string
          _attachment_url?: string
          _body: string
          _conversation_id: string
          _is_internal?: boolean
        }
        Returns: Json
      }
      split_family_policy: {
        Args: { _policy: string }
        Returns: {
          base_policy: string
          is_family_policy: boolean
          member_suffix: string
        }[]
      }
      support_conversation_visible_to_current_user: {
        Args: {
          _assigned_to: string
          _created_by: string
          _department: string
          _hospital_user_id: string
          _nurse_user_id: string
          _tags: string[]
        }
        Returns: boolean
      }
      support_ticket_number: { Args: never; Returns: string }
      transfer_referral: { Args: { p_request_id: string }; Returns: Json }
      unlock_account_after_reset: { Args: { p_email: string }; Returns: Json }
      validate_policy_email: {
        Args: { p_email: string; p_family_policy: string }
        Returns: Json
      }
      validate_policy_phone: {
        Args: { p_family_policy: string; p_phone: string }
        Returns: Json
      }
      verify_nhis: {
        Args: { _patient_name?: string; _policy_number: string }
        Returns: Json
      }
      verify_otp:
        | {
            Args: { p_otp_plaintext: string; p_request_id: string }
            Returns: Json
          }
        | {
            Args: {
              p_hospital_id?: string
              p_otp_plaintext: string
              p_otp_type?: string
              p_request_id: string
            }
            Returns: Json
          }
      verify_policy: { Args: { _policy_number: string }; Returns: Json }
      wipe_historical_codes: { Args: never; Returns: undefined }
      write_audit_log: {
        Args: {
          _action: string
          _actor_user_id?: string
          _details?: Json
          _device_info?: string
          _entity_id?: string
          _entity_type?: string
          _ip_address?: unknown
          _new_values?: Json
          _previous_values?: Json
          _reason?: string
          _severity?: string
        }
        Returns: string
      }
    }
    Enums: {
      app_role:
        | "nurse"
        | "hospital"
        | "admin"
        | "claims"
        | "bureau"
        | "support"
        | "finance"
        | "utilization_manager"
        | "utilization_manager_lead"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: [
        "nurse",
        "hospital",
        "admin",
        "claims",
        "bureau",
        "support",
        "finance",
        "utilization_manager",
        "utilization_manager_lead",
      ],
    },
  },
} as const
