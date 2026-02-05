export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
      categories: {
        Row: {
          color: string | null
          group_id: string | null
          icon: string | null
          id: string
          is_default: boolean
          name: string
        }
        Insert: {
          color?: string | null
          group_id?: string | null
          icon?: string | null
          id?: string
          is_default?: boolean
          name: string
        }
        Update: {
          color?: string | null
          group_id?: string | null
          icon?: string | null
          id?: string
          is_default?: boolean
          name?: string
        }
        Relationships: []
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
          group_id: string
          id: string
          joined_at: string
          role: string
          user_id: string
        }
        Insert: {
          group_id: string
          id?: string
          joined_at?: string
          role: string
          user_id: string
        }
        Update: {
          group_id?: string
          id?: string
          joined_at?: string
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
            foreignKeyName: "groups_created_by_fkey"
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
          id: string
          payment_id: string
          user_id: string
        }
        Insert: {
          amount: number
          id?: string
          payment_id: string
          user_id: string
        }
        Update: {
          amount?: number
          id?: string
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
            foreignKeyName: "payments_paid_by_fkey"
            columns: ["payer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string
          id: string
          is_demo: boolean
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email: string
          id?: string
          is_demo?: boolean
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string
          id?: string
          is_demo?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      recurring_rules: {
        Row: {
          id: string
          group_id: string
          category_id: string | null
          description: string
          default_amount: number | null
          is_variable: boolean
          day_of_month: number
          default_payer_id: string
          split_type: string
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          group_id: string
          category_id?: string | null
          description: string
          default_amount?: number | null
          is_variable?: boolean
          day_of_month: number
          default_payer_id: string
          split_type?: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          group_id?: string
          category_id?: string | null
          description?: string
          default_amount?: number | null
          is_variable?: boolean
          day_of_month?: number
          default_payer_id?: string
          split_type?: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_rules_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
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
        ]
      }
      recurring_rule_splits: {
        Row: {
          id: string
          rule_id: string
          user_id: string
          amount: number | null
          percentage: number | null
          created_at: string
        }
        Insert: {
          id?: string
          rule_id: string
          user_id: string
          amount?: number | null
          percentage?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          rule_id?: string
          user_id?: string
          amount?: number | null
          percentage?: number | null
          created_at?: string
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
      settlement_sessions: {
        Row: {
          id: string
          group_id: string
          period_start: string
          period_end: string
          status: string
          created_by: string
          created_at: string
          confirmed_at: string | null
          confirmed_by: string | null
        }
        Insert: {
          id?: string
          group_id: string
          period_start: string
          period_end: string
          status?: string
          created_by: string
          created_at?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
        }
        Update: {
          id?: string
          group_id?: string
          period_start?: string
          period_end?: string
          status?: string
          created_by?: string
          created_at?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "settlement_sessions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
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
            foreignKeyName: "settlement_sessions_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      settlement_entries: {
        Row: {
          id: string
          session_id: string
          rule_id: string | null
          payment_id: string | null
          description: string
          category_id: string | null
          expected_amount: number | null
          actual_amount: number | null
          payer_id: string
          payment_date: string
          status: string
          split_type: string
          filled_by: string | null
          filled_at: string | null
          created_at: string
          entry_type: string
          source_payment_id: string | null
        }
        Insert: {
          id?: string
          session_id: string
          rule_id?: string | null
          payment_id?: string | null
          description: string
          category_id?: string | null
          expected_amount?: number | null
          actual_amount?: number | null
          payer_id: string
          payment_date: string
          status?: string
          split_type?: string
          filled_by?: string | null
          filled_at?: string | null
          created_at?: string
          entry_type?: string
          source_payment_id?: string | null
        }
        Update: {
          id?: string
          session_id?: string
          rule_id?: string | null
          payment_id?: string | null
          description?: string
          category_id?: string | null
          expected_amount?: number | null
          actual_amount?: number | null
          payer_id?: string
          payment_date?: string
          status?: string
          split_type?: string
          filled_by?: string | null
          filled_at?: string | null
          created_at?: string
          entry_type?: string
          source_payment_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "settlement_entries_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "settlement_sessions"
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
            foreignKeyName: "settlement_entries_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_entries_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
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
            foreignKeyName: "settlement_entries_filled_by_fkey"
            columns: ["filled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          id: string
          entry_id: string
          user_id: string
          amount: number
          created_at: string
        }
        Insert: {
          id?: string
          entry_id: string
          user_id: string
          amount: number
          created_at?: string
        }
        Update: {
          id?: string
          entry_id?: string
          user_id?: string
          amount?: number
          created_at?: string
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
      settlements: {
        Row: {
          amount: number
          created_at: string
          from_user: string
          group_id: string
          id: string
          settled_at: string | null
          to_user: string
        }
        Insert: {
          amount: number
          created_at?: string
          from_user: string
          group_id: string
          id?: string
          settled_at?: string | null
          to_user: string
        }
        Update: {
          amount?: number
          created_at?: string
          from_user?: string
          group_id?: string
          id?: string
          settled_at?: string | null
          to_user?: string
        }
        Relationships: [
          {
            foreignKeyName: "settlements_from_user_fkey"
            columns: ["from_user"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_to_user_fkey"
            columns: ["to_user"]
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
      calculate_user_balance: {
        Args: { p_group_id: string; p_user_id: string }
        Returns: number
      }
      confirm_settlement: {
        Args: { p_session_id: string; p_user_id: string }
        Returns: number
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
        Args: { p_day_of_month: number; p_year: number; p_month: number }
        Returns: number
      }
      get_last_day_of_month: {
        Args: { p_year: number; p_month: number }
        Returns: number
      }
      get_payment_group_id: { Args: { _payment_id: string }; Returns: string }
      get_settlement_period_suggestion: {
        Args: { p_group_id: string; p_user_id: string }
        Returns: {
          suggested_start: string
          suggested_end: string
          oldest_unsettled_date: string | null
          last_confirmed_end: string | null
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
        Args: { p_entry_id: string; p_user_id: string; p_splits: Json }
        Returns: number
      }
      update_settlement_entry: {
        Args: {
          p_entry_id: string
          p_user_id: string
          p_actual_amount: number
          p_payer_id?: string
          p_payment_date?: string
          p_status?: string
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

