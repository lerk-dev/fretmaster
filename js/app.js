/**
 * 应用初始化和主逻辑
 */

/**
 * 初始化应用
 */
function initApp() {
    console.log("应用初始化中...");
    
    // 检查浏览器支持
    if (!checkAudioSupport()) {
        updateStatus("您的浏览器不支持音频API，请使用Chrome或Firefox");
        document.getElementById('startRecordingBtn').disabled = true;
        return;
    }
    
    // 初始化UI
    initUI();
    
    // 初始化事件监听器
    initEventListeners();
    
    // 更新状态
    updateStatus("应用已准备就绪");
    
    console.log("应用初始化完成");
}

/**
 * 初始化事件监听器
 */
function initEventListeners() {
    // 窗口大小改变事件
    window.addEventListener('resize', debounce(() => {
        // 重新调整指板大小
        adjustFretboardSize();
    }, 200));
    
    // 键盘事件
    document.addEventListener('keydown', handleKeyDown);
    
    // 页面可见性变化事件
    document.addEventListener('visibilitychange', handleVisibilityChange);
}

/**
 * 处理键盘事件
 * @param {KeyboardEvent} event - 键盘事件
 */
function handleKeyDown(event) {
    // 空格键切换录音
    if (event.code === 'Space') {
        event.preventDefault();
        toggleRecording();
    }
    
    // Enter键生成练习
    if (event.code === 'Enter' && event.ctrlKey) {
        event.preventDefault();
        generateExercise();
    }
    
    // N键进入下一个练习
    if (event.code === 'KeyN') {
        event.preventDefault();
        nextExercise();
    }
    
    // R键重置练习
    if (event.code === 'KeyR') {
        event.preventDefault();
        resetExercise();
    }
    
    // M键切换节拍器
    if (event.code === 'KeyM') {
        event.preventDefault();
        toggleMetronome();
    }
}

/**
 * 处理页面可见性变化
 */
function handleVisibilityChange() {
    if (document.hidden) {
        // 页面不可见时暂停录音和节拍器
        if (state.isRecording) {
            stopRecording();
        }
        
        if (state.metronomeEnabled) {
            stopMetronome();
        }
    }
}

/**
 * 调整指板大小
 */
function adjustFretboardSize() {
    const fretboard = document.getElementById('fretboard');
    const container = document.getElementById('fretboardContainer');
    
    if (fretboard && container) {
        // 根据容器宽度调整指板大小
        const containerWidth = container.clientWidth;
        const maxFretWidth = Math.floor(containerWidth / (state.maxFret + 2));
        
        // 设置单元格宽度
        const cells = fretboard.querySelectorAll('td, th');
        cells.forEach(cell => {
            cell.style.width = `${maxFretWidth}px`;
        });
    }
}

// 当DOM加载完成后初始化应用
document.addEventListener('DOMContentLoaded', initApp);