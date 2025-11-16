/**
 * 练习范围选择模块
 * 支持单选、多选、全选、按单元、shift连续选择
 */

(function (global) {
    const PracticeRange = {
        lastClickedUnit: null,

        /**
         * 初始化题库范围选择界面
         */
        init() {
            const container = document.getElementById('practice-range-container-home');
            if (!container) {
                console.warn('practice-range-container-home not found');
                return;
            }
            
            if (typeof Storage === 'undefined' || !Storage.getWordBank) {
                console.error('Storage未初始化，无法加载范围选择器');
                container.innerHTML = '<div class="text-danger">数据加载失败，请刷新页面</div>';
                return;
            }
            
            try {
                this.renderRangeSelector(container);
                this.bindEvents(container);
            } catch (error) {
                console.error('初始化范围选择器失败:', error);
                container.innerHTML = `<div class="text-danger">初始化失败: ${error.message}</div>`;
            }
        },
        
        /**
         * 渲染范围选择器（按X年级X册组织）
         */
        renderRangeSelector(container) {
            const wordBank = Storage.getWordBank();
            
            if (!wordBank || wordBank.length === 0) {
                container.innerHTML = '<div class="text-muted text-center py-3">暂无词语，请先导入词语库</div>';
                return;
            }
            
            // 按学期和单元分组（X年级X册）
            const grouped = this.groupWordsBySemesterUnit(wordBank);
            
            let html = '<div class="practice-range-selector">';
            
            // 全选/全不选按钮和只练错题开关（置顶）
            html += `
                <div class="practice-range-toolbar sticky-top bg-white border-bottom p-3 mb-0" style="z-index: 10;">
                    <div class="d-flex align-items-center gap-2 flex-wrap">
                        <button class="btn btn-sm btn-outline-primary" data-action="select-all">全选</button>
                        <button class="btn btn-sm btn-outline-secondary" data-action="deselect-all">全不选</button>
                        <div class="form-check form-switch m-0">
                            <input class="form-check-input" type="checkbox" id="practice-range-only-wrong-toggle" />
                            <label class="form-check-label" for="practice-range-only-wrong-toggle">只练错题</label>
                        </div>
                        <span class="ms-auto text-muted" data-selected-count>已选择: 0 个词语</span>
                    </div>
                </div>
                <div class="p-3">
            `;
            
            // 按学期显示（X年级X册），过滤掉"未分类"
            const semesters = Object.keys(grouped)
                .filter(semester => !semester.includes('未分类'))
                .sort((a, b) => {
                    // 提取年级和册数信息进行排序
                    // 支持格式：一年级上册、三年级下册等
                    const aMatch = a.match(/(\d+)年级([上下])册/) || a.match(/(\d+)年级([上下])学期/);
                    const bMatch = b.match(/(\d+)年级([上下])册/) || b.match(/(\d+)年级([上下])学期/);
                    if (aMatch && bMatch) {
                        const aGrade = parseInt(aMatch[1]);
                        const bGrade = parseInt(bMatch[1]);
                        if (aGrade !== bGrade) return aGrade - bGrade; // 年级从低到高
                        // 同年级，上册在前
                        return aMatch[2] === '上' ? -1 : 1;
                    }
                    // 如果没有匹配到数字，尝试按中文数字排序
                    const gradeNames = ['一', '二', '三', '四', '五', '六'];
                    const aGradeName = a.match(/([一二三四五六])年级/);
                    const bGradeName = b.match(/([一二三四五六])年级/);
                    if (aGradeName && bGradeName) {
                        const aIdx = gradeNames.indexOf(aGradeName[1]);
                        const bIdx = gradeNames.indexOf(bGradeName[1]);
                        if (aIdx !== -1 && bIdx !== -1 && aIdx !== bIdx) {
                            return aIdx - bIdx; // 年级从低到高
                        }
                        // 同年级，上册在前
                        const aSemester = a.includes('上册') ? 0 : 1;
                        const bSemester = b.includes('上册') ? 0 : 1;
                        return aSemester - bSemester;
                    }
                    return a.localeCompare(b);
                });
            
            // 使用Bootstrap Accordion实现展开收起
            html += `<div class="accordion" id="practice-range-accordion">`;
            semesters.forEach((semester, idx) => {
                // 生成唯一的学期ID（保留中文字符，只替换空格和特殊字符）
                const semesterId = semester.replace(/\s+/g, '-').replace(/[^\w\u4e00-\u9fa5-]/g, '');
                const collapseId = `collapse-${semesterId}`;
                const isFirst = idx === 0;
                
                html += `
                    <div class="accordion-item">
                        <h2 class="accordion-header" id="heading-${semesterId}">
                            <button class="accordion-button ${isFirst ? '' : 'collapsed'}" type="button" 
                                    data-semester-toggle="${semesterId}"
                                    aria-expanded="${isFirst ? 'true' : 'false'}" 
                                    aria-controls="${collapseId}">
                                <input type="checkbox" class="form-check-input semester-checkbox me-2" 
                                       data-semester="${semester}" 
                                       id="semester-${semesterId}"
                                       onclick="event.stopPropagation();">
                                <label for="semester-${semesterId}" class="form-check-label mb-0" onclick="event.stopPropagation();">
                                    ${semester}
                                </label>
                            </button>
                        </h2>
                        <div id="${collapseId}" 
                             class="accordion-collapse collapse ${isFirst ? 'show' : ''}" 
                             aria-labelledby="heading-${semesterId}">
                            <div class="accordion-body">
                `;
                
                // 按单元显示，过滤掉"未分类"
                const units = Object.keys(grouped[semester])
                    .filter(unit => unit !== '未分类')
                    .sort((a, b) => {
                        const aNum = parseInt(a);
                        const bNum = parseInt(b);
                        if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
                        return a.localeCompare(b);
                    });
                
                units.forEach(unit => {
                    const words = grouped[semester][unit];
                    const unitId = `${semester}-${unit}`.replace(/\s+/g, '-').replace(/[^\w-]/g, '');
                    html += `
                        <div class="unit-item mb-2 d-flex align-items-center" data-semester="${semester}" data-unit="${unit}" data-unit-row="${unitId}" style="cursor: pointer;">
                            <input type="checkbox" class="form-check-input unit-checkbox" 
                                   data-semester="${semester}" 
                                   data-unit="${unit}" 
                                   id="unit-${unitId}">
                            <label for="unit-${unitId}" class="form-check-label ms-2 flex-shrink-0">
                                第${unit}单元 (${words.length}个)
                            </label>
                            <span class="text-muted ms-2 small flex-grow-1 text-truncate" style="min-width: 0;">
                                ${words.slice(0, 5).map(w => w.word).join('、')}${words.length > 5 ? '...' : ''}
                            </span>
                        </div>
                    `;
                });
                
                html += `
                            </div>
                        </div>
                    </div>
                `;
            });
            html += `</div>`; // 关闭accordion
            
            html += '</div></div>'; // 关闭p-3和practice-range-selector
            container.innerHTML = html;
            
            // 恢复之前的选择状态
            this.restoreSelection(container);
            
            // 如果没有保存的选择，默认全选
            const savedSelection = this.getSavedSelection();
            if (!savedSelection || Object.keys(savedSelection).length === 0) {
                this.selectAll(container);
            }
        },
        
        /**
         * 按学期和单元分组（X年级X册）
         */
        groupWordsBySemesterUnit(wordBank) {
            const grouped = {};
            
            wordBank.forEach(word => {
                // 构建学期标识：X年级X册
                const grade = word.grade || '未分类';
                const semester = word.semester || '未分类';
                const semesterKey = `${grade}${semester}`;
                
                // unit 可能是整数、字符串或空字符串
                let unit = '未分类';
                if (word.unit != null && word.unit !== '') {
                    unit = String(word.unit);
                } else if (word.unit === '') {
                    unit = '未分类';
                }
                
                if (!grouped[semesterKey]) {
                    grouped[semesterKey] = {};
                }
                if (!grouped[semesterKey][unit]) {
                    grouped[semesterKey][unit] = [];
                }
                
                grouped[semesterKey][unit].push(word);
            });
            
            return grouped;
        },
        
        /**
         * 按单元分组（保留用于兼容）
         */
        groupWordsByUnit(wordBank) {
            const grouped = {};
            
            wordBank.forEach(word => {
                // unit 可能是整数、字符串或空字符串
                let unit = '未分类';
                if (word.unit != null && word.unit !== '') {
                    unit = String(word.unit);
                } else if (word.unit === '') {
                    unit = '未分类';
                }
                
                if (!grouped[unit]) {
                    grouped[unit] = [];
                }
                
                grouped[unit].push(word);
            });
            
            return grouped;
        },
        
        /**
         * 绑定事件
         */
        bindEvents(container) {
            // 全选/全不选
            container.querySelectorAll('[data-action="select-all"]').forEach(btn => {
                btn.addEventListener('click', () => this.selectAll(container));
            });
            
            container.querySelectorAll('[data-action="deselect-all"]').forEach(btn => {
                btn.addEventListener('click', () => this.deselectAll(container));
            });
            
            // 学期展开/收起按钮（独立控制，不使用Bootstrap的accordion行为）
            container.querySelectorAll('[data-semester-toggle]').forEach(btn => {
                // 移除旧的事件监听器（如果存在）
                const newBtn = btn.cloneNode(true);
                btn.parentNode.replaceChild(newBtn, btn);
                
                newBtn.addEventListener('click', (e) => {
                    // 如果点击的是复选框或标签，不处理
                    if (e.target.closest('.semester-checkbox') || e.target.closest('label')) {
                        return;
                    }
                    
                    e.preventDefault();
                    e.stopPropagation();
                    
                    const semesterId = newBtn.dataset.semesterToggle;
                    const collapseId = `collapse-${semesterId}`;
                    const collapseEl = document.getElementById(collapseId);
                    
                    if (collapseEl) {
                        const isExpanded = newBtn.getAttribute('aria-expanded') === 'true';
                        
                        if (isExpanded) {
                            // 收起
                            collapseEl.classList.remove('show');
                            newBtn.classList.add('collapsed');
                            newBtn.setAttribute('aria-expanded', 'false');
                        } else {
                            // 展开
                            collapseEl.classList.add('show');
                            newBtn.classList.remove('collapsed');
                            newBtn.setAttribute('aria-expanded', 'true');
                        }
                    }
                });
            });
            
            // 学期复选框（阻止事件冒泡，避免触发accordion折叠）
            container.querySelectorAll('.semester-checkbox').forEach(checkbox => {
                checkbox.addEventListener('change', (e) => {
                    e.stopPropagation();
                    const semester = e.target.dataset.semester;
                    const unitCheckboxes = container.querySelectorAll(`.unit-checkbox[data-semester="${semester}"]`);
                    unitCheckboxes.forEach(cb => {
                        cb.checked = e.target.checked;
                    });
                    this.updateSelectedCount(container);
                    // 保存选择状态
                    this.saveSelection(container);
                });
                checkbox.addEventListener('click', (e) => {
                    e.stopPropagation();
                });
            });
            
            // 单元复选框和整行点击
            container.querySelectorAll('.unit-item').forEach(item => {
                const checkbox = item.querySelector('.unit-checkbox');
                if (!checkbox) return;
                
                // 整行点击切换
                item.addEventListener('click', (e) => {
                    // 如果点击的是复选框本身，不处理（让默认行为处理）
                    if (e.target === checkbox || e.target.closest('.form-check-input')) {
                        return;
                    }
                    // 点击整行，切换复选框状态
                    checkbox.checked = !checkbox.checked;
                    checkbox.dispatchEvent(new Event('change'));
                });
                
                checkbox.addEventListener('change', () => {
                    // 更新学期复选框状态
                    const semester = checkbox.dataset.semester;
                    if (semester) {
                        const semesterCheckbox = container.querySelector(`.semester-checkbox[data-semester="${semester}"]`);
                        if (semesterCheckbox) {
                            const unitCheckboxes = container.querySelectorAll(`.unit-checkbox[data-semester="${semester}"]`);
                            const allChecked = Array.from(unitCheckboxes).every(cb => cb.checked);
                            const someChecked = Array.from(unitCheckboxes).some(cb => cb.checked);
                            semesterCheckbox.checked = allChecked;
                            semesterCheckbox.indeterminate = someChecked && !allChecked;
                        }
                    }
                    this.updateSelectedCount(container);
                    // 保存选择状态
                    this.saveSelection(container);
                });
                
                // Shift键连续选择
                checkbox.addEventListener('click', (e) => {
                    if (e.shiftKey && this.lastClickedUnit) {
                        const lastSemester = this.lastClickedUnit.semester;
                        const currentSemester = checkbox.dataset.semester;
                        // 只在同一学期内支持连续选择
                        if (lastSemester === currentSemester) {
                            this.selectRange(container, this.lastClickedUnit.unit, checkbox.dataset.unit, currentSemester);
                            e.preventDefault();
                        }
                    } else {
                        this.lastClickedUnit = {
                            semester: checkbox.dataset.semester,
                            unit: checkbox.dataset.unit
                        };
                    }
                });
            });
            
            // 更新选中数量
            this.updateSelectedCount(container);
        },
        
        /**
         * 全选
         */
        selectAll(container) {
            container.querySelectorAll('.unit-checkbox, .semester-checkbox').forEach(cb => {
                cb.checked = true;
                cb.indeterminate = false;
            });
            this.updateSelectedCount(container);
            // 保存选择状态
            this.saveSelection(container);
        },
        
        /**
         * 全不选
         */
        deselectAll(container) {
            container.querySelectorAll('.unit-checkbox, .semester-checkbox').forEach(cb => {
                cb.checked = false;
                cb.indeterminate = false;
            });
            this.updateSelectedCount(container);
            // 保存选择状态
            this.saveSelection(container);
        },
        
        /**
         * Shift连续选择（同一学期内）
         */
        selectRange(container, fromUnit, toUnit, semester) {
            const allUnits = Array.from(container.querySelectorAll(`.unit-checkbox[data-semester="${semester}"]`))
                .map(cb => ({
                    element: cb,
                    unit: cb.dataset.unit
                }));
            
            // 排序
            allUnits.sort((a, b) => {
                const aNum = parseInt(a.unit);
                const bNum = parseInt(b.unit);
                if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
                return a.unit.localeCompare(b.unit);
            });
            
            // 找到起止位置
            const fromIndex = allUnits.findIndex(u => u.unit === fromUnit);
            const toIndex = allUnits.findIndex(u => u.unit === toUnit);
            
            if (fromIndex === -1 || toIndex === -1) return;
            
            // 选择范围内的所有单元
            const start = Math.min(fromIndex, toIndex);
            const end = Math.max(fromIndex, toIndex);
            
            for (let i = start; i <= end; i++) {
                allUnits[i].element.checked = true;
            }
            
            this.updateSelectedCount(container);
            // 保存选择状态
            this.saveSelection(container);
        },
        
        /**
         * 更新选中数量
         */
        updateSelectedCount(container) {
            const checkedUnits = container.querySelectorAll('.unit-checkbox:checked');
            const wordBank = Storage.getWordBank();
            const grouped = this.groupWordsBySemesterUnit(wordBank);
            
            let totalCount = 0;
            checkedUnits.forEach(checkbox => {
                const semester = checkbox.dataset.semester;
                const unit = checkbox.dataset.unit;
                if (grouped[semester] && grouped[semester][unit]) {
                    totalCount += grouped[semester][unit].length;
                }
            });
            
            const countEl = container.querySelector('[data-selected-count]');
            if (countEl) {
                countEl.textContent = `已选择: ${totalCount} 个词语`;
                countEl.className = totalCount > 0 ? 'ms-auto text-success fw-bold' : 'ms-auto text-muted fw-bold';
                countEl.style.fontSize = '1.1rem';
                countEl.style.textAlign = 'right';
                countEl.dataset.selectedCount = totalCount; // 存储选中数量，供动态按钮使用
            }
            
            // 更新动态题目数量按钮
            this.updateDynamicCountButton(totalCount);
        },
        
        /**
         * 更新动态题目数量按钮
         */
        updateDynamicCountButton(count) {
            // 移除旧的动态按钮
            const oldBtn = document.getElementById('word-count-quick-dynamic');
            if (oldBtn) {
                oldBtn.remove();
            }
            
            // 如果数量为0，不显示按钮
            if (count === 0) return;
            
            // 查找最后一个快捷按钮（50的按钮）
            const quickButtons = document.querySelectorAll('.word-count-quick');
            if (quickButtons.length === 0) return;
            
            const lastButton = quickButtons[quickButtons.length - 1];
            const dynamicBtn = document.createElement('button');
            dynamicBtn.type = 'button';
            dynamicBtn.className = 'btn btn-sm btn-outline-primary word-count-quick';
            dynamicBtn.id = 'word-count-quick-dynamic';
            dynamicBtn.dataset.value = count;
            dynamicBtn.textContent = count;
            dynamicBtn.title = `使用已选择的 ${count} 个词语`;
            
            // 插入到最后一个按钮后面
            lastButton.parentNode.insertBefore(dynamicBtn, lastButton.nextSibling);
            
            // 绑定点击事件
            dynamicBtn.addEventListener('click', () => {
                const input = document.getElementById('word-count-input-home');
                if (input) {
                    input.value = count;
                    input.focus();
                }
                // 同步到弹窗
                if (typeof Main !== 'undefined' && Main.syncSettingsToModal) {
                    Main.syncSettingsToModal();
                }
            });
        },
        
        /**
         * 获取选中的词语
         */
        getSelectedWords(containerId) {
            const container = containerId ? document.getElementById(containerId) : document.getElementById('practice-range-container-home');
            if (!container) return [];
            
            const checkedUnits = container.querySelectorAll('.unit-checkbox:checked');
            const wordBank = Storage.getWordBank();
            const grouped = this.groupWordsBySemesterUnit(wordBank);
            
            const selectedWords = [];
            
            checkedUnits.forEach(checkbox => {
                const semester = checkbox.dataset.semester;
                const unit = checkbox.dataset.unit;
                if (grouped[semester] && grouped[semester][unit]) {
                    selectedWords.push(...grouped[semester][unit]);
                }
            });
            
            return selectedWords;
        },
        
        /**
         * 保存选择状态到localStorage
         */
        saveSelection(container) {
            try {
                const selection = {};
                const checkedUnits = container.querySelectorAll('.unit-checkbox:checked');
                checkedUnits.forEach(checkbox => {
                    const semester = checkbox.dataset.semester;
                    const unit = checkbox.dataset.unit;
                    if (semester && unit) {
                        if (!selection[semester]) {
                            selection[semester] = [];
                        }
                        selection[semester].push(unit);
                    }
                });
                localStorage.setItem('practiceRangeSelection', JSON.stringify(selection));
            } catch (err) {
                console.warn('保存练习范围选择失败:', err);
            }
        },
        
        /**
         * 从localStorage恢复选择状态
         */
        restoreSelection(container) {
            try {
                const saved = this.getSavedSelection();
                if (!saved || Object.keys(saved).length === 0) {
                    return;
                }
                
                // 恢复单元选择
                Object.keys(saved).forEach(semester => {
                    const units = saved[semester];
                    if (Array.isArray(units)) {
                        units.forEach(unit => {
                            const checkbox = container.querySelector(
                                `.unit-checkbox[data-semester="${semester}"][data-unit="${unit}"]`
                            );
                            if (checkbox) {
                                checkbox.checked = true;
                            }
                        });
                    }
                });
                
                // 更新学期复选框状态
                const allSemesters = new Set();
                container.querySelectorAll('.unit-checkbox').forEach(cb => {
                    allSemesters.add(cb.dataset.semester);
                });
                
                allSemesters.forEach(semester => {
                    const semesterCheckbox = container.querySelector(`.semester-checkbox[data-semester="${semester}"]`);
                    if (semesterCheckbox) {
                        const unitCheckboxes = container.querySelectorAll(`.unit-checkbox[data-semester="${semester}"]`);
                        const allChecked = Array.from(unitCheckboxes).every(cb => cb.checked);
                        const someChecked = Array.from(unitCheckboxes).some(cb => cb.checked);
                        semesterCheckbox.checked = allChecked;
                        semesterCheckbox.indeterminate = someChecked && !allChecked;
                    }
                });
                
                this.updateSelectedCount(container);
            } catch (err) {
                console.warn('恢复练习范围选择失败:', err);
            }
        },
        
        /**
         * 获取保存的选择状态
         */
        getSavedSelection() {
            try {
                const saved = localStorage.getItem('practiceRangeSelection');
                return saved ? JSON.parse(saved) : {};
            } catch (err) {
                console.warn('读取练习范围选择失败:', err);
                return {};
            }
        }
    };

    global.PracticeRange = PracticeRange;
})(window);

