/**
 * 练习生成模块 - 处理音阶和和弦练习的生成逻辑
 */

import { scaleTypes, chordTypes, noteToSemitones, intervalToSemitones } from './config.js';
import { getAllNotes } from './note-utils.js';

/**
 * 提取音阶名称（不包含结构信息）
 */
function getScaleDisplayName(scaleName) {
    // 从完整名称中提取音阶名称，移除结构部分
    // 例如："Major" -> "Major"
    // 例如："Dorian - 1 2 ♭3 4 5 6 ♭7" -> "Dorian"
    
    let displayName = scaleName;
    
    // 移除括号部分，如 (Ionian)
    displayName = displayName.replace(/\s*\([^)]*\)\s*/g, '');
    
    // 移除破折号及其后面的所有内容（音程结构）
    const dashIndex = displayName.indexOf(' - ');
    if (dashIndex !== -1) {
        displayName = displayName.substring(0, dashIndex);
    }
    
    return displayName.trim();
}

/**
 * 生成音阶练习
 */
export function generateScaleExercise(settings) {
    const { rootNote, scaleType, order, arpeggioType = '1to1' } = settings;
    
    let actualRootNote = rootNote;
    if (rootNote === 'random') {
        const notes = getAllNotes();
        actualRootNote = notes[Math.floor(Math.random() * notes.length)];
    }
    
    let actualScaleType = scaleType;
    if (scaleType === 'random') {
        const types = Object.keys(scaleTypes);
        actualScaleType = types[Math.floor(Math.random() * types.length)];
    }
    
    // 特殊处理旋律小调：根据方向选择上行或下行形式
    let intervals;
    let isMelodicMinorDescending = false;
    if (actualScaleType === 'melodicMinor' && order === 'reverse') {
        // 下行旋律小调
        intervals = [...(scaleTypes['melodicMinorDescending']?.intervals || scaleTypes[actualScaleType].intervals)];
        isMelodicMinorDescending = true;
    } else {
        // 默认使用上行形式
        intervals = [...scaleTypes[actualScaleType].intervals];
    }
    let startEndInterval = '1'; // 默认使用1作为首尾音
    
    // 收集所有实际存在的3/5/7度音程
    const availableChordTones = ['1'];
    const thirdInterval = findNearestIntervalInScale(intervals, '3');
    availableChordTones.push(thirdInterval);
    const fifthInterval = findNearestIntervalInScale(intervals, '5');
    availableChordTones.push(fifthInterval);
    const seventhInterval = findNearestIntervalInScale(intervals, '7');
    availableChordTones.push(seventhInterval);
    
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
    } else if (arpeggioType !== '1to1' && arpeggioType !== 'random') {
        // 处理其他特定音程作为首尾音的情况（如♯6→♯6）
        // arpeggioType格式为"xtox"，提取x部分
        const match = arpeggioType.match(/^(.+)to\1$/);
        if (match) {
            const intervalType = match[1];
            // 查找音阶中对应的音程
            startEndInterval = findCompleteIntervalInScale(intervals, intervalType) || findNearestIntervalInScale(intervals, intervalType.replace(/[^\d]/g, '')) || intervalType;
        }
    }
    
    // 构建新的音阶序列，确保首尾都是指定的音
    let newIntervals = [];
    
    // 特殊处理旋律小调下行：直接使用预定义的序列，不进行额外处理
    if (isMelodicMinorDescending) {
        // 直接使用旋律小调下行的预定义序列
        newIntervals = [...intervals];
    } else {
        switch (order) {
            case 'reverse':
                // 倒序模式
                if (arpeggioType === '1to1' || arpeggioType === '3to3' || arpeggioType === '5to5' || arpeggioType === '7to7' || arpeggioType === 'random-arpeggio') {
                    // 找到首尾音在原始音阶中的位置
                    const startEndIndex = intervals.indexOf(startEndInterval);
                    
                    if (startEndIndex !== -1) {
                        // 提取从首尾音开始的所有音，然后倒序，最后添加首尾音
                        const middleIntervals = [...intervals.slice(startEndIndex + 1), ...intervals.slice(0, startEndIndex)].reverse();
                        newIntervals = [startEndInterval, ...middleIntervals, startEndInterval];
                    } else {
                        // 如果找不到首尾音（这种情况不应该发生），使用默认行为
                        const middleIntervals = intervals.slice(1).reverse();
                        newIntervals = [intervals[0], ...middleIntervals, intervals[0]];
                    }
                } else {
                    // 保持原有的倒序逻辑
                    const middleIntervals = intervals.slice(1).reverse();
                    newIntervals = [intervals[0], ...middleIntervals, intervals[0]];
                }
                break;
            case 'random':
                // 随机模式
                if (arpeggioType === 'random-arpeggio') {
                    // 对于随机和弦类型，整个序列都应该只包含和弦音（1、3、5、7度音程）
                    // 使用之前创建的availableChordTones变量
                    const chordToneIntervals = availableChordTones;
                    
                    // 如果找不到足够的和弦音，回退到使用首尾音
                    if (chordToneIntervals.length > 1) {
                        // 随机打乱和弦音
                        const shuffledChordTones = [...chordToneIntervals];
                        for (let i = shuffledChordTones.length - 1; i > 0; i--) {
                            const j = Math.floor(Math.random() * (i + 1));
                            [shuffledChordTones[i], shuffledChordTones[j]] = [shuffledChordTones[j], shuffledChordTones[i]];
                        }
                        
                        // 构建新序列，确保包含首尾音
                        newIntervals = [startEndInterval, ...shuffledChordTones.filter(interval => interval !== startEndInterval), startEndInterval];
                    } else {
                        // 如果没有足够的和弦音，使用首尾音作为整个序列
                        newIntervals = [startEndInterval, startEndInterval];
                    }
                } else if (arpeggioType === '1to1' || arpeggioType === '3to3' || arpeggioType === '5to5' || arpeggioType === '7to7') {
                    // 找到首尾音在原始音阶中的位置
                    const startEndIndex = intervals.indexOf(startEndInterval);
                    
                    if (startEndIndex !== -1) {
                        // 提取除了首尾音之外的所有音
                        const otherIntervals = [...intervals.slice(0, startEndIndex), ...intervals.slice(startEndIndex + 1)];
                        
                        // 随机打乱
                        for (let i = otherIntervals.length - 1; i > 0; i--) {
                            const j = Math.floor(Math.random() * (i + 1));
                            [otherIntervals[i], otherIntervals[j]] = [otherIntervals[j], otherIntervals[i]];
                        }
                        
                        // 构建新序列，确保首尾都是指定的音
                        newIntervals = [startEndInterval, ...otherIntervals, startEndInterval];
                    } else {
                        // 如果找不到首尾音（这种情况不应该发生），使用默认行为
                        const otherIntervals = intervals.slice(1);
                        for (let i = otherIntervals.length - 1; i > 0; i--) {
                            const j = Math.floor(Math.random() * (i + 1));
                            [otherIntervals[i], otherIntervals[j]] = [otherIntervals[j], otherIntervals[i]];
                        }
                        newIntervals = [intervals[0], ...otherIntervals, intervals[0]];
                    }
                } else {
                    // 保持原有的随机逻辑
                    const otherIntervals = intervals.slice(1);
                    for (let i = otherIntervals.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [otherIntervals[i], otherIntervals[j]] = [otherIntervals[j], otherIntervals[i]];
                    }
                    newIntervals = [intervals[0], ...otherIntervals, intervals[0]];
                }
                break;
            default:
                // 顺序模式
                if (arpeggioType === '1to1' || arpeggioType === '3to3' || arpeggioType === '5to5' || arpeggioType === '7to7' || arpeggioType === 'random-arpeggio') {
                    // 找到首尾音在原始音阶中的位置
                    const startEndIndex = intervals.indexOf(startEndInterval);
                    
                    if (startEndIndex !== -1) {
                        // 提取从首尾音开始的所有音，然后添加首尾音
                        const middleIntervals = [...intervals.slice(startEndIndex + 1), ...intervals.slice(0, startEndIndex)];
                        newIntervals = [startEndInterval, ...middleIntervals, startEndInterval];
                    } else {
                        // 如果找不到首尾音（这种情况不应该发生），使用默认行为
                        newIntervals = [startEndInterval, ...intervals, startEndInterval];
                    }
                } else {
                    // 保持原有的顺序逻辑
                    newIntervals = [...intervals, intervals[0]];
                }
                break;
        }
    }
    
    return {
        rootNote: actualRootNote,
        scaleType: actualScaleType,
        intervals: newIntervals,
        name: `${actualRootNote} ${getScaleDisplayName(scaleTypes[actualScaleType].name)}`,
        sequence: newIntervals
    };
}

/**
 * 在音阶中查找指定度数的音（1=根音，2=大二度，3=三度等）
 * @param {Array} intervals - 音阶的音程数组
 * @param {number} degree - 要查找的度数
 * @returns {string} 找到的音程
 */
function findScaleDegree(intervals, degree) {
    // 确保degree在有效范围内
    const validDegree = (degree - 1) % intervals.length;
    return intervals[validDegree];
}

/**
 * 查找音阶中第一个出现的指定度数的音程
 * @param {Array} intervals - 音阶的音程数组
 * @param {string} degree - 要查找的度数（如'3'代表3度）
 * @returns {string|null} 找到的音程，如果音阶中不存在该度数的音程则返回null
 */
function findFirstIntervalOfType(intervals, degree) {
    // 特殊处理：对于blues音阶等特殊音阶，优先检查是否有对应度数的变音记号版本
    // 例如，对于blues音阶，3度可能是♭3，4度可能是♭4，7度可能是♭7
    if (degree === '3') {
        for (let i = 0; i < intervals.length; i++) {
            if (intervals[i] === '♭3') {
                return intervals[i];
            }
        }
    } else if (degree === '4') {
        for (let i = 0; i < intervals.length; i++) {
            if (intervals[i] === '♭4') {
                return intervals[i];
            }
        }
    } else if (degree === '7') {
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
        if (intervalNumber === degree) {
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
/**
 * 查找音阶中指定音程的完整形式（包括变音记号）
 * @param {Array} intervals - 音阶的音程数组
 * @param {string} interval - 要查找的完整音程（如'♯6'）
 * @returns {string|null} 找到的音程，如果没找到则返回null
 */
function findCompleteIntervalInScale(intervals, interval) {
    // 直接查找完全匹配的音程（包括变音记号）
    for (let i = 0; i < intervals.length; i++) {
        if (intervals[i] === interval) {
            return intervals[i];
        }
    }
    
    // 如果没有找到完全匹配的，尝试查找数字部分匹配的
    const intervalNumber = interval.replace(/[^0-9]/g, '');
    for (let i = 0; i < intervals.length; i++) {
        const currentIntervalNumber = intervals[i].replace(/[^0-9]/g, '');
        if (currentIntervalNumber === intervalNumber) {
            return intervals[i];
        }
    }
    
    // 如果还是没找到，返回null
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

/**
 * 生成和弦练习
 */
export function generateChordExercise(settings) {
    const { rootNote, chordTypes: selectedChordTypes, order, useCustomChords, customChords } = settings;
    
    // 如果使用自定义和弦
    if (useCustomChords && customChords && customChords.length > 0) {
        const currentIndex = settings.customChordIndex || 0;
        const chord = customChords[currentIndex];
        
        let intervals = [...chordTypes[chord.type].intervals];
        
        switch (order) {
            case 'reverse':
                // 下行模式：倒序排列
                intervals = intervals.reverse();
                break;
            case 'random':
                // 随机模式：打乱顺序
                for (let i = intervals.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [intervals[i], intervals[j]] = [intervals[j], intervals[i]];
                }
                break;
            default:
                // 上行模式：保持原顺序（默认）
                break;
        }
        
        const chordSymbol = formatChordSymbol(chord.root, chord.type);
        
        return {
            rootNote: chord.root,
            chordType: chord.type,
            intervals,
            name: chordSymbol,
            sequence: intervals,
            isCustomChord: true,
            customChordIndex: currentIndex
        };
    }
    
    // 常规和弦生成
    let actualRootNote = rootNote;
    if (rootNote === 'random') {
        const notes = getAllNotes();
        actualRootNote = notes[Math.floor(Math.random() * notes.length)];
    }
    
    let chordType = 'major';
    if (selectedChordTypes && selectedChordTypes.length > 0) {
        chordType = selectedChordTypes[Math.floor(Math.random() * selectedChordTypes.length)];
    }
    
    let intervals = [...chordTypes[chordType].intervals];
    
    switch (order) {
        case 'reverse':
            // 下行模式：倒序排列
            intervals = intervals.reverse();
            break;
        case 'random':
            // 随机模式：打乱顺序
            for (let i = intervals.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [intervals[i], intervals[j]] = [intervals[j], intervals[i]];
            }
            break;
        default:
            // 上行模式：保持原顺序（默认）
            break;
    }
    
    const chordSymbol = formatChordSymbol(actualRootNote, chordType);
    
    return {
        rootNote: actualRootNote,
        chordType,
        intervals,
        name: chordSymbol,
        sequence: intervals
    };
}

/**
 * 格式化和弦符号
 */
export function formatChordSymbol(rootNote, chordType) {
    const suffixMap = {
        // 基础三和弦
        'major': '',
        'minor': 'm',
        'diminished': 'dim',
        'augmented': 'aug',
        
        // 六和弦
        'major6': '6',
        'minor6': 'm6',
        
        // 七和弦
        'dominant7': '7',
        'major7': 'maj7',
        'minor7': 'm7',
        'minor7b5': 'm7♭5',
        'diminished7': 'dim7',
        
        // 九和弦
        'dominant9': '9',
        'major9': 'maj9',
        'minor9': 'm9',
        'dominant7sharp9': '7♯9',
        'dominant7flat9': '7♭9',
        
        // 十一和弦
        'dominant11': '11',
        'minor11': 'm11',
        'dominant7sharp11': '7♯11',
        
        // 十三和弦
        'dominant13': '13',
        'minor13': 'm13',
        
        // 挂留和弦
        'sus2': 'sus2',
        'sus4': 'sus4',
        
        // 加音和弦
        'add9': 'add9',
        'madd9': 'madd9',
        '6add9': '6add9',
        'm6add9': 'm6add9'
    };
    
    return `${rootNote}${suffixMap[chordType] || ''}`;
}

/**
 * 预生成下一个练习
 */
export function generateNextExercise(currentExercise, settings) {
    const activeTab = settings.activeTab;
    
    if (activeTab === 'scale') {
        return generateScaleExercise(settings.scale);
    } else {
        // 如果是自定义和弦模式，选择下一个和弦
        if (settings.chord.useCustomChords && settings.chord.customChords && settings.chord.customChords.length > 0) {
            const currentIndex = currentExercise?.customChordIndex !== undefined ? currentExercise.customChordIndex : 0;
            const nextIndex = (currentIndex + 1) % settings.chord.customChords.length;
            
            const nextSettings = {
                ...settings.chord,
                customChordIndex: nextIndex
            };
            
            return generateChordExercise(nextSettings);
        } else {
            return generateChordExercise(settings.chord);
        }
    }
}

/**
 * 加载自定义和弦序列
 */
export function loadCustomChordSequence(chordsData) {
    const chords = chordsData.map(chord => ({
        root: chord.root,
        type: chord.type
    }));
    
    return {
        name: chordsData.name || '未命名序列',
        chords,
        timestamp: chordsData.timestamp || new Date().toISOString()
    };
}

/**
 * 保存自定义和弦序列
 */
export function saveCustomChordSequence(chords, name) {
    const songData = {
        name: name || '未命名序列',
        chords,
        timestamp: new Date().toISOString()
    };
    
    // 创建文件保存对话框
    const jsonStr = JSON.stringify([songData], null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name.replace(/[\/\\?%*:|"<>]/g, '')}_和弦序列.json`;
    document.body.appendChild(a);
    a.click();
    
    // 清理
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 100);
    
    // 同时保存到本地存储
    const sequences = JSON.parse(localStorage.getItem('customChordSequences') || '[]');
    sequences.push(songData);
    localStorage.setItem('customChordSequences', JSON.stringify(sequences));
    
    return songData;
}

/**
 * 创建练习显示序列
 */
export function createSequenceDisplay(intervals) {
    return intervals.map((interval, index) => ({
        interval,
        index,
        isPlayed: false,
        isCurrent: index === 0
    }));
}

/**
 * 更新练习进度
 */
export function updateExerciseProgress(sequence, currentStep) {
    return sequence.map((item, index) => ({
        ...item,
        isPlayed: index < currentStep,
        isCurrent: index === currentStep
    }));
}

/**
 * 计算目标频率
 */
export function calculateTargetFrequency(rootNote, interval) {
    const rootValue = noteToSemitones[rootNote];
    const targetSemitone = (rootValue + intervalToSemitones[interval]) % 12;
    return 440 * Math.pow(2, (targetSemitone - 9) / 12);
}

/**
 * 验证练习设置
 */
export function validateExerciseSettings(settings) {
    const errors = [];
    
    if (settings.activeTab === 'scale') {
        if (!settings.scale.rootNote) {
            errors.push('请选择根音');
        }
        if (!settings.scale.scaleType) {
            errors.push('请选择音阶类型');
        }
    } else if (settings.activeTab === 'chord') {
        if (settings.chord.useCustomChords) {
            if (!settings.chord.customChords || settings.chord.customChords.length === 0) {
                errors.push('请添加自定义和弦');
            }
        } else {
            if (!settings.chord.rootNote) {
                errors.push('请选择根音');
            }
            if (!settings.chord.chordTypes || settings.chord.chordTypes.length === 0) {
                errors.push('请选择和弦类型');
            }
        }
    }
    
    return {
        isValid: errors.length === 0,
        errors
    };
}