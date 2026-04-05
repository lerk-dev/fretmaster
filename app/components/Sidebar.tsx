"use client"

import { memo } from "react"
import { cn } from "@/lib/utils"

interface SidebarItem {
  id: string
  label: string
  Icon: React.ComponentType<{ className?: string }>
}

interface SidebarProps {
  items: SidebarItem[]
  activeTab: string
  sidebarCollapsed: boolean
  onTabChange: (id: string) => void
  onToggleCollapse: () => void
}

const Sidebar = memo(function Sidebar({
  items,
  activeTab,
  sidebarCollapsed,
  onTabChange,
  onToggleCollapse
}: SidebarProps) {
  return (
    <aside
      className={cn(
        "border-r border-border/50 bg-card hidden md:flex flex-col shadow-[2px_0_10px_rgba(0,0,0,0.03)]",
        sidebarCollapsed ? "w-14" : "w-56"
      )}
      style={{ transition: 'width 0.2s ease-in-out' }}
    >
      <div className="p-2 space-y-1">
        {items.map((mode) => (
          <button
            key={mode.id}
            onClick={() => onTabChange(mode.id)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm",
              activeTab === mode.id
                ? "bg-primary/10 text-primary font-medium"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
            style={{ willChange: 'background-color, color' }}
            title={mode.label}
          >
            <mode.Icon className="h-4 w-4 shrink-0" />
            {!sidebarCollapsed && <span>{mode.label}</span>}
          </button>
        ))}
      </div>
      
      <div className="mt-auto p-2">
        <button
          onClick={onToggleCollapse}
          className="w-full flex items-center justify-center p-2 rounded-lg hover:bg-accent transition-colors"
        >
          {sidebarCollapsed ? (
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          ) : (
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          )}
        </button>
      </div>
    </aside>
  )
})

export default Sidebar