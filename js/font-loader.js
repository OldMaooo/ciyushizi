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
         * 检测系统是否已有楷体字体
         * 使用 FontFace API 或 Canvas 测量方法
         */
        async checkSystemFont() {
            return new Promise((resolve) => {
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
                        
                        resolve(hasSystemFont);
                    }).catch(() => {
                        // FontFace API 失败，使用备用方法
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
                if (!ctx) return false;
                
                // 测试字符（楷体特有的字形特征）
                const testChar = '永';
                const testFonts = [
                    'KaiTi, "楷体", "Kaiti SC", "STKaiti", "STKaiti SC", "SimKai", serif',
                    'serif'
                ];
                
                const widths = testFonts.map(font => {
                    ctx.font = `16px ${font}`;
                    return ctx.measureText(testChar).width;
                });
                
                // 如果楷体字体的宽度与 serif 不同，说明系统有楷体
                const hasSystemFont = Math.abs(widths[0] - widths[1]) > 0.1;
                
                if (typeof Debug !== 'undefined' && Debug.isEnabled) {
                    Debug.log('FontLoader.checkSystemFontFallback (Canvas)', {
                        widths: widths,
                        hasSystemKaiTi: hasSystemFont
                    });
                }
                
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
                return false;
            }
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
                const cache = await caches.open('font-cache-v1');
                await cache.put(this.fontFile, new Response(blob));
                
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
            // 检查系统字体
            const hasSystemFont = await this.checkSystemFont();
            
            if (hasSystemFont) {
                if (typeof Debug !== 'undefined' && Debug.isEnabled) {
                    Debug.log('FontLoader.init', { 
                        message: '系统已有楷体字体，无需加载',
                        hasSystemFont: true 
                    });
                }
                return;
            }
            
            // 尝试从缓存加载
            const cached = await this.loadFromCache();
            if (cached) {
                if (typeof Debug !== 'undefined' && Debug.isEnabled) {
                    Debug.log('FontLoader.init', { 
                        message: '从缓存加载字体成功',
                        fromCache: true 
                    });
                }
                return;
            }
            
            // 下载并缓存
            const downloaded = await this.downloadAndCache();
            if (downloaded) {
                if (typeof Debug !== 'undefined' && Debug.isEnabled) {
                    Debug.log('FontLoader.init', { 
                        message: '下载并缓存字体成功',
                        downloaded: true 
                    });
                }
            } else {
                console.warn('[FontLoader] 字体加载失败，将使用系统默认字体');
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

