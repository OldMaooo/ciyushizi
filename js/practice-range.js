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
         * 渲染范围选择器
         */
        renderRangeSelector(container) {
            const wordBank = Storage.getWordBank();
            
            if (!wordBank || wordBank.length === 0) {
                container.innerHTML = '<div class="text-muted text-center py-3">暂无词语，请先导入词语库</div>';
                return;
            }
            
            // 按单元分组
            const grouped = this.groupWordsByUnit(wordBank);
            
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
            
            // 按单元显示
            const units = Object.keys(grouped).sort((a, b) => {
                // 尝试按数字排序，否则按字符串
                const aNum = parseInt(a);
                const bNum = parseInt(b);
                if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
                return a.localeCompare(b);
            });
            
            units.forEach(unit => {
                const words = grouped[unit];
                const unitId = (unit || '未分类').replace(/\s+/g, '-');
                const unitDisplayName = unit || '未分类';
                html += `
                    <div class="unit-item mb-2 d-flex align-items-center" data-unit-row="${unitId}">
                        <input type="checkbox" class="form-check-input unit-checkbox" 
                               data-unit="${unit || ''}" 
                               id="unit-${unitId}">
                        <label for="unit-${unitId}" class="form-check-label ms-2 flex-shrink-0">
                            ${unitDisplayName} (${words.length}个)
                        </label>
                        <span class="text-muted ms-2 small flex-grow-1 text-truncate" style="min-width: 0;">
                            ${words.map(w => w.word).join('、')}
                        </span>
                    </div>
                `;
            });
            
            html += '</div></div>'; // 关闭p-3和practice-range-selector
            container.innerHTML = html;
            
            // 默认全选
            this.selectAll(container);
        },
        
        /**
         * 按单元分组
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
                    this.updateSelectedCount(container);
                });
                
                // Shift键连续选择
                checkbox.addEventListener('click', (e) => {
                    if (e.shiftKey && this.lastClickedUnit) {
                        this.selectRange(container, this.lastClickedUnit, checkbox.dataset.unit);
                        e.preventDefault();
                    } else {
                        this.lastClickedUnit = checkbox.dataset.unit;
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
            container.querySelectorAll('.unit-checkbox').forEach(cb => {
                cb.checked = true;
            });
            this.updateSelectedCount(container);
        },
        
        /**
         * 全不选
         */
        deselectAll(container) {
            container.querySelectorAll('.unit-checkbox').forEach(cb => {
                cb.checked = false;
            });
            this.updateSelectedCount(container);
        },
        
        /**
         * Shift连续选择
         */
        selectRange(container, fromUnit, toUnit) {
            const allUnits = Array.from(container.querySelectorAll('.unit-checkbox'))
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
        },
        
        /**
         * 更新选中数量
         */
        updateSelectedCount(container) {
            const checkedUnits = container.querySelectorAll('.unit-checkbox:checked');
            const wordBank = Storage.getWordBank();
            const grouped = this.groupWordsByUnit(wordBank);
            
            let totalCount = 0;
            checkedUnits.forEach(checkbox => {
                const unit = checkbox.dataset.unit;
                if (grouped[unit]) {
                    totalCount += grouped[unit].length;
                }
            });
            
            const countEl = container.querySelector('[data-selected-count]');
            if (countEl) {
                countEl.textContent = `已选择: ${totalCount} 个词语`;
                countEl.className = totalCount > 0 ? 'ms-3 text-success fw-bold' : 'ms-3 text-muted';
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
            const grouped = this.groupWordsByUnit(wordBank);
            
            const selectedWords = [];
            
            checkedUnits.forEach(checkbox => {
                const unit = checkbox.dataset.unit;
                if (grouped[unit]) {
                    selectedWords.push(...grouped[unit]);
                }
            });
            
            return selectedWords;
        }
    };

    global.PracticeRange = PracticeRange;
})(window);

