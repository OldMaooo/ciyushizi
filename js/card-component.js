/**
 * 统一的卡片组件
 * 用于渲染练习卡片、错题卡片等
 */
(function (global) {
    const CardComponent = {
        /**
         * 计算字体大小
         */
        calculateFontSize(wordLength) {
            const baseSize = 72; // 基础字体大小（2个字）
            if (wordLength <= 2) return baseSize;
            if (wordLength === 3) return baseSize * 0.75; // 3个字缩小到75%
            if (wordLength === 4) return baseSize * 0.6; // 4个字缩小到60%
            return baseSize * 0.5; // 5个字及以上缩小到50%
        },

        /**
         * 渲染卡片
         * @param {Object} options - 卡片配置
         * @param {string} options.word - 词语
         * @param {string} options.pinyin - 拼音
         * @param {boolean} options.showPinyin - 是否显示拼音
         * @param {boolean} options.markedWrong - 是否标记为错误
         * @param {string} options.id - 卡片ID
         * @param {string} options.dataId - data-id属性
         * @param {string} options.dataWordId - data-word-id属性
         * @param {string} options.dataKey - data-key属性
         * @param {string} options.dataRoundId - data-round-id属性
         * @param {string} options.dataGroupIndex - data-group-index属性
         * @param {string} options.dataPinyin - data-pinyin属性
         * @param {boolean} options.showCheckbox - 是否显示复选框
         * @param {boolean} options.checkboxChecked - 复选框是否选中
         * @param {boolean} options.showMarkBadge - 是否显示错误标记（❌）
         * @param {string} options.extraHtml - 额外的HTML内容（如错误次数、最近错误时间等）
         * @param {string} options.additionalClasses - 额外的CSS类
         * @returns {string} 卡片的HTML字符串
         */
        render(options = {}) {
            const {
                word = '',
                pinyin = '',
                showPinyin = false,
                markedWrong = false,
                id = '',
                dataId = '',
                dataWordId = '',
                dataKey = '',
                dataRoundId = '',
                dataGroupIndex = '',
                dataPinyin = '',
                showCheckbox = false,
                checkboxChecked = false,
                showMarkBadge = false,
                extraHtml = '',
                additionalClasses = ''
            } = options;

            const wordLength = word.length;
            const fontSize = this.calculateFontSize(wordLength);
            const markedClass = markedWrong ? 'marked-wrong' : '';
            // 如果有word，总是创建拼音元素（即使pinyin为空），通过 d-none 控制显示/隐藏
            // 这样点击时可以动态生成拼音
            const pinyinHtml = word ? `<div class="practice-pinyin ${showPinyin && pinyin ? '' : 'd-none'}" ${!pinyin ? 'data-needs-pinyin="true"' : ''}>${pinyin || ''}</div>` : '';
            
            // 复选框HTML
            // 如果 showCheckbox 为 true，且 additionalClasses 包含 'admin-mode'，使用常规复选框
            const isAdminMode = additionalClasses.includes('admin-mode');
            const checkboxHtml = showCheckbox 
                ? (isAdminMode
                    ? `<div class="form-check position-absolute top-0 start-0 m-2">
                         <input class="form-check-input" type="checkbox" ${checkboxChecked ? 'checked' : ''} />
                       </div>`
                    : `<label class="practice-toggle">
                         <input type="checkbox" class="practice-checkbox" ${checkboxChecked ? 'checked' : ''} />
                       </label>`)
                : '';

            // 错误标记
            const markBadge = showMarkBadge 
                ? '<span class="position-absolute top-0 end-0" style="font-size: 1.5rem; line-height: 1; padding: 0.25rem;">❌</span>'
                : '';

            // 构建data属性
            const dataAttrs = [];
            if (dataId) dataAttrs.push(`data-id="${dataId}"`);
            if (dataWordId) dataAttrs.push(`data-word-id="${dataWordId}"`);
            if (dataKey) dataAttrs.push(`data-key="${dataKey}"`);
            if (dataRoundId) dataAttrs.push(`data-round-id="${dataRoundId}"`);
            if (dataGroupIndex !== '') dataAttrs.push(`data-group-index="${dataGroupIndex}"`);
            if (dataPinyin) dataAttrs.push(`data-pinyin="${dataPinyin}"`);
            if (wordLength) dataAttrs.push(`data-word-length="${wordLength}"`);

            const dataAttrsStr = dataAttrs.length > 0 ? ' ' + dataAttrs.join(' ') : '';

            return `
                <div class="practice-card position-relative ${markedClass} ${additionalClasses}"${dataAttrsStr}${id ? ` id="${id}"` : ''}>
                    ${markBadge}
                    ${checkboxHtml}
                    ${pinyinHtml}
                    <div class="practice-word" style="font-size: ${fontSize}px;">${word}</div>
                    ${extraHtml}
                </div>
            `;
        },

        /**
         * 动态调整卡片字体大小以适应内容
         */
        adjustCardFontSizes(container) {
            if (!container) return;
            container.querySelectorAll('.practice-card').forEach(card => {
                const wordEl = card.querySelector('.practice-word');
                const pinyinEl = card.querySelector('.practice-pinyin');
                if (!wordEl) return;
                
                const word = wordEl.textContent.trim();
                const wordLength = word.length;
                
                // 获取卡片实际尺寸（考虑padding）
                const cardRect = card.getBoundingClientRect();
                const cardStyle = getComputedStyle(card);
                const paddingX = parseFloat(cardStyle.paddingLeft) + parseFloat(cardStyle.paddingRight);
                const paddingY = parseFloat(cardStyle.paddingTop) + parseFloat(cardStyle.paddingBottom);
                const availableWidth = cardRect.width - paddingX - 20; // 额外留10px边距
                const availableHeight = cardRect.height - paddingY - 20;
                
                // 调整汉字字体大小
                let fontSize = this.calculateFontSize(wordLength);
                
                // 创建临时元素测量文字宽度
                const measureEl = document.createElement('span');
                measureEl.style.visibility = 'hidden';
                measureEl.style.position = 'absolute';
                measureEl.style.whiteSpace = 'nowrap';
                measureEl.style.fontSize = fontSize + 'px';
                measureEl.style.fontFamily = getComputedStyle(wordEl).fontFamily;
                measureEl.style.fontWeight = getComputedStyle(wordEl).fontWeight;
                measureEl.style.lineHeight = getComputedStyle(wordEl).lineHeight;
                measureEl.textContent = word;
                document.body.appendChild(measureEl);
                
                // 如果文字超出，逐步缩小字体
                let iterations = 0;
                const maxIterations = 50; // 防止无限循环
                while ((measureEl.offsetWidth > availableWidth || measureEl.offsetHeight > availableHeight) && iterations < maxIterations) {
                    fontSize -= 2;
                    if (fontSize < 16) break; // 最小字体16px
                    measureEl.style.fontSize = fontSize + 'px';
                    iterations++;
                }
                
                document.body.removeChild(measureEl);
                wordEl.style.fontSize = fontSize + 'px';
                wordEl.style.maxWidth = '100%';
                wordEl.style.overflow = 'visible';
                
                // 调整拼音字体大小（如果存在）
                if (pinyinEl && pinyinEl.textContent.trim()) {
                    const pinyin = pinyinEl.textContent.trim();
                    // 拼音基础字体大小（相对于汉字）
                    let pinyinFontSize = Math.max(16, fontSize * 0.35); // 拼音约为汉字的35%
                    
                    // 创建临时元素测量拼音宽度
                    const pinyinMeasureEl = document.createElement('span');
                    pinyinMeasureEl.style.visibility = 'hidden';
                    pinyinMeasureEl.style.position = 'absolute';
                    pinyinMeasureEl.style.whiteSpace = 'nowrap';
                    pinyinMeasureEl.style.fontSize = pinyinFontSize + 'px';
                    pinyinMeasureEl.style.fontFamily = getComputedStyle(pinyinEl).fontFamily;
                    pinyinMeasureEl.style.fontWeight = getComputedStyle(pinyinEl).fontWeight;
                    pinyinMeasureEl.style.lineHeight = getComputedStyle(pinyinEl).lineHeight;
                    pinyinMeasureEl.textContent = pinyin;
                    document.body.appendChild(pinyinMeasureEl);
                    
                    // 如果拼音超出，逐步缩小字体
                    let pinyinIterations = 0;
                    while (pinyinMeasureEl.offsetWidth > availableWidth && pinyinIterations < maxIterations) {
                        pinyinFontSize -= 1;
                        if (pinyinFontSize < 12) break; // 最小字体12px
                        pinyinMeasureEl.style.fontSize = pinyinFontSize + 'px';
                        pinyinIterations++;
                    }
                    
                    document.body.removeChild(pinyinMeasureEl);
                    pinyinEl.style.fontSize = pinyinFontSize + 'px';
                    pinyinEl.style.maxWidth = '100%';
                    pinyinEl.style.overflow = 'visible';
                }
            });
        }
    };

    global.CardComponent = CardComponent;
    if (typeof window !== 'undefined') {
        window.CardComponent = CardComponent;
    }
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);

