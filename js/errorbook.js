(function (global) {
    /**
     * 使用 pinyin-pro 生成拼音
     * @param {string} text - 中文文本
     * @returns {string} - 拼音（带声调）
     */
    function generatePinyin(text) {
        if (!text || typeof text !== 'string') return '';
        
        // 检查 pinyin-pro 是否已加载
        // pinyin-pro 可能通过不同的方式暴露：pinyinPro.pinyin 或 pinyinPro
        let pinyinFunc = null;
        if (typeof pinyinPro !== 'undefined') {
            if (typeof pinyinPro.pinyin === 'function') {
                pinyinFunc = pinyinPro.pinyin;
            } else if (typeof pinyinPro === 'function') {
                pinyinFunc = pinyinPro;
            } else if (pinyinPro.default && typeof pinyinPro.default === 'function') {
                pinyinFunc = pinyinPro.default;
            }
        }
        
        if (pinyinFunc) {
            try {
                // 使用 pinyin-pro 生成拼音，带声调
                // 尝试不同的参数格式
                let result = null;
                try {
                    result = pinyinFunc(text, { toneType: 'symbol', type: 'all' });
                } catch (e1) {
                    try {
                        result = pinyinFunc(text, { toneType: 'symbol' });
                    } catch (e2) {
                        try {
                            result = pinyinFunc(text);
                        } catch (e3) {
                            console.warn('pinyin-pro调用失败', e3);
                            return '';
                        }
                    }
                }
                
                // 如果返回的是数组，提取拼音字符串
                if (Array.isArray(result)) {
                    return result.map(item => {
                        // 如果item是对象，取pinyin字段；如果是字符串，直接使用
                        return typeof item === 'object' && item !== null && item.pinyin 
                            ? item.pinyin 
                            : String(item || '');
                    }).join(' ');
                }
                
                // 如果返回的是字符串，直接返回
                return String(result || '').trim();
            } catch (err) {
                console.warn('生成拼音失败', err);
                return '';
            }
        }
        return '';
    }

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
        // 初始化时确保模式状态与UI同步
        hidePinyin: false,
        selectedKeys: new Set(),
        lastSelectedIndex: -1, // 用于 shift 多选
        currentTab: 'rounds',
        hoveredCard: null,
        spaceHandlerBound: false,
        currentRoundErrorWords: null,

        init() {
            this.bindEvents();
            this.render();
            // 初始化复习计划模块
            if (global.ReviewPlan) {
                ReviewPlan.init();
            }
        },

        bindEvents() {
            // 模式选择（单选，互斥）
            const modeRadios = document.querySelectorAll('input[name="errorbook-mode"]');
            modeRadios.forEach(radio => {
                radio.addEventListener('change', (e) => {
                    const mode = e.target.value;
                    this.practiceMode = mode === 'practice';
                    this.adminMode = mode === 'admin';
                    
                    // 更新UI状态
                    const hidePinyinSwitch = document.getElementById('errorbook-hide-pinyin-switch');
                    const startBtn = document.getElementById('errorbook-start-practice-btn');
                    const startBtnBottom = document.getElementById('errorbook-start-practice-btn-bottom');
                    const bottomBar = document.getElementById('errorbook-bottom-bar');
                    
                    if (hidePinyinSwitch) hidePinyinSwitch.classList.toggle('d-none', !this.practiceMode);
                    if (startBtn) startBtn.classList.toggle('d-none', !this.practiceMode);
                    if (startBtnBottom) startBtnBottom.classList.toggle('d-none', !this.practiceMode);
                    if (bottomBar) bottomBar.classList.toggle('d-none', !this.practiceMode);
                    
                    this.selectedKeys.clear();
                    this.lastSelectedIndex = -1;
                    this.updateAdminBottomBar();
                    this.render();
                });
            });
            
            // 管理模式下的批量操作按钮
            const selectAllBtn = document.getElementById('errorbook-select-all-btn');
            if (selectAllBtn) {
                selectAllBtn.addEventListener('click', () => this.selectAll());
            }
            
            const deselectAllBtn = document.getElementById('errorbook-deselect-all-btn');
            if (deselectAllBtn) {
                deselectAllBtn.addEventListener('click', () => this.deselectAll());
            }
            
            const batchDeleteBtn = document.getElementById('errorbook-batch-delete-btn');
            if (batchDeleteBtn) {
                batchDeleteBtn.addEventListener('click', () => this.batchDelete());
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
                    // 切换到汇总查看时，清除 currentRoundErrorWords，确保显示所有错题
                    this.currentRoundErrorWords = null;
                    this.render();
                    // 更新总数显示
                    setTimeout(() => {
                        const errorWords = Storage.getErrorWords();
                        this.updateSummaryCount(errorWords);
                    }, 100);
                });
            }
            
            const tabReview = document.getElementById('tab-errorbook-review');
            if (tabReview) {
                tabReview.addEventListener('click', () => {
                    this.currentTab = 'review';
                    this.selectedKeys.clear();
                    this.render();
                });
            }
            
            // 监听 Bootstrap 标签切换事件，确保切换时重新渲染
            const tabList = document.querySelector('[role="tablist"]');
            if (tabList) {
                tabList.addEventListener('shown.bs.tab', (e) => {
                    // 延迟一下确保标签切换完成
                    setTimeout(() => {
                        // 切换到汇总查看时，清除 currentRoundErrorWords，确保显示所有错题
                        if (e.target.id === 'tab-errorbook-summary') {
                            this.currentTab = 'summary';
                            this.currentRoundErrorWords = null;
                            // 更新总数显示
                            const errorWords = Storage.getErrorWords();
                            this.updateSummaryCount(errorWords);
                        } else if (e.target.id === 'tab-errorbook-review') {
                            this.currentTab = 'review';
                        } else {
                            // 切换到其他标签时隐藏总数
                            const countEl = document.getElementById('errorbook-summary-count');
                            if (countEl) countEl.classList.add('d-none');
                        }
                        this.render();
                    }, 100);
                });
            }

            const exportBtn = document.getElementById('errorbook-export-btn');
            if (exportBtn) {
                exportBtn.addEventListener('click', () => this.handleExport());
            }

            const importBtn = document.getElementById('errorbook-import-btn');
            if (importBtn) {
                importBtn.addEventListener('click', () => this.handleImport());
            }
            
            // 绑定错题导入预览确认按钮
            const importPreviewConfirmBtn = document.getElementById('errorbook-import-preview-confirm-btn');
            if (importPreviewConfirmBtn) {
                importPreviewConfirmBtn.addEventListener('click', () => {
                    console.log('[ErrorBook] 确认导入按钮被点击');
                    this.confirmErrorBookImport();
                });
            }
        },

        render() {
            // 如果是复习计划标签，直接渲染复习计划
            if (this.currentTab === 'review') {
                if (global.ReviewPlan) {
                    ReviewPlan.render();
                }
                return;
            }
            
            // 获取调试模式状态
            const isDebugMode = typeof Debug !== 'undefined' && Debug.isEnabled;
            
            // 获取练习记录和错题，根据调试模式过滤
            let logs = Storage.getPracticeLogs();
            let errorWords = Storage.getErrorWords();
            
            // 如果不在调试模式下，过滤掉调试模式的记录
            if (!isDebugMode) {
                logs = logs.filter(log => !log.debugMode);
                errorWords = errorWords.filter(item => !item.debugMode);
            }
            const roundsContainer = document.getElementById('errorbook-rounds');
            const summaryContainer = document.getElementById('errorbook-summary');
            if (!roundsContainer || !summaryContainer) return;
            
            // 同步"隐藏拼音"开关的状态
            const hidePinyinToggle = document.getElementById('errorbook-hide-pinyin-toggle');
            if (hidePinyinToggle) {
                this.hidePinyin = hidePinyinToggle.checked;
            }

            // 练习模式下，保持按轮组织，但使用练习卡片样式
            if (this.practiceMode) {
                // 确保 currentTab 正确设置（从 DOM 读取）
                const activeTab = document.querySelector('.nav-link.active[data-bs-toggle="tab"]');
                if (activeTab) {
                    if (activeTab.id === 'tab-errorbook-rounds') {
                        this.currentTab = 'rounds';
                    } else if (activeTab.id === 'tab-errorbook-summary') {
                        this.currentTab = 'summary';
                    }
                }
                
                // 调试日志
                if (Debug.isDebugMode()) {
                    Debug.log('ErrorBook.render() - 练习模式', {
                        practiceMode: this.practiceMode,
                        currentTab: this.currentTab,
                        hidePinyin: this.hidePinyin,
                        activeTabId: activeTab?.id || 'N/A',
                        errorWordsCount: errorWords.length,
                        logsCount: logs.length
                    });
                }
                
                // 按轮查看：保持按轮组织
                if (this.currentTab === 'rounds') {
                    if (!logs.length) {
                        roundsContainer.innerHTML = '<div class="text-muted text-center py-4">暂无错题记录</div>';
                    } else {
                        // 按日期排序：最新的在上面，旧的在下面（降序）
                        const sortedLogs = [...logs].sort((a, b) => new Date(b.date) - new Date(a.date));
                        
                        roundsContainer.innerHTML = sortedLogs.map((log, idx) => {
                            // 练习模式下，默认只展开第一轮（最近的）
                            // 非练习模式下，展开前5轮
                            const expanded = this.practiceMode ? (idx === 0) : (idx < 5);
                            const collapseId = `collapse-round-${idx}`;
                            
                            // 获取该轮的错题
                            const roundErrorWords = errorWords.filter(item => {
                                if (item.roundId === log.id) {
                                    return this.onlyWrong ? item.markedWrong !== false : true;
                                }
                                return false;
                            });
                            
                            if (!roundErrorWords.length) {
                                return '';
                            }
                            
                            // 使用练习卡片样式渲染
                            // 根据"隐藏拼音"开关决定初始显示状态
                            const initialShowPinyin = !this.hidePinyin;
                            
                            // 调试日志
                            if (typeof Debug !== 'undefined' && Debug.isEnabled) {
                                Debug.log('ErrorBook.render() - 按轮查看渲染', {
                                    roundIndex: idx,
                                    roundErrorWordsCount: roundErrorWords.length,
                                    hidePinyin: this.hidePinyin,
                                    initialShowPinyin: initialShowPinyin,
                                    firstWord: roundErrorWords[0]?.word || 'N/A',
                                    firstPinyin: roundErrorWords[0]?.pinyin || 'N/A'
                                });
                            }
                            
                            const cards = roundErrorWords.map(item => CardComponent.render({
                                word: item.word || '',
                                pinyin: item.pinyin || '',
                                showPinyin: initialShowPinyin, // 由"隐藏拼音"开关控制初始状态
                                markedWrong: false,
                                dataWordId: item.wordId || item.id,
                                dataPinyin: item.pinyin || '',
                                additionalClasses: 'errorbook-practice-card'
                            })).join('');
                            
                            return `
                                <div class="accordion mb-2" id="round-${idx}">
                                    <div class="accordion-item">
                                        <h2 class="accordion-header" id="heading-${idx}">
                                            <button class="accordion-button ${expanded ? '' : 'collapsed'}" type="button" data-bs-toggle="collapse" data-bs-target="#${collapseId}">
                                                第 ${idx + 1} 轮 · ${new Date(log.date).toLocaleString('zh-CN')} · 总题 ${log.totalWords} · 错题 ${roundErrorWords.length}
                                            </button>
                                        </h2>
                                        <div id="${collapseId}" class="accordion-collapse collapse ${expanded ? 'show' : ''}" data-bs-parent="#round-${idx}" data-round-id="${log.id}">
                                            <div class="accordion-body">
                                                <div class="d-flex flex-wrap gap-3">
                                                    ${cards}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            `;
                        }).join('');
                        
                        // 绑定卡片交互事件
                        this.bindPracticeCardEvents(roundsContainer);
                        
                        // 调整卡片字体大小（包括拼音）
                        setTimeout(() => {
                            CardComponent.adjustCardFontSizes(roundsContainer);
                        }, 100);
                    }
                } else {
                    // 汇总查看：显示汇总题库（以每个单元首次测试/练习的结果作为汇总）
                    const summaryErrorWords = Storage.getSummaryErrorWords();
                    if (!summaryErrorWords.length) {
                        summaryContainer.innerHTML = '<div class="text-muted text-center py-4">暂无错题</div>';
                    } else {
                        // 汇总查看：使用汇总题库
                        let practiceWords = summaryErrorWords;
                        
                        // 根据"隐藏拼音"开关决定初始显示状态
                        const initialShowPinyin = !this.hidePinyin;
                        
                        // 调试日志
                        if (typeof Debug !== 'undefined' && Debug.isEnabled) {
                            Debug.log('ErrorBook.render() - 汇总查看渲染', {
                                errorWordsCount: errorWords.length,
                                practiceWordsCount: practiceWords.length,
                                hasCurrentRoundErrorWords: !!this.currentRoundErrorWords,
                                hidePinyin: this.hidePinyin,
                                initialShowPinyin: initialShowPinyin,
                                firstWord: practiceWords[0]?.word || 'N/A',
                                firstPinyin: practiceWords[0]?.pinyin || 'N/A',
                                firstWordId: practiceWords[0]?.id || practiceWords[0]?.wordId || 'N/A'
                            });
                        }
                        
                        // 控制台调试输出（即使调试模式关闭也输出）
                        console.log('[ErrorBook.render] 汇总查看渲染', {
                            errorWordsCount: errorWords.length,
                            practiceWordsCount: practiceWords.length,
                            hidePinyin: this.hidePinyin,
                            initialShowPinyin: initialShowPinyin,
                            firstWord: practiceWords[0]?.word || 'N/A',
                            firstPinyin: practiceWords[0]?.pinyin || 'N/A'
                        });
                        
                        const cards = practiceWords.map((item, idx) => {
                            const cardOptions = {
                                word: item.word || '',
                                pinyin: item.pinyin || '',
                                showPinyin: initialShowPinyin, // 由"隐藏拼音"开关控制初始状态
                                markedWrong: false,
                                dataWordId: item.wordId || item.id,
                                dataPinyin: item.pinyin || '',
                                additionalClasses: 'errorbook-practice-card'
                            };
                            
                            // 调试第一个卡片
                            if (idx === 0) {
                                if (typeof Debug !== 'undefined' && Debug.isEnabled) {
                                    Debug.log('ErrorBook.render() - 汇总查看第一个卡片参数', cardOptions);
                                }
                                console.log('[ErrorBook.render] 汇总查看第一个卡片参数', cardOptions);
                            }
                            
                            const cardHTML = CardComponent.render(cardOptions);
                            
                            // 调试第一个卡片的HTML
                            if (idx === 0) {
                                const temp = document.createElement('div');
                                temp.innerHTML = cardHTML;
                                const pinyinEl = temp.querySelector('.practice-pinyin');
                                const debugInfo = {
                                    cardHTML: cardHTML.substring(0, 300),
                                    hasPinyin: !!pinyinEl,
                                    pinyinClasses: pinyinEl ? pinyinEl.className : 'N/A',
                                    hasDNone: pinyinEl ? pinyinEl.classList.contains('d-none') : false,
                                    pinyinText: pinyinEl ? pinyinEl.textContent : 'N/A'
                                };
                                
                                if (typeof Debug !== 'undefined' && Debug.isEnabled) {
                                    Debug.log('ErrorBook.render() - 汇总查看第一个卡片HTML', debugInfo);
                                }
                                console.log('[ErrorBook.render] 汇总查看第一个卡片HTML', debugInfo);
                            }
                            
                            return cardHTML;
                        }).join('');
                        
                        summaryContainer.innerHTML = `<div class="d-flex flex-wrap gap-3" style="padding-bottom: 100px;">${cards}</div>`;
                        
                        // 更新汇总查看的总数显示
                        this.updateSummaryCount(practiceWords);
                        
                        // 绑定卡片交互事件
                        this.bindPracticeCardEvents(summaryContainer);
                        
                        // 调整卡片字体大小（包括拼音）
                        setTimeout(() => {
                            CardComponent.adjustCardFontSizes(summaryContainer);
                        }, 100);
                    }
                }
                return;
            }

            // 正常模式
            if (!logs.length) {
                roundsContainer.innerHTML = '<div class="text-muted text-center py-4">暂无错题记录</div>';
            } else {
                // 按日期排序：最新的在上面，旧的在下面（降序）
                const sortedLogs = [...logs].sort((a, b) => {
                    const dateA = new Date(a.date || 0).getTime();
                    const dateB = new Date(b.date || 0).getTime();
                    return dateB - dateA; // 降序：新的在前，旧的在后
                });
                
                // 过滤掉没有错题的轮次（renderRound 会返回空字符串）
                const roundsHtml = sortedLogs.map((log, idx) => this.renderRound(log, idx, sortedLogs.length)).filter(html => html.trim() !== '').join('');
                
                if (roundsHtml.trim() === '') {
                    roundsContainer.innerHTML = '<div class="text-muted text-center py-4">暂无错题记录</div>';
                } else {
                    roundsContainer.innerHTML = roundsHtml;
                }
            }

            // 汇总查看：使用汇总题库（以每个单元首次测试/练习的结果作为汇总）
            const summaryErrorWords = Storage.getSummaryErrorWords();
            if (!summaryErrorWords.length) {
                summaryContainer.innerHTML = '<div class="text-muted text-center py-4">暂无错题</div>';
            } else {
                summaryContainer.innerHTML = this.renderSummary(summaryErrorWords);
                // 更新汇总查看的总数显示
                this.updateSummaryCount(summaryErrorWords);
            }

            this.bindCardEvents(roundsContainer);
            this.bindCardEvents(summaryContainer);
            
            // 更新管理模式下的置底栏
            this.updateAdminBottomBar();
            
            // 调整错题卡片的字体大小（三字、四字）
            setTimeout(() => {
                CardComponent.adjustCardFontSizes(roundsContainer);
                CardComponent.adjustCardFontSizes(summaryContainer);
            }, 100);
        },

        renderRound(log, idx, total) {
            const collapseId = `error-round-${idx}`;
            // 最上面5轮（最新的5个）展开，其他收起
            const expanded = idx < 5;
            const stats = this.computeRoundStats(log);
            // 确保groups是数组
            const groups = Array.isArray(log.groups) ? log.groups : [];
            const words = groups.flatMap(group => (group.words || []));
            // 在"按轮查看"模式下，只显示标记为错误的词语
            const filteredWords = words.filter(w => w.markedWrong);
            
            // 如果没有错题，不显示该轮
            if (filteredWords.length === 0) {
                return '';
            }
            
            const cards = filteredWords.map(word => this.renderCard(word, {
                mode: 'round',
                roundId: log.id,
                groupIndex: groups.find(g => g.words && g.words.some(w => w.id === word.id))?.index ?? 0
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

            // 按最新标记时间排序（最新到最旧）
            const sorted = Array.from(grouped.entries()).sort((a, b) => {
                const aLatest = a[1][a[1].length - 1];
                const bLatest = b[1][b[1].length - 1];
                const aTime = aLatest.markedAt ? new Date(aLatest.markedAt).getTime() : 0;
                const bTime = bLatest.markedAt ? new Date(bLatest.markedAt).getTime() : 0;
                return bTime - aTime; // 降序：最新的在前
            });
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
                                    wordId: wordId, // 确保 wordId 存在，用于 buildSelectionKey
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
            
            // 练习模式下只显示拼音和词语
            if (this.practiceMode) {
                // 练习模式下默认不显示拼音，点击后显示
                // "隐藏拼音"开关用于全局控制，但点击卡片可以独立切换
                return CardComponent.render({
                    word: word.word || '',
                    pinyin: word.pinyin || '',
                    showPinyin: false, // 默认隐藏，点击后显示
                    markedWrong: false,
                    dataWordId: word.id,
                    dataKey: key || '',
                    dataPinyin: word.pinyin || '',
                    additionalClasses: 'errorbook-practice-card'
                });
            }
            
            const extra = meta.mode === 'summary'
                ? `<div class="small text-muted mt-2">错误次数：${meta.errorCount || 0}</div>
                   <div class="small text-muted">最近错误：${meta.lastMarkedAt ? new Date(meta.lastMarkedAt).toLocaleString('zh-CN') : '-'}</div>`
                : '';
            
            return CardComponent.render({
                word: word.word || '',
                pinyin: word.pinyin || '',
                showPinyin: checked,
                markedWrong: checked,
                dataWordId: word.id,
                dataRoundId: meta.roundId || '',
                dataGroupIndex: meta.groupIndex ?? '',
                dataKey: key || '',
                showCheckbox: this.adminMode,
                checkboxChecked: selected,
                showMarkBadge: this.adminMode ? false : checked, // 管理模式下不显示 ❌ 标记
                extraHtml: extra,
                additionalClasses: this.adminMode ? 'admin-mode' : '' // 添加 admin-mode 类以使用常规复选框
            });
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
            if (countEl) {
                countEl.value = homeCountEl?.value || settings.total || 20;
                // 练习模式下，隐藏题目数量输入框
                const countContainer = countEl.closest('.col-12');
                if (countContainer && this.practiceMode) {
                    countContainer.style.display = 'none';
                } else if (countContainer) {
                    countContainer.style.display = 'block';
                }
            }
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
                    const speed = parseInt(speedEl?.value || 3);
                    const perPage = parseInt(perPageEl?.value || 1);
                    
                    // 保存设置（练习模式下不保存total，因为使用展开轮次的所有错题）
                    if (this.practiceMode) {
                        Storage.saveSettings({ speed, perPage });
                    } else {
                        const total = parseInt(countEl?.value || 20);
                        Storage.saveSettings({ total, speed, perPage });
                        // 同步到首页
                        if (homeCountEl) homeCountEl.value = total;
                    }
                    
                    // 同步到首页
                    if (homeSpeedEl) homeSpeedEl.value = speed;
                    if (homePerPageEl) homePerPageEl.value = perPage;
                    
                    modal.hide();
                    
                    // 开始练习
                    if (this.practiceMode) {
                        // 练习模式下，只收集展开轮次中的错题
                        this.startPracticeFromExpandedRounds(speed, perPage);
                    } else {
                        const total = parseInt(countEl?.value || 20);
                        this.startPracticeFromErrorBook(total, speed, perPage);
                    }
                });
            }
        },

        bindPracticeCardEvents(container) {
            if (!container) return;
            
            // 点击卡片显示/隐藏拼音
            container.querySelectorAll('.errorbook-practice-card, .practice-card').forEach(card => {
                // 避免重复绑定
                if (card.dataset.practiceEventBound) return;
                card.dataset.practiceEventBound = 'true';
                
                card.addEventListener('click', (e) => {
                    // 如果点击的是复选框、手风琴按钮或其他交互元素，不处理
                    if (e.target.closest('.practice-checkbox, .practice-toggle, .accordion-button, .accordion-header')) return;
                    
                    // 阻止事件冒泡（避免触发其他点击事件，但不阻止手风琴的正常行为）
                    e.stopPropagation();
                    
                    const pinyinEl = card.querySelector('.practice-pinyin');
                    if (pinyinEl) {
                        // 切换显示/隐藏
                        pinyinEl.classList.toggle('d-none');
                        // 重新调整字体大小（因为拼音显示/隐藏会影响布局）
                        CardComponent.adjustCardFontSizes(container);
                    } else {
                        // 如果拼音元素不存在，尝试从数据中获取并创建
                        // 首先尝试从 data-pinyin 属性
                        let pinyin = card.dataset.pinyin || '';
                        
                        // 如果还没有，尝试从错误词数据中获取
                        if (!pinyin && this.practiceMode) {
                            const wordId = card.dataset.wordId;
                            if (wordId) {
                                const errorWords = Storage.getErrorWords();
                                const wordData = errorWords.find(w => w.id === wordId || w.wordId === wordId);
                                if (wordData) {
                                    pinyin = wordData.pinyin || '';
                                    // 如果pinyin为空，尝试从word生成
                                    if (!pinyin && wordData.word) {
                                        pinyin = generatePinyin(wordData.word);
                                    }
                                }
                            }
                        }
                        
                        // 如果还是没有，尝试从卡片中的汉字生成
                        if (!pinyin) {
                            const wordEl = card.querySelector('.practice-word');
                            if (wordEl && wordEl.textContent) {
                                pinyin = generatePinyin(wordEl.textContent.trim());
                            }
                        }
                        
                        if (pinyin) {
                            const pinyinDiv = document.createElement('div');
                            pinyinDiv.className = 'practice-pinyin';
                            pinyinDiv.textContent = pinyin;
                            const wordEl = card.querySelector('.practice-word');
                            if (wordEl) {
                                card.insertBefore(pinyinDiv, wordEl);
                                CardComponent.adjustCardFontSizes(container);
                            }
                        }
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
        
        startPracticeFromExpandedRounds(speed, perPage) {
            // 获取所有展开的轮次
            const expandedRounds = [];
            document.querySelectorAll('.accordion-collapse.show').forEach(collapse => {
                const roundId = collapse.dataset.roundId;
                if (roundId) {
                    expandedRounds.push(roundId);
                }
            });
            
            if (expandedRounds.length === 0) {
                alert('请至少展开一个轮次进行练习');
                return;
            }
            
            // 获取错题集中的所有错题
            const errorWords = Storage.getErrorWords();
            if (!errorWords || errorWords.length === 0) {
                alert('错题集中没有错题，无法开始练习');
                return;
            }
            
            // 只收集展开轮次中的错题
            const words = errorWords
                .filter(item => expandedRounds.includes(item.roundId))
                .map(item => ({
                    id: item.wordId || item.id,
                    word: item.word,
                    pinyin: item.pinyin,
                    unit: item.unit
                }));
            
            if (words.length === 0) {
                alert('展开的轮次中没有错题，无法开始练习');
                return;
            }
            
            // 随机打乱
            for (let i = words.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [words[i], words[j]] = [words[j], words[i]];
            }
            
            // 调用练习模块开始练习
            if (global.Practice) {
                Practice.startWithWords(words, speed, perPage);
            }
        },

        buildSelectionKey(meta, word) {
            if (!this.adminMode) return '';
            // 使用 wordId 或 id，确保一致性
            const wordId = word.wordId || word.id;
            if (meta.mode === 'summary') {
                return `summary::${wordId}`;
            }
            if (meta.mode === 'round' && meta.roundId) {
                return `round::${meta.roundId}::${meta.groupIndex ?? 0}::${wordId}`;
            }
            return '';
        },

        bindCardEvents(container) {
            if (!container) return;
            
            if (this.adminMode) {
                // 获取所有卡片（用于 shift 多选）
                const allCards = Array.from(container.querySelectorAll('.practice-card.admin-mode'));
                
                allCards.forEach((card, index) => {
                    const checkbox = card.querySelector('.form-check-input');
                    if (!checkbox) return;
                    
                    const key = card.dataset.key;
                    if (!key) return;
                    
                    // 绑定复选框点击事件
                    checkbox.addEventListener('change', (e) => {
                        e.stopPropagation();
                        const newState = checkbox.checked;
                        
                        // 处理 shift 多选
                        if (e.shiftKey && this.lastSelectedIndex >= 0 && this.lastSelectedIndex !== index) {
                            const start = Math.min(this.lastSelectedIndex, index);
                            const end = Math.max(this.lastSelectedIndex, index);
                            for (let i = start; i <= end; i++) {
                                const rangeCard = allCards[i];
                                const rangeCheckbox = rangeCard?.querySelector('.form-check-input');
                                const rangeKey = rangeCard?.dataset.key;
                                if (rangeCheckbox && rangeKey) {
                                    rangeCheckbox.checked = newState;
                                    if (newState) {
                                        this.selectedKeys.add(rangeKey);
                                    } else {
                                        this.selectedKeys.delete(rangeKey);
                                    }
                                }
                            }
                        } else {
                            // 普通选择
                            if (newState) {
                                this.selectedKeys.add(key);
                            } else {
                                this.selectedKeys.delete(key);
                            }
                            this.lastSelectedIndex = index;
                        }
                        
                        this.updateAdminBottomBar();
                    });
                    
                    // 绑定卡片点击事件（点击卡片也可以切换复选框）
                    card.addEventListener('click', (e) => {
                        if (e.target.closest('.form-check')) return; // 如果点击的是复选框区域，不处理
                        checkbox.checked = !checkbox.checked;
                        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
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
                // 删除对应的复习计划
                const wordId = word.id || word.wordId;
                if (wordId && Storage.removeReviewPlan) {
                    Storage.removeReviewPlan(wordId);
                }
            } else if (action === 'wrong') {
                word.markedWrong = true;
                word.markedAt = timestamp;
            }
        },

        computeRoundStats(log) {
            let errorCount = 0;
            // 确保groups是数组
            const groups = Array.isArray(log.groups) ? log.groups : [];
            groups.forEach(group => {
                if (group.words && Array.isArray(group.words)) {
                    group.words.forEach(word => {
                        if (word.markedWrong) errorCount += 1;
                    });
                }
            });
            return { errorCount };
        },

        /**
         * 导出错题集
         */
        handleExport() {
            const errorWords = Storage.getErrorWords();
            
            // 调试信息：准备的数据
            const debugInfo = {
                timestamp: new Date().toISOString(),
                errorWordsCount: errorWords ? errorWords.length : 0,
                errorWords: errorWords || [],
                errorWordsSample: errorWords && errorWords.length > 0 ? errorWords.slice(0, 3) : [],
                storageCheck: {
                    raw: localStorage.getItem('word_recognition_error_words'),
                    parsed: errorWords,
                    type: typeof errorWords,
                    isArray: Array.isArray(errorWords)
                },
                logsCheck: {
                    logs: Storage.getPracticeLogs(),
                    logsCount: Storage.getPracticeLogs().length
                }
            };
            
            // 输出到控制台
            console.log('[ErrorBook.handleExport] 准备导出的数据:', debugInfo);
            
            // 输出到调试面板
            if (typeof Debug !== 'undefined' && Debug.isEnabled) {
                Debug.log('ErrorBook.handleExport - 准备导出的数据', debugInfo);
            }
            
            if (!errorWords || errorWords.length === 0) {
                const message = '暂无错题可导出';
                alert(message);
                if (typeof Debug !== 'undefined' && Debug.isEnabled) {
                    Debug.log('ErrorBook.handleExport - 导出失败', { reason: message, debugInfo });
                }
                console.warn('[ErrorBook.handleExport] 导出失败:', message, debugInfo);
                return;
            }

            const data = {
                errorWords: errorWords,
                exportDate: new Date().toISOString(),
                type: 'errorbook',
                version: '1.0'
            };

            // 调试：检查数据序列化
            let jsonString;
            try {
                jsonString = JSON.stringify(data, null, 2);
                console.log('[ErrorBook.handleExport] JSON 序列化成功，长度:', jsonString.length);
            } catch (e) {
                console.error('[ErrorBook.handleExport] JSON 序列化失败:', e);
                if (typeof Debug !== 'undefined' && Debug.isEnabled) {
                    Debug.log('ErrorBook.handleExport - JSON 序列化失败', { error: e.message, stack: e.stack });
                }
                alert('导出失败：数据格式错误');
                return;
            }

            // 调试：检查 Blob 创建
            let blob;
            try {
                blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
                console.log('[ErrorBook.handleExport] Blob 创建成功，大小:', blob.size, 'bytes');
            } catch (e) {
                console.error('[ErrorBook.handleExport] Blob 创建失败:', e);
                if (typeof Debug !== 'undefined' && Debug.isEnabled) {
                    Debug.log('ErrorBook.handleExport - Blob 创建失败', { error: e.message, stack: e.stack });
                }
                alert('导出失败：无法创建文件');
                return;
            }

            // 调试：检查 URL 创建
            let url;
            try {
                url = URL.createObjectURL(blob);
                console.log('[ErrorBook.handleExport] Object URL 创建成功:', url);
            } catch (e) {
                console.error('[ErrorBook.handleExport] Object URL 创建失败:', e);
                if (typeof Debug !== 'undefined' && Debug.isEnabled) {
                    Debug.log('ErrorBook.handleExport - Object URL 创建失败', { error: e.message, stack: e.stack });
                }
                alert('导出失败：无法创建下载链接');
                return;
            }

            // 直接下载
            const fileName = `yuwenrenzi_errorbook_${new Date().toISOString().split('T')[0]}.json`;
            const link = document.createElement('a');
            link.href = url;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            
            // 记录成功日志
            if (typeof Debug !== 'undefined' && Debug.isEnabled) {
                Debug.log('ErrorBook.handleExport - 导出成功', {
                    count: errorWords.length,
                    fileName: fileName,
                    dataSize: blob.size
                });
            }
            
            console.log('[ErrorBook.handleExport] 导出流程完成');
        },

        /**
         * 显示错题导入预览
         */
        showErrorBookImportPreview(errorWords, merge) {
            if (!errorWords || errorWords.length === 0) return;
            
            // 按轮次分组（如果有 roundId）
            const groupedByRound = {};
            const noRoundWords = [];
            
            errorWords.forEach(item => {
                const roundId = item.roundId || '未分类';
                if (roundId === '未分类') {
                    noRoundWords.push(item);
                } else {
                    if (!groupedByRound[roundId]) {
                        groupedByRound[roundId] = [];
                    }
                    groupedByRound[roundId].push(item);
                }
            });
            
            // 生成预览HTML（使用词语库的卡片样式）
            let html = '<div class="errorbook-import-preview">';
            
            html += `<div class="mb-3">
                共 <strong>${errorWords.length}</strong> 条错题记录，分布在 <strong>${Object.keys(groupedByRound).length}</strong> 个练习轮次中
                ${noRoundWords.length > 0 ? `，<strong>${noRoundWords.length}</strong> 条未分类记录` : ''}
            </div>`;
            
            // 全选复选框
            html += `<div class="mb-2">
                <label class="form-check-label d-flex align-items-center">
                    <input type="checkbox" class="form-check-input me-2" id="errorbook-preview-select-all" checked>
                    <span>全选</span>
                </label>
            </div>`;
            
            // 显示有轮次的错题
            Object.keys(groupedByRound).forEach(roundId => {
                const words = groupedByRound[roundId];
                html += `<div class="card mb-3">
                    <div class="card-header">
                        <strong>练习轮次: ${roundId}</strong>
                        <span class="badge bg-primary ms-2">${words.length} 条错题</span>
                    </div>
                    <div class="card-body">
                        <div class="row g-2">`;
                
                words.forEach((item, idx) => {
                    const wordText = String(item.word || '未知词语').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
                    html += `<div class="col-6 col-md-4 col-lg-3 col-xl-2 word-item word-preview-card selected" 
                                 data-word-id="errorbook-${roundId}-${idx}"
                                 data-round-id="${roundId}"
                                 data-index="${idx}">
                            <div class="d-flex align-items-center gap-1 p-1 border rounded">
                                <input type="checkbox" class="form-check-input word-select-checkbox flex-shrink-0" 
                                       data-round-id="${roundId}" 
                                       data-index="${idx}"
                                       checked />
                                <div class="flex-grow-1 text-truncate" style="min-width: 0;">
                                    <div class="fw-semibold text-truncate" title="${wordText}">${wordText}</div>
                                </div>
                            </div>
                        </div>`;
                });
                
                html += `</div>
                    </div>
                </div>`;
            });
            
            // 显示未分类的错题
            if (noRoundWords.length > 0) {
                html += `<div class="card mb-3">
                    <div class="card-header">
                        <strong>未分类错题</strong>
                        <span class="badge bg-warning ms-2">${noRoundWords.length} 条</span>
                    </div>
                    <div class="card-body">
                        <div class="row g-2">`;
                
                noRoundWords.forEach((item, idx) => {
                    const wordText = String(item.word || '未知词语').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
                    html += `<div class="col-6 col-md-4 col-lg-3 col-xl-2 word-item word-preview-card selected" 
                                 data-word-id="errorbook-no-round-${idx}"
                                 data-round-id="未分类"
                                 data-index="${idx}">
                            <div class="d-flex align-items-center gap-1 p-1 border rounded">
                                <input type="checkbox" class="form-check-input word-select-checkbox flex-shrink-0" 
                                       data-round-id="未分类" 
                                       data-index="${idx}"
                                       checked />
                                <div class="flex-grow-1 text-truncate" style="min-width: 0;">
                                    <div class="fw-semibold text-truncate" title="${wordText}">${wordText}</div>
                                </div>
                            </div>
                        </div>`;
                });
                
                html += `</div>
                    </div>
                </div>`;
            }
            
            html += '</div>';
            
            // 显示模态框
            const contentEl = document.getElementById('errorbook-import-preview-content');
            if (contentEl) {
                contentEl.innerHTML = html;
            }
            
            // 绑定checkbox事件（复用词语库的样式逻辑）
            setTimeout(() => {
                // 全选复选框
                const selectAllCheckbox = document.getElementById('errorbook-preview-select-all');
                if (selectAllCheckbox) {
                    selectAllCheckbox.addEventListener('change', (e) => {
                        document.querySelectorAll('#errorbook-import-preview-content .word-select-checkbox').forEach(cb => {
                            cb.checked = e.target.checked;
                            const card = cb.closest('.word-preview-card');
                            if (card) {
                                if (cb.checked) {
                                    card.classList.add('selected');
                                } else {
                                    card.classList.remove('selected');
                                }
                            }
                        });
                    });
                }
                
                // 单个checkbox变化事件
                document.querySelectorAll('#errorbook-import-preview-content .word-select-checkbox').forEach(checkbox => {
                    checkbox.addEventListener('change', (e) => {
                        const card = e.target.closest('.word-preview-card');
                        if (card) {
                            if (e.target.checked) {
                                card.classList.add('selected');
                            } else {
                                card.classList.remove('selected');
                            }
                        }
                    });
                });
                
                // 卡片点击事件（切换选中状态）
                document.querySelectorAll('#errorbook-import-preview-content .word-preview-card').forEach(card => {
                    card.addEventListener('click', (e) => {
                        if (e.target.type === 'checkbox' || e.target.closest('input[type="checkbox"]')) return;
                        const checkbox = card.querySelector('.word-select-checkbox');
                        if (checkbox) {
                            checkbox.checked = !checkbox.checked;
                            checkbox.dispatchEvent(new Event('change'));
                        }
                    });
                });
            }, 100);
            
            // 存储待导入数据（包括分组信息，用于确认导入时查找选中的错题）
            this.pendingImportData = {
                errorWords: errorWords,
                merge: merge,
                groupedByRound: groupedByRound,
                noRoundWords: noRoundWords
            };
            
            // 显示模态框
            const modalEl = document.getElementById('errorbook-import-preview-modal');
            const modal = new bootstrap.Modal(modalEl);
            
            // 确保按钮事件绑定（在模态框显示后）
            modalEl.addEventListener('shown.bs.modal', () => {
                const confirmBtn = document.getElementById('errorbook-import-preview-confirm-btn');
                if (confirmBtn) {
                    // 移除旧的事件监听器（如果有）
                    const newConfirmBtn = confirmBtn.cloneNode(true);
                    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
                    
                    // 绑定新的事件监听器
                    newConfirmBtn.addEventListener('click', () => {
                        console.log('[ErrorBook] 确认导入按钮被点击（模态框内）');
                        this.confirmErrorBookImport();
                    });
                }
            }, { once: true });
            
            modal.show();
        },

        /**
         * 确认导入错题
         */
        confirmErrorBookImport() {
            console.log('[ErrorBook.confirmErrorBookImport] 开始确认导入', {
                hasPendingData: !!this.pendingImportData,
                pendingData: this.pendingImportData
            });
            
            if (!this.pendingImportData) {
                console.warn('[ErrorBook.confirmErrorBookImport] 没有待导入数据');
                alert('没有待导入的数据，请重新选择文件');
                return;
            }
            
            const { errorWords, merge, groupedByRound, noRoundWords } = this.pendingImportData;
            
            // 只获取选中的错题
            const selectedCheckboxes = document.querySelectorAll('#errorbook-import-preview-content .word-select-checkbox:checked');
            const selectedWords = [];
            if (selectedCheckboxes.length > 0) {
                selectedCheckboxes.forEach(checkbox => {
                    const card = checkbox.closest('.word-preview-card');
                    if (card) {
                        const roundId = card.dataset.roundId;
                        const index = parseInt(card.dataset.index);
                        // 根据roundId和index找到对应的错题
                        let wordItem = null;
                        if (roundId === '未分类') {
                            if (noRoundWords && noRoundWords[index]) {
                                wordItem = noRoundWords[index];
                            }
                        } else {
                            if (groupedByRound && groupedByRound[roundId] && groupedByRound[roundId][index]) {
                                wordItem = groupedByRound[roundId][index];
                            }
                        }
                        if (wordItem) {
                            selectedWords.push(wordItem);
                        }
                    }
                });
            } else {
                // 如果没有选中的，使用所有错题
                selectedWords.push(...errorWords);
            }
            
            let finalErrorWords = [];
            if (merge) {
                // 合并模式：保留现有错题，添加新错题（去重）
                const existing = Storage.getErrorWords();
                const existingMap = new Map(existing.map(item => [item.id || `${item.wordId}_${item.word}`, item]));
                
                selectedWords.forEach(item => {
                    const key = item.id || `${item.wordId}_${item.word}`;
                    if (!existingMap.has(key)) {
                        existingMap.set(key, item);
                    }
                });
                
                finalErrorWords = Array.from(existingMap.values());
            } else {
                // 替换模式：清空现有，使用选中的错题
                finalErrorWords = selectedWords;
            }

            // 保存错题记录
            Storage.saveErrorWords(finalErrorWords);
            
            // 如果导入的错题有 roundId，需要更新对应的练习记录
            const logs = Storage.getPracticeLogs();
            const roundIds = new Set(selectedWords.map(item => item.roundId).filter(id => id && id !== '未分类'));
            
            roundIds.forEach(roundId => {
                const log = logs.find(l => l.id === roundId);
                if (log) {
                    // 更新练习记录中的错题标记
                    const roundErrors = selectedWords.filter(item => item.roundId === roundId);
                    roundErrors.forEach(errorItem => {
                        // 在 log.groups 中找到对应的 word 并标记为错题
                        if (log.groups) {
                            log.groups.forEach(group => {
                                if (group.words) {
                                    group.words.forEach(word => {
                                        if (word.id === errorItem.wordId || word.word === errorItem.word) {
                                            word.markedWrong = true;
                                            word.markedAt = errorItem.markedAt || new Date().toISOString();
                                            word.errorId = errorItem.id || errorItem.errorId;
                                        }
                                    });
                                }
                            });
                        }
                    });
                    Storage.savePracticeLog(log);
                } else {
                    // 如果没有对应的练习记录，创建一个虚拟的练习记录
                    const roundErrors = errorWords.filter(item => item.roundId === roundId);
                    const createId = (prefix = 'id') => {
                        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
                            return `${prefix}_${crypto.randomUUID()}`;
                        }
                        return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
                    };
                    
                    const newLog = {
                        id: roundId,
                        date: roundErrors[0]?.markedAt || new Date().toISOString(),
                        totalWords: roundErrors.length,
                        groups: [{
                            index: 0,
                            words: roundErrors.map(errorItem => ({
                                id: errorItem.wordId || createId('word'),
                                word: errorItem.word,
                                pinyin: errorItem.pinyin,
                                unit: errorItem.unit,
                                markedWrong: true,
                                markedAt: errorItem.markedAt || new Date().toISOString(),
                                errorId: errorItem.id || errorItem.errorId
                            }))
                        }]
                    };
                    Storage.savePracticeLog(newLog);
                }
            });
            
            // 关闭模态框
            const modal = bootstrap.Modal.getInstance(document.getElementById('errorbook-import-preview-modal'));
            if (modal) modal.hide();
            
            // 清空待导入数据
            this.pendingImportData = null;
            
            // 重新渲染错题集
            this.render();
            global.Main?.restoreStats?.();

            alert(`导入成功！${merge ? '合并' : '替换'}后共有 ${finalErrorWords.length} 条错题记录`);

            if (global.Debug && Debug.isDebugMode()) {
                Debug.log('info', `导入错题集：${errorWords.length}条记录，${merge ? '合并' : '替换'}后共${finalErrorWords.length}条`, 'import');
            }
        },

        /**
         * 导入错题集
         */
        handleImport() {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.onchange = async () => {
                const file = input.files?.[0];
                if (!file) return;

                try {
                    const text = await file.text();
                    const data = JSON.parse(text);

                    // 验证数据格式
                    if (!data.errorWords || !Array.isArray(data.errorWords)) {
                        alert('导入失败：文件格式不正确，缺少 errorWords 字段');
                        return;
                    }

                    if (data.errorWords.length === 0) {
                        alert('导入失败：文件中没有错题记录');
                        return;
                    }

                    // 选择导入方式
                    const confirmMsg = `将导入 ${data.errorWords.length} 条错题记录。\n\n选择导入方式：\n1. 合并：保留现有错题，添加新错题\n2. 替换：清空现有错题，只保留导入的错题`;
                    const merge = confirm(confirmMsg + '\n\n点击"确定"合并，点击"取消"替换');

                    // 显示预览
                    this.showErrorBookImportPreview(data.errorWords, merge);
                } catch (err) {
                    console.error('导入失败', err);
                    alert('导入失败：' + (err.message || '请检查文件格式'));
                    
                    if (global.Debug && Debug.isDebugMode()) {
                        Debug.log('error', '导入错题集失败', 'import', { error: err.message, stack: err.stack });
                    }
                }
            };
            input.click();
        },

        /**
         * 进入指定轮次的练习模式
         */
        enterPracticeModeForRound(roundId) {
            if (!roundId) return;
            
            // 切换到错题集页面
            if (global.Main) {
                Main.showPage('errorbook');
            }
            
            // 切换到练习模式
            this.practiceMode = true;
            this.adminMode = false;
            const practiceRadio = document.getElementById('errorbook-mode-practice');
            if (practiceRadio) {
                practiceRadio.checked = true;
                practiceRadio.dispatchEvent(new Event('change'));
            }
            
            // 显示拼音（练习模式下默认显示）
            this.hidePinyin = false;
            const hidePinyinSwitch = document.getElementById('errorbook-hide-pinyin-switch');
            if (hidePinyinSwitch) {
                hidePinyinSwitch.checked = false;
            }
            
            // 清除 currentRoundErrorWords，确保汇总查看显示所有错题
            this.currentRoundErrorWords = null;
            
            // 获取该轮次的错题（仅用于按轮查看时展开对应轮次）
            const logs = Storage.getPracticeLogs();
            const log = logs.find(l => l.id === roundId);
            if (!log) {
                alert('未找到该轮次的练习记录');
                return;
            }
            
            // 渲染练习模式
            this.render();
            
            // 默认切换到"按轮查看"标签，并展开该轮次，缩起其他所有轮
            setTimeout(() => {
                // 切换到"按轮查看"标签
                const tabRounds = document.getElementById('tab-errorbook-rounds');
                if (tabRounds) {
                    const tab = new bootstrap.Tab(tabRounds);
                    tab.show();
                }
                
                // 先缩起所有轮次
                const sortedLogs = [...logs].sort((a, b) => new Date(b.date) - new Date(a.date));
                sortedLogs.forEach((log, index) => {
                    const collapseId = `collapse-round-${index}`;
                    const collapseEl = document.getElementById(collapseId);
                    if (collapseEl) {
                        const bsCollapse = bootstrap.Collapse.getInstance(collapseEl);
                        if (bsCollapse && bsCollapse._isShown()) {
                            bsCollapse.hide();
                        }
                        // 如果元素已经显示，强制隐藏
                        if (collapseEl.classList.contains('show')) {
                            collapseEl.classList.remove('show');
                            const button = document.querySelector(`[data-bs-target="#${collapseId}"]`);
                            if (button) {
                                button.classList.add('collapsed');
                            }
                        }
                    }
                });
                
                // 展开该轮次（最近的这一轮）
                const roundIndex = sortedLogs.findIndex(l => l.id === roundId);
                if (roundIndex >= 0) {
                    const collapseId = `collapse-round-${roundIndex}`;
                    const collapseEl = document.getElementById(collapseId);
                    if (collapseEl) {
                        // 确保按钮状态正确
                        const button = document.querySelector(`[data-bs-target="#${collapseId}"]`);
                        if (button) {
                            button.classList.remove('collapsed');
                        }
                        // 展开
                        const bsCollapse = new bootstrap.Collapse(collapseEl, { show: true });
                    }
                }
            }, 300);
        },

        /**
         * 全选
         */
        selectAll() {
            if (!this.adminMode) return;
            const container = this.currentTab === 'rounds' 
                ? document.getElementById('errorbook-rounds')
                : document.getElementById('errorbook-summary');
            if (!container) return;
            
            const allCards = container.querySelectorAll('.practice-card.admin-mode');
            allCards.forEach(card => {
                const checkbox = card.querySelector('.form-check-input');
                const key = card.dataset.key;
                if (checkbox && key) {
                    checkbox.checked = true;
                    this.selectedKeys.add(key);
                }
            });
            this.updateAdminBottomBar();
        },

        /**
         * 全不选
         */
        deselectAll() {
            if (!this.adminMode) return;
            this.selectedKeys.clear();
            const container = this.currentTab === 'rounds' 
                ? document.getElementById('errorbook-rounds')
                : document.getElementById('errorbook-summary');
            if (!container) return;
            
            const allCheckboxes = container.querySelectorAll('.form-check-input');
            allCheckboxes.forEach(checkbox => {
                checkbox.checked = false;
            });
            this.updateAdminBottomBar();
        },

        /**
         * 批量删除（从错题中剔除）
         */
        batchDelete() {
            if (!this.adminMode || this.selectedKeys.size === 0) return;
            
            if (!confirm(`确定要从错题集中删除选中的 ${this.selectedKeys.size} 个词语吗？`)) {
                return;
            }
            
            const logs = Storage.getPracticeLogs();
            const keysToDelete = Array.from(this.selectedKeys);
            
            // 从练习日志中标记这些词语为正确（不再标记为错题）
            keysToDelete.forEach(key => {
                if (key.startsWith('round::')) {
                    const [, roundId, groupIndex, wordId] = key.split('::');
                    const log = logs.find(item => item.id === roundId);
                    if (log && log.groups) {
                        log.groups.forEach(group => {
                            if (String(group.index) === groupIndex && group.words) {
                                group.words.forEach(word => {
                                    if (word.id === wordId || word.wordId === wordId) {
                                        word.markedWrong = false;
                                        delete word.markedAt;
                                        delete word.errorId;
                                    }
                                });
                            }
                        });
                    }
                } else if (key.startsWith('summary::')) {
                    const wordId = key.split('::')[1];
                    logs.forEach(log => {
                        if (log.groups) {
                            log.groups.forEach(group => {
                                if (group.words) {
                                    group.words.forEach(word => {
                                        if (word.id === wordId || word.wordId === wordId) {
                                            word.markedWrong = false;
                                            delete word.markedAt;
                                            delete word.errorId;
                                        }
                                    });
                                }
                            });
                        }
                    });
                }
            });
            
            // 保存更新后的练习日志
            logs.forEach(log => {
                Storage.savePracticeLog(log);
            });
            
            // 重新从练习日志生成错题集（因为错题集是从练习日志中生成的）
            const allErrorWords = logs.flatMap(collectErrorRecordsFromLog);
            Storage.saveErrorWords(allErrorWords);
            
            // 删除对应的复习计划
            const deletedWordIds = new Set();
            keysToDelete.forEach(key => {
                if (key.startsWith('round::')) {
                    const [, roundId, groupIndex, wordId] = key.split('::');
                    deletedWordIds.add(wordId);
                } else if (key.startsWith('summary::')) {
                    const wordId = key.split('::')[1];
                    deletedWordIds.add(wordId);
                }
            });
            
            // 从复习计划中删除这些词语
            deletedWordIds.forEach(wordId => {
                if (Storage.removeReviewPlan) {
                    Storage.removeReviewPlan(wordId);
                }
            });
            
            // 清空选择并重新渲染
            this.selectedKeys.clear();
            this.lastSelectedIndex = -1;
            this.render();
        },

        /**
         * 为错题词语构建选择键（用于删除时匹配）
         */
        buildSelectionKeyForErrorWord(errorWord) {
            const wordId = errorWord.wordId || errorWord.id;
            if (this.currentTab === 'summary') {
                return `summary::${wordId}`;
            }
            if (errorWord.roundId) {
                // 需要从日志中查找 groupIndex
                const logs = Storage.getPracticeLogs();
                for (const log of logs) {
                    if (log.id === errorWord.roundId && log.groups) {
                        for (let groupIndex = 0; groupIndex < log.groups.length; groupIndex++) {
                            const group = log.groups[groupIndex];
                            if (group.words) {
                                const word = group.words.find(w => 
                                    (w.id === wordId) || (w.wordId === wordId)
                                );
                                if (word) {
                                    return `round::${errorWord.roundId}::${groupIndex}::${wordId}`;
                                }
                            }
                        }
                    }
                }
            }
            return '';
        },

        /**
         * 更新管理模式下的置底栏
         */
        updateAdminBottomBar() {
            const adminBottomBar = document.getElementById('errorbook-admin-bottom-bar');
            const practiceBottomBar = document.getElementById('errorbook-bottom-bar');
            
            if (this.adminMode) {
                if (adminBottomBar) adminBottomBar.classList.remove('d-none');
                if (practiceBottomBar) practiceBottomBar.classList.add('d-none');
                
                const selectedCount = this.selectedKeys.size;
                const selectedCountEl = document.getElementById('errorbook-selected-count');
                const deleteCountEl = document.getElementById('errorbook-delete-count');
                const batchDeleteBtn = document.getElementById('errorbook-batch-delete-btn');
                
                if (selectedCountEl) {
                    selectedCountEl.textContent = `已选择 ${selectedCount} 项`;
                }
                if (deleteCountEl) {
                    deleteCountEl.textContent = selectedCount.toString();
                }
                if (batchDeleteBtn) {
                    batchDeleteBtn.disabled = selectedCount === 0;
                }
            } else {
                if (adminBottomBar) adminBottomBar.classList.add('d-none');
                // practiceBottomBar 的显示由 practiceMode 控制
            }
        },
        
        /**
         * 更新汇总查看的总数显示
         */
        updateSummaryCount(errorWords) {
            const countEl = document.getElementById('errorbook-summary-count');
            if (!countEl) return;
            
            // 计算去重后的错题数量
            const uniqueWords = new Set();
            errorWords.forEach(item => {
                const wordId = item.wordId || item.id;
                if (wordId) uniqueWords.add(wordId);
            });
            
            const count = uniqueWords.size;
            
            // 只在汇总查看标签激活时显示
            const summaryTab = document.getElementById('tab-errorbook-summary');
            const isSummaryActive = summaryTab && summaryTab.classList.contains('active');
            
            if (isSummaryActive) {
                countEl.textContent = `共 ${count} 个错题`;
                countEl.classList.remove('d-none');
            } else {
                countEl.classList.add('d-none');
            }
        }
    };

    global.ErrorBook = ErrorBook;
    if (typeof window !== 'undefined') {
        window.ErrorBook = ErrorBook;
    }
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
