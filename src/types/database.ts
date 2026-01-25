export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          display_name: string | null;
          avatar_url: string | null;
          is_demo: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          display_name?: string | null;
          avatar_url?: string | null;
          is_demo?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          display_name?: string | null;
          avatar_url?: string | null;
          is_demo?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      groups: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          owner_id: string;
          invite_code: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          owner_id: string;
          invite_code?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          owner_id?: string;
          invite_code?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "groups_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      group_members: {
        Row: {
          id: string;
          group_id: string;
          user_id: string;
          role: "owner" | "member";
          joined_at: string;
        };
        Insert: {
          id?: string;
          group_id: string;
          user_id: string;
          role?: "owner" | "member";
          joined_at?: string;
        };
        Update: {
          id?: string;
          group_id?: string;
          user_id?: string;
          role?: "owner" | "member";
          joined_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "group_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      categories: {
        Row: {
          id: string;
          name: string;
          icon: string | null;
          color: string | null;
          group_id: string | null;
          is_default: boolean;
        };
        Insert: {
          id?: string;
          name: string;
          icon?: string | null;
          color?: string | null;
          group_id?: string | null;
          is_default?: boolean;
        };
        Update: {
          id?: string;
          name?: string;
          icon?: string | null;
          color?: string | null;
          group_id?: string | null;
          is_default?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "categories_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          }
        ];
      };
      payments: {
        Row: {
          id: string;
          group_id: string;
          payer_id: string;
          amount: number;
          description: string;
          category_id: string | null;
          payment_date: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          group_id: string;
          payer_id: string;
          amount: number;
          description: string;
          category_id?: string | null;
          payment_date: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          group_id?: string;
          payer_id?: string;
          amount?: number;
          description?: string;
          category_id?: string | null;
          payment_date?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payments_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_payer_id_fkey";
            columns: ["payer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          }
        ];
      };
      payment_splits: {
        Row: {
          id: string;
          payment_id: string;
          user_id: string;
          amount: number;
        };
        Insert: {
          id?: string;
          payment_id: string;
          user_id: string;
          amount: number;
        };
        Update: {
          id?: string;
          payment_id?: string;
          user_id?: string;
          amount?: number;
        };
        Relationships: [
          {
            foreignKeyName: "payment_splits_payment_id_fkey";
            columns: ["payment_id"];
            isOneToOne: false;
            referencedRelation: "payments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payment_splits_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      settlements: {
        Row: {
          id: string;
          group_id: string;
          from_user: string;
          to_user: string;
          amount: number;
          settled_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          group_id: string;
          from_user: string;
          to_user: string;
          amount: number;
          settled_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          group_id?: string;
          from_user?: string;
          to_user?: string;
          amount?: number;
          settled_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "settlements_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "settlements_from_user_fkey";
            columns: ["from_user"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "settlements_to_user_fkey";
            columns: ["to_user"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      demo_sessions: {
        Row: {
          id: string;
          user_id: string;
          group_id: string;
          expires_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          group_id: string;
          expires_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          group_id?: string;
          expires_at?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "demo_sessions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "demo_sessions_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}

// Utility types for easier access
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Group = Database["public"]["Tables"]["groups"]["Row"];
export type GroupMember = Database["public"]["Tables"]["group_members"]["Row"];
export type Category = Database["public"]["Tables"]["categories"]["Row"];
export type Payment = Database["public"]["Tables"]["payments"]["Row"];
export type PaymentSplit = Database["public"]["Tables"]["payment_splits"]["Row"];
export type Settlement = Database["public"]["Tables"]["settlements"]["Row"];
export type DemoSession = Database["public"]["Tables"]["demo_sessions"]["Row"];

// Insert types
export type ProfileInsert = Database["public"]["Tables"]["profiles"]["Insert"];
export type GroupInsert = Database["public"]["Tables"]["groups"]["Insert"];
export type GroupMemberInsert = Database["public"]["Tables"]["group_members"]["Insert"];
export type CategoryInsert = Database["public"]["Tables"]["categories"]["Insert"];
export type PaymentInsert = Database["public"]["Tables"]["payments"]["Insert"];
export type PaymentSplitInsert = Database["public"]["Tables"]["payment_splits"]["Insert"];
export type SettlementInsert = Database["public"]["Tables"]["settlements"]["Insert"];
export type DemoSessionInsert = Database["public"]["Tables"]["demo_sessions"]["Insert"];

// Extended types with relations
export type PaymentWithDetails = Payment & {
  profiles: Profile;
  categories: Category | null;
  payment_splits: (PaymentSplit & { profiles: Profile })[];
};

export type GroupWithMembers = Group & {
  group_members: (GroupMember & { profiles: Profile })[];
};
