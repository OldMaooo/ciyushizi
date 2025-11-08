(function (global) {
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
                        item.unit?.includes(keyword)
                    );
                });
            }
            this.renderTable();
        },

        renderTable() {
            const tbody = document.getElementById('wordbank-table-body');
            if (!tbody) return;
            if (!this.filtered.length) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="5" class="text-center text-muted py-5">
                            <i class="bi bi-inbox"></i> 暂无词语，请先导入
                        </td>
                    </tr>
                `;
                return;
            }

            tbody.innerHTML = this.filtered.map((item, index) => {
                const id = item.id || `word_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                const isSelected = this.selectedIds.has(id);
                return `
                    <tr data-id="${id}" data-index="${index}" class="${isSelected ? 'table-active' : ''}">
                        <td>
                            <input type="checkbox" class="form-check-input word-select-checkbox" data-id="${id}" ${isSelected ? 'checked' : ''} />
                        </td>
                        <td class="fw-semibold">${(item.word || '').trim() || '-'}</td>
                        <td>${(item.pinyin || '').trim() || '-'}</td>
                        <td>${(item.unit || '').trim() || '-'}</td>
                        <td class="text-end">
                            <button class="btn btn-sm btn-outline-danger" data-action="remove" onclick="WordBank.removeWord('${id}')">
                                <i class="bi bi-trash"></i>
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');

            // 绑定复选框事件
            tbody.querySelectorAll('.word-select-checkbox').forEach((checkbox) => {
                checkbox.addEventListener('change', (e) => {
                    const id = checkbox.dataset.id;
                    const row = checkbox.closest('tr');
                    const index = parseInt(row.dataset.index) || 0;
                    
                    if (e.shiftKey && this.lastSelectedIndex >= 0) {
                        // Shift批量选择
                        const start = Math.min(this.lastSelectedIndex, index);
                        const end = Math.max(this.lastSelectedIndex, index);
                        const rows = Array.from(tbody.querySelectorAll('tr[data-index]'));
                        for (let i = start; i <= end; i++) {
                            const row = rows[i];
                            if (row) {
                                const rowId = row.dataset.id;
                                const rowCheckbox = row.querySelector('.word-select-checkbox');
                                if (checkbox.checked) {
                                    this.selectedIds.add(rowId);
                                    if (rowCheckbox) rowCheckbox.checked = true;
                                    row.classList.add('table-active');
                                } else {
                                    this.selectedIds.delete(rowId);
                                    if (rowCheckbox) rowCheckbox.checked = false;
                                    row.classList.remove('table-active');
                                }
                            }
                        }
                    } else {
                        // 单个选择
                        if (checkbox.checked) {
                            this.selectedIds.add(id);
                            row.classList.add('table-active');
                        } else {
                            this.selectedIds.delete(id);
                            row.classList.remove('table-active');
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
                    Debug.log('info', '开始导入文本', 'import', { textLength: text.length, preview: text.substring(0, 100) });
                }
                
                const parsed = this.parseImport(text);
                
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
                
                // 合并到现有数据
                const existing = new Map(this.data.map(item => [item.word, item]));
                const newWords = [];
                parsed.forEach(item => {
                    if (!item.word) return;
                    const existingItem = existing.get(item.word);
                    if (existingItem) {
                        // 更新现有词语
                        if (item.pinyin) existingItem.pinyin = item.pinyin;
                        if (item.unit) existingItem.unit = item.unit;
                    } else {
                        // 添加新词语
                        newWords.push({
                            id: createId('word'),
                            word: item.word,
                            pinyin: item.pinyin || '',
                            unit: item.unit || ''
                        });
                    }
                });
                
                this.data = [...this.data, ...newWords];
                Storage.saveWordBank(this.data);
                this.refresh();
                textInput.value = '';
                alert(`成功导入 ${parsed.length} 个词语（新增 ${newWords.length} 个，更新 ${parsed.length - newWords.length} 个）`);
                
                if (global.Debug && Debug.isDebugMode()) {
                    Debug.log('success', `导入成功：${parsed.length}个词语`, 'import', { new: newWords.length, updated: parsed.length - newWords.length });
                }
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
                    // 合并到现有数据（去重）
                    const existing = Storage.getWordBank();
                    const existingMap = new Map(existing.map(item => [item.word + '|' + (item.unit || ''), item]));
                    let added = 0;
                    parsed.forEach(item => {
                        const key = item.word + '|' + (item.unit || '');
                        if (!existingMap.has(key)) {
                            existing.push(item);
                            existingMap.set(key, item);
                            added++;
                        }
                    });
                    this.data = existing;
                    this.filtered = [...this.data];
                    Storage.saveWordBank(this.data);
                    this.renderTable();
                    // 刷新练习范围选择器
                    if (global.PracticeRange) {
                        PracticeRange.init();
                    }
                    alert(`导入成功！新增 ${added} 条词语，共 ${this.data.length} 条`);
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

        parseImport(text) {
            try {
                const json = JSON.parse(text);
                // 支持「看拼音写词」的格式：{ wordBank: [...] }
                const wordsArray = json.wordBank || (Array.isArray(json) ? json : []);
                if (wordsArray.length > 0) {
                    return wordsArray
                        .map((item) => ({
                            id: item.id || createId('word'),
                            word: (item.word || '').trim(),
                            pinyin: (item.pinyin || '').trim(),
                            unit: (item.unit || '').trim()
                        }))
                        .filter(item => item.word);
                }
            } catch (err) {
                // 纯文本格式：支持多种格式
                const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
                let currentUnit = '';
                let lastNumericUnit = null; // 记录上一个数字单元
                const words = [];
                const unitPrefix = grade && semester ? `${grade}${semester}-` : ''; // 单元前缀
                
                lines.forEach((line, lineIndex) => {
                    const originalLine = line;
                    
                    // 单元标记：# 单元名 或 【单元名】
                    if (/^(#|【).+(】)?$/.test(line)) {
                        currentUnit = line.replace(/^[#【\s]+|[】\s]+$/g, '').trim();
                        // 尝试提取数字单元
                        const unitNum = parseInt(currentUnit);
                        if (!isNaN(unitNum)) {
                            lastNumericUnit = unitNum;
                            currentUnit = unitPrefix + String(unitNum);
                        } else {
                            currentUnit = unitPrefix + currentUnit;
                        }
                        if (global.Debug && Debug.isDebugMode()) {
                            Debug.log('info', `识别到单元标记: ${currentUnit}`, 'parse', { line: lineIndex + 1, originalLine });
                        }
                        return;
                    }
                    
                    // 处理"语文园地"：根据上一个数字单元，设置为X+1单元，然后跳过（不导入）
                    if (/^语文园地/.test(line)) {
                        if (lastNumericUnit !== null) {
                            // 转换为X+1单元，但不导入这行的词语
                            currentUnit = unitPrefix + String(lastNumericUnit + 1);
                            if (global.Debug && Debug.isDebugMode()) {
                                Debug.log('info', `识别到语文园地，转换为单元: ${currentUnit}，跳过导入`, 'parse', { line: lineIndex + 1, originalLine, lastNumericUnit });
                            }
                        } else {
                            // 如果没有上一个数字单元，跳过这行
                            if (global.Debug && Debug.isDebugMode()) {
                                Debug.log('warn', `语文园地前没有数字单元，跳过`, 'parse', { line: lineIndex + 1, originalLine });
                            }
                        }
                        return; // 跳过语文园地行，不导入
                    }
                    
                    // 数字开头的行（如 "25 手术台 阵地 战斗"），数字表示单元
                    const unitMatch = line.match(/^(\d+)\s+(.+)$/);
                    if (unitMatch) {
                        const unitNum = parseInt(unitMatch[1]);
                        currentUnit = unitPrefix + String(unitNum);
                        lastNumericUnit = unitNum;
                        line = unitMatch[2]; // 移除单元数字后的内容
                        if (global.Debug && Debug.isDebugMode()) {
                            Debug.log('info', `识别到数字单元: ${currentUnit}`, 'parse', { line: lineIndex + 1, originalLine, remainingLine: line });
                        }
                    }
                    
                    // 处理一行中的多个词语
                    // 支持多种分隔符：空格、逗号、顿号等
                    const separators = /[\s,，、；;]+/;
                    const parts = line.split(separators).filter(p => p.trim());
                    
                    if (global.Debug && Debug.isDebugMode() && parts.length > 1) {
                        Debug.log('info', `行${lineIndex + 1}分词结果`, 'parse', { 
                            originalLine, 
                            partsCount: parts.length, 
                            parts: parts 
                        });
                    }
                    
                    parts.forEach(part => {
                        part = part.trim();
                        if (!part) return;
                        
                        // 支持 "词语|拼音" 格式
                        if (part.includes('|')) {
                            const [wordPart, pinyinPart] = part.split('|').map(p => p?.trim() || '');
                            if (wordPart) {
                                words.push({
                                    id: createId('word'),
                                    word: wordPart,
                                    pinyin: pinyinPart,
                                    unit: currentUnit
                                });
                            }
                        } else {
                            // 纯词语，没有拼音
                            words.push({
                                id: createId('word'),
                                word: part,
                                pinyin: '',
                                unit: currentUnit
                            });
                        }
                    });
                });
                
                return words;
            }
            return [];
        }
    };

    global.WordBank = WordBank;
})(window);
