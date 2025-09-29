/**
 * 练习生成模块
 */

import { generateNoteSequence } from './note-utils.js';
import { scaleTypes, chordTypes } from './config.js';
import { state, resetExerciseState, updateStatus } from './exercise-state.js';

/**
 * 生成练习
 */
export function generateExercise() {
    // 获取选择的练习类型
    const exerciseType = document.getElementById('exerciseType').value;
    
    // 获取根音
    const rootNote = document.getElementById('rootNote').value;
    state.rootNote = rootNote;
    
    // 根据练习类型生成序列
    if (exerciseType === 'scale') {
        generateScaleExercise(rootNote);
    } else if (exerciseType === 'chord') {
        generateChordExercise(rootNote);
    }
    
    // 重置练习状态
    resetExerciseState();
    
    // 显示第一步
    showCurrentStep();
    
    // 更新状态
    updateStatus("练习已生成，请开始演奏");
}

/**
 * 生成音阶练习
 * @param {string} rootNote - 根音
 */
function generateScaleExercise(rootNote) {
    // 获取选择的音阶类型
    const scaleTypeSelect = document.getElementById('scaleType');
    const scaleType = scaleTypeSelect.value;
    state.scaleType = scaleType;
    
    // 获取音阶间隔
    const intervals = scaleTypes[scaleType].intervals;
    state.currentIntervals = intervals;
    
    // 获取选择的方向
    let order = 'normal';
    const scaleOrderButtons = document.querySelectorAll('.scale-order-btn');
    for (let i = 0; i < scaleOrderButtons.length; i++) {
        if (scaleOrderButtons[i].classList.contains('active')) {
            order = scaleOrderButtons[i].getAttribute('data-order');
            break;
        }
    }
    
    // 获取旋律模进类型
    let arpeggioType = '1to1';
    const arpeggioTypeButtons = document.querySelectorAll('.scale-arpeggio-btn');
    for (let i = 0; i < arpeggioTypeButtons.length; i++) {
        if (arpeggioTypeButtons[i].classList.contains('active')) {
            arpeggioType = arpeggioTypeButtons[i].getAttribute('data-value');
            break;
        }
    }
    
    // 根据模进类型和方向调整音阶间隔
    let adjustedIntervals = [...intervals];
    let startEndInterval = '1'; // 默认使用1作为首尾音
    
    // 收集所有实际存在的3/5/7度音程
    const availableChordTones = ['1'];
    const thirdInterval = getScaleDegree(intervals, 3);
    if (thirdInterval) availableChordTones.push(thirdInterval);
    const fifthInterval = getScaleDegree(intervals, 5);
    if (fifthInterval) availableChordTones.push(fifthInterval);
    const seventhInterval = getScaleDegree(intervals, 7);
    if (seventhInterval) availableChordTones.push(seventhInterval);
    
    // 根据旋律模进类型确定首尾音
    if (arpeggioType === 'random-arpeggio') {
        // 随机选择3、5、7音作为首尾音，但只包含音阶中实际存在的音程
        // 过滤出只包含3、5、7度的音程
        const available357Tones = availableChordTones.filter(interval => 
            interval.includes('3') || interval.includes('5') || interval.includes('7')
        );
        
        // 如果有可用的3/5/7度音程，则从中随机选择
        if (available357Tones.length > 0) {
            startEndInterval = available357Tones[Math.floor(Math.random() * available357Tones.length)];
        }
    } else if (arpeggioType === '3to3') {
        // 使用3音作为首尾音
        startEndInterval = availableChordTones.find(interval => interval.includes('3')) || '1';
    } else if (arpeggioType === '5to5') {
        // 使用5音作为首尾音
        startEndInterval = availableChordTones.find(interval => interval.includes('5')) || '1';
    } else if (arpeggioType === '7to7') {
        // 使用7音作为首尾音
        startEndInterval = availableChordTones.find(interval => interval.includes('7')) || '1';
    }
    
    // 构建新的音阶序列，确保首尾都是指定的音
    let newIntervals = [];
    
    // 找到首尾音在原始音阶中的位置
    const startEndIndex = adjustedIntervals.indexOf(startEndInterval);
    
    if (startEndIndex !== -1) {
        switch (order) {
            case 'reverse':
                // 倒序模式
                const middleIntervalsReverse = [...adjustedIntervals.slice(startEndIndex + 1), ...adjustedIntervals.slice(0, startEndIndex)].reverse();
                newIntervals = [startEndInterval, ...middleIntervalsReverse];
                break;
            case 'random':
            // 随机模式
            if (arpeggioType === 'random-arpeggio') {
                // 对于随机和弦类型，整个序列都应该只包含和弦音（1、3、5、7度音程）
                // 复用之前创建的availableChordTones变量
                
                // 创建只包含和弦音的子音阶
                const chordToneIntervals = intervals.filter(interval => 
                    availableChordTones.includes(interval)
                );
                
                // 如果找不到足够的和弦音，回退到使用首尾音
                if (chordToneIntervals.length > 1) {
                    // 随机打乱和弦音
                    const shuffledChordTones = [...chordToneIntervals];
                    for (let i = shuffledChordTones.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [shuffledChordTones[i], shuffledChordTones[j]] = [shuffledChordTones[j], shuffledChordTones[i]];
                    }
                    
                    // 构建新序列，确保包含首尾音
                    newIntervals = [startEndInterval, ...shuffledChordTones.filter(interval => interval !== startEndInterval)];
                } else {
                    // 如果没有足够的和弦音，使用首尾音作为整个序列
                    newIntervals = [startEndInterval];
                }
            } else {
                // 标准随机逻辑
                const otherIntervals = [...adjustedIntervals.slice(0, startEndIndex), ...adjustedIntervals.slice(startEndIndex + 1)];
                
                // 随机打乱
                for (let i = otherIntervals.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [otherIntervals[i], otherIntervals[j]] = [otherIntervals[j], otherIntervals[i]];
                }
                
                // 构建新序列，从指定音开始
                newIntervals = [startEndInterval, ...otherIntervals];
            }
            break;
            default:
                // 顺序模式
                const middleIntervals = [...adjustedIntervals.slice(startEndIndex + 1), ...adjustedIntervals.slice(0, startEndIndex)];
                newIntervals = [startEndInterval, ...middleIntervals];
                break;
        }
    }
    
    // 更新状态中的音阶间隔
    state.currentIntervals = newIntervals;
    
    // 生成音阶音符序列
    const sequence = generateNoteSequence(rootNote, newIntervals);
    state.currentSequence = sequence;
    
    // 更新练习信息显示
    document.getElementById('exerciseInfo').textContent = `${rootNote} ${scaleTypes[scaleType].name} 音阶`;
}

/**
 * 在音阶中查找指定度数的音程，优先查找包含该度数的音程
 * @param {Array} intervals - 音阶的音程数组
 * @param {number} degree - 要查找的度数（如3表示3度）
 * @returns {string|null} 找到的音程，如果没有找到则返回null
 */
function getScaleDegree(intervals, degree) {
    // 特殊处理：对于blues音阶等特殊音阶，优先检查是否有对应度数的变音记号版本
    // 例如，对于blues音阶，3度可能是♭3，7度可能是♭7
    if (degree === 3) {
        for (let i = 0; i < intervals.length; i++) {
            if (intervals[i] === '♭3') {
                return intervals[i];
            }
        }
    } else if (degree === 7) {
        for (let i = 0; i < intervals.length; i++) {
            if (intervals[i] === '♭7') {
                return intervals[i];
            }
        }
    }
    
    // 其他度数的处理逻辑保持不变
    // 将度数转换为字符串以便进行比较
    const degreeStr = degree.toString();
    
    // 尝试查找包含该度数的音程
    for (let i = 0; i < intervals.length; i++) {
        // 提取音程中的数字部分
        const intervalNumber = intervals[i].replace(/[^0-9]/g, '');
        if (intervalNumber === degreeStr) {
            return intervals[i];
        }
    }
    
    // 如果没有找到，返回null
    return null;
}

/**
 * 生成和弦练习
 * @param {string} rootNote - 根音
 */
function generateChordExercise(rootNote) {
    // 获取选择的和弦类型
    const chordTypeSelect = document.getElementById('chordType');
    const chordType = chordTypeSelect.value;
    state.chordType = chordType;
    
    // 获取和弦间隔
    const intervals = chordTypes[chordType].intervals;
    state.currentIntervals = intervals;
    
    // 生成和弦音符序列
    const sequence = generateNoteSequence(rootNote, intervals);
    state.currentSequence = sequence;
    
    // 更新练习信息显示
    document.getElementById('exerciseInfo').textContent = `${rootNote} ${chordTypes[chordType].name}`;
}

/**
 * 显示当前步骤
 */
function showCurrentStep() {
    // 获取当前步骤
    const currentStep = state.currentStep;
    
    // 检查是否已完成所有步骤
    if (currentStep >= state.currentSequence.length) {
        completeExercise();
        return;
    }
    
    // 获取当前音符
    const currentNote = state.currentSequence[currentStep];
    
    // 更新当前音符显示
    document.getElementById('currentNote').textContent = currentNote;
    
    // 更新进度显示
    document.getElementById('progress').textContent = `${currentStep + 1}/${state.currentSequence.length}`;
    
    // 重置答案状态
    state.isAnswered = false;
}

/**
 * 进入下一步
 */
export function nextStep() {
    // 增加步骤计数
    state.currentStep++;
    
    // 显示当前步骤
    showCurrentStep();
}

/**
 * 完成练习
 */
function completeExercise() {
    // 更新状态
    updateStatus("练习完成！");
    
    // 显示完成消息
    document.getElementById('currentNote').textContent = "完成";
    document.getElementById('progress').textContent = `${state.currentSequence.length}/${state.currentSequence.length}`;
    
    // 播放完成音效
    playCompleteSound();
    
    // 显示所有正确位置
    showAllCorrectPositions();
}

/**
 * 显示所有正确位置
 */
function showAllCorrectPositions() {
    // 清除现有高亮
    clearAllHighlights();
    
    // 高亮显示所有正确位置
    state.correctPositions.forEach((pos, index) => {
        const cell = document.querySelector(`#fretboard td[data-string="${pos.string}"][data-fret="${pos.fret}"]`);
        
        if (cell) {
            cell.classList.add('correct');
            
            // 添加音符标签
            const noteLabel = document.createElement('span');
            noteLabel.classList.add('note-label');
            noteLabel.textContent = state.currentSequence[index];
            cell.appendChild(noteLabel);
        }
    });
}

/**
 * 清除指板上的所有高亮
 */
function clearAllHighlights() {
    const cells = document.querySelectorAll('#fretboard td');
    cells.forEach(cell => {
        cell.classList.remove('correct', 'wrong', 'hint');
    });
}

/**
 * 下一个练习
 */
export function nextExercise() {
    // 获取根音
    const rootNote = document.getElementById('rootNote').value;
    
    // 请求Worklet生成下一题
    audioWorkletNode.port.postMessage({
        type: 'next-exercise',
        rootNote
    });
}