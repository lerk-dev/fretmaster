/**
 * ml5.js CREPE音高检测模块
 */

export class Ml5PitchDetector {
  constructor() {
    this.pitch = null;
    this.audioContext = null;
    this.microphone = null;
    this.isReady = false;
    this.isInitializing = false;
  }

  async initialize(audioContext, stream) {
    if (this.isInitializing) {
      console.log('ml5 CREPE正在初始化中...');
      return;
    }
    
    if (this.isReady) {
      console.log('ml5 CREPE已经初始化完成');
      return;
    }

    this.isInitializing = true;

    try {
      // 等待ml5加载完成
      while (typeof ml5 === 'undefined') {
        console.log('等待ml5.js加载...');
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      console.log('ml5.js已加载，版本:', ml5.version);

      this.audioContext = audioContext;
      
      // 创建媒体流源
      if (stream) {
        const source = this.audioContext.createMediaStreamSource(stream);
        
        // 初始化ml5 pitch detection
        this.pitch = ml5.pitchDetection(
          'https://cdn.jsdelivr.net/gh/ml5js/ml5-data-and-models/models/pitch-detection/crepe/',
          this.audioContext,
          source.mediaStream,
          () => this.onModelReady()
        );
      } else {
        // 如果没有流，先创建pitch detection对象
        this.pitch = ml5.pitchDetection(
          'https://cdn.jsdelivr.net/gh/ml5js/ml5-data-and-models/models/pitch-detection/crepe/',
          this.audioContext,
          undefined,
          () => this.onModelReady()
        );
      }

    } catch (error) {
      console.error('ml5 CREPE初始化失败:', error);
      this.isInitializing = false;
      throw error;
    }
  }

  onModelReady() {
    console.log('ml5 CREPE模型加载完成');
    this.isReady = true;
    this.isInitializing = false;
    
    // 触发自定义事件通知模型已就绪
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ml5-crepe-ready'));
    }
  }

  async getPitch() {
    if (!this.isReady || !this.pitch) {
      return null;
    }

    try {
      const result = await new Promise((resolve) => {
        this.pitch.getPitch((error, frequency) => {
          if (error) {
            console.warn('CREPE检测错误:', error);
            resolve(null);
          } else {
            resolve(frequency ? { frequency } : null);
          }
        });
      });

      return result;
    } catch (error) {
      console.warn('CREPE音高检测失败:', error);
      return null;
    }
  }

  // 检查是否准备就绪
  isModelReady() {
    return this.isReady;
  }

  // 获取模型状态
  getStatus() {
    if (this.isInitializing) return 'initializing';
    if (this.isReady) return 'ready';
    return 'not-initialized';
  }
}

// 创建全局实例
export const ml5PitchDetector = new Ml5PitchDetector();