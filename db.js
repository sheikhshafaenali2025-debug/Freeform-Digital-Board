/**
 * LocalDatabase Service
 * Acts as the "Backend" for the application, storing data persistently in the browser.
 */
export class LocalDatabase {
    constructor() {
        this.dbName = 'StudentBoardDB';
        this.version = 1;
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('pins')) {
                    db.createObjectStore('pins', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('meta')) {
                    db.createObjectStore('meta', { keyPath: 'key' });
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                console.log('✅ Backend (IndexedDB) Connected');
                resolve(this);
            };

            request.onerror = (event) => {
                console.error('❌ Backend Connection Failed', event);
                reject(event);
            };
        });
    }

    async getAllPins() {
        return this._transaction('pins', 'readonly', (store) => store.getAll());
    }

    async savePin(pin) {
        // Imitate network delay for realism if desired, but keep it fast for UX
        return this._transaction('pins', 'readwrite', (store) => store.put(pin));
    }

    async deletePin(id) {
        return this._transaction('pins', 'readwrite', (store) => store.delete(id));
    }

    async saveSnapshot(name, state) {
        // Save entire board state as a snapshot
        const snapshot = {
            id: `snap_${Date.now()}`,
            name,
            date: new Date().toISOString(),
            data: state
        };
        // We could store this in a 'snapshots' store if we added one, 
        // for now let's just log it or we can add that store in V2.
        // Let's dynamically add it if needed, or just use 'meta' for simple storage.
        return snapshot;
    }

    // Helper to wrap IDB requests in Promises
    _transaction(storeName, mode, callback) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Database not initialized'));
                return;
            }
            const transaction = this.db.transaction(storeName, mode);
            const store = transaction.objectStore(storeName);
            const request = callback(store);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
}

export const dbProperties = {
    DB_NAME: 'StudentBoardDB'
};
