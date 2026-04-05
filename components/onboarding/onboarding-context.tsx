"use client"

import React, { createContext, useContext, useState, useCallback, useEffect } from "react"

export type TranslationFunction = (key: string) => string

export interface OnboardingStep {
  id: string
  titleKey: string
  descriptionKey: string
  targetSelector?: string
  position?: "top" | "bottom" | "left" | "right" | "center"
  actionKey?: string
  highlightArea?: "full" | "target-only"
}

export interface OnboardingConfig {
  steps: OnboardingStep[]
  allowSkip: boolean
  allowPause: boolean
  autoStartOnFirstVisit: boolean
  storageKey: string
}

interface OnboardingContextType {
  isActive: boolean
  currentStepIndex: number
  totalSteps: number
  currentStep: OnboardingStep | null
  progress: number
  isCompleted: boolean
  isPaused: boolean
  startOnboarding: () => void
  stopOnboarding: () => void
  nextStep: () => void
  prevStep: () => void
  skipOnboarding: () => void
  pauseOnboarding: () => void
  resumeOnboarding: () => void
  goToStep: (index: number) => void
  hasSeenOnboarding: boolean
  resetOnboarding: () => void
  t: TranslationFunction
}

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined)

const defaultSteps: OnboardingStep[] = [
  {
    id: "welcome",
    titleKey: "onboarding_welcome_title",
    descriptionKey: "onboarding_welcome_desc",
    position: "center",
    highlightArea: "full",
  },
  {
    id: "tuning-section",
    titleKey: "onboarding_tuner_title",
    descriptionKey: "onboarding_tuner_desc",
    targetSelector: "[data-onboarding='tuner']",
    position: "bottom",
  },
  {
    id: "fretboard",
    titleKey: "onboarding_fretboard_title",
    descriptionKey: "onboarding_fretboard_desc",
    targetSelector: "[data-onboarding='fretboard']",
    position: "top",
  },
  {
    id: "practice-tabs",
    titleKey: "onboarding_practice_tabs_title",
    descriptionKey: "onboarding_practice_tabs_desc",
    targetSelector: "[data-onboarding='practice-tabs']",
    position: "bottom",
  },
  {
    id: "chord-exercise",
    titleKey: "onboarding_chord_exercise_title",
    descriptionKey: "onboarding_chord_exercise_desc",
    targetSelector: "[data-onboarding='chord-exercise']",
    position: "right",
  },
  {
    id: "scale-exercise",
    titleKey: "onboarding_scale_exercise_title",
    descriptionKey: "onboarding_scale_exercise_desc",
    targetSelector: "[data-onboarding='scale-exercise']",
    position: "right",
  },
  {
    id: "settings",
    titleKey: "onboarding_settings_title",
    descriptionKey: "onboarding_settings_desc",
    targetSelector: "[data-onboarding='settings']",
    position: "left",
  },
  {
    id: "shortcuts",
    titleKey: "onboarding_shortcuts_title",
    descriptionKey: "onboarding_shortcuts_desc",
    position: "center",
  },
  {
    id: "complete",
    titleKey: "onboarding_complete_title",
    descriptionKey: "onboarding_complete_desc",
    position: "center",
    highlightArea: "full",
  },
]

interface OnboardingProviderProps {
  children: React.ReactNode
  config?: Partial<OnboardingConfig>
  t?: TranslationFunction
}

export function OnboardingProvider({ children, config, t: externalT }: OnboardingProviderProps) {
  const storageKey = config?.storageKey || "fretmaster-onboarding"
  const steps = config?.steps || defaultSteps

  const defaultT: TranslationFunction = (key: string) => key

  const t = externalT || defaultT

  const [isActive, setIsActive] = useState(false)
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [isCompleted, setIsCompleted] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return
    
    const saved = localStorage.getItem(storageKey)
    if (saved) {
      const data = JSON.parse(saved)
      setHasSeenOnboarding(data.hasSeen || false)
      setIsCompleted(data.completed || false)
    }
  }, [storageKey])

  const saveState = useCallback((updates: Partial<{ hasSeen: boolean; completed: boolean }>) => {
    if (typeof window === "undefined") return
    
    const current = localStorage.getItem(storageKey)
    const data = current ? JSON.parse(current) : {}
    localStorage.setItem(storageKey, JSON.stringify({ ...data, ...updates }))
  }, [storageKey])

  const startOnboarding = useCallback(() => {
    setIsActive(true)
    setCurrentStepIndex(0)
    setIsPaused(false)
    setHasSeenOnboarding(true)
    saveState({ hasSeen: true })
  }, [saveState])

  const stopOnboarding = useCallback(() => {
    setIsActive(false)
    setCurrentStepIndex(0)
    setIsPaused(false)
  }, [])

  const nextStep = useCallback(() => {
    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex(prev => prev + 1)
    } else {
      setIsCompleted(true)
      saveState({ completed: true })
      setIsActive(false)
    }
  }, [currentStepIndex, steps.length, saveState])

  const prevStep = useCallback(() => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(prev => prev - 1)
    }
  }, [currentStepIndex])

  const skipOnboarding = useCallback(() => {
    setIsActive(false)
    setHasSeenOnboarding(true)
    saveState({ hasSeen: true })
  }, [saveState])

  const pauseOnboarding = useCallback(() => {
    setIsPaused(true)
  }, [])

  const resumeOnboarding = useCallback(() => {
    setIsPaused(false)
  }, [])

  const goToStep = useCallback((index: number) => {
    if (index >= 0 && index < steps.length) {
      setCurrentStepIndex(index)
    }
  }, [steps.length])

  const resetOnboarding = useCallback(() => {
    setIsActive(false)
    setCurrentStepIndex(0)
    setIsCompleted(false)
    setHasSeenOnboarding(false)
    setIsPaused(false)
    localStorage.removeItem(storageKey)
  }, [storageKey])

  const currentStep = steps[currentStepIndex] || null
  const progress = ((currentStepIndex + 1) / steps.length) * 100

  useEffect(() => {
    if (config?.autoStartOnFirstVisit !== false && !hasSeenOnboarding && !isCompleted) {
      const timer = setTimeout(() => {
        startOnboarding()
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [config?.autoStartOnFirstVisit, hasSeenOnboarding, isCompleted, startOnboarding])

  const value: OnboardingContextType = {
    isActive,
    currentStepIndex,
    totalSteps: steps.length,
    currentStep,
    progress,
    isCompleted,
    isPaused,
    startOnboarding,
    stopOnboarding,
    nextStep,
    prevStep,
    skipOnboarding,
    pauseOnboarding,
    resumeOnboarding,
    goToStep,
    hasSeenOnboarding,
    resetOnboarding,
    t,
  }

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  )
}

export function useOnboarding() {
  const context = useContext(OnboardingContext)
  if (context === undefined) {
    throw new Error("useOnboarding must be used within an OnboardingProvider")
  }
  return context
}
