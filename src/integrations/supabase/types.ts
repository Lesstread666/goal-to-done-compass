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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      chat_group_members: {
        Row: {
          group_id: string
          joined_at: string
          last_read_id: number
          user_id: string
        }
        Insert: {
          group_id: string
          joined_at?: string
          last_read_id?: number
          user_id: string
        }
        Update: {
          group_id?: string
          joined_at?: string
          last_read_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "chat_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_group_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_group_messages: {
        Row: {
          attachment_name: string | null
          attachment_path: string | null
          attachment_size: number | null
          attachment_type: string | null
          body: string
          created_at: string
          group_id: string
          id: number
          kind: string
          sender_id: string
        }
        Insert: {
          attachment_name?: string | null
          attachment_path?: string | null
          attachment_size?: number | null
          attachment_type?: string | null
          body?: string
          created_at?: string
          group_id: string
          id?: never
          kind?: string
          sender_id?: string
        }
        Update: {
          attachment_name?: string | null
          attachment_path?: string | null
          attachment_size?: number | null
          attachment_type?: string | null
          body?: string
          created_at?: string
          group_id?: string
          id?: never
          kind?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_group_messages_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "chat_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_group_reactions: {
        Row: {
          created_at: string
          emoji: string
          group_id: string
          message_id: number
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          group_id: string
          message_id: number
          user_id?: string
        }
        Update: {
          created_at?: string
          emoji?: string
          group_id?: string
          message_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_group_reactions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "chat_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_group_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_group_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_groups: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
        }
        Relationships: []
      }
      deleted_tasks: {
        Row: {
          assignee: string | null
          deadline: string | null
          deleted_at: string
          deleted_by: string | null
          description: string
          evaluated: boolean
          goal_id: string
          id: string
          position: number | null
          priority: string
          restored_at: string | null
          restored_task_id: string | null
          status: string
          task_id: string
          title: string
        }
        Insert: {
          assignee?: string | null
          deadline?: string | null
          deleted_at?: string
          deleted_by?: string | null
          description?: string
          evaluated?: boolean
          goal_id: string
          id?: string
          position?: number | null
          priority?: string
          restored_at?: string | null
          restored_task_id?: string | null
          status?: string
          task_id: string
          title: string
        }
        Update: {
          assignee?: string | null
          deadline?: string | null
          deleted_at?: string
          deleted_by?: string | null
          description?: string
          evaluated?: boolean
          goal_id?: string
          id?: string
          position?: number | null
          priority?: string
          restored_at?: string | null
          restored_task_id?: string | null
          status?: string
          task_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "deleted_tasks_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_invites: {
        Row: {
          created_at: string
          goal_id: string
          id: string
          invitee_id: string
          inviter_id: string
          status: string
        }
        Insert: {
          created_at?: string
          goal_id: string
          id?: string
          invitee_id: string
          inviter_id?: string
          status?: string
        }
        Update: {
          created_at?: string
          goal_id?: string
          id?: string
          invitee_id?: string
          inviter_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "goal_invites_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_members: {
        Row: {
          created_at: string
          goal_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          goal_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          goal_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goal_members_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      goals: {
        Row: {
          created_at: string
          deadline: string | null
          description: string
          id: string
          participants: Json
          pending_invitees: Json
          requirements: string
          status: string
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deadline?: string | null
          description?: string
          id?: string
          participants?: Json
          pending_invitees?: Json
          requirements?: string
          status?: string
          title: string
          user_id?: string
        }
        Update: {
          created_at?: string
          deadline?: string | null
          description?: string
          id?: string
          participants?: Json
          pending_invitees?: Json
          requirements?: string
          status?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          body: string
          created_at: string
          id: string
          read_at: string | null
          recipient_id: string
          sender_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          read_at?: string | null
          recipient_id: string
          sender_id?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          read_at?: string | null
          recipient_id?: string
          sender_id?: string
        }
        Relationships: []
      }
      plan_chat: {
        Row: {
          content: string
          created_at: string
          goal_id: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          goal_id: string
          id?: string
          role: string
          user_id?: string
        }
        Update: {
          content?: string
          created_at?: string
          goal_id?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_chat_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_proposals: {
        Row: {
          created_at: string
          goal_id: string
          id: string
          op: Json
          source: string
          status: string
          summary: string
          user_id: string
        }
        Insert: {
          created_at?: string
          goal_id: string
          id?: string
          op: Json
          source?: string
          status?: string
          summary?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          goal_id?: string
          id?: string
          op?: Json
          source?: string
          status?: string
          summary?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_proposals_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_reviews: {
        Row: {
          created_at: string
          criteria: Json
          goal_id: string
          id: string
          problems: Json
          recommendations: Json
          score: number
          summary: string
          user_id: string
        }
        Insert: {
          created_at?: string
          criteria?: Json
          goal_id: string
          id?: string
          problems?: Json
          recommendations?: Json
          score: number
          summary?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          criteria?: Json
          goal_id?: string
          id?: string
          problems?: Json
          recommendations?: Json
          score?: number
          summary?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_reviews_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string
          created_at: string
          id: string
          username: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string
          created_at?: string
          id: string
          username: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string
          created_at?: string
          id?: string
          username?: string
        }
        Relationships: []
      }
      project_assessments: {
        Row: {
          checked_at: string
          fingerprint: string
          goal_id: string
          status: string
          summary: string
          uncertainty: string
        }
        Insert: {
          checked_at?: string
          fingerprint?: string
          goal_id: string
          status?: string
          summary?: string
          uncertainty?: string
        }
        Update: {
          checked_at?: string
          fingerprint?: string
          goal_id?: string
          status?: string
          summary?: string
          uncertainty?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_assessments_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: true
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      project_chat_reads: {
        Row: {
          goal_id: string
          last_read_id: number
          user_id: string
        }
        Insert: {
          goal_id: string
          last_read_id?: number
          user_id?: string
        }
        Update: {
          goal_id?: string
          last_read_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_chat_reads_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      project_insights: {
        Row: {
          created_at: string
          dedupe_key: string
          deleted_id: string | null
          explanation: string
          from_priority: string | null
          goal_id: string
          id: string
          kind: string
          proposal: Json | null
          resolved_at: string | null
          severity: string
          status: string
          suggested_deadline: string | null
          task_id: string | null
          task_title: string
          title: string
          to_priority: string | null
        }
        Insert: {
          created_at?: string
          dedupe_key: string
          deleted_id?: string | null
          explanation?: string
          from_priority?: string | null
          goal_id: string
          id?: string
          kind: string
          proposal?: Json | null
          resolved_at?: string | null
          severity?: string
          status?: string
          suggested_deadline?: string | null
          task_id?: string | null
          task_title?: string
          title: string
          to_priority?: string | null
        }
        Update: {
          created_at?: string
          dedupe_key?: string
          deleted_id?: string | null
          explanation?: string
          from_priority?: string | null
          goal_id?: string
          id?: string
          kind?: string
          proposal?: Json | null
          resolved_at?: string | null
          severity?: string
          status?: string
          suggested_deadline?: string | null
          task_id?: string | null
          task_title?: string
          title?: string
          to_priority?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_insights_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      project_messages: {
        Row: {
          body: string
          created_at: string
          goal_id: string
          id: number
          sender_id: string
        }
        Insert: {
          body: string
          created_at?: string
          goal_id: string
          id?: never
          sender_id?: string
        }
        Update: {
          body?: string
          created_at?: string
          goal_id?: string
          id?: never
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_messages_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assignee: string | null
          completed_at: string | null
          created_at: string
          deadline: string | null
          description: string
          goal_id: string
          id: string
          manually_edited: boolean
          position: number
          priority: string
          status: string
          title: string
          user_id: string
        }
        Insert: {
          assignee?: string | null
          completed_at?: string | null
          created_at?: string
          deadline?: string | null
          description?: string
          goal_id: string
          id?: string
          manually_edited?: boolean
          position?: number
          priority?: string
          status?: string
          title: string
          user_id?: string
        }
        Update: {
          assignee?: string | null
          completed_at?: string | null
          created_at?: string
          deadline?: string | null
          description?: string
          goal_id?: string
          id?: string
          manually_edited?: boolean
          position?: number
          priority?: string
          status?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      team_contacts: {
        Row: {
          contact_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          user_id?: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_contacts_contact_id_fkey"
            columns: ["contact_id"]
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
      accept_goal_invite: { Args: { p_invite_id: string }; Returns: string }
      add_group_member: {
        Args: { p_group: string; p_user: string }
        Returns: undefined
      }
      can_see_profile: { Args: { p_id: string }; Returns: boolean }
      create_group_chat: {
        Args: { p_members: string[]; p_name: string }
        Returns: string
      }
      edit_goal_team: {
        Args: {
          p_assignments: Json
          p_deadline: string
          p_description: string
          p_goal_id: string
          p_participants: Json
          p_title: string
        }
        Returns: undefined
      }
      is_chat_member: { Args: { p_group: string }; Returns: boolean }
      is_goal_member: { Args: { p_goal_id: string }; Returns: boolean }
      leave_group_chat: { Args: { p_group: string }; Returns: undefined }
      mark_group_read: {
        Args: { p_group: string; p_message_id: number }
        Returns: undefined
      }
      mark_messages_read: { Args: { p_sender: string }; Returns: undefined }
      mark_project_chat_read: {
        Args: { p_goal_id: string; p_message_id: number }
        Returns: undefined
      }
      my_group_chats: {
        Args: never
        Returns: {
          created_at: string
          id: string
          last_at: string
          last_body: string
          last_has_attachment: boolean
          last_kind: string
          last_sender: string
          member_count: number
          name: string
          owner_id: string
          unread: number
        }[]
      }
      my_pending_invites: {
        Args: never
        Returns: {
          created_at: string
          goal_id: string
          goal_title: string
          id: string
          inviter_avatar: string
          inviter_username: string
        }[]
      }
      profile_by_username: {
        Args: { p_username: string }
        Returns: {
          avatar_url: string | null
          bio: string
          created_at: string
          id: string
          username: string
        }[]
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      project_chat_unread: { Args: { p_goal_id: string }; Returns: number }
      remove_group_member: {
        Args: { p_group: string; p_user: string }
        Returns: undefined
      }
      rename_group_chat: {
        Args: { p_group: string; p_name: string }
        Returns: undefined
      }
      restore_deleted_task: {
        Args: { p_deadline: string; p_deleted_id: string }
        Returns: string
      }
      search_profiles: {
        Args: { p_term: string }
        Returns: {
          avatar_url: string | null
          bio: string
          created_at: string
          id: string
          username: string
        }[]
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      username_available: { Args: { p_username: string }; Returns: boolean }
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
