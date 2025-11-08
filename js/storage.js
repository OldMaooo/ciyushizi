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
        }
    };

    global.Storage = Storage;
})(window);
