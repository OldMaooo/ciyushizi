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
        mode: 'practice', // 'preview' | 'practice' | 'error-practice' | 'test'
        showPinyin: false, // 全局记忆的拼音显示状态

        init() {
            console.log('Practice.init() 被调用');
            this.bindEvents();
            this.restoreSettings();
            this.bindAutoSave();
            console.log('Practice 初始化完成');
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
            // 使用事件委托，绑定到document，这样即使按钮动态加载也能工作
            // 使用标志位确保只绑定一次
            if (this._homeButtonsBound) {
                console.log('首页按钮事件已绑定，跳过重复绑定');
                return;
            }
            this._homeButtonsBound = true;
            
            // 检查按钮是否存在
            const previewBtn = document.getElementById('home-preview-btn');
            const practiceBtn = document.getElementById('home-practice-btn');
            const testBtn = document.getElementById('home-test-btn');
            console.log('按钮检查:', {
                preview: !!previewBtn,
                practice: !!practiceBtn,
                test: !!testBtn
            });
            
            const self = this; // 保存this引用
            document.addEventListener('click', function(e) {
                // 检查点击的元素是否是按钮本身，或者按钮内的元素（如图标）
                let target = e.target;
                if (target.id && (target.id === 'home-preview-btn' || target.id === 'home-practice-btn' || target.id === 'home-test-btn')) {
                    // 直接点击按钮
                } else {
                    // 点击的是按钮内的元素，向上查找按钮
                    target = e.target.closest('#home-preview-btn, #home-practice-btn, #home-test-btn');
                    if (!target) return;
                }
                
                e.preventDefault();
                e.stopPropagation();
                
                const btnId = target.id;
                let mode = 'practice';
                
                if (btnId === 'home-preview-btn') {
                    mode = 'preview';
                    console.log('✅ 预习模式按钮被点击');
                } else if (btnId === 'home-practice-btn') {
                    mode = 'practice';
                    console.log('✅ 练习模式按钮被点击');
                } else if (btnId === 'home-test-btn') {
                    mode = 'test';
                    console.log('✅ 测试模式按钮被点击');
                } else {
                    console.warn('未知按钮ID:', btnId);
                    return;
                }
                
                console.log('准备调用 startFromHome，模式:', mode, 'this:', self);
                try {
                    self.startFromHome(mode);
                } catch (error) {
                    console.error('startFromHome 调用失败:', error);
                    alert('启动失败: ' + error.message);
                }
            });
            
            console.log('✅ 首页按钮事件已绑定（事件委托）');

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

            // 关闭按钮
            const previewCloseBtn = document.getElementById('preview-close-btn');
            if (previewCloseBtn) previewCloseBtn.addEventListener('click', () => {
                if (confirm('确定要退出预习吗？')) {
                    this.showPage('home');
                }
            });
            
            const practiceCloseBtn = document.getElementById('practice-close-btn');
            if (practiceCloseBtn) practiceCloseBtn.addEventListener('click', () => {
                if (confirm('确定要退出练习吗？')) {
                    this.showPage('home');
                }
            });
            
            // 模式切换按钮（在预览页面）
            const previewToPracticeBtn = document.getElementById('preview-to-practice-btn');
            if (previewToPracticeBtn) previewToPracticeBtn.addEventListener('click', () => {
                this.startPracticeFromPreview();
            });
            
            const previewToTestBtn = document.getElementById('preview-to-test-btn');
            if (previewToTestBtn) previewToTestBtn.addEventListener('click', () => {
                // 从预习模式切换到测试模式
                this.mode = 'test';
                this.start('test');
            });
            
            // 预习模式控制栏的「去练习」按钮
            const previewToPracticeBtnBar = document.getElementById('preview-to-practice-btn-bar');
            if (previewToPracticeBtnBar) previewToPracticeBtnBar.addEventListener('click', () => {
                this.startPracticeFromPreview();
            });
            
            // 模式切换按钮（在练习页面）- 使用事件委托，支持所有模式切换
            const practiceToPreviewBtn = document.getElementById('practice-to-preview-btn');
            if (practiceToPreviewBtn) {
                const newBtn = practiceToPreviewBtn.cloneNode(true);
                practiceToPreviewBtn.parentNode.replaceChild(newBtn, practiceToPreviewBtn);
                newBtn.addEventListener('click', () => {
                    // 切换到预习模式
                    this.mode = 'preview';
                    this.start('preview');
                });
            }
            
            const practiceModeSelectBtn = document.getElementById('practice-mode-select-btn');
            if (practiceModeSelectBtn) {
                const newBtn = practiceModeSelectBtn.cloneNode(true);
                practiceModeSelectBtn.parentNode.replaceChild(newBtn, practiceModeSelectBtn);
                newBtn.addEventListener('click', () => {
                    // 切换到练习模式（从任何模式）
                    this.mode = 'practice';
                    this.start('practice');
                });
            }
            
            const practiceToTestBtn = document.getElementById('practice-to-test-btn');
            if (practiceToTestBtn) {
                const newBtn = practiceToTestBtn.cloneNode(true);
                practiceToTestBtn.parentNode.replaceChild(newBtn, practiceToTestBtn);
                newBtn.addEventListener('click', () => {
                    // 切换到测试模式
                    this.mode = 'test';
                    this.start('test');
                });
            }
            
            // 预习页面按钮
            const previewSkipBtn = document.getElementById('preview-skip-btn');
            if (previewSkipBtn) previewSkipBtn.addEventListener('click', () => this.skipPreview());
            
            const previewStartPracticeBtn = document.getElementById('preview-start-practice-btn');
            if (previewStartPracticeBtn) previewStartPracticeBtn.addEventListener('click', () => this.startPracticeFromPreview());
            
            // 预习页面导航按钮
            const previewPrevBtn = document.getElementById('preview-prev-btn');
            if (previewPrevBtn) previewPrevBtn.addEventListener('click', () => this.prevGroup());
            
            const previewNextBtn = document.getElementById('preview-next-btn');
            if (previewNextBtn) previewNextBtn.addEventListener('click', () => this.nextGroup());
            
            // 拼音开关事件
            const previewPinyinSwitch = document.getElementById('preview-pinyin-switch');
            if (previewPinyinSwitch) {
                previewPinyinSwitch.addEventListener('change', (e) => {
                    this.showPinyin = e.target.checked;
                    this.savePinyinSetting();
                    this.renderGroup();
                });
            }
            
            const practicePinyinSwitch = document.getElementById('practice-pinyin-switch');
            if (practicePinyinSwitch) {
                practicePinyinSwitch.addEventListener('change', (e) => {
                    if (this.mode === 'test') {
                        e.target.checked = false; // 测试模式强制关闭
                        return;
                    }
                    this.showPinyin = e.target.checked;
                    this.savePinyinSetting();
                    this.renderGroup();
                });
            }

            // 键盘事件
            document.addEventListener('keydown', (e) => this.handleKeydown(e));
        },
        
        skipPreview() {
            // 跳过预习，直接进入练习模式
            this.mode = 'practice';
            this.start('practice');
        },
        
        startPracticeFromPreview() {
            // 从预习模式进入练习模式
            this.mode = 'practice';
            this.start('practice');
        },
        
        savePinyinSetting() {
            // 保存拼音设置（全局记忆）
            const settings = Storage.getSettings() || {};
            if (this.mode === 'preview') {
                settings.showPinyinPreview = this.showPinyin;
            } else {
                settings.showPinyinPractice = this.showPinyin;
            }
            Storage.saveSettings(settings);
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

        startFromHome(mode = 'practice') {
            console.log('startFromHome 被调用，模式:', mode);
            const settings = Storage.getSettings() || {};
            const countEl = document.getElementById('word-count-input-home');
            const speedEl = document.getElementById('home-speed');
            const perPageEl = document.getElementById('words-per-page-input-home');

            const total = Math.max(1, parseInt(countEl?.value || settings.total || 20, 10));
            const speed = Math.max(1, parseInt(speedEl?.value || settings.speed || 3, 10));
            const perPage = Math.max(1, parseInt(perPageEl?.value || settings.perPage || 1, 10));

            console.log('设置:', { total, speed, perPage });

            Storage.saveSettings({
                total,
                speed,
                perPage
            });

            // 从练习范围选择器获取选中的词语
            let selectedWords = [];
            if (global.PracticeRange) {
                selectedWords = PracticeRange.getSelectedWords('practice-range-container-home');
                console.log('从练习范围获取的词语数量:', selectedWords.length);
            } else {
                console.warn('PracticeRange 未初始化');
            }
            
            // 如果没有选中任何词语，使用全部词语库
            if (!selectedWords || selectedWords.length === 0) {
                selectedWords = Storage.getWordBank();
                console.log('使用全部词语库，数量:', selectedWords.length);
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
                console.log('只练错题，过滤后数量:', selectedWords.length);
            }

            const shuffled = [...selectedWords].sort(() => Math.random() - 0.5);
            this.words = shuffled.slice(0, Math.min(total, shuffled.length));

            this.speedPerWord = speed;
            this.wordsPerPage = perPage;
            this.mode = mode; // 保存模式
            console.log('准备开始，词语数量:', this.words.length, '模式:', mode);
            this.start(mode);
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

        start(mode) {
            if (mode) this.mode = mode;
            // 如果不是从复习计划进入的，清除复习计划相关状态
            if (mode && mode !== 'error-practice' && mode !== 'test') {
                this.reviewPlanWordId = null;
                this.reviewPlanStage = null;
            }
            
            // 恢复拼音显示状态（全局记忆）
            const settings = Storage.getSettings() || {};
            if (this.mode === 'preview') {
                this.showPinyin = settings.showPinyinPreview !== false; // 预习模式默认开启
            } else if (this.mode === 'test') {
                this.showPinyin = false; // 测试模式强制关闭
            } else {
                this.showPinyin = settings.showPinyinPractice || false; // 练习模式默认关闭
            }
            
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
                mode: this.mode,
                totalWords: this.words.length,
                wordsPerPage: this.wordsPerPage,
                speedPerWord: this.speedPerWord,
                duration: 0,
                showPinyin: this.showPinyin,
                isOfficialTest: this.mode === 'test',
                groups: []
            };

            // 根据模式显示不同页面
            const pageId = this.mode === 'preview' ? 'preview' : 'practice';
            this.showPage(pageId);
            // 确保箭头按钮显示
            if (global.Main && global.Main.updateNavButtonsVisibility) {
                global.Main.updateNavButtonsVisibility(pageId);
            }
            this.renderGroup();
            this.updateBadges();
            this.updateModeBadge();
            this.updatePinyinSwitch();
            if (this.mode !== 'preview') {
                this.startCountdown();
            }
            this.activeCardIndex = -1;
        },

        buildGroup(index) {
            const start = index * this.wordsPerPage;
            return this.words.slice(start, start + this.wordsPerPage);
        },

        renderGroup() {
            // 根据模式选择容器
            const containerId = this.mode === 'preview' ? 'preview-card-container' : 'practice-card-container';
            const container = document.getElementById(containerId);
            if (!container) return;

            const group = this.buildGroup(this.currentIndex);
            this.currentGroup = group;
            if (!group.length) {
                container.innerHTML = `
                    <div class="text-muted py-5"><i class="bi bi-check2-circle"></i> 本轮${this.mode === 'preview' ? '预习' : '练习'}已完成</div>
                `;
                return;
            }

            const stored = this.log.groups.find(item => item.index === this.currentIndex);
            if (stored) {
                this.currentGroupMarked = new Map(stored.words.map(word => [word.id, !!word.markedWrong]));
            } else {
                this.currentGroupMarked = new Map(group.map(word => [word.id, false]));
            }

            // 预习模式不显示复选框
            const showCheckbox = this.mode !== 'preview';
            
            container.innerHTML = group.map((wordObj, idx) => {
                const id = wordObj.id || `word_${this.currentIndex}_${idx}`;
                const checked = this.currentGroupMarked.get(id);
                // 根据showPinyin状态或标记状态决定是否显示拼音
                const shouldShowPinyin = this.mode === 'preview' 
                    ? this.showPinyin 
                    : (this.showPinyin || checked); // 练习模式：开关开启或标记错题后显示
                // 如果pinyin为空或不存在，使用pinyin-pro动态生成
                let pinyin = wordObj.pinyin;
                // 如果pinyin是空字符串或不存在，尝试生成
                if ((!pinyin || pinyin.trim() === '') && wordObj.word) {
                    pinyin = generatePinyin(wordObj.word);
                }
                
                // 如果生成后还是空，至少传递空字符串，让CardComponent创建拼音元素
                // 这样点击时可以动态生成
                return CardComponent.render({
                    word: wordObj.word || '',
                    pinyin: pinyin || '', // 即使为空也传递，CardComponent会创建元素
                    showPinyin: shouldShowPinyin && pinyin ? true : false, // 只有有拼音时才默认显示
                    markedWrong: checked,
                    dataId: id,
                    dataGroupIndex: idx,
                    showCheckbox: showCheckbox,
                    checkboxChecked: checked,
                    dataPinyin: pinyin || '' // 保存拼音到data属性，方便点击时获取
                });
            }).join('');

            // 调整字体大小以适应卡片
            CardComponent.adjustCardFontSizes(container);

            // 绑定卡片点击事件
            container.querySelectorAll('.practice-card').forEach((card) => {
                card.addEventListener('click', (e) => {
                    // 如果点击的是复选框，不处理
                    if (e.target.closest('.practice-toggle')) return;
                    
                    // 预习模式下，点击卡片显示/隐藏拼音
                    if (this.mode === 'preview') {
                        const pinyinEl = card.querySelector('.practice-pinyin');
                        if (pinyinEl) {
                            // 切换显示/隐藏
                            pinyinEl.classList.toggle('d-none');
                        } else {
                            // 如果拼音元素不存在，创建并显示
                            const wordObj = group.find(item => {
                                const id = item.id || `word_${this.currentIndex}_${group.indexOf(item)}`;
                                return id === card.dataset.id;
                            });
                            if (wordObj) {
                                // 获取或生成拼音
                                let pinyin = wordObj.pinyin || card.dataset.pinyin || '';
                                
                                // 如果pinyin为空，尝试从wordObj生成
                                if (!pinyin && wordObj.word) {
                                    pinyin = generatePinyin(wordObj.word);
                                }
                                
                                // 如果还是没有拼音，尝试从卡片中的汉字生成
                                if (!pinyin) {
                                    const wordEl = card.querySelector('.practice-word');
                                    if (wordEl && wordEl.textContent) {
                                        pinyin = generatePinyin(wordEl.textContent.trim());
                                    }
                                }
                                
                                // 查找或创建拼音元素
                                let pinyinEl = card.querySelector('.practice-pinyin');
                                if (!pinyinEl) {
                                    // 如果不存在，创建新元素
                                    pinyinEl = document.createElement('div');
                                    pinyinEl.className = 'practice-pinyin';
                                    const wordEl = card.querySelector('.practice-word');
                                    if (wordEl) {
                                        card.insertBefore(pinyinEl, wordEl);
                                    } else {
                                        card.appendChild(pinyinEl);
                                    }
                                }
                                
                                // 更新拼音内容
                                if (pinyin) {
                                    pinyinEl.textContent = pinyin;
                                    pinyinEl.classList.remove('d-none');
                                    // 重新调整字体大小
                                    CardComponent.adjustCardFontSizes(card.parentElement);
                                } else {
                                    // 如果还是没有拼音，尝试再次生成
                                    const wordText = wordObj.word || card.querySelector('.practice-word')?.textContent?.trim() || '';
                                    if (wordText) {
                                        pinyin = generatePinyin(wordText);
                                        if (pinyin) {
                                            pinyinEl.textContent = pinyin;
                                            pinyinEl.classList.remove('d-none');
                                            CardComponent.adjustCardFontSizes(card.parentElement);
                                        }
                                    }
                                }
                            }
                        }
                    } else {
                        // 其他模式：标记错题
                        this.toggleCardMark(card);
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
            if (this.mode !== 'preview') {
                this.startCountdown();
            }
        },


        updateCard(card, wordObj, checked) {
            const pinyinEl = card.querySelector('.practice-pinyin');
            if (checked) {
                // 如果pinyin为空或不存在，使用pinyin-pro动态生成
                let pinyin = wordObj.pinyin;
                if (!pinyin && wordObj.word) {
                    pinyin = generatePinyin(wordObj.word);
                }
                
                if (!pinyinEl) {
                    const el = document.createElement('div');
                    el.className = 'practice-pinyin';
                    el.textContent = pinyin || '';
                    const wordEl = card.querySelector('.practice-word');
                    if (wordEl) {
                        card.insertBefore(el, wordEl);
                    } else {
                        card.appendChild(el);
                    }
                } else {
                    pinyinEl.textContent = pinyin || '';
                    // 确保拼音显示（移除可能的隐藏类）
                    pinyinEl.classList.remove('d-none');
                }
                card.classList.add('marked-wrong');
            } else {
                // 取消标记时，根据showPinyin开关决定是否隐藏拼音
                if (pinyinEl) {
                    if (this.showPinyin) {
                        // 如果开关开启，保持显示
                        pinyinEl.classList.remove('d-none');
                    } else {
                        // 如果开关关闭，隐藏拼音
                        pinyinEl.classList.add('d-none');
                    }
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

        updateModeSelectButtons() {
            // 更新所有模式选择按钮的active状态
            const allModeButtons = document.querySelectorAll('.mode-select-btn');
            allModeButtons.forEach(btn => {
                const mode = btn.dataset.mode;
                if (mode === this.mode) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
        },
        
        updateModeBadge() {
            // 更新模式标识
            const modeBadges = {
                'preview': { id: 'preview-mode-badge', text: '预习模式', class: 'bg-success-subtle text-success' },
                'practice': { id: 'practice-mode-badge', text: '练习模式', class: 'bg-primary-subtle text-primary' },
                'error-practice': { id: 'practice-mode-badge', text: '错题练习模式', class: 'bg-warning-subtle text-warning' },
                'test': { id: 'practice-mode-badge', text: '正式测试模式', class: 'bg-danger-subtle text-danger border border-danger' }
            };
            
            const modeInfo = modeBadges[this.mode];
            if (!modeInfo) return;
            
            // 隐藏所有模式标识
            document.querySelectorAll('[id$="-mode-badge"]').forEach(el => el.style.display = 'none');
            
            // 显示当前模式标识
            const badgeEl = document.getElementById(modeInfo.id);
            if (badgeEl) {
                badgeEl.textContent = modeInfo.text;
                badgeEl.className = `badge ${modeInfo.class}`;
                badgeEl.style.display = 'inline-block';
            }
            
            // 如果是测试模式，显示锁定提示
            if (this.mode === 'test') {
                const lockHint = document.getElementById('practice-pinyin-lock-hint');
                if (lockHint) {
                    lockHint.style.display = 'inline-block';
                }
            }
        },
        
        updatePinyinSwitch() {
            // 更新拼音开关状态
            const switchId = this.mode === 'preview' ? 'preview-pinyin-switch' : 'practice-pinyin-switch';
            const switchEl = document.getElementById(switchId);
            if (switchEl) {
                switchEl.checked = this.showPinyin;
                // 测试模式锁定开关
                if (this.mode === 'test') {
                    switchEl.disabled = true;
                    switchEl.title = '测试模式，拼音已锁定';
                } else {
                    switchEl.disabled = false;
                    switchEl.title = '';
                }
            }
        },
        
        updateBadges() {
            // 根据模式选择进度元素
            const progressElId = this.mode === 'preview' ? 'preview-progress' : 'practice-progress';
            const progressEl = document.getElementById(progressElId);
            const timerEl = document.getElementById('practice-timer');
            const speedEl = document.getElementById('practice-speed-hint');

            const totalGroups = Math.ceil(this.words.length / this.wordsPerPage);
            if (progressEl) progressEl.textContent = `${Math.min(this.currentIndex + 1, totalGroups)}/${totalGroups}`;
            if (speedEl) speedEl.textContent = `速度 ${this.speedPerWord}s/词`;

            // 更新模式选择按钮的active状态
            this.updateModeSelectButtons();

            // 预习模式不显示计时相关元素
            if (timerEl) {
                timerEl.style.display = this.mode === 'preview' ? 'none' : 'inline';
            }
            if (speedEl) {
                speedEl.style.display = this.mode === 'preview' ? 'none' : 'inline';
            }
            
            // 测试模式隐藏显示拼音开关
            const pinyinSwitchContainer = document.getElementById('practice-pinyin-switch-container');
            if (pinyinSwitchContainer) {
                pinyinSwitchContainer.style.display = this.mode === 'test' ? 'none' : 'block';
            }

            // 练习模式和测试模式显示计时
            if (this.mode !== 'preview' && timerEl) {
                clearInterval(this.timer);
                const start = Date.now() - this.elapsed;
                this.timer = setInterval(() => {
                    if (this.isPaused) return;
                    this.elapsed = Date.now() - start;
                    timerEl.textContent = `${Math.round(this.elapsed / 1000)}s`;
                }, 500);
            }
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
            
            // 测试模式的特殊逻辑：只会在错题库基础上新增错题，不会减少
            if (this.mode === 'test' && this.testModeExistingErrors) {
                // 获取当前错题库中的所有错题
                const currentErrorWords = Storage.getErrorWords() || [];
                const existingErrorWordIds = this.testModeExistingErrors;
                
                // 合并：保留原有的错题，新增本次测试的错题
                const newErrorWordIds = new Set(errorWords.map(e => e.wordId));
                const mergedErrorWordIds = new Set([...existingErrorWordIds, ...newErrorWordIds]);
                
                // 重新构建错题列表：保留原有错题（如果不在本次测试中），加上本次测试的新错题
                const mergedErrorWords = [];
                
                // 先添加原有的错题（如果它们不在本次测试的新错题中）
                currentErrorWords.forEach(existingError => {
                    if (existingErrorWordIds.has(existingError.wordId) && !newErrorWordIds.has(existingError.wordId)) {
                        // 原有错题且本次测试未标记为错题，保留
                        mergedErrorWords.push(existingError);
                    }
                });
                
                // 再添加本次测试的新错题
                errorWords.forEach(newError => {
                    mergedErrorWords.push(newError);
                });
                
                // 保存合并后的错题
                Storage.saveErrorWords(mergedErrorWords);
                
                // 清除标记
                this.testModeExistingErrors = null;
            } else {
                // 正常模式：直接保存错题
                Storage.saveErrorWordsForRound(this.log.id, errorWords);
            }
            
            // 更新汇总题库（以每个单元首次测试/练习的结果作为汇总）
            if (errorWords.length > 0 && (this.mode === 'test' || this.mode === 'practice')) {
                // 按单元分组更新汇总题库
                const wordsByUnit = {};
                errorWords.forEach(errorWord => {
                    const unit = errorWord.unit || 'default';
                    if (!wordsByUnit[unit]) {
                        wordsByUnit[unit] = [];
                    }
                    wordsByUnit[unit].push(errorWord);
                });
                
                // 为每个单元更新汇总题库
                Object.keys(wordsByUnit).forEach(unit => {
                    Storage.updateSummaryErrorWords(wordsByUnit[unit], this.mode, unit);
                });
            }
            
            // 为错题创建复习计划
            if (global.ReviewPlan && errorWords.length > 0) {
                ReviewPlan.createPlansForErrorWords(errorWords);
            }
            
            // 如果是复习计划的练习或测试，更新复习计划状态
            if (this.reviewPlanWordId && this.reviewPlanStage) {
                if (this.mode === 'error-practice') {
                    // 完成复习练习
                    if (global.ReviewPlan) {
                        ReviewPlan.completePractice(this.reviewPlanWordId, this.reviewPlanStage);
                    }
                } else if (this.mode === 'test') {
                    // 完成复习测试
                    const wordPassed = !errorWords.some(e => e.wordId === this.reviewPlanWordId);
                    if (global.ReviewPlan) {
                        ReviewPlan.completeTest(this.reviewPlanWordId, this.reviewPlanStage, wordPassed);
                    }
                }
            }
            
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
            const resultsTitleEl = document.getElementById('results-title');

            // 更新标题（区分练习结果和测试结果）
            if (resultsTitleEl) {
                resultsTitleEl.textContent = this.mode === 'test' ? '正式测试结果' : '练习结果';
            }
            
            // 根据模式显示不同的按钮
            const practiceModeButtons = document.getElementById('results-practice-mode-buttons');
            const testModeButtons = document.getElementById('results-test-mode-buttons');
            if (practiceModeButtons && testModeButtons) {
                if (this.mode === 'test') {
                    practiceModeButtons.classList.add('d-none');
                    testModeButtons.classList.remove('d-none');
                } else {
                    practiceModeButtons.classList.remove('d-none');
                    testModeButtons.classList.add('d-none');
                }
            }
            
            // 更新模式选择按钮的active状态
            this.updateResultsModeSelectButtons();

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

            // 恢复筛选开关状态（全局记忆）
            const settings = Storage.getSettings() || {};
            const showOnlyErrors = settings.resultsShowOnlyErrors !== false; // 默认只显示错题
            const filterSwitch = document.getElementById('results-filter-switch');
            if (filterSwitch) {
                filterSwitch.checked = showOnlyErrors;
                
                // 绑定筛选开关事件（移除旧的事件监听器，避免重复绑定）
                const newFilterSwitch = filterSwitch.cloneNode(true);
                filterSwitch.parentNode.replaceChild(newFilterSwitch, filterSwitch);
                newFilterSwitch.addEventListener('change', (e) => {
                    const showOnlyErrors = e.target.checked;
                    // 保存设置（全局记忆）
                    const settings = Storage.getSettings() || {};
                    settings.resultsShowOnlyErrors = showOnlyErrors;
                    Storage.saveSettings(settings);
                    // 重新渲染结果
                    this.renderResults(errorWords);
                });
            }

            if (container) {
                // 根据筛选开关决定是否只显示错题
                // 如果开启了"只显示错题"，始终只显示错题（包括被取消选中的错题）
                // 如果resultsDirty为true且有未确认的修改，仍然只显示错题，但包括那些被取消选中的
                const allWords = this.log.groups.flatMap(group => group.words);
                let wordsToShow;
                if (showOnlyErrors) {
                    // 只显示错题模式：显示所有曾经是错题的卡片（包括当前被取消选中的）
                    // 获取初始错题列表（从log.errorWords）
                    const initialErrorWordIds = new Set((this.log.errorWords || []).map(e => e.wordId));
                    // 显示所有初始错题，无论当前是否被选中
                    wordsToShow = allWords.filter(word => initialErrorWordIds.has(word.id));
                } else {
                    // 显示所有卡片
                    wordsToShow = allWords;
                }
                
                container.innerHTML = wordsToShow.map(word => {
                    // 获取当前状态（可能已被修改）
                    const checked = word.markedWrong;
                    // 如果当前未选中，但仍然显示（因为开启了"只显示错题"），则不显示拼音
                    return CardComponent.render({
                        word: word.word || '',
                        pinyin: word.pinyin || '',
                        showPinyin: checked, // 只有选中的才显示拼音
                        markedWrong: checked,
                        dataId: word.id,
                        showCheckbox: true,
                        checkboxChecked: checked,
                        additionalClasses: 'result-card'
                    });
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
            
            // 如果有未确认的修改，需要更新卡片显示状态
            // 如果开启了"只显示错题"，仍然只显示初始错题卡片（包括被取消选中的）
            if (this.resultsDirty) {
                const filterSwitch = document.getElementById('results-filter-switch');
                const showOnlyErrors = filterSwitch ? filterSwitch.checked : false;
                const container = document.getElementById('results-card-container');
                if (container) {
                    const allWords = this.log.groups.flatMap(group => group.words);
                    let wordsToShow;
                    if (showOnlyErrors) {
                        // 只显示错题模式：显示所有初始错题（包括当前被取消选中的）
                        const initialErrorWordIds = new Set((this.log.errorWords || []).map(e => e.wordId));
                        wordsToShow = allWords.filter(word => initialErrorWordIds.has(word.id));
                    } else {
                        // 显示所有卡片
                        wordsToShow = allWords;
                    }
                    
                    container.innerHTML = wordsToShow.map(word => {
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
                    
                    // 重新绑定事件
                    container.querySelectorAll('.practice-card').forEach((card) => {
                        card.addEventListener('click', (e) => {
                            if (e.target.closest('.practice-toggle')) return;
                            const checkbox = card.querySelector('.practice-checkbox');
                            if (checkbox) {
                                checkbox.checked = !checkbox.checked;
                                const id = card.dataset.id;
                                this.handleResultToggle(id, checkbox.checked, card);
                            }
                        });
                    });
                    
                    container.querySelectorAll('.practice-checkbox').forEach((checkbox) => {
                        checkbox.addEventListener('change', (e) => {
                            e.stopPropagation();
                            const card = e.currentTarget.closest('.practice-card');
                            const id = card?.dataset?.id;
                            if (!id) return;
                            this.handleResultToggle(id, e.currentTarget.checked, card);
                        });
                    });
                    
                    setTimeout(() => {
                        CardComponent.adjustCardFontSizes(container);
                    }, 50);
                }
            }
        },
        
        updateResultsModeSelectButtons() {
            // 更新结果页模式选择按钮的active状态
            const previewBtn = document.getElementById('results-to-preview-btn');
            const practiceBtn = document.getElementById('results-mode-select-btn');
            const testBtn = document.getElementById('results-to-test-btn');
            
            [previewBtn, practiceBtn, testBtn].forEach(btn => {
                if (btn) {
                    btn.classList.remove('active');
                }
            });
            
            if (this.mode === 'preview' && previewBtn) {
                previewBtn.classList.add('active');
            } else if (this.mode === 'practice' && practiceBtn) {
                practiceBtn.classList.add('active');
            } else if (this.mode === 'test' && testBtn) {
                testBtn.classList.add('active');
            }
        },

        toggleResultsDirty(isDirty) {
            this.resultsDirty = !!isDirty;
            const confirmBar = document.getElementById('results-confirm-bar');
            if (confirmBar) {
                // 有改动时显示，无改动时隐藏
                if (isDirty) {
                    confirmBar.classList.remove('d-none');
                } else {
                    confirmBar.classList.add('d-none');
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
        },
        
        retryTest() {
            // 测试模式：再测一次，只会在错题库基础上新增错题，不会减少
            if (!this.log) {
                this.showPage('home');
                return;
            }
            
            // 获取当前错题库中的所有错题wordId
            const currentErrorWords = Storage.getErrorWords() || [];
            const existingErrorWordIds = new Set(currentErrorWords.map(e => e.wordId));
            
            // 保存当前错题库的wordId集合，用于后续合并
            this.testModeExistingErrors = existingErrorWordIds;
            
            const settings = Storage.getSettings() || {};
            Storage.saveSettings({
                ...settings,
                total: this.words.length,
                speed: this.speedPerWord,
                perPage: this.wordsPerPage
            });
            this.mode = 'test';
            this.showPage('practice');
            this.start('test');
        },
        
        retryTestErrors() {
            // 测试模式：只测错题，只会在错题库基础上新增错题，不会减少
            if (!this.log) {
                this.showPage('home');
                return;
            }
            
            // 获取当前错题库中的所有错题wordId
            const currentErrorWords = Storage.getErrorWords() || [];
            const existingErrorWordIds = new Set(currentErrorWords.map(e => e.wordId));
            
            // 保存当前错题库的wordId集合，用于后续合并
            this.testModeExistingErrors = existingErrorWordIds;
            
            // 只练习错题
            const errorWordIds = Array.from(existingErrorWordIds);
            const errorWords = this.words.filter(w => errorWordIds.includes(w.id));
            
            if (errorWords.length === 0) {
                alert('当前没有错题');
                return;
            }
            
            this.words = errorWords;
            const settings = Storage.getSettings() || {};
            Storage.saveSettings({
                ...settings,
                total: this.words.length,
                speed: this.speedPerWord,
                perPage: this.wordsPerPage
            });
            this.mode = 'test';
            this.showPage('practice');
            this.start('test');
        }
    };

    global.Practice = Practice;
})(window);
