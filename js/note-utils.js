/**
 * 音符工具模块 - 处理音符计算
 */

import { noteToSemitones, intervalToSemitones } from './config.js';

/**
 * 获取所有可用的音符（包括同名异记）
 * @returns {string[]} 所有音符数组
 */
export function getAllNotes() {
    return Object.keys(noteToSemitones).filter(n => n.length <= 2);
}

/**
 * 获取某个半音值对应的所有音符名称
 * @param {number} semitone - 半音值
 * @returns {string[]} 同名异记音符数组
 */
export function getEnharmonicNotes(semitone) {
    return Object.keys(noteToSemitones).filter(key => 
        noteToSemitones[key] === semitone && key.length <= 2
    );
}

/**
 * 根据根音和间隔生成音符序列
 * @param {string} rootNote - 根音
 * @param {string[]} intervals - 间隔数组
 * @returns {string[]} 音符序列
 */
export function generateNoteSequence(rootNote, intervals) {
    const sequence = [];
    
    // 获取根音的半音数
    const rootSemitones = noteToSemitones[rootNote];
    if (rootSemitones === undefined) {
        console.error(`未知的根音: ${rootNote}`);
        return [];
    }
    
    // 确定是否使用♭记号的调（D♭, E♭, G♭, A♭, B♭调及其关系调）
    const useFlatKeys = ['D♭', 'E♭', 'G♭', 'A♭', 'B♭'].includes(rootNote);
    
    // 生成序列
    for (const interval of intervals) {
        // 获取间隔的半音数
        const intervalSemitones = intervalToSemitones[interval];
        if (intervalSemitones === undefined) {
            console.error(`未知的间隔: ${interval}`);
            continue;
        }
        
        // 计算音符的半音数
        const noteSemitones = (rootSemitones + intervalSemitones) % 12;
        
        // 根据调性选择合适的音符名称
        let note;
        if (useFlatKeys) {
            // 在♭调中，优先使用♭记号
            note = Object.keys(noteToSemitones).find(key => 
                noteToSemitones[key] === noteSemitones && key.includes('♭')
            ) || Object.keys(noteToSemitones).find(key => 
                noteToSemitones[key] === noteSemitones && !key.includes('♯')
            );
        } else {
            // 在♯调或自然调中，优先使用♯记号或自然音
            note = Object.keys(noteToSemitones).find(key => 
                noteToSemitones[key] === noteSemitones && !key.includes('♭')
            );
        }
        
        if (note) {
            sequence.push(note);
        }
    }
    
    return sequence;
}