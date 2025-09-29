// 使用ml5.js的CREPE实现
importScripts('https://unpkg.com/ml5@0.12.2/dist/ml5.min.js');

// 循环缓冲区配置
const RING_BUFFER_SIZE = 4096; // 4倍于处理块大小
const PROCESSING_BUFFER_SIZE = 1024;

// Web Worker实现音频处理
class AudioProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'minVolume', defaultValue: 0.001 },
      { name: 'confidenceThreshold', defaultValue: 0.5 }
    ];
  }

  constructor() {
    super();
    // 初始化循环缓冲区
    this.ringBuffer = new Float32Array(RING_BUFFER_SIZE);
    this.readPos = 0;
    this.writePos = 0;
    this.availableSamples = 0;
    this.processingBuffer = new Float32Array(PROCESSING_BUFFER_SIZE);
    
    this.pitch = null; // ml5.js pitch detection对象
    this.audioContext = null;
    this.microphone = null;
    this.midiInput = null;
    this.port.onmessage = this.handleMessage.bind(this);
    
    // 初始化MIDI和音频
    this.initMIDI();
    this.initMl5Pitch();
    
    // 监控缓冲区状态
    this.monitorInterval = setInterval(() => {
      this.port.postMessage({
        type: 'buffer-status',
        usage: this.availableSamples / RING_BUFFER_SIZE,
        readPos: this.readPos,
        writePos: this.writePos
      });
    }, 1000);
  }

  // 写入数据到循环缓冲区
  writeToRingBuffer(data) {
    const dataLength = data.length;
    
    // 检查是否有足够空间
    if (this.availableSamples + dataLength > RING_BUFFER_SIZE) {
      console.warn('Ring buffer overflow, dropping samples');
      return false;
    }
    
    // 写入数据
    if (this.writePos + dataLength <= RING_BUFFER_SIZE) {
      this.ringBuffer.set(data, this.writePos);
    } else {
      const firstPart = RING_BUFFER_SIZE - this.writePos;
      const secondPart = dataLength - firstPart;
      this.ringBuffer.set(data.subarray(0, firstPart), this.writePos);
      this.ringBuffer.set(data.subarray(firstPart), 0);
    }
    
    this.writePos = (this.writePos + dataLength) % RING_BUFFER_SIZE;
    this.availableSamples += dataLength;
    return true;
  }

  // 从循环缓冲区读取数据
  readFromRingBuffer(targetBuffer) {
    const targetLength = targetBuffer.length;
    
    // 检查是否有足够数据
    if (this.availableSamples < targetLength) {
      return false;
    }
    
    // 读取数据
    if (this.readPos + targetLength <= RING_BUFFER_SIZE) {
      targetBuffer.set(this.ringBuffer.subarray(this.readPos, this.readPos + targetLength));
    } else {
      const firstPart = RING_BUFFER_SIZE - this.readPos;
      const secondPart = targetLength - firstPart;
      targetBuffer.set(this.ringBuffer.subarray(this.readPos), 0);
      targetBuffer.set(this.ringBuffer.subarray(0, secondPart), firstPart);
    }
    
    this.readPos = (this.readPos + targetLength) % RING_BUFFER_SIZE;
    this.availableSamples -= targetLength;
    return true;
  }

  async initMIDI() {
    if (navigator.requestMIDIAccess) {
      try {
        const midiAccess = await navigator.requestMIDIAccess();
        this.setupMIDIListeners(midiAccess);
      } catch (error) {
        console.error('MIDI初始化失败:', error);
      }
    }
  }

  setupMIDIListeners(midiAccess) {
    // 监听MIDI设备连接/断开
    midiAccess.onstatechange = (event) => {
      this.port.postMessage({
        type: 'midi-device',
        connected: event.port.state === 'connected',
        name: event.port.name
      });
    };

    // 设置现有设备
    for (const input of midiAccess.inputs.values()) {
      this.setupMIDIInput(input);
    }
  }

  setupMIDIInput(input) {
    input.onmidimessage = (message) => {
      const [status, note, velocity] = message.data;
      const noteOn = (status & 0xF0) === 0x90 && velocity > 0;
      
      if (noteOn) {
        // 转换为频率
        const frequency = 440 * Math.pow(2, (note - 69) / 12);
        this.handleMIDINote(frequency);
      }
    };
  }

  handleMIDINote(frequency) {
    // 转换为音符
    const note = this.frequencyToNote(frequency);
    const isMatch = this.checkNoteMatch(note);
    
    this.port.postMessage({
      type: 'midi-note',
      frequency,
      note,
      isMatch
    });
  }

  async initMl5Pitch() {
    try {
      this.port.postMessage({ type: 'crepe-loading', progress: 10 });
      
      // 等待ml5加载完成
      while (typeof ml5 === 'undefined') {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      this.port.postMessage({ type: 'crepe-loading', progress: 30 });
      
      // 创建AudioContext（在Worker中需要特殊处理）
      this.audioContext = new (self.AudioContext || self.webkitAudioContext)();
      
      this.port.postMessage({ type: 'crepe-loading', progress: 50 });
      
      // 初始化ml5 pitch detection
      // 注意：在Worker中，我们需要使用不同的方法来处理音频
      this.pitch = ml5.pitchDetection(
        'https://cdn.jsdelivr.net/gh/ml5js/ml5-data-and-models/models/pitch-detection/crepe/',
        this.audioContext,
        null, // 在processBuffer中手动提供音频数据
        () => {
          this.port.postMessage({ type: 'crepe-loading', progress: 90 });
          this.onModelLoaded();
        }
      );
      
    } catch (error) {
      console.error('初始化ml5 CREPE失败:', error);
      this.fallbackToYinAlgorithm();
    }
  }
  
  onModelLoaded() {
    this.port.postMessage({ type: 'crepe-loading', progress: 100 });
    this.port.postMessage({ type: 'crepe-ready' });
    console.log('ml5 CREPE模型加载完成');
  }
  
  async getCachedWasm() {
    try {
      const db = await this.openIndexedDB();
      const wasm = await new Promise((resolve) => {
        const tx = db.transaction('wasm-cache', 'readonly');
        const store = tx.objectStore('wasm-cache');
        const req = store.get('crepe-tiny');
        req.onsuccess = () => resolve(req.result?.wasm);
        req.onerror = () => resolve(null);
      });
      return wasm || null;
    } catch {
      return null;
    }
  }
  
  async checkWasmFile() {
    try {
      const response = await fetch('crepe-tiny.wasm', { method: 'HEAD' });
      const contentLength = +response.headers.get('Content-Length');
      return {
        exists: response.ok,
        valid: contentLength > 1000, // WASM文件应该至少有几KB
        size: contentLength || 0
      };
    } catch (error) {
      return { exists: false, valid: false, size: 0 };
    }
  }

  async fetchWasmWithProgress() {
    const response = await fetch('crepe-tiny.wasm');
    if (!response.ok) {
      throw new Error(`无法获取WASM文件: ${response.status}`);
    }
    
    const reader = response.body.getReader();
    const contentLength = +response.headers.get('Content-Length');
    
    if (contentLength < 1000) {
      throw new Error(`WASM文件过小: ${contentLength}字节`);
    }
    
    let receivedLength = 0;
    let chunks = [];
    
    while(true) {
      const {done, value} = await reader.read();
      if (done) break;
      
      chunks.push(value);
      receivedLength += value.length;
      
      // 更新进度 (30-70%范围)
      const progress = 30 + (receivedLength / contentLength) * 40;
      this.port.postMessage({ type: 'crepe-loading', progress });
    }
    
    return new Blob(chunks).arrayBuffer();
  }
  
  async cacheWasm(wasm) {
    try {
      const db = await this.openIndexedDB();
      await new Promise((resolve) => {
        const tx = db.transaction('wasm-cache', 'readwrite');
        const store = tx.objectStore('wasm-cache');
        store.put({ id: 'crepe-tiny', wasm });
        tx.oncomplete = resolve;
      });
    } catch (error) {
      console.warn('缓存WASM失败:', error);
    }
  }
  
  async openIndexedDB() {
    return new Promise((resolve) => {
      const req = indexedDB.open('AudioProcessorDB', 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('wasm-cache')) {
          db.createObjectStore('wasm-cache', { keyPath: 'id' });
        }
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = () => resolve(null);
    });
  }
  
  optimizeCrepeMemory() {
    if (this.crepe?.initialized) {
      this.crepe.freeTemporaryMemory();
      this.crepe.enableMemoryOptimization();
    }
  }
  
  fallbackToYinAlgorithm() {
    console.log('回退到YIN音高检测算法');
    this.port.postMessage({ 
      type: 'crepe-fallback',
      algorithm: 'yin',
      message: 'CREPE模型不可用，使用YIN算法进行音高检测'
    });
    
    // 初始化增强版YIN算法
    this.initEnhancedYin();
  }

  initEnhancedYin() {
    // 加载增强版YIN算法的配置
    this.yinConfig = {
      sampleRate: 44100,
      bufferSize: 1024,
      threshold: 0.1,
      probabilityThreshold: 0.1
    };
    
    console.log('增强版YIN算法已初始化');
    this.port.postMessage({ type: 'yin-ready' });
  }

  handleMessage(event) {
    switch(event.data.type) {
      case 'config':
        this.minVolume = event.data.minVolume;
        this.confidenceThreshold = event.data.confidenceThreshold;
        break;
      case 'next-exercise':
        this.generateNextExercise(event.data.rootNote);
        break;
    }
  }

  /**
   * 生成下一个练习
   * @param {string} rootNote - 根音符，如果未提供则随机选择
   */
  generateNextExercise(rootNote) {
    // 如果没有提供根音符，则随机选择一个
    if (!rootNote) {
      rootNote = this.getRandomNote();
    }
    
    // 随机选择练习类型
    const exerciseType = Math.random() > 0.5 ? 'scale' : 'chord';
    let exerciseInfo, intervals;
    
    if (exerciseType === 'scale') {
      const scaleType = this.getRandomScaleType();
      intervals = this.getScaleIntervals(scaleType);
      exerciseInfo = `${rootNote} ${scaleType}音阶`;
    } else {
      const chordType = this.getRandomChordType();
      intervals = this.getChordIntervals(chordType);
      exerciseInfo = `${rootNote} ${chordType}和弦`;
    }

    // 生成指板位置
    const positions = this.generatePositions();

    // 生成完整的DOM更新指令
    this.port.postMessage({
      type: 'dom-update',
      updates: [
        {
          selector: '#exerciseInfo',
          action: 'textContent',
          value: exerciseInfo
        },
        {
          selector: '#currentNote',
          action: 'textContent',
          value: "-"
        },
        {
          selector: '#progress',
          action: 'textContent',
          value: "0/0"
        },
        {
          selector: '#status',
          action: 'textContent',
          value: "新练习已生成，请开始演奏"
        }
      ],
      exerciseData: {
        rootNote,
        intervals,
        positions
      }
    });
  }

  getScaleIntervals(scaleType) {
    // 返回音阶间隔
    const scales = {
      major: ['1', '2', '3', '4', '5', '6', '7'],
      minor: ['1', '2', '♭3', '4', '5', '♭6', '♭7'],
      pentatonic: ['1', '2', '3', '5', '6']
    };
    return scales[scaleType] || scales.major;
  }

  getChordIntervals(chordType) {
    // 返回和弦间隔
    const chords = {
      major: ['1', '3', '5'],
      minor: ['1', '♭3', '5'],
      seventh: ['1', '3', '5', '♭7']
    };
    return chords[chordType] || chords.major;
  }

  getRandomNote() {
    const notes = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
    return notes[Math.floor(Math.random() * notes.length)];
  }

  getRandomScaleType() {
    const types = ['major', 'minor', 'pentatonic'];
    return types[Math.floor(Math.random() * types.length)];
  }
  
  getRandomChordType() {
    const types = ['major', 'minor', 'seventh'];
    return types[Math.floor(Math.random() * types.length)];
  }

  generatePositions() {
    // 生成指板位置
    return []; // 实际实现根据练习类型生成
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input.length === 0) return true;

    // 写入输入数据到循环缓冲区
    this.writeToRingBuffer(input[0]);

    // 当有足够数据时进行处理
    while (this.availableSamples >= PROCESSING_BUFFER_SIZE) {
      if (this.readFromRingBuffer(this.processingBuffer)) {
        this.processBuffer(this.processingBuffer);
      }
    }

    return true;
  }

  async processBuffer(buffer) {
    try {
      // 计算音量
      const volume = this.calculateVolume(buffer);
      if (volume < this.minVolume) {
        this.port.postMessage({ type: 'silence' });
        return;
      }

      // 检测音高和匹配结果
      const pitchData = await this.detectPitch(buffer, sampleRate);
      if (pitchData) {
        const isMatch = this.checkNoteMatch(pitchData.note);
        this.port.postMessage({
          type: 'pitch-result',
          frequency: pitchData.frequency,
          note: pitchData.note,
          isMatch: isMatch,
          volume: volume,
          bufferUsage: this.availableSamples / RING_BUFFER_SIZE
        });
      } else {
        this.port.postMessage({ type: 'no-pitch' });
      }
    } catch (error) {
      console.error('处理缓冲区时出错:', error);
      this.port.postMessage({ 
        type: 'error',
        message: '音频处理错误',
        details: error.message,
        bufferUsage: this.availableSamples / RING_BUFFER_SIZE
      });
    }
  }

  calculateVolume(buffer) {
    // 使用更高效的音量计算方法
    let sum = 0;
    let max = 0;
    const len = buffer.length;
    
    // 使用展开循环优化
    for (let i = 0; i < len; i += 8) {
      const v0 = buffer[i];
      const v1 = buffer[i+1] || 0;
      const v2 = buffer[i+2] || 0;
      const v3 = buffer[i+3] || 0;
      const v4 = buffer[i+4] || 0;
      const v5 = buffer[i+5] || 0;
      const v6 = buffer[i+6] || 0;
      const v7 = buffer[i+7] || 0;
      
      sum += v0*v0 + v1*v1 + v2*v2 + v3*v3 + v4*v4 + v5*v5 + v6*v6 + v7*v7;
      max = Math.max(max, Math.abs(v0), Math.abs(v1), Math.abs(v2), 
                    Math.abs(v3), Math.abs(v4), Math.abs(v5), 
                    Math.abs(v6), Math.abs(v7));
    }
    
    // 返回RMS和峰值比
    const rms = Math.sqrt(sum / len);
    return Math.max(rms, max * 0.6); // 结合RMS和峰值
  }

  async detectPitch(buffer, sampleRate) {
    if (!this.pitch) {
      // 如果ml5 pitch detection未准备好，使用YIN作为备用
      return this.detectPitchWithYin(buffer, sampleRate);
    }
    
    try {
      // 使用ml5 CREPE进行音高检测
      const result = await this.pitch.getPitch();
      
      if (result && result.frequency && result.frequency > 0) {
        const note = this.frequencyToNote(result.frequency);
        return { frequency: result.frequency, note };
      }
      
      return null;
    } catch (error) {
      console.warn('ml5 CREPE检测失败，使用YIN备用:', error);
      return this.detectPitchWithYin(buffer, sampleRate);
    }
  }
  
  detectPitchWithYin(buffer, sampleRate) {
    // 使用增强版YIN算法作为备用
    if (!this.yinConfig) {
      this.initEnhancedYin();
    }
    
    const frequency = this.performYinDetection(buffer, sampleRate);
    
    if (!frequency || frequency <= 0) {
      return null;
    }
    
    const note = this.frequencyToNote(frequency);
    return { frequency, note };
  }

  performYinDetection(buffer, sampleRate) {
    // 简化的YIN算法实现
    const threshold = this.yinConfig.threshold;
    const bufferSize = Math.min(buffer.length, this.yinConfig.bufferSize);
    
    // 计算自相关函数
    const autocorrelation = new Array(bufferSize / 2);
    
    for (let tau = 1; tau < bufferSize / 2; tau++) {
      let sum = 0;
      for (let i = 0; i < bufferSize / 2; i++) {
        const delta = buffer[i] - buffer[i + tau];
        sum += delta * delta;
      }
      autocorrelation[tau] = sum;
    }
    
    // 找到最小值
    let minTau = 1;
    let minValue = autocorrelation[1];
    
    for (let tau = 2; tau < autocorrelation.length; tau++) {
      if (autocorrelation[tau] < minValue) {
        minValue = autocorrelation[tau];
        minTau = tau;
      }
    }
    
    // 计算频率
    if (minTau > 0) {
      return sampleRate / minTau;
    }
    
    return null;
  }

  frequencyToNote(frequency) {
    const noteNames = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
    const a4 = 440.0;
    
    if (frequency <= 0) return "";
    
    const semitoneOffset = 12 * Math.log2(frequency / a4);
    const noteIndex = Math.round(semitoneOffset) + 57; // A4的索引是57
    const octave = Math.floor(noteIndex / 12);
    const nameIndex = noteIndex % 12;
    
    return `${noteNames[nameIndex]}${octave}`;
  }

  checkNoteMatch(note) {
    // 这里需要从主线程获取当前练习信息
    // 临时返回false，实际实现需要与主线程通信
    return false;
  }
}

registerProcessor('audio-processor', AudioProcessor);