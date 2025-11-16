(function (global) {
    const STORAGE_PREFIX = 'word_recognition_';

    const Storage = {
        init() {
            this.migrate();
        },

        migrate() {
            // 预留迁移钩子
        },

        _key(suffix) {
            return `${STORAGE_PREFIX}${suffix}`;
        },

        getWordBank() {
            try {
                const raw = localStorage.getItem(this._key('word_bank'));
                return raw ? JSON.parse(raw) : [];
            } catch (err) {
                console.error('读取词语库失败', err);
                return [];
            }
        },

        saveWordBank(items) {
            try {
                localStorage.setItem(this._key('word_bank'), JSON.stringify(items || []));
            } catch (err) {
                console.error('保存词语库失败', err);
            }
        },

        addWord(word) {
            if (!word || !word.word) {
                console.warn('添加词语失败：词语内容为空');
                return null;
            }
            
            const wordBank = this.getWordBank();
            
            // 检查是否已存在（基于word + grade + semester + unit）
            const existing = wordBank.find(w => 
                w.word === word.word &&
                w.grade === word.grade &&
                w.semester === word.semester &&
                w.unit === word.unit
            );
            
            if (existing) {
                return existing; // 已存在，返回现有词语
            }
            
            // 创建新词语
            const newWord = {
                id: `word_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                word: word.word,
                pinyin: word.pinyin || '',
                grade: word.grade || '',
                semester: word.semester || '',
                unit: word.unit || 1,
                addedDate: new Date().toISOString()
            };
            
            wordBank.push(newWord);
            this.saveWordBank(wordBank);
            return newWord;
        },

        getPracticeLogs() {
            try {
                const raw = localStorage.getItem(this._key('practice_logs'));
                return raw ? JSON.parse(raw) : [];
            } catch (err) {
                console.error('读取练习记录失败', err);
                return [];
            }
        },

        savePracticeLog(log) {
            if (!log || !log.id) return;
            const existing = this.getPracticeLogs();
            const idx = existing.findIndex(item => item.id === log.id);
            if (idx >= 0) {
                existing[idx] = log;
            } else {
            existing.push(log);
            }
            try {
                localStorage.setItem(this._key('practice_logs'), JSON.stringify(existing));
            } catch (err) {
                console.error('保存练习记录失败', err);
            }
        },

        removePracticeLog(logId) {
            if (!logId) return;
            const existing = this.getPracticeLogs().filter(item => item.id !== logId);
            try {
                localStorage.setItem(this._key('practice_logs'), JSON.stringify(existing));
            } catch (err) {
                console.error('删除练习记录失败', err);
            }
        },

        getSettings() {
            try {
                const raw = localStorage.getItem(this._key('settings'));
                return raw ? JSON.parse(raw) : {};
            } catch (err) {
                console.error('读取设置失败', err);
                return {};
            }
        },

        saveSettings(settings) {
            try {
                localStorage.setItem(this._key('settings'), JSON.stringify(settings || {}));
            } catch (err) {
                console.error('保存设置失败', err);
            }
        },

        getErrorWords() {
            try {
                const raw = localStorage.getItem(this._key('error_words'));
                return raw ? JSON.parse(raw) : [];
            } catch (err) {
                console.error('读取错题失败', err);
                return [];
            }
        },

        saveErrorWords(items) {
            try {
                localStorage.setItem(this._key('error_words'), JSON.stringify(items || []));
            } catch (err) {
                console.error('保存错题失败', err);
            }
        },

        saveErrorWordsForRound(roundId, items) {
            if (!roundId) return;
            const others = this.getErrorWords().filter(item => item.roundId !== roundId);
            this.saveErrorWords([...others, ...(items || [])]);
        },

        // 复习计划相关方法
        getReviewPlans() {
            try {
                const raw = localStorage.getItem(this._key('review_plans'));
                return raw ? JSON.parse(raw) : [];
            } catch (err) {
                console.error('读取复习计划失败', err);
                return [];
            }
        },

        saveReviewPlans(plans) {
            try {
                localStorage.setItem(this._key('review_plans'), JSON.stringify(plans || []));
            } catch (err) {
                console.error('保存复习计划失败', err);
            }
        },

        getReviewPlan(wordId) {
            const plans = this.getReviewPlans();
            return plans.find(p => p.wordId === wordId);
        },

        saveReviewPlan(plan) {
            if (!plan || !plan.wordId) return;
            const plans = this.getReviewPlans();
            const idx = plans.findIndex(p => p.wordId === plan.wordId);
            if (idx >= 0) {
                plans[idx] = plan;
            } else {
                plans.push(plan);
            }
            this.saveReviewPlans(plans);
        },

        removeReviewPlan(wordId) {
            if (!wordId) return;
            const plans = this.getReviewPlans().filter(p => p.wordId !== wordId);
            this.saveReviewPlans(plans);
        },

        // 汇总题库相关方法（以每个单元首次测试/练习的结果作为汇总）
        getSummaryErrorWords() {
            try {
                const raw = localStorage.getItem(this._key('summary_error_words'));
                return raw ? JSON.parse(raw) : [];
            } catch (err) {
                console.error('读取汇总错题失败', err);
                return [];
            }
        },

        saveSummaryErrorWords(items) {
            try {
                localStorage.setItem(this._key('summary_error_words'), JSON.stringify(items || []));
            } catch (err) {
                console.error('保存汇总错题失败', err);
            }
        },

        // 更新汇总题库：以每个单元首次测试的结果作为汇总，如果没有测试则以首次练习的结果
        updateSummaryErrorWords(errorWords, mode, unit) {
            if (!errorWords || errorWords.length === 0) return;
            
            const summaryWords = this.getSummaryErrorWords();
            const unitKey = unit || 'default';
            
            // 检查该单元是否已有汇总记录
            const existingUnitSummary = summaryWords.filter(item => item.unit === unitKey);
            const existingWordIds = new Set(existingUnitSummary.map(item => item.wordId));
            
            // 如果是测试模式，优先使用测试结果
            // 如果是练习模式，只有在没有测试记录时才使用
            if (mode === 'test') {
                // 测试模式：更新或添加该单元的汇总记录
                errorWords.forEach(errorWord => {
                    const wordId = errorWord.wordId;
                    const existingIdx = summaryWords.findIndex(item => 
                        item.wordId === wordId && item.unit === unitKey
                    );
                    
                    if (existingIdx >= 0) {
                        // 更新现有记录（测试结果优先）
                        summaryWords[existingIdx] = {
                            ...summaryWords[existingIdx],
                            ...errorWord,
                            source: 'test',
                            firstMarkedAt: summaryWords[existingIdx].firstMarkedAt || errorWord.markedAt,
                            lastMarkedAt: errorWord.markedAt
                        };
                    } else {
                        // 添加新记录
                        summaryWords.push({
                            ...errorWord,
                            unit: unitKey,
                            source: 'test',
                            firstMarkedAt: errorWord.markedAt,
                            lastMarkedAt: errorWord.markedAt
                        });
                    }
                });
            } else if (mode === 'practice') {
                // 练习模式：只有在没有测试记录时才添加
                errorWords.forEach(errorWord => {
                    const wordId = errorWord.wordId;
                    const existingIdx = summaryWords.findIndex(item => 
                        item.wordId === wordId && item.unit === unitKey
                    );
                    
                    if (existingIdx < 0) {
                        // 该单元没有该词的汇总记录，添加
                        summaryWords.push({
                            ...errorWord,
                            unit: unitKey,
                            source: 'practice',
                            firstMarkedAt: errorWord.markedAt,
                            lastMarkedAt: errorWord.markedAt
                        });
                    } else if (summaryWords[existingIdx].source === 'practice') {
                        // 已有练习记录，更新最后标记时间
                        summaryWords[existingIdx].lastMarkedAt = errorWord.markedAt;
                    }
                    // 如果已有测试记录，不更新（测试结果优先）
                });
            }
            
            this.saveSummaryErrorWords(summaryWords);
        },

        // 从汇总题库中删除已掌握的词语
        removeFromSummaryErrorWords(wordId) {
            const summaryWords = this.getSummaryErrorWords();
            const filtered = summaryWords.filter(item => item.wordId !== wordId);
            this.saveSummaryErrorWords(filtered);
        }
    };

    global.Storage = Storage;
})(window);
