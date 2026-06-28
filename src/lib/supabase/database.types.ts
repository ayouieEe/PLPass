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
      attendance_logs: {
        Row: {
          action_type: Database["public"]["Enums"]["attendance_action_type"]
          attendance_record_id: string | null
          created_at: string
          device_id: string | null
          id: string
          logged_at: string | null
          method: Database["public"]["Enums"]["verification_method"]
          recorded_by: string | null
          remarks: string | null
          student_id: string | null
        }
        Insert: {
          action_type: Database["public"]["Enums"]["attendance_action_type"]
          attendance_record_id?: string | null
          created_at?: string
          device_id?: string | null
          id?: string
          logged_at?: string | null
          method: Database["public"]["Enums"]["verification_method"]
          recorded_by?: string | null
          remarks?: string | null
          student_id?: string | null
        }
        Update: {
          action_type?: Database["public"]["Enums"]["attendance_action_type"]
          attendance_record_id?: string | null
          created_at?: string
          device_id?: string | null
          id?: string
          logged_at?: string | null
          method?: Database["public"]["Enums"]["verification_method"]
          recorded_by?: string | null
          remarks?: string | null
          student_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_logs_attendance_record_id_fkey"
            columns: ["attendance_record_id"]
            isOneToOne: false
            referencedRelation: "attendance_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_logs_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_logs_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_logs_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_records: {
        Row: {
          attendance_status:
            | Database["public"]["Enums"]["attendance_status"]
            | null
          attendance_type: Database["public"]["Enums"]["attendance_type"]
          class_session_id: string | null
          created_at: string | null
          event_session_id: string | null
          id: string
          remarks: string | null
          student_id: string | null
          time_in: string | null
          time_out: string | null
          verification_method:
            | Database["public"]["Enums"]["verification_method"]
            | null
        }
        Insert: {
          attendance_status?:
            | Database["public"]["Enums"]["attendance_status"]
            | null
          attendance_type: Database["public"]["Enums"]["attendance_type"]
          class_session_id?: string | null
          created_at?: string | null
          event_session_id?: string | null
          id?: string
          remarks?: string | null
          student_id?: string | null
          time_in?: string | null
          time_out?: string | null
          verification_method?:
            | Database["public"]["Enums"]["verification_method"]
            | null
        }
        Update: {
          attendance_status?:
            | Database["public"]["Enums"]["attendance_status"]
            | null
          attendance_type?: Database["public"]["Enums"]["attendance_type"]
          class_session_id?: string | null
          created_at?: string | null
          event_session_id?: string | null
          id?: string
          remarks?: string | null
          student_id?: string | null
          time_in?: string | null
          time_out?: string | null
          verification_method?:
            | Database["public"]["Enums"]["verification_method"]
            | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_class_session_id_fkey"
            columns: ["class_session_id"]
            isOneToOne: false
            referencedRelation: "class_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_event_session_id_fkey"
            columns: ["event_session_id"]
            isOneToOne: false
            referencedRelation: "event_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_request_attachments: {
        Row: {
          attendance_request_id: string | null
          created_at: string | null
          file_name: string
          file_url: string
          id: string
        }
        Insert: {
          attendance_request_id?: string | null
          created_at?: string | null
          file_name: string
          file_url: string
          id?: string
        }
        Update: {
          attendance_request_id?: string | null
          created_at?: string | null
          file_name?: string
          file_url?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_request_attachments_attendance_request_id_fkey"
            columns: ["attendance_request_id"]
            isOneToOne: false
            referencedRelation: "attendance_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_requests: {
        Row: {
          attendance_record_id: string | null
          created_at: string | null
          explanation: string | null
          id: string
          rejection_reason: string | null
          request_status:
            | Database["public"]["Enums"]["request_decision_status"]
            | null
          request_type: Database["public"]["Enums"]["attendance_request_type"]
          reviewed_at: string | null
          reviewed_by: string | null
          student_id: string | null
          submitted_at: string
          updated_at: string | null
        }
        Insert: {
          attendance_record_id?: string | null
          created_at?: string | null
          explanation?: string | null
          id?: string
          rejection_reason?: string | null
          request_status?:
            | Database["public"]["Enums"]["request_decision_status"]
            | null
          request_type: Database["public"]["Enums"]["attendance_request_type"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          student_id?: string | null
          submitted_at?: string
          updated_at?: string | null
        }
        Update: {
          attendance_record_id?: string | null
          created_at?: string | null
          explanation?: string | null
          id?: string
          rejection_reason?: string | null
          request_status?:
            | Database["public"]["Enums"]["request_decision_status"]
            | null
          request_type?: Database["public"]["Enums"]["attendance_request_type"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          student_id?: string | null
          submitted_at?: string
          updated_at?: string | null
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
      calendar_entries: {
        Row: {
          end_datetime: string
          entry_type: Database["public"]["Enums"]["entry_type"]
          id: string
          reference_id: string
          start_datetime: string
        }
        Insert: {
          end_datetime: string
          entry_type: Database["public"]["Enums"]["entry_type"]
          id?: string
          reference_id: string
          start_datetime: string
        }
        Update: {
          end_datetime?: string
          entry_type?: Database["public"]["Enums"]["entry_type"]
          id?: string
          reference_id?: string
          start_datetime?: string
        }
        Relationships: []
      }
      class_enrollments: {
        Row: {
          class_id: string | null
          enrollment_status:
            | Database["public"]["Enums"]["enrollment_status"]
            | null
          id: string
          student_id: string | null
        }
        Insert: {
          class_id?: string | null
          enrollment_status?:
            | Database["public"]["Enums"]["enrollment_status"]
            | null
          id?: string
          student_id?: string | null
        }
        Update: {
          class_id?: string | null
          enrollment_status?:
            | Database["public"]["Enums"]["enrollment_status"]
            | null
          id?: string
          student_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "class_enrollments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      class_schedules: {
        Row: {
          class_id: string | null
          day_of_week: number
          end_time: string
          id: string
          start_time: string
        }
        Insert: {
          class_id?: string | null
          day_of_week: number
          end_time: string
          id?: string
          start_time: string
        }
        Update: {
          class_id?: string | null
          day_of_week?: number
          end_time?: string
          id?: string
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_schedules_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      class_sessions: {
        Row: {
          actual_end: string | null
          actual_start: string | null
          attendance_window_end: string | null
          attendance_window_start: string | null
          class_id: string | null
          created_at: string
          created_by: string | null
          ended_reason: string | null
          id: string
          late_cutoff_at: string | null
          mode: Database["public"]["Enums"]["session_mode"] | null
          room_id: string | null
          scheduled_end: string | null
          scheduled_start: string | null
          session_date: string
          session_status: Database["public"]["Enums"]["session_status"] | null
          updated_at: string | null
        }
        Insert: {
          actual_end?: string | null
          actual_start?: string | null
          attendance_window_end?: string | null
          attendance_window_start?: string | null
          class_id?: string | null
          created_at?: string
          created_by?: string | null
          ended_reason?: string | null
          id?: string
          late_cutoff_at?: string | null
          mode?: Database["public"]["Enums"]["session_mode"] | null
          room_id?: string | null
          scheduled_end?: string | null
          scheduled_start?: string | null
          session_date: string
          session_status?: Database["public"]["Enums"]["session_status"] | null
          updated_at?: string | null
        }
        Update: {
          actual_end?: string | null
          actual_start?: string | null
          attendance_window_end?: string | null
          attendance_window_start?: string | null
          class_id?: string | null
          created_at?: string
          created_by?: string | null
          ended_reason?: string | null
          id?: string
          late_cutoff_at?: string | null
          mode?: Database["public"]["Enums"]["session_mode"] | null
          room_id?: string | null
          scheduled_end?: string | null
          scheduled_start?: string | null
          session_date?: string
          session_status?: Database["public"]["Enums"]["session_status"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "class_sessions_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_sessions_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          class_status: Database["public"]["Enums"]["class_status"] | null
          faculty_id: string | null
          id: string
          room_id: string | null
          section_id: string | null
          semester_id: string | null
          subject_id: string | null
        }
        Insert: {
          class_status?: Database["public"]["Enums"]["class_status"] | null
          faculty_id?: string | null
          id?: string
          room_id?: string | null
          section_id?: string | null
          semester_id?: string | null
          subject_id?: string | null
        }
        Update: {
          class_status?: Database["public"]["Enums"]["class_status"] | null
          faculty_id?: string | null
          id?: string
          room_id?: string | null
          section_id?: string | null
          semester_id?: string | null
          subject_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "classes_faculty_id_fkey"
            columns: ["faculty_id"]
            isOneToOne: false
            referencedRelation: "faculty"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      colleges: {
        Row: {
          college_code: string
          college_name: string
          id: string
        }
        Insert: {
          college_code: string
          college_name: string
          id?: string
        }
        Update: {
          college_code?: string
          college_name?: string
          id?: string
        }
        Relationships: []
      }
      credential_requests: {
        Row: {
          created_at: string
          credential_type: Database["public"]["Enums"]["credential_type"]
          id: string
          request_type: Database["public"]["Enums"]["credential_request_type"]
          resolved_at: string | null
          review_remarks: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status:
            | Database["public"]["Enums"]["credential_request_status"]
            | null
          student_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          credential_type: Database["public"]["Enums"]["credential_type"]
          id?: string
          request_type: Database["public"]["Enums"]["credential_request_type"]
          resolved_at?: string | null
          review_remarks?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?:
            | Database["public"]["Enums"]["credential_request_status"]
            | null
          student_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          credential_type?: Database["public"]["Enums"]["credential_type"]
          id?: string
          request_type?: Database["public"]["Enums"]["credential_request_type"]
          resolved_at?: string | null
          review_remarks?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?:
            | Database["public"]["Enums"]["credential_request_status"]
            | null
          student_id?: string | null
          updated_at?: string | null
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
      dean_assignments: {
        Row: {
          created_at: string
          department_id: string
          employee_number: string | null
          id: string
          office_name: string
          profile_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          department_id: string
          employee_number?: string | null
          id?: string
          office_name?: string
          profile_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          department_id?: string
          employee_number?: string | null
          id?: string
          office_name?: string
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dean_assignments_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dean_assignments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          college_id: string | null
          department_code: string
          department_name: string
          id: string
        }
        Insert: {
          college_id?: string | null
          department_code: string
          department_name: string
          id?: string
        }
        Update: {
          college_id?: string | null
          department_code?: string
          department_name?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_college_id_fkey"
            columns: ["college_id"]
            isOneToOne: false
            referencedRelation: "colleges"
            referencedColumns: ["id"]
          },
        ]
      }
      devices: {
        Row: {
          device_name: string
          device_type: Database["public"]["Enums"]["device_type"]
          id: string
          location: string | null
          status: Database["public"]["Enums"]["device_status"] | null
        }
        Insert: {
          device_name: string
          device_type: Database["public"]["Enums"]["device_type"]
          id?: string
          location?: string | null
          status?: Database["public"]["Enums"]["device_status"] | null
        }
        Update: {
          device_name?: string
          device_type?: Database["public"]["Enums"]["device_type"]
          id?: string
          location?: string | null
          status?: Database["public"]["Enums"]["device_status"] | null
        }
        Relationships: []
      }
      enrollment_request_logs: {
        Row: {
          action: string
          created_at: string | null
          enrollment_request_id: string | null
          id: string
          performed_by: string | null
          remarks: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          enrollment_request_id?: string | null
          id?: string
          performed_by?: string | null
          remarks?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          enrollment_request_id?: string | null
          id?: string
          performed_by?: string | null
          remarks?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "enrollment_request_logs_enrollment_request_id_fkey"
            columns: ["enrollment_request_id"]
            isOneToOne: false
            referencedRelation: "enrollment_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollment_request_logs_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollment_requests: {
        Row: {
          created_at: string | null
          id: string
          request_type: string
          semester_id: string | null
          status: Database["public"]["Enums"]["request_decision_status"] | null
          student_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          request_type: string
          semester_id?: string | null
          status?: Database["public"]["Enums"]["request_decision_status"] | null
          student_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          request_type?: string
          semester_id?: string | null
          status?: Database["public"]["Enums"]["request_decision_status"] | null
          student_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "enrollment_requests_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollment_requests_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      event_approvals: {
        Row: {
          created_at: string | null
          decision: Database["public"]["Enums"]["approval_status"] | null
          event_id: string | null
          id: string
          remarks: string | null
          reviewed_by: string | null
        }
        Insert: {
          created_at?: string | null
          decision?: Database["public"]["Enums"]["approval_status"] | null
          event_id?: string | null
          id?: string
          remarks?: string | null
          reviewed_by?: string | null
        }
        Update: {
          created_at?: string | null
          decision?: Database["public"]["Enums"]["approval_status"] | null
          event_id?: string | null
          id?: string
          remarks?: string | null
          reviewed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_approvals_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_approvals_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_categories: {
        Row: {
          category_name: string
          id: string
        }
        Insert: {
          category_name: string
          id?: string
        }
        Update: {
          category_name?: string
          id?: string
        }
        Relationships: []
      }
      event_participants: {
        Row: {
          event_id: string | null
          id: string
          participant_status:
            | Database["public"]["Enums"]["participant_status"]
            | null
          student_id: string | null
        }
        Insert: {
          event_id?: string | null
          id?: string
          participant_status?:
            | Database["public"]["Enums"]["participant_status"]
            | null
          student_id?: string | null
        }
        Update: {
          event_id?: string | null
          id?: string
          participant_status?:
            | Database["public"]["Enums"]["participant_status"]
            | null
          student_id?: string | null
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
      event_session_participants: {
        Row: {
          event_session_id: string | null
          id: string
          student_id: string | null
        }
        Insert: {
          event_session_id?: string | null
          id?: string
          student_id?: string | null
        }
        Update: {
          event_session_id?: string | null
          id?: string
          student_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_session_participants_event_session_id_fkey"
            columns: ["event_session_id"]
            isOneToOne: false
            referencedRelation: "event_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_session_participants_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      event_sessions: {
        Row: {
          actual_end: string | null
          actual_start: string | null
          attendance_window_end: string | null
          attendance_window_start: string | null
          created_at: string
          created_by: string | null
          ended_reason: string | null
          event_id: string | null
          id: string
          late_cutoff_at: string | null
          mode: Database["public"]["Enums"]["session_mode"] | null
          scheduled_end: string | null
          scheduled_start: string | null
          session_status: Database["public"]["Enums"]["session_status"] | null
          updated_at: string | null
        }
        Insert: {
          actual_end?: string | null
          actual_start?: string | null
          attendance_window_end?: string | null
          attendance_window_start?: string | null
          created_at?: string
          created_by?: string | null
          ended_reason?: string | null
          event_id?: string | null
          id?: string
          late_cutoff_at?: string | null
          mode?: Database["public"]["Enums"]["session_mode"] | null
          scheduled_end?: string | null
          scheduled_start?: string | null
          session_status?: Database["public"]["Enums"]["session_status"] | null
          updated_at?: string | null
        }
        Update: {
          actual_end?: string | null
          actual_start?: string | null
          attendance_window_end?: string | null
          attendance_window_start?: string | null
          created_at?: string
          created_by?: string | null
          ended_reason?: string | null
          event_id?: string | null
          id?: string
          late_cutoff_at?: string | null
          mode?: Database["public"]["Enums"]["session_mode"] | null
          scheduled_end?: string | null
          scheduled_start?: string | null
          session_status?: Database["public"]["Enums"]["session_status"] | null
          updated_at?: string | null
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
        ]
      }
      event_target_groups: {
        Row: {
          event_id: string | null
          id: string
          reference_id: string
          target_type: Database["public"]["Enums"]["target_type"]
        }
        Insert: {
          event_id?: string | null
          id?: string
          reference_id: string
          target_type: Database["public"]["Enums"]["target_type"]
        }
        Update: {
          event_id?: string | null
          id?: string
          reference_id?: string
          target_type?: Database["public"]["Enums"]["target_type"]
        }
        Relationships: [
          {
            foreignKeyName: "event_target_groups_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          approval_status: Database["public"]["Enums"]["approval_status"] | null
          category_id: string | null
          description: string | null
          event_code: string
          event_date: string | null
          event_name: string
          event_status: Database["public"]["Enums"]["event_status"] | null
          id: string
          organizer_id: string | null
          scheduled_end: string | null
          scheduled_start: string | null
          venue: string | null
        }
        Insert: {
          approval_status?:
            | Database["public"]["Enums"]["approval_status"]
            | null
          category_id?: string | null
          description?: string | null
          event_code: string
          event_date?: string | null
          event_name: string
          event_status?: Database["public"]["Enums"]["event_status"] | null
          id?: string
          organizer_id?: string | null
          scheduled_end?: string | null
          scheduled_start?: string | null
          venue?: string | null
        }
        Update: {
          approval_status?:
            | Database["public"]["Enums"]["approval_status"]
            | null
          category_id?: string | null
          description?: string | null
          event_code?: string
          event_date?: string | null
          event_name?: string
          event_status?: Database["public"]["Enums"]["event_status"] | null
          id?: string
          organizer_id?: string | null
          scheduled_end?: string | null
          scheduled_start?: string | null
          venue?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "event_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "organizers"
            referencedColumns: ["id"]
          },
        ]
      }
      facial_profiles: {
        Row: {
          face_embedding: string | null
          face_image_url: string | null
          facial_status: Database["public"]["Enums"]["facial_status"] | null
          id: string
          student_id: string | null
        }
        Insert: {
          face_embedding?: string | null
          face_image_url?: string | null
          facial_status?: Database["public"]["Enums"]["facial_status"] | null
          id?: string
          student_id?: string | null
        }
        Update: {
          face_embedding?: string | null
          face_image_url?: string | null
          facial_status?: Database["public"]["Enums"]["facial_status"] | null
          id?: string
          student_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "facial_profiles_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      faculty: {
        Row: {
          department_id: string | null
          employee_id: string | null
          employment_type: Database["public"]["Enums"]["employment_type"] | null
          faculty_status: Database["public"]["Enums"]["faculty_status"] | null
          id: string
          profile_id: string | null
        }
        Insert: {
          department_id?: string | null
          employee_id?: string | null
          employment_type?:
            | Database["public"]["Enums"]["employment_type"]
            | null
          faculty_status?: Database["public"]["Enums"]["faculty_status"] | null
          id?: string
          profile_id?: string | null
        }
        Update: {
          department_id?: string | null
          employee_id?: string | null
          employment_type?:
            | Database["public"]["Enums"]["employment_type"]
            | null
          faculty_status?: Database["public"]["Enums"]["faculty_status"] | null
          id?: string
          profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "faculty_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faculty_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      generated_reports: {
        Row: {
          created_at: string | null
          error_message: string | null
          expires_at: string | null
          file_url: string | null
          filters: Json | null
          format: Database["public"]["Enums"]["report_format"]
          generated_at: string | null
          generated_by: string | null
          id: string
          report_status: string
          report_type: string
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          expires_at?: string | null
          file_url?: string | null
          filters?: Json | null
          format: Database["public"]["Enums"]["report_format"]
          generated_at?: string | null
          generated_by?: string | null
          id?: string
          report_status?: string
          report_type: string
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          expires_at?: string | null
          file_url?: string | null
          filters?: Json | null
          format?: Database["public"]["Enums"]["report_format"]
          generated_at?: string | null
          generated_by?: string | null
          id?: string
          report_status?: string
          report_type?: string
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
      ml_absenteeism_predictions: {
        Row: {
          created_at: string | null
          id: string
          risk_level: Database["public"]["Enums"]["risk_level"] | null
          risk_score: number | null
          semester_id: string | null
          student_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          risk_level?: Database["public"]["Enums"]["risk_level"] | null
          risk_score?: number | null
          semester_id?: string | null
          student_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          risk_level?: Database["public"]["Enums"]["risk_level"] | null
          risk_score?: number | null
          semester_id?: string | null
          student_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ml_absenteeism_predictions_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ml_absenteeism_predictions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      ml_attendance_anomalies: {
        Row: {
          actual_rate: number | null
          anomaly_level: Database["public"]["Enums"]["anomaly_level"] | null
          created_at: string | null
          expected_rate: number | null
          id: string
          semester_id: string | null
          student_id: string | null
        }
        Insert: {
          actual_rate?: number | null
          anomaly_level?: Database["public"]["Enums"]["anomaly_level"] | null
          created_at?: string | null
          expected_rate?: number | null
          id?: string
          semester_id?: string | null
          student_id?: string | null
        }
        Update: {
          actual_rate?: number | null
          anomaly_level?: Database["public"]["Enums"]["anomaly_level"] | null
          created_at?: string | null
          expected_rate?: number | null
          id?: string
          semester_id?: string | null
          student_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ml_attendance_anomalies_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ml_attendance_anomalies_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      ml_participation_clusters: {
        Row: {
          cluster_name: string | null
          cluster_no: number | null
          created_at: string | null
          id: string
          semester_id: string | null
          student_id: string | null
        }
        Insert: {
          cluster_name?: string | null
          cluster_no?: number | null
          created_at?: string | null
          id?: string
          semester_id?: string | null
          student_id?: string | null
        }
        Update: {
          cluster_name?: string | null
          cluster_no?: number | null
          created_at?: string | null
          id?: string
          semester_id?: string | null
          student_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ml_participation_clusters_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ml_participation_clusters_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      ml_runs: {
        Row: {
          created_at: string | null
          id: string
          model_type: Database["public"]["Enums"]["model_type"]
          parameters: Json | null
          semester_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          model_type: Database["public"]["Enums"]["model_type"]
          parameters?: Json | null
          semester_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          model_type?: Database["public"]["Enums"]["model_type"]
          parameters?: Json | null
          semester_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ml_runs_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
        ]
      }
      nfc_credentials: {
        Row: {
          hash_token: string
          id: string
          issued_at: string | null
          issued_by: string | null
          last_successful_check_in_at: string | null
          nfc_status: Database["public"]["Enums"]["nfc_status"] | null
          student_id: string | null
          updated_at: string | null
        }
        Insert: {
          hash_token: string
          id?: string
          issued_at?: string | null
          issued_by?: string | null
          last_successful_check_in_at?: string | null
          nfc_status?: Database["public"]["Enums"]["nfc_status"] | null
          student_id?: string | null
          updated_at?: string | null
        }
        Update: {
          hash_token?: string
          id?: string
          issued_at?: string | null
          issued_by?: string | null
          last_successful_check_in_at?: string | null
          nfc_status?: Database["public"]["Enums"]["nfc_status"] | null
          student_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nfc_credentials_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nfc_credentials_student_id_fkey"
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
          created_at: string | null
          id: string
          message: string
          notification_status:
            | Database["public"]["Enums"]["notification_status"]
            | null
          read_at: string | null
          recipient_id: string | null
          reference_id: string | null
          reference_type: string | null
          title: string
        }
        Insert: {
          action_url?: string | null
          created_at?: string | null
          id?: string
          message: string
          notification_status?:
            | Database["public"]["Enums"]["notification_status"]
            | null
          read_at?: string | null
          recipient_id?: string | null
          reference_id?: string | null
          reference_type?: string | null
          title: string
        }
        Update: {
          action_url?: string | null
          created_at?: string | null
          id?: string
          message?: string
          notification_status?:
            | Database["public"]["Enums"]["notification_status"]
            | null
          read_at?: string | null
          recipient_id?: string | null
          reference_id?: string | null
          reference_type?: string | null
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
          department_id: string | null
          employee_id: string | null
          id: string
          organizer_status:
            | Database["public"]["Enums"]["organizer_status"]
            | null
          position: string | null
          profile_id: string | null
        }
        Insert: {
          department_id?: string | null
          employee_id?: string | null
          id?: string
          organizer_status?:
            | Database["public"]["Enums"]["organizer_status"]
            | null
          position?: string | null
          profile_id?: string | null
        }
        Update: {
          department_id?: string | null
          employee_id?: string | null
          id?: string
          organizer_status?:
            | Database["public"]["Enums"]["organizer_status"]
            | null
          position?: string | null
          profile_id?: string | null
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
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_status: Database["public"]["Enums"]["account_status"] | null
          created_at: string | null
          department_id: string | null
          email: string
          employee_id: string | null
          first_name: string
          id: string
          last_name: string
          middle_name: string | null
          profile_picture: string | null
          role: Database["public"]["Enums"]["user_role"]
          student_id: string | null
          updated_at: string | null
        }
        Insert: {
          account_status?: Database["public"]["Enums"]["account_status"] | null
          created_at?: string | null
          department_id?: string | null
          email: string
          employee_id?: string | null
          first_name: string
          id: string
          last_name: string
          middle_name?: string | null
          profile_picture?: string | null
          role: Database["public"]["Enums"]["user_role"]
          student_id?: string | null
          updated_at?: string | null
        }
        Update: {
          account_status?: Database["public"]["Enums"]["account_status"] | null
          created_at?: string | null
          department_id?: string | null
          email?: string
          employee_id?: string | null
          first_name?: string
          id?: string
          last_name?: string
          middle_name?: string | null
          profile_picture?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          student_id?: string | null
          updated_at?: string | null
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
          department_id: string | null
          id: string
          program_code: string
          program_name: string
        }
        Insert: {
          department_id?: string | null
          id?: string
          program_code: string
          program_name: string
        }
        Update: {
          department_id?: string | null
          id?: string
          program_code?: string
          program_name?: string
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
          hash_token: string
          id: string
          qr_status: Database["public"]["Enums"]["qr_status"] | null
          student_id: string | null
        }
        Insert: {
          hash_token: string
          id?: string
          qr_status?: Database["public"]["Enums"]["qr_status"] | null
          student_id?: string | null
        }
        Update: {
          hash_token?: string
          id?: string
          qr_status?: Database["public"]["Enums"]["qr_status"] | null
          student_id?: string | null
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
      rooms: {
        Row: {
          building: string | null
          capacity: number | null
          id: string
          room_code: string
        }
        Insert: {
          building?: string | null
          capacity?: number | null
          id?: string
          room_code: string
        }
        Update: {
          building?: string | null
          capacity?: number | null
          id?: string
          room_code?: string
        }
        Relationships: []
      }
      sections: {
        Row: {
          academic_year: string
          id: string
          program_id: string | null
          section_name: string
          semester: string
          year_level: number
        }
        Insert: {
          academic_year: string
          id?: string
          program_id?: string | null
          section_name: string
          semester: string
          year_level: number
        }
        Update: {
          academic_year?: string
          id?: string
          program_id?: string | null
          section_name?: string
          semester?: string
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
          end_date: string | null
          id: string
          semester_name: string
          start_date: string | null
          status: Database["public"]["Enums"]["semester_status"] | null
        }
        Insert: {
          academic_year: string
          end_date?: string | null
          id?: string
          semester_name: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["semester_status"] | null
        }
        Update: {
          academic_year?: string
          end_date?: string | null
          id?: string
          semester_name?: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["semester_status"] | null
        }
        Relationships: []
      }
      session_audit_logs: {
        Row: {
          action: string
          created_at: string | null
          id: string
          new_value: Json | null
          old_value: Json | null
          performed_by: string | null
          session_id: string
          session_type: Database["public"]["Enums"]["entry_type"]
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          performed_by?: string | null
          session_id: string
          session_type: Database["public"]["Enums"]["entry_type"]
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          performed_by?: string | null
          session_id?: string
          session_type?: Database["public"]["Enums"]["entry_type"]
        }
        Relationships: [
          {
            foreignKeyName: "session_audit_logs_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      session_students: {
        Row: {
          class_session_id: string | null
          id: string
          student_id: string | null
        }
        Insert: {
          class_session_id?: string | null
          id?: string
          student_id?: string | null
        }
        Update: {
          class_session_id?: string | null
          id?: string
          student_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "session_students_class_session_id_fkey"
            columns: ["class_session_id"]
            isOneToOne: false
            referencedRelation: "class_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_students_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_flags: {
        Row: {
          created_at: string | null
          flag_type: Database["public"]["Enums"]["flag_type"]
          id: string
          resolved: boolean | null
          severity: Database["public"]["Enums"]["severity_level"] | null
          student_id: string | null
        }
        Insert: {
          created_at?: string | null
          flag_type: Database["public"]["Enums"]["flag_type"]
          id?: string
          resolved?: boolean | null
          severity?: Database["public"]["Enums"]["severity_level"] | null
          student_id?: string | null
        }
        Update: {
          created_at?: string | null
          flag_type?: Database["public"]["Enums"]["flag_type"]
          id?: string
          resolved?: boolean | null
          severity?: Database["public"]["Enums"]["severity_level"] | null
          student_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_flags_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          college_id: string | null
          id: string
          profile_id: string | null
          program_id: string | null
          section_id: string | null
          student_id: string
          student_status: Database["public"]["Enums"]["student_status"] | null
          year_level: number | null
        }
        Insert: {
          college_id?: string | null
          id?: string
          profile_id?: string | null
          program_id?: string | null
          section_id?: string | null
          student_id: string
          student_status?: Database["public"]["Enums"]["student_status"] | null
          year_level?: number | null
        }
        Update: {
          college_id?: string | null
          id?: string
          profile_id?: string | null
          program_id?: string | null
          section_id?: string | null
          student_id?: string
          student_status?: Database["public"]["Enums"]["student_status"] | null
          year_level?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "students_college_id_fkey"
            columns: ["college_id"]
            isOneToOne: false
            referencedRelation: "colleges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
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
      subjects: {
        Row: {
          id: string
          subject_code: string
          subject_name: string
          units: number | null
        }
        Insert: {
          id?: string
          subject_code: string
          subject_name: string
          units?: number | null
        }
        Update: {
          id?: string
          subject_code?: string
          subject_name?: string
          units?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      account_status: "active" | "inactive" | "suspended"
      anomaly_level: "normal" | "warning" | "critical"
      approval_status: "pending" | "approved" | "declined"
      attendance_action_type: "time_in" | "time_out"
      attendance_request_type: "excuse" | "correction"
      attendance_status: "present" | "late" | "absent" | "excused"
      attendance_type: "class" | "event"
      class_status: "active" | "inactive" | "completed"
      credential_request_status:
        | "pending"
        | "approved"
        | "rejected"
        | "resolved"
      credential_request_type:
        | "lost"
        | "damaged"
        | "replacement"
        | "activation_issue"
      credential_type: "nfc" | "qr" | "facial"
      device_status: "active" | "inactive"
      device_type: "nfc" | "camera" | "qr_scanner"
      employment_type: "full_time" | "part_time"
      enrollment_status: "enrolled" | "dropped" | "removed"
      entry_type: "class" | "event"
      event_status:
        | "draft"
        | "scheduled"
        | "ongoing"
        | "completed"
        | "cancelled"
      facial_status: "activated" | "inactive"
      faculty_status: "active" | "on_leave" | "resigned"
      flag_type: "absenteeism" | "anomaly" | "disciplinary"
      model_type: "random_forest" | "linear_regression" | "kmeans"
      nfc_status:
        | "activated"
        | "damaged"
        | "inactive"
        | "replaced"
        | "lost"
        | "blocked"
      notification_status: "unread" | "read" | "archived"
      organizer_status: "active" | "inactive"
      participant_status: "invited" | "confirmed" | "removed"
      qr_status: "activated" | "inactive"
      report_format: "pdf" | "xlsx"
      request_decision_status: "pending" | "approved" | "rejected"
      risk_level: "low" | "medium" | "high"
      semester_status: "upcoming" | "active" | "completed"
      session_mode: "f2f" | "online"
      session_status: "scheduled" | "ongoing" | "completed" | "cancelled"
      severity_level: "low" | "medium" | "high"
      student_status: "enrolled" | "loa" | "dropped" | "archived"
      target_type: "college" | "program" | "section" | "student"
      user_role: "admin" | "faculty" | "organizer" | "student"
      verification_method: "nfc" | "qr" | "facial" | "manual" | "online"
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
      account_status: ["active", "inactive", "suspended"],
      anomaly_level: ["normal", "warning", "critical"],
      approval_status: ["pending", "approved", "declined"],
      attendance_action_type: ["time_in", "time_out"],
      attendance_request_type: ["excuse", "correction"],
      attendance_status: ["present", "late", "absent", "excused"],
      attendance_type: ["class", "event"],
      class_status: ["active", "inactive", "completed"],
      credential_request_status: [
        "pending",
        "approved",
        "rejected",
        "resolved",
      ],
      credential_request_type: [
        "lost",
        "damaged",
        "replacement",
        "activation_issue",
      ],
      credential_type: ["nfc", "qr", "facial"],
      device_status: ["active", "inactive"],
      device_type: ["nfc", "camera", "qr_scanner"],
      employment_type: ["full_time", "part_time"],
      enrollment_status: ["enrolled", "dropped", "removed"],
      entry_type: ["class", "event"],
      event_status: ["draft", "scheduled", "ongoing", "completed", "cancelled"],
      facial_status: ["activated", "inactive"],
      faculty_status: ["active", "on_leave", "resigned"],
      flag_type: ["absenteeism", "anomaly", "disciplinary"],
      model_type: ["random_forest", "linear_regression", "kmeans"],
      nfc_status: [
        "activated",
        "damaged",
        "inactive",
        "replaced",
        "lost",
        "blocked",
      ],
      notification_status: ["unread", "read", "archived"],
      organizer_status: ["active", "inactive"],
      participant_status: ["invited", "confirmed", "removed"],
      qr_status: ["activated", "inactive"],
      report_format: ["pdf", "xlsx"],
      request_decision_status: ["pending", "approved", "rejected"],
      risk_level: ["low", "medium", "high"],
      semester_status: ["upcoming", "active", "completed"],
      session_mode: ["f2f", "online"],
      session_status: ["scheduled", "ongoing", "completed", "cancelled"],
      severity_level: ["low", "medium", "high"],
      student_status: ["enrolled", "loa", "dropped", "archived"],
      target_type: ["college", "program", "section", "student"],
      user_role: ["admin", "faculty", "organizer", "student"],
      verification_method: ["nfc", "qr", "facial", "manual", "online"],
    },
  },
} as const
