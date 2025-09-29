/**
 * 设备管理模块
 */

/**
 * 初始化设备支持
 */
export function initDeviceSupport() {
    const container = document.getElementById('settings-panel');
    
    // 添加音频设备选择UI
    const audioDiv = document.createElement('div');
    audioDiv.className = 'device-controls';
    audioDiv.innerHTML = `
        <h3>音频输入设备</h3>
        <select id="audio-input">
            <option value="">-- 自动选择 --</option>
        </select>
        <button id="refresh-devices">刷新设备列表</button>
        <div class="device-status" id="audio-status">准备中...</div>
    `;
    container.appendChild(audioDiv);
    
    // 添加MIDI设备选择UI（如果支持）
    if (navigator.requestMIDIAccess) {
        const midiDiv = document.createElement('div');
        midiDiv.className = 'device-controls';
        midiDiv.innerHTML = `
            <h3>MIDI输入设备</h3>
            <select id="midi-input">
                <option value="">-- 选择MIDI设备 --</option>
            </select>
            <div class="device-status" id="midi-status">未连接</div>
        `;
        container.appendChild(midiDiv);
        updateMIDIDevices();
    }
    
    // 初始化音频设备列表
    updateAudioDevices();
    
    // 设备刷新按钮事件
    document.getElementById('refresh-devices').addEventListener('click', () => {
        updateAudioDevices();
        if (navigator.requestMIDIAccess) {
            updateMIDIDevices();
        }
    });
}

/**
 * 更新音频设备列表
 */
export async function updateAudioDevices() {
    try {
        // 检查是否支持媒体设备API
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('浏览器不支持媒体设备API');
        }
        
        // 必须先获取麦克风权限才能枚举设备
        await navigator.mediaDevices.getUserMedia({ audio: true });
        
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(d => d.kind === 'audioinput');
        
        const select = document.getElementById('audio-input');
        if (!select) {
            console.error('找不到音频设备选择元素');
            return;
        }
        
        select.innerHTML = '<option value="">-- 自动选择 --</option>';
        
        audioInputs.forEach(device => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.textContent = device.label || `麦克风 ${select.options.length}`;
            select.appendChild(option);
        });
        
        const statusEl = document.getElementById('audio-status');
        if (statusEl) {
            statusEl.textContent = audioInputs.length > 0 ? '就绪' : '未检测到音频设备';
            statusEl.className = audioInputs.length > 0 ? 'device-status ready' : 'device-status error';
        }
        
        // 返回设备列表，以便其他模块使用
        return audioInputs;
    } catch (error) {
        console.error('获取音频设备失败:', error);
        
        const statusEl = document.getElementById('audio-status');
        if (statusEl) {
            if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
                statusEl.textContent = '麦克风权限被拒绝';
                statusEl.className = 'device-status error';
                
                // 显示权限指导
                showPermissionGuidance();
            } else {
                statusEl.textContent = `错误: ${error.message || '未知错误'}`;
                statusEl.className = 'device-status error';
            }
        }
        
        // 抛出错误，以便调用者处理
        throw error;
    }
}

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

/**
 * 更新MIDI设备列表
 */
export function updateMIDIDevices() {
    navigator.requestMIDIAccess().then(midiAccess => {
        const select = document.getElementById('midi-input');
        select.innerHTML = '<option value="">-- 选择MIDI设备 --</option>';
        
        // 添加可用设备
        for (const input of midiAccess.inputs.values()) {
            const option = document.createElement('option');
            option.value = input.id;
            option.textContent = input.name;
            select.appendChild(option);
        }
        
        // 更新状态显示
        document.getElementById('midi-status').textContent = 
            midiAccess.inputs.size > 0 ? '已连接' : '未检测到MIDI设备';
        
        // 监听设备变化
        midiAccess.onstatechange = () => updateMIDIDevices();
    }).catch(error => {
        console.error('MIDI访问失败:', error);
        document.getElementById('midi-status').textContent = 'MIDI不可用';
    });
}
// 在device-manager.js中增强设备管理
export class DeviceManager {
    constructor() {
        this.selectedDeviceId = this.loadSavedDevice();
        this.deviceListeners = [];
    }
    
    // 保存设备选择到localStorage
    saveDeviceSelection(deviceId) {
        try {
            localStorage.setItem('selectedAudioDevice', deviceId);
            this.selectedDeviceId = deviceId;
        } catch (error) {
            console.warn('无法保存设备选择:', error);
        }
    }
    
    // 从localStorage加载设备选择
    loadSavedDevice() {
        try {
            return localStorage.getItem('selectedAudioDevice') || 'default';
        } catch (error) {
            console.warn('无法加载设备选择:', error);
            return 'default';
        }
    }
    
    // 监听设备变化
    onDeviceChange(callback) {
        this.deviceListeners.push(callback);
    }
    
    // 通知设备变化
    notifyDeviceChange(devices) {
        this.deviceListeners.forEach(callback => callback(devices));
    }
}