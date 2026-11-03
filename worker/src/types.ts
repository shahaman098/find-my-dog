/// <reference types="@cloudflare/workers-types" />

export interface Env {
  MEDIA: R2Bucket
  DB: D1Database
  PIPELINE: Queue<PipelineMessage>
  ASSETS: Fetcher
  FMD_MOCK: string
  SPARK_MODEL: string
  GLIMMER_MODEL: string
  META_API_KEY?: string
  BASETEN_API_KEY?: string
}

export interface PipelineMessage {
  reportId: string
  clipId: string
}

export interface Box { x1: number; y1: number; x2: number; y2: number; w: number; h: number }
export interface Detection { frame: number; t: number; box: Box; confidence: number | null }
export interface Track {
  object_id: number
  n_frames: number
  first_seen: number
  last_seen: number
  confidence: number | null
  detections: Detection[]
}
export interface Clip {
  clip_id: string
  filename: string
  label: string
  captured_clock: string
  fps: number
  duration_s: number
  media_url: string
  status: 'queued' | 'uploading' | 'tracking' | 'extracting' | 'done' | 'error'
  error: string | null
  tracks: Track[]
  n_tracks: number
  still_done: boolean
}
export interface MatchVerdict {
  clip_id: string
  object_id: number
  is_match: boolean
  score: number
  rationale: string
  confirmed: boolean | null
}
export interface Sighting {
  clip_id: string
  object_id: number
  place: string
  clock: string
  t_in_clip: number
  duration_seen: number
  confidence: number
  still: string
  media_url: string
}
export interface ReportState {
  report_id: string
  created_at: number
  pet: { name: string; species: string; description: string; photo_key: string }
  transcript: string | null
  transcript_error: string | null
  clips: Clip[]
  matches: MatchVerdict[]
  next_search: { headline: string; window: string; area: string; why: string; steps: string[] } | null
  summary: string | null
  poster_key: string | null
  matcher_model: string | null
  cost: { sam_frames: number; spark_in: number; spark_out: number; asr_seconds: number; images: number; usd: number }
}
