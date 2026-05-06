(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,88258,t=>{"use strict";var e=t.i(94580);function n(){return/iPad|iPhone|iPod/.test(navigator.userAgent)||"MacIntel"===navigator.platform&&navigator.maxTouchPoints>1}function o(){return/^((?!chrome|android).)*safari/i.test(navigator.userAgent)}function i(){return n()&&o()}function r(){return n()||o()}function s(){return"u">typeof AudioContext&&"u">typeof AudioWorkletNode}function a(){return"u">typeof AudioContext||void 0!==window.webkitAudioContext}function u(){return window.AudioContext||window.webkitAudioContext||null}class c{unlocked=!1;unlockCallbacks=[];isUnlocked(){return this.unlocked}onUnlock(t){this.unlocked?t():this.unlockCallbacks.push(t)}async unlock(t){if(this.unlocked)return!0;try{let e=t.createOscillator(),n=t.createGain();return n.gain.value=0,e.connect(n),n.connect(t.destination),e.start(0),e.stop(t.currentTime+.001),"suspended"===t.state&&await t.resume(),this.unlocked=!0,this.unlockCallbacks.forEach(t=>t()),this.unlockCallbacks=[],!0}catch(t){return e.logger.error("iOS audio unlock failed:",t),!1}}reset(){this.unlocked=!1}}let l=new c;class d{context=null;isContextReady=!1;async createContext(){if(!a())return e.logger.warn("Web Audio API not supported"),null;let t=u();if(!t)return e.logger.warn("AudioContext not available"),null;try{return this.context=new t,r()?(e.logger.debug("iOS/Safari detected: Audio context requires user interaction"),"suspended"===this.context.state?this.isContextReady=!1:this.isContextReady=!0):this.isContextReady=!0,this.context}catch(t){return e.logger.error("Failed to create audio context:",t),null}}getContext(){return this.context}isReady(){return this.isContextReady&&null!==this.context&&"running"===this.context.state}async unlock(){if(!this.context)return!1;if("suspended"===this.context.state)try{await this.context.resume(),await l.unlock(this.context),this.isContextReady=!0,e.logger.debug("Audio context unlocked successfully")}catch(t){return e.logger.error("Failed to unlock audio context:",t),!1}return!0}async close(){if(this.context){try{await this.context.close()}catch(t){e.logger.error("Failed to close audio context:",t)}this.context=null,this.isContextReady=!1}}}let x=new d;function h(){return new Promise(t=>{let e=document.createElement("div");e.id="ios-audio-unlock-overlay",e.style.cssText=`
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      color: white;
      font-family: system-ui, -apple-system, sans-serif;
    `,e.innerHTML=`
      <div style="text-align: center; padding: 20px;">
        <div style="font-size: 48px; margin-bottom: 20px;">🎸</div>
        <h2 style="margin: 0 0 10px 0; font-size: 24px;">点击屏幕开始</h2>
        <p style="margin: 0; font-size: 16px; opacity: 0.8;">
          iOS 设备需要用户交互才能启动音频
        </p>
      </div>
    `;let n=async()=>{await x.unlock(),e.remove(),t()};e.addEventListener("click",n),e.addEventListener("touchstart",n),document.body.appendChild(e)})}async function g(){if(!r())return!0;let t=x.getContext();return!!t&&("suspended"===t.state&&await h(),x.isReady())}t.s(["IOSAudioContextManager",()=>d,"IOSAudioUnlocker",()=>c,"getAudioContextClass",()=>u,"handleIOSAudioUnlock",()=>g,"iosAudioContextManager",0,x,"iosAudioUnlocker",0,l,"isIOS",()=>n,"isIOSSafari",()=>i,"isSafari",()=>o,"needsUserInteractionForAudio",()=>r,"showIOSAudioUnlockPrompt",()=>h,"supportsAudioWorklet",()=>s,"supportsWebAudio",()=>a])}]);