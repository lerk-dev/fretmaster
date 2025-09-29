/**
 * 音频处理模块 - 处理音频输入、设备管理和音频处理
 */

import { AUDIO_CONFIG, YIN_CONFIG } from './config.js';
import { Pitchfinder, EnhancedPitchDetector, checkPitchMatch } from './pitch-detection.js';
import { ml5PitchDetector } from './ml5-pitch.js';

// 音频变量
let audioContext = null;
let analyser = null;
let microphone = null;
let javascriptNode = null;
let mediaStream = null;
let gainNode = null;
let isRecording = false;

// 音频设备管理
let audioDevices = [];
let selectedDeviceId = 'default';
let inputGain = 1.0;

// 音高检测器
const enhancedPitchDetector = new EnhancedPitchDetector();

/**
 * 获取音频设备列表
 */
export async function getAudioDevices() {
    try {
        // 请求权限以获取设备标签
        await navigator.mediaDevices.getUserMedia({ audio: true });

        const devices = await navigator.mediaDevices.enumerateDevices();
        audioDevices = devices.filter(device => device.kind === 'audioinput');

        return audioDevices;
    } catch (error) {
        console.error('获取音频设备失败:', error);
        throw error;
    }
}

/**
 * 启动麦克风录音 - 支持设备选择
 */
export async function startRecording() {
    if (isRecording) return;

    try {
        // 检查浏览器支持
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('浏览器不支持音频输入');
        }

        // 设置音频约束
        const constraints = {
            audio: {
                deviceId: selectedDeviceId !== 'default' ?
                    { exact: selectedDeviceId } : undefined,
                sampleRate: AUDIO_CONFIG.sampleRate,
                channelCount: 1,
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
                latency: 0.01
            }
        };

        // 请求麦克风权限并获取媒体流
        try {
            mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (permissionError) {
            // 处理权限错误
            if (permissionError.name === 'NotAllowedError' || permissionError.name === 'PermissionDeniedError') {
                console.error('麦克风权限被拒绝:', permissionError);
                
                // 触发自定义事件，通知应用程序权限被拒绝
                const event = new CustomEvent('microphone-permission-denied', {
                    detail: { error: permissionError }
                });
                window.dispatchEvent(event);
                
                // 显示权限指导
                showPermissionGuidance();
                
                throw new Error('麦克风权限被拒绝，请在浏览器设置中允许访问麦克风');
            }
            throw permissionError;
        }

        // 创建音频上下文
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: AUDIO_CONFIG.sampleRate,
                latencyHint: AUDIO_CONFIG.latencyHint
            });
        } else if (audioContext.state === 'suspended') {
            // 如果音频上下文被暂停，尝试恢复
            await audioContext.resume();
        }

        // 创建音频处理节点
        analyser = audioContext.createAnalyser();
        analyser.fftSize = AUDIO_CONFIG.fftSize;
        analyser.smoothingTimeConstant = 0.8;

        // 创建增益节点用于音量控制
        gainNode = audioContext.createGain();
        gainNode.gain.value = inputGain;

        // 创建处理节点
        if (audioContext.createScriptProcessor) {
            javascriptNode = audioContext.createScriptProcessor(AUDIO_CONFIG.bufferSize, 1, 1);
        } else {
            throw new Error('浏览器不支持音频处理');
        }
        
        javascriptNode.onaudioprocess = processAudio;

        // 创建麦克风源
        microphone = audioContext.createMediaStreamSource(mediaStream);

        // 连接音频节点：麦克风 -> 增益 -> 分析器 -> 处理节点 -> 输出
        microphone.connect(gainNode);
        gainNode.connect(analyser);
        analyser.connect(javascriptNode);
        javascriptNode.connect(audioContext.destination);

        isRecording = true;

        // 尝试初始化ml5 CREPE
        try {
            if (typeof ml5 !== 'undefined') {
                console.log('初始化ml5 CREPE音高检测...');
                await ml5PitchDetector.initialize(audioContext, mediaStream);
                
                // 触发CREPE就绪事件
                const event = new CustomEvent('crepe-ready');
                window.dispatchEvent(event);
            }
        } catch (error) {
            console.warn('初始化ml5 CREPE失败，使用YIN算法:', error);
        }

        // 触发录音开始事件
        const startEvent = new CustomEvent('recording-started', {
            detail: {
                deviceId: selectedDeviceId,
                deviceName: selectedDeviceId === 'default' ? '默认设备' :
                    audioDevices.find(d => d.deviceId === selectedDeviceId)?.label
            }
        });
        window.dispatchEvent(startEvent);

        console.log('音频输入已启动，设备:',
            selectedDeviceId === 'default' ? '默认设备' :
                audioDevices.find(d => d.deviceId === selectedDeviceId)?.label);

        return true;

    } catch (e) {
        console.error('音频初始化失败:', e);

        // 尝试使用默认设置
        if (e.name === 'OverconstrainedError') {
            console.log('尝试使用兼容的音频设置...');
            try {
                mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                initializeBasicAudio();
                return true;
            } catch (fallbackError) {
                console.error('备用音频初始化也失败:', fallbackError);
                
                // 触发录音失败事件
                const failEvent = new CustomEvent('recording-failed', {
                    detail: { error: fallbackError }
                });
                window.dispatchEvent(failEvent);
                
                throw fallbackError;
            }
        } else {
            // 触发录音失败事件
            const failEvent = new CustomEvent('recording-failed', {
                detail: { error: e }
            });
            window.dispatchEvent(failEvent);
            
            throw e;
        }
    }
}

/**
 * 简化的音频初始化（兼容模式）
 */
function initializeBasicAudio() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    analyser = audioContext.createAnalyser();
    analyser.fftSize = AUDIO_CONFIG.fftSize;
    javascriptNode = audioContext.createScriptProcessor(AUDIO_CONFIG.bufferSize, 1, 1);
    javascriptNode.onaudioprocess = processAudio;

    microphone = audioContext.createMediaStreamSource(mediaStream);
    microphone.connect(analyser);
    analyser.connect(javascriptNode);
    javascriptNode.connect(audioContext.destination);

    isRecording = true;
    console.log('音频输入已启动(兼容模式)');
}

/**
 * 停止麦克风录音
 */
export function stopRecording() {
    if (!isRecording) return;

    if (javascriptNode) {
        javascriptNode.disconnect();
    }
    if (analyser) {
        analyser.disconnect();
    }
    if (microphone) {
        microphone.disconnect();
    }
    if (gainNode) {
        gainNode.disconnect();
    }

    isRecording = false;
}

/**
 * 完全关闭麦克风（退出应用时使用）
 */
/**
 * 显示麦克风权限指导
 */
function showPermissionGuidance() {
    // 检查是否已经显示了指导
    if (document.getElementById('permission-guidance')) {
        return;
    }
    
    const guidance = document.createElement('div');
    guidance.id = 'permission-guidance';
    guidance.className = 'permission-guidance';
    guidance.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(40, 40, 50, 0.95);
        padding: 20px;
        border-radius: 12px;
        z-index: 2000;
        width: 80%;
        max-width: 400px;
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        color: white;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6);
    `;
    
    guidance.innerHTML = `
        <h3 style="margin-bottom: 15px; color: #3a9fc4;">需要麦克风权限</h3>
        <p style="margin-bottom: 15px;">此应用需要麦克风权限才能检测音高。请按照以下步骤操作：</p>
        <ol style="margin-left: 20px; margin-bottom: 20px; line-height: 1.5;">
            <li>点击浏览器地址栏左侧的锁定/信息图标</li>
            <li>在弹出的菜单中找到"麦克风"选项</li>
            <li>将其设置为"允许"</li>
            <li>刷新页面后重试</li>
        </ol>
        <div style="display: flex; justify-content: space-between;">
            <button id="refresh-page" style="padding: 10px 15px; background: #3a9fc4; border: none; border-radius: 5px; color: white; cursor: pointer;">刷新页面</button>
            <button id="dismiss-guidance" style="padding: 10px 15px; background: #6c757d; border: none; border-radius: 5px; color: white; cursor: pointer;">关闭提示</button>
        </div>
    `;
    
    document.body.appendChild(guidance);
    
    // 添加事件监听器
    document.getElementById('refresh-page').addEventListener('click', () => {
        location.reload();
    });
    
    document.getElementById('dismiss-guidance').addEventListener('click', () => {
        document.body.removeChild(guidance);
    });
}

export function closeMicrophone() {
    stopRecording();

    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }

    if (audioContext) {
        audioContext.close();
        audioContext = null;
    }
}

/**
 * 使用指定设备重新启动音频
 */
export async function restartAudioWithNewDevice() {
    stopRecording();
    await new Promise(resolve => setTimeout(resolve, 100));
    return startRecording();
}

/**
 * 设置所选设备
 */
export function setSelectedDevice(deviceId) {
    selectedDeviceId = deviceId;
}

/**
 * 设置输入增益
 */
export function setInputGain(gain) {
    inputGain = gain;
    if (gainNode) {
        gainNode.gain.value = inputGain;
    }
}

/**
 * 获取当前录音状态
 */
export function getRecordingStatus() {
    return {
        isRecording,
        selectedDevice: selectedDeviceId,
        inputGain,
        audioContext: !!audioContext
    };
}

/**
 * 辅助函数和类
 */
class MedianFilter {
    constructor(size) {
        this.size = Math.max(1, size | 0);
        this.buffer = [];
    }
    push(val) {
        this.buffer.push(val == null ? null : val);
        if (this.buffer.length > this.size) this.buffer.shift();
        const arr = this.buffer.filter(v => v != null);
        if (arr.length === 0) return null;
        const sorted = arr.slice().sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        if (sorted.length % 2 === 1) return sorted[mid];
        return (sorted[mid - 1] + sorted[mid]) / 2;
    }
}

function ema(prev, current, alpha) {
    if (prev == null) return current;
    return alpha * current + (1 - alpha) * prev;
}

function applyHannWindow(buf) {
    const N = buf.length;
    for (let i = 0; i < N; i++) {
        const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)));
        buf[i] *= w;
    }
}

function rms(buf) {
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    return Math.sqrt(sum / buf.length);
}

// 音高检测辅助变量
const medianFilter = new MedianFilter(5);
let smoothedFreq = null;

/**
 * 增强低频检测的音频处理函数
 */
function processAudio(event) {
    // 此函数由外部模块设置，用于处理实时音频数据
    // 在实际使用中，这个函数会被主应用程序设置
    if (window.audioProcessCallback) {
        window.audioProcessCallback(event);
    }
}

/**
 * 设置音频处理回调
 */
export function setAudioProcessCallback(callback) {
    window.audioProcessCallback = callback;
}

/**
 * 应用高通滤波器
 */
export function applyHighPassFilter(buffer, cutoffFreq, sampleRate) {
    const RC = 1.0 / (cutoffFreq * 2 * Math.PI);
    const dt = 1.0 / sampleRate;
    const alpha = RC / (RC + dt);

    let y = buffer[0];
    for (let i = 1; i < buffer.length; i++) {
        y = alpha * (y + buffer[i] - buffer[i - 1]);
        buffer[i] = y;
    }
}

/**
 * 应用低通滤波器
 */
export function applyLowPassFilter(buffer, cutoffFreq, sampleRate) {
    const RC = 1.0 / (cutoffFreq * 2 * Math.PI);
    const dt = 1.0 / sampleRate;
    const alpha = dt / (RC + dt);

    let y = buffer[0];
    for (let i = 1; i < buffer.length; i++) {
        y = y + alpha * (buffer[i] - y);
        buffer[i] = y;
    }
}

/**
 * 计算信号强度作为置信度的估计
 */
export function calculateSignalStrength(buffer) {
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) {
        sum += Math.abs(buffer[i]);
    }
    const average = sum / buffer.length;
    return Math.min(1.0, average * 10);
}

/**
 * 下采样缓冲区
 */
export function downsampleBuffer(buffer, originalRate, targetRate) {
    if (targetRate >= originalRate) return buffer.slice(0);
    const ratio = originalRate / targetRate;
    const newLength = Math.floor(buffer.length / ratio);
    const out = new Float32Array(newLength);
    for (let i = 0; i < newLength; i++) {
        const start = Math.floor(i * ratio);
        const end = Math.floor((i + 1) * ratio);
        let sum = 0;
        for (let j = start; j < end && j < buffer.length; j++) sum += buffer[j];
        out[i] = sum / Math.max(1, end - start);
    }
    return out;
}

export { isRecording, audioContext, analyser };