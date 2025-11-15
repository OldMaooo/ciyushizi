/**
 * 复习计划模块
 * 基于艾宾浩斯遗忘曲线的复习计划管理
 */

(function (global) {
    // 艾宾浩斯曲线时间节点（小时）
    const REVIEW_INTERVALS = [1, 24, 72, 168, 336, 720]; // 1小时、1天、3天、1周、2周、1个月

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
                        // 已掌握，可以移除或保留记录
                    }
                } else {
                    // 测试未通过，保持当前阶段，重新安排时间
                    // 根据需求：只有当最后一次仍然为错时才需要计入新的复习周期
                    // 这里先不重新计算，保持原计划
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
         * 渲染复习计划页面
         */
        render() {
            const container = document.getElementById('errorbook-review-content');
            if (!container) return;

            const plansByStatus = this.getPlansByStatus();
            const hasPlans = plansByStatus.today.length > 0 || 
                           plansByStatus.upcoming.length > 0 || 
                           plansByStatus.overdue.length > 0 || 
                           plansByStatus.future.length > 0;

            if (!hasPlans) {
                container.innerHTML = '<div class="text-muted text-center py-4">暂无复习计划</div>';
                return;
            }

            let html = '';

            // 今日待复习
            if (plansByStatus.today.length > 0) {
                html += this.renderPlanGroup('今日待复习', plansByStatus.today, 'danger');
            }

            // 已逾期
            if (plansByStatus.overdue.length > 0) {
                html += this.renderPlanGroup('已逾期', plansByStatus.overdue, 'danger');
            }

            // 即将到期
            if (plansByStatus.upcoming.length > 0) {
                html += this.renderPlanGroup('即将到期（1-2天内）', plansByStatus.upcoming, 'warning');
            }

            // 未来计划
            if (plansByStatus.future.length > 0) {
                html += this.renderPlanGroup('未来计划', plansByStatus.future, 'secondary', true);
            }

            container.innerHTML = html;
            this.bindReviewPlanEvents();
        },

        /**
         * 渲染一组复习计划
         */
        renderPlanGroup(title, plans, badgeClass, showFutureOnly = false) {
            let html = `<div class="mb-4">
                <h6 class="mb-3">
                    <span class="badge bg-${badgeClass}">${title}</span>
                    <span class="text-muted small ms-2">(${plans.length}个)</span>
                </h6>
                <div class="row g-3">`;

            plans.forEach(plan => {
                const currentStage = plan.stages.find(s => s.stage === plan.currentStage);
                const scheduledDate = currentStage ? new Date(currentStage.scheduledAt) : null;
                const progress = getProgressVisualization(plan);
                
                html += `
                    <div class="col-md-6 col-lg-4">
                        <div class="card review-plan-card" data-word-id="${plan.wordId}">
                            <div class="card-body">
                                <div class="d-flex justify-content-between align-items-start mb-2">
                                    <div>
                                        <h6 class="mb-1">${plan.word}</h6>
                                        <div class="text-muted small">${plan.pinyin || ''}</div>
                                        <div class="text-muted small">${plan.unit || ''}</div>
                                    </div>
                                    <div class="text-end">
                                        <div class="mb-1" style="font-size: 1.2rem; letter-spacing: 2px;">${progress}</div>
                                        <div class="text-muted small">第${plan.currentStage}次复习</div>
                                    </div>
                                </div>
                                ${scheduledDate ? `<div class="text-muted small mb-2">到期时间: ${scheduledDate.toLocaleString('zh-CN')}</div>` : ''}
                                <div class="mb-2">
                                    <div class="small">
                                        <span class="badge ${plan.currentRoundPracticeCompleted ? 'bg-success' : 'bg-secondary'}">练习: ${plan.currentRoundPracticeCompleted ? '已完成' : '未完成'}</span>
                                        <span class="badge ${plan.currentRoundTestCompleted ? 'bg-success' : 'bg-danger'} ms-1">测试: ${plan.currentRoundTestCompleted ? '已完成' : '未完成'}</span>
                                    </div>
                                </div>
                                ${!showFutureOnly ? `
                                    <div class="d-flex gap-2">
                                        <button class="btn btn-sm btn-outline-primary flex-fill review-start-practice-btn" data-word-id="${plan.wordId}">开始练习</button>
                                        <button class="btn btn-sm ${plan.currentRoundTestCompleted ? 'btn-secondary' : 'btn-primary'} flex-fill review-start-test-btn" data-word-id="${plan.wordId}" ${plan.currentRoundTestCompleted ? 'disabled' : ''}>开始测试</button>
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                `;
            });

            html += '</div></div>';
            return html;
        },

        /**
         * 绑定复习计划相关事件
         */
        bindReviewPlanEvents() {
            // 开始练习按钮
            document.querySelectorAll('.review-start-practice-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const wordId = btn.dataset.wordId;
                    this.startReviewPractice(wordId);
                });
            });

            // 开始测试按钮
            document.querySelectorAll('.review-start-test-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const wordId = btn.dataset.wordId;
                    this.startReviewTest(wordId);
                });
            });
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

