"use client"

import React, { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useOnboarding } from "./onboarding-context"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Star, Send, MessageSquare, ThumbsUp } from "lucide-react"
import { toast } from "sonner"

interface FeedbackDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function FeedbackDialog({ open, onOpenChange }: FeedbackDialogProps) {
  const { resetOnboarding } = useOnboarding()
  const [rating, setRating] = useState<string>("")
  const [feedback, setFeedback] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)

  const handleSubmit = async () => {
    setIsSubmitting(true)
    
    // 模拟提交
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    // 保存到 localStorage
    const feedbackData = {
      rating,
      feedback,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
    }
    
    const existing = JSON.parse(localStorage.getItem("fretmaster-feedback") || "[]")
    localStorage.setItem("fretmaster-feedback", JSON.stringify([...existing, feedbackData]))
    
    setIsSubmitting(false)
    setIsSubmitted(true)
    toast.success("感谢你的反馈！")
  }

  const handleClose = () => {
    onOpenChange(false)
    setIsSubmitted(false)
    setRating("")
    setFeedback("")
  }

  const handleRestartTutorial = () => {
    resetOnboarding()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <AnimatePresence mode="wait">
          {!isSubmitted ? (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <MessageSquare className="w-5 h-5" />
                  教程完成反馈
                </DialogTitle>
                <DialogDescription>
                  感谢你完成新手教程！请花一分钟告诉我们你的体验，帮助我们改进产品。
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-6 py-4">
                {/* 评分 */}
                <div className="space-y-3">
                  <Label className="text-base">教程对你有帮助吗？</Label>
                  <RadioGroup
                    value={rating}
                    onValueChange={setRating}
                    className="flex gap-2"
                  >
                    {[
                      { value: "1", label: "😕", desc: "没帮助" },
                      { value: "2", label: "😐", desc: "一般" },
                      { value: "3", label: "🙂", desc: "有帮助" },
                      { value: "4", label: "😊", desc: "很有帮助" },
                      { value: "5", label: "🤩", desc: "非常棒" },
                    ].map((item) => (
                      <div key={item.value} className="flex flex-col items-center">
                        <RadioGroupItem
                          value={item.value}
                          id={`rating-${item.value}`}
                          className="peer sr-only"
                        />
                        <Label
                          htmlFor={`rating-${item.value}`}
                          className="flex flex-col items-center gap-1 p-2 rounded-lg border-2 border-muted cursor-pointer transition-all hover:bg-muted peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5"
                        >
                          <span className="text-2xl">{item.label}</span>
                          <span className="text-xs text-muted-foreground">{item.desc}</span>
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>

                {/* 文字反馈 */}
                <div className="space-y-2">
                  <Label htmlFor="feedback">有什么建议或遇到的问题吗？（可选）</Label>
                  <Textarea
                    id="feedback"
                    placeholder="告诉我们你的想法..."
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    className="min-h-[100px] resize-none"
                  />
                </div>

                {/* 功能建议 */}
                <div className="space-y-2">
                  <Label>你最希望增加什么功能？（可多选）</Label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      "更多练习模式",
                      "进度统计",
                      "社交功能",
                      "视频教程",
                      "乐谱导入",
                      "节拍器改进",
                    ].map((feature) => (
                      <Button
                        key={feature}
                        variant="outline"
                        size="sm"
                        className="rounded-full"
                        onClick={() => {
                          setFeedback((prev) =>
                            prev.includes(feature)
                              ? prev
                              : prev + (prev ? "，" : "") + `希望增加：${feature}`
                          )
                        }}
                      >
                        + {feature}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={handleClose}>
                  跳过
                </Button>
                <Button 
                  onClick={handleSubmit} 
                  disabled={!rating || isSubmitting}
                  className="gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      提交中...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      提交反馈
                    </>
                  )}
                </Button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="py-8 text-center space-y-4"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", damping: 10 }}
                className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto"
              >
                <ThumbsUp className="w-8 h-8 text-green-600 dark:text-green-400" />
              </motion.div>
              <div>
                <h3 className="text-lg font-semibold">感谢你的反馈！</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  你的意见对我们非常重要，我们会认真考虑每一条建议。
                </p>
              </div>
              <div className="flex justify-center gap-2 pt-4">
                <Button variant="outline" onClick={handleRestartTutorial}>
                  重新观看教程
                </Button>
                <Button onClick={handleClose}>开始使用</Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  )
}
