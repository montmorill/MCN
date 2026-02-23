// ---------------------------------------------------------------------------
// Shared type definitions for the MCN frontend
// ---------------------------------------------------------------------------

// ---- Account types ----

export type AccountStatus = "active" | "abnormal" | "unverified"

export type AccountItem = {
  id: string
  platform: string
  account: string
  email?: string | null
  status: AccountStatus
  verify_status?: string | null
  verify_message?: string | null
  verify_checked_at?: string | null
  verify_http_status?: number | null
  verify_latency_ms?: number | null
  password_masked?: string | null
  twofa_masked?: string | null
  token_masked?: string | null
  email_password_masked?: string | null
  extra_fields?: Record<string, string>
  created_at?: string
  updated_at?: string
}

// ---- Proxy types ----

export type ProxyPoolType = "publish" | "monitor"

export type ProxyProtocol = "http" | "https" | "socks5"

export type ProxyStatus = "active" | "dead" | "slow" | "disabled"

export type ProxyRecord = {
  id: string
  ip: string
  port: number
  protocol: ProxyProtocol
  username?: string | null
  password_masked?: string | null
  region?: string | null
  type: ProxyPoolType
  status: ProxyStatus
  last_checked_at?: string | null
  last_latency_ms?: number | null
  last_error?: string | null
  last_check_result?: ProxyCheckResult | null
  created_at?: string
  updated_at?: string
}

/** Internal to ProxyRecord – kept here because ProxyRecord references it. */
export type ProxyCheckResult = {
  success?: boolean
  status?: string
  message?: string
  task_id?: string
  real_ip?: string | null
  latency_ms?: number | null
  score?: number | null
  proxy_type?: string | null
  country?: string | null
  region?: string | null
  city?: string | null
  services?: ProxyServiceUnlock[]
  is_dead?: boolean
  error?: string | null
}

/** Internal to ProxyCheckResult. */
export type ProxyServiceUnlock = {
  name?: string
  ok?: boolean
  latency_seconds?: number | null
}

// ---- Binding types ----

export type BindingItem = {
  account_uid: string
  proxy_id: string
  proxy_label?: string | null
  proxy_status?: string | null
}

// ---- Collect task types ----

export type CollectTaskStatus = "pending" | "running" | "completed" | "failed"

export type CollectTask = {
  id: string
  kind:
    | "collect-single-work"
    | "collect-author"
    | "collect-author-selective-download"
  task_type: "collect" | "publish"
  collect_mode: "single-work" | "author"
  title: string
  description: string
  status: CollectTaskStatus
  created_at: string
  updated_at: string
  started_at?: string | null
  ended_at?: string | null
  logs?: string[]
  error?: string | null
  result_summary?: {
    total_count?: number
    success_count?: number
    failure_count?: number
  }
  progress?: {
    current?: number
    total?: number
    percent?: number
  }
}

// ---- Publish task types ----

export type PublishTaskStatus =
  | "pending"
  | "scheduled"
  | "running"
  | "completed"
  | "failed"

export type PublishTask = {
  id: string
  kind: string
  task_type: string
  publish_mode: string
  title: string
  description: string
  status: PublishTaskStatus
  created_at: string
  updated_at: string
  started_at?: string | null
  ended_at?: string | null
  logs?: string[]
  error?: string | null
  result_summary?: {
    total_count?: number
    success_count?: number
    failure_count?: number
    tweet_id?: string | null
    tweet_url?: string | null
  }
  progress?: {
    current?: number
    total?: number
    percent?: number
  }
  payload?: {
    account_id?: string
    content?: { text?: string; media_paths?: string[] }
    strategy?: { type?: string; scheduled_time?: string }
  }
}

// ---- Monitoring types ----

export type SnapshotData = {
  followers_count?: number
  following_count?: number
  tweet_count?: number
  listed_count?: number
  profile_name?: string
  profile_image_url?: string
  bio?: string
  created_at?: string
  captured_at?: string
}

export type RegularScope =
  | { type: "count"; count: number }
  | { type: "days"; days: number }

export type HighlightsScope =
  | { type: "count"; count: number }
  | { type: "days"; days: number }

export type CollectScope =
  | { mode: "full" }
  | { mode: "custom"; regular: RegularScope; highlights?: HighlightsScope | null }

export type MonitoredAccount = {
  id: string
  username: string
  note?: string | null
  refresh_interval_hours?: number
  collect_scope?: CollectScope
  added_at: string
  last_scraped_at?: string | null
  latest_snapshot: SnapshotData | null
}

export type FollowerHistoryPoint = { date: string; followers: number }

export type TweetMetric = {
  tweet_id: string
  text: string
  created_at: string
  views: number
  likes: number
  retweets: number
  replies: number
  quotes: number
  bookmarks: number
  media_urls?: string[]
  author_name?: string
  author_handle?: string
}

export type DashboardData = {
  account: { id: string; username: string }
  overview: SnapshotData
  followers_history: FollowerHistoryPoint[]
  tweets: TweetMetric[]
}
