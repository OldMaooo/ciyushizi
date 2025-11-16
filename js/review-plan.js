/**
 * 复习计划模块
 * 基于艾宾浩斯遗忘曲线的复习计划管理
 */

(function (global) {
    // 艾宾浩斯曲线时间节点（小时）
    const REVIEW_INTERVALS = [1, 24, 72, 168, 336, 720]; // 1小时、1天、3天、1周、2周、1个月
    
    // 周期名称映射
    const STAGE_NAMES = ['1小时', '1天', '3天', '1周', '2周', '1个月'];

    /**
     * 计算复习时间点
     * @param {string} firstMarkedAt - 首次标记时间（ISO字符串）
     * @returns {Array} 复习时间点数组
     */
    function calculateReviewSchedule(firstMarkedAt) {
        const firstDate = new Date(firstMarkedAt);
        return REVIEW_INTERVALS.map((hours, index) => {
            const scheduledAt = new Date(firstDate.getTime() + hours * 60 * 60 * 1000);
            return {
                stage: index + 1,
                scheduledAt: scheduledAt.toISOString(),
                completedAt: null,
                status: 'pending' // pending, completed, overdue
            };
        });
    }

    /**
     * 获取图形化进度显示
     * @param {Object} plan - 复习计划对象
     * @returns {string} 图形化字符串（●表示已完成，○表示待完成）
     */
    function getProgressVisualization(plan) {
        if (!plan || !plan.stages) return '○○○○○○';
        const totalStages = plan.stages.length;
        const completedStages = plan.stages.filter(s => s.status === 'completed').length;
        const result = [];
        for (let i = 0; i < totalStages; i++) {
            result.push(i < completedStages ? '●' : '○');
        }
        return result.join('');
    }

    /**
     * 更新复习计划状态
     */
    function updateReviewPlanStatus(plan) {
        if (!plan || !plan.stages) return plan;
        
        const now = new Date();
        plan.stages.forEach(stage => {
            const scheduledDate = new Date(stage.scheduledAt);
            if (stage.completedAt) {
                stage.status = 'completed';
            } else if (scheduledDate < now) {
                stage.status = 'overdue';
            } else {
                stage.status = 'pending';
            }
        });

        // 计算当前应该复习的阶段
        const currentStage = plan.stages.find(s => 
            s.status === 'pending' || s.status === 'overdue'
        );
        plan.currentStage = currentStage ? currentStage.stage : plan.stages.length + 1;

        // 检查是否已掌握（所有阶段完成）
        plan.mastered = plan.stages.every(s => s.status === 'completed');

        return plan;
    }

    const ReviewPlan = {
        /**
         * 为错题创建复习计划
         * @param {Object} errorWord - 错题对象
         */
        createPlanForErrorWord(errorWord) {
            if (!errorWord || !errorWord.wordId) return null;

            // 检查是否已有计划
            const existing = Storage.getReviewPlan(errorWord.wordId);
            if (existing) {
                return existing;
            }

            const plan = {
                wordId: errorWord.wordId,
                word: errorWord.word,
                pinyin: errorWord.pinyin,
                unit: errorWord.unit,
                firstMarkedAt: errorWord.markedAt || new Date().toISOString(),
                stages: calculateReviewSchedule(errorWord.markedAt || new Date().toISOString()),
                currentStage: 1,
                mastered: false,
                // 本轮状态
                currentRoundPracticeCompleted: false,
                currentRoundTestCompleted: false,
                currentRoundTestDate: null
            };

            const updatedPlan = updateReviewPlanStatus(plan);
            Storage.saveReviewPlan(updatedPlan);
            return updatedPlan;
        },

        /**
         * 批量为错题创建复习计划
         * @param {Array} errorWords - 错题数组
         */
        createPlansForErrorWords(errorWords) {
            if (!Array.isArray(errorWords)) return;
            errorWords.forEach(word => {
                this.createPlanForErrorWord(word);
            });
        },

        /**
         * 获取所有复习计划
         * @returns {Array} 复习计划数组
         */
        getAllPlans() {
            return Storage.getReviewPlans().map(plan => updateReviewPlanStatus(plan));
        },

        /**
         * 获取待复习的计划（今日待复习、即将到期、已逾期）
         * @returns {Object} 分类后的计划对象
         */
        getPlansByStatus() {
            const allPlans = this.getAllPlans();
            const now = new Date();
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
            const dayAfterTomorrow = new Date(today.getTime() + 48 * 60 * 60 * 1000);

            const result = {
                today: [],      // 今日待复习
                upcoming: [],   // 即将到期（1-2天内）
                overdue: [],    // 已逾期
                future: []      // 未来计划
            };

            allPlans.forEach(plan => {
                if (plan.mastered) return; // 已掌握的跳过

                const currentStage = plan.stages.find(s => s.stage === plan.currentStage);
                if (!currentStage) {
                    result.future.push(plan);
                    return;
                }

                const scheduledDate = new Date(currentStage.scheduledAt);
                
                if (currentStage.status === 'completed') {
                    // 如果当前阶段已完成，检查下一阶段
                    const nextStage = plan.stages.find(s => s.stage === plan.currentStage + 1);
                    if (nextStage) {
                        const nextDate = new Date(nextStage.scheduledAt);
                        if (nextDate <= today) {
                            result.today.push(plan);
                        } else if (nextDate <= dayAfterTomorrow) {
                            result.upcoming.push(plan);
                        } else {
                            result.future.push(plan);
                        }
                    } else {
                        result.future.push(plan);
                    }
                } else if (currentStage.status === 'overdue') {
                    result.overdue.push(plan);
                } else if (scheduledDate <= today) {
                    result.today.push(plan);
                } else if (scheduledDate <= dayAfterTomorrow) {
                    result.upcoming.push(plan);
                } else {
                    result.future.push(plan);
                }
            });

            return result;
        },

        /**
         * 完成复习阶段的练习
         * @param {string} wordId - 词语ID
         * @param {number} stage - 阶段号
         */
        completePractice(wordId, stage) {
            const plan = Storage.getReviewPlan(wordId);
            if (!plan) return;

            const stageObj = plan.stages.find(s => s.stage === stage);
            if (stageObj) {
                plan.currentRoundPracticeCompleted = true;
                Storage.saveReviewPlan(plan);
            }
        },

        /**
         * 完成复习阶段的测试
         * @param {string} wordId - 词语ID
         * @param {number} stage - 阶段号
         * @param {boolean} passed - 是否通过测试
         */
        completeTest(wordId, stage, passed) {
            const plan = Storage.getReviewPlan(wordId);
            if (!plan) return;

            const stageObj = plan.stages.find(s => s.stage === stage);
            if (stageObj) {
                if (passed) {
                    stageObj.completedAt = new Date().toISOString();
                    stageObj.status = 'completed';
                    plan.currentRoundTestCompleted = true;
                    plan.currentRoundTestDate = new Date().toISOString();
                    
                    // 如果所有阶段都完成，标记为已掌握
                    const updatedPlan = updateReviewPlanStatus(plan);
                    if (updatedPlan.mastered) {
                        // 已掌握，从汇总题库中删除
                        if (typeof Storage !== 'undefined') {
                            Storage.removeFromSummaryErrorWords(wordId);
                        }
                    }
                } else {
                    // 测试未通过，标记为未通过状态
                    plan.currentRoundTestCompleted = false;
                    plan.currentRoundTestDate = new Date().toISOString();
                    // 根据需求：只有当最后一次仍然为错时才需要计入新的复习周期
                    // 这里先不重新计算，保持原计划，但标记为未通过
                }
                Storage.saveReviewPlan(plan);
            }
        },

        /**
         * 获取当前阶段需要复习的词语
         * @param {string} wordId - 词语ID（可选，如果提供则返回单个，否则返回所有）
         * @returns {Array|Object} 需要复习的词语数组或单个对象
         */
        getWordsForCurrentStage(wordId) {
            const plans = this.getAllPlans();
            const words = [];
            
            plans.forEach(plan => {
                if (plan.mastered) return;
                if (wordId && plan.wordId !== wordId) return;

                const currentStage = plan.stages.find(s => s.stage === plan.currentStage);
                if (currentStage && (currentStage.status === 'pending' || currentStage.status === 'overdue')) {
                    words.push({
                        id: plan.wordId,
                        word: plan.word,
                        pinyin: plan.pinyin,
                        unit: plan.unit,
                        reviewPlan: plan
                    });
                }
            });

            return wordId ? words[0] : words;
        },

        /**
         * 渲染复习计划页面（按周期组织，最近的周期在最上面）
         */
        render() {
            const container = document.getElementById('errorbook-review-content');
            if (!container) return;

            const allPlans = this.getAllPlans().filter(plan => !plan.mastered);
            
            if (allPlans.length === 0) {
                container.innerHTML = '<div class="text-muted text-center py-4">暂无复习计划</div>';
                return;
            }

            // 按周期分组：以当前阶段为周期
            const plansByStage = {};
            allPlans.forEach(plan => {
                const stage = plan.currentStage || 1;
                if (!plansByStage[stage]) {
                    plansByStage[stage] = [];
                }
                plansByStage[stage].push(plan);
            });

            // 按周期排序：最近的周期（阶段号小的）在最上面
            const sortedStages = Object.keys(plansByStage).sort((a, b) => parseInt(a) - parseInt(b));

            let html = '';
            sortedStages.forEach(stage => {
                const plans = plansByStage[stage];
                // 按首次标记时间排序，最新的在最上面
                plans.sort((a, b) => {
                    const aTime = new Date(a.firstMarkedAt || 0).getTime();
                    const bTime = new Date(b.firstMarkedAt || 0).getTime();
                    return bTime - aTime;
                });
                
                html += this.renderPlanGroupByStage(parseInt(stage), plans);
            });

            container.innerHTML = html;
            this.bindReviewPlanEvents();
        },

        /**
         * 渲染一组复习计划（按周期）
         */
        renderPlanGroupByStage(stage, plans) {
            let html = `<div class="mb-4">
                <h6 class="mb-3">
                    <span class="badge bg-primary">第${stage}次复习周期</span>
                    <span class="text-muted small ms-2">(${plans.length}个)</span>
                </h6>
                <div class="d-flex flex-wrap gap-3" style="padding-bottom: 20px;">`;

            plans.forEach(plan => {
                const currentStageObj = plan.stages.find(s => s.stage === plan.currentStage);
                const scheduledDate = currentStageObj ? new Date(currentStageObj.scheduledAt) : null;
                const now = new Date();
                const canTest = scheduledDate && scheduledDate <= now; // 是否到了测试时间
                
                // 生成进度圆圈HTML（带tooltip）
                const progressCircles = this.renderProgressCircles(plan);
                
                // 使用CardComponent渲染卡片（参考汇总查看的练习模式）
                const cardHTML = CardComponent.render({
                    word: plan.word || '',
                    pinyin: plan.pinyin || '',
                    showPinyin: false, // 默认隐藏，点击后显示
                    markedWrong: false,
                    dataWordId: plan.wordId,
                    dataPinyin: plan.pinyin || '',
                    additionalClasses: 'review-plan-card',
                    extraHtml: `
                        <div class="review-plan-progress mt-2" style="display: flex; align-items: center; justify-content: center; gap: 4px; flex-wrap: wrap;">
                            ${progressCircles}
                        </div>
                    `
                });
                
                html += `<div style="position: relative;">${cardHTML}</div>`;
            });

            html += '</div></div>';
            return html;
        },

        /**
         * 渲染进度圆圈（带tooltip）
         */
        renderProgressCircles(plan) {
            if (!plan || !plan.stages) return '';
            
            let html = '';
            plan.stages.forEach((stage, idx) => {
                const isCompleted = stage.status === 'completed';
                const isCurrent = stage.stage === plan.currentStage;
                const scheduledDate = new Date(stage.scheduledAt);
                const completedDate = stage.completedAt ? new Date(stage.completedAt) : null;
                
                // 圆圈颜色：通过的绿色实心，未通过的红色实心，待完成的灰色
                let circleColor = '#6c757d'; // gray
                let circleClass = 'review-circle-pending';
                let tooltipText = '';
                
                const stageIndex = stage.stage - 1;
                const stageName = STAGE_NAMES[stageIndex] || `第${stage.stage}周期`;
                const dateStr = scheduledDate.toISOString().split('T')[0];
                
                if (isCompleted) {
                    circleColor = '#28a745'; // green
                    circleClass = 'review-circle-completed';
                    const completedDateStr = completedDate.toISOString().split('T')[0];
                    tooltipText = `${stage.stage}/${plan.stages.length} ${stageName} ${completedDateStr}`;
                } else if (isCurrent) {
                    // 检查当前周期是否测试失败（未通过）
                    if (plan.currentRoundTestCompleted === false && plan.currentRoundTestDate) {
                        // 测试未通过，显示红色
                        circleColor = '#dc3545'; // red
                        circleClass = 'review-circle-failed';
                        tooltipText = `${stage.stage}/${plan.stages.length} ${stageName} ${dateStr}`;
                    } else {
                        // 进行中，显示橙色
                        circleColor = '#ffc107'; // orange
                        circleClass = 'review-circle-current';
                        tooltipText = `${stage.stage}/${plan.stages.length} ${stageName} ${dateStr}`;
                    }
                } else {
                    circleColor = '#6c757d'; // gray
                    circleClass = 'review-circle-pending';
                    tooltipText = `${stage.stage}/${plan.stages.length} ${stageName} ${dateStr}`;
                }
                
                html += `
                    <span class="review-progress-circle ${circleClass}" 
                          style="width: 12px; height: 12px; border-radius: 50%; background-color: ${circleColor}; display: inline-block; cursor: help;"
                          data-bs-toggle="tooltip" 
                          data-bs-placement="top"
                          title="${tooltipText}">
                    </span>
                `;
            });
            
            return html;
        },

        /**
         * 当前显示的月份（用于日历视图）
         */
        currentCalendarMonth: new Date().getMonth(),
        currentCalendarYear: new Date().getFullYear(),
        
        /**
         * 存储当前日历的日期计划数据（用于事件处理）
         */
        currentCalendarDatesWithPlans: null,
        
        /**
         * 渲染日历视图（下拉面板）
         */
        renderCalendar() {
            const container = document.getElementById('calendar-dropdown-content');
            if (!container) return;
            
            const allPlans = this.getAllPlans().filter(plan => !plan.mastered);
            
            // 收集所有有复习计划的日期
            const datesWithPlans = new Map(); // key: date string (YYYY-MM-DD), value: array of {plan, stage}
            allPlans.forEach(plan => {
                plan.stages.forEach(stage => {
                    if (stage.status === 'pending' || stage.status === 'overdue') {
                        const scheduledDate = new Date(stage.scheduledAt);
                        const dateKey = scheduledDate.toISOString().split('T')[0];
                        if (!datesWithPlans.has(dateKey)) {
                            datesWithPlans.set(dateKey, []);
                        }
                        datesWithPlans.get(dateKey).push({
                            plan: plan,
                            stage: stage
                        });
                    }
                });
            });
            
            // 保存到实例变量，供事件处理使用
            this.currentCalendarDatesWithPlans = datesWithPlans;
            
            // 生成日历（当前显示的月份）
            const currentYear = this.currentCalendarYear;
            const currentMonth = this.currentCalendarMonth;
            const firstDay = new Date(currentYear, currentMonth, 1);
            const lastDay = new Date(currentYear, currentMonth + 1, 0);
            const daysInMonth = lastDay.getDate();
            const startDayOfWeek = firstDay.getDay(); // 0 = Sunday
            
            // 更新月份标题
            const monthTitleEl = document.getElementById('calendar-month-title');
            if (monthTitleEl) {
                monthTitleEl.textContent = `${currentYear}年${currentMonth + 1}月`;
            }
            
            let html = `
                <div class="calendar-grid-small">
                    <div class="calendar-weekdays d-flex">
                        <div class="calendar-weekday">日</div>
                        <div class="calendar-weekday">一</div>
                        <div class="calendar-weekday">二</div>
                        <div class="calendar-weekday">三</div>
                        <div class="calendar-weekday">四</div>
                        <div class="calendar-weekday">五</div>
                        <div class="calendar-weekday">六</div>
                    </div>
                    <div class="calendar-days d-flex flex-wrap">
            `;
            
            // 填充空白（上个月的日期）
            for (let i = 0; i < startDayOfWeek; i++) {
                html += '<div class="calendar-day empty"></div>';
            }
            
            // 填充当前月的日期
            const today = new Date();
            const todayKey = today.toISOString().split('T')[0];
            
            for (let day = 1; day <= daysInMonth; day++) {
                const date = new Date(currentYear, currentMonth, day);
                const dateKey = date.toISOString().split('T')[0];
                const plansForDate = datesWithPlans.get(dateKey) || [];
                const hasPlans = plansForDate.length > 0;
                const isToday = dateKey === todayKey;
                
                // 生成tooltip文本（如果有计划）
                let tooltipText = '';
                if (hasPlans) {
                    const tooltips = plansForDate.map(({ plan, stage }) => {
                        const stageIndex = stage.stage - 1;
                        const stageName = STAGE_NAMES[stageIndex] || `第${stage.stage}周期`;
                        const scheduledDate = new Date(stage.scheduledAt);
                        const dateStr = scheduledDate.toISOString().split('T')[0];
                        return `${stage.stage}/${plan.stages.length} ${stageName} ${dateStr}`;
                    });
                    tooltipText = tooltips.join('\\n');
                }
                
                html += `
                    <div class="calendar-day ${hasPlans ? 'has-plans' : ''} ${isToday ? 'today' : ''} ${hasPlans ? 'clickable' : ''}" 
                         data-date="${dateKey}"
                         ${hasPlans ? `data-bs-toggle="tooltip" data-bs-placement="top" title="${tooltipText.replace(/"/g, '&quot;')}" style="cursor: pointer;"` : ''}>
                        <div class="day-number">${day}</div>
                        ${hasPlans ? '<div class="plan-dot"></div>' : ''}
                    </div>
                `;
            }
            
            html += `
                    </div>
                </div>
            `;
            
            container.innerHTML = html;
            
            // 绑定日历事件（使用事件委托）
            this.bindCalendarEvents();
        },
        
        /**
         * 绑定日历事件（使用事件委托）
         */
        bindCalendarEvents() {
            const calendarContainer = document.getElementById('calendar-dropdown-content');
            if (!calendarContainer) return;
            
            // 移除旧的事件监听器（如果存在）
            if (this._calendarClickHandler) {
                calendarContainer.removeEventListener('click', this._calendarClickHandler);
            }
            
            // 创建新的事件处理器
            this._calendarClickHandler = (e) => {
                // 检查点击的是否是日期元素或其子元素
                let dayEl = e.target.closest('.calendar-day.has-plans');
                
                // 如果点击的是.day-number或.plan-dot，需要找到父元素
                if (!dayEl && (e.target.classList.contains('day-number') || e.target.classList.contains('plan-dot'))) {
                    dayEl = e.target.closest('.calendar-day');
                }
                
                if (dayEl && dayEl.classList.contains('has-plans')) {
                    e.preventDefault();
                    e.stopPropagation();
                    const dateKey = dayEl.dataset.date;
                    console.log('日历点击事件触发:', { dateKey, hasPlans: !!this.currentCalendarDatesWithPlans });
                    
                    if (dateKey && this.currentCalendarDatesWithPlans) {
                        const plansForDate = this.currentCalendarDatesWithPlans.get(dateKey) || [];
                        console.log('点击日期:', dateKey, '计划数量:', plansForDate.length);
                        if (plansForDate.length > 0) {
                            this.showPlansForDate(dateKey, plansForDate);
                        } else {
                            alert('该日期没有复习计划');
                        }
                    } else {
                        console.error('日期点击失败:', { 
                            dateKey, 
                            hasPlans: !!this.currentCalendarDatesWithPlans,
                            dayEl: !!dayEl
                        });
                    }
                }
            };
            
            // 使用事件委托处理日期点击
            calendarContainer.addEventListener('click', this._calendarClickHandler);
            
            // 月份切换按钮（使用事件委托，避免重复绑定）
            if (calendarContainer) {
                // 移除旧的月份切换事件监听器
                if (this._monthNavHandler) {
                    calendarContainer.removeEventListener('click', this._monthNavHandler);
                }
                
                this._monthNavHandler = (e) => {
                    const prevBtn = e.target.closest('#calendar-prev-month');
                    const nextBtn = e.target.closest('#calendar-next-month');
                    
                    if (prevBtn) {
                        e.preventDefault();
                        e.stopPropagation();
                        this.currentCalendarMonth--;
                        if (this.currentCalendarMonth < 0) {
                            this.currentCalendarMonth = 11;
                            this.currentCalendarYear--;
                        }
                        this.renderCalendar();
                    } else if (nextBtn) {
                        e.preventDefault();
                        e.stopPropagation();
                        this.currentCalendarMonth++;
                        if (this.currentCalendarMonth > 11) {
                            this.currentCalendarMonth = 0;
                            this.currentCalendarYear++;
                        }
                        this.renderCalendar();
                    }
                };
                
                // 在下拉菜单容器上绑定事件（因为按钮在dropdown-menu中）
                const dropdownMenu = document.getElementById('review-calendar-dropdown-menu');
                if (dropdownMenu) {
                    dropdownMenu.addEventListener('click', this._monthNavHandler);
                }
            }
            
            // 初始化tooltip
            if (typeof bootstrap !== 'undefined' && bootstrap.Tooltip) {
                // 先销毁旧的tooltip
                document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(el => {
                    const existingTooltip = bootstrap.Tooltip.getInstance(el);
                    if (existingTooltip) {
                        existingTooltip.dispose();
                    }
                });
                // 创建新的tooltip
                document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(el => {
                    new bootstrap.Tooltip(el);
                });
            }
        },
        
        /**
         * 显示指定日期的复习计划（在列表视图中显示）
         */
        showPlansForDate(dateKey, plansForDate) {
            if (plansForDate.length === 0) {
                alert('该日期没有复习计划');
                return;
            }
            
            // 切换到列表视图并显示该日期的计划
            const contentContainer = document.getElementById('errorbook-review-content');
            if (!contentContainer) return;
            
            const date = new Date(dateKey);
            const dateStr = `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
            
            // 按周期分组
            const plansByStage = {};
            plansForDate.forEach(({ plan, stage }) => {
                const stageNum = stage.stage;
                if (!plansByStage[stageNum]) {
                    plansByStage[stageNum] = [];
                }
                plansByStage[stageNum].push({ plan, stage });
            });
            
            let html = `<div class="mb-3"><h6>${dateStr} 的复习计划</h6></div>`;
            
            // 按周期排序显示
            const sortedStages = Object.keys(plansByStage).sort((a, b) => parseInt(a) - parseInt(b));
            sortedStages.forEach(stageNum => {
                const plans = plansByStage[stageNum];
                const stageIndex = parseInt(stageNum) - 1;
                const stageName = STAGE_NAMES[stageIndex] || `第${stageNum}周期`;
                
                html += `<div class="mb-3">
                    <span class="badge bg-primary">${stageName}</span>
                    <span class="text-muted small ms-2">(${plans.length}个)</span>
                </div>`;
                html += '<div class="d-flex flex-wrap gap-3 mb-4">';
                
                plans.forEach(({ plan, stage }) => {
                    const progressCircles = this.renderProgressCircles(plan);
                    const cardHTML = CardComponent.render({
                        word: plan.word || '',
                        pinyin: plan.pinyin || '',
                        showPinyin: false,
                        markedWrong: false,
                        dataWordId: plan.wordId,
                        dataPinyin: plan.pinyin || '',
                        additionalClasses: 'review-plan-card',
                        extraHtml: `
                            <div class="review-plan-progress mt-2" style="display: flex; align-items: center; justify-content: center; gap: 4px; flex-wrap: wrap;">
                                ${progressCircles}
                            </div>
                        `
                    });
                    html += `<div style="position: relative;">${cardHTML}</div>`;
                });
                
                html += '</div>';
            });
            
            contentContainer.innerHTML = html;
            
            // 初始化tooltip
            if (typeof bootstrap !== 'undefined' && bootstrap.Tooltip) {
                document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(el => {
                    new bootstrap.Tooltip(el);
                });
            }
            
            // 关闭日历下拉面板
            const calendarDropdown = document.getElementById('review-calendar-dropdown');
            if (calendarDropdown) {
                calendarDropdown.style.display = 'none';
            }
        },
        
        /**
         * 开始当前周期的练习（所有待复习的词语）
         */
        startPracticeForCurrentStage() {
            const words = this.getWordsForCurrentStage();
            if (words.length === 0) {
                alert('当前没有需要复习的词语');
                return;
            }
            
            // 转换为Practice模块需要的格式
            const practiceWords = words.map(wordData => ({
                id: wordData.id,
                word: wordData.word,
                pinyin: wordData.pinyin,
                unit: wordData.unit
            }));
            
            if (global.Practice) {
                Practice.startWithWords(practiceWords, 3, 1);
                Practice.start('error-practice');
            }
        },
        
        /**
         * 开始当前周期的测试（所有待测试的词语）
         */
        startTestForCurrentStage() {
            const words = this.getWordsForCurrentStage();
            if (words.length === 0) {
                alert('当前没有需要测试的词语');
                return;
            }
            
            // 检查是否都到了测试时间
            const now = new Date();
            const wordsReadyForTest = words.filter(wordData => {
                const plan = wordData.reviewPlan;
                const currentStage = plan.stages.find(s => s.stage === plan.currentStage);
                if (!currentStage) return false;
                const scheduledDate = new Date(currentStage.scheduledAt);
                return scheduledDate <= now;
            });
            
            if (wordsReadyForTest.length === 0) {
                alert('当前没有到测试时间的词语，请先完成练习');
                return;
            }
            
            // 转换为Practice模块需要的格式
            const testWords = wordsReadyForTest.map(wordData => ({
                id: wordData.id,
                word: wordData.word,
                pinyin: wordData.pinyin,
                unit: wordData.unit
            }));
            
            if (global.Practice) {
                Practice.startWithWords(testWords, 3, 1);
                Practice.start('test');
            }
        },
        
        /**
         * 绑定复习计划相关事件
         */
        bindReviewPlanEvents() {
            // 初始化tooltip
            if (typeof bootstrap !== 'undefined' && bootstrap.Tooltip) {
                document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(el => {
                    new bootstrap.Tooltip(el);
                });
            }
            
            // 日历下拉菜单（使用Bootstrap dropdown）
            const calendarDropdownBtn = document.getElementById('review-calendar-dropdown-btn');
            const calendarDropdownMenu = document.getElementById('review-calendar-dropdown-menu');
            
            if (calendarDropdownBtn && calendarDropdownMenu) {
                // 监听下拉菜单显示事件
                calendarDropdownMenu.addEventListener('shown.bs.dropdown', () => {
                    console.log('日历下拉菜单已显示');
                    this.renderCalendar();
                });
            } else {
                console.warn('日历下拉菜单元素未找到:', { 
                    calendarDropdownBtn: !!calendarDropdownBtn, 
                    calendarDropdownMenu: !!calendarDropdownMenu 
                });
            }
            
            // 整个周期的开始练习按钮
            const startPracticeAllBtn = document.getElementById('review-start-practice-all-btn');
            if (startPracticeAllBtn) {
                startPracticeAllBtn.addEventListener('click', () => {
                    this.startPracticeForCurrentStage();
                });
            }
            
            // 整个周期的开始测试按钮
            const startTestAllBtn = document.getElementById('review-start-test-all-btn');
            if (startTestAllBtn) {
                startTestAllBtn.addEventListener('click', () => {
                    this.startTestForCurrentStage();
                });
            }
        },

        /**
         * 开始复习练习
         */
        startReviewPractice(wordId) {
            const wordData = this.getWordsForCurrentStage(wordId);
            if (!wordData) {
                alert('未找到需要复习的词语');
                return;
            }

            const plan = wordData.reviewPlan;
            // 转换为Practice模块需要的格式
            const words = [{
                id: wordData.id,
                word: wordData.word,
                pinyin: wordData.pinyin,
                unit: wordData.unit
            }];

            // 使用Practice模块开始练习
            if (global.Practice) {
                Practice.reviewPlanWordId = wordId;
                Practice.reviewPlanStage = plan.currentStage;
                Practice.startWithWords(words, 3, 1); // 速度3秒/词，每页1个
                Practice.start('error-practice');
            }
        },

        /**
         * 开始复习测试
         */
        startReviewTest(wordId) {
            const wordData = this.getWordsForCurrentStage(wordId);
            if (!wordData) {
                alert('未找到需要复习的词语');
                return;
            }

            const plan = wordData.reviewPlan;
            // 转换为Practice模块需要的格式
            const words = [{
                id: wordData.id,
                word: wordData.word,
                pinyin: wordData.pinyin,
                unit: wordData.unit
            }];

            // 使用Practice模块开始测试
            if (global.Practice) {
                Practice.reviewPlanWordId = wordId;
                Practice.reviewPlanStage = plan.currentStage;
                Practice.startWithWords(words, 3, 1); // 速度3秒/词，每页1个
                Practice.start('test');
            }
        },

        /**
         * 初始化
         */
        init() {
            // 当错题保存时，自动创建复习计划
            this.setupAutoCreatePlans();
        },

        /**
         * 设置自动创建复习计划
         */
        setupAutoCreatePlans() {
            // 监听错题保存事件（通过重写Storage方法或监听）
            // 这里先手动调用，后续可以优化
        }
    };

    global.ReviewPlan = ReviewPlan;
})(window);

