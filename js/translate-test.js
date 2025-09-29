// 翻译测试脚本
(function() {
    console.log('====== 翻译功能测试开始 ======');
    
    // 检查t函数是否可用
    if (typeof window.t === 'function') {
        console.log('t函数可用');
    } else {
        console.log('错误: t函数不可用，请确保i18n.js已正确加载');
    }
    
    // 检查switchLanguage函数是否可用
    if (typeof window.switchLanguage === 'function') {
        console.log('switchLanguage函数可用');
    } else {
        console.log('错误: switchLanguage函数不可用，请确保i18n.js已正确加载');
    }
    
    // 检查getCurrentLanguage函数是否可用
    if (typeof window.getCurrentLanguage === 'function') {
        console.log('getCurrentLanguage函数可用');
    } else {
        console.log('错误: getCurrentLanguage函数不可用，请确保i18n.js已正确加载');
    }
    
    // 获取当前语言
    if (typeof window.getCurrentLanguage === 'function') {
        const currentLang = window.getCurrentLanguage();
        console.log('当前语言:', currentLang);
    }
    
    // 测试获取几个翻译项
    if (typeof window.t === 'function') {
        console.log('测试翻译项:');
        console.log('app_title:', window.t('app_title'));
        console.log('btn_start:', window.t('btn_start'));
        console.log('status_ready:', window.t('status_ready'));
        console.log('nav_settings:', window.t('nav_settings'));
        console.log('general_language:', window.t('general_language'));
    }
    
    // 尝试切换到英文并测试翻译
    if (typeof window.switchLanguage === 'function' && typeof window.t === 'function') {
        console.log('\n尝试切换到英文:');
        const switchResult = window.switchLanguage('en');
        console.log('切换结果:', switchResult);
        
        // 再次获取当前语言
        if (typeof window.getCurrentLanguage === 'function') {
            const newLang = window.getCurrentLanguage();
            console.log('切换后语言:', newLang);
        }
        
        // 再次测试翻译项
        console.log('英文翻译测试:');
        console.log('app_title:', window.t('app_title'));
        console.log('btn_start:', window.t('btn_start'));
        console.log('status_ready:', window.t('status_ready'));
        console.log('nav_settings:', window.t('nav_settings'));
        console.log('general_language:', window.t('general_language'));
    }
    
    // 检查localStorage中的语言设置
    const localStorageLang = localStorage.getItem('appLanguage');
    console.log('\nlocalStorage中的语言设置:', localStorageLang);
    
    console.log('====== 翻译功能测试结束 ======');
})();