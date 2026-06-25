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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
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
          authorization_code: string | null
          clinical_notes: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          diagnosis: string
          doctor_name: string | null
          hospital_id: string | null
          hospital_name: string | null
          id: string
          patient_name: string
          patient_phone: string | null
          policy_number: string
          request_id: string | null
          source: string | null
          status: string
          submitted_by: string | null
          treatment: string
          updated_at: string
          urgency: string | null
          whatsapp_raw_message: string | null
        }
        Insert: {
          authorization_code?: string | null
          clinical_notes?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          diagnosis: string
          doctor_name?: string | null
          hospital_id?: string | null
          hospital_name?: string | null
          id?: string
          patient_name: string
          patient_phone?: string | null
          policy_number: string
          request_id?: string | null
          source?: string | null
          status?: string
          submitted_by?: string | null
          treatment: string
          updated_at?: string
          urgency?: string | null
          whatsapp_raw_message?: string | null
        }
        Update: {
          authorization_code?: string | null
          clinical_notes?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          diagnosis?: string
          doctor_name?: string | null
          hospital_id?: string | null
          hospital_name?: string | null
          id?: string
          patient_name?: string
          patient_phone?: string | null
          policy_number?: string
          request_id?: string | null
          source?: string | null
          status?: string
          submitted_by?: string | null
          treatment?: string
          updated_at?: string
          urgency?: string | null
          whatsapp_raw_message?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "authorization_requests_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
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
      nhis_beneficiaries: {
        Row: {
          created_at: string
          dob: string | null
          first_name: string
          full_name: string
          gender: string | null
          hcp_code: string | null
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
          id?: string
          member_type?: string
          plan_code?: string | null
          policy_number?: string
          surname?: string
        }
        Relationships: []
      }
      registry_history: {
        Row: {
          authorization_code: string | null
          created_at: string
          date: string | null
          decided_at: string | null
          diagnosis: string | null
          hospital_name: string | null
          id: string
          note: string | null
          patient_name: string | null
          policy_number: string
          raw_payload: Json | null
          request_id: string
          requesting_officer: string | null
          source: string | null
          status: string | null
          treatment: string | null
          updated_at: string
        }
        Insert: {
          authorization_code?: string | null
          created_at?: string
          date?: string | null
          decided_at?: string | null
          diagnosis?: string | null
          hospital_name?: string | null
          id?: string
          note?: string | null
          patient_name?: string | null
          policy_number: string
          raw_payload?: Json | null
          request_id: string
          requesting_officer?: string | null
          source?: string | null
          status?: string | null
          treatment?: string | null
          updated_at?: string
        }
        Update: {
          authorization_code?: string | null
          created_at?: string
          date?: string | null
          decided_at?: string | null
          diagnosis?: string | null
          hospital_name?: string | null
          id?: string
          note?: string | null
          patient_name?: string | null
          policy_number?: string
          raw_payload?: Json | null
          request_id?: string
          requesting_officer?: string | null
          source?: string | null
          status?: string | null
          treatment?: string | null
          updated_at?: string
        }
        Relationships: []
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
      user_roles: {
        Row: {
          access_status: string
          email: string | null
          full_name: string | null
          hospital_id: string | null
          id: string
          phone: string | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          access_status?: string
          email?: string | null
          full_name?: string | null
          hospital_id?: string | null
          id?: string
          phone?: string | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          access_status?: string
          email?: string | null
          full_name?: string | null
          hospital_id?: string | null
          id?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_auth_code: { Args: never; Returns: string }
      get_referral_hospitals: {
        Args: never
        Returns: {
          code: string
          id: string
          name: string
          state: string | null
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      verify_nhis: {
        Args: { _patient_name?: string; _policy_number: string }
        Returns: Json
      }
      verify_policy: { Args: { _policy_number: string }; Returns: Json }
    }
    Enums: {
        app_role: "nurse" | "hospital" | "claims" | "admin" | "finance"
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
    Enums: {
        app_role: ["nurse", "hospital", "claims", "admin", "finance"],
    },
  },
} as const
