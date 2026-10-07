'use client'

// 乐曲选择对话框（从 app/page.tsx 抽出，内容未改动）

import { memo } from 'react'
import { activateOnEnterSpace } from '@/lib/a11y'
import { useAppStore } from '@/lib/store'
import { Edit3, Info, ListMusic, Plus, Star } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { SongProgression } from '@/lib/page-songs'


export type SongSortBy =
  | 'title-asc' | 'title-desc'
  | 'style-asc' | 'style-desc'
  | 'composer-asc' | 'composer-desc'
  | 'year-asc' | 'year-desc'

export interface SongGroup {
  group: string
  songs: SongProgression[]
}

interface SongSelectorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  groups: SongGroup[]
  sortBy: SongSortBy
  onSortByChange: (v: SongSortBy) => void
  searchQuery: string
  onSearchQueryChange: (v: string) => void
  /** 当前选中的歌曲名（用于高亮） */
  selectedSongName: string
  /** 选中某首歌（调用方负责设置调性、重置进行等） */
  onSelectSong: (song: SongProgression) => void
  onShowSongInfo: (song: SongProgression) => void
  /** 打开自定义歌曲编辑器 */
  onEditCustomSong: () => void
  /** 选择「自定义」空歌曲 */
  onCreateCustomSong: () => void
  t: (key: string) => string
}

function SongSelectorDialogInner({
  open,
  onOpenChange,
  groups,
  sortBy,
  onSortByChange,
  searchQuery,
  onSearchQueryChange,
  selectedSongName,
  onSelectSong,
  onShowSongInfo,
  onEditCustomSong,
  onCreateCustomSong,
  t,
}: SongSelectorDialogProps) {
  // 收藏状态由本组件自己订阅（原因同 LevelSelectorDialog：
  // 本弹窗被 memo 包裹且其余 props 引用稳定，靠父组件传「求值函数」不会刷新星标）
  const songFavorites = useAppStore((s) => s.favorites.songFavorites)
  const toggleSongFavorite = useAppStore.getState().toggleSongFavorite

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <ListMusic className="h-5 w-5" />
              {t('select_song')}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {t('select_song')}
            </DialogDescription>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{t('sort_label')}</span>
              <Select value={sortBy} onValueChange={(v) => onSortByChange(v as SongSortBy)}>
                <SelectTrigger className="h-8 text-xs w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="title-asc" className="text-xs">{t('sort_title_asc')}</SelectItem>
                  <SelectItem value="title-desc" className="text-xs">{t('sort_title_desc')}</SelectItem>
                  <SelectItem value="style-asc" className="text-xs">{t('sort_style_asc')}</SelectItem>
                  <SelectItem value="style-desc" className="text-xs">{t('sort_style_desc')}</SelectItem>
                  <SelectItem value="composer-asc" className="text-xs">{t('sort_composer_asc')}</SelectItem>
                  <SelectItem value="composer-desc" className="text-xs">{t('sort_composer_desc')}</SelectItem>
                  <SelectItem value="year-asc" className="text-xs">{t('sort_year_asc')}</SelectItem>
                  <SelectItem value="year-desc" className="text-xs">{t('sort_year_desc')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </DialogHeader>

        {/* 搜索框*/}
        <div className="px-6 py-3 border-b bg-muted/30">
          <div className="relative">
            <input
              type="text"
              placeholder={t('search_song_placeholder')}
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              className="w-full h-9 pl-9 pr-4 text-sm bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">🔍</span>
          </div>
        </div>

        {/* 乐曲列表 */}
        <div className="flex-1 overflow-y-auto max-h-[300px]">
          {groups.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              {t('no_songs_found')}
            </div>
          ) : (
            <div className="px-4 py-2">
              {groups.map(({ group, songs }) => (
                <div key={group}>
                  <div className="flex items-center py-1 bg-background/95 backdrop-blur z-10 sticky top-0">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2">
                      {group}
                    </h4>
                  </div>
                  {songs.map((song, songIndex) => (
                    <div
                      key={`${song.name}-${songIndex}`}
                      role="button"
                      tabIndex={0}
                      aria-pressed={selectedSongName === song.name}
                      onClick={() => onSelectSong(song)}
                      onKeyDown={activateOnEnterSpace(() => onSelectSong(song))}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{song.name}</div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          <span>{song.composer || t('unknown')}</span>
                          <span>·</span>
                          <span>{song.year || t('unknown')}</span>
                          <span>·</span>
                          <Badge variant="secondary" className="text-2xs px-1 py-0">
                            {song.style || t('jazz_standard')}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={songFavorites.includes(song.name) ? t('remove_from_favorites') : t('add_to_favorites')}
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleSongFavorite(song.name)
                          }}
                        >
                          {songFavorites.includes(song.name) ? (
                            <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                          ) : (
                            <Star className="h-4 w-4 text-muted-foreground" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={t('view_details')}
                          onClick={(e) => {
                            e.stopPropagation()
                            onShowSongInfo(song)
                          }}
                        >
                          <Info className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t">
          <Button
            variant="outline"
            onClick={onEditCustomSong}
          >
            <Edit3 className="h-4 w-4 mr-2" />
            {t('song_editor_title')}
          </Button>
          <Button
            variant="outline"
            onClick={onCreateCustomSong}
          >
            <Plus className="h-4 w-4 mr-2" />
            {t('chord_custom')}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('btn_cancel')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// 包 memo：父组件重渲染时，若 props 未变化则跳过重渲染（弹窗关闭时避免重建整棵 JSX 子树）
export const SongSelectorDialog = memo(SongSelectorDialogInner)
