import { useCallback, useRef } from 'react'
import { logger } from '@/lib/logger'
import { useAppStore } from '@/lib/store'

/**
 * useAudioDeviceEnumeration —— 枚举音频输入设备，并维护"当前选中设备"的有效性。
 *
 * 从 app/page.tsx 原样搬出（逻辑未改动）：
 *
 * - 两个 ref 只服务于这个函数（异步回调里要拿**最新**的设备列表与当前选择，
 *   不能直接用闭包里的值），所以一起搬进来。它们同步的两个值分别来自
 *   store 的 `audioDevice.devices` 与 `audio.selectedAudioDevice`，
 *   因此 hook 直接读 store，调用方不需要传任何参数。
 * - 只有设备列表**真的变了**（或本地还没有列表）才写回 store，避免无谓更新引发重渲染。
 * - 当前选中的设备已失效（被拔掉/换设备）时自动切到列表第一个。
 * - `showNotification` 只影响日志，不影响行为。
 *
 * 与原实现唯一的差异：deps 由 `[]` 改为 `[setAudioDevices, setSelectedAudioDevice]`。
 * zustand 的 action 引用是稳定的，所以行为不变，但符合 hooks 规范。
 */
export function useAudioDeviceEnumeration() {
  const audioDevices = useAppStore((s) => s.audioDevice.devices)
  const selectedAudioDevice = useAppStore((s) => s.audio.selectedAudioDevice)
  const setAudioDevices = useAppStore((s) => s.setAudioDevices)
  const setSelectedAudioDevice = useAppStore((s) => s.setSelectedAudioDevice)

  const audioDevicesRef = useRef(audioDevices)
  const selectedAudioDeviceRef = useRef(selectedAudioDevice)
  audioDevicesRef.current = audioDevices
  selectedAudioDeviceRef.current = selectedAudioDevice

  const enumerateAudioDevices = useCallback(async (showNotification = false) => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) return

    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const audioInputs = devices.filter(d => d.kind === 'audioinput' && d.deviceId)
      logger.debug('枚举到的音频输入设备:', audioInputs.length, audioInputs.map(d => d.label || '未命名设备'))
      const currentDeviceIds = audioDevicesRef.current.map(d => d.deviceId).sort().join(',')
      const newDeviceIds = audioInputs.map(d => d.deviceId).sort().join(',')
      const hasChanged = currentDeviceIds !== newDeviceIds

      if (hasChanged || audioDevicesRef.current.length === 0) {
        setAudioDevices(audioInputs)

        if (audioInputs.length > 0) {
          const currentDeviceExists = audioInputs.some(d => d.deviceId === selectedAudioDeviceRef.current)
          if (!selectedAudioDeviceRef.current || !currentDeviceExists) {
            setSelectedAudioDevice(audioInputs[0].deviceId)
            logger.debug('自动选择设备:', audioInputs[0].label || audioInputs[0].deviceId)
          }
        }

        if (showNotification && hasChanged) {
          const addedCount = audioInputs.filter(d => !audioDevicesRef.current.some(old => old.deviceId === d.deviceId)).length
          const removedCount = audioDevicesRef.current.filter(d => !audioInputs.some(new_ => new_.deviceId === d.deviceId)).length

          if (addedCount > 0) {
            logger.debug(`🔌 检测到 ${addedCount} 个新音频设备`)
          }
          if (removedCount > 0) {
            logger.debug(`🔌 移除了 ${removedCount} 个音频设备`)
          }
        }
      }
    } catch (err) {
      console.error('枚举设备失败:', err)
    }
  }, [setAudioDevices, setSelectedAudioDevice])

  return { enumerateAudioDevices }
}
