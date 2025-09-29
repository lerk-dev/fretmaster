/**
 * 状态管理模块
 */

import { throttle } from './ui-core.js';

// 应用状态
const state = {
    score: 0,
    correctCount: 0,
    totalCount: 0,
    accuracy: 0,
    isRecording: false,
    metronomeEnabled: false
};

// 状态更新器
const statusUpdater = throttle((message) => {
    document.getElementById('status').textContent = message;
}, 100);

const scoreUpdater = throttle(() => {
    document.getElementById('score').textContent = state.score;
    document.getElementById('accuracy').textContent = `${state.accuracy.toFixed(1)}%`;
}, 200);

// 导出状态操作函数
export function updateStatus(message) {
    statusUpdater(message);
}

export function updateScore(isCorrect) {
    state.totalCount++;
    state.correctCount += isCorrect ? 1 : 0;
    state.score = Math.max(0, state.score + (isCorrect ? 10 : -5));
    state.accuracy = (state.correctCount / state.totalCount) * 100;
    scoreUpdater();
}

export function getState() {
    return {...state};
}

export function setState(newState) {
    Object.assign(state, newState);
}