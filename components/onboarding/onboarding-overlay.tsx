"use client"

import React, { useEffect, useState, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useOnboarding } from "./onboarding-context"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { 
  X, 
  ChevronRight, 
  ChevronLeft, 
  Play, 
  Pause,
  SkipForward,
  HelpCircle
} from "lucide-react"
import { cn } from "@/lib/utils"

function getTargetRect(selector: string): DOMRect | null {
  const element = document.querySelector(selector)
  return element?.getBoundingClientRect() || null
}

function calculateTooltipPosition(
  targetRect: DOMRect | null,
  position: string,
  tooltipWidth: number,
  tooltipHeight: number
): { x: number; y: number } {
  const padding = 16
  
  if (!targetRect || position === "center") {
    return {
      x: window.innerWidth / 2 - tooltipWidth / 2,
      y: window.innerHeight / 2 - tooltipHeight / 2,
    }
  }

  let x = 0
  let y = 0

  switch (position) {
    case "top":
      x = targetRect.left + targetRect.width / 2 - tooltipWidth / 2
      y = targetRect.top - tooltipHeight - padding
      break
    case "bottom":
      x = targetRect.left + targetRect.width / 2 - tooltipWidth / 2
      y = targetRect.bottom + padding
      break
    case "left":
      x = targetRect.left - tooltipWidth - padding
      y = targetRect.top + targetRect.height / 2 - tooltipHeight / 2
      break
    case "right":
      x = targetRect.right + padding
      y = targetRect.top + targetRect.height / 2 - tooltipHeight / 2
      break
    default:
      x = targetRect.left + targetRect.width / 2 - tooltipWidth / 2
      y = targetRect.bottom + padding
  }

  x = Math.max(padding, Math.min(x, window.innerWidth - tooltipWidth - padding))
  y = Math.max(padding, Math.min(y, window.innerHeight - tooltipHeight - padding))

  return { x, y }
}

export function OnboardingOverlay() {
  const {
    isActive,
    currentStep,
    currentStepIndex,
    totalSteps,
    progress,
    isPaused,
    nextStep,
    prevStep,
    skipOnboarding,
    pauseOnboarding,
    resumeOnboarding,
    t,
  } = useOnboarding()

  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  const [tooltipSize, setTooltipSize] = useState({ width: 320, height: 200 })

  const updateTargetPosition = useCallback(() => {
    if (currentStep?.targetSelector) {
      const rect = getTargetRect(currentStep.targetSelector)
      setTargetRect(rect)
    } else {
      setTargetRect(null)
    }
  }, [currentStep])

  useEffect(() => {
    if (isActive) {
      updateTargetPosition()
      
      const handleResize = () => updateTargetPosition()
      const handleScroll = () => updateTargetPosition()
      
      window.addEventListener("resize", handleResize)
      window.addEventListener("scroll", handleScroll, true)
      
      return () => {
        window.removeEventListener("resize", handleResize)
        window.removeEventListener("scroll", handleScroll, true)
      }
    }
  }, [isActive, currentStep, updateTargetPosition])

  useEffect(() => {
    if (isActive && currentStep?.targetSelector && targetRect) {
      const element = document.querySelector(currentStep.targetSelector)
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" })
      }
    }
  }, [isActive, currentStep, targetRect])

  if (!isActive || !currentStep) return null

  const position = currentStep.position || "bottom"
  const { x, y } = calculateTooltipPosition(
    targetRect,
    position,
    tooltipSize.width,
    tooltipSize.height
  )

  const isFirstStep = currentStepIndex === 0
  const isLastStep = currentStepIndex === totalSteps - 1

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] pointer-events-none">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/60 pointer-events-auto"
          onClick={pauseOnboarding}
        />

        {targetRect && currentStep.highlightArea !== "full" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute pointer-events-none"
            style={{
              left: targetRect.left - 8,
              top: targetRect.top - 8,
              width: targetRect.width + 16,
              height: targetRect.height + 16,
              boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.6)",
              borderRadius: "8px",
            }}
          >
            <motion.div
              className="absolute inset-0 rounded-lg border-2 border-primary"
              animate={{
                boxShadow: [
                  "0 0 0 0 rgba(var(--primary), 0.4)",
                  "0 0 0 10px rgba(var(--primary), 0)",
                ],
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: "easeOut",
              }}
            />
          </motion.div>
        )}

        <motion.div
          ref={(el) => {
            if (el) {
              const rect = el.getBoundingClientRect()
              setTooltipSize({ width: rect.width, height: rect.height })
            }
          }}
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ 
            opacity: isPaused ? 0.5 : 1, 
            scale: 1, 
            x,
            y,
          }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className={cn(
            "absolute pointer-events-auto",
            "w-[320px] sm:w-[380px]",
            "bg-card border border-border rounded-xl shadow-2xl",
            "p-5"
          )}
        >
          {isPaused && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 bg-card/95 rounded-xl flex flex-col items-center justify-center gap-3 z-10"
            >
              <p className="text-sm text-muted-foreground">{t('onboarding_paused')}</p>
              <Button size="sm" onClick={resumeOnboarding}>
                <Play className="w-4 h-4 mr-2" />
                {t('onboarding_continue')}
              </Button>
            </motion.div>
          )}

          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                {currentStepIndex + 1} / {totalSteps}
              </span>
              {isPaused && (
                <span className="text-xs text-amber-500 flex items-center gap-1">
                  <Pause className="w-3 h-3" />
                  {t('onboarding_paused')}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {!isPaused && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={pauseOnboarding}
                >
                  <Pause className="w-4 h-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={skipOnboarding}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <Progress value={progress} className="h-1 mb-4" />

          <div className="space-y-3">
            <h3 className="text-lg font-semibold">{t(currentStep.titleKey)}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {t(currentStep.descriptionKey)}
            </p>
            {currentStep.actionKey && (
              <p className="text-xs text-primary font-medium">
                💡 {t('onboarding_tip')}: {t(currentStep.actionKey)}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between mt-5 pt-4 border-t border-border">
            <Button
              variant="ghost"
              size="sm"
              onClick={prevStep}
              disabled={isFirstStep}
              className="gap-1"
            >
              <ChevronLeft className="w-4 h-4" />
              {t('onboarding_prev')}
            </Button>

            <div className="flex items-center gap-2">
              {!isLastStep && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={skipOnboarding}
                  className="text-muted-foreground"
                >
                  <SkipForward className="w-4 h-4 mr-1" />
                  {t('onboarding_skip')}
                </Button>
              )}
              <Button size="sm" onClick={nextStep} className="gap-1">
                {isLastStep ? t('onboarding_finish') : t('onboarding_next')}
                {!isLastStep && <ChevronRight className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </motion.div>

        {!targetRect && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
          >
            <motion.div
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="text-white/20 text-6xl"
            >
              <HelpCircle className="w-24 h-24" />
            </motion.div>
          </motion.div>
        )}
      </div>
    </AnimatePresence>
  )
}
