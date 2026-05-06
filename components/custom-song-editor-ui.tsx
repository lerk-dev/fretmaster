'use client'

import { useState, useCallback, useMemo, memo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Plus,
  Trash2,
  Copy,
  ArrowUp,
  ArrowDown,
  Music,
  Save,
  Download,
  Upload,
  RotateCcw,
  ListMusic,
  Edit3,
  X,
  Check,
} from 'lucide-react'
import { useAppStore } from '@/lib/store'
import {
  CustomSong,
  ChordViewModel,
  RootNote,
  ChordType,
  CHORD_TYPES,
  ROOT_NOTES,
  KEYS,
  CHORD_FUNCTIONS,
  COMMON_PROGRESSIONS,
  createEmptySong,
  createChord,
  chordToSymbol,
  validateSong,
  exportSongToJSON,
  exportSongToSimpleFormat,
  importSongFromJSON,
  importSongFromSimpleFormat,
  duplicateSong,
  transposeSong,
} from '@/lib/custom-song-editor'

interface CustomSongEditorProps {
  language: 'zh-CN' | 'en'
  onClose?: () => void
}

export const CustomSongEditor = memo(function CustomSongEditor({
  language,
  onClose,
}: CustomSongEditorProps) {
  const store = useAppStore()
  const customSongs = store.customSongs || []
  const addCustomSong = store.addCustomSong
  const updateCustomSong = store.updateCustomSong
  const deleteCustomSong = store.deleteCustomSong

  const [editingSong, setEditingSong] = useState<CustomSong | null>(null)
  const [showSongList, setShowSongList] = useState(true)
  const [showPresetDialog, setShowPresetDialog] = useState(false)
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [importText, setImportText] = useState('')
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [transposeValue, setTransposeValue] = useState(0)

  const isZh = language === 'zh-CN'

  const t = useCallback((key: string) => {
    const translations: Record<string, Record<string, string>> = {
      'zh-CN': {
        'title': '自定义歌曲编辑器',
        'my_songs': '我的歌曲',
        'new_song': '新建歌曲',
        'edit_song': '编辑歌曲',
        'song_name': '歌曲名称',
        'composer': '作曲',
        'key': '调性',
        'tempo': '速度 (BPM)',
        'time_signature': '拍号',
        'chords': '和弦进行',
        'add_chord': '添加和弦',
        'remove_chord': '删除和弦',
        'root_note': '根音',
        'chord_type': '和弦类型',
        'beats': '拍数',
        'function': '功能',
        'bass_note': '低音',
        'save': '保存',
        'cancel': '取消',
        'delete': '删除',
        'duplicate': '复制',
        'transpose': '移调',
        'export_json': '导出 JSON',
        'export_text': '导出文本',
        'import': '导入',
        'import_json': '导入 JSON',
        'presets': '预设进行',
        'no_songs': '暂无自定义歌曲',
        'validation_errors': '验证错误',
        'empty_name': '歌曲名称不能为空',
        'empty_chords': '至少需要一个和弦',
        'saved': '已保存',
        'move_up': '上移',
        'move_down': '下移',
        'transpose_up': '升半音',
        'transpose_down': '降半音',
        'reset': '重置',
        'confirm_delete': '确认删除？',
        'confirm_delete_desc': '此操作不可撤销',
        'select_preset': '选择预设和弦进行',
        'import_hint': '粘贴 JSON 或简单格式文本',
        'import_success': '导入成功',
        'import_failed': '导入失败，格式不正确',
      },
      'en': {
        'title': 'Custom Song Editor',
        'my_songs': 'My Songs',
        'new_song': 'New Song',
        'edit_song': 'Edit Song',
        'song_name': 'Song Name',
        'composer': 'Composer',
        'key': 'Key',
        'tempo': 'Tempo (BPM)',
        'time_signature': 'Time Signature',
        'chords': 'Chord Progression',
        'add_chord': 'Add Chord',
        'remove_chord': 'Remove Chord',
        'root_note': 'Root Note',
        'chord_type': 'Chord Type',
        'beats': 'Beats',
        'function': 'Function',
        'bass_note': 'Bass Note',
        'save': 'Save',
        'cancel': 'Cancel',
        'delete': 'Delete',
        'duplicate': 'Duplicate',
        'transpose': 'Transpose',
        'export_json': 'Export JSON',
        'export_text': 'Export Text',
        'import': 'Import',
        'import_json': 'Import JSON',
        'presets': 'Presets',
        'no_songs': 'No custom songs yet',
        'validation_errors': 'Validation Errors',
        'empty_name': 'Song name is required',
        'empty_chords': 'At least one chord is required',
        'saved': 'Saved',
        'move_up': 'Move Up',
        'move_down': 'Move Down',
        'transpose_up': 'Transpose Up',
        'transpose_down': 'Transpose Down',
        'reset': 'Reset',
        'confirm_delete': 'Confirm Delete?',
        'confirm_delete_desc': 'This action cannot be undone',
        'select_preset': 'Select a preset chord progression',
        'import_hint': 'Paste JSON or simple format text',
        'import_success': 'Import successful',
        'import_failed': 'Import failed, invalid format',
      }
    }
    return translations[language]?.[key] || key
  }, [language])

  const handleNewSong = useCallback(() => {
    const song = createEmptySong()
    song.name = isZh ? '新歌曲' : 'New Song'
    setEditingSong(song)
    setShowSongList(false)
    setValidationErrors([])
    setTransposeValue(0)
  }, [isZh])

  const handleEditSong = useCallback((song: CustomSong) => {
    setEditingSong({ ...song, chords: song.chords.map(c => ({ ...c })) })
    setShowSongList(false)
    setValidationErrors([])
    setTransposeValue(0)
  }, [])

  const handleSaveSong = useCallback(() => {
    if (!editingSong) return

    const validation = validateSong(editingSong)
    if (!validation.valid) {
      setValidationErrors(validation.errors)
      return
    }

    const existing = customSongs.find(s => s.id === editingSong.id)
    if (existing) {
      updateCustomSong(editingSong.id, editingSong)
    } else {
      addCustomSong(editingSong)
    }
    setEditingSong(null)
    setShowSongList(true)
  }, [editingSong, customSongs, addCustomSong, updateCustomSong])

  const handleDeleteSong = useCallback((id: string) => {
    deleteCustomSong(id)
  }, [deleteCustomSong])

  const handleDuplicateSong = useCallback((song: CustomSong) => {
    const dup = duplicateSong(song, isZh ? `${song.name} (副本)` : `${song.name} (Copy)`)
    addCustomSong(dup)
  }, [addCustomSong, isZh])

  const handleAddChord = useCallback(() => {
    if (!editingSong) return
    setEditingSong({
      ...editingSong,
      chords: [...editingSong.chords, createChord()],
    })
  }, [editingSong])

  const handleRemoveChord = useCallback((chordId: string) => {
    if (!editingSong) return
    setEditingSong({
      ...editingSong,
      chords: editingSong.chords.filter(c => c.id !== chordId),
    })
  }, [editingSong])

  const handleUpdateChord = useCallback((chordId: string, updates: Partial<ChordViewModel>) => {
    if (!editingSong) return
    setEditingSong({
      ...editingSong,
      chords: editingSong.chords.map(c => c.id === chordId ? { ...c, ...updates } : c),
    })
  }, [editingSong])

  const handleMoveChord = useCallback((chordId: string, direction: 'up' | 'down') => {
    if (!editingSong) return
    const chords = [...editingSong.chords]
    const index = chords.findIndex(c => c.id === chordId)
    if (index === -1) return
    const newIndex = direction === 'up' ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= chords.length) return
    ;[chords[index], chords[newIndex]] = [chords[newIndex], chords[index]]
    setEditingSong({ ...editingSong, chords })
  }, [editingSong])

  const handleTranspose = useCallback((semitones: number) => {
    if (!editingSong) return
    const transposed = transposeSong(editingSong, semitones)
    setEditingSong(transposed)
    setTransposeValue(prev => prev + semitones)
  }, [editingSong])

  const handleLoadPreset = useCallback((presetId: string) => {
    const preset = COMMON_PROGRESSIONS.find(p => p.id === presetId)
    if (!preset || !editingSong) return

    const chords: ChordViewModel[] = preset.chords.map(c => ({
      ...createChord(),
      rootNote: c.rootNote,
      chordType: c.chordType,
      bass: c.bass,
      beats: c.beats,
      function: c.function,
    }))

    setEditingSong({
      ...editingSong,
      key: preset.key,
      chords,
    })
    setShowPresetDialog(false)
  }, [editingSong])

  const handleExportJSON = useCallback(() => {
    if (!editingSong) return
    const json = exportSongToJSON(editingSong)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${editingSong.name || 'song'}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [editingSong])

  const handleExportText = useCallback(() => {
    if (!editingSong) return
    const text = exportSongToSimpleFormat(editingSong)
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${editingSong.name || 'song'}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }, [editingSong])

  const handleImport = useCallback(() => {
    let song: CustomSong | null = null
    song = importSongFromJSON(importText)
    if (!song) {
      song = importSongFromSimpleFormat(importText)
    }
    if (song) {
      setEditingSong(song)
      setShowImportDialog(false)
      setImportText('')
    } else {
      setValidationErrors([t('import_failed')])
    }
  }, [importText, t])

  const chordTypeGroups = useMemo(() => {
    const groups: Record<string, typeof CHORD_TYPES> = {}
    for (const ct of CHORD_TYPES) {
      if (!groups[ct.category]) groups[ct.category] = []
      groups[ct.category].push(ct)
    }
    return groups
  }, [])

  const categoryLabels: Record<string, { zh: string; en: string }> = {
    triads: { zh: '三和弦', en: 'Triads' },
    sixth: { zh: '六和弦', en: 'Sixth' },
    seventh: { zh: '七和弦', en: 'Seventh' },
    ninth: { zh: '九和弦', en: 'Ninth' },
    eleventh: { zh: '十一和弦', en: 'Eleventh' },
    thirteenth: { zh: '十三和弦', en: 'Thirteenth' },
    suspended: { zh: '挂留和弦', en: 'Suspended' },
    added: { zh: '加音和弦', en: 'Added Tone' },
  }

  if (showSongList) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <ListMusic className="h-5 w-5" />
            {t('my_songs')}
          </h2>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleNewSong}>
              <Plus className="h-4 w-4 mr-1" />
              {t('new_song')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowImportDialog(true)}>
              <Upload className="h-4 w-4 mr-1" />
              {t('import')}
            </Button>
            {onClose && (
              <Button size="sm" variant="ghost" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        <ScrollArea className="flex-1">
          {customSongs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Music className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm">{t('no_songs')}</p>
              <Button size="sm" variant="outline" className="mt-4" onClick={handleNewSong}>
                <Plus className="h-4 w-4 mr-1" />
                {t('new_song')}
              </Button>
            </div>
          ) : (
            <div className="p-4 space-y-2">
              {customSongs.map(song => (
                <Card key={song.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-sm truncate">{song.name}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            {song.key.replace('Major', isZh ? '大调' : 'Maj').replace('Minor', isZh ? '小调' : 'Min')}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">{song.tempo} BPM</span>
                          <span className="text-[10px] text-muted-foreground">
                            {song.chords.length} {isZh ? '个和弦' : 'chords'}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {song.chords.slice(0, 8).map((c, i) => (
                            <span key={c.id} className="text-[10px] text-muted-foreground font-mono">
                              {chordToSymbol(c, isZh ? 'chinese' : 'english')}
                              {i < song.chords.length - 1 && i < 7 && ' →'}
                            </span>
                          ))}
                          {song.chords.length > 8 && (
                            <span className="text-[10px] text-muted-foreground">...</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 ml-2">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleEditSong(song)}>
                          <Edit3 className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleDuplicateSong(song)}>
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => handleDeleteSong(song.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </ScrollArea>

        <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('import_json')}</DialogTitle>
              <DialogDescription>{t('import_hint')}</DialogDescription>
            </DialogHeader>
            <textarea
              className="w-full h-40 p-3 border rounded-md text-sm font-mono resize-none"
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder='{"name":"My Song","chords":[...]}'
            />
            {validationErrors.length > 0 && (
              <div className="text-destructive text-sm">
                {validationErrors.map((err, i) => (
                  <p key={i}>{err}</p>
                ))}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowImportDialog(false)}>
                {t('cancel')}
              </Button>
              <Button onClick={handleImport}>{t('import')}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  if (!editingSong) return null

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Edit3 className="h-5 w-5" />
          {editingSong.chords.length > 0 ? t('edit_song') : t('new_song')}
        </h2>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowPresetDialog(true)}>
            <Music className="h-4 w-4 mr-1" />
            {t('presets')}
          </Button>
          <Button size="sm" variant="outline" onClick={handleExportJSON}>
            <Download className="h-4 w-4 mr-1" />
            JSON
          </Button>
          <Button size="sm" variant="outline" onClick={handleExportText}>
            <Download className="h-4 w-4 mr-1" />
            TXT
          </Button>
          <Button size="sm" onClick={handleSaveSong}>
            <Save className="h-4 w-4 mr-1" />
            {t('save')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setEditingSong(null); setShowSongList(true) }}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {validationErrors.length > 0 && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
              <p className="text-destructive text-sm font-medium mb-1">{t('validation_errors')}</p>
              {validationErrors.map((err, i) => (
                <p key={i} className="text-destructive/80 text-xs">{err}</p>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs">{t('song_name')}</Label>
              <Input
                value={editingSong.name}
                onChange={(e) => setEditingSong({ ...editingSong, name: e.target.value })}
                placeholder={isZh ? '输入歌曲名称' : 'Enter song name'}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">{t('composer')}</Label>
              <Input
                value={editingSong.composer}
                onChange={(e) => setEditingSong({ ...editingSong, composer: e.target.value })}
                placeholder={isZh ? '输入作曲者' : 'Enter composer'}
              />
            </div>
          </div>

          <div className="grid grid-cols-4 gap-3">
            <div className="space-y-2">
              <Label className="text-xs">{t('key')}</Label>
              <Select
                value={editingSong.key}
                onValueChange={(v) => setEditingSong({ ...editingSong, key: v })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KEYS.map(k => (
                    <SelectItem key={k.id} value={k.id} className="text-xs">
                      {isZh ? k.nameZh : k.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">{t('tempo')}</Label>
              <Input
                type="number"
                min={40}
                max={300}
                value={editingSong.tempo}
                onChange={(e) => setEditingSong({ ...editingSong, tempo: Number(e.target.value) || 120 })}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">{isZh ? '每小节拍数' : 'Beats/Bar'}</Label>
              <Input
                type="number"
                min={1}
                max={16}
                value={editingSong.beatsPerMeasure}
                onChange={(e) => setEditingSong({ ...editingSong, beatsPerMeasure: Number(e.target.value) || 4 })}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">{isZh ? '音符类型' : 'Note Value'}</Label>
              <Select
                value={String(editingSong.beatSize)}
                onValueChange={(v) => setEditingSong({ ...editingSong, beatSize: Number(v) })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2" className="text-xs">2</SelectItem>
                  <SelectItem value="4" className="text-xs">4</SelectItem>
                  <SelectItem value="8" className="text-xs">8</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Label className="text-xs">{t('transpose')}</Label>
            <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => handleTranspose(-1)}>
              -
            </Button>
            <span className="text-xs font-mono w-8 text-center">
              {transposeValue > 0 ? `+${transposeValue}` : transposeValue}
            </span>
            <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => handleTranspose(1)}>
              +
            </Button>
            {transposeValue !== 0 && (
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => {
                const reset = transposeSong(editingSong, -transposeValue)
                setEditingSong(reset)
                setTransposeValue(0)
              }}>
                <RotateCcw className="h-3 w-3 mr-1" />
                {t('reset')}
              </Button>
            )}
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">{t('chords')}</Label>
            <Button size="sm" variant="outline" onClick={handleAddChord}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              {t('add_chord')}
            </Button>
          </div>

          {editingSong.chords.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Music className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-xs">{isZh ? '点击上方按钮添加和弦' : 'Click above to add chords'}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {editingSong.chords.map((chord, index) => (
                <Card key={chord.id} className="overflow-hidden">
                  <CardContent className="p-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground w-4 text-center font-mono">
                        {index + 1}
                      </span>
                      <Select
                        value={chord.rootNote}
                        onValueChange={(v) => handleUpdateChord(chord.id, { rootNote: v as RootNote })}
                      >
                        <SelectTrigger className="h-7 w-16 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROOT_NOTES.map(n => (
                            <SelectItem key={n.id} value={n.id} className="text-xs">
                              {n.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Select
                        value={chord.chordType}
                        onValueChange={(v) => handleUpdateChord(chord.id, { chordType: v as ChordType })}
                      >
                        <SelectTrigger className="h-7 w-24 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(chordTypeGroups).map(([category, types]) => (
                            <div key={category}>
                              <p className="text-[10px] text-muted-foreground px-2 py-1 font-medium">
                                {categoryLabels[category]?.[isZh ? 'zh' : 'en'] || category}
                              </p>
                              {types.map(ct => (
                                <SelectItem key={ct.id} value={ct.id} className="text-xs">
                                  {isZh ? ct.nameZh : ct.name}
                                </SelectItem>
                              ))}
                            </div>
                          ))}
                        </SelectContent>
                      </Select>

                      <div className="flex items-center gap-1">
                        <Label className="text-[10px] text-muted-foreground">{t('beats')}</Label>
                        <Input
                          type="number"
                          min={1}
                          max={16}
                          value={chord.beats}
                          onChange={(e) => handleUpdateChord(chord.id, { beats: Number(e.target.value) || 4 })}
                          className="h-7 w-12 text-xs text-center"
                        />
                      </div>

                      <Select
                        value={chord.function || 'none'}
                        onValueChange={(v) => handleUpdateChord(chord.id, { function: v === 'none' ? undefined : v })}
                      >
                        <SelectTrigger className="h-7 w-14 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none" className="text-xs">-</SelectItem>
                          {CHORD_FUNCTIONS.map(f => (
                            <SelectItem key={f.id} value={f.id} className="text-xs">
                              {f.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <div className="flex items-center gap-0.5 ml-auto">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0"
                          disabled={index === 0}
                          onClick={() => handleMoveChord(chord.id, 'up')}
                        >
                          <ArrowUp className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0"
                          disabled={index === editingSong.chords.length - 1}
                          onClick={() => handleMoveChord(chord.id, 'down')}
                        >
                          <ArrowDown className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0 text-destructive"
                          onClick={() => handleRemoveChord(chord.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {editingSong.chords.length > 0 && (
            <div className="bg-muted/30 rounded-lg p-3">
              <p className="text-xs text-muted-foreground mb-1">{isZh ? '进行预览' : 'Progression Preview'}</p>
              <div className="flex flex-wrap gap-1.5">
                {editingSong.chords.map((c, i) => (
                  <span key={c.id} className="text-xs font-mono">
                    <span className="font-semibold">{chordToSymbol(c, isZh ? 'chinese' : 'english')}</span>
                    {c.beats !== 4 && <span className="text-muted-foreground">×{c.beats}</span>}
                    {i < editingSong.chords.length - 1 && <span className="text-muted-foreground mx-0.5">→</span>}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      <Dialog open={showPresetDialog} onOpenChange={setShowPresetDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('select_preset')}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-80">
            <div className="space-y-2">
              {COMMON_PROGRESSIONS.map(preset => (
                <Card
                  key={preset.id}
                  className="cursor-pointer hover:bg-accent/50 transition-colors"
                  onClick={() => handleLoadPreset(preset.id)}
                >
                  <CardContent className="p-3">
                    <h4 className="text-sm font-medium">{isZh ? preset.nameZh : preset.name}</h4>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {preset.chords.map((c, i) => (
                        <span key={i} className="text-[10px] font-mono text-muted-foreground">
                          {c.rootNote}{c.chordType === 'Major' ? '' : c.chordType}
                          {i < preset.chords.length - 1 && ' →'}
                        </span>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  )
})
