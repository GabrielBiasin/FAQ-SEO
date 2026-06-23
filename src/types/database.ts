export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      brand_audits: {
        Row: {
          created_at: string
          findings: Json
          gaps: Json
          id: string
          project_id: string
          status: Database["public"]["Enums"]["run_status"]
          summary: string | null
        }
        Insert: {
          created_at?: string
          findings?: Json
          gaps?: Json
          id?: string
          project_id: string
          status?: Database["public"]["Enums"]["run_status"]
          summary?: string | null
        }
        Update: {
          created_at?: string
          findings?: Json
          gaps?: Json
          id?: string
          project_id?: string
          status?: Database["public"]["Enums"]["run_status"]
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brand_audits_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      citation_checks: {
        Row: {
          checked_at: string
          cited: boolean
          created_at: string
          engine: Database["public"]["Enums"]["citation_engine"]
          id: string
          position: number | null
          project_id: string
          question: string
        }
        Insert: {
          checked_at?: string
          cited?: boolean
          created_at?: string
          engine: Database["public"]["Enums"]["citation_engine"]
          id?: string
          position?: number | null
          project_id: string
          question: string
        }
        Update: {
          checked_at?: string
          cited?: boolean
          created_at?: string
          engine?: Database["public"]["Enums"]["citation_engine"]
          id?: string
          position?: number | null
          project_id?: string
          question?: string
        }
        Relationships: [
          {
            foreignKeyName: "citation_checks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      crawls: {
        Row: {
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          max_pages: number
          pages_count: number
          project_id: string
          started_at: string | null
          status: Database["public"]["Enums"]["run_status"]
        }
        Insert: {
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          max_pages?: number
          pages_count?: number
          project_id: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["run_status"]
        }
        Update: {
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          max_pages?: number
          pages_count?: number
          project_id?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["run_status"]
        }
        Relationships: [
          {
            foreignKeyName: "crawls_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      evals: {
        Row: {
          created_at: string
          faq_id: string | null
          id: string
          judge_model: string
          overall_score: number
          passed: boolean
          project_id: string
          prompt_version: string
          rubric_scores: Json
        }
        Insert: {
          created_at?: string
          faq_id?: string | null
          id?: string
          judge_model: string
          overall_score?: number
          passed?: boolean
          project_id: string
          prompt_version: string
          rubric_scores?: Json
        }
        Update: {
          created_at?: string
          faq_id?: string | null
          id?: string
          judge_model?: string
          overall_score?: number
          passed?: boolean
          project_id?: string
          prompt_version?: string
          rubric_scores?: Json
        }
        Relationships: [
          {
            foreignKeyName: "evals_faq_id_fkey"
            columns: ["faq_id"]
            isOneToOne: false
            referencedRelation: "faqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      faqs: {
        Row: {
          answer_text: string
          confidence: number | null
          created_at: string
          id: string
          project_id: string
          prompt_version: string
          question_id: string
          source_page_id: string | null
          status: Database["public"]["Enums"]["faq_status"]
          unsupported_claims: Json
        }
        Insert: {
          answer_text?: string
          confidence?: number | null
          created_at?: string
          id?: string
          project_id: string
          prompt_version?: string
          question_id: string
          source_page_id?: string | null
          status?: Database["public"]["Enums"]["faq_status"]
          unsupported_claims?: Json
        }
        Update: {
          answer_text?: string
          confidence?: number | null
          created_at?: string
          id?: string
          project_id?: string
          prompt_version?: string
          question_id?: string
          source_page_id?: string | null
          status?: Database["public"]["Enums"]["faq_status"]
          unsupported_claims?: Json
        }
        Relationships: [
          {
            foreignKeyName: "faqs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faqs_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faqs_source_page_id_fkey"
            columns: ["source_page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
        ]
      }
      golden_faqs: {
        Row: {
          created_at: string
          id: string
          ideal_answer: string
          notes: string | null
          project_id: string
          question: string
        }
        Insert: {
          created_at?: string
          id?: string
          ideal_answer: string
          notes?: string | null
          project_id: string
          question: string
        }
        Update: {
          created_at?: string
          id?: string
          ideal_answer?: string
          notes?: string | null
          project_id?: string
          question?: string
        }
        Relationships: [
          {
            foreignKeyName: "golden_faqs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      intent_templates: {
        Row: {
          created_at: string
          default_min: number
          default_target: number
          id: string
          intent_brief: string
          is_system: boolean
          key: string
          name: string
          project_id: string | null
          section_type: Database["public"]["Enums"]["section_type"]
        }
        Insert: {
          created_at?: string
          default_min?: number
          default_target?: number
          id?: string
          intent_brief: string
          is_system?: boolean
          key: string
          name: string
          project_id?: string | null
          section_type: Database["public"]["Enums"]["section_type"]
        }
        Update: {
          created_at?: string
          default_min?: number
          default_target?: number
          id?: string
          intent_brief?: string
          is_system?: boolean
          key?: string
          name?: string
          project_id?: string | null
          section_type?: Database["public"]["Enums"]["section_type"]
        }
        Relationships: [
          {
            foreignKeyName: "intent_templates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          attempts: number
          created_at: string
          error: string | null
          id: string
          payload: Json
          project_id: string
          result: Json | null
          status: Database["public"]["Enums"]["run_status"]
          type: Database["public"]["Enums"]["job_type"]
        }
        Insert: {
          attempts?: number
          created_at?: string
          error?: string | null
          id?: string
          payload?: Json
          project_id: string
          result?: Json | null
          status?: Database["public"]["Enums"]["run_status"]
          type: Database["public"]["Enums"]["job_type"]
        }
        Update: {
          attempts?: number
          created_at?: string
          error?: string | null
          id?: string
          payload?: Json
          project_id?: string
          result?: Json | null
          status?: Database["public"]["Enums"]["run_status"]
          type?: Database["public"]["Enums"]["job_type"]
        }
        Relationships: [
          {
            foreignKeyName: "jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      pages: {
        Row: {
          clean_text: string
          crawl_id: string
          created_at: string
          headings: Json
          id: string
          project_id: string
          title: string | null
          url: string
          word_count: number
        }
        Insert: {
          clean_text?: string
          crawl_id: string
          created_at?: string
          headings?: Json
          id?: string
          project_id: string
          title?: string | null
          url: string
          word_count?: number
        }
        Update: {
          clean_text?: string
          crawl_id?: string
          created_at?: string
          headings?: Json
          id?: string
          project_id?: string
          title?: string | null
          url?: string
          word_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "pages_crawl_id_fkey"
            columns: ["crawl_id"]
            isOneToOne: false
            referencedRelation: "crawls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string
          domain: string
          id: string
          name: string
          root_url: string
          status: Database["public"]["Enums"]["project_status"]
          topic_summary: string | null
          voice_guide: string | null
        }
        Insert: {
          created_at?: string
          domain: string
          id?: string
          name: string
          root_url: string
          status?: Database["public"]["Enums"]["project_status"]
          topic_summary?: string | null
          voice_guide?: string | null
        }
        Update: {
          created_at?: string
          domain?: string
          id?: string
          name?: string
          root_url?: string
          status?: Database["public"]["Enums"]["project_status"]
          topic_summary?: string | null
          voice_guide?: string | null
        }
        Relationships: []
      }
      questions: {
        Row: {
          created_at: string
          id: string
          intent: Database["public"]["Enums"]["question_intent"]
          placement_page_id: string | null
          placement_section: string | null
          priority_score: number
          project_id: string
          question_class: Database["public"]["Enums"]["question_class"]
          section_id: string | null
          source: string
          status: string
          text: string
          tier: Database["public"]["Enums"]["question_tier"]
          topic_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          intent?: Database["public"]["Enums"]["question_intent"]
          placement_page_id?: string | null
          placement_section?: string | null
          priority_score?: number
          project_id: string
          question_class?: Database["public"]["Enums"]["question_class"]
          section_id?: string | null
          source?: string
          status?: string
          text: string
          tier?: Database["public"]["Enums"]["question_tier"]
          topic_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          intent?: Database["public"]["Enums"]["question_intent"]
          placement_page_id?: string | null
          placement_section?: string | null
          priority_score?: number
          project_id?: string
          question_class?: Database["public"]["Enums"]["question_class"]
          section_id?: string | null
          source?: string
          status?: string
          text?: string
          tier?: Database["public"]["Enums"]["question_tier"]
          topic_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "questions_placement_page_id_fkey"
            columns: ["placement_page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      sections: {
        Row: {
          created_at: string
          id: string
          intent_override: string | null
          intent_template_id: string | null
          is_priority: boolean
          min_faqs: number
          name: string
          project_id: string
          section_type: Database["public"]["Enums"]["section_type"]
          status: string
          suggested_type: Database["public"]["Enums"]["section_type"] | null
          target_faqs: number
          urls: Json
          weight: number
        }
        Insert: {
          created_at?: string
          id?: string
          intent_override?: string | null
          intent_template_id?: string | null
          is_priority?: boolean
          min_faqs?: number
          name: string
          project_id: string
          section_type?: Database["public"]["Enums"]["section_type"]
          status?: string
          suggested_type?: Database["public"]["Enums"]["section_type"] | null
          target_faqs?: number
          urls?: Json
          weight?: number
        }
        Update: {
          created_at?: string
          id?: string
          intent_override?: string | null
          intent_template_id?: string | null
          is_priority?: boolean
          min_faqs?: number
          name?: string
          project_id?: string
          section_type?: Database["public"]["Enums"]["section_type"]
          status?: string
          suggested_type?: Database["public"]["Enums"]["section_type"] | null
          target_faqs?: number
          urls?: Json
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "sections_intent_template_id_fkey"
            columns: ["intent_template_id"]
            isOneToOne: false
            referencedRelation: "intent_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sections_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      seed_questions: {
        Row: {
          created_at: string
          id: string
          project_id: string
          raw_meta: Json | null
          source: Database["public"]["Enums"]["seed_source"]
          text: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          raw_meta?: Json | null
          source?: Database["public"]["Enums"]["seed_source"]
          text: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          raw_meta?: Json | null
          source?: Database["public"]["Enums"]["seed_source"]
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "seed_questions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      topics: {
        Row: {
          created_at: string
          id: string
          name: string
          priority: number
          project_id: string
          summary: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          priority?: number
          project_id: string
          summary?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          priority?: number
          project_id?: string
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "topics_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      citation_engine: "chatgpt" | "claude" | "perplexity" | "gemini"
      faq_status: "draft" | "needs_review" | "approved" | "rejected"
      job_type:
        | "crawl_site"
        | "analyze_topics"
        | "brand_audit"
        | "discover_questions"
        | "generate_answers"
        | "verify_answers"
        | "run_eval"
        | "citation_check"
        | "assign_placements"
        | "expand_section"
      project_status: "active" | "archived"
      question_class: "demand" | "coverage"
      question_intent:
        | "definitional"
        | "process"
        | "comparative"
        | "transactional"
        | "product"
      question_tier: "head" | "mid" | "long"
      run_status: "queued" | "running" | "done" | "error"
      section_type:
        | "home"
        | "about_trust"
        | "differentiation"
        | "transactional"
        | "product"
        | "other"
      seed_source:
        | "sales"
        | "support"
        | "manual"
        | "web_search"
        | "paa"
        | "autocomplete"
        | "search_console"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

// ---------------------------------------------------------------------------
// Convenience aliases used across the app.
// ---------------------------------------------------------------------------
type DbEnums = Database["public"]["Enums"];

export type ProjectStatus = DbEnums["project_status"];
export type RunStatus = DbEnums["run_status"];
export type CrawlStatus = DbEnums["run_status"];
export type JobStatus = DbEnums["run_status"];
export type JobType = DbEnums["job_type"];
export type SeedSource = DbEnums["seed_source"];
export type QuestionTier = DbEnums["question_tier"];
export type QuestionIntent = DbEnums["question_intent"];
export type QuestionClass = DbEnums["question_class"];
export type FaqStatus = DbEnums["faq_status"];
export type CitationEngine = DbEnums["citation_engine"];
export type SectionType = DbEnums["section_type"];

type DbTables = Database["public"]["Tables"];
export type ProjectRow = DbTables["projects"]["Row"];
export type CrawlRow = DbTables["crawls"]["Row"];
export type PageRow = DbTables["pages"]["Row"];
export type SeedQuestionRow = DbTables["seed_questions"]["Row"];
export type BrandAuditRow = DbTables["brand_audits"]["Row"];
export type TopicRow = DbTables["topics"]["Row"];
export type QuestionRow = DbTables["questions"]["Row"];
export type FaqRow = DbTables["faqs"]["Row"];
export type JobRow = DbTables["jobs"]["Row"];
export type GoldenFaqRow = DbTables["golden_faqs"]["Row"];
export type EvalRow = DbTables["evals"]["Row"];
export type CitationCheckRow = DbTables["citation_checks"]["Row"];
export type SectionRow = DbTables["sections"]["Row"];
export type IntentTemplateRow = DbTables["intent_templates"]["Row"];
