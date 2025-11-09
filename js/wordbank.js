(function (global) {
    /**
     * 使用 pinyin-pro 生成拼音
     * @param {string} text - 中文文本
     * @returns {string} - 拼音（带声调）
     */
    function generatePinyin(text) {
        if (!text || typeof text !== 'string') return '';
        
        // 检查 pinyin-pro 是否已加载
        if (typeof pinyinPro !== 'undefined' && pinyinPro.pinyin) {
            try {
                // 使用 pinyin-pro 生成拼音，带声调
                const result = pinyinPro.pinyin(text, { toneType: 'symbol', type: 'all' });
                
                // 如果返回的是数组，提取拼音字符串
                if (Array.isArray(result)) {
                    return result.map(item => {
                        // 如果item是对象，取pinyin字段；如果是字符串，直接使用
                        return typeof item === 'object' && item.pinyin ? item.pinyin : String(item);
                    }).join(' ');
                }
                
                // 如果返回的是字符串，直接返回
                return String(result || '');
            } catch (err) {
                console.warn('生成拼音失败', err);
                return '';
            }
        }
        return '';
    }

    const SAMPLE_WORDS = [
        { word: '春风', pinyin: 'chūn fēng', unit: '第一单元' },
        { word: '柳絮', pinyin: 'liǔ xù', unit: '第一单元' },
        { word: '晨露', pinyin: 'chén lù', unit: '第一单元' },
        { word: '山川', pinyin: 'shān chuān', unit: '第二单元' },
        { word: '星辰', pinyin: 'xīng chén', unit: '第二单元' },
        { word: '灯火', pinyin: 'dēng huǒ', unit: '第二单元' },
        { word: '童谣', pinyin: 'tóng yáo', unit: '学习园地一' },
        { word: '麦穗', pinyin: 'mài suì', unit: '学习园地一' }
    ];

    function createId(prefix = 'word') {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return `${prefix}_${crypto.randomUUID()}`;
        }
        return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    }

    const WordBank = {
        data: [],
        filtered: [],
        selectedIds: new Set(),
        lastSelectedIndex: -1,
        lastImportSnapshot: null, // 保存最近一次导入前的快照
        pendingImportData: null, // 待确认的导入数据

        init() {
            if (!global.Storage) {
                console.warn('Storage 未初始化');
                return;
            }
            this.data = this.prepareInitialData(Storage.getWordBank());
            this.filtered = [...this.data];
            this.renderTable();
            this.bindEvents();
        },

        prepareInitialData(existing) {
            if (Array.isArray(existing) && existing.length) return existing;
            const seeded = SAMPLE_WORDS.map(item => ({
                id: createId('sample'),
                word: item.word,
                pinyin: item.pinyin,
                unit: item.unit
            }));
            Storage.saveWordBank(seeded);
            return seeded;
        },

        bindEvents() {
            const importBtn = document.getElementById('wordbank-import-btn');
            const exportBtn = document.getElementById('wordbank-export-btn');
            const refreshBtn = document.getElementById('wordbank-refresh-btn');
            const searchInput = document.getElementById('wordbank-search');
            const textImportBtn = document.getElementById('wordbank-text-import-btn');
            const textClearBtn = document.getElementById('wordbank-text-clear-btn');
            const selectAllBtn = document.getElementById('wordbank-select-all-btn');
            const selectAllCheckbox = document.getElementById('wordbank-select-all-checkbox');
            const deleteSelectedBtn = document.getElementById('wordbank-delete-selected-btn');
            const undoBtn = document.getElementById('wordbank-undo-btn');
            const debugFillBtn1 = document.getElementById('wordbank-debug-fill-btn-1');
            const debugFillBtn2 = document.getElementById('wordbank-debug-fill-btn-2');

            if (importBtn) {
                importBtn.addEventListener('click', () => this.handleImport());
            }
            if (undoBtn) {
                undoBtn.addEventListener('click', () => this.handleUndo());
            }
            if (exportBtn) {
                exportBtn.addEventListener('click', () => this.handleExport());
            }
            if (refreshBtn) {
                refreshBtn.addEventListener('click', () => this.refresh());
            }
            if (searchInput) {
                searchInput.addEventListener('input', (e) => {
                    this.applyFilter(e.target.value.trim());
                });
            }
            if (textImportBtn) {
                textImportBtn.addEventListener('click', () => this.handleTextImport());
            }
            if (textClearBtn) {
                textClearBtn.addEventListener('click', () => {
                    const textInput = document.getElementById('wordbank-text-input');
                    if (textInput) textInput.value = '';
                });
            }
            if (selectAllBtn) {
                selectAllBtn.addEventListener('click', () => this.selectAll());
            }
            if (selectAllCheckbox) {
                selectAllCheckbox.addEventListener('change', (e) => {
                    this.selectAll(e.target.checked);
                });
            }
            if (deleteSelectedBtn) {
                deleteSelectedBtn.addEventListener('click', () => this.deleteSelected());
            }
            if (debugFillBtn1) {
                debugFillBtn1.addEventListener('click', () => this.handleDebugFill(1));
            }
            if (debugFillBtn2) {
                debugFillBtn2.addEventListener('click', () => this.handleDebugFill(2));
            }
            
            // 导入预览确认按钮
            const previewConfirmBtn = document.getElementById('import-preview-confirm-btn');
            if (previewConfirmBtn) {
                previewConfirmBtn.addEventListener('click', () => this.confirmImport());
            }
            
            // 监听调试模式变化，显示/隐藏调试按钮
            this.updateDebugButtonVisibility();
            if (global.Debug) {
                // 监听调试模式开关变化
                const debugSwitch = document.getElementById('debug-mode-switch');
                if (debugSwitch) {
                    debugSwitch.addEventListener('change', () => {
                        setTimeout(() => this.updateDebugButtonVisibility(), 100);
                    });
                }
            }
        },
        
        updateDebugButtonVisibility() {
            const debugFillBtn1 = document.getElementById('wordbank-debug-fill-btn-1');
            const debugFillBtn2 = document.getElementById('wordbank-debug-fill-btn-2');
            const isDebugMode = global.Debug && Debug.isDebugMode();
            
            if (debugFillBtn1) {
                if (isDebugMode) {
                    debugFillBtn1.classList.remove('d-none');
                } else {
                    debugFillBtn1.classList.add('d-none');
                }
            }
            if (debugFillBtn2) {
                if (isDebugMode) {
                    debugFillBtn2.classList.remove('d-none');
                } else {
                    debugFillBtn2.classList.add('d-none');
                }
            }
        },
        
        async handleDebugFill(sampleNum) {
            const textInput = document.getElementById('wordbank-text-input');
            if (!textInput) return;
            
            try {
                // 从文件加载测试数据
                // 尝试多个可能的路径
                const possiblePaths = [
                    `docs/导入sample${sampleNum}.txt`,
                    `./docs/导入sample${sampleNum}.txt`,
                    `../docs/导入sample${sampleNum}.txt`,
                    `导入sample${sampleNum}.txt`
                ];
                
                let testData = null;
                let lastError = null;
                
                // 尝试每个路径
                for (const fileName of possiblePaths) {
                    try {
                        const response = await fetch(fileName, {
                            method: 'GET',
                            headers: {
                                'Accept': 'text/plain'
                            }
                        });
                        
                        if (response.ok) {
                            testData = await response.text();
                            if (global.Debug && Debug.isDebugMode()) {
                                Debug.log('info', `成功从 ${fileName} 加载测试数据`, 'debug');
                            }
                            break;
                        }
                    } catch (err) {
                        lastError = err;
                        continue;
                    }
                }
                
                // 如果所有路径都失败，检查是否是 file:// 协议
                if (!testData) {
                    const isFileProtocol = window.location.protocol === 'file:';
                    if (isFileProtocol) {
                        throw new Error('无法通过 file:// 协议加载文件。\n\n请使用本地服务器运行：\n1. 在项目目录运行: python -m http.server 8000\n2. 或: npx serve\n3. 然后访问 http://localhost:8000');
                    } else {
                        throw new Error(`无法加载文件。请确保文件 docs/导入sample${sampleNum}.txt 存在且可访问。`);
                    }
                }
                
                // 将内容设置到文本框
                textInput.value = testData;
                
                // 自动选择年级和册数（如果未选择）
                const gradeSelect = document.getElementById('wordbank-grade-select');
                const semesterSelect = document.getElementById('wordbank-semester-select');
                if (gradeSelect && !gradeSelect.value) {
                    gradeSelect.value = '三年级';
                }
                if (semesterSelect && !semesterSelect.value) {
                    semesterSelect.value = '上册';
                }
                
                if (global.Debug && Debug.isDebugMode()) {
                    Debug.log('info', `已从文件加载调试测试数据${sampleNum}`, 'debug', { 
                        textLength: testData.length,
                        lines: testData.split('\n').length,
                        sample: sampleNum
                    });
                }
            } catch (err) {
                console.error('加载测试数据失败', err);
                alert(`加载测试数据失败: ${err.message}`);
                
                if (global.Debug && Debug.isDebugMode()) {
                    Debug.log('error', `加载测试数据失败: ${err.message}`, 'debug', { 
                        sample: sampleNum,
                        error: err,
                        protocol: window.location.protocol
                    });
                }
            }
        },

        refresh() {
            this.data = Storage.getWordBank();
            this.filtered = [...this.data];
            this.renderTable();
        },

        applyFilter(keyword) {
            if (!keyword) {
                this.filtered = [...this.data];
            } else {
                const lower = keyword.toLowerCase();
                this.filtered = this.data.filter(item => {
                    return (
                        item.word?.includes(keyword) ||
                        item.pinyin?.toLowerCase().includes(lower) ||
                        (item.unit != null && String(item.unit).includes(keyword))
                    );
                });
            }
            this.renderTable();
        },

        renderTable() {
            const container = document.getElementById('wordbank-table-body');
            if (!container) return;
            
            if (!this.filtered.length) {
                container.innerHTML = `
                    <div class="text-center text-muted py-5">
                            <i class="bi bi-inbox"></i> 暂无词语，请先导入
                    </div>
                `;
                return;
            }

            // 按单元分组
            const grouped = {};
            this.filtered.forEach(item => {
                const unit = item.unit != null ? String(item.unit) : '未分类';
                if (!grouped[unit]) {
                    grouped[unit] = [];
                }
                grouped[unit].push(item);
            });

            // 生成HTML
            let html = '';
            const units = Object.keys(grouped).sort((a, b) => {
                const aNum = parseInt(a);
                const bNum = parseInt(b);
                if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
                if (isNaN(aNum) && isNaN(bNum)) return a.localeCompare(b);
                return isNaN(aNum) ? 1 : -1;
            });

            units.forEach(unit => {
                const unitWords = grouped[unit];
                const unitDisplay = unit === '未分类' ? '未分类' : `单元${unit}`;
                
                html += `<div class="card mb-3 wordbank-unit-card" data-unit="${unit}">
                    <div class="card-header d-flex justify-content-between align-items-center">
                        <strong>${unitDisplay}</strong>
                        <span class="badge bg-primary">${unitWords.length} 个词语</span>
                    </div>
                    <div class="card-body p-2">
                        <div class="row g-1 wordbank-words-container">`;
                
                // 计算全局索引（用于Shift选择）
                let globalIndex = 0;
                units.slice(0, units.indexOf(unit)).forEach(u => {
                    globalIndex += grouped[u].length;
                });
                
                unitWords.forEach((item, idx) => {
                    const id = item.id || `word_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                    const isSelected = this.selectedIds.has(id);
                    const word = (item.word || '').trim() || '-';
                    const pinyin = (item.pinyin || '').trim() || '-';
                    const currentGlobalIndex = globalIndex + idx;
                    
                    html += `<div class="col-6 col-md-4 col-lg-3 col-xl-2 wordbank-word-item ${isSelected ? 'selected' : ''}" 
                                 data-id="${id}" 
                                 data-index="${currentGlobalIndex}"
                                 data-unit="${unit}">
                            <div class="d-flex align-items-center gap-1 p-1 border rounded">
                                <input type="checkbox" class="form-check-input word-select-checkbox flex-shrink-0" 
                                       data-id="${id}" 
                                       ${isSelected ? 'checked' : ''} />
                                <div class="flex-grow-1 text-truncate" style="min-width: 0;">
                                    <div class="fw-semibold text-truncate" title="${word}">${word}</div>
                                    ${pinyin !== '-' ? `<div class="small text-muted text-truncate" title="${pinyin}">${pinyin}</div>` : ''}
                                </div>
                                <button class="btn btn-sm btn-outline-danger flex-shrink-0 p-1" 
                                        data-action="remove" 
                                        onclick="WordBank.removeWord('${id}')"
                                        style="line-height: 1; padding: 0.125rem 0.25rem !important;">
                                    <i class="bi bi-trash" style="font-size: 0.75rem;"></i>
                        </button>
                            </div>
                        </div>`;
                });
                
                html += `</div>
                    </div>
                </div>`;
            });

            container.innerHTML = html;

            // 绑定复选框事件
            container.querySelectorAll('.word-select-checkbox').forEach((checkbox) => {
                checkbox.addEventListener('change', (e) => {
                    const id = checkbox.dataset.id;
                    const item = checkbox.closest('.wordbank-word-item');
                    const index = parseInt(item?.dataset.index) || 0;
                    
                    if (e.shiftKey && this.lastSelectedIndex >= 0) {
                        // Shift批量选择
                        const allItems = Array.from(container.querySelectorAll('.wordbank-word-item'));
                        const currentIndex = allItems.findIndex(el => el.dataset.id === id);
                        const lastIndex = this.lastSelectedIndex;
                        
                        if (currentIndex >= 0 && lastIndex >= 0) {
                            const start = Math.min(lastIndex, currentIndex);
                            const end = Math.max(lastIndex, currentIndex);
                            
                            for (let i = start; i <= end; i++) {
                                const item = allItems[i];
                                if (item) {
                                    const itemId = item.dataset.id;
                                    const itemCheckbox = item.querySelector('.word-select-checkbox');
                                    if (checkbox.checked) {
                                        this.selectedIds.add(itemId);
                                        if (itemCheckbox) itemCheckbox.checked = true;
                                        item.classList.add('selected');
                                    } else {
                                        this.selectedIds.delete(itemId);
                                        if (itemCheckbox) itemCheckbox.checked = false;
                                        item.classList.remove('selected');
                                    }
                                }
                            }
                        }
                    } else {
                        // 单个选择
                        if (checkbox.checked) {
                            this.selectedIds.add(id);
                            if (item) item.classList.add('selected');
                        } else {
                            this.selectedIds.delete(id);
                            if (item) item.classList.remove('selected');
                        }
                    }
                    
                    this.lastSelectedIndex = index;
                    this.updateSelectAllCheckbox();
                });
            });
        },

        selectAll(checked = true) {
            this.filtered.forEach(item => {
                const id = item.id || '';
                if (checked) {
                    this.selectedIds.add(id);
                } else {
                    this.selectedIds.delete(id);
                }
            });
            this.renderTable();
        },

        updateSelectAllCheckbox() {
            const selectAllCheckbox = document.getElementById('wordbank-select-all-checkbox');
            if (!selectAllCheckbox) return;
            const allSelected = this.filtered.length > 0 && this.filtered.every(item => {
                const id = item.id || '';
                return this.selectedIds.has(id);
            });
            selectAllCheckbox.checked = allSelected;
            selectAllCheckbox.indeterminate = !allSelected && this.selectedIds.size > 0;
        },

        deleteSelected() {
            if (this.selectedIds.size === 0) {
                alert('请先选择要删除的词语');
                return;
            }
            if (!confirm(`确定要删除选中的 ${this.selectedIds.size} 个词语吗？`)) return;
            
            this.data = this.data.filter(item => !this.selectedIds.has(item.id || ''));
            this.filtered = this.filtered.filter(item => !this.selectedIds.has(item.id || ''));
            this.selectedIds.clear();
            this.lastSelectedIndex = -1;
            Storage.saveWordBank(this.data);
            this.renderTable();
            // 刷新练习范围选择器
            if (global.PracticeRange) {
                PracticeRange.init();
            }
        },

        handleTextImport() {
            const textInput = document.getElementById('wordbank-text-input');
            const gradeSelect = document.getElementById('wordbank-grade-select');
            const semesterSelect = document.getElementById('wordbank-semester-select');
            
            if (!textInput) return;
            const text = textInput.value.trim();
            if (!text) {
                alert('请输入要导入的词语');
                return;
            }
            
            // 检查年级和册数
            const grade = gradeSelect?.value;
            const semester = semesterSelect?.value;
            if (!grade || !semester) {
                alert('请先选择年级和册数');
                return;
            }
            
            try {
                // 保存导入前的快照
                this.lastImportSnapshot = JSON.parse(JSON.stringify(this.data));
                
                if (global.Debug && Debug.isDebugMode()) {
                    Debug.log('info', '开始导入文本', 'import', { textLength: text.length, preview: text.substring(0, 100), grade, semester });
                }
                
                const parsed = this.parseImport(text, grade, semester);
                
                if (global.Debug && Debug.isDebugMode()) {
                    Debug.log('info', '解析完成', 'import', { 
                        parsedCount: parsed.length, 
                        words: parsed.slice(0, 10).map(w => ({ word: w.word, unit: w.unit, pinyin: w.pinyin }))
                    });
                }
                
                if (!parsed || parsed.length === 0) {
                    alert('未能解析出有效词语，请检查格式');
                    if (global.Debug && Debug.isDebugMode()) {
                        Debug.log('warn', '解析失败：未找到有效词语', 'import');
                    }
                    return;
                }
                
                // 保存导入前的快照（用于撤销）
                this.lastImportSnapshot = JSON.parse(JSON.stringify(this.data));
                
                // 保存待导入的数据，显示预览
                this.pendingImportData = {
                    words: parsed,
                    grade: grade,
                    semester: semester,
                    source: 'text'
                };
                
                this.showImportPreview(parsed, grade, semester);
            } catch (err) {
                console.error('导入失败', err);
                alert('导入失败：' + err.message);
                if (global.Debug && Debug.isDebugMode()) {
                    Debug.log('error', '导入失败', 'import', { error: err.message, stack: err.stack });
                }
            }
        },

        handleUndo() {
            if (!this.lastImportSnapshot) {
                alert('没有可撤销的操作');
                return;
            }
            
            if (!confirm('确定要撤销最近一次导入吗？这将恢复到导入前的状态。')) {
                return;
            }
            
            this.data = JSON.parse(JSON.stringify(this.lastImportSnapshot));
            this.lastImportSnapshot = null;
            Storage.saveWordBank(this.data);
            this.refresh();
            
            // 刷新练习范围选择器
            if (global.PracticeRange) {
                PracticeRange.init();
            }
            
            alert('已撤销最近一次导入');
        },

        removeWord(id) {
            if (!confirm('确定要删除这个词语吗？')) return;
            this.data = this.data.filter(item => String(item.id || '') !== String(id));
            this.filtered = this.filtered.filter(item => String(item.id || '') !== String(id));
            Storage.saveWordBank(this.data);
            this.renderTable();
            // 刷新练习范围选择器
            if (global.PracticeRange) {
                PracticeRange.init();
            }
        },

        handleImport() {
            // 检查年级和册数
            const gradeSelect = document.getElementById('wordbank-grade-select');
            const semesterSelect = document.getElementById('wordbank-semester-select');
            const grade = gradeSelect?.value;
            const semester = semesterSelect?.value;
            if (!grade || !semester) {
                alert('请先选择年级和册数');
                return;
            }
            
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.txt,.json';
            input.onchange = async () => {
                const file = input.files?.[0];
                if (!file) return;
                const text = await file.text();
                try {
                    const parsed = this.parseImport(text, grade, semester);
                    if (!parsed || parsed.length === 0) {
                        alert('导入失败：文件中没有有效词语');
                        return;
                    }
                    
                    // 保存导入前的快照（用于撤销）
                    this.lastImportSnapshot = JSON.parse(JSON.stringify(this.data));
                    
                    // 保存待导入的数据，显示预览
                    this.pendingImportData = {
                        words: parsed,
                        grade: grade,
                        semester: semester,
                        source: 'file'
                    };
                    
                    this.showImportPreview(parsed, grade, semester);
                } catch (err) {
                    console.error('导入失败', err);
                    alert('导入失败：' + (err.message || '请检查文件格式'));
                }
            };
            input.click();
        },

        handleExport() {
            const data = {
                wordBank: this.data,
                exportDate: new Date().toISOString(),
                type: 'wordbank_only'
            };
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `语文认字_词语库_${new Date().toISOString().split('T')[0]}.json`;
            link.click();
            URL.revokeObjectURL(url);
        },

        parseImport(text, grade, semester) {
            try {
                const json = JSON.parse(text);
                // 支持「看拼音写词」的格式：{ wordBank: [...] }
                const wordsArray = json.wordBank || (Array.isArray(json) ? json : []);
                if (wordsArray.length > 0) {
                    return wordsArray
                        .map((item) => {
                            // 尝试从unit中提取数字，如果是字符串格式如 "三年级上册-1"
                            let unitNum = null;
                            if (item.unit) {
                                const unitStr = String(item.unit).trim();
                                // 尝试提取数字部分
                                const match = unitStr.match(/(\d+)$/);
                                if (match) {
                                    unitNum = parseInt(match[1]);
                                } else {
                                    const parsed = parseInt(unitStr);
                                    if (!isNaN(parsed)) {
                                        unitNum = parsed;
                                    }
                                }
                            }
                            const word = (item.word || '').trim();
                            let pinyin = (item.pinyin || '').trim();
                            // 如果没有拼音，自动生成
                            if (!pinyin && word) {
                                pinyin = generatePinyin(word);
                            }
                            return {
                                id: item.id || createId('word'),
                                word: word,
                                pinyin: pinyin,
                                unit: unitNum || 0, // 整数单元
                                grade: item.grade || grade || '',
                                semester: item.semester || semester || ''
                            };
                        })
                        .filter(item => item.word);
                }
            } catch (err) {
                // 纯文本格式：支持多种格式
                const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
                let currentUnitNum = null; // 当前单元数字（整数）
                let lastNumericUnit = null; // 记录上一个数字单元
                const words = [];
                
                lines.forEach((line, lineIndex) => {
                    const originalLine = line;
                    
                    // 单元标记：# 单元名 或 【单元名】
                    if (/^(#|【).+(】)?$/.test(line)) {
                        const unitStr = line.replace(/^[#【\s]+|[】\s]+$/g, '').trim();
                        // 尝试提取数字单元
                        const unitNum = parseInt(unitStr);
                        if (!isNaN(unitNum)) {
                            lastNumericUnit = unitNum;
                            currentUnitNum = unitNum;
                        } else {
                            // 非数字单元，尝试从字符串中提取数字
                            const match = unitStr.match(/(\d+)/);
                            if (match) {
                                const num = parseInt(match[1]);
                                lastNumericUnit = num;
                                currentUnitNum = num;
                            }
                        }
                        if (global.Debug && Debug.isDebugMode()) {
                            Debug.log('info', `识别到单元标记: ${unitStr} -> 单元${currentUnitNum}`, 'parse', { line: lineIndex + 1, originalLine });
                        }
                        return;
                    }
                    
                    // 处理"语文园地"：根据上一个数字单元，设置为X+1单元，并导入该行及后续的词语
                    if (/^语文园地/.test(line)) {
                        if (global.Debug && Debug.isDebugMode()) {
                            Debug.log('info', `[语文园地] 检测到语文园地行`, 'parse', { 
                                line: lineIndex + 1, 
                                originalLine, 
                                lastNumericUnit, 
                                currentUnitNum 
                            });
                        }
                        
                        if (lastNumericUnit !== null) {
                            // 更新为X+1单元
                            const newUnitNum = lastNumericUnit + 1;
                            currentUnitNum = newUnitNum;
                            lastNumericUnit = newUnitNum; // 更新lastNumericUnit，以便后续使用
                            
                            // 移除"语文园地"标识，保留后面的词语
                            const lineAfterRemove = line.replace(/^语文园地\s*/, '').trim();
                            
                            if (global.Debug && Debug.isDebugMode()) {
                                Debug.log('info', `[语文园地] 转换为单元${newUnitNum}`, 'parse', { 
                                    line: lineIndex + 1, 
                                    originalLine, 
                                    remainingLine: lineAfterRemove, 
                                    previousUnit: lastNumericUnit - 1,
                                    newUnit: newUnitNum
                                });
                            }
                            
                            // 如果移除"语文园地"后还有内容，继续处理；否则跳过这行
                            if (!lineAfterRemove) {
                                if (global.Debug && Debug.isDebugMode()) {
                                    Debug.log('info', `[语文园地] 移除标识后无内容，跳过该行`, 'parse', { 
                                        line: lineIndex + 1, 
                                        originalLine 
                                    });
                                }
                                return;
                            }
                            
                            // 更新line变量，继续执行下面的词语解析逻辑
                            line = lineAfterRemove;
                        } else {
                            // 如果没有上一个数字单元，跳过这行
                            if (global.Debug && Debug.isDebugMode()) {
                                Debug.log('warn', `[语文园地] 前没有数字单元，跳过`, 'parse', { 
                                    line: lineIndex + 1, 
                                    originalLine,
                                    lastNumericUnit,
                                    currentUnitNum
                                });
                            }
                            return;
                        }
                    }
                    
                    // 数字开头的行（如 "25 手术台 阵地 战斗"），数字表示单元
                    const unitMatch = line.match(/^(\d+)\s+(.+)$/);
                    if (unitMatch) {
                        const unitNum = parseInt(unitMatch[1]);
                        currentUnitNum = unitNum;
                        lastNumericUnit = unitNum;
                        line = unitMatch[2]; // 移除单元数字后的内容
                        if (global.Debug && Debug.isDebugMode()) {
                            Debug.log('info', `识别到数字单元: ${unitNum}`, 'parse', { line: lineIndex + 1, originalLine, remainingLine: line });
                        }
                    }
                    
                    // 如果没有当前单元，使用默认单元1
                    if (currentUnitNum === null) {
                        currentUnitNum = 1;
                        lastNumericUnit = 1;
                        if (global.Debug && Debug.isDebugMode()) {
                            Debug.log('info', `未指定单元，使用默认单元1`, 'parse', { line: lineIndex + 1, originalLine });
                        }
                    }
                    
                    // 处理一行中的多个词语
                    // 支持多种分隔符：空格、逗号、顿号等
                    const separators = /[\s,，、；;]+/;
                    const parts = line.split(separators).filter(p => p.trim());
                    
                    if (global.Debug && Debug.isDebugMode()) {
                        Debug.log('info', `[词语解析] 行${lineIndex + 1}分词结果`, 'parse', { 
                            originalLine, 
                            currentLine: line,
                            currentUnitNum,
                            partsCount: parts.length, 
                            parts: parts 
                        });
                    }
                    
                    parts.forEach((part, partIndex) => {
                        part = part.trim();
                        if (!part) return;
                        
                        // 支持 "词语|拼音" 格式
                        if (part.includes('|')) {
                            const [wordPart, pinyinPart] = part.split('|').map(p => p?.trim() || '');
                            if (wordPart) {
                                // 如果用户提供了拼音，使用用户的；如果没有，自动生成
                                let finalPinyin = pinyinPart;
                                if (!finalPinyin) {
                                    finalPinyin = generatePinyin(wordPart);
                                }
                                const wordObj = {
                                    id: createId('word'),
                                    word: wordPart,
                                    pinyin: finalPinyin,
                                    unit: currentUnitNum, // 整数单元
                                    grade: grade || '',
                                    semester: semester || ''
                                };
                                words.push(wordObj);
                                
                                if (global.Debug && Debug.isDebugMode()) {
                                    Debug.log('success', `[词语导入] 添加词语: ${wordPart} (拼音: ${finalPinyin}) -> 单元${currentUnitNum}`, 'parse', wordObj);
                                }
                            }
                        } else {
                            // 纯词语，没有拼音，自动生成
                            const autoPinyin = generatePinyin(part);
                            const wordObj = {
                                id: createId('word'),
                                word: part,
                                pinyin: autoPinyin,
                                unit: currentUnitNum, // 整数单元
                                grade: grade || '',
                                semester: semester || ''
                            };
                            words.push(wordObj);
                            
                            if (global.Debug && Debug.isDebugMode()) {
                                Debug.log('success', `[词语导入] 添加词语: ${part} -> 单元${currentUnitNum}${autoPinyin ? ` (自动生成拼音: ${autoPinyin})` : ''}`, 'parse', wordObj);
                            }
                        }
                    });
                });
                
                if (global.Debug && Debug.isDebugMode()) {
                    // 按单元分组统计
                    const unitGroups = {};
                    words.forEach(w => {
                        const unit = w.unit != null ? String(w.unit) : 'null';
                        if (!unitGroups[unit]) unitGroups[unit] = [];
                        unitGroups[unit].push(w.word);
                    });
                    
                    Debug.log('success', `[解析完成] 共${words.length}个词语`, 'parse', { 
                        totalWords: words.length,
                        units: Object.keys(unitGroups).map(u => {
                            const num = parseInt(u);
                            return isNaN(num) ? u : num;
                        }).filter(u => typeof u === 'number').sort((a, b) => a - b),
                        unitGroups: Object.keys(unitGroups).reduce((acc, unit) => {
                            acc[unit] = unitGroups[unit].length;
                            return acc;
                        }, {})
                    });
                    
                    // 特别显示每个单元的词语
                    Object.keys(unitGroups).sort((a, b) => {
                        const aNum = parseInt(a);
                        const bNum = parseInt(b);
                        if (isNaN(aNum) && isNaN(bNum)) return a.localeCompare(b);
                        if (isNaN(aNum)) return 1;
                        if (isNaN(bNum)) return -1;
                        return aNum - bNum;
                    }).forEach(unitKey => {
                        const unitWords = unitGroups[unitKey];
                        const unitNum = parseInt(unitKey);
                        const unitLabel = isNaN(unitNum) ? unitKey : `单元${unitNum}`;
                        Debug.log('info', `[单元统计] ${unitLabel}: ${unitWords.length}个词语`, 'parse', {
                            unit: unitKey,
                            count: unitWords.length,
                            words: unitWords.slice(0, 20) // 显示前20个
                        });
                    });
                }
                
                return words;
            }
            return [];
        },
        
        /**
         * 显示导入预览
         */
        showImportPreview(words, grade, semester) {
            if (!words || words.length === 0) return;
            
            // 按单元分组
            const grouped = {};
            words.forEach(word => {
                const unit = word.unit != null ? String(word.unit) : '未分类';
                if (!grouped[unit]) {
                    grouped[unit] = [];
                }
                grouped[unit].push(word);
            });
            
            // 生成预览HTML
            let html = '<div class="import-preview">';
            
            // 统计信息
            const units = Object.keys(grouped).sort((a, b) => {
                const aNum = parseInt(a);
                const bNum = parseInt(b);
                if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
                return a.localeCompare(b);
            });
            
            html += `<div class="alert alert-success mb-3">
                <strong>共 ${words.length} 个词语</strong>，分布在 <strong>${units.length} 个单元</strong>中
                ${grade && semester ? `（${grade}${semester}）` : ''}
            </div>`;
            
            // 按单元显示，添加单元间插入区域
            units.forEach((unit, unitIndex) => {
                const unitWords = grouped[unit];
                const unitDisplay = grade && semester ? `${grade}${semester}-${unit}` : `单元${unit}`;
                
                // 单元间插入区域（在单元之前）
                html += `<div class="unit-insert-zone" data-insert-before="${unit}" style="height: 4px; margin: 8px 0; position: relative;">
                    <div class="unit-insert-btn" style="display: none; position: absolute; left: -20px; top: 50%; transform: translateY(-50%); z-index: 10;">
                        <button class="btn btn-sm btn-success rounded-circle" type="button" onclick="WordBank.insertUnitBefore('${unit}')" title="在此处插入新单元">
                            <i class="bi bi-plus"></i>
                        </button>
                    </div>
                </div>`;
                
                html += `<div class="card mb-3 unit-preview-card" data-unit="${unit}" draggable="false">
                    <div class="card-header d-flex justify-content-between align-items-center position-relative">
                        <strong>${unitDisplay}</strong>
                        <div class="d-flex align-items-center gap-2">
                            <span class="badge bg-primary">${unitWords.length} 个词语</span>
                            <button class="btn btn-sm btn-outline-danger unit-delete-btn" type="button" 
                                    onclick="WordBank.deleteUnit('${unit}')" title="删除此单元" style="display: none;">
                                <i class="bi bi-trash"></i>
                            </button>
                        </div>
                    </div>
                    <div class="card-body">
                        <div class="row g-2 unit-words-container" id="unit-words-${unit}" data-unit="${unit}">`;
                
                unitWords.forEach((word, idx) => {
                    const wordText = String(word.word || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
                    const pinyinText = String(word.pinyin || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
                    html += `<div class="col-md-4 col-lg-3 word-item" 
                                 data-word-id="word-${unit}-${idx}"
                                 data-unit="${unit}"
                                 data-index="${idx}"
                                 draggable="true">
                            <div class="input-group input-group-sm mb-1">
                                <input type="checkbox" class="form-check-input word-select-checkbox" 
                                       data-unit="${unit}" 
                                       data-index="${idx}">
                                <input type="text" class="form-control word-input" 
                                       data-field="word" 
                                       data-unit="${unit}" 
                                       data-index="${idx}"
                                       value="${wordText}" 
                                       placeholder="词语">
                                <button class="btn btn-outline-danger btn-sm" type="button" 
                                        onclick="WordBank.removeWordFromPreview('${unit}', ${idx})">
                                    <i class="bi bi-x"></i>
                                </button>
                            </div>
                            ${pinyinText ? `<small class="text-muted d-block ms-4">${pinyinText}</small>` : '<small class="text-muted d-block ms-4">（自动生成拼音）</small>'}
                        </div>`;
                });
                
                html += `</div>
                        <button class="btn btn-sm btn-outline-primary mt-2" 
                                onclick="WordBank.addWordToUnit('${unit}')">
                            <i class="bi bi-plus"></i> 添加词语
                        </button>
                    </div>
                </div>`;
            });
            
            // 最后一个单元后也添加插入区域
            if (units.length > 0) {
                const lastUnit = units[units.length - 1];
                const lastUnitNum = parseInt(lastUnit);
                const nextUnit = isNaN(lastUnitNum) ? 'new' : String(lastUnitNum + 1);
                html += `<div class="unit-insert-zone" data-insert-after="${lastUnit}" style="height: 4px; margin: 8px 0; position: relative;">
                    <div class="unit-insert-btn" style="display: none; position: absolute; left: -20px; top: 50%; transform: translateY(-50%); z-index: 10;">
                        <button class="btn btn-sm btn-success rounded-circle" type="button" onclick="WordBank.insertUnitAfter('${lastUnit}')" title="在此处插入新单元">
                            <i class="bi bi-plus"></i>
                        </button>
                    </div>
                </div>`;
            }
            
            html += '</div>';
            
            // 显示模态框
            const content = document.getElementById('import-preview-content');
            if (content) {
                content.innerHTML = html;
            }
            
            // 绑定拖拽和选择事件
            this.bindPreviewEvents();
            
            const modal = new bootstrap.Modal(document.getElementById('import-preview-modal'));
            modal.show();
        },
        
        /**
         * 绑定预览界面的事件
         */
        bindPreviewEvents() {
            // 批量选择功能
            const selectAllCheckbox = document.createElement('input');
            selectAllCheckbox.type = 'checkbox';
            selectAllCheckbox.className = 'form-check-input';
            selectAllCheckbox.id = 'preview-select-all';
            selectAllCheckbox.style.marginRight = '8px';
            selectAllCheckbox.addEventListener('change', (e) => {
                document.querySelectorAll('.word-select-checkbox').forEach(cb => {
                    cb.checked = e.target.checked;
                });
            });
            
            // 在第一个单元前添加全选复选框
            const firstUnit = document.querySelector('.unit-preview-card');
            if (firstUnit) {
                const header = firstUnit.querySelector('.card-header');
                if (header && !header.querySelector('#preview-select-all')) {
                    header.insertBefore(selectAllCheckbox, header.firstChild);
                }
            }
            
            // 单元卡片hover显示删除按钮
            document.querySelectorAll('.unit-preview-card').forEach(card => {
                card.addEventListener('mouseenter', () => {
                    const deleteBtn = card.querySelector('.unit-delete-btn');
                    if (deleteBtn) deleteBtn.style.display = 'block';
                });
                card.addEventListener('mouseleave', () => {
                    const deleteBtn = card.querySelector('.unit-delete-btn');
                    if (deleteBtn) deleteBtn.style.display = 'none';
                });
            });
            
            // 单元间插入区域hover显示加号
            document.querySelectorAll('.unit-insert-zone').forEach(zone => {
                zone.addEventListener('mouseenter', () => {
                    const btn = zone.querySelector('.unit-insert-btn');
                    if (btn) btn.style.display = 'block';
                });
                zone.addEventListener('mouseleave', () => {
                    const btn = zone.querySelector('.unit-insert-btn');
                    if (btn) btn.style.display = 'none';
                });
            });
            
            // 拖拽功能
            document.querySelectorAll('.word-item').forEach(item => {
                item.addEventListener('dragstart', (e) => {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', JSON.stringify({
                        unit: item.dataset.unit,
                        index: item.dataset.index
                    }));
                    item.classList.add('dragging');
                });
                
                item.addEventListener('dragend', (e) => {
                    item.classList.remove('dragging');
                });
            });
            
            // 拖放目标
            document.querySelectorAll('.unit-words-container').forEach(container => {
                container.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    container.classList.add('drag-over');
                });
                
                container.addEventListener('dragleave', (e) => {
                    container.classList.remove('drag-over');
                });
                
                container.addEventListener('drop', (e) => {
                    e.preventDefault();
                    container.classList.remove('drag-over');
                    
                    const data = JSON.parse(e.dataTransfer.getData('text/plain'));
                    const targetUnit = container.dataset.unit;
                    
                    if (data.unit !== targetUnit) {
                        this.moveWordToUnit(data.unit, parseInt(data.index), targetUnit);
                    }
                });
            });
        },
        
        /**
         * 移动词语到其他单元
         */
        moveWordToUnit(fromUnit, fromIndex, toUnit) {
            if (!this.pendingImportData) return;
            
            // 找到源单元的所有词语
            const unitWords = this.pendingImportData.words.filter(w => {
                const wUnit = w.unit != null ? String(w.unit) : '未分类';
                return wUnit === String(fromUnit);
            });
            
            if (fromIndex >= 0 && fromIndex < unitWords.length) {
                const wordToMove = unitWords[fromIndex];
                const globalIndex = this.pendingImportData.words.indexOf(wordToMove);
                
                if (globalIndex >= 0) {
                    // 更新词语的单元
                    wordToMove.unit = parseInt(toUnit) || 0;
                    // 重新显示预览
                    this.showImportPreview(this.pendingImportData.words, this.pendingImportData.grade, this.pendingImportData.semester);
                }
            }
        },
        
        /**
         * 删除单元
         */
        deleteUnit(unit) {
            if (!this.pendingImportData) return;
            if (!confirm(`确定要删除单元 ${unit} 及其所有词语吗？`)) return;
            
            // 删除该单元的所有词语
            this.pendingImportData.words = this.pendingImportData.words.filter(w => {
                const wUnit = w.unit != null ? String(w.unit) : '未分类';
                return wUnit !== String(unit);
            });
            
            // 重新显示预览
            this.showImportPreview(this.pendingImportData.words, this.pendingImportData.grade, this.pendingImportData.semester);
        },
        
        /**
         * 在单元前插入新单元
         */
        insertUnitBefore(beforeUnit) {
            if (!this.pendingImportData) return;
            
            const beforeUnitNum = parseInt(beforeUnit);
            if (isNaN(beforeUnitNum)) return;
            
            // 将新单元插入到指定单元之前
            // 这里我们创建一个新单元，编号为 beforeUnitNum - 0.5，然后重新编号
            // 或者更简单：创建一个新单元，让用户输入编号
            const newUnitNum = prompt(`请输入新单元的编号（将插入到单元 ${beforeUnit} 之前）:`, beforeUnitNum);
            if (!newUnitNum) return;
            
            const num = parseInt(newUnitNum);
            if (isNaN(num)) {
                alert('请输入有效的数字');
                return;
            }
            
            // 添加一个空词语到新单元（这样新单元就会显示）
            this.pendingImportData.words.push({
                id: createId('word'),
                word: '',
                pinyin: '',
                unit: num,
                grade: this.pendingImportData.grade || '',
                semester: this.pendingImportData.semester || ''
            });
            
            // 重新显示预览
            this.showImportPreview(this.pendingImportData.words, this.pendingImportData.grade, this.pendingImportData.semester);
        },
        
        /**
         * 在单元后插入新单元
         */
        insertUnitAfter(afterUnit) {
            if (!this.pendingImportData) return;
            
            const afterUnitNum = parseInt(afterUnit);
            if (isNaN(afterUnitNum)) return;
            
            const newUnitNum = prompt(`请输入新单元的编号（将插入到单元 ${afterUnit} 之后）:`, afterUnitNum + 1);
            if (!newUnitNum) return;
            
            const num = parseInt(newUnitNum);
            if (isNaN(num)) {
                alert('请输入有效的数字');
                return;
            }
            
            // 添加一个空词语到新单元
            this.pendingImportData.words.push({
                id: createId('word'),
                word: '',
                pinyin: '',
                unit: num,
                grade: this.pendingImportData.grade || '',
                semester: this.pendingImportData.semester || ''
            });
            
            // 重新显示预览
            this.showImportPreview(this.pendingImportData.words, this.pendingImportData.grade, this.pendingImportData.semester);
        },
        
        /**
         * 从预览中删除词语
         */
        removeWordFromPreview(unit, index) {
            if (!this.pendingImportData) return;
            
            // 找到该单元的所有词语
            const unitWords = this.pendingImportData.words.filter(w => {
                const wUnit = w.unit != null ? String(w.unit) : '未分类';
                return wUnit === String(unit);
            });
            
            if (index >= 0 && index < unitWords.length) {
                const toRemove = unitWords[index];
                const globalIndex = this.pendingImportData.words.indexOf(toRemove);
                if (globalIndex >= 0) {
                    this.pendingImportData.words.splice(globalIndex, 1);
                    // 重新显示预览
                    this.showImportPreview(this.pendingImportData.words, this.pendingImportData.grade, this.pendingImportData.semester);
                }
            }
        },
        
        /**
         * 向单元添加词语
         */
        addWordToUnit(unit) {
            if (!this.pendingImportData) return;
            
            const unitNum = parseInt(unit) || 0;
            this.pendingImportData.words.push({
                id: createId('word'),
                word: '',
                pinyin: '',
                unit: unitNum,
                grade: this.pendingImportData.grade || '',
                semester: this.pendingImportData.semester || ''
            });
            
            // 重新显示预览
            this.showImportPreview(this.pendingImportData.words, this.pendingImportData.grade, this.pendingImportData.semester);
        },
        
        /**
         * 为词语自动生成拼音（如果为空）
         */
        autoFillPinyin(word) {
            if (!word || !word.word) return word;
            if (word.pinyin && word.pinyin.trim()) return word; // 已有拼音，不覆盖
            
            const autoPinyin = generatePinyin(word.word);
            if (autoPinyin) {
                word.pinyin = autoPinyin;
            }
            return word;
        },
        
        /**
         * 确认导入
         */
        confirmImport() {
            if (!this.pendingImportData) return;
            
            // 收集预览中编辑后的数据（只收集选中的词语，如果没有选中则收集所有）
            const editedWords = [];
            const selectedCheckboxes = Array.from(document.querySelectorAll('.word-select-checkbox:checked'));
            const itemsToProcess = selectedCheckboxes.length > 0 
                ? selectedCheckboxes.map(cb => {
                    const item = cb.closest('.word-item');
                    return item;
                }).filter(Boolean)
                : document.querySelectorAll('.word-item');
            
            itemsToProcess.forEach(item => {
                const wordInput = item.querySelector('[data-field="word"]');
                const unit = wordInput?.dataset.unit;
                
                if (wordInput && wordInput.value.trim()) {
                    const word = wordInput.value.trim();
                    // 自动生成拼音
                    const autoPinyin = generatePinyin(word);
                    editedWords.push({
                        id: createId('word'),
                        word: word,
                        pinyin: autoPinyin,
                        unit: unit ? parseInt(unit) : 0,
                        grade: this.pendingImportData.grade || '',
                        semester: this.pendingImportData.semester || ''
                    });
                }
            });
            
            if (editedWords.length === 0) {
                alert('没有有效的词语可以导入');
                return;
            }
            
            // 合并到现有数据
            const existing = new Map(this.data.map(item => [item.word + '|' + (item.unit != null ? item.unit : ''), item]));
            const newWords = [];
            
            editedWords.forEach(item => {
                if (!item.word) return;
                // 确保有拼音（如果没有则自动生成）
                if (!item.pinyin || !item.pinyin.trim()) {
                    item.pinyin = generatePinyin(item.word);
                }
                
                const key = item.word + '|' + (item.unit != null ? item.unit : '');
                const existingItem = existing.get(key);
                if (existingItem) {
                    // 更新现有词语（如果新词语有拼音，则更新；如果现有词语没有拼音，也自动生成）
                    if (item.pinyin) {
                        existingItem.pinyin = item.pinyin;
                    } else if (!existingItem.pinyin || !existingItem.pinyin.trim()) {
                        existingItem.pinyin = generatePinyin(existingItem.word);
                    }
                    if (item.unit != null) existingItem.unit = item.unit;
                } else {
                    // 添加新词语
                    newWords.push(item);
                }
            });
            
            this.data = [...this.data, ...newWords];
            Storage.saveWordBank(this.data);
            this.refresh();
            
            // 清空输入框（如果是文本导入）
            if (this.pendingImportData.source === 'text') {
                const textInput = document.getElementById('wordbank-text-input');
                if (textInput) textInput.value = '';
            }
            
            // 关闭模态框
            const modal = bootstrap.Modal.getInstance(document.getElementById('import-preview-modal'));
            if (modal) modal.hide();
            
            // 刷新练习范围选择器
            if (global.PracticeRange) {
                PracticeRange.init();
            }
            
            alert(`成功导入 ${editedWords.length} 个词语（新增 ${newWords.length} 个，更新 ${editedWords.length - newWords.length} 个）`);
            
            if (global.Debug && Debug.isDebugMode()) {
                Debug.log('success', `导入成功：${editedWords.length}个词语`, 'import', { 
                    new: newWords.length, 
                    updated: editedWords.length - newWords.length 
                });
            }
            
            // 清空待导入数据
            this.pendingImportData = null;
        }
    };

    global.WordBank = WordBank;
})(window);
