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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      categories: {
        Row: {
          color: string | null
          created_at: string
          group_id: string | null
          icon: string | null
          id: string
          is_default: boolean | null
          name: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          group_id?: string | null
          icon?: string | null
          id?: string
          is_default?: boolean | null
          name: string
        }
        Update: {
          color?: string | null
          created_at?: string
          group_id?: string | null
          icon?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      demo_sessions: {
        Row: {
          created_at: string
          expires_at: string
          group_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          group_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          group_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "demo_sessions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demo_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_members: {
        Row: {
          created_at: string
          group_id: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          created_at: string
          description: string | null
          id: string
          invite_code: string
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          invite_code?: string
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          invite_code?: string
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "groups_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_splits: {
        Row: {
          amount: number
          created_at: string
          id: string
          is_paid: boolean
          payment_id: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          is_paid?: boolean
          payment_id: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          is_paid?: boolean
          payment_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_splits_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_splits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          category_id: string | null
          created_at: string
          description: string
          group_id: string
          id: string
          payer_id: string
          payment_date: string
          settlement_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          category_id?: string | null
          created_at?: string
          description: string
          group_id: string
          id?: string
          payer_id: string
          payment_date: string
          settlement_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          category_id?: string | null
          created_at?: string
          description?: string
          group_id?: string
          id?: string
          payer_id?: string
          payment_date?: string
          settlement_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_payer_id_fkey"
            columns: ["payer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "settlement_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          is_demo: boolean
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          is_demo?: boolean
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          is_demo?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      recurring_rule_splits: {
        Row: {
          amount: number | null
          created_at: string
          id: string
          percentage: number | null
          rule_id: string
          user_id: string
        }
        Insert: {
          amount?: number | null
          created_at?: string
          id?: string
          percentage?: number | null
          rule_id: string
          user_id: string
        }
        Update: {
          amount?: number | null
          created_at?: string
          id?: string
          percentage?: number | null
          rule_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_rule_splits_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "recurring_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_rule_splits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_rules: {
        Row: {
          category_id: string | null
          created_at: string
          day_of_month: number
          default_amount: number | null
          default_payer_id: string
          description: string
          group_id: string
          id: string
          is_active: boolean
          is_variable: boolean
          split_type: string
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          day_of_month: number
          default_amount?: number | null
          default_payer_id: string
          description: string
          group_id: string
          id?: string
          is_active?: boolean
          is_variable?: boolean
          split_type?: string
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          day_of_month?: number
          default_amount?: number | null
          default_payer_id?: string
          description?: string
          group_id?: string
          id?: string
          is_active?: boolean
          is_variable?: boolean
          split_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_rules_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_rules_default_payer_id_fkey"
            columns: ["default_payer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_rules_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      settlement_entries: {
        Row: {
          actual_amount: number | null
          category_id: string | null
          created_at: string
          description: string
          entry_type: string
          expected_amount: number | null
          filled_at: string | null
          filled_by: string | null
          id: string
          payer_id: string
          payment_date: string
          payment_id: string | null
          rule_id: string | null
          session_id: string
          source_payment_id: string | null
          split_type: string
          status: string
        }
        Insert: {
          actual_amount?: number | null
          category_id?: string | null
          created_at?: string
          description: string
          entry_type?: string
          expected_amount?: number | null
          filled_at?: string | null
          filled_by?: string | null
          id?: string
          payer_id: string
          payment_date: string
          payment_id?: string | null
          rule_id?: string | null
          session_id: string
          source_payment_id?: string | null
          split_type?: string
          status?: string
        }
        Update: {
          actual_amount?: number | null
          category_id?: string | null
          created_at?: string
          description?: string
          entry_type?: string
          expected_amount?: number | null
          filled_at?: string | null
          filled_by?: string | null
          id?: string
          payer_id?: string
          payment_date?: string
          payment_id?: string | null
          rule_id?: string | null
          session_id?: string
          source_payment_id?: string | null
          split_type?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "settlement_entries_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_entries_filled_by_fkey"
            columns: ["filled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_entries_payer_id_fkey"
            columns: ["payer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_entries_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_entries_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "recurring_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_entries_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "settlement_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_entries_source_payment_id_fkey"
            columns: ["source_payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      settlement_entry_splits: {
        Row: {
          amount: number
          created_at: string
          entry_id: string
          id: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          entry_id: string
          id?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          entry_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "settlement_entry_splits_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "settlement_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_entry_splits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      settlement_sessions: {
        Row: {
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          created_by: string
          group_id: string
          id: string
          is_zero_settlement: boolean
          net_transfers: Json | null
          payment_reported_at: string | null
          payment_reported_by: string | null
          period_end: string
          period_start: string
          settled_at: string | null
          settled_by: string | null
          status: string
        }
        Insert: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by: string
          group_id: string
          id?: string
          is_zero_settlement?: boolean
          net_transfers?: Json | null
          payment_reported_at?: string | null
          payment_reported_by?: string | null
          period_end: string
          period_start: string
          settled_at?: string | null
          settled_by?: string | null
          status?: string
        }
        Update: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string
          group_id?: string
          id?: string
          is_zero_settlement?: boolean
          net_transfers?: Json | null
          payment_reported_at?: string | null
          payment_reported_by?: string | null
          period_end?: string
          period_start?: string
          settled_at?: string | null
          settled_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "settlement_sessions_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_sessions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_sessions_payment_reported_by_fkey"
            columns: ["payment_reported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_sessions_settled_by_fkey"
            columns: ["settled_by"]
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
      anonymize_user: { Args: { p_user_id: string }; Returns: boolean }
      confirm_settlement: {
        Args: { p_session_id: string; p_user_id: string }
        Returns: number
      }
      confirm_settlement_receipt: {
        Args: { p_session_id: string; p_user_id: string }
        Returns: number
      }
      create_demo_bot_partner: {
        Args: { p_demo_user_id: string; p_group_id: string }
        Returns: Json
      }
      delete_payment_splits_for_payer: {
        Args: { p_payment_id: string; p_user_id: string }
        Returns: number
      }
      generate_settlement_entries: {
        Args: { p_session_id: string; p_user_id: string }
        Returns: number
      }
      get_actual_day_of_month: {
        Args: { p_day_of_month: number; p_month: number; p_year: number }
        Returns: number
      }
      get_last_day_of_month: {
        Args: { p_month: number; p_year: number }
        Returns: number
      }
      get_payment_group_id: { Args: { _payment_id: string }; Returns: string }
      get_settlement_period_suggestion: {
        Args: { p_group_id: string; p_user_id: string }
        Returns: {
          last_confirmed_end: string
          oldest_unsettled_date: string
          suggested_end: string
          suggested_start: string
          unsettled_count: number
        }[]
      }
      is_group_member: {
        Args: { _group_id: string; _user_id: string }
        Returns: boolean
      }
      is_group_owner: {
        Args: { _group_id: string; _user_id: string }
        Returns: boolean
      }
      is_payment_payer: {
        Args: { _payment_id: string; _user_id: string }
        Returns: boolean
      }
      replace_payment_splits: {
        Args: { p_payment_id: string; p_splits: Json; p_user_id: string }
        Returns: number
      }
      replace_settlement_entry_splits: {
        Args: { p_entry_id: string; p_splits: Json; p_user_id: string }
        Returns: number
      }
      report_settlement_payment: {
        Args: { p_session_id: string; p_user_id: string }
        Returns: number
      }
      settle_consolidated_sessions: {
        Args: { p_session_ids: string[]; p_user_id: string }
        Returns: number
      }
      update_settlement_entry: {
        Args: {
          p_actual_amount: number
          p_entry_id: string
          p_payer_id?: string
          p_payment_date?: string
          p_status?: string
          p_user_id: string
        }
        Returns: number
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
