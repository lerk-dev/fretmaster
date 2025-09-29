/**
 * 通用工具函数模块
 */

/**
 * 防抖函数
 */
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * 节流函数
 */
export function throttle(func, limit) {
    let inThrottle;
    return function executedFunction(...args) {
        if (!inThrottle) {
            func(...args);
            inThrottle = true;
            setTimeout(() => { inThrottle = false; }, limit);
        }
    };
}

/**
 * 随机打乱数组
 */
export function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

/**
 * 格式化时间
 */
export function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

/**
 * 检查音频支持
 */
export function checkAudioSupport() {
    return !!(window.AudioContext || window.webkitAudioContext) && 
           !!navigator.mediaDevices && 
           !!navigator.mediaDevices.getUserMedia;
}

/**
 * 轻量型状态管理
 */
export class StateManager {
    constructor(initialState = {}) {
        this.state = { ...initialState };
        this.listeners = [];
    }
    
    setState(updates) {
        this.state = { ...this.state, ...updates };
        this.listeners.forEach(listener => listener(this.state));
    }
    
    getState() {
        return { ...this.state };
    }
    
    subscribe(listener) {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }
}

/**
 * DOM元素缓存
 */
export class DOMCache {
    constructor() {
        this.elements = new Map();
    }
    
    get(id) {
        if (!this.elements.has(id)) {
            this.elements.set(id, document.getElementById(id));
        }
        return this.elements.get(id);
    }
    
    clear() {
        this.elements.clear();
    }
}

/**
 * 事件总线
 */
export class EventBus {
    constructor() {
        this.events = new Map();
    }
    
    on(event, callback) {
        if (!this.events.has(event)) {
            this.events.set(event, []);
        }
        this.events.get(event).push(callback);
    }
    
    emit(event, data) {
        if (this.events.has(event)) {
            this.events.get(event).forEach(callback => callback(data));
        }
    }
    
    off(event, callback) {
        if (this.events.has(event)) {
            const callbacks = this.events.get(event);
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        }
    }
}

/**
 * 音效管理
 */
export class SoundManager {
    constructor() {
        this.sounds = new Map();
        this.enabled = true;
        this.volume = 0.5;
    }
    
    loadSound(name, url) {
        const audio = new Audio(url);
        audio.volume = this.volume;
        this.sounds.set(name, audio);
    }
    
    play(name) {
        if (!this.enabled) return;
        const sound = this.sounds.get(name);
        if (sound) {
            sound.currentTime = 0;
            sound.play().catch(e => console.warn(`无法播放音效 ${name}:`, e));
        }
    }
    
    setVolume(volume) {
        this.volume = Math.max(0, Math.min(1, volume));
        this.sounds.forEach(sound => {
            sound.volume = this.volume;
        });
    }
    
    setEnabled(enabled) {
        this.enabled = enabled;
    }
}

/**
 * 屏幕唤醒锁管理
 */
export class WakeLockManager {
    constructor() {
        this.wakeLock = null;
    }
    
    async request() {
        try {
            if ('wakeLock' in navigator) {
                this.wakeLock = await navigator.wakeLock.request('screen');
                console.log('屏幕唤醒锁已激活');
                
                this.wakeLock.addEventListener('release', () => {
                    console.log('屏幕唤醒锁已释放');
                });
                
                return true;
            }
        } catch (err) {
            console.error(`无法获取屏幕唤醒锁: ${err.message}`);
        }
        return false;
    }
    
    release() {
        if (this.wakeLock) {
            this.wakeLock.release();
            this.wakeLock = null;
        }
    }
}

/**
 * 本地存储管理
 */
export class StorageManager {
    static set(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) {
            console.warn('存储失败:', e);
        }
    }
    
    static get(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (e) {
            console.warn('读取失败:', e);
            return defaultValue;
        }
    }
    
    static remove(key) {
        try {
            localStorage.removeItem(key);
        } catch (e) {
            console.warn('删除失败:', e);
        }
    }
}

// 创建全局实例
export const domCache = new DOMCache();
export const eventBus = new EventBus();
export const soundManager = new SoundManager();
export const wakeLockManager = new WakeLockManager();