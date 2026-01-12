import { LocalDatabase } from './db.js';

export class AppState {
    constructor() {
        this.db = new LocalDatabase();
        this.pins = [];
        this.listeners = [];

        // Viewer State
        this.zoom = 1;
        this.pan = { x: 0, y: 0 };

        // Undo/Redo
        this.history = [];
        this.historyIndex = -1;
        this.isUndoing = false;
    }

    async init() {
        await this.db.init();
        this.pins = await this.db.getAllPins();
        // Seed history with current DB state so undo/redo have a baseline
        this.history = [JSON.parse(JSON.stringify(this.pins))];
        this.historyIndex = 0;
        this._notify();
    }

    subscribe(listener) {
        this.listeners.push(listener);
    }

    _notify(eventType = 'REFRESH', payload = null) {
        this.listeners.forEach(cb => cb(this.pins, { zoom: this.zoom, pan: this.pan }, eventType, payload));
    }

    _saveToHistory() {
        if (this.isUndoing) return;

        // Truncate future if we branch off
        if (this.historyIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.historyIndex + 1);
        }

        // Deep copy pins for snapshot
        const snapshot = JSON.parse(JSON.stringify(this.pins));
        this.history.push(snapshot);
        this.historyIndex++;

        // Limit history size
        if (this.history.length > 50) {
            this.history.shift();
            this.historyIndex--;
        }
    }

    async addPin(pin) {
        this._saveToHistory();
        this.pins.push(pin);
        await this.db.savePin(pin);
        this._notify('ADD', pin);
    }

    async updatePin(updatedPin) {
        this._saveToHistory();
        const index = this.pins.findIndex(p => p.id === updatedPin.id);
        if (index !== -1) {
            this.pins[index] = updatedPin;
            await this.db.savePin(updatedPin);
            this._notify('UPDATE', updatedPin);
        }
    }

    async deletePin(id) {
        this._saveToHistory();
        this.pins = this.pins.filter(p => p.id !== id);
        await this.db.deletePin(id);
        this._notify('DELETE', id);
    }

    async clearBoard() {
        this._saveToHistory();
        for (const pin of this.pins) {
            await this.db.deletePin(pin.id);
        }
        this.pins = [];
        this._notify('REFRESH');
    }

    async undo() {
        if (this.historyIndex > 0) {
            this.isUndoing = true;
            this.historyIndex--;
            this.pins = JSON.parse(JSON.stringify(this.history[this.historyIndex]));

            // Ensure DB is fully synced to the reverted state before notifying listeners
            await this._syncStateToDB();

            this.isUndoing = false;
            this._notify('REFRESH');
        }
    }

    async redo() {
        if (this.historyIndex < this.history.length - 1) {
            this.isUndoing = true;
            this.historyIndex++;
            this.pins = JSON.parse(JSON.stringify(this.history[this.historyIndex]));
            await this._syncStateToDB();
            this.isUndoing = false;
            this._notify('REFRESH');
        }
    }

    async _syncStateToDB() {
        // Delete any pins in DB that are no longer present in memory,
        // then save/update all current pins.
        const existing = await this.db.getAllPins();
        const currentIds = new Set(this.pins.map(p => p.id));

        for (const pin of existing) {
            if (!currentIds.has(pin.id)) {
                await this.db.deletePin(pin.id);
            }
        }

        for (const pin of this.pins) {
            await this.db.savePin(pin);
        }
    }

    setZoom(val) {
        this.zoom = val;
        this._notify('VIEW_CHANGE');
    }

    setPan(x, y) {
        this.pan = { x, y };
        this._notify('VIEW_CHANGE');
    }
}
