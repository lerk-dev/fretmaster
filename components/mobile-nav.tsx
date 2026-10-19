'use client'

import { memo, useEffect, useRef, useState } from 'react'
import { Check, Ellipsis, type LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * 手机端底部导航（`md:hidden`）。
 *
 * ## 为什么要有「更多」
 *
 * 底部导航原先平铺 8 个入口（5 个练习 + 教程/乐理/统计），390px 宽的屏上
 * 每个只剩 ~48px、短名还被截断（`text-2xs truncate`）。练习是高频操作，
 * 教程/乐理/统计是低频浏览 ⇒ 后者折进「更多」，底部固定 5 个练习 + 1 个入口。
 *
 * ## 交互约定
 *
 * - 点「更多」在导航正上方弹出面板（绝对定位，不 portal）；
 * - 面板打开时有一层透明背板，点任意处关闭（背板在 z-0、导航内容在 z-10，
 *   所以导航按钮本身仍可点）；
 * - **切换页面后自动关闭**（含全局快捷键切页的路径 —— 页面内不再挂第二个
 *   window keydown，靠 `activeTab` 变化收口，铁律：window keydown 唯一）；
 * - `Esc` 关闭并把焦点还给「更多」按钮（面板内监听，不引全局监听）。
 *
 * ## 当前页落在折叠项时
 *
 * 「更多」按钮显示**该页自己的图标与短名**（而不是一律写「更多」），
 * 否则用户切到乐理后底部完全看不出自己在哪一页。
 */
export type MobileNavItem = {
  id: string
  /** 完整名称（aria-label 用） */
  label: string
  /** 导航上的短名 */
  shortLabel: string
  Icon: LucideIcon
}

interface MobileNavProps {
  /** 常驻导航的练习页（建议 ≤5） */
  items: MobileNavItem[]
  /** 折叠进「更多」的页面 */
  foldedItems: MobileNavItem[]
  activeTab: string
  onSelect: (id: string) => void
  /** 「更多」按钮文案（i18n） */
  moreLabel: string
  /** 导航容器 aria-label（i18n） */
  ariaLabel: string
}

export const MobileNav = memo(function MobileNav({
  items,
  foldedItems,
  activeTab,
  onSelect,
  moreLabel,
  ariaLabel,
}: MobileNavProps) {
  const [open, setOpen] = useState(false)
  const moreBtnRef = useRef<HTMLButtonElement | null>(null)
  const firstItemRef = useRef<HTMLButtonElement | null>(null)

  // 任何一次切页（点导航 / 点面板 / 全局快捷键）都收起面板
  useEffect(() => {
    setOpen(false)
  }, [activeTab])

  // 展开后把焦点移进面板：Esc 才有地方可听（不额外挂 window keydown）
  useEffect(() => {
    if (open) firstItemRef.current?.focus()
  }, [open])

  const foldedActive = foldedItems.find((item) => item.id === activeTab) ?? null
  const MoreIcon = foldedActive ? foldedActive.Icon : Ellipsis
  const moreShortLabel = foldedActive ? foldedActive.shortLabel : moreLabel

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Escape') return
    e.stopPropagation()
    setOpen(false)
    moreBtnRef.current?.focus()
  }

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border/50 p-1 pb-safe z-50 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]"
      aria-label={ariaLabel}
    >
      {/* 点击背板关闭：铺满全屏但在导航内容之下（z-0 < z-10） */}
      {open && (
        <div
          className="fixed inset-0 z-0 bg-black/40"
          onClick={() => setOpen(false)}
          aria-hidden="true"
          data-testid="mobile-more-backdrop"
        />
      )}

      <div className="relative z-10">
        {open && (
          <div
            id="mobile-more-menu"
            role="menu"
            aria-label={moreLabel}
            data-testid="mobile-more-menu"
            onKeyDown={handleKeyDown}
            className="absolute bottom-full left-1 right-1 mb-2 rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl ring-1 ring-black/30 p-1.5 space-y-0.5"
          >
            {foldedItems.map((item, index) => {
              const active = activeTab === item.id
              return (
                <button
                  key={item.id}
                  ref={index === 0 ? firstItemRef : undefined}
                  type="button"
                  role="menuitem"
                  aria-current={active ? 'page' : undefined}
                  // 自己先收起：点「当前已经在这一页」的项时 activeTab 不变，
                  // 只靠 activeTab effect 收口会让面板留在这里。
                  onClick={() => { setOpen(false); onSelect(item.id) }}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-left min-h-[2.5rem]',
                    active ? 'bg-primary/10 text-primary font-medium' : 'text-foreground hover:bg-accent'
                  )}
                >
                  <item.Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{item.label}</span>
                  {active && <Check className="h-4 w-4 ml-auto shrink-0" aria-hidden="true" />}
                </button>
              )
            })}
          </div>
        )}

        <div className="flex justify-around">
          <div role="tablist" aria-label={ariaLabel} className="flex justify-around flex-1 min-w-0">
            {items.map((mode) => {
              const active = activeTab === mode.id
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => onSelect(mode.id)}
                  className={cn(
                    'flex flex-col items-center gap-0.5 px-1.5 py-1 rounded-lg flex-1 min-w-[2.75rem]',
                    active ? 'bg-primary/10 text-primary' : 'text-muted-foreground'
                  )}
                  style={{ willChange: 'background-color, color' }}
                  role="tab"
                  aria-selected={active}
                  aria-label={mode.label}
                >
                  <mode.Icon className="h-5 w-5" aria-hidden="true" />
                  <span className="text-2xs font-medium truncate max-w-full">{mode.shortLabel}</span>
                </button>
              )
            })}
          </div>

          {/* 没有折叠页时（例如不带课程的分支）不渲染入口，避免点开一个空面板 */}
          {foldedItems.length > 0 && (
          <button
            ref={moreBtnRef}
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-controls="mobile-more-menu"
            aria-label={moreLabel}
            data-testid="mobile-more-button"
            className={cn(
              'flex flex-col items-center gap-0.5 px-1.5 py-1 rounded-lg min-w-[2.75rem]',
              foldedActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground'
            )}
            style={{ willChange: 'background-color, color' }}
          >
            <MoreIcon className="h-5 w-5" aria-hidden="true" />
            <span className="text-2xs font-medium truncate max-w-full">{moreShortLabel}</span>
          </button>
          )}
        </div>
      </div>
    </nav>
  )
})
