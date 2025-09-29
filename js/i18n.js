/**
 * 国际化支持模块
 */

// 定义语言包
const translations = {
    'zh-CN': {
        // 应用标题和说明
        'app_title': '🎸 吉他音阶与和弦练习工具 - 支持USB声卡',
        'app_instructions': '支持吉他通过USB声卡输入进行音高检测。连接您的USB音频接口后，选择对应的设备即可开始练习。',
        
        // 设置面板标签
        'settings_scale': '音阶设置',
        'settings_chord': '和弦设置',
        'settings_device': '设备设置',
        'settings_general': '通用设置',
        
        // 音阶设置
        'scale_root_note': '根音',
        'scale_type': '音阶类型',
        'scale_order': '演奏顺序',
        'scale_ordered': '顺序演奏',
        'scale_random': '随机演奏',
        'scale_arpeggio': '旋律模进',
        'scale_1to1': '1:1',
        'scale_1to2': '1:2',
        'scale_1to3': '1:3',
        'scale_2to1': '2:1',
        'scale_3to1': '3:1',
        
        // 和弦设置
        'chord_root_note': '根音',
        'chord_type': '和弦类型',
        'chord_order': '演奏顺序',
        'chord_ordered': '顺序演奏',
        'chord_random': '随机演奏',
        'chord_all': '全选',
        'chord_none': '清空',
        'chord_invert': '反选',
        'chord_custom': '自定义和弦',
        'chord_add_custom': '添加自定义和弦',
        'chord_custom_name': '和弦名称',
        'chord_custom_intervals': '音程序列',
        'chord_add': '添加',
        'chord_save': '保存',
        'chord_cancel': '取消',
        'chord_delete': '删除',
        'chord_edit': '编辑',
        'chord_play_sequence': '演奏序列',
        'chord_select_sequence': '选择序列',
        'chord_add_to_sequence': '添加到序列',
        'chord_clear_sequence': '清空序列',
        'chord_move_up': '上移',
        'chord_move_down': '下移',
        'chord_sequence': '序列',
        'chord_no_custom': '暂无自定义和弦',
        'chord_no_sequence': '暂无演奏序列',
        
        // 设备设置
        'device_audio_input': '音频输入设备',
        'device_refresh': '刷新设备列表',
        'device_gain': '输入增益',
        'device_metronome': '节拍器',
        'device_tempo': '速度 (BPM)',
        'device_sensitivity': '灵敏度',
        'device_cooldown': '冷却时间',
        'device_cooldown_enabled': '启用冷却时间',
        'device_advanced': '高级设置',
        'device_show_advanced': '显示高级设置',
        'device_hide_advanced': '隐藏高级设置',
        'device_confidence': '置信度阈值',
        'device_noise': '噪音等级',
        'device_volume': '最小音量',
        'device_buffer': '缓冲区大小',
        'device_harmonic': '谐波权重',
        'device_zero_crossing': '零交叉阈值',
        
        // 通用设置
        'general_language': '语言',
        'general_theme': '主题',
        'general_dark': '深色',
        'general_light': '浅色',
        'general_auto': '自动',
        'general_save': '保存设置',
        'general_reset': '重置设置',
        
        // 按钮
        'btn_start': '开始练习',
        'btn_back': '返回主菜单',
        'btn_add': '添加',
        'btn_save': '保存',
        'btn_cancel': '取消',
        'btn_delete': '删除',
        'btn_edit': '编辑',
        'btn_clear': '清空',
        'btn_select_all': '全选',
        'btn_select_none': '清空',
        'btn_invert_selection': '反选',
        
        // 状态信息
        'status_ready': '准备就绪',
        'status_recording': '正在录音',
        'status_loading': '加载中...',
        'status_error': '错误',
        'status_success': '成功',
        'status_generating': '生成练习中...',
        'status_next_exercise': '下一题',
        'status_exercise_complete': '练习完成！准备下一题...',
        'status_new_exercise': '新练习已生成',
        'status_initializing': '初始化中...',
        'status_device_updated': '设备列表已更新',
        'status_device_failed': '刷新设备失败',
        'status_init_failed': '初始化失败',
        'status_start_failed': '启动练习失败',
        'status_metronome_active': '节拍器激活',
        'status_cooling_down': '准备下一题...',
        'status_info': '信息',
        'status_warning': '警告',
        
        // 快捷键提示
        'shortcut_hint': '按 <span class="shortcut-key">ESC</span> 返回主菜单',
        
        // 音高显示
        'pitch_frequency': '音高',
        'pitch_cents': '音分差',
        'pitch_confidence': '置信度',
        
        // 底部导航
        'nav_scale': '音阶',
        'nav_chord': '和弦',
        'nav_progression': '进行',
        'nav_settings': '设置',
        
        // 其他
        'next_exercise': '下一题',
        'song_title': '练习曲目',
        'scale_info': '音阶信息',
        'target_interval': '目标音程',
        'sequence_display': '序列显示',
        'sequence_items': '序列项',
        'confidence_bar': '置信度条',
        'usb_indicator': 'USB指示器',
        'device_info': '设备信息',
        'gain_control': '增益控制',
        'gain_value': '增益值',
        'custom_chord_add': '添加自定义和弦',
        'custom_chord_list': '自定义和弦列表',
        'custom_chord_actions': '自定义和弦操作',
        'sequence_dialog': '序列对话框',
        'sequence_item_dialog': '序列项对话框',
        
        // 语言按钮
        'lang_zh': '中文',
        'lang_en': 'English',
        
        // 页面标题
        'page_title': '吉他指板视觉化练习工具'
    },
    'en': {
        // Application title and description
        'app_title': '🎸 Guitar Scale and Chord Practice Tool - USB Audio Interface Support',
        'app_instructions': 'Supports guitar pitch detection through USB audio interface. Connect your USB audio interface and select the corresponding device to start practicing.',
        
        // Settings panel labels
        'settings_scale': 'Scale Settings',
        'settings_chord': 'Chord Settings',
        'settings_device': 'Device Settings',
        'settings_general': 'General Settings',
        
        // Scale settings
        'scale_root_note': 'Root Note',
        'scale_type': 'Scale Type',
        'scale_order': 'Playing Order',
        'scale_ordered': 'Ordered Play',
        'scale_random': 'Random Play',
        'scale_arpeggio': 'Melodic Progression',
        'scale_1to1': '1:1',
        'scale_1to2': '1:2',
        'scale_1to3': '1:3',
        'scale_2to1': '2:1',
        'scale_3to1': '3:1',
        
        // Chord settings
        'chord_root_note': 'Root Note',
        'chord_type': 'Chord Type',
        'chord_order': 'Playing Order',
        'chord_ordered': 'Ordered Play',
        'chord_random': 'Random Play',
        'chord_all': 'Select All',
        'chord_none': 'Clear All',
        'chord_invert': 'Invert Selection',
        'chord_custom': 'Custom Chords',
        'chord_add_custom': 'Add Custom Chord',
        'chord_custom_name': 'Chord Name',
        'chord_custom_intervals': 'Interval Sequence',
        'chord_add': 'Add',
        'chord_save': 'Save',
        'chord_cancel': 'Cancel',
        'chord_delete': 'Delete',
        'chord_edit': 'Edit',
        'chord_play_sequence': 'Play Sequence',
        'chord_select_sequence': 'Select Sequence',
        'chord_add_to_sequence': 'Add to Sequence',
        'chord_clear_sequence': 'Clear Sequence',
        'chord_move_up': 'Move Up',
        'chord_move_down': 'Move Down',
        'chord_sequence': 'Sequence',
        'chord_no_custom': 'No custom chords yet',
        'chord_no_sequence': 'No play sequence yet',
        
        // Device settings
        'device_audio_input': 'Audio Input Device',
        'device_refresh': 'Refresh Device List',
        'device_gain': 'Input Gain',
        'device_metronome': 'Metronome',
        'device_tempo': 'Tempo (BPM)',
        'device_sensitivity': 'Sensitivity',
        'device_cooldown': 'Cooldown Time',
        'device_cooldown_enabled': 'Enable Cooldown Time',
        'device_advanced': 'Advanced Settings',
        'device_show_advanced': 'Show Advanced Settings',
        'device_hide_advanced': 'Hide Advanced Settings',
        'device_confidence': 'Confidence Threshold',
        'device_noise': 'Noise Level',
        'device_volume': 'Minimum Volume',
        'device_buffer': 'Buffer Size',
        'device_harmonic': 'Harmonic Weights',
        'device_zero_crossing': 'Zero Crossing Threshold',
        
        // General settings
        'general_language': 'Language',
        'general_theme': 'Theme',
        'general_dark': 'Dark',
        'general_light': 'Light',
        'general_auto': 'Auto',
        'general_save': 'Save Settings',
        'general_reset': 'Reset Settings',
        
        // Buttons
        'btn_start': 'Start Practice',
        'btn_back': 'Back to Main Menu',
        'btn_add': 'Add',
        'btn_save': 'Save',
        'btn_cancel': 'Cancel',
        'btn_delete': 'Delete',
        'btn_edit': 'Edit',
        'btn_clear': 'Clear',
        'btn_select_all': 'Select All',
        'btn_select_none': 'Clear All',
        'btn_invert_selection': 'Invert Selection',
        
        // Status messages
        'status_ready': 'Ready',
        'status_recording': 'Recording',
        'status_loading': 'Loading...',
        'status_error': 'Error',
        'status_success': 'Success',
        'status_generating': 'Generating exercise...',
        'status_next_exercise': 'Next',
        'status_exercise_complete': 'Exercise complete! Preparing next...',
        'status_new_exercise': 'New exercise generated',
        'status_initializing': 'Initializing...',
        'status_device_updated': 'Device list updated',
        'status_device_failed': 'Failed to refresh devices',
        'status_init_failed': 'Initialization failed',
        'status_start_failed': 'Failed to start practice',
        'status_metronome_active': 'Metronome active',
        'status_cooling_down': 'Preparing next exercise...',
        'status_info': 'Info',
        'status_warning': 'Warning',
        
        // Shortcut hint
        'shortcut_hint': 'Press <span class="shortcut-key">ESC</span> to return to main menu',
        
        // Pitch display
        'pitch_frequency': 'Pitch',
        'pitch_cents': 'Cents',
        'pitch_confidence': 'Confidence',
        
        // Bottom navigation
        'nav_scale': 'Scale',
        'nav_chord': 'Chord',
        'nav_progression': 'Progression',
        'nav_settings': 'Settings',
        
        // Others
        'next_exercise': 'Next Exercise',
        'song_title': 'Practice Song',
        'scale_info': 'Scale Info',
        'target_interval': 'Target Interval',
        'sequence_display': 'Sequence Display',
        'sequence_items': 'Sequence Items',
        'confidence_bar': 'Confidence Bar',
        'usb_indicator': 'USB Indicator',
        'device_info': 'Device Info',
        'gain_control': 'Gain Control',
        'gain_value': 'Gain Value',
        'custom_chord_add': 'Add Custom Chord',
        'custom_chord_list': 'Custom Chord List',
        'custom_chord_actions': 'Custom Chord Actions',
        'sequence_dialog': 'Sequence Dialog',
        'sequence_item_dialog': 'Sequence Item Dialog',
        
        // Language buttons
        'lang_zh': 'Chinese',
        'lang_en': 'English',
        
        // Page title
        'page_title': 'Guitar Fretboard Visualization Practice Tool'
    }
};

// 当前语言
let currentLanguage = 'zh-CN';

// 初始化语言设置
function initLanguage() {
    console.log('开始初始化语言设置');
    // 从localStorage获取语言设置
    const savedLanguage = localStorage.getItem('appLanguage');
    console.log('从localStorage读取到的语言设置:', savedLanguage);
    if (savedLanguage && (savedLanguage === 'zh-CN' || savedLanguage === 'en')) {
        currentLanguage = savedLanguage;
        console.log('设置当前语言为:', currentLanguage);
    } else {
        // 默认使用中文
        currentLanguage = 'zh-CN';
        localStorage.setItem('appLanguage', currentLanguage);
        console.log('设置默认语言为中文');
    }
    console.log('当前语言设置完成，currentLanguage:', currentLanguage);
}

// 获取翻译文本
export function t(key) {
    console.log('获取翻译文本，当前语言:', currentLanguage, '键:', key);
    // 如果当前语言包中有对应的翻译，则返回翻译文本
    if (translations[currentLanguage] && translations[currentLanguage][key]) {
        console.log('找到翻译:', translations[currentLanguage][key]);
        return translations[currentLanguage][key];
    }
    // 如果没有找到翻译，返回键名或英文默认值
    const defaultValue = translations['en'][key] || key;
    console.log('未找到翻译，返回默认值:', defaultValue);
    return defaultValue;
}

// 切换语言
export function switchLanguage(lang) {
    console.log('尝试切换语言到:', lang);
    if (lang === 'zh-CN' || lang === 'en') {
        currentLanguage = lang;
        console.log('设置前localStorage中的语言:', localStorage.getItem('appLanguage'));
        localStorage.setItem('appLanguage', lang);
        console.log('设置后localStorage中的语言:', localStorage.getItem('appLanguage'));
        console.log('语言已切换到:', lang);
        // 触发语言切换事件
        window.dispatchEvent(new CustomEvent('languageChanged', { detail: lang }));
        return true;
    }
    console.log('语言切换失败，不支持的语言:', lang);
    return false;
}

// 获取当前语言
export function getCurrentLanguage() {
    return currentLanguage;
}

// 获取支持的语言列表
export function getSupportedLanguages() {
    return [
        { code: 'zh-CN', name: '中文' },
        { code: 'en', name: 'English' }
    ];
}

// 初始化
initLanguage();

// 导出语言包供其他模块使用
export { translations };