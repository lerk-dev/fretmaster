"use client"

import { memo } from "react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface HeaderProps {
  isPlaying: boolean
  score: { correct: number; total: number }
  practiceTime: number
  timeLeft: number
  detectedPitch: string | null
  detectedCents: number | null
  t: (key: string) => string
}

const Header = memo(function Header({
  isPlaying,
  score,
  practiceTime,
  timeLeft,
  detectedPitch,
  detectedCents,
  t
}: HeaderProps) {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <header className="border-b border-border/50 bg-card sticky top-0 z-50 shadow-sm">
      <div className="container mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <svg className="h-5 w-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2v20m-9-9h18" />
            </svg>
          </div>
          <div>
            <h1 className="text-base font-semibold text-foreground">FretMaster</h1>
            <p className="text-[10px] text-muted-foreground">{t('app_title').replace('🎸 ', '')}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Score display */}
          {isPlaying && (
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="font-mono text-xs">
                {score.correct}/{score.total}
              </Badge>
              {score.total > 0 && (
                <Badge variant={score.correct / score.total >= 0.7 ? "default" : "secondary"} className="text-xs">
                  {Math.round((score.correct / score.total) * 100)}%
                </Badge>
              )}
            </div>
          )}
          
          {/* Timer */}
          {isPlaying && practiceTime > 0 && (
            <Badge variant="outline" className="font-mono gap-1 text-xs">
              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {formatTime(timeLeft)}
            </Badge>
          )}
          
          {/* Detected Pitch */}
          {detectedPitch && (
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="font-mono text-xs bg-primary/10">
                {detectedPitch}
              </Badge>
              {detectedCents !== null && (
                <Badge 
                  variant="outline" 
                  className={cn(
                    "font-mono text-xs",
                    detectedCents <= 15 ? "bg-green-500/20 text-green-600" :
                    detectedCents <= 30 ? "bg-yellow-500/20 text-yellow-600" :
                    "bg-red-500/20 text-red-600"
                  )}
                >
                  {detectedCents > 0 ? '+' : ''}{detectedCents}¢
                </Badge>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  )
})

export default Header