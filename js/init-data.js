/**
 * 初始化数据模块
 * 从外部JSON文件加载默认词库（小学1-6年级）
 * 如果本地已有人为导入数据，则不再自动导入
 */

const InitData = {
    /**
     * 加载默认题库数据
     * 只加载一年级到三年级的固定词库（用户不可更改）
     */
    async loadDefaultWordBank() {
        // 定义要加载的年级和册数（只加载一年级到三年级）
        const grades = ['一年级', '二年级', '三年级'];
        const semesters = ['上册', '下册'];
        
        let totalImported = 0;
        const loadedFiles = [];
        
        // 依次尝试加载每个年级和册数的词库文件
        for (const grade of grades) {
            for (const semester of semesters) {
                const fileName = `data/wordbank/${grade}${semester}.json`;
                try {
                    const resp = await fetch(fileName, { cache: 'no-cache' });
                    if (!resp.ok) {
                        // 文件不存在，跳过
                        console.warn(`⚠️ 文件不存在: ${fileName}`);
                        continue;
                    }
                    
                    const data = await resp.json();
                    const wordsToImport = Array.isArray(data) ? data : (data.wordBank || []);
                    
                    if (!wordsToImport || wordsToImport.length === 0) {
                        console.warn(`⚠️ ${fileName} 中没有词语数据`);
                        continue;
                    }
                    
                    // 每次处理一个文件前，重新获取最新的词库（因为可能已经添加了新词）
                    let existingWords = Storage.getWordBank();
                    let imported = 0;
                    
                    wordsToImport.forEach(word => {
                        // 确保grade和semester格式正确
                        let wordGrade = word.grade || grade;
                        let wordSemester = word.semester || semester;
                        // 如果word.grade是数字，转换为"X年级"格式
                        if (typeof wordGrade === 'number') {
                            const gradeNames = ['', '一年级', '二年级', '三年级', '四年级', '五年级', '六年级'];
                            wordGrade = gradeNames[wordGrade] || grade;
                        }
                        // 如果word.semester是"上"或"下"，转换为"上册"或"下册"
                        if (wordSemester === '上' || wordSemester === '下') {
                            wordSemester = wordSemester === '上' ? '上册' : '下册';
                        }
                        
                        // 标准化unit值（统一转换为字符串比较）
                        const normalizeUnit = (unit) => {
                            if (unit == null || unit === '') return '未分类';
                            return String(unit);
                        };
                        
                        // 检查是否已存在（基于word + grade + semester + unit，unit统一转换为字符串比较）
                        const wordText = word.word || word.text || '';
                        const wordUnit = word.unit != null ? word.unit : 1;
                        const normalizedWordUnit = normalizeUnit(wordUnit);
                        const existing = existingWords.find(w => 
                            w.word === wordText &&
                            w.grade === wordGrade &&
                            w.semester === wordSemester &&
                            normalizeUnit(w.unit) === normalizedWordUnit
                        );
                        
                        // 如果是固定词库的词，且不存在，则添加（即使已有其他数据）
                        if (!existing) {
                            const result = Storage.addWord({
                                word: wordText,
                                pinyin: word.pinyin || '',
                                grade: wordGrade,
                                semester: wordSemester,
                                unit: wordUnit
                            });
                            if (result) {
                                imported++;
                                // 更新existingWords，避免重复检查
                                existingWords = Storage.getWordBank();
                            }
                        }
                    });
                    
                    if (imported > 0) {
                        totalImported += imported;
                        loadedFiles.push(`${grade}${semester} (${imported}个)`);
                        console.log(`✅ 已加载 ${fileName}: ${imported} 个词语`);
                    }
                } catch (e) {
                    // 文件加载失败，跳过
                    console.warn(`⚠️ 加载 ${fileName} 失败:`, e.message);
                }
            }
        }
        
        if (totalImported > 0) {
            console.log(`✅ 固定词库加载完成，共 ${totalImported} 个词语`);
            console.log(`   已加载文件: ${loadedFiles.join(', ')}`);
        } else {
            const existingCount = Storage.getWordBank().length;
            if (existingCount > 0) {
                console.log(`ℹ️ 固定词库已完整（共 ${existingCount} 个词语），无需补充`);
            } else {
                console.log('ℹ️ 未找到可用的词库文件，请使用导入功能加载数据');
            }
        }
        
        // 更新界面
        if (typeof WordBank !== 'undefined' && WordBank.refresh) {
            WordBank.refresh();
        }
        if (typeof PracticeRange !== 'undefined' && PracticeRange.init) {
            PracticeRange.init();
        }
        if (typeof Main !== 'undefined' && Main.restoreStats) {
            Main.restoreStats();
        }
    },
    
    /**
     * 初始化
     */
    init() {
        // 延迟加载，确保Storage模块已初始化
        setTimeout(() => {
            this.loadDefaultWordBank();
        }, 300);
    }
};

