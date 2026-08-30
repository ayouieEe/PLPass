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
      attendance_records: {
        Row: {
          attendance_status: string
          checkout_verification_method: string | null
          created_at: string
          event_session_id: string
          id: string
          late_reason: string | null
          late_reason_category: string | null
          minutes_late: number | null
          recorded_at: string
          recorded_by: string | null
          remarks: string | null
          student_id: string
          time_in: string | null
          time_out: string | null
          updated_at: string
          verification_attempt_id: string | null
          verification_method: string
        }
        Insert: {
          attendance_status: string
          checkout_verification_method?: string | null
          created_at?: string
          event_session_id: string
          id?: string
          late_reason?: string | null
          late_reason_category?: string | null
          minutes_late?: number | null
          recorded_at?: string
          recorded_by?: string | null
          remarks?: string | null
          student_id: string
          time_in?: string | null
          time_out?: string | null
          updated_at?: string
          verification_attempt_id?: string | null
          verification_method: string
        }
        Update: {
          attendance_status?: string
          checkout_verification_method?: string | null
          created_at?: string
          event_session_id?: string
          id?: string
          late_reason?: string | null
          late_reason_category?: string | null
          minutes_late?: number | null
          recorded_at?: string
          recorded_by?: string | null
          remarks?: string | null
          student_id?: string
          time_in?: string | null
          time_out?: string | null
          updated_at?: string
          verification_attempt_id?: string | null
          verification_method?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_event_session_id_fkey"
            columns: ["event_session_id"]
            isOneToOne: false
            referencedRelation: "event_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_verification_attempt_id_fkey"
            columns: ["verification_attempt_id"]
            isOneToOne: true
            referencedRelation: "verification_attempts"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_request_attachments: {
        Row: {
          file_size_bytes: number
          id: string
          mime_type: string
          original_file_name: string
          request_id: string
          storage_bucket: string
          storage_object_path: string
          uploaded_at: string
        }
        Insert: {
          file_size_bytes: number
          id?: string
          mime_type: string
          original_file_name: string
          request_id: string
          storage_bucket: string
          storage_object_path: string
          uploaded_at?: string
        }
        Update: {
          file_size_bytes?: number
          id?: string
          mime_type?: string
          original_file_name?: string
          request_id?: string
          storage_bucket?: string
          storage_object_path?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_request_attachments_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "attendance_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_requests: {
        Row: {
          attendance_record_id: string
          created_at: string
          explanation: string
          id: string
          request_status: string
          requested_status: string
          review_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          student_id: string
          updated_at: string
        }
        Insert: {
          attendance_record_id: string
          created_at?: string
          explanation: string
          id?: string
          request_status?: string
          requested_status: string
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          student_id: string
          updated_at?: string
        }
        Update: {
          attendance_record_id?: string
          created_at?: string
          explanation?: string
          id?: string
          request_status?: string
          requested_status?: string
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_requests_attendance_record_id_fkey"
            columns: ["attendance_record_id"]
            isOneToOne: false
            referencedRelation: "attendance_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_requests_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          id: string
          metadata: Json
          target_id: string | null
          target_type: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          target_id?: string | null
          target_type: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          target_id?: string | null
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      credential_request_attachments: {
        Row: {
          file_size_bytes: number
          id: string
          mime_type: string
          original_file_name: string
          request_id: string
          storage_bucket: string
          storage_object_path: string
          uploaded_at: string
        }
        Insert: {
          file_size_bytes: number
          id?: string
          mime_type: string
          original_file_name: string
          request_id: string
          storage_bucket: string
          storage_object_path: string
          uploaded_at?: string
        }
        Update: {
          file_size_bytes?: number
          id?: string
          mime_type?: string
          original_file_name?: string
          request_id?: string
          storage_bucket?: string
          storage_object_path?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credential_request_attachments_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "credential_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      credential_requests: {
        Row: {
          created_at: string
          credential_type: string
          id: string
          reason: string
          request_status: string
          request_type: string
          review_remarks: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          student_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          credential_type: string
          id?: string
          reason: string
          request_status?: string
          request_type: string
          review_remarks?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          student_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          credential_type?: string
          id?: string
          reason?: string
          request_status?: string
          request_type?: string
          review_remarks?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credential_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credential_requests_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          created_at: string
          department_code: string
          department_name: string
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          department_code: string
          department_name: string
          id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          department_code?: string
          department_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      event_categories: {
        Row: {
          category_name: string
          created_at: string
          id: string
          updated_at: string
        }
        Insert: {
          category_name: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Update: {
          category_name?: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      event_email_outbox: {
        Row: {
          body: string
          created_at: string
          delivery_status: string
          error_message: string | null
          event_code: string
          event_id: string
          event_revision: string
          event_title: string
          id: string
          notification_type: string
          provider_message_id: string | null
          recipient_email: string
          recipient_profile_id: string
          sent_at: string | null
          subject: string
        }
        Insert: {
          body: string
          created_at?: string
          delivery_status?: string
          error_message?: string | null
          event_code: string
          event_id: string
          event_revision: string
          event_title: string
          id?: string
          notification_type: string
          provider_message_id?: string | null
          recipient_email: string
          recipient_profile_id: string
          sent_at?: string | null
          subject: string
        }
        Update: {
          body?: string
          created_at?: string
          delivery_status?: string
          error_message?: string | null
          event_code?: string
          event_id?: string
          event_revision?: string
          event_title?: string
          id?: string
          notification_type?: string
          provider_message_id?: string | null
          recipient_email?: string
          recipient_profile_id?: string
          sent_at?: string | null
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_email_outbox_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_email_outbox_recipient_profile_id_fkey"
            columns: ["recipient_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_feedback: {
        Row: {
          attendance_record_id: string
          comment: string | null
          event_id: string
          id: string
          sentiment_label: string | null
          sentiment_score: number | null
          student_id: string
          submitted_at: string
          updated_at: string
        }
        Insert: {
          attendance_record_id: string
          comment?: string | null
          event_id: string
          id?: string
          sentiment_label?: string | null
          sentiment_score?: number | null
          student_id: string
          submitted_at?: string
          updated_at?: string
        }
        Update: {
          attendance_record_id?: string
          comment?: string | null
          event_id?: string
          id?: string
          sentiment_label?: string | null
          sentiment_score?: number | null
          student_id?: string
          submitted_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_feedback_attendance_record_id_fkey"
            columns: ["attendance_record_id"]
            isOneToOne: true
            referencedRelation: "attendance_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_feedback_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_feedback_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      event_feedback_ratings: {
        Row: {
          created_at: string
          feedback_id: string
          id: string
          objective_id: string
          rating: number
        }
        Insert: {
          created_at?: string
          feedback_id: string
          id?: string
          objective_id: string
          rating: number
        }
        Update: {
          created_at?: string
          feedback_id?: string
          id?: string
          objective_id?: string
          rating?: number
        }
        Relationships: [
          {
            foreignKeyName: "event_feedback_ratings_feedback_id_fkey"
            columns: ["feedback_id"]
            isOneToOne: false
            referencedRelation: "event_feedback"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_feedback_ratings_objective_id_fkey"
            columns: ["objective_id"]
            isOneToOne: false
            referencedRelation: "event_objectives"
            referencedColumns: ["id"]
          },
        ]
      }
      event_objectives: {
        Row: {
          created_at: string
          event_id: string
          id: string
          objective_order: number
          objective_text: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          objective_order: number
          objective_text: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          objective_order?: number
          objective_text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_objectives_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_participants: {
        Row: {
          event_id: string
          id: string
          participant_status: string
          registered_at: string
          student_id: string
          updated_at: string
        }
        Insert: {
          event_id: string
          id?: string
          participant_status?: string
          registered_at?: string
          student_id: string
          updated_at?: string
        }
        Update: {
          event_id?: string
          id?: string
          participant_status?: string
          registered_at?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_participants_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_participants_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      event_resources: {
        Row: {
          created_at: string
          created_by: string
          event_id: string
          external_url: string | null
          id: string
          resource_title: string
          storage_bucket: string | null
          storage_object_path: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          event_id: string
          external_url?: string | null
          id?: string
          resource_title: string
          storage_bucket?: string | null
          storage_object_path?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          event_id?: string
          external_url?: string | null
          id?: string
          resource_title?: string
          storage_bucket?: string | null
          storage_object_path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_resources_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_resources_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_sessions: {
        Row: {
          actual_end: string | null
          actual_start: string | null
          attendance_window_end_at: string | null
          attendance_window_start_at: string | null
          created_at: string
          created_by: string
          ended_reason: string | null
          event_id: string
          id: string
          late_cutoff_at: string | null
          mode: string
          rescheduled_at: string | null
          rescheduled_reason: string | null
          scheduled_end: string
          scheduled_start: string
          session_archive_status: string | null
          session_name: string
          session_status: string
          superseded_by: string | null
          updated_at: string
          venue: string
        }
        Insert: {
          actual_end?: string | null
          actual_start?: string | null
          attendance_window_end_at?: string | null
          attendance_window_start_at?: string | null
          created_at?: string
          created_by: string
          ended_reason?: string | null
          event_id: string
          id?: string
          late_cutoff_at?: string | null
          mode?: string
          rescheduled_at?: string | null
          rescheduled_reason?: string | null
          scheduled_end: string
          scheduled_start: string
          session_archive_status?: string | null
          session_name: string
          session_status?: string
          superseded_by?: string | null
          updated_at?: string
          venue: string
        }
        Update: {
          actual_end?: string | null
          actual_start?: string | null
          attendance_window_end_at?: string | null
          attendance_window_start_at?: string | null
          created_at?: string
          created_by?: string
          ended_reason?: string | null
          event_id?: string
          id?: string
          late_cutoff_at?: string | null
          mode?: string
          rescheduled_at?: string | null
          rescheduled_reason?: string | null
          scheduled_end?: string
          scheduled_start?: string
          session_archive_status?: string | null
          session_name?: string
          session_status?: string
          superseded_by?: string | null
          updated_at?: string
          venue?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_sessions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_sessions_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "event_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      event_summary_snapshots: {
        Row: {
          absent_count: number
          attendance_rate: number
          average_sentiment_score: number | null
          captured_at: string
          event_id: string
          id: string
          late_count: number
          negative_percent: number
          neutral_percent: number
          positive_percent: number
          present_count: number
          source: string
          total_registered: number
          updated_at: string
        }
        Insert: {
          absent_count: number
          attendance_rate: number
          average_sentiment_score?: number | null
          captured_at?: string
          event_id: string
          id?: string
          late_count: number
          negative_percent: number
          neutral_percent: number
          positive_percent: number
          present_count: number
          source?: string
          total_registered: number
          updated_at?: string
        }
        Update: {
          absent_count?: number
          attendance_rate?: number
          average_sentiment_score?: number | null
          captured_at?: string
          event_id?: string
          id?: string
          late_count?: number
          negative_percent?: number
          neutral_percent?: number
          positive_percent?: number
          present_count?: number
          source?: string
          total_registered?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_summary_snapshots_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          approval_reason: string | null
          approval_status: string
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          category_id: string
          created_at: string
          department_id: string | null
          description: string | null
          ends_at: string
          event_code: string
          event_status: string
          id: string
          impact_score: number | null
          requested_by: string | null
          college_office: string | null
          number_of_pax: number | null
          last_rescheduled_at: string | null
          organizer_id: string
          predicted_turnout_percent: number | null
          priority_level: string
          published_at: string | null
          published_by: string | null
          reschedule_count: number | null
          starts_at: string
          title: string
          updated_at: string
          venue: string
          visibility: string
        }
        Insert: {
          approval_reason?: string | null
          approval_status?: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          category_id: string
          created_at?: string
          department_id?: string | null
          description?: string | null
          ends_at: string
          event_code: string
          event_status?: string
          id?: string
          impact_score?: number | null
          requested_by?: string | null
          college_office?: string | null
          number_of_pax?: number | null
          last_rescheduled_at?: string | null
          organizer_id: string
          predicted_turnout_percent?: number | null
          priority_level?: string
          published_at?: string | null
          published_by?: string | null
          reschedule_count?: number | null
          starts_at: string
          title: string
          updated_at?: string
          venue: string
          visibility?: string
        }
        Update: {
          approval_reason?: string | null
          approval_status?: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          category_id?: string
          created_at?: string
          department_id?: string | null
          description?: string | null
          ends_at?: string
          event_code?: string
          event_status?: string
          id?: string
          impact_score?: number | null
          requested_by?: string | null
          college_office?: string | null
          number_of_pax?: number | null
          last_rescheduled_at?: string | null
          organizer_id?: string
          predicted_turnout_percent?: number | null
          priority_level?: string
          published_at?: string | null
          published_by?: string | null
          reschedule_count?: number | null
          starts_at?: string
          title?: string
          updated_at?: string
          venue?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "event_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "organizers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      facial_enrollment_history: {
        Row: {
          created_at: string
          created_by: string
          credential_request_id: string | null
          enrollment_kind: string
          enrollment_reference: string
          enrollment_status: string
          id: string
          replaced_profile_id: string | null
          student_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          credential_request_id?: string | null
          enrollment_kind: string
          enrollment_reference: string
          enrollment_status?: string
          id?: string
          replaced_profile_id?: string | null
          student_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          credential_request_id?: string | null
          enrollment_kind?: string
          enrollment_reference?: string
          enrollment_status?: string
          id?: string
          replaced_profile_id?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "facial_enrollment_history_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facial_enrollment_history_credential_request_id_fkey"
            columns: ["credential_request_id"]
            isOneToOne: false
            referencedRelation: "credential_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facial_enrollment_history_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      facial_profiles: {
        Row: {
          consent_recorded_at: string
          created_at: string
          descriptor_model: string | null
          descriptor_updated_at: string | null
          enrolled_at: string
          enrollment_reference: string
          face_descriptor: Json | null
          facial_status: string
          id: string
          last_verified_at: string | null
          student_id: string
          updated_at: string
        }
        Insert: {
          consent_recorded_at: string
          created_at?: string
          descriptor_model?: string | null
          descriptor_updated_at?: string | null
          enrolled_at?: string
          enrollment_reference: string
          face_descriptor?: Json | null
          facial_status?: string
          id?: string
          last_verified_at?: string | null
          student_id: string
          updated_at?: string
        }
        Update: {
          consent_recorded_at?: string
          created_at?: string
          descriptor_model?: string | null
          descriptor_updated_at?: string | null
          enrolled_at?: string
          enrollment_reference?: string
          face_descriptor?: Json | null
          facial_status?: string
          id?: string
          last_verified_at?: string | null
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "facial_profiles_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      generated_reports: {
        Row: {
          created_at: string
          generated_at: string | null
          generated_by: string
          id: string
          report_format: string
          report_name: string
          report_status: string
          scope: string
          storage_bucket: string | null
          storage_object_path: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          generated_at?: string | null
          generated_by: string
          id?: string
          report_format: string
          report_name: string
          report_status?: string
          scope: string
          storage_bucket?: string | null
          storage_object_path?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          generated_at?: string | null
          generated_by?: string
          id?: string
          report_format?: string
          report_name?: string
          report_status?: string
          scope?: string
          storage_bucket?: string | null
          storage_object_path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "generated_reports_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ml_predictions: {
        Row: {
          event_id: string | null
          explanation: string
          generated_at: string
          id: string
          pattern_label: string
          prediction_type: string
          risk_level: string
          score: number
          student_id: string | null
        }
        Insert: {
          event_id?: string | null
          explanation: string
          generated_at?: string
          id?: string
          pattern_label: string
          prediction_type?: string
          risk_level: string
          score: number
          student_id?: string | null
        }
        Update: {
          event_id?: string | null
          explanation?: string
          generated_at?: string
          id?: string
          pattern_label?: string
          prediction_type?: string
          risk_level?: string
          score?: number
          student_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ml_predictions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ml_predictions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          action_url: string | null
          created_at: string
          id: string
          message: string
          notification_status: string
          notification_type: string
          read_at: string | null
          recipient_id: string
          reference_id: string | null
          title: string
        }
        Insert: {
          action_url?: string | null
          created_at?: string
          id?: string
          message: string
          notification_status?: string
          notification_type: string
          read_at?: string | null
          recipient_id: string
          reference_id?: string | null
          title: string
        }
        Update: {
          action_url?: string | null
          created_at?: string
          id?: string
          message?: string
          notification_status?: string
          notification_type?: string
          read_at?: string | null
          recipient_id?: string
          reference_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizers: {
        Row: {
          created_at: string
          department_id: string | null
          employee_id: string
          id: string
          organization_name: string
          organizer_status: string
          position: string
          profile_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          department_id?: string | null
          employee_id: string
          id?: string
          organization_name?: string
          organizer_status?: string
          position?: string
          profile_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          department_id?: string | null
          employee_id?: string
          id?: string
          organization_name?: string
          organizer_status?: string
          position?: string
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizers_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_status: string
          created_at: string
          department_id: string | null
          email: string
          employee_id: string | null
          first_name: string
          id: string
          last_name: string
          middle_name: string | null
          profile_picture: string | null
          role: string
          student_id: string | null
          updated_at: string
        }
        Insert: {
          account_status?: string
          created_at?: string
          department_id?: string | null
          email: string
          employee_id?: string | null
          first_name: string
          id: string
          last_name: string
          middle_name?: string | null
          profile_picture?: string | null
          role: string
          student_id?: string | null
          updated_at?: string
        }
        Update: {
          account_status?: string
          created_at?: string
          department_id?: string | null
          email?: string
          employee_id?: string | null
          first_name?: string
          id?: string
          last_name?: string
          middle_name?: string | null
          profile_picture?: string | null
          role?: string
          student_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      programs: {
        Row: {
          created_at: string
          department_id: string
          id: string
          program_code: string
          program_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          department_id: string
          id?: string
          program_code: string
          program_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          department_id?: string
          id?: string
          program_code?: string
          program_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "programs_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      qr_credentials: {
        Row: {
          created_at: string
          credential_status: string
          expires_at: string | null
          id: string
          issued_at: string
          last_successful_check_in_at: string | null
          revoked_at: string | null
          student_id: string
          token_hash: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          credential_status?: string
          expires_at?: string | null
          id?: string
          issued_at?: string
          last_successful_check_in_at?: string | null
          revoked_at?: string | null
          student_id: string
          token_hash: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          credential_status?: string
          expires_at?: string | null
          id?: string
          issued_at?: string
          last_successful_check_in_at?: string | null
          revoked_at?: string | null
          student_id?: string
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "qr_credentials_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      request_email_outbox: {
        Row: {
          body: string
          created_at: string
          delivery_status: string
          error_message: string | null
          id: string
          provider_message_id: string | null
          recipient_email: string
          recipient_profile_id: string
          request_id: string
          request_status: string
          request_table: string
          sent_at: string | null
          subject: string
        }
        Insert: {
          body: string
          created_at?: string
          delivery_status?: string
          error_message?: string | null
          id?: string
          provider_message_id?: string | null
          recipient_email: string
          recipient_profile_id: string
          request_id: string
          request_status: string
          request_table: string
          sent_at?: string | null
          subject: string
        }
        Update: {
          body?: string
          created_at?: string
          delivery_status?: string
          error_message?: string | null
          id?: string
          provider_message_id?: string | null
          recipient_email?: string
          recipient_profile_id?: string
          request_id?: string
          request_status?: string
          request_table?: string
          sent_at?: string | null
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_email_outbox_recipient_profile_id_fkey"
            columns: ["recipient_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sections: {
        Row: {
          academic_year: string
          created_at: string
          id: string
          program_id: string
          section_name: string
          semester: string
          updated_at: string
          year_level: number
        }
        Insert: {
          academic_year: string
          created_at?: string
          id?: string
          program_id: string
          section_name: string
          semester: string
          updated_at?: string
          year_level: number
        }
        Update: {
          academic_year?: string
          created_at?: string
          id?: string
          program_id?: string
          section_name?: string
          semester?: string
          updated_at?: string
          year_level?: number
        }
        Relationships: [
          {
            foreignKeyName: "sections_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      semesters: {
        Row: {
          academic_year: string
          created_at: string
          end_date: string
          id: string
          semester_name: string
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          academic_year: string
          created_at?: string
          end_date: string
          id?: string
          semester_name: string
          start_date: string
          status?: string
          updated_at?: string
        }
        Update: {
          academic_year?: string
          created_at?: string
          end_date?: string
          id?: string
          semester_name?: string
          start_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      students: {
        Row: {
          created_at: string
          department_id: string
          id: string
          initial_facial_enrollment_completed_at: string | null
          profile_id: string
          program_id: string
          section_id: string
          student_id: string
          student_status: string
          updated_at: string
          year_level: number
        }
        Insert: {
          created_at?: string
          department_id: string
          id?: string
          initial_facial_enrollment_completed_at?: string | null
          profile_id: string
          program_id: string
          section_id: string
          student_id: string
          student_status?: string
          updated_at?: string
          year_level: number
        }
        Update: {
          created_at?: string
          department_id?: string
          id?: string
          initial_facial_enrollment_completed_at?: string | null
          profile_id?: string
          program_id?: string
          section_id?: string
          student_id?: string
          student_status?: string
          updated_at?: string
          year_level?: number
        }
        Relationships: [
          {
            foreignKeyName: "students_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
        ]
      }
      verification_attempts: {
        Row: {
          accepted: boolean
          attempted_at: string
          event_session_id: string
          facial_profile_id: string | null
          failure_code: string | null
          id: string
          message: string
          qr_credential_id: string | null
          student_id: string | null
          verification_method: string
        }
        Insert: {
          accepted: boolean
          attempted_at?: string
          event_session_id: string
          facial_profile_id?: string | null
          failure_code?: string | null
          id?: string
          message: string
          qr_credential_id?: string | null
          student_id?: string | null
          verification_method: string
        }
        Update: {
          accepted?: boolean
          attempted_at?: string
          event_session_id?: string
          facial_profile_id?: string | null
          failure_code?: string | null
          id?: string
          message?: string
          qr_credential_id?: string | null
          student_id?: string | null
          verification_method?: string
        }
        Relationships: [
          {
            foreignKeyName: "verification_attempts_event_session_id_fkey"
            columns: ["event_session_id"]
            isOneToOne: false
            referencedRelation: "event_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_attempts_facial_profile_id_fkey"
            columns: ["facial_profile_id"]
            isOneToOne: false
            referencedRelation: "facial_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_attempts_qr_credential_id_fkey"
            columns: ["qr_credential_id"]
            isOneToOne: false
            referencedRelation: "qr_credentials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_attempts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cancel_organizer_event: {
        Args: { p_event_id: string; p_reason: string }
        Returns: {
          approval_reason: string | null
          approval_status: string
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          category_id: string
          created_at: string
          department_id: string | null
          description: string | null
          ends_at: string
          event_code: string
          event_status: string
          id: string
          impact_score: number | null
          last_rescheduled_at: string | null
          organizer_id: string
          predicted_turnout_percent: number | null
          priority_level: string
          published_at: string | null
          published_by: string | null
          reschedule_count: number | null
          starts_at: string
          title: string
          updated_at: string
          venue: string
          visibility: string
        }
        SetofOptions: {
          from: "*"
          to: "events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      complete_facial_enrollment: {
        Args: { p_enrollment_reference: string }
        Returns: {
          consent_recorded_at: string
          created_at: string
          descriptor_model: string | null
          descriptor_updated_at: string | null
          enrolled_at: string
          enrollment_reference: string
          face_descriptor: Json | null
          facial_status: string
          id: string
          last_verified_at: string | null
          student_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "facial_profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_organizer_event: {
        Args: {
          p_category_id: string
          p_description: string
          p_ends_at: string
          p_event_code: string
          p_impact_score: number
          p_objectives: string[]
          p_participant_ids: string[]
          p_priority_level: string
          p_publish_reason?: string
          p_resource_title?: string
          p_resource_url?: string
          p_starts_at: string
          p_title: string
          p_venue: string
          p_visibility: string
        }
        Returns: {
          approval_reason: string | null
          approval_status: string
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          category_id: string
          created_at: string
          department_id: string | null
          description: string | null
          ends_at: string
          event_code: string
          event_status: string
          id: string
          impact_score: number | null
          last_rescheduled_at: string | null
          organizer_id: string
          predicted_turnout_percent: number | null
          priority_level: string
          published_at: string | null
          published_by: string | null
          reschedule_count: number | null
          starts_at: string
          title: string
          updated_at: string
          venue: string
          visibility: string
        }
        SetofOptions: {
          from: "*"
          to: "events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_organizer_event_metadata: {
        Args: {
          p_college_office?: string | null
          p_event_id: string
          p_number_of_pax?: number | null
          p_requested_by?: string | null
        }
        Returns: {
          approval_reason: string | null
          approval_status: string
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          category_id: string
          college_office: string | null
          created_at: string
          department_id: string | null
          description: string | null
          ends_at: string
          event_code: string
          event_status: string
          id: string
          impact_score: number | null
          last_rescheduled_at: string | null
          number_of_pax: number | null
          organizer_id: string
          predicted_turnout_percent: number | null
          priority_level: string
          published_at: string | null
          published_by: string | null
          requested_by: string | null
          reschedule_count: number | null
          starts_at: string
          title: string
          updated_at: string
          venue: string
          visibility: string
        }
        SetofOptions: {
          from: "*"
          to: "events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      end_event_attendance_session: {
        Args: { p_reason: string; p_session_id: string }
        Returns: {
          actual_end: string | null
          actual_start: string | null
          attendance_window_end_at: string | null
          attendance_window_start_at: string | null
          created_at: string
          created_by: string
          ended_reason: string | null
          event_id: string
          id: string
          late_cutoff_at: string | null
          mode: string
          rescheduled_at: string | null
          rescheduled_reason: string | null
          scheduled_end: string
          scheduled_start: string
          session_archive_status: string | null
          session_name: string
          session_status: string
          superseded_by: string | null
          updated_at: string
          venue: string
        }
        SetofOptions: {
          from: "*"
          to: "event_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_conflicting_events: {
        Args: never
        Returns: {
          conflicts_with: string[]
          ends_at: string
          event_code: string
          event_id: string
          impact_score: number
          priority_level: string
          starts_at: string
          title: string
        }[]
      }
      get_facial_descriptor_for_organizer: {
        Args: { p_event_session_id: string; p_student_id: string }
        Returns: Json
      }
      identify_event_participant_by_face: {
        Args: { p_event_session_id: string; p_live_descriptor: Json }
        Returns: {
          similarity: number
          student_id: string
        }[]
      }
      issue_qr_credential: {
        Args: { p_expires_at?: string; p_student_id: string }
        Returns: {
          created_at: string
          credential_status: string
          expires_at: string | null
          id: string
          issued_at: string
          last_successful_check_in_at: string | null
          revoked_at: string | null
          student_id: string
          token_hash: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "qr_credentials"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      log_client_action: {
        Args: {
          p_action: string
          p_metadata?: Json
          p_target_id?: string
          p_target_type: string
        }
        Returns: undefined
      }
      queue_emails_for_event: {
        Args: { p_event_id: string }
        Returns: undefined
      }
      record_manual_event_attendance: {
        Args: {
          p_late_reason?: string
          p_occurred_at?: string
          p_reason: string
          p_remarks?: string
          p_session_id: string
          p_status: string
          p_student_id: string
        }
        Returns: {
          attendance_status: string
          checkout_verification_method: string | null
          created_at: string
          event_session_id: string
          id: string
          late_reason: string | null
          late_reason_category: string | null
          minutes_late: number | null
          recorded_at: string
          recorded_by: string | null
          remarks: string | null
          student_id: string
          time_in: string | null
          time_out: string | null
          updated_at: string
          verification_attempt_id: string | null
          verification_method: string
        }
        SetofOptions: {
          from: "*"
          to: "attendance_records"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reschedule_organizer_event: {
        Args: {
          p_ends_at: string
          p_event_id: string
          p_reason: string
          p_starts_at: string
          p_venue: string
        }
        Returns: {
          approval_reason: string | null
          approval_status: string
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          category_id: string
          created_at: string
          department_id: string | null
          description: string | null
          ends_at: string
          event_code: string
          event_status: string
          id: string
          impact_score: number | null
          last_rescheduled_at: string | null
          organizer_id: string
          predicted_turnout_percent: number | null
          priority_level: string
          published_at: string | null
          published_by: string | null
          reschedule_count: number | null
          starts_at: string
          title: string
          updated_at: string
          venue: string
          visibility: string
        }
        SetofOptions: {
          from: "*"
          to: "events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      review_attendance_request: {
        Args: { p_reason?: string; p_request_id: string; p_status: string }
        Returns: {
          attendance_record_id: string
          created_at: string
          explanation: string
          id: string
          request_status: string
          requested_status: string
          review_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          student_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "attendance_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      review_credential_request: {
        Args: { p_remarks?: string; p_request_id: string; p_status: string }
        Returns: {
          created_at: string
          credential_type: string
          id: string
          reason: string
          request_status: string
          request_type: string
          review_remarks: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          student_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "credential_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_student_credential_status: {
        Args: {
          p_credential_type: string
          p_status: string
          p_student_id: string
        }
        Returns: undefined
      }
      start_event_attendance_session: {
        Args: {
          p_event_id: string
          p_late_cutoff_minutes?: number
          p_mode: string
          p_scheduled_end: string
          p_scheduled_start: string
          p_venue: string
        }
        Returns: {
          actual_end: string | null
          actual_start: string | null
          attendance_window_end_at: string | null
          attendance_window_start_at: string | null
          created_at: string
          created_by: string
          ended_reason: string | null
          event_id: string
          id: string
          late_cutoff_at: string | null
          mode: string
          rescheduled_at: string | null
          rescheduled_reason: string | null
          scheduled_end: string
          scheduled_start: string
          session_archive_status: string | null
          session_name: string
          session_status: string
          superseded_by: string | null
          updated_at: string
          venue: string
        }
        SetofOptions: {
          from: "*"
          to: "event_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      store_facial_descriptor: {
        Args: { p_face_descriptor: Json }
        Returns: {
          consent_recorded_at: string
          created_at: string
          descriptor_model: string | null
          descriptor_updated_at: string | null
          enrolled_at: string
          enrollment_reference: string
          face_descriptor: Json | null
          facial_status: string
          id: string
          last_verified_at: string | null
          student_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "facial_profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_late_reason: {
        Args: { p_attendance_record_id: string; p_late_reason_category: string }
        Returns: {
          attendance_status: string
          checkout_verification_method: string | null
          created_at: string
          event_session_id: string
          id: string
          late_reason: string | null
          late_reason_category: string | null
          minutes_late: number | null
          recorded_at: string
          recorded_by: string | null
          remarks: string | null
          student_id: string
          time_in: string | null
          time_out: string | null
          updated_at: string
          verification_attempt_id: string | null
          verification_method: string
        }
        SetofOptions: {
          from: "*"
          to: "attendance_records"
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
