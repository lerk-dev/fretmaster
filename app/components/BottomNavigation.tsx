"use client"

import { memo } from "react"
import { cn } from "@/lib/utils"

interface BottomNavItem {
  id: string
  label: string
  Icon: React.ComponentType<{ className?: string }>
}

interface BottomNavigationProps {
  items: BottomNavItem[]
  activeTab: string
  onTabChange: (id: string) => void
}

const BottomNavigation = memo(function BottomNavigation({
  items,
  activeTab,
  onTabChange
}: BottomNavigationProps) {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border/50 z-50 shadow-lg">
      <div className="flex">
        {items.map((mode) => (
          <button
            key={mode.id}
            onClick={() => onTabChange(mode.id)}
            className={cn(
              "flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg min-w-[3rem]",
              activeTab === mode.id
                ? "bg-primary/10 text-primary font-medium"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
            style={{ willChange: 'background-color, color' }}
            title={mode.label}
          >
            <mode.Icon className="h-4 w-4" />
            <span className="text-[10px] leading-none">{mode.label}</span>
          </button>
        ))}
      </div>
    </nav>
  )
})

export default BottomNavigation