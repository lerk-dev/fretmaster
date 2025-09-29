/**
 * UI核心模块 - 负责基础DOM操作和事件处理
 */

// 导出DOM操作函数
export const domUpdateQueue = {
    queue: [],
    pending: false,
    
    add(selector, action, value) {
        this.queue.push({ selector, action, value });
        if (!this.pending) {
            this.pending = true;
            requestAnimationFrame(() => this.process());
        }
    },
    
    process() {
        const fragment = document.createDocumentFragment();
        const tempContainer = document.createElement('div');
        
        while (this.queue.length) {
            const { selector, action, value } = this.queue.shift();
            const element = document.querySelector(selector);
            if (element) {
                const clone = element.cloneNode(true);
                clone[action] = value;
                tempContainer.appendChild(clone);
            }
        }
        
        const updates = tempContainer.children;
        for (let i = 0; i < updates.length; i++) {
            const newElement = updates[i];
            const oldElement = document.querySelector(newElement.tagName + 
                Array.from(newElement.attributes)
                    .map(attr => `[${attr.name}="${attr.value}"]`)
                    .join(''));
            if (oldElement) {
                oldElement.parentNode.replaceChild(newElement, oldElement);
            }
        }
        
        this.pending = false;
    }
};

// 节流函数
export function throttle(func, limit) {
    let inThrottle;
    return function executedFunction(...args) {
        if (!inThrottle) {
            func(...args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}