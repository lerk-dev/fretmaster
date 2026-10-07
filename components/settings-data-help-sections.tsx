'use client'

// 设置面板的「设置管理」与「帮助」两个折叠段（从 app/page.tsx 抽出，内容未改动）

import { useRef } from 'react'
import { Download, HelpCircle, Play, RotateCcw, Save, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'

interface SettingsDataSectionProps {
  t: (key: string) => string
  onSave: () => void
  onReset: () => void
  onExport: () => void
  /** 选择 JSON 文件后导入 */
  onImport: (file: File) => void
}

export function SettingsDataSection({ t, onSave, onReset, onExport, onImport }: SettingsDataSectionProps) {
  // 「导入」必须由按钮显式触发 input.click()：
  // 原先把 <button> 包在 <label> 里靠 label 转发点击，但按钮属于 interactive content，
  // 按 HTML 规范 label 的激活行为对 interactive content 后代「什么都不做」，真实浏览器里点了没反应。
  const importInputRef = useRef<HTMLInputElement>(null)
  return (
    <AccordionItem value="data" className="border-b-0">
      <AccordionTrigger className="py-2 text-sm font-medium flex items-center gap-2 hover:no-underline">
        <span className="flex items-center gap-2">
          <Save className="h-4 w-4" />
          {t('settings_management')}
        </span>
      </AccordionTrigger>
      <AccordionContent className="space-y-3 pb-2">
      <p className="text-xs text-muted-foreground">{t('reset_settings_hint')}</p>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" size="sm" onClick={onSave}>
          <Save className="h-4 w-4 mr-2" />
          {t('btn_save')}
        </Button>
        <Button variant="outline" size="sm" onClick={onReset}>
          <RotateCcw className="h-4 w-4 mr-2" />
          {t('btn_reset')}
        </Button>
        <Button variant="outline" size="sm" onClick={onExport}>
          <Download className="h-4 w-4 mr-2" />
          {t('export_settings')}
        </Button>
        <input
          ref={importInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onImport(file)
            // 清空 value：否则连续选择同一个文件时浏览器只触发一次 change，第二次导入静默失效
            e.target.value = ''
          }}
        />
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => importInputRef.current?.click()}
        >
          <Upload className="h-4 w-4 mr-2" />
          {t('import_settings')}
        </Button>
      </div>
      </AccordionContent>
    </AccordionItem>
  )
}

interface SettingsHelpSectionProps {
  t: (key: string) => string
  language: string
}

export function SettingsHelpSection({ t, language }: SettingsHelpSectionProps) {
  return (
    <AccordionItem value="help" className="border-b-0">
      <AccordionTrigger className="py-2 text-sm font-medium flex items-center gap-2 hover:no-underline">
        <span className="flex items-center gap-2">
          <HelpCircle className="h-4 w-4" />
          {language === 'zh-CN' ? '帮助' : 'Help'}
        </span>
      </AccordionTrigger>
      <AccordionContent className="space-y-3 pb-2">
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        onClick={async () => {
          const { restartTutorial } = await import('@/components/onboarding')
          restartTutorial()
        }}
      >
        <Play className="h-4 w-4 mr-2" />
        {t('restart_tutorial')}
      </Button>
      </AccordionContent>
    </AccordionItem>
  )
}
