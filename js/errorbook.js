(function (global) {
    function collectErrorRecordsFromLog(log) {
        const records = [];
        if (!log?.groups) return records;
        log.groups.forEach(group => {
            group.words?.forEach((word, idx) => {
                if (word.markedWrong) {
                    const markedAt = word.markedAt || log.date || new Date().toISOString();
                    records.push({
                        id: word.errorId || `${log.id}_${group.index}_${word.id}_${idx}`,
                        wordId: word.id,
                        word: word.word,
                        pinyin: word.pinyin,
                        unit: word.unit,
                        roundId: log.id,
                        markedAt
                    });
                }
            });
        });
        return records;
    }

    const ErrorBook = {
        adminMode: false,
        onlyWrong: false,
        practiceMode: false,
        hidePinyin: false,
        selectedKeys: new Set(),
        currentTab: 'rounds',
        hoveredCard: null,
        spaceHandlerBound: false,

        init() {
            this.bindEvents();
            this.render();
        },

        bindEvents() {
            const adminToggle = document.getElementById('errorbook-admin-toggle');
            if (adminToggle) {
                adminToggle.addEventListener('change', (e) => {
                    this.adminMode = e.target.checked;
                    this.selectedKeys.clear();
                    this.render();
                });
            }

            // 移除只看错题功能

            const practiceToggle = document.getElementById('errorbook-practice-toggle');
            if (practiceToggle) {
                practiceToggle.addEventListener('change', (e) => {
                    this.practiceMode = e.target.checked;
                    const hidePinyinSwitch = document.getElementById('errorbook-hide-pinyin-switch');
                    const startBtn = document.getElementById('errorbook-start-practice-btn');
                    const startBtnBottom = document.getElementById('errorbook-start-practice-btn-bottom');
                    const bottomBar = document.getElementById('errorbook-bottom-bar');
                    if (hidePinyinSwitch) hidePinyinSwitch.classList.toggle('d-none', !this.practiceMode);
                    if (startBtn) startBtn.classList.toggle('d-none', !this.practiceMode);
                    if (startBtnBottom) startBtnBottom.classList.toggle('d-none', !this.practiceMode);
                    if (bottomBar) bottomBar.classList.toggle('d-none', !this.practiceMode);
                    this.render();
                });
            }

            const hidePinyinToggle = document.getElementById('errorbook-hide-pinyin-toggle');
            if (hidePinyinToggle) {
                hidePinyinToggle.addEventListener('change', (e) => {
                    this.hidePinyin = e.target.checked;
                    this.render();
                });
            }

            const startPracticeBtn = document.getElementById('errorbook-start-practice-btn');
            const startPracticeBtnBottom = document.getElementById('errorbook-start-practice-btn-bottom');
            if (startPracticeBtn) {
                startPracticeBtn.addEventListener('click', () => {
                    this.showPracticeSettingsModal();
                });
            }
            if (startPracticeBtnBottom) {
                startPracticeBtnBottom.addEventListener('click', () => {
                    this.showPracticeSettingsModal();
                });
            }

            // 移除旧的空格键处理（现在由bindPracticeCardEvents处理）

            const tabRounds = document.getElementById('tab-errorbook-rounds');
            const tabSummary = document.getElementById('tab-errorbook-summary');
            if (tabRounds) {
                tabRounds.addEventListener('click', () => {
                    this.currentTab = 'rounds';
                    this.selectedKeys.clear();
                    this.render();
                });
            }
            if (tabSummary) {
                tabSummary.addEventListener('click', () => {
                    this.currentTab = 'summary';
                    this.selectedKeys.clear();
                    this.render();
                });
            }
        },

        render() {
            const logs = Storage.getPracticeLogs();
            const errorWords = Storage.getErrorWords();
            const roundsContainer = document.getElementById('errorbook-rounds');
            const summaryContainer = document.getElementById('errorbook-summary');
            if (!roundsContainer || !summaryContainer) return;

            // 练习模式下，只显示错题卡片
            if (this.practiceMode) {
                let practiceWords = errorWords;
                
                if (!practiceWords.length) {
                    roundsContainer.innerHTML = '<div class="text-muted text-center py-4">暂无错题</div>';
                    summaryContainer.innerHTML = '<div class="text-muted text-center py-4">暂无错题</div>';
                } else {
                    const cards = practiceWords.map(item => this.renderCard({
                        id: item.wordId || item.id,
                        word: item.word,
                        pinyin: item.pinyin,
                        unit: item.unit,
                        markedWrong: true
                    }, { mode: 'practice' })).join('');
                    roundsContainer.innerHTML = `<div class="d-flex flex-wrap gap-3" style="padding-bottom: 100px;">${cards}</div>`;
                    summaryContainer.innerHTML = `<div class="d-flex flex-wrap gap-3" style="padding-bottom: 100px;">${cards}</div>`;
                    
                    // 绑定卡片交互事件
                    this.bindPracticeCardEvents(roundsContainer);
                    this.bindPracticeCardEvents(summaryContainer);
                }
                return;
            }

            // 正常模式
            if (!logs.length) {
                roundsContainer.innerHTML = '<div class="text-muted text-center py-4">暂无错题记录</div>';
            } else {
                roundsContainer.innerHTML = logs.map((log, idx) => this.renderRound(log, idx, logs.length)).join('');
            }

            if (!errorWords.length) {
                summaryContainer.innerHTML = '<div class="text-muted text-center py-4">暂无错题</div>';
            } else {
                summaryContainer.innerHTML = this.renderSummary(errorWords);
            }

            this.bindCardEvents(roundsContainer);
            this.bindCardEvents(summaryContainer);
        },

        renderRound(log, idx, total) {
            const collapseId = `error-round-${idx}`;
            const expanded = idx >= total - 5;
            const stats = this.computeRoundStats(log);
            const words = log.groups.flatMap(group => group.words);
            const filteredWords = this.onlyWrong ? words.filter(w => w.markedWrong) : words;
            const cards = filteredWords.map(word => this.renderCard(word, {
                mode: 'round',
                roundId: log.id,
                groupIndex: log.groups.find(g => g.words.some(w => w.id === word.id))?.index ?? 0
            })).join('');
            return `
                <div class="accordion mb-2" id="round-${idx}">
                    <div class="accordion-item">
                        <h2 class="accordion-header" id="heading-${idx}">
                            <button class="accordion-button ${expanded ? '' : 'collapsed'}" type="button" data-bs-toggle="collapse" data-bs-target="#${collapseId}">
                                第 ${idx + 1} 轮 · ${new Date(log.date).toLocaleString('zh-CN')} · 总题 ${log.totalWords} · 错题 ${stats.errorCount}
                            </button>
                        </h2>
                        <div id="${collapseId}" class="accordion-collapse collapse ${expanded ? 'show' : ''}" data-bs-parent="#round-${idx}">
                            <div class="accordion-body">
                                <div class="d-flex flex-wrap gap-3">
                                    ${cards || '<div class="text-muted">暂无符合条件的词语</div>'}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        },

        renderSummary(errorWords) {
            const grouped = errorWords.reduce((map, item) => {
                const key = item.wordId;
                if (!map.has(key)) map.set(key, []);
                map.get(key).push(item);
                return map;
            }, new Map());

            const sorted = Array.from(grouped.entries()).sort((a, b) => b[1].length - a[1].length);
            const filtered = this.onlyWrong ? sorted.filter(([wordId, records]) => {
                // 检查当前状态是否为错题
                const latest = records[records.length - 1];
                return latest.markedWrong !== false;
            }) : sorted;
            
            return `
                <div class="row g-3">
                    ${filtered.length ? filtered.map(([wordId, records]) => {
                        const latest = records[records.length - 1];
                        return `
                            <div class="col-md-4">
                                ${this.renderCard({
                                    id: wordId,
                                    word: latest.word,
                                    pinyin: latest.pinyin,
                                    unit: latest.unit,
                                    markedWrong: true,
                                    markedAt: latest.markedAt
                                }, {
                                    mode: 'summary',
                                    wordId,
                                    errorCount: records.length,
                                    lastMarkedAt: latest.markedAt
                                })}
                            </div>
                        `;
                    }).join('') : '<div class="col-12 text-muted text-center py-4">暂无符合条件的词语</div>'}
                </div>
            `;
        },

        renderCard(word, meta = {}) {
            const checked = word.markedWrong;
            const key = this.buildSelectionKey(meta, word);
            const selected = key ? this.selectedKeys.has(key) : false;
            const markBadge = checked ? '<span class="position-absolute top-0 end-0" style="font-size: 1.5rem; line-height: 1; padding: 0.25rem;">❌</span>' : '';
            
            // 练习模式下只显示拼音和词语
            if (this.practiceMode) {
                // 练习模式下，拼音显示由点击/hover+空格控制，与隐藏拼音开关独立
                return `
                    <div class="practice-card position-relative errorbook-practice-card" 
                         data-word-id="${word.id}" 
                         data-key="${key || ''}"
                         data-pinyin="${word.pinyin || ''}">
                        <div class="practice-pinyin d-none">${word.pinyin || ''}</div>
                        <div class="practice-word">${word.word || ''}</div>
                    </div>
                `;
            }
            
            const extra = meta.mode === 'summary'
                ? `<div class="small text-muted mt-2">错误次数：${meta.errorCount || 0}</div>
                   <div class="small text-muted">最近错误：${meta.lastMarkedAt ? new Date(meta.lastMarkedAt).toLocaleString('zh-CN') : '-'}</div>`
                : '';
            const checkboxHtml = this.adminMode 
                ? `<label class="practice-toggle">
                     <input type="checkbox" class="practice-checkbox errorbook-select" data-key="${key || ''}" ${selected ? 'checked' : ''} />
                   </label>`
                : '';
            return `
                <div class="practice-card position-relative ${checked ? 'marked-wrong' : ''}" data-round-id="${meta.roundId || ''}" data-word-id="${word.id}" data-group-index="${meta.groupIndex ?? ''}" data-key="${key || ''}">
                    ${markBadge}
                    ${checkboxHtml}
                    ${checked ? `<div class="practice-pinyin">${word.pinyin || ''}</div>` : ''}
                    <div class="practice-word">${word.word || ''}</div>
                    ${extra}
                </div>
            `;
        },

        showPracticeSettingsModal() {
            // 从首页或存储同步设置到弹窗
            const homeCountEl = document.getElementById('word-count-input-home');
            const homeSpeedEl = document.getElementById('home-speed');
            const homePerPageEl = document.getElementById('words-per-page-input-home');
            const settings = Storage.getSettings() || {};
            
            const countEl = document.getElementById('word-count-input-modal');
            const speedEl = document.getElementById('speed-input-modal');
            const perPageEl = document.getElementById('words-per-page-input-modal');
            
            // 优先使用首页的值，其次使用存储的值
            if (countEl) countEl.value = homeCountEl?.value || settings.total || 20;
            if (speedEl) speedEl.value = homeSpeedEl?.value || settings.speed || 3;
            if (perPageEl) perPageEl.value = homePerPageEl?.value || settings.perPage || 1;

            // 绑定快捷按钮
            document.querySelectorAll('.word-count-quick-modal').forEach(btn => {
                btn.onclick = () => {
                    if (countEl) {
                        countEl.value = btn.dataset.value;
                        // 同步到首页
                        if (homeCountEl) homeCountEl.value = btn.dataset.value;
                    }
                };
            });
            document.querySelectorAll('.words-per-page-quick-modal').forEach(btn => {
                btn.onclick = () => {
                    if (perPageEl) {
                        perPageEl.value = btn.dataset.value;
                        // 同步到首页
                        if (homePerPageEl) homePerPageEl.value = btn.dataset.value;
                    }
                };
            });

            // 监听弹窗输入变化，同步到首页
            if (countEl) {
                countEl.addEventListener('input', () => {
                    if (homeCountEl) homeCountEl.value = countEl.value;
                });
            }
            if (speedEl) {
                speedEl.addEventListener('input', () => {
                    if (homeSpeedEl) homeSpeedEl.value = speedEl.value;
                });
            }
            if (perPageEl) {
                perPageEl.addEventListener('input', () => {
                    if (homePerPageEl) homePerPageEl.value = perPageEl.value;
                });
            }

            // 显示弹窗
            const modal = new bootstrap.Modal(document.getElementById('practice-settings-modal'));
            modal.show();

            // 确认按钮
            const confirmBtn = document.getElementById('practice-settings-confirm-btn');
            if (confirmBtn) {
                // 移除旧的事件监听器
                const newConfirmBtn = confirmBtn.cloneNode(true);
                confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
                
                newConfirmBtn.addEventListener('click', () => {
                    const total = parseInt(countEl?.value || 20);
                    const speed = parseInt(speedEl?.value || 3);
                    const perPage = parseInt(perPageEl?.value || 1);
                    
                    // 保存设置
                    Storage.saveSettings({ total, speed, perPage });
                    
                    // 同步到首页
                    if (homeCountEl) homeCountEl.value = total;
                    if (homeSpeedEl) homeSpeedEl.value = speed;
                    if (homePerPageEl) homePerPageEl.value = perPage;
                    
                    modal.hide();
                    
                    // 开始练习
                    this.startPracticeFromErrorBook(total, speed, perPage);
                });
            }
        },

        bindPracticeCardEvents(container) {
            if (!container) return;
            
            // 点击卡片显示/隐藏拼音
            container.querySelectorAll('.errorbook-practice-card').forEach(card => {
                card.addEventListener('click', (e) => {
                    const pinyinEl = card.querySelector('.practice-pinyin');
                    if (pinyinEl) {
                        pinyinEl.classList.toggle('d-none');
                    }
                });
            });
            
            // hover跟踪
            container.querySelectorAll('.errorbook-practice-card').forEach(card => {
                card.addEventListener('mouseenter', () => {
                    this.hoveredCard = card;
                });
                card.addEventListener('mouseleave', () => {
                    this.hoveredCard = null;
                });
            });
            
            // 键盘事件：空格键显示当前hover的卡片拼音（只绑定一次）
            if (!this.spaceHandlerBound) {
                this.spaceHandlerBound = true;
                document.addEventListener('keydown', (e) => {
                    if (this.practiceMode && e.code === 'Space' && !e.target.matches('input, textarea')) {
                        const errorbookPage = document.getElementById('errorbook');
                        if (errorbookPage && !errorbookPage.classList.contains('d-none') && this.hoveredCard) {
                            e.preventDefault();
                            const pinyinEl = this.hoveredCard.querySelector('.practice-pinyin');
                            if (pinyinEl) {
                                pinyinEl.classList.toggle('d-none');
                            }
                        }
                    }
                });
            }
        },

        startPracticeFromErrorBook(total, speed, perPage) {
            // 获取错题集中的所有错题
            const errorWords = Storage.getErrorWords();
            if (!errorWords || errorWords.length === 0) {
                alert('错题集中没有错题，无法开始练习');
                return;
            }
            
            // 转换为练习格式
            const words = errorWords.map(item => ({
                id: item.wordId || item.id,
                word: item.word,
                pinyin: item.pinyin,
                unit: item.unit
            }));
            
            // 随机打乱
            for (let i = words.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [words[i], words[j]] = [words[j], words[i]];
            }
            
            // 限制数量
            const limitedWords = words.slice(0, total);
            
            // 调用练习模块开始练习
            if (global.Practice) {
                Practice.startWithWords(limitedWords, speed, perPage);
            }
        },

        buildSelectionKey(meta, word) {
            if (!this.adminMode) return '';
            if (meta.mode === 'summary') {
                return `summary::${word.id}`;
            }
            if (meta.mode === 'round' && meta.roundId) {
                return `round::${meta.roundId}::${meta.groupIndex ?? 0}::${word.id}`;
            }
            return '';
        },

        bindCardEvents(container) {
            if (!container) return;
            
            if (this.adminMode) {
                container.querySelectorAll('.errorbook-select').forEach((checkbox) => {
                    const key = checkbox.dataset.key;
                    if (!key) return;
                    checkbox.addEventListener('change', (e) => {
                        e.stopPropagation();
                        const card = checkbox.closest('.practice-card');
                        const cardKey = card?.dataset?.key;
                        if (!cardKey) return;
                        
                        const newState = checkbox.checked;
                        const isWrong = card.classList.contains('marked-wrong');
                        
                        // 如果点击的卡片状态改变，所有选中的卡片都切换到这个状态
                        if (this.selectedKeys.size > 0) {
                            this.selectedKeys.forEach(selectedKey => {
                                const selectedCard = container.querySelector(`[data-key="${selectedKey}"]`);
                                if (selectedCard) {
                                    const selectedCheckbox = selectedCard.querySelector('.errorbook-select');
                                    if (selectedCheckbox) {
                                        selectedCheckbox.checked = newState;
                                        if (newState) {
                                            this.selectedKeys.add(selectedKey);
                                        } else {
                                            this.selectedKeys.delete(selectedKey);
                                        }
                                        
                                        // 切换状态：如果点击的卡片从对切到错，所有选中卡片都切到错
                                        if (!isWrong && newState) {
                                            selectedCard.classList.add('marked-wrong');
                                            const pinyinEl = selectedCard.querySelector('.practice-pinyin');
                                            if (!pinyinEl && selectedCard.dataset.wordId) {
                                                // 需要从数据中获取拼音
                                                const wordData = this.getWordData(selectedCard);
                                                if (wordData?.pinyin) {
                                                    const el = document.createElement('div');
                                                    el.className = 'practice-pinyin';
                                                    el.textContent = wordData.pinyin;
                                                    selectedCard.insertBefore(el, selectedCard.querySelector('.practice-word'));
                                                }
                                            }
                                        } else if (isWrong && !newState) {
                                            selectedCard.classList.remove('marked-wrong');
                                            const pinyinEl = selectedCard.querySelector('.practice-pinyin');
                                            if (pinyinEl) pinyinEl.remove();
                                        }
                                    }
                                }
                            });
                        } else {
                            // 没有选中其他卡片，只处理当前卡片
                            if (newState) {
                                this.selectedKeys.add(key);
                            } else {
                                this.selectedKeys.delete(key);
                            }
                        }
                        
                        // 更新当前卡片状态
                        if (newState) {
                            this.selectedKeys.add(key);
                        } else {
                            this.selectedKeys.delete(key);
                        }
                        
                        // 保存状态
                        this.saveCardStates(container);
                    });
                });
            }
        },

        getWordData(card) {
            // 从卡片数据中获取词语信息
            const wordId = card.dataset.wordId;
            if (!wordId) return null;
            
            const logs = Storage.getPracticeLogs();
            for (const log of logs) {
                for (const group of log.groups || []) {
                    for (const word of group.words || []) {
                        if (word.id === wordId) {
                            return word;
                        }
                    }
                }
            }
            return null;
        },

        saveCardStates(container) {
            // 保存卡片状态到存储
            const logs = Storage.getPracticeLogs();
            container.querySelectorAll('.practice-card').forEach(card => {
                const roundId = card.dataset.roundId;
                const wordId = card.dataset.wordId;
                const groupIndex = parseInt(card.dataset.groupIndex) || 0;
                const isWrong = card.classList.contains('marked-wrong');
                
                if (roundId && wordId) {
                    const log = logs.find(l => l.id === roundId);
                    if (log) {
                        const group = log.groups.find(g => g.index === groupIndex);
                        if (group) {
                            const word = group.words.find(w => w.id === wordId);
                            if (word) {
                                word.markedWrong = isWrong;
                                if (isWrong && !word.markedAt) {
                                    word.markedAt = new Date().toISOString();
                                }
                            }
                        }
                    }
                }
            });
            Storage.savePracticeLogs(logs);
        },


        applyBatch(action) {
            if (!this.selectedKeys.size) return;
            const logs = Storage.getPracticeLogs();
            const now = new Date().toISOString();
            const affectedLogIds = new Set();

            this.selectedKeys.forEach((key) => {
                if (key.startsWith('round::')) {
                    const [, roundId, groupIndex, wordId] = key.split('::');
                    const log = logs.find(item => item.id === roundId);
                    if (!log) return;
                    log.groups.forEach(group => {
                        if (String(group.index) !== groupIndex) return;
                        group.words.forEach(word => {
                            if (word.id === wordId) {
                                this.applyActionToWord(word, action, now);
                            }
                        });
                    });
                    affectedLogIds.add(roundId);
                } else if (key.startsWith('summary::')) {
                    const wordId = key.split('::')[1];
                    logs.forEach(log => {
                        let touched = false;
                        log.groups.forEach(group => {
                            group.words.forEach(word => {
                                if (word.id === wordId) {
                                    this.applyActionToWord(word, action, now);
                                    touched = true;
                                }
                            });
                        });
                        if (touched) affectedLogIds.add(log.id);
                    });
                }
            });

            affectedLogIds.forEach((logId) => {
                const log = logs.find(item => item.id === logId);
                if (!log) return;
                log.errorWords = collectErrorRecordsFromLog(log);
                Storage.savePracticeLog(log);
            });

            // 重建错题记录
            const refreshedLogs = Storage.getPracticeLogs();
            const mergedErrors = refreshedLogs.flatMap(collectErrorRecordsFromLog);
            Storage.saveErrorWords(mergedErrors);

            this.selectedKeys.clear();
            this.render();
            global.Main?.restoreStats?.();
        },

        applyActionToWord(word, action, timestamp) {
            if (action === 'delete' || action === 'correct') {
                word.markedWrong = false;
                word.markedAt = null;
            } else if (action === 'wrong') {
                word.markedWrong = true;
                word.markedAt = timestamp;
            }
        },

        computeRoundStats(log) {
            let errorCount = 0;
            log.groups.forEach(group => {
                group.words.forEach(word => {
                    if (word.markedWrong) errorCount += 1;
                });
            });
            return { errorCount };
        }
    };

    global.ErrorBook = ErrorBook;
})(window);
