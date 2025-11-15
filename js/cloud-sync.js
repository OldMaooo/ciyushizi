/**
 * 云端同步模块 - 使用 GitHub Gist API
 * 用于将词语库同步到云端，实现多设备共享
 */
(function (global) {
    const CloudSync = {
        // Gist ID 和 Token 存储在 localStorage
        STORAGE_KEY_GIST_ID: 'word_recognition_gist_id',
        STORAGE_KEY_TOKEN: 'word_recognition_github_token',
        GIST_FILENAME: 'yuwenrenzi_wordbank.json',
        
        /**
         * 获取存储的 Gist ID
         */
        getGistId() {
            return localStorage.getItem(this.STORAGE_KEY_GIST_ID);
        },
        
        /**
         * 保存 Gist ID
         */
        saveGistId(gistId) {
            if (gistId) {
                localStorage.setItem(this.STORAGE_KEY_GIST_ID, gistId);
            } else {
                localStorage.removeItem(this.STORAGE_KEY_GIST_ID);
            }
        },
        
        /**
         * 获取 GitHub Token
         */
        getToken() {
            return localStorage.getItem(this.STORAGE_KEY_TOKEN);
        },
        
        /**
         * 保存 GitHub Token
         */
        saveToken(token) {
            if (token) {
                localStorage.setItem(this.STORAGE_KEY_TOKEN, token);
            } else {
                localStorage.removeItem(this.STORAGE_KEY_TOKEN);
            }
        },
        
        /**
         * 检查是否已配置
         */
        isConfigured() {
            return !!(this.getToken() && this.getGistId());
        },
        
        /**
         * 创建新的 Gist
         */
        async createGist(data) {
            const token = this.getToken();
            if (!token) {
                throw new Error('请先配置 GitHub Token');
            }
            
            const response = await fetch('https://api.github.com/gists', {
                method: 'POST',
                headers: {
                    'Authorization': `token ${token}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/vnd.github.v3+json'
                },
                body: JSON.stringify({
                    description: '语文认字 - 词语库',
                    public: false,
                    files: {
                        [this.GIST_FILENAME]: {
                            content: JSON.stringify(data, null, 2)
                        }
                    }
                })
            });
            
            if (!response.ok) {
                const error = await response.json().catch(() => ({ message: '创建失败' }));
                throw new Error(error.message || `HTTP ${response.status}`);
            }
            
            const result = await response.json();
            this.saveGistId(result.id);
            return result;
        },
        
        /**
         * 更新现有的 Gist
         */
        async updateGist(data) {
            const token = this.getToken();
            const gistId = this.getGistId();
            
            if (!token) {
                throw new Error('请先配置 GitHub Token');
            }
            
            if (!gistId) {
                // 如果没有 Gist ID，创建新的
                return await this.createGist(data);
            }
            
            const response = await fetch(`https://api.github.com/gists/${gistId}`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `token ${token}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/vnd.github.v3+json'
                },
                body: JSON.stringify({
                    description: '语文认字 - 词语库',
                    files: {
                        [this.GIST_FILENAME]: {
                            content: JSON.stringify(data, null, 2)
                        }
                    }
                })
            });
            
            if (!response.ok) {
                if (response.status === 404) {
                    // Gist 不存在，创建新的
                    this.saveGistId(null);
                    return await this.createGist(data);
                }
                const error = await response.json().catch(() => ({ message: '更新失败' }));
                throw new Error(error.message || `HTTP ${response.status}`);
            }
            
            return await response.json();
        },
        
        /**
         * 从 Gist 获取数据
         */
        async fetchGist() {
            const token = this.getToken();
            const gistId = this.getGistId();
            
            if (!token || !gistId) {
                throw new Error('请先配置 GitHub Token 和 Gist ID');
            }
            
            const response = await fetch(`https://api.github.com/gists/${gistId}`, {
                method: 'GET',
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });
            
            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error('Gist 不存在，请先同步一次');
                }
                const error = await response.json().catch(() => ({ message: '获取失败' }));
                throw new Error(error.message || `HTTP ${response.status}`);
            }
            
            const result = await response.json();
            const file = result.files[this.GIST_FILENAME];
            
            if (!file) {
                throw new Error('Gist 中未找到词语库文件');
            }
            
            return JSON.parse(file.content);
        },
        
        /**
         * 上传词语库到云端
         */
        async uploadWordBank(wordBank) {
            try {
                const result = await this.updateGist(wordBank);
                return {
                    success: true,
                    gistId: result.id,
                    message: '同步成功！'
                };
            } catch (error) {
                console.error('上传失败', error);
                return {
                    success: false,
                    message: error.message || '同步失败'
                };
            }
        },
        
        /**
         * 从云端下载词语库
         */
        async downloadWordBank() {
            try {
                const data = await this.fetchGist();
                return {
                    success: true,
                    data: data,
                    message: '加载成功！'
                };
            } catch (error) {
                console.error('下载失败', error);
                return {
                    success: false,
                    message: error.message || '加载失败'
                };
            }
        }
    };
    
    global.CloudSync = CloudSync;
    if (typeof window !== 'undefined') {
        window.CloudSync = CloudSync;
    }
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);


