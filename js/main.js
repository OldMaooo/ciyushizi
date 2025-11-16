(function (global) {
    const Main = {
        init() {
            try {
                Storage?.init?.();
                if (global.Debug) {
                    Debug.init();
                }
                
                // 清理重复数据（在加载新数据之前）
                if (Storage && Storage.removeDuplicates) {
                    const result = Storage.removeDuplicates();
                    if (result.removed > 0) {
                        console.log(`🧹 启动时清理了 ${result.removed} 个重复词语`);
                    }
                }
                
                // 初始化默认词库（从外部文件加载）
                if (typeof InitData !== 'undefined') {
                    InitData.init();
                }
                this.bindNav();
                this.initTheme();
                this.bindQuickButtons();
                Practice.init();
                WordBank.init();
                ErrorBook.init();
                if (global.PracticeRange) {
                    PracticeRange.init();
                }
                // 确保首页默认显示
                const homeSection = document.getElementById('home');
                if (homeSection) {
                    homeSection.classList.remove('d-none');
                    homeSection.classList.add('active');
                }
                this.showPage('home');
                // 初始化时确保箭头状态正确
                this.updateNavButtonsVisibility('home');
                this.restoreStats();
                
                // 强制刷新按钮
                const forceRefreshBtn = document.getElementById('force-refresh-btn');
                if (forceRefreshBtn) {
                    forceRefreshBtn.addEventListener('click', () => {
                        // 强制刷新页面，清除浏览器缓存
                        location.reload(true);
                    });
                }
        } catch (err) {
                console.error('初始化失败', err);
                if (global.Debug) {
                    Debug.log('error', '初始化失败: ' + err.message, 'init', err);
                }
            }
        },

        bindQuickButtons() {
            // 题目数量快捷按钮（首页）
            document.querySelectorAll('.word-count-quick').forEach(btn => {
                btn.addEventListener('click', () => {
                    const value = btn.dataset.value;
                    const input = document.getElementById('word-count-input-home');
                    if (input) {
                        input.value = value;
                        input.focus();
                        this.syncSettingsToModal();
                    }
                });
            });
            
            // 每页词语数量快捷按钮（首页）
            document.querySelectorAll('.words-per-page-quick').forEach(btn => {
                btn.addEventListener('click', () => {
                    const value = btn.dataset.value;
                    const input = document.getElementById('words-per-page-input-home');
                    if (input) {
                        input.value = value;
                        input.focus();
                        this.syncSettingsToModal();
                    }
                });
            });

            // 监听首页设置变化，同步到弹窗
            const countInput = document.getElementById('word-count-input-home');
            const speedInput = document.getElementById('home-speed');
            const perPageInput = document.getElementById('words-per-page-input-home');
            
            if (countInput) {
                countInput.addEventListener('input', () => this.syncSettingsToModal());
            }
            if (speedInput) {
                speedInput.addEventListener('input', () => this.syncSettingsToModal());
            }
            if (perPageInput) {
                perPageInput.addEventListener('input', () => this.syncSettingsToModal());
            }
        },

        syncSettingsToModal() {
            // 同步首页设置到弹窗
            const homeCount = document.getElementById('word-count-input-home')?.value;
            const homeSpeed = document.getElementById('home-speed')?.value;
            const homePerPage = document.getElementById('words-per-page-input-home')?.value;
            
            const modalCount = document.getElementById('word-count-input-modal');
            const modalSpeed = document.getElementById('speed-input-modal');
            const modalPerPage = document.getElementById('words-per-page-input-modal');
            
            if (homeCount && modalCount) modalCount.value = homeCount;
            if (homeSpeed && modalSpeed) modalSpeed.value = homeSpeed;
            if (homePerPage && modalPerPage) modalPerPage.value = homePerPage;
        },

        bindNav() {
            document.querySelectorAll('a[href^="#"]').forEach(link => {
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    const hash = link.getAttribute('href')?.replace('#', '') || 'home';
                    this.showPage(hash);
                });
            });
            
            // 处理页面刷新时的hash路由
            window.addEventListener('hashchange', () => {
                const hash = window.location.hash.substring(1) || 'home';
                this.showPage(hash);
            });
            
            // 初始化时也检查hash（延迟执行，确保所有模块已初始化）
            setTimeout(() => {
                const hash = window.location.hash.substring(1) || 'home';
                if (hash !== 'home') {
                    this.showPage(hash);
                } else {
                    // 如果没有hash，确保显示首页
                    this.showPage('home');
                }
            }, 100);

            const refreshBtn = document.getElementById('refresh-stats-btn');
            if (refreshBtn) refreshBtn.addEventListener('click', () => this.restoreStats());

            // 结果页按钮事件委托（因为按钮是动态显示的）
            document.addEventListener('click', (e) => {
                // 练习模式按钮
                if (e.target.closest('#results-retry-btn')) {
                    e.preventDefault();
                    e.stopPropagation();
                    Practice.retry();
                } else if (e.target.closest('#results-practice-mode-btn')) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (global.Practice && Practice.log && Practice.log.id) {
                        if (global.ErrorBook) {
                            ErrorBook.enterPracticeModeForRound(Practice.log.id);
                        } else {
                            console.error('ErrorBook未初始化');
                        }
                    } else {
                        console.error('Practice.log不存在或未初始化');
                    }
                } else if (e.target.closest('#results-to-test-btn-from-practice')) {
                    e.preventDefault();
                    e.stopPropagation();
                    Practice.mode = 'test';
                    Practice.start('test');
                }
                
                // 测试模式按钮
                if (e.target.closest('#results-retry-test-btn')) {
                    e.preventDefault();
                    e.stopPropagation();
                    Practice.retryTest();
                } else if (e.target.closest('#results-test-errors-btn')) {
                    e.preventDefault();
                    e.stopPropagation();
                    Practice.retryTestErrors();
                } else if (e.target.closest('#results-complete-btn')) {
                    e.preventDefault();
                    e.stopPropagation();
                    Practice.showPage('home');
                }
                
                // 结果页模式切换按钮
                if (e.target.closest('#results-to-preview-btn')) {
                    e.preventDefault();
                    e.stopPropagation();
                    Practice.mode = 'preview';
                    Practice.start('preview');
                } else if (e.target.closest('#results-mode-select-btn')) {
                    e.preventDefault();
                    e.stopPropagation();
                    Practice.mode = 'practice';
                    Practice.start('practice');
                } else if (e.target.closest('#results-to-test-btn')) {
                    e.preventDefault();
                    e.stopPropagation();
                    Practice.mode = 'test';
                    Practice.start('test');
                }
                
                // 结果页关闭按钮
                if (e.target.closest('#results-close-btn')) {
                    e.preventDefault();
                    e.stopPropagation();
                    Practice.showPage('home');
                }
                
                // 确认修改按钮
                if (e.target.closest('#results-confirm-btn')) {
                    e.preventDefault();
                    e.stopPropagation();
                    Practice.confirmResults();
                    alert('修改已保存');
                }
            });
        },

        showPage(pageId) {
            // 控制翻页箭头的显示/隐藏
            this.updateNavButtonsVisibility(pageId);
            // 如果从结果页离开，自动保存
            const resultsPage = document.getElementById('results');
            if (resultsPage && resultsPage.classList.contains('active')) {
                if (global.Practice && Practice.log && Practice.log.id) {
                    Practice.autoSaveResults();
                }
            }
            
            // 隐藏所有页面
            document.querySelectorAll('.page-section').forEach(section => {
                section.classList.add('d-none');
                section.classList.remove('active');
            });
            
            // 显示目标页面
            const target = document.getElementById(pageId);
            if (target) {
                target.classList.remove('d-none');
                target.classList.add('active');
            }

            // 更新导航链接状态
            document.querySelectorAll('.navbar-nav .nav-link').forEach(link => {
                const href = link.getAttribute('href');
                const current = href ? href.replace('#', '') : '';
                link.classList.toggle('active', current === pageId);
            });
            
            // 页面切换后的特殊处理
            if (pageId === 'errorbook') {
                if (global.ErrorBook) {
                    ErrorBook.render();
                }
            } else if (pageId === 'wordbank') {
                if (global.WordBank) {
                    // 延迟重新绑定事件，确保DOM已完全加载
                    setTimeout(() => {
                        WordBank.bindEvents();
                        WordBank.refresh();
                        // 更新调试按钮可见性
                        if (WordBank.updateDebugButtonVisibility) {
                            WordBank.updateDebugButtonVisibility();
                        }
                    }, 100);
                }
            }
            // 首页按钮使用事件委托，不需要重新绑定
        },
        
        /**
         * 更新翻页箭头按钮的显示/隐藏
         */
        updateNavButtonsVisibility(pageId) {
            // 获取所有翻页箭头按钮
            const previewPrevBtn = document.getElementById('preview-prev-btn');
            const previewNextBtn = document.getElementById('preview-next-btn');
            const practicePrevBtn = document.getElementById('practice-prev-btn');
            const practiceNextBtn = document.getElementById('practice-next-btn');
            
            // 根据当前页面显示/隐藏对应的箭头
            if (pageId === 'preview') {
                if (previewPrevBtn) {
                    previewPrevBtn.classList.add('show');
                }
                if (previewNextBtn) {
                    previewNextBtn.classList.add('show');
                }
                if (practicePrevBtn) {
                    practicePrevBtn.classList.remove('show');
                }
                if (practiceNextBtn) {
                    practiceNextBtn.classList.remove('show');
                }
            } else if (pageId === 'practice') {
                if (previewPrevBtn) {
                    previewPrevBtn.classList.remove('show');
                }
                if (previewNextBtn) {
                    previewNextBtn.classList.remove('show');
                }
                if (practicePrevBtn) {
                    practicePrevBtn.classList.add('show');
                }
                if (practiceNextBtn) {
                    practiceNextBtn.classList.add('show');
                }
            } else {
                // 其他页面隐藏所有箭头
                if (previewPrevBtn) {
                    previewPrevBtn.classList.remove('show');
                }
                if (previewNextBtn) {
                    previewNextBtn.classList.remove('show');
                }
                if (practicePrevBtn) {
                    practicePrevBtn.classList.remove('show');
                }
                if (practiceNextBtn) {
                    practiceNextBtn.classList.remove('show');
                }
            }
        },

        initTheme() {
            const saved = localStorage.getItem('word_recognition_theme') || 'light';
            const htmlEl = document.documentElement;
            if (saved === 'dark') {
                htmlEl.setAttribute('data-bs-theme', 'dark');
            } else {
                htmlEl.removeAttribute('data-bs-theme');
            }
            const toggleBtn = document.getElementById('theme-toggle-btn');
            if (!toggleBtn) return;
            toggleBtn.addEventListener('click', () => {
                const isDark = htmlEl.getAttribute('data-bs-theme') === 'dark';
                if (isDark) {
                    htmlEl.removeAttribute('data-bs-theme');
                    localStorage.setItem('word_recognition_theme', 'light');
                } else {
                    htmlEl.setAttribute('data-bs-theme', 'dark');
                    localStorage.setItem('word_recognition_theme', 'dark');
                }
            });
        },

        restoreStats() {
            // 获取调试模式状态
            const isDebugMode = typeof Debug !== 'undefined' && Debug.isEnabled;
            
            // 获取数据并根据调试模式过滤
            let logs = Storage.getPracticeLogs();
            let errorWords = Storage.getErrorWords();
            
            // 如果不在调试模式下，过滤掉调试模式的记录
            if (!isDebugMode) {
                logs = logs.filter(log => !log.debugMode);
                errorWords = errorWords.filter(item => !item.debugMode);
            }
            
            const stats = {
                totalRounds: logs.length,
                totalWords: logs.reduce((sum, log) => sum + (log.totalWords || 0), 0),
                errorWords: errorWords.length,
                lastPractice: logs.length ? new Date(logs[logs.length - 1].date).toLocaleString('zh-CN') : '-'
            };

            const setText = (id, value) => {
                const el = document.getElementById(id);
                if (el) el.textContent = value;
            };

            setText('stat-total-rounds', stats.totalRounds);
            setText('stat-total-words', stats.totalWords);
            setText('stat-error-words', stats.errorWords);
            setText('stat-last-practice', stats.lastPractice);
        }
    };

    document.addEventListener('DOMContentLoaded', () => Main.init());

    global.Main = Main;
})(window);
