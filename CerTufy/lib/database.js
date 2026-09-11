// lib/database.js

// lib/database.js

// ============================================
// Database Configuration
// ============================================
const DB_CONFIG = {
    name: 'CerTufyDB',
    version: 5,
    stores: {
        watchHistory: {
            keyPath: 'id',
            autoIncrement: true,
            indexes: [
                { name: 'videoId', keyPath: 'videoId', unique: false },
                { name: 'playlistId', keyPath: 'playlistId', unique: false },
                { name: 'userId', keyPath: 'userId', unique: false },
                { name: 'completed', keyPath: 'completed', unique: false },
                { name: 'timestamp', keyPath: 'lastUpdated', unique: false }
            ]
        },
        certificates: {
            keyPath: 'id',
            autoIncrement: true,
            indexes: [
                { name: 'uniqueKey', keyPath: 'uniqueKey', unique: true },
                { name: 'email', keyPath: 'userEmail', unique: false },
                { name: 'videoId', keyPath: 'videoId', unique: false },
                { name: 'playlistId', keyPath: 'playlistId', unique: false },
                { name: 'verificationCode', keyPath: 'verificationCode', unique: true },
                { name: 'generatedDate', keyPath: 'generatedDate', unique: false }
            ]
        },
        users: {
            keyPath: 'email',
            autoIncrement: false,
            indexes: [
                { name: 'name', keyPath: 'name', unique: false },
                { name: 'created', keyPath: 'created', unique: false }
            ]
        },
        analytics: {
            keyPath: 'id',
            autoIncrement: true,
            indexes: [
                { name: 'type', keyPath: 'type', unique: false },
                { name: 'timestamp', keyPath: 'timestamp', unique: false },
                { name: 'userId', keyPath: 'userId', unique: false }
            ]
        },
        settings: {
            keyPath: 'key',
            autoIncrement: false,
            indexes: []
        }
    }
};

// ============================================
// Database Manager Class
// ============================================
class DatabaseManager {
    constructor() {
        this.db = null;
        this.initialized = false;
    }

    // Initialize database
    async init() {
        if (this.initialized && this.db) {
            return this.db;
        }

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_CONFIG.name, DB_CONFIG.version);

            request.onerror = () => {
                reject(new Error(`Failed to open database: ${request.error}`));
            };

            request.onsuccess = () => {
                this.db = request.result;
                this.initialized = true;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                this.createStores(db);
            };
        });
    }

    // Create object stores
    createStores(db) {
        Object.entries(DB_CONFIG.stores).forEach(([storeName, config]) => {
            if (!db.objectStoreNames.contains(storeName)) {
                const store = db.createObjectStore(storeName, {
                    keyPath: config.keyPath,
                    autoIncrement: config.autoIncrement
                });

                config.indexes.forEach(index => {
                    store.createIndex(index.name, index.keyPath, { unique: index.unique || false });
                });
            }
        });
    }

    // Ensure database is initialized
    async ensureDB() {
        if (!this.initialized || !this.db) {
            await this.init();
        }
        return this.db;
    }

    // Generic CRUD operations
    async add(storeName, data) {
        const db = await this.ensureDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.add(data);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async get(storeName, id) {
        const db = await this.ensureDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getAll(storeName) {
        const db = await this.ensureDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async update(storeName, data) {
        const db = await this.ensureDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put(data);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async delete(storeName, id) {
        const db = await this.ensureDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async clear(storeName) {
        const db = await this.ensureDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // Index queries
    async getByIndex(storeName, indexName, value) {
        const db = await this.ensureDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const index = store.index(indexName);
            const request = index.getAll(value);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getByIndexRange(storeName, indexName, lower, upper, includeLower = true, includeUpper = true) {
        const db = await this.ensureDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const index = store.index(indexName);
            const range = IDBKeyRange.bound(lower, upper, !includeLower, !includeUpper);
            const request = index.getAll(range);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getFirstByIndex(storeName, indexName, value) {
        const db = await this.ensureDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const index = store.index(indexName);
            const request = index.get(value);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Count operations
    async count(storeName) {
        const db = await this.ensureDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.count();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async countByIndex(storeName, indexName, value) {
        const db = await this.ensureDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const index = store.index(indexName);
            const request = index.count(value);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Delete by index
    async deleteByIndex(storeName, indexName, value) {
        const items = await this.getByIndex(storeName, indexName, value);
        const results = [];
        for (const item of items) {
            const id = item.id || item[DB_CONFIG.stores[storeName]?.keyPath || 'id'];
            if (id) {
                await this.delete(storeName, id);
                results.push(item);
            }
        }
        return results;
    }

    // Batch operations
    async addBatch(storeName, items) {
        const db = await this.ensureDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const results = [];
            
            transaction.oncomplete = () => resolve(results);
            transaction.onerror = () => reject(transaction.error);

            items.forEach(item => {
                const request = store.add(item);
                request.onsuccess = () => results.push(request.result);
            });
        });
    }

    async updateBatch(storeName, items) {
        const db = await this.ensureDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const results = [];
            
            transaction.oncomplete = () => resolve(results);
            transaction.onerror = () => reject(transaction.error);

            items.forEach(item => {
                const request = store.put(item);
                request.onsuccess = () => results.push(request.result);
            });
        });
    }

    // Transaction wrapper for multiple operations
    async transaction(storeNames, mode, callback) {
        const db = await this.ensureDB();
        const transaction = db.transaction(storeNames, mode);
        const stores = {};
        
        storeNames.forEach(name => {
            stores[name] = transaction.objectStore(name);
        });

        try {
            const result = await callback(stores, transaction);
            await new Promise((resolve, reject) => {
                transaction.oncomplete = resolve;
                transaction.onerror = () => reject(transaction.error);
            });
            return result;
        } catch (error) {
            transaction.abort();
            throw error;
        }
    }

    // Export all data
    async exportAll() {
        const stores = Object.keys(DB_CONFIG.stores);
        const data = {};
        
        for (const storeName of stores) {
            data[storeName] = await this.getAll(storeName);
        }
        
        return {
            version: DB_CONFIG.version,
            exportedAt: new Date().toISOString(),
            data
        };
    }

    // Import all data (clears existing)
    async importAll(exportData) {
        if (!exportData.data) {
            throw new Error('Invalid export data format');
        }

        const stores = Object.keys(DB_CONFIG.stores);
        
        for (const storeName of stores) {
            if (exportData.data[storeName]) {
                await this.clear(storeName);
                if (exportData.data[storeName].length > 0) {
                    await this.addBatch(storeName, exportData.data[storeName]);
                }
            }
        }
    }

    // Clear all data
    async clearAll() {
        const stores = Object.keys(DB_CONFIG.stores);
        for (const storeName of stores) {
            await this.clear(storeName);
        }
    }

    // Close connection
    close() {
        if (this.db) {
            this.db.close();
            this.db = null;
            this.initialized = false;
        }
    }
}

// ============================================
// Database Instance (Singleton)
// ============================================
let dbInstance = null;

export function getDatabase() {
    if (!dbInstance) {
        dbInstance = new DatabaseManager();
    }
    return dbInstance;
}

// ============================================
// Helper Functions
// ============================================
export function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

export function generateVerificationCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 12; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

export function generateUniqueKey(videoId, playlistId, email) {
    return `${playlistId || 'single'}_${videoId}_${email}`.toLowerCase()
        .replace(/[^a-z0-9_]/g, '');
}

export function formatTime(seconds) {
    if (!seconds || seconds < 0) return '0h 0m';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
}

export function formatDate(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

export function getVideoIdFromUrl(url) {
    const match = url.match(/(?:v=|\/)([a-zA-Z0-9_-]{11})(?:[&?]|$)/);
    return match ? match[1] : null;
}

export function getPlaylistIdFromUrl(url) {
    const match = url.match(/[&?]list=([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
}

export function parseTimeToSeconds(timeStr) {
    if (!timeStr) return 0;
    const parts = timeStr.split(':').map(Number);
    if (parts.length === 3) {
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
        return parts[0] * 60 + parts[1];
    }
    return parseInt(parts[0]) || 0;
}

export function secondsToTimeStr(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${minutes}:${String(secs).padStart(2, '0')}`;
}

export function isYouTubeUrl(url) {
    return url && (url.includes('youtube.com/watch') || url.includes('youtu.be/'));
}

export function isYouTubePlaylistUrl(url) {
    return url && url.includes('list=');
}

// ============================================
// Export default
// ============================================
export default {
    getDatabase,
    generateId,
    generateVerificationCode,
    generateUniqueKey,
    formatTime,
    formatDate,
    getVideoIdFromUrl,
    getPlaylistIdFromUrl,
    parseTimeToSeconds,
    secondsToTimeStr,
    isYouTubeUrl,
    isYouTubePlaylistUrl
};