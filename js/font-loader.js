/**
 * 字体加载器
 * 检测系统是否有楷体字体，如果没有则加载本地字体文件并缓存
 */
(function() {
    'use strict';

    const FontLoader = {
        fontName: 'KaiTi_GB2312',
        fontFile: 'upload/楷体_GB2312.ttf',
        fontFamily: 'KaiTi_GB2312, KaiTi, "楷体", "Kaiti SC", "STKaiti", "STKaiti SC", "SimKai", serif',
        
        /**
         * 检测是否为iPad/iOS设备
         */
        isIPadOrIOS() {
            const ua = navigator.userAgent || navigator.vendor || window.opera;
            return /iPad|iPhone|iPod/.test(ua) || 
                   (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS 13+
        },
        
        /**
         * 检测系统是否已有楷体字体
         * 使用 FontFace API 或 Canvas 测量方法
         */
        async checkSystemFont() {
            return new Promise((resolve) => {
                // iPad/iOS设备：直接使用Canvas方法，因为FontFace API可能不可靠
                if (this.isIPadOrIOS()) {
                    console.log('[FontLoader] 检测到iPad/iOS设备，使用Canvas方法检测字体');
                    resolve(this.checkSystemFontFallback());
                    return;
                }
                
                // 方法1: 使用 FontFace API (如果支持)
                if (typeof document !== 'undefined' && 'fonts' in document) {
                    const kaitiFonts = [
                        'KaiTi',
                        '楷体',
                        'Kaiti SC',
                        'STKaiti',
                        'STKaiti SC',
                        'SimKai'
                    ];
                    
                    // 等待字体加载完成
                    document.fonts.ready.then(() => {
                        Promise.all(kaitiFonts.map(fontName => {
                            return document.fonts.check(`12px "${fontName}"`);
                        })).then(results => {
                            const hasSystemFont = results.some(result => result === true);
                            
                            if (typeof Debug !== 'undefined' && Debug.isEnabled) {
                                Debug.log('FontLoader.checkSystemFont (FontFace API)', {
                                    results: results,
                                    hasSystemKaiTi: hasSystemFont
                                });
                            }
                            
                            // 如果检测到系统字体，再使用 Canvas 方法验证一次（更可靠）
                            if (hasSystemFont) {
                                const canvasResult = this.checkSystemFontFallback();
                                resolve(canvasResult);
                            } else {
                                resolve(false);
                            }
                        }).catch(() => {
                            // FontFace API 失败，使用备用方法
                            resolve(this.checkSystemFontFallback());
                        });
                    }).catch(() => {
                        // fonts.ready 失败，使用备用方法
                        resolve(this.checkSystemFontFallback());
                    });
                } else {
                    // 方法2: 使用 Canvas 测量 (备用方法)
                    resolve(this.checkSystemFontFallback());
                }
            });
        },
        
        /**
         * 备用字体检测方法：使用 Canvas 测量
         */
        checkSystemFontFallback() {
            try {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    console.log('[FontLoader] Canvas 不可用，将加载本地字体');
                    return false;
                }
                
                // 测试多个字符，提高检测准确性
                const testChars = ['永', '水', '火', '木', '金'];
                const testFonts = [
                    'KaiTi, "楷体", "Kaiti SC", "STKaiti", "STKaiti SC", "SimKai", serif',
                    'serif'
                ];
                
                // 测量每个字符在不同字体下的宽度
                const differences = testChars.map(char => {
                    const widths = testFonts.map(font => {
                        ctx.font = `20px ${font}`;
                        return ctx.measureText(char).width;
                    });
                    return Math.abs(widths[0] - widths[1]);
                });
                
                // 如果至少有一个字符的宽度差异大于阈值，说明系统可能有楷体
                // 但为了更保守，我们要求至少3个字符有明显差异
                const significantDiffs = differences.filter(diff => diff > 0.5);
                const hasSystemFont = significantDiffs.length >= 3;
                
                if (typeof Debug !== 'undefined' && Debug.isEnabled) {
                    Debug.log('FontLoader.checkSystemFontFallback (Canvas)', {
                        differences: differences,
                        significantDiffs: significantDiffs.length,
                        hasSystemKaiTi: hasSystemFont
                    });
                }
                
                console.log('[FontLoader] 字体检测结果:', {
                    hasSystemFont: hasSystemFont,
                    significantDiffs: significantDiffs.length,
                    differences: differences
                });
                
                return hasSystemFont;
            } catch (err) {
                console.warn('[FontLoader] 字体检测失败，将加载本地字体:', err);
                return false;
            }
        },
        
        /**
         * 从缓存加载字体
         */
        async loadFromCache() {
            try {
                // iPad/iOS可能不支持Cache API，使用IndexedDB作为备用
                if (this.isIPadOrIOS() && !('caches' in window)) {
                    console.log('[FontLoader] iPad/iOS设备且不支持Cache API，尝试使用IndexedDB');
                    return await this.loadFromIndexedDB();
                }
                
                const cache = await caches.open('font-cache-v1');
                const cachedResponse = await cache.match(this.fontFile);
                
                if (cachedResponse) {
                    const blob = await cachedResponse.blob();
                    const url = URL.createObjectURL(blob);
                    this.injectFont(url);
                    
                    if (typeof Debug !== 'undefined' && Debug.isEnabled) {
                        Debug.log('FontLoader.loadFromCache', { success: true });
                    }
                    
                    return true;
                }
                
                return false;
            } catch (err) {
                console.error('[FontLoader] 从缓存加载失败:', err);
                // 如果Cache API失败，尝试IndexedDB
                if (this.isIPadOrIOS()) {
                    console.log('[FontLoader] Cache API失败，尝试IndexedDB');
                    return await this.loadFromIndexedDB();
                }
                return false;
            }
        },
        
        /**
         * 从IndexedDB加载字体（iPad/iOS备用方案）
         */
        async loadFromIndexedDB() {
            return new Promise((resolve) => {
                try {
                    const request = indexedDB.open('font-storage', 1);
                    
                    request.onerror = () => {
                        console.warn('[FontLoader] IndexedDB打开失败');
                        resolve(false);
                    };
                    
                    request.onsuccess = (event) => {
                        const db = event.target.result;
                        const transaction = db.transaction(['fonts'], 'readonly');
                        const store = transaction.objectStore('fonts');
                        const getRequest = store.get(this.fontName);
                        
                        getRequest.onsuccess = () => {
                            if (getRequest.result) {
                                const blob = getRequest.result.blob;
                                const url = URL.createObjectURL(blob);
                                this.injectFont(url);
                                console.log('[FontLoader] 从IndexedDB加载字体成功');
                                resolve(true);
                            } else {
                                resolve(false);
                            }
                        };
                        
                        getRequest.onerror = () => {
                            console.warn('[FontLoader] 从IndexedDB读取失败');
                            resolve(false);
                        };
                    };
                    
                    request.onupgradeneeded = (event) => {
                        const db = event.target.result;
                        if (!db.objectStoreNames.contains('fonts')) {
                            db.createObjectStore('fonts');
                        }
                    };
                } catch (err) {
                    console.error('[FontLoader] IndexedDB操作失败:', err);
                    resolve(false);
                }
            });
        },
        
        /**
         * 下载字体文件并缓存
         */
        async downloadAndCache() {
            try {
                const response = await fetch(this.fontFile);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                
                const blob = await response.blob();
                
                // 缓存字体文件
                try {
                    if (this.isIPadOrIOS() && !('caches' in window)) {
                        // iPad/iOS且不支持Cache API，使用IndexedDB
                        await this.saveToIndexedDB(blob);
                    } else {
                        const cache = await caches.open('font-cache-v1');
                        await cache.put(this.fontFile, new Response(blob));
                    }
                } catch (cacheErr) {
                    console.warn('[FontLoader] 缓存失败，但继续使用字体:', cacheErr);
                    // 即使缓存失败，也继续使用字体
                }
                
                // 注入字体
                const url = URL.createObjectURL(blob);
                this.injectFont(url);
                
                if (typeof Debug !== 'undefined' && Debug.isEnabled) {
                    Debug.log('FontLoader.downloadAndCache', { 
                        success: true,
                        size: blob.size 
                    });
                }
                
                return true;
            } catch (err) {
                console.error('[FontLoader] 下载字体失败:', err);
                return false;
            }
        },
        
        /**
         * 保存字体到IndexedDB（iPad/iOS备用方案）
         */
        async saveToIndexedDB(blob) {
            return new Promise((resolve, reject) => {
                try {
                    const request = indexedDB.open('font-storage', 1);
                    
                    request.onerror = () => {
                        reject(new Error('IndexedDB打开失败'));
                    };
                    
                    request.onsuccess = (event) => {
                        const db = event.target.result;
                        const transaction = db.transaction(['fonts'], 'readwrite');
                        const store = transaction.objectStore('fonts');
                        const putRequest = store.put({ blob: blob }, this.fontName);
                        
                        putRequest.onsuccess = () => {
                            console.log('[FontLoader] 字体已保存到IndexedDB');
                            resolve(true);
                        };
                        
                        putRequest.onerror = () => {
                            reject(new Error('IndexedDB保存失败'));
                        };
                    };
                    
                    request.onupgradeneeded = (event) => {
                        const db = event.target.result;
                        if (!db.objectStoreNames.contains('fonts')) {
                            db.createObjectStore('fonts');
                        }
                    };
                } catch (err) {
                    reject(err);
                }
            });
        },
        
        /**
         * 注入字体到页面
         */
        injectFont(url) {
            // 移除已存在的字体样式
            const existingStyle = document.getElementById('custom-kaiti-font');
            if (existingStyle) {
                existingStyle.remove();
            }
            
            // 创建新的字体样式
            const style = document.createElement('style');
            style.id = 'custom-kaiti-font';
            style.textContent = `
                @font-face {
                    font-family: '${this.fontName}';
                    src: url('${url}') format('truetype');
                    font-weight: normal;
                    font-style: normal;
                    font-display: swap;
                }
            `;
            document.head.appendChild(style);
            
            // 更新CSS变量
            document.documentElement.style.setProperty('--kaiti-font-family', this.fontFamily);
        },
        
        /**
         * 初始化字体加载
         */
        async init() {
            console.log('[FontLoader] 开始初始化字体加载器...');
            
            // iPad/iOS设备：强制加载本地字体，因为系统字体检测可能不准确
            if (this.isIPadOrIOS()) {
                console.log('[FontLoader] iPad/iOS设备，强制加载本地字体以确保显示正确');
                await this.loadLocalFont();
                return;
            }
            
            // 检查系统字体
            const hasSystemFont = await this.checkSystemFont();
            
            if (hasSystemFont) {
                console.log('[FontLoader] 检测到系统已有楷体字体，无需加载');
                if (typeof Debug !== 'undefined' && Debug.isEnabled) {
                    Debug.log('FontLoader.init', { 
                        message: '系统已有楷体字体，无需加载',
                        hasSystemFont: true 
                    });
                }
                // 即使检测到系统字体，也设置 CSS 变量以确保字体栈正确
                document.documentElement.style.setProperty('--kaiti-font-family', this.fontFamily);
                return;
            }
            
            console.log('[FontLoader] 未检测到系统楷体，开始加载本地字体...');
            await this.loadLocalFont();
        },
        
        /**
         * 加载本地字体（从缓存或下载）
         */
        async loadLocalFont() {
            // 尝试从缓存加载
            const cached = await this.loadFromCache();
            if (cached) {
                console.log('[FontLoader] 从缓存加载字体成功');
                if (typeof Debug !== 'undefined' && Debug.isEnabled) {
                    Debug.log('FontLoader.loadLocalFont', { 
                        message: '从缓存加载字体成功',
                        fromCache: true 
                    });
                }
                return;
            }
            
            console.log('[FontLoader] 缓存中无字体，开始下载...');
            
            // 下载并缓存
            const downloaded = await this.downloadAndCache();
            if (downloaded) {
                console.log('[FontLoader] 下载并缓存字体成功');
                if (typeof Debug !== 'undefined' && Debug.isEnabled) {
                    Debug.log('FontLoader.loadLocalFont', { 
                        message: '下载并缓存字体成功',
                        downloaded: true 
                    });
                }
            } else {
                console.error('[FontLoader] 字体加载失败，将使用系统默认字体');
                // 即使下载失败，也设置 CSS 变量，使用系统字体栈
                document.documentElement.style.setProperty('--kaiti-font-family', this.fontFamily);
            }
        }
    };
    
    // 导出到全局
    if (typeof window !== 'undefined') {
        window.FontLoader = FontLoader;
    }
    
    // 页面加载完成后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => FontLoader.init());
    } else {
        FontLoader.init();
    }
})();

