export type ScoreTag = 'played' | 'hype' | null

export type MemberScore = {
  user_id: string
  name: string
  hue: number
  avatar_url: string | null
  is_me: boolean
  before: number | null
  after: number | null
  personal: number | null
  tag: ScoreTag
}

export type BoardCard = {
  id: number
  title: string
  cover_url: string | null
  genres: string[]
  status: 'active' | 'played'
  added_by: string | null
  added_by_name: string | null
  added_at: string
  played_at: string | null
  /** Added by someone else since you last opened this list. */
  is_new: boolean
  scored_count: number
  member_count: number
  needed: number
  me_scored: boolean
  cant_play: string[]
  rank: number | null
  group_score: number | null
  played_count: number | null
  hype_count: number | null
  scores: MemberScore[] | null
}

export type ListInfo = {
  id: string
  name: string
  invite_code: string
  playable_only: boolean
  created_by: string
  is_creator: boolean
  member_count: number
  needed: number
  /** Changes whenever the list picture changes; null means the default picture. */
  image_version: number | null
  /** This member's "Played games" switch: rank played games together with unplayed ones. */
  include_played: boolean
}

export type Member = {
  id: string
  name: string
  hue: number
  avatar_url: string | null
  is_me: boolean
  is_creator: boolean
}

export type LinkedCategory = {
  category_id: number
  name: string
  owner_id: string
  owner_name: string
  mine: boolean
  game_count: number
}

export type Board = {
  list: ListInfo
  members: Member[]
  ranked: BoardCard[]
  /** Unplayed and played games in one ranking (rank renumbered), for the "Played games" switch. */
  ranked_all: BoardCard[]
  waiting: BoardCard[]
  blocked: BoardCard[]
  needs_score: BoardCard[]
  played: BoardCard[]
  linked_categories: LinkedCategory[]
  hidden: { id: number; title: string; cover_url: string | null }[]
}

export type ListSummary = {
  id: string
  name: string
  member_count: number
  members: Member[]
  needs_score: number
  next: BoardCard | null
  image_version: number | null
  /** Games friends added since you last opened the list. */
  new_count: number
}

export type GameMember = {
  id: string
  name: string
  hue: number
  avatar_url: string | null
  is_me: boolean
  scored: boolean
  can_play: boolean | null
  before: number | null
  after: number | null
  personal: number | null
}

export type ListGame = {
  list: ListInfo
  game: { id: number; title: string; cover_url: string | null; genres: string[]; release_year: number | null }
  status: 'active' | 'played' | 'hidden'
  section: 'ranked' | 'waiting' | 'blocked' | 'played' | 'needs_score' | null
  card: BoardCard | null
  is_adder: boolean
  is_creator: boolean
  mine: {
    scored: boolean
    in_library: boolean
    before: number | null
    after: number | null
    can_play: boolean
    personal: number | null
  }
  members: GameMember[]
  other_lists: { id: string; name: string }[]
}

export type QueueItem = {
  id: number
  title: string
  cover_url: string | null
  genres: string[]
  /** "after": played together, your After score is missing. "score": not scored at all. */
  kind: 'after' | 'score'
  played_at: string | null
  lists: { id: string; name: string; added_by_name: string | null; scored_count: number; member_count: number }[]
}

export type LibraryGame = {
  id: number
  title: string
  cover_url: string | null
  genres: string[]
  release_year: number | null
  before: number | null
  after: number | null
  personal: number | null
  can_play: boolean
  added_at: string
  categories: { id: number; name: string }[]
  lists: { id: string; name: string }[]
}

export type Library = {
  games: LibraryGame[]
  categories: { id: number; name: string; count: number }[]
}

export type CatalogResult = {
  key: string
  igdb_id: number | null
  steam_appid: number | null
  game_id: number | null
  title: string
  cover_url: string | null
  /** Shown if cover_url fails to load (Steam has no tall cover for some games). */
  cover_fallback: string | null
  genres: string[]
  release_year: number | null
  /** Players in Up Next who have this game (only for games already in Up Next). */
  players: number
  source: 'upnext' | 'steam' | 'igdb'
}
