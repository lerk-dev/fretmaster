"use client"

import { useOnboarding } from "./onboarding-context"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { HelpCircle, RotateCcw, GraduationCap } from "lucide-react"
import { cn } from "@/lib/utils"
import { useUser } from "@/lib/store"

interface OnboardingTriggerProps {
  variant?: "icon" | "button" | "menu"
  className?: string
  showBadge?: boolean
}

export function OnboardingTrigger({
  variant = "icon",
  className,
  showBadge = true,
}: OnboardingTriggerProps) {
  const { startOnboarding, hasSeenOnboarding, isCompleted, resetOnboarding } = useOnboarding()
  const user = useUser()
  const isZh = user.language === "zh-CN"
  const label = (hasSeenOnboarding || isCompleted)
    ? (isZh ? "重新观看教程" : "Restart Tutorial")
    : (isZh ? "新手指引" : "Getting Started")
  const newBadge = isZh ? "新" : "New"

  const handleClick = () => {
    if (hasSeenOnboarding || isCompleted) {
      resetOnboarding()
      setTimeout(() => startOnboarding(), 100)
    } else {
      startOnboarding()
    }
  }

  const isNew = !hasSeenOnboarding && !isCompleted

  if (variant === "icon") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClick}
              className={cn("relative", className)}
              aria-label={label}
            >
              {hasSeenOnboarding || isCompleted ? (
                <RotateCcw className="w-5 h-5" />
              ) : (
                <HelpCircle className="w-5 h-5" />
              )}
              {showBadge && isNew && (
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{label}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  if (variant === "button") {
    return (
      <Button
        variant={isNew ? "default" : "outline"}
        size="sm"
        onClick={handleClick}
        className={cn("gap-2", className)}
      >
        <GraduationCap className="w-4 h-4" />
        {label}
        {showBadge && isNew && (
          <span className="ml-1 px-1.5 py-0.5 text-xs bg-red-500 text-white rounded-full">
            {newBadge}
          </span>
        )}
      </Button>
    )
  }

  // menu variant
  return (
    <button
      onClick={handleClick}
      className={cn(
        "flex items-center gap-2 w-full px-3 py-2 text-sm rounded-md transition-colors",
        "hover:bg-accent hover:text-accent-foreground",
        className
      )}
    >
      {hasSeenOnboarding || isCompleted ? (
        <RotateCcw className="w-4 h-4" />
      ) : (
        <HelpCircle className="w-4 h-4" />
      )}
      <span className="flex-1 text-left">
        {label}
      </span>
      {showBadge && isNew && (
        <span className="px-1.5 py-0.5 text-xs bg-red-500 text-white rounded-full">
          {newBadge}
        </span>
      )}
    </button>
  )
}
