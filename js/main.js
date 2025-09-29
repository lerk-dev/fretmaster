/**
 * 主应用入口 - 整合所有模块功能
 */

import { defaultState, scaleTypes, chordTypes, noteToSemitones, intervalToSemitones } from './config.js';
import { getAudioDevices, startRecording, stopRecording, setSelectedDevice, setInputGain, setAudioProcessCallback } from './audio.js';
import { Pitchfinder, checkPitchMatch, frequencyToNoteName } from './pitch-detection.js';
import { generateScaleExercise, generateChordExercise, generateNextExercise, formatChordSymbol } from './exercises.js';
import { getAllNotes } from './note-utils.js';
import { debounce, domCache, eventBus, soundManager, wakeLockManager } from './utils.js';
import { ml5PitchDetector } from './ml5-pitch.js';

// 暴露scaleTypes对象到全局window对象，以便index.html中的内联脚本可以访问
window.scaleTypes = scaleTypes;

/**
 * 查找音阶中第一个出现的指定音程类型（如'3', '♭3', '♯3'等）
 * @param {Array} intervals - 音阶的音程数组
 * @param {string} intervalType - 要查找的音程类型（如'3'）
 * @returns {string|null} 找到的音程，如果音阶中不存在该度数的音程则返回null
 */
function findFirstIntervalOfType(intervals, intervalType) {
    // 特殊处理：对于blues音阶等特殊音阶，优先检查是否有对应度数的变音记号版本
    // 例如，对于blues音阶，3度可能是♭3，7度可能是♭7
    if (intervalType === '3') {
        for (let i = 0; i < intervals.length; i++) {
            if (intervals[i] === '♭3') {
                return intervals[i];
            }
        }
    } else if (intervalType === '7') {
        for (let i = 0; i < intervals.length; i++) {
            if (intervals[i] === '♭7') {
                return intervals[i];
            }
        }
    }
    
    // 检查音阶中是否包含该度数的任何变体
    // 例如，对于3度，查找b3、3、#3等
    for (let i = 0; i < intervals.length; i++) {
        // 提取数字部分（移除变音记号）
        const intervalNumber = intervals[i].replace(/[^0-9]/g, '');
        if (intervalNumber === intervalType) {
            return intervals[i];
        }
    }
    
    // 如果没找到该度数的音程，返回null
    return null;
}

/**
 * 当音阶中缺少特定音程时，查找音阶中实际存在的最近音程
 * @param {Array} intervals - 音阶的音程数组
 * @param {string} degree - 要查找的度数（如'3'代表3度）
 * @returns {string} 找到的音程
 */
function findNearestIntervalInScale(intervals, degree) {
    // 首先尝试查找指定度数的音程
    const foundInterval = findFirstIntervalOfType(intervals, degree);
    if (foundInterval) {
        return foundInterval;
    }
    
    // 如果没找到，根据音程类型选择最近的替代音程
    switch (degree) {
        case '3':
            // 3音缺失时，查找4音（优先）或2音
            for (let i = 0; i < intervals.length; i++) {
                const intervalNumber = intervals[i].replace(/[^0-9]/g, '');
                if (intervalNumber === '4') {
                    return intervals[i];
                }
            }
            for (let i = 0; i < intervals.length; i++) {
                const intervalNumber = intervals[i].replace(/[^0-9]/g, '');
                if (intervalNumber === '2') {
                    return intervals[i];
                }
            }
            break;
        case '5':
            // 5音缺失时，查找4音或6音
            for (let i = 0; i < intervals.length; i++) {
                const intervalNumber = intervals[i].replace(/[^0-9]/g, '');
                if (intervalNumber === '4') {
                    return intervals[i];
                }
            }
            for (let i = 0; i < intervals.length; i++) {
                const intervalNumber = intervals[i].replace(/[^0-9]/g, '');
                if (intervalNumber === '6') {
                    return intervals[i];
                }
            }
            break;
        case '7':
            // 7音缺失时，查找6音（优先）或1音
            for (let i = 0; i < intervals.length; i++) {
                const intervalNumber = intervals[i].replace(/[^0-9]/g, '');
                if (intervalNumber === '6') {
                    return intervals[i];
                }
            }
            // 查找根音
            for (let i = 0; i < intervals.length; i++) {
                const intervalNumber = intervals[i].replace(/[^0-9]/g, '');
                if (intervalNumber === '1') {
                    return intervals[i];
                }
            }
            break;
    }
    
    // 如果还是没找到，返回音阶中的第一个音程作为默认值
    return intervals.length > 0 ? intervals[0] : '1';
}

// 全局状态
let state = { ...defaultState };
let currentAudioContext = null;
let currentStream = null;
let useCrepe = true; // 是否使用CREPE

// 音频处理回调 - 增强版，支持CREPE和YIN
async function processAudio(event) {
    if (!state.isRecording) return;
    
    // 如果已经回答正确或处于冷却期，不处理音频输入
    if (state.isAnswered || state.isCoolingDown) {
        // 更新UI以显示当前状态
        const statusEl = document.getElementById('statusIndicator');
        if (statusEl) {
            if (state.isCoolingDown) {
                statusEl.textContent = '准备下一题...';
                statusEl.className = 'status-indicator status-info';
            }
        }
        return;
    }

    const inputData = event.inputBuffer.getChannelData(0);
    const sampleRate = event.inputBuffer.sampleRate;

    let detectedFreq = null;
    let confidence = 0;

    // 尝试使用CREPE
    if (useCrepe && ml5PitchDetector.isModelReady()) {
        try {
            const crepeResult = await ml5PitchDetector.getPitch();
            if (crepeResult && crepeResult.frequency > 0) {
                detectedFreq = crepeResult.frequency;
                confidence = 0.9; // CREPE的高置信度
            }
        } catch (error) {
            console.warn('使用CREPE失败，回退到YIN:', error);
        }
    }

    // 如果CREPE没有结果，使用YIN算法
    if (!detectedFreq) {
        // 动态调整YIN算法参数
        const isLowFrequencyTarget = state.currentSequence.some(interval => {
            const rootValue = noteToSemitones[state.rootNote];
            const semitone = (rootValue + intervalToSemitones[interval]) % 12;
            const freq = 440 * Math.pow(2, (semitone - 9) / 12);
            return freq < 110;
        });

        const yinParams = isLowFrequencyTarget ?
            { threshold: 0.05, probabilityCliff: 0.05 } :
            { threshold: 0.1, probabilityCliff: 0.1 };

        const yinResult = Pitchfinder.YIN(yinParams)(inputData);
        if (yinResult && yinResult.frequency) {
            const energy = rms(inputData);
            const energyThreshold = yinResult.frequency < 110 ? 0.001 : 0.002;
            
            if (energy >= energyThreshold) {
                detectedFreq = yinResult.frequency;
                confidence = yinResult.probability || 0.7;

                // 低频优化
                if (detectedFreq < 110) {
                    const possibleFundamental = detectedFreq / 2;
                    const fundamentalResult = Pitchfinder.YIN(yinParams)(inputData);
                    if (fundamentalResult && fundamentalResult.frequency &&
                        Math.abs(fundamentalResult.frequency - possibleFundamental) < 5) {
                        detectedFreq = possibleFundamental;
                    }
                }
            }
        }
    }

    if (!detectedFreq) return;

    const currentInterval = state.currentSequence[state.currentStep];
    const rootValue = noteToSemitones[state.rootNote];
    const targetSemitone = (rootValue + intervalToSemitones[currentInterval]) % 12;
    const targetFrequency = 440 * Math.pow(2, (targetSemitone - 9) / 12);

    const cents = 1200 * Math.log2(detectedFreq / targetFrequency);
    const centsMod = Math.abs(cents) % 1200;
    const adjustedCents = centsMod > 600 ? 1200 - centsMod : centsMod;

    const threshold = detectedFreq < 110 ? 35 : currentInterval === '1' ? 25 : 15;

    if (adjustedCents <= threshold && confidence > 0.6) {
        handleCorrectAnswer();
    }

    updatePitchDisplay(detectedFreq, cents, confidence);
}

function rms(buf) {
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    return Math.sqrt(sum / buf.length);
}

function handleCorrectAnswer() {
    state.correctCount++;
    state.currentStep++;
    const justDone = state.currentStep - 1;

    const el = document.querySelector(`.sequence-item[data-index="${justDone}"]`);
    if (el) {
        el.classList.remove('current');
        el.classList.add('played');
    }

    if (state.currentStep >= state.currentSequence.length) {
        // 完成当前练习
        state.isAnswered = true;
        
        // 只有在启用冷却时间时才设置冷却状态
        if (state.enableCooldown) {
            state.isCoolingDown = true;
        }
        
        // 显示完成状态
        const statusEl = document.getElementById('statusIndicator');
        if (statusEl) {
            statusEl.textContent = '练习完成！准备下一题...';
            statusEl.className = 'status-indicator status-success';
        }
        
        // 清除之前的冷却计时器
        if (state.cooldownTimeout) {
            clearTimeout(state.cooldownTimeout);
        }
        
        // 预先生成下一个练习数据
        let nextExercise = null;
        try {
            nextExercise = generateNextExercise();
            
            // 立即更新下一题显示
            if (nextExercise) {
                const nextExerciseEl = document.getElementById('nextExercise');
                if (nextExerciseEl) {
                    nextExerciseEl.innerHTML = `${nextExercise.name}<br><span style="font-size: 14px; color: #94a3b8;">${nextExercise.intervals.join(' ')}</span>`;
                }
            }
        } catch (error) {
            console.error('预生成下一个练习失败:', error);
        }
        
        // 只有在启用冷却时间时才设置冷却期结束的计时器
        if (state.enableCooldown) {
            state.cooldownTimeout = setTimeout(() => {
                state.isCoolingDown = false;
                
                // 应用预生成的练习
                if (nextExercise) {
                    try {
                        // 更新状态
                        state.rootNote = nextExercise.rootNote;
                        state.currentIntervals = nextExercise.intervals;
                        state.currentSequence = nextExercise.sequence;
                        
                        if (nextExercise.scaleType) {
                            state.scaleType = nextExercise.scaleType;
                        } else if (nextExercise.chordType) {
                            state.chordType = nextExercise.chordType;
                        }
                        
                        // 重置状态
                        state.pitchBuffer = [];
                        state.isAnswered = false;
                        state.currentStep = 0;
                        
                        // 更新UI
                        const targetIntervalEl = document.getElementById('targetInterval');
                        if (targetIntervalEl) targetIntervalEl.textContent = nextExercise.name;
                        
                        // 显示新序列
                        displaySequence();
                        
                        // 更新状态指示器
                        const statusEl = document.getElementById('statusIndicator');
                        if (statusEl) {
                            statusEl.textContent = '新练习已生成';
                            statusEl.className = 'status-indicator status-ready';
                        }
                        
                        // 确保下一题显示被清除
                        const nextExerciseEl = document.getElementById('nextExercise');
                        if (nextExerciseEl) {
                            nextExerciseEl.textContent = '-';
                        }
                    } catch (error) {
                        console.error('应用预生成练习失败:', error);
                        // 回退到常规生成
                        generateExercise();
                    }
                } else {
                    // 如果预生成失败，使用常规生成
                    generateExercise();
                }
            }, state.cooldownDuration);
        } else {
            // 如果未启用冷却时间，立即应用预生成的练习
            if (nextExercise) {
                try {
                    // 更新状态
                    state.rootNote = nextExercise.rootNote;
                    state.currentIntervals = nextExercise.intervals;
                    state.currentSequence = nextExercise.sequence;
                    
                    if (nextExercise.scaleType) {
                        state.scaleType = nextExercise.scaleType;
                    } else if (nextExercise.chordType) {
                        state.chordType = nextExercise.chordType;
                    }
                    
                    // 重置状态
                    state.pitchBuffer = [];
                    state.isAnswered = false;
                    state.currentStep = 0;
                    
                    // 更新UI
                    const targetIntervalEl = document.getElementById('targetInterval');
                    if (targetIntervalEl) targetIntervalEl.textContent = nextExercise.name;
                    
                    // 显示新序列
                    displaySequence();
                    
                    // 更新状态指示器
                    const statusEl = document.getElementById('statusIndicator');
                    if (statusEl) {
                        statusEl.textContent = '新练习已生成';
                        statusEl.className = 'status-indicator status-ready';
                    }
                    
                    // 确保下一题显示被清除
                    const nextExerciseEl = document.getElementById('nextExercise');
                    if (nextExerciseEl) {
                        nextExerciseEl.textContent = '-';
                    }
                } catch (error) {
                    console.error('应用预生成练习失败:', error);
                    // 回退到常规生成
                    generateExercise();
                }
            } else {
                // 如果预生成失败，使用常规生成
                generateExercise();
            }
        }
    } else {
        // 移动到下一个音符
        const next = document.querySelector(`.sequence-item[data-index="${state.currentStep}"]`);
        if (next) next.classList.add('current');
    }
}

function updatePitchDisplay(frequency, cents, confidence) {
    const pitchDisplay = document.getElementById('pitchDisplay');
    if (!pitchDisplay) return;

    const note = frequencyToNoteName(frequency);
    const adjustedCents = cents % 1200;
    const roundedCents = Math.round(adjustedCents > 600 ? adjustedCents - 1200 : adjustedCents);
    const inTune = Math.abs(adjustedCents) <= 20;

    pitchDisplay.innerHTML = `
        <div>音高: ${note.name}${note.octave} (${Math.round(frequency)}Hz)</div>
        <div>音分差: ${adjustedCents > 0 ? '+' : ''}${roundedCents}</div>
        <div class="confidence-bar">
            <div class="confidence-fill" style="width: ${Math.round(confidence * 100)}%"></div>
        </div>
    `;

    pitchDisplay.classList.toggle('in-tune', inTune);
    pitchDisplay.classList.toggle('out-of-tune', !inTune);
}

function generateExercise() {
    // 重置状态
    state.pitchBuffer = [];
    state.isAnswered = false;
    state.currentStep = 0;
    state.isCoolingDown = false;

    // 清除冷却计时器
    if (state.cooldownTimeout) {
        clearTimeout(state.cooldownTimeout);
        state.cooldownTimeout = null;
    }
    
    // 更新状态指示器
    const statusEl = document.getElementById('statusIndicator');
    if (statusEl) {
        statusEl.textContent = '练习开始';
        statusEl.className = 'status-indicator status-ready';
    }

    const activeTab = document.querySelector('.nav-item.active').dataset.tab;
    
    if (activeTab === 'scale') {
        const rootNote = document.getElementById('rootNote').value;
        const scaleType = document.getElementById('scaleType').value;
        const order = document.querySelector('.scale-order-btn.active')?.dataset.value || 'ordered';
        
        // 获取旋律模进类型
        const arpeggioTypeButtons = document.querySelectorAll('.scale-arpeggio-btn');
        let arpeggioType = '1to1';
        
        for (let i = 0; i < arpeggioTypeButtons.length; i++) {
          if (arpeggioTypeButtons[i].classList.contains('active')) {
            arpeggioType = arpeggioTypeButtons[i].getAttribute('data-value');
            break;
          }
        }
        
        const exercise = generateScaleExercise({ rootNote, scaleType, order, arpeggioType });
        state.rootNote = exercise.rootNote;
        state.scaleType = exercise.scaleType;
        state.currentIntervals = exercise.intervals;
        state.currentSequence = exercise.sequence;
        
        const targetIntervalEl = document.getElementById('targetInterval');
        if (targetIntervalEl) targetIntervalEl.textContent = exercise.name;
    } else if (activeTab === 'chord') {
        // 和弦练习逻辑
        const rootNote = document.getElementById('chordRootNote').value;
        const selectedChordTypes = Array.from(document.querySelectorAll('.chord-type-btn.active')).map(btn => btn.dataset.value);
        const order = document.querySelector('.chord-order-btn.active')?.dataset.value || 'ordered';
        
        const exercise = generateChordExercise({ 
            rootNote, 
            chordTypes: selectedChordTypes, 
            order,
            useCustomChords: false,
            customChords: []
        });
        
        state.rootNote = exercise.rootNote;
        state.chordType = exercise.chordType;
        state.currentIntervals = exercise.intervals;
        state.currentSequence = exercise.sequence;
        
        const targetIntervalEl = document.getElementById('targetInterval');
        if (targetIntervalEl) targetIntervalEl.textContent = exercise.name;
    }
    
    displaySequence();
    
    // 预生成下一题
    try {
        const nextExercise = generateNextExercise();
        const nextExerciseEl = document.getElementById('nextExercise');
        if (nextExercise && nextExerciseEl) {
            nextExerciseEl.innerHTML = `${nextExercise.name}<br><span style="font-size: 14px; color: #94a3b8;">${nextExercise.intervals.join(' ')}</span>`;
        }
    } catch (error) {
        console.error('预生成下一题失败:', error);
    }
}

// 生成下一个练习
function generateNextExercise() {
    const activeTab = document.querySelector('.nav-item.active').dataset.tab;
    
    if (activeTab === 'scale') {
        let rootNote = document.getElementById('rootNote').value;
        if (rootNote === 'random') {
            const notes = getAllNotes();
            rootNote = notes[Math.floor(Math.random() * notes.length)];
        }
        
        const scaleType = document.getElementById('scaleType').value;
        const order = document.querySelector('.scale-order-btn.active')?.dataset.value || 'ordered';
        
        // 获取旋律模进类型
        const arpeggioTypeButtons = document.querySelectorAll('.scale-arpeggio-btn');
        let arpeggioType = '1to1';
        
        for (let i = 0; i < arpeggioTypeButtons.length; i++) {
          if (arpeggioTypeButtons[i].classList.contains('active')) {
            arpeggioType = arpeggioTypeButtons[i].getAttribute('data-value');
            break;
          }
        }
        
        return generateScaleExercise({ rootNote, scaleType, order, arpeggioType });
    } else if (activeTab === 'chord') {
        let rootNote = document.getElementById('chordRootNote').value;
        if (rootNote === 'random') {
            const notes = getAllNotes();
            rootNote = notes[Math.floor(Math.random() * notes.length)];
        }
        
        const selectedChordTypes = Array.from(document.querySelectorAll('.chord-type-btn.active')).map(btn => btn.dataset.value);
        const order = document.querySelector('.chord-order-btn.active')?.dataset.value || 'ordered';
        
        return generateChordExercise({ 
            rootNote, 
            chordTypes: selectedChordTypes, 
            order,
            useCustomChords: false,
            customChords: []
        });
    }
    
    return null;
}

function displaySequence() {
    const sequenceDisplay = document.getElementById('sequenceDisplay');
    if (!sequenceDisplay) {
        console.error('找不到sequenceDisplay元素');
        return;
    }
    
    try {
        // 清空当前显示
        sequenceDisplay.innerHTML = '';
        
        // 创建文档片段以提高性能
        const fragment = document.createDocumentFragment();
        
        // 确保currentSequence存在且是数组
        if (!Array.isArray(state.currentSequence) || state.currentSequence.length === 0) {
            console.error('当前序列无效:', state.currentSequence);
            const errorSpan = document.createElement('div');
            errorSpan.className = 'sequence-item error';
            errorSpan.textContent = '序列错误';
            fragment.appendChild(errorSpan);
            sequenceDisplay.appendChild(fragment);
            return;
        }
        
        // 创建序列项
        state.currentSequence.forEach((interval, index) => {
            const span = document.createElement('div');
            span.className = 'sequence-item';
            if (index === 0) span.classList.add('current');
            span.textContent = interval;
            span.dataset.index = index;
            fragment.appendChild(span);
        });
        
        // 添加到DOM
        sequenceDisplay.appendChild(fragment);
        
        // 确保第一个项目可见
        const firstItem = sequenceDisplay.querySelector('.sequence-item.current');
        if (firstItem) {
            firstItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    } catch (error) {
        console.error('显示序列时出错:', error);
        sequenceDisplay.innerHTML = '<div class="sequence-item error">显示错误</div>';
    }
}

// 应用初始化
async function initApp() {
    console.log('应用初始化中...');
    
    try {
        // 首先初始化事件监听器，这是最重要的
        initEventListeners();
        
        // 然后初始化音频系统
        await getAudioDevices();
        setAudioProcessCallback(processAudio);
        
        // 初始化ml5 CREPE支持
        initMl5Support();
        
        console.log('应用初始化完成');
        showStatus('准备就绪', 'ready');
    } catch (error) {
        console.error('应用初始化失败:', error);
        showStatus('初始化失败: ' + error.message, 'error');
    }
}

// 初始化ml5支持
function initMl5Support() {
    // 监听ml5 CREPE模型就绪事件
    window.addEventListener('ml5-crepe-ready', () => {
        console.log('ml5 CREPE模型已就绪，切换到高精度模式');
        useCrepe = true;
        showStatus('CREPE高精度音高检测已启用', 'ready');
    });

    // 检查ml5是否已加载
    if (typeof ml5 !== 'undefined') {
        console.log('ml5.js已加载，版本:', ml5.version);
    } else {
        console.log('等待ml5.js加载...');
    }

    showStatus('初始化中...', 'loading');
}

// 显示状态信息
function showStatus(message, type = 'info') {
    const statusEl = document.getElementById('statusIndicator');
    if (statusEl) {
        statusEl.textContent = message;
        statusEl.className = `status-indicator status-${type}`;
        
        // 如果是错误或警告，显示更长时间
        if (type === 'error' || type === 'warning') {
            setTimeout(() => {
                statusEl.className = 'status-indicator status-ready';
                statusEl.textContent = '准备就绪';
            }, 5000);
        }
    }
    console.log(`[${type.toUpperCase()}] ${message}`);
}

function initEventListeners() {
    console.log('初始化事件监听器...');
    
    // 等待DOM完全加载
    if (document.readyState !== 'complete') {
        console.log('DOM未完全加载，等待加载完成...');
        return;
    }
    
    // 开始练习按钮
    const startBtn = document.getElementById('startBtn');
    console.log('寻找开始按钮:', startBtn);
    
    if (startBtn) {
        startBtn.addEventListener('click', async () => {
            console.log('点击开始练习按钮');
            try {
                const mainScreen = document.getElementById('mainScreen');
                const practiceScreen = document.getElementById('practiceScreen');
                const pitchDisplay = document.getElementById('pitchDisplay');
                
                if (mainScreen) mainScreen.style.display = 'none';
                if (practiceScreen) practiceScreen.style.display = 'flex';
                if (pitchDisplay) pitchDisplay.style.display = 'block';
                
                await wakeLockManager.request();
                generateExercise();
                await startRecording();
            } catch (error) {
                console.error('启动练习失败:', error);
                showStatus('启动练习失败: ' + error.message, 'error');
            }
        });
        console.log('开始按钮事件绑定成功');
    } else {
        console.error('找不到开始按钮元素 #startBtn');
    }

    // 返回主菜单
    const practiceScreen = document.getElementById('practiceScreen');
    if (practiceScreen) {
        practiceScreen.addEventListener('click', () => {
            console.log('点击返回主菜单');
            stopRecording();
            wakeLockManager.release();
            
            const ps = document.getElementById('practiceScreen');
            const pd = document.getElementById('pitchDisplay');
            const ms = document.getElementById('mainScreen');
            
            if (ps) ps.style.display = 'none';
            if (pd) pd.style.display = 'none';
            if (ms) ms.style.display = 'block';
        });
        console.log('练习屏幕事件绑定成功');
    }

    // 选项卡切换
    const settingsTabs = document.querySelectorAll('.settings-tab');
    console.log('找到', settingsTabs.length, '个选项卡');
    
    settingsTabs.forEach((tab, index) => {
        tab.addEventListener('click', function() {
            console.log('点击选项卡:', this.dataset.tab);
            
            // 移除所有活跃状态
            settingsTabs.forEach(t => t.classList.remove('active'));
            // 添加当前活跃状态
            this.classList.add('active');
            
            const tabName = this.dataset.tab;
            
            // 隐藏所有设置面板
            document.querySelectorAll('.settings-section').forEach(section => {
                section.style.display = 'none';
            });
            
            // 显示对应的设置面板
            if (tabName === 'scale') {
                const scaleSettings = document.querySelector('.scale-settings');
                if (scaleSettings) scaleSettings.style.display = 'block';
            } else if (tabName === 'chord') {
                const chordSettings = document.querySelector('.chord-settings');
                if (chordSettings) chordSettings.style.display = 'block';
            } else if (tabName === 'device') {
                const deviceSettings = document.querySelector('.device-settings');
                if (deviceSettings) deviceSettings.style.display = 'block';
            }
        });
        console.log(`选项卡 ${index + 1} 事件绑定成功:`, tab.dataset.tab);
    });

    // 顺序按钮事件
    const orderBtns = document.querySelectorAll('.order-btn');
    console.log('找到', orderBtns.length, '个顺序按钮');
    
    orderBtns.forEach((btn, index) => {
        btn.addEventListener('click', function() {
            console.log('点击顺序按钮:', this.dataset.value);
            
            // 移除同类按钮的活跃状态
            const siblingBtns = this.parentElement.querySelectorAll('.order-btn');
            siblingBtns.forEach(sibling => sibling.classList.remove('active'));
            
            // 添加当前按钮的活跃状态
            this.classList.add('active');
        });
        console.log(`顺序按钮 ${index + 1} 事件绑定成功:`, btn.dataset.value);
    });
    
    // 旋律模进按钮事件
    const arpeggioBtns = document.querySelectorAll('.scale-arpeggio-btn');
    console.log('找到', arpeggioBtns.length, '个旋律模进按钮');
    
    arpeggioBtns.forEach((btn, index) => {
        btn.addEventListener('click', function() {
            console.log('点击旋律模进按钮:', this.dataset.value);
            
            // 移除同类按钮的活跃状态
            const siblingBtns = this.parentElement.querySelectorAll('.scale-arpeggio-btn');
            siblingBtns.forEach(sibling => sibling.classList.remove('active'));
            
            // 添加当前按钮的活跃状态
            this.classList.add('active');
        });
        console.log(`旋律模进按钮 ${index + 1} 事件绑定成功:`, btn.dataset.value);
    });

    // 键盘快捷键
    document.addEventListener('keydown', (e) => {
        const practiceScreen = document.getElementById('practiceScreen');
        if (e.key === 'Escape' && practiceScreen && practiceScreen.style.display === 'flex') {
            console.log('按下ESC键，返回主菜单');
            practiceScreen.click();
        }
    });
    console.log('ESC键事件绑定成功');
    
    // 设备相关按钮事件
    const refreshDevicesBtn = document.getElementById('refreshDevicesBtn');
    if (refreshDevicesBtn) {
        refreshDevicesBtn.addEventListener('click', async () => {
            console.log('点击刷新设备按钮');
            try {
                await getAudioDevices();
                showStatus('设备列表已更新', 'ready');
            } catch (error) {
                console.error('刷新设备失败:', error);
                showStatus('刷新设备失败', 'error');
            }
        });
        console.log('刷新设备按钮事件绑定成功');
    }
    
    // 音频设备选择
    const audioInputDevice = document.getElementById('audioInputDevice');
    if (audioInputDevice) {
        audioInputDevice.addEventListener('change', (e) => {
            console.log('选择音频设备:', e.target.value);
            setSelectedDevice(e.target.value);
        });
        console.log('音频设备选择事件绑定成功');
    }
    
    // 节拍器开关
    const metronomeToggle = document.getElementById('metronomeToggle');
    if (metronomeToggle) {
        metronomeToggle.addEventListener('change', (e) => {
            console.log('节拍器开关:', e.target.checked);
            // TODO: 实现节拍器功能
        });
        console.log('节拍器开关事件绑定成功');
    }
    
    // 节拍器速度
    const metronomeTempo = document.getElementById('metronomeTempo');
    const metronomeTempoValue = document.getElementById('metronomeTempoValue');
    if (metronomeTempo && metronomeTempoValue) {
        metronomeTempo.addEventListener('input', (e) => {
            metronomeTempoValue.textContent = e.target.value;
            console.log('节拍器速度:', e.target.value);
        });
        console.log('节拍器速度事件绑定成功');
    }
    
    console.log('所有事件监听器初始化完成');
}

// 启动应用 - 注释掉以避免与HTML内嵌系统冲突
// document.addEventListener('DOMContentLoaded', initApp);

// 导出供其他模块使用
window.appState = state;

// 导出函数供HTML内嵌系统使用
window.generateExerciseFromModule = generateExercise;
window.generateNextExerciseFromModule = generateNextExercise;
window.processAudioFromModule = processAudio;