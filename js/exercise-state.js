/**
 * 练习状态管理模块
 */

import { defaultState } from './config.js';

// 全局状态对象
export const state = {
    ...defaultState,
    // 添加状态管理方法
    updateScore(isCorrect) {
        this.totalCount++;
        if (isCorrect) {
            this.correctCount++;
            this.score += 10;
        }
        this.accuracy = (this.correctCount / this.totalCount) * 100;
    },
    
    setCooldown() {
        this.isCoolingDown = true;
        
        if (this.cooldownTimeout) {
            clearTimeout(this.cooldownTimeout);
        }
        
        this.cooldownTimeout = setTimeout(() => {
            this.isCoolingDown = false;
        }, this.cooldownDuration);
    }
};

/**
 * 重置练习状态
 */
export function resetExerciseState() {
    state.currentStep = 0;
    state.correctPositions = [];
    state.isCoolingDown = false;
    state.isAnswered = false;
    
    if (state.cooldownTimeout) {
        clearTimeout(state.cooldownTimeout);
        state.cooldownTimeout = null;
    }
    
    if (state.timeoutId) {
        clearTimeout(state.timeoutId);
        state.timeoutId = null;
    }
    
    // 清除指板上的所有高亮
    clearAllHighlights();
}

/**
 * 重置练习
 */
export function resetExercise() {
    // 重置状态
    state.score = 0;
    state.correctCount = 0;
    state.totalCount = 0;
    state.accuracy = 0;
    
    // 更新显示
    document.getElementById('score').textContent = state.score;
    document.getElementById('accuracy').textContent = state.accuracy.toFixed(1) + '%';
    
    // 重置练习状态
    resetExerciseState();
    
    // 清除当前音符显示
    document.getElementById('currentNote').textContent = "-";
    document.getElementById('progress').textContent = "0/0";
    document.getElementById('exerciseInfo').textContent = "请生成练习";
    
    // 更新状态
    updateStatus("练习已重置");
}

/**
 * 更新状态显示
 */
export function updateStatus(message) {
    document.getElementById('status').textContent = message;
}