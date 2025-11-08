(function (global) {
    const Main = {
        init() {
            try {
                Storage?.init?.();
                if (global.Debug) {
                    Debug.init();
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
                this.restoreStats();
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

            const refreshBtn = document.getElementById('refresh-stats-btn');
            if (refreshBtn) refreshBtn.addEventListener('click', () => this.restoreStats());

            const confirmBtn = document.getElementById('results-confirm-btn');
            if (confirmBtn) {
                confirmBtn.addEventListener('click', () => {
                    Practice.confirmResults();
                    alert('修改已保存');
                });
            }

            const retryBtn = document.getElementById('results-retry-btn');
            if (retryBtn) retryBtn.addEventListener('click', () => Practice.retry());
        },

        showPage(pageId) {
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
                    WordBank.refresh();
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
            const logs = Storage.getPracticeLogs();
            const stats = {
                totalRounds: logs.length,
                totalWords: logs.reduce((sum, log) => sum + (log.totalWords || 0), 0),
                errorWords: Storage.getErrorWords().length,
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
