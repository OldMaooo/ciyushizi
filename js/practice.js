(function (global) {
    const Practice = {
        words: [],
        currentIndex: 0,
        wordsPerPage: 1,
        speedPerWord: 3,
        isActive: false,
        isPaused: false,
        startTime: null,
        elapsed: 0,
        timer: null,
        countdownTimer: null,
        currentGroupMarked: new Map(),
        log: null,
        resultsDirty: false,
        activeCardIndex: -1,
        currentGroup: [],

        init() {
            this.bindEvents();
            this.restoreSettings();
            this.bindAutoSave();
        },
        
        /**
         * 绑定自动保存事件（页面离开或刷新时）
         */
        bindAutoSave() {
            // 页面刷新或关闭前保存
            window.addEventListener('beforeunload', () => {
                if (this.log && this.log.id && document.getElementById('results')?.classList.contains('active')) {
                    this.autoSaveResults();
                }
            });
            
            // 页面隐藏时保存（移动端）
            document.addEventListener('visibilitychange', () => {
                if (document.hidden && this.log && this.log.id && document.getElementById('results')?.classList.contains('active')) {
                    this.autoSaveResults();
                }
            });
        },

        bindEvents() {
            const startBtn = document.getElementById('home-start-btn');
            if (startBtn) startBtn.addEventListener('click', () => this.startFromHome());

            const pauseBtn = document.getElementById('practice-pause-btn');
            if (pauseBtn) pauseBtn.addEventListener('click', () => {
                if (this.isPaused) this.resume(); else this.pause();
            });

            const prevBtn = document.getElementById('practice-prev-btn');
            if (prevBtn) prevBtn.addEventListener('click', () => this.prevGroup());

            const nextBtn = document.getElementById('practice-next-btn');
            if (nextBtn) nextBtn.addEventListener('click', () => this.nextGroup());

            const endBtn = document.getElementById('practice-end-btn');
            if (endBtn) endBtn.addEventListener('click', () => this.finish());

            // 键盘事件
            document.addEventListener('keydown', (e) => this.handleKeydown(e));
        },

        restoreSettings() {
            const settings = Storage.getSettings?.() || {};
            const countEl = document.getElementById('word-count-input-home');
            const speedEl = document.getElementById('home-speed');
            const perPageEl = document.getElementById('words-per-page-input-home');
            if (countEl && settings.total) countEl.value = settings.total;
            if (speedEl && settings.speed) speedEl.value = settings.speed;
            if (perPageEl && settings.perPage) perPageEl.value = settings.perPage;
        },

        startFromHome() {
            const settings = Storage.getSettings() || {};
            const countEl = document.getElementById('word-count-input-home');
            const speedEl = document.getElementById('home-speed');
            const perPageEl = document.getElementById('words-per-page-input-home');

            const total = Math.max(1, parseInt(countEl?.value || settings.total || 20, 10));
            const speed = Math.max(1, parseInt(speedEl?.value || settings.speed || 3, 10));
            const perPage = Math.max(1, parseInt(perPageEl?.value || settings.perPage || 1, 10));

            Storage.saveSettings({
                total,
                speed,
                perPage
            });

            // 从练习范围选择器获取选中的词语
            let selectedWords = [];
            if (global.PracticeRange) {
                selectedWords = PracticeRange.getSelectedWords('practice-range-container-home');
            }
            
            // 如果没有选中任何词语，使用全部词语库
            if (!selectedWords || selectedWords.length === 0) {
                selectedWords = Storage.getWordBank();
            }
            
            if (!selectedWords || selectedWords.length === 0) {
                alert('词语库为空，请先导入词语');
                return;
            }

            // 检查「只练错题」开关
            const onlyWrongToggle = document.getElementById('practice-range-only-wrong-toggle');
            if (onlyWrongToggle && onlyWrongToggle.checked) {
                const errorWords = Storage.getErrorWords();
                const errorWordIds = new Set(errorWords.map(item => item.wordId || item.id));
                selectedWords = selectedWords.filter(word => errorWordIds.has(word.id));
            }

            const shuffled = [...selectedWords].sort(() => Math.random() - 0.5);
            this.words = shuffled.slice(0, Math.min(total, shuffled.length));

            this.speedPerWord = speed;
            this.wordsPerPage = perPage;
            this.start();
        },

        startWithWords(words, speed, perPage) {
            if (!words || words.length === 0) {
                alert('没有可练习的词语');
                return;
            }

            Storage.saveSettings({
                total: words.length,
                speed,
                perPage
            });

            const shuffled = [...words].sort(() => Math.random() - 0.5);
            this.words = shuffled;
            this.speedPerWord = speed;
            this.wordsPerPage = perPage;
            this.start();
        },

        start() {
            this.isActive = true;
            this.isPaused = false;
            this.currentIndex = 0;
            this.currentGroupMarked = new Map();
            this.resultsDirty = false;
            this.startTime = Date.now();
            this.elapsed = 0;
            this.log = {
                id: `round_${Date.now()}`,
                date: new Date().toISOString(),
                totalWords: this.words.length,
                wordsPerPage: this.wordsPerPage,
                speedPerWord: this.speedPerWord,
                duration: 0,
                groups: []
            };

            this.showPage('practice');
            this.renderGroup();
            this.updateBadges();
            this.startCountdown();
            this.activeCardIndex = -1;
        },

        buildGroup(index) {
            const start = index * this.wordsPerPage;
            return this.words.slice(start, start + this.wordsPerPage);
        },

        renderGroup() {
            const container = document.getElementById('practice-card-container');
            if (!container) return;

            const group = this.buildGroup(this.currentIndex);
            this.currentGroup = group;
            if (!group.length) {
                container.innerHTML = `
                    <div class="text-muted py-5"><i class="bi bi-check2-circle"></i> 本轮练习已完成</div>
                `;
                return;
            }

            const stored = this.log.groups.find(item => item.index === this.currentIndex);
            if (stored) {
                this.currentGroupMarked = new Map(stored.words.map(word => [word.id, !!word.markedWrong]));
            } else {
                this.currentGroupMarked = new Map(group.map(word => [word.id, false]));
            }

            container.innerHTML = group.map((wordObj, idx) => {
                const id = wordObj.id || `word_${this.currentIndex}_${idx}`;
                const checked = this.currentGroupMarked.get(id);
                return CardComponent.render({
                    word: wordObj.word || '',
                    pinyin: wordObj.pinyin || '',
                    showPinyin: checked,
                    markedWrong: checked,
                    dataId: id,
                    dataGroupIndex: idx,
                    showCheckbox: true,
                    checkboxChecked: checked
                });
            }).join('');

            // 调整字体大小以适应卡片
            CardComponent.adjustCardFontSizes(container);

            // 绑定卡片点击事件
            container.querySelectorAll('.practice-card').forEach((card) => {
                card.addEventListener('click', (e) => {
                    // 如果点击的是复选框，不处理
                    if (e.target.closest('.practice-toggle')) return;
                    this.toggleCardMark(card);
                });
            });

            // 绑定复选框事件
            container.querySelectorAll('.practice-checkbox').forEach((checkbox) => {
                checkbox.addEventListener('change', (e) => {
                    e.stopPropagation();
                    const card = e.currentTarget.closest('.practice-card');
                    const id = card?.dataset?.id;
                    if (!id) return;
                    const wordObj = group.find(item => (item.id || `word_${this.currentIndex}_${group.indexOf(item)}`) === id);
                    const checked = !!e.currentTarget.checked;
                    this.currentGroupMarked.set(id, checked);
                    if (wordObj) {
                        this.updateCard(card, wordObj, checked);
                    }
                    this.persistCurrentGroupState();
                });
            });

            // 重置激活卡片
            this.activeCardIndex = -1;
            this.updateActiveCard();
            this.persistCurrentGroupState();
            this.startCountdown();
        },


        updateCard(card, wordObj, checked) {
            const pinyinEl = card.querySelector('.practice-pinyin');
            if (checked) {
                if (!pinyinEl) {
                    const el = document.createElement('div');
                    el.className = 'practice-pinyin';
                    el.textContent = wordObj.pinyin || '';
                    card.insertBefore(el, card.querySelector('.practice-word'));
                } else {
                    pinyinEl.textContent = wordObj.pinyin || '';
                }
                card.classList.add('marked-wrong');
            } else {
                if (pinyinEl) {
                pinyinEl.remove();
            }
                card.classList.remove('marked-wrong');
            }
            // 重新调整字体大小
            CardComponent.adjustCardFontSizes(card.parentElement);
        },

        toggleCardMark(card) {
            const id = card?.dataset?.id;
            if (!id) return;
            const checkbox = card.querySelector('.practice-checkbox');
            if (!checkbox) return;
            const checked = !checkbox.checked;
            checkbox.checked = checked;
            const wordObj = this.currentGroup.find(item => (item.id || `word_${this.currentIndex}_${this.currentGroup.indexOf(item)}`) === id);
            this.currentGroupMarked.set(id, checked);
            if (wordObj) {
                this.updateCard(card, wordObj, checked);
            }
            this.persistCurrentGroupState();
        },

        updateActiveCard() {
            const container = document.getElementById('practice-card-container');
            if (!container) return;
            const cards = container.querySelectorAll('.practice-card');
            cards.forEach((card, idx) => {
                if (idx === this.activeCardIndex) {
                    card.classList.add('active');
                } else {
                    card.classList.remove('active');
                }
            });
        },

        handleKeydown(e) {
            if (!this.isActive || this.isPaused) return;
            
            // 空格键：标记当前激活的卡片或hover的卡片
            if (e.code === 'Space' && !e.target.matches('input, textarea')) {
                e.preventDefault();
                const container = document.getElementById('practice-card-container');
                if (!container) return;
                
                let targetCard = null;
                if (this.activeCardIndex >= 0) {
                    const cards = container.querySelectorAll('.practice-card');
                    targetCard = cards[this.activeCardIndex];
                } else {
                    // 查找hover的卡片
                    const hovered = container.querySelector('.practice-card:hover');
                    if (hovered) targetCard = hovered;
                }
                
                if (targetCard) {
                    this.toggleCardMark(targetCard);
                }
                return;
            }

            // 左右箭头键：切换激活的卡片
            if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
                e.preventDefault();
                const container = document.getElementById('practice-card-container');
                if (!container) return;
                const cards = container.querySelectorAll('.practice-card');
                if (cards.length === 0) return;

                if (e.code === 'ArrowLeft') {
                    this.activeCardIndex = this.activeCardIndex <= 0 ? cards.length - 1 : this.activeCardIndex - 1;
                } else {
                    this.activeCardIndex = this.activeCardIndex >= cards.length - 1 ? 0 : this.activeCardIndex + 1;
                }
                this.updateActiveCard();
                // 滚动到可见区域
                cards[this.activeCardIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        },

        startCountdown() {
            clearInterval(this.countdownTimer);
            const countdownEl = document.getElementById('practice-countdown');
            if (!countdownEl) return;
            
            const totalTime = this.wordsPerPage * this.speedPerWord;
            let elapsed = 0;
            
            const update = () => {
                if (this.isPaused) return;
                elapsed++;
                const isOvertime = elapsed > totalTime;
                
                // 超时时变红色，但继续计时
                if (isOvertime) {
                    countdownEl.className = 'badge bg-danger-subtle text-danger ms-2';
                    countdownEl.textContent = `已超时: +${elapsed - totalTime}s`;
                } else {
                    countdownEl.className = 'badge bg-warning-subtle text-warning ms-2';
                    countdownEl.textContent = `正计时: ${elapsed}s`;
                }
            };
            
            // 重置样式
            countdownEl.className = 'badge bg-warning-subtle text-warning ms-2';
            countdownEl.textContent = `正计时: 0s`;
            
            update();
            this.countdownTimer = setInterval(update, 1000);
        },

        updateBadges() {
            const progressEl = document.getElementById('practice-progress');
            const timerEl = document.getElementById('practice-timer');
            const speedEl = document.getElementById('practice-speed-hint');

            const totalGroups = Math.ceil(this.words.length / this.wordsPerPage);
            if (progressEl) progressEl.textContent = `${Math.min(this.currentIndex + 1, totalGroups)}/${totalGroups}`;
            if (speedEl) speedEl.textContent = `速度 ${this.speedPerWord}s/词`;

            clearInterval(this.timer);
            const start = Date.now() - this.elapsed;
            this.timer = setInterval(() => {
                if (this.isPaused) return;
                this.elapsed = Date.now() - start;
                if (timerEl) timerEl.textContent = `${Math.round(this.elapsed / 1000)}s`;
            }, 500);
        },

        prevGroup() {
            if (!this.isActive || this.currentIndex === 0) return;
            this.persistCurrentGroupState();
            clearInterval(this.countdownTimer);
            this.currentIndex -= 1;
            this.renderGroup();
            this.updateBadges();
        },

        nextGroup() {
            if (!this.isActive) return;
            this.persistCurrentGroupState();
            clearInterval(this.countdownTimer);
            const totalGroups = Math.ceil(this.words.length / this.wordsPerPage);
            if (this.currentIndex + 1 >= totalGroups) {
                this.finish();
            } else {
                this.currentIndex += 1;
                this.renderGroup();
                this.updateBadges();
            }
        },

        pause() {
            this.isPaused = true;
            const btn = document.getElementById('practice-pause-btn');
            if (btn) btn.textContent = '继续';
        },

        resume() {
            this.isPaused = false;
            const btn = document.getElementById('practice-pause-btn');
            if (btn) btn.textContent = '暂停';
            this.updateBadges();
            this.startCountdown();
        },

        persistCurrentGroupState() {
            if (!this.log) return;
            const existing = this.log.groups.find(item => item.index === this.currentIndex);
            const existingMap = existing ? new Map(existing.words.map(item => [item.id, item])) : new Map();
            const now = new Date().toISOString();
            const groupWords = this.buildGroup(this.currentIndex).map(word => {
                const markedWrong = !!this.currentGroupMarked.get(word.id);
                const prev = existingMap.get(word.id);
                const markedAt = markedWrong
                    ? (prev?.markedAt || now)
                    : null;
                return {
                id: word.id,
                word: word.word,
                pinyin: word.pinyin,
                unit: word.unit,
                    markedWrong,
                    markedAt
                };
            });
            const groupId = `group_${this.currentIndex}`;
            const existingIdx = this.log.groups.findIndex(item => item.id === groupId);
            const record = {
                id: groupId,
                index: this.currentIndex,
                words: groupWords
            };
            if (existingIdx >= 0) {
                this.log.groups[existingIdx] = record;
            } else {
                this.log.groups.push(record);
            }
        },

        finish() {
            if (!this.isActive) return;
            this.persistCurrentGroupState();
            this.isActive = false;
            clearInterval(this.timer);
            clearInterval(this.countdownTimer);
            this.log.duration = Math.round((Date.now() - this.startTime) / 1000);

            // 检查是否在调试模式下
            const isDebugMode = typeof Debug !== 'undefined' && Debug.isEnabled;
            if (isDebugMode) {
                this.log.debugMode = true;
            }

            const errorWords = this.collectErrorRecords();
            // 为错题记录添加调试模式标识
            if (isDebugMode) {
                errorWords.forEach(item => {
                    item.debugMode = true;
                });
            }
            
            this.log.errorWords = errorWords;
            Storage.savePracticeLog(this.log);
            Storage.saveErrorWordsForRound(this.log.id, errorWords);
            global.Main?.restoreStats?.();

            this.renderResults(errorWords);
            this.showPage('results');
        },

        collectErrorRecords() {
            const errorWords = [];
            this.log.groups.forEach(group => {
                group.words.forEach((word, idx) => {
                    if (word.markedWrong) {
                        const markedAt = word.markedAt || new Date().toISOString();
                        word.markedAt = markedAt;
                        const errorId = `${this.log.id}_${group.index}_${word.id}_${idx}`;
                        word.errorId = errorId;
                        errorWords.push({
                            id: errorId,
                            wordId: word.id,
                            word: word.word,
                            pinyin: word.pinyin,
                            unit: word.unit,
                            roundId: this.log.id,
                            markedAt
                        });
                    }
                });
            });
            return errorWords;
        },

        renderResults(errorWords) {
            const totalEl = document.getElementById('result-total');
            const errorsEl = document.getElementById('result-errors');
            const accuracyEl = document.getElementById('result-accuracy');
            const durationEl = document.getElementById('result-duration');
            const container = document.getElementById('results-card-container');
            const commentEl = document.getElementById('result-comment-text');

            const totalWords = this.words.length;
            const errorCount = errorWords.length;
            const accuracy = totalWords ? Math.round(((totalWords - errorCount) / totalWords) * 100) : 0;

            if (totalEl) totalEl.textContent = totalWords;
            if (errorsEl) {
                errorsEl.innerHTML = errorCount > 0 ? `<span class="text-danger fw-bold">${errorCount}</span>` : errorCount;
            }
            if (accuracyEl) accuracyEl.textContent = `${accuracy}%`;
            if (durationEl) durationEl.textContent = `${this.log.duration}s`;

            // 总评语
            if (commentEl) {
                if (errorCount === 0) {
                    commentEl.textContent = '恭喜你完美过关！';
                } else {
                    commentEl.textContent = `真不错，我们抓到了${errorCount}个还不会的词`;
                }
            }

            if (container) {
                container.innerHTML = this.log.groups.map(group => {
                    return group.words.map(word => {
                        const checked = word.markedWrong;
                        return CardComponent.render({
                            word: word.word || '',
                            pinyin: word.pinyin || '',
                            showPinyin: checked,
                            markedWrong: checked,
                            dataId: word.id,
                            showCheckbox: true,
                            checkboxChecked: checked,
                            additionalClasses: 'result-card'
                        });
                    }).join('');
                }).join('');

                // 调整字体大小以适应卡片（使用setTimeout确保DOM已渲染）
                setTimeout(() => {
                    CardComponent.adjustCardFontSizes(container);
                }, 50);

                // 绑定卡片点击事件
                container.querySelectorAll('.practice-card').forEach((card) => {
                    card.addEventListener('click', (e) => {
                        // 如果点击的是复选框，不处理
                        if (e.target.closest('.practice-toggle')) return;
                        const checkbox = card.querySelector('.practice-checkbox');
                        if (checkbox) {
                            checkbox.checked = !checkbox.checked;
                            const id = card.dataset.id;
                            this.handleResultToggle(id, checkbox.checked, card);
                        }
                    });
                });

                // 绑定复选框事件
                container.querySelectorAll('.practice-checkbox').forEach((checkbox) => {
                    checkbox.addEventListener('change', (e) => {
                        e.stopPropagation();
                        const card = e.currentTarget.closest('.practice-card');
                        const id = card?.dataset?.id;
                        if (!id) return;
                        this.handleResultToggle(id, e.currentTarget.checked, card);
                    });
                });
            }

            this.toggleResultsDirty(false);
        },

        handleResultToggle(id, checked, card) {
            this.log.groups.forEach(group => {
                group.words.forEach(word => {
                    if (word.id === id) {
                        word.markedWrong = checked;
                        word.markedAt = checked ? new Date().toISOString() : null;
                        if (checked) {
                            let pinyinEl = card.querySelector('.practice-pinyin');
                            if (!pinyinEl) {
                                pinyinEl = document.createElement('div');
                                pinyinEl.className = 'practice-pinyin';
                                card.insertBefore(pinyinEl, card.querySelector('.practice-word'));
                            }
                            pinyinEl.textContent = word.pinyin || '';
                            card.classList.add('marked-wrong');
                        } else {
                            card.querySelector('.practice-pinyin')?.remove();
                            card.classList.remove('marked-wrong');
                        }
                        
                        // 重新调整字体大小（因为拼音显示可能会影响布局）
                        const container = card.closest('#results-card-container');
                        if (container) {
                            setTimeout(() => {
                                CardComponent.adjustCardFontSizes(container);
                            }, 50);
                        }
                    }
                });
            });
            this.toggleResultsDirty(true);
            this.updateResultsStats();
            
            // 更新总评语
            const commentEl = document.getElementById('result-comment-text');
            if (commentEl) {
                const errorCount = this.log.groups.reduce((sum, group) => {
                    return sum + group.words.filter(w => w.markedWrong).length;
                }, 0);
                if (errorCount === 0) {
                    commentEl.textContent = '恭喜你完美过关！';
                } else {
                    commentEl.textContent = `真不错，我们抓到了${errorCount}个还不会的词`;
                }
            }
        },

        toggleResultsDirty(isDirty) {
            this.resultsDirty = !!isDirty;
            const confirmBtn = document.getElementById('results-confirm-btn');
            if (confirmBtn) {
                // 有改动时显示，无改动时隐藏
                if (isDirty) {
                    confirmBtn.classList.remove('d-none');
                } else {
                    confirmBtn.classList.add('d-none');
                }
            }
        },

        updateResultsStats() {
            const totalWords = this.words.length;
            const errorWords = [];
            this.log.groups.forEach(group => {
                group.words.forEach(word => {
                    if (word.markedWrong) errorWords.push(word);
                });
            });
            const errorCount = errorWords.length;
            const accuracy = totalWords ? Math.round(((totalWords - errorCount) / totalWords) * 100) : 0;

            const errorsEl = document.getElementById('result-errors');
            const accuracyEl = document.getElementById('result-accuracy');
            if (errorsEl) errorsEl.textContent = errorCount;
            if (accuracyEl) accuracyEl.textContent = `${accuracy}%`;
        },

        showPage(pageId) {
            if (global.Main?.showPage) {
                global.Main.showPage(pageId);
            } else {
                document.querySelectorAll('.page-section').forEach(section => {
                    section.classList.add('d-none');
                    section.classList.remove('active');
                });
            const target = document.getElementById(pageId);
                if (target) {
                    target.classList.remove('d-none');
                    target.classList.add('active');
                }
            }
        },

        confirmResults() {
            if (!this.log || !this.log.id) return;
            
            // 检查是否在调试模式下
            const isDebugMode = typeof Debug !== 'undefined' && Debug.isEnabled;
            if (isDebugMode) {
                this.log.debugMode = true;
            }
            
            const errorWords = this.collectErrorRecords();
            // 为错题记录添加调试模式标识
            if (isDebugMode) {
                errorWords.forEach(item => {
                    item.debugMode = true;
                });
            }
            
            this.log.errorWords = errorWords;
            Storage.savePracticeLog(this.log);
            Storage.saveErrorWordsForRound(this.log.id, errorWords);
            this.toggleResultsDirty(false);
            
            // 刷新错题集显示
            if (global.ErrorBook) {
                ErrorBook.render();
            }
            global.Main?.restoreStats?.();
        },
        
        /**
         * 自动保存当前结果（用于页面离开或刷新时）
         */
        autoSaveResults() {
            if (!this.log || !this.log.id) return;
            
            // 检查是否在调试模式下
            const isDebugMode = typeof Debug !== 'undefined' && Debug.isEnabled;
            if (isDebugMode) {
                this.log.debugMode = true;
            }
            
            // 收集当前所有标记为错误的词语
            const errorWords = this.collectErrorRecords();
            // 为错题记录添加调试模式标识
            if (isDebugMode) {
                errorWords.forEach(item => {
                    item.debugMode = true;
                });
            }
            
            this.log.errorWords = errorWords;
            
            // 保存练习记录和错题
            Storage.savePracticeLog(this.log);
            Storage.saveErrorWordsForRound(this.log.id, errorWords);
        },

        retry() {
            if (!this.log) {
                this.showPage('home');
                return;
            }
            const settings = Storage.getSettings() || {};
            Storage.saveSettings({
                ...settings,
                total: this.words.length,
                speed: this.speedPerWord,
                perPage: this.wordsPerPage
            });
            this.showPage('practice');
            this.start();
        }
    };

    global.Practice = Practice;
})(window);
