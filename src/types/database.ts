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
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          display_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          display_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
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

// Extended types with relations
export type PaymentWithDetails = Payment & {
  profiles: Profile;
  categories: Category | null;
  payment_splits: (PaymentSplit & { profiles: Profile })[];
};

export type GroupWithMembers = Group & {
  group_members: (GroupMember & { profiles: Profile })[];
};
