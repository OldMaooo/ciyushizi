/**
 * 可视化调试模块
 * 用于在iPad等设备上直接查看调试信息，无需开发者工具
 */

(function(global) {
    const Debug = {
        isEnabled: false,
        logs: [],
        maxLogs: 100,
        
        /**
         * 初始化调试面板
         */
        init() {
            const toggleBtn = document.getElementById('debug-toggle-btn');
            const closeBtn = document.getElementById('debug-close-btn');
            const panel = document.getElementById('debug-panel');
            const refreshBtn = document.getElementById('debug-refresh-btn');
            const clearBtn = document.getElementById('debug-clear-btn');
            const exportBtn = document.getElementById('debug-export-btn');
            
            if (toggleBtn) {
                toggleBtn.addEventListener('click', () => this.toggle());
            }
            
            if (closeBtn) {
                closeBtn.addEventListener('click', () => this.hide());
            }
            
            if (refreshBtn) {
                refreshBtn.addEventListener('click', () => this.refresh());
            }
            
            if (clearBtn) {
                clearBtn.addEventListener('click', () => this.clearLogs());
            }
            
            if (exportBtn) {
                exportBtn.addEventListener('click', () => this.exportLogs());
            }
            
            // 初始化开关状态
            try { 
                this.isEnabled = localStorage.getItem('word_recognition_debugMode') === '1'; 
            } catch(e) { 
                this.isEnabled = false; 
            }
            
            const switchEl = document.getElementById('debug-mode-switch');
            if (switchEl) {
                switchEl.checked = this.isEnabled;
                switchEl.addEventListener('change', (e) => {
                    this.setEnabled(e.target.checked);
                });
            }

            // 初始化显示
            this.refresh();
            this.log('info', '调试面板已初始化', 'env');
            this.applyVisibility();
        },

        setEnabled(enabled) {
            this.isEnabled = !!enabled;
            try { 
                localStorage.setItem('word_recognition_debugMode', this.isEnabled ? '1' : '0'); 
            } catch(e) {}
            this.applyVisibility();
        },

        applyVisibility() {
            const panel = document.getElementById('debug-panel');
            if (panel) {
                panel.classList.toggle('d-none', !this.isEnabled);
            }
        },
        
        /**
         * 显示/隐藏调试面板
         */
        toggle() {
            const panel = document.getElementById('debug-panel');
            if (panel) {
                panel.classList.toggle('d-none');
                if (!panel.classList.contains('d-none')) {
                    this.refresh();
                }
            }
        },

        hide() {
            const panel = document.getElementById('debug-panel');
            if (panel) {
                panel.classList.add('d-none');
            }
        },

        /**
         * 记录日志
         */
        log(level, message, category = 'general', data = null) {
            if (!this.isEnabled && level !== 'error') return;
            
            const logEntry = {
                timestamp: new Date().toISOString(),
                level,
                message,
                category,
                data: data ? JSON.stringify(data, null, 2) : null
            };
            
            this.logs.push(logEntry);
            if (this.logs.length > this.maxLogs) {
                this.logs.shift();
            }
            
            // 如果面板可见，自动刷新
            const panel = document.getElementById('debug-panel');
            if (panel && !panel.classList.contains('d-none')) {
                this.refresh();
            }
        },

        /**
         * 刷新调试面板显示
         */
        refresh() {
            const content = document.getElementById('debug-content');
            if (!content) return;
            
            const logsHtml = this.logs.map(log => {
                const levelClass = {
                    'info': 'text-info',
                    'warn': 'text-warning',
                    'error': 'text-danger',
                    'success': 'text-success'
                }[log.level] || 'text-secondary';
                
                return `
                    <div class="mb-2 p-2 border rounded">
                        <div class="d-flex justify-content-between align-items-start">
                            <div class="flex-grow-1">
                                <span class="badge bg-${log.level === 'error' ? 'danger' : log.level === 'warn' ? 'warning' : 'info'} me-2">${log.level}</span>
                                <span class="badge bg-secondary me-2">${log.category}</span>
                                <span class="${levelClass}">${log.message}</span>
                            </div>
                            <small class="text-muted">${new Date(log.timestamp).toLocaleTimeString()}</small>
                        </div>
                        ${log.data ? `<pre class="mt-2 mb-0 small bg-light p-2 rounded">${log.data}</pre>` : ''}
                    </div>
                `;
            }).join('');
            
            content.innerHTML = logsHtml || '<div class="text-muted">暂无调试信息</div>';
        },

        /**
         * 清空日志
         */
        clearLogs() {
            this.logs = [];
            this.refresh();
        },

        /**
         * 导出日志
         */
        exportLogs() {
            const data = {
                exportDate: new Date().toISOString(),
                logs: this.logs
            };
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `debug_logs_${new Date().toISOString().split('T')[0]}.json`;
            link.click();
            URL.revokeObjectURL(url);
        },

        /**
         * 检查是否处于调试模式
         */
        isDebugMode() {
            return this.isEnabled;
        }
    };

    global.Debug = Debug;
})(window);

