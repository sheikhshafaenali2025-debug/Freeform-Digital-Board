(function () {
    'use strict';

    // --- 1. Database Layer (IndexedDB) ---
    class LocalDatabase {
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
                };

                request.onsuccess = (event) => {
                    this.db = event.target.result;
                    console.log('✅ IndexedDB connected');
                    resolve(this);
                };

                request.onerror = (event) => {
                    console.error('❌ DB Connection Failed', event);
                    reject(event);
                };
            });
        }

        async getAllPins() {
            return this._transaction('pins', 'readonly', (store) => store.getAll());
        }

        async savePin(pin) {
            return this._transaction('pins', 'readwrite', (store) => store.put(pin));
        }

        async deletePin(id) {
            return this._transaction('pins', 'readwrite', (store) => store.delete(id));
        }

        _transaction(storeName, mode, callback) {
            return new Promise((resolve, reject) => {
                if (!this.db) return reject(new Error('DB not init'));
                const tx = this.db.transaction(storeName, mode);
                const store = tx.objectStore(storeName);
                const req = callback(store);
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
        }
    }

    // --- 2. Pin Component ---
    class PinComponent {
        constructor(data, events) {
            this.data = data;
            this.events = events;
            this.element = this._createElement();
        }

        _createElement() {
            const el = document.createElement('div');
            el.className = `pin type-${this.data.type} color-${this.data.color || 'yellow'}`;
            el.id = this.data.id;
            this.updatePosition(el);

            if (this.data.type === 'text') this._buildTextPin(el);
            else if (this.data.type === 'image') this._buildImagePin(el);
            else if (this.data.type === 'todo') this._buildTodoPin(el);

            this._addListeners(el);
            return el;
        }

        updatePosition(el = this.element) {
            el.style.left = `${this.data.x}px`;
            el.style.top = `${this.data.y}px`;
        }

        _buildTextPin(el) {
            el.innerHTML = `
                <div class="pin-header">
                    <div class="pin-drag-handle"><i class="fa-solid fa-grip-lines"></i> <span class="pin-date">Note</span></div>
                    <button class="pin-delete"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div class="pin-content" contenteditable="true" spellcheck="false">${this.data.content || ''}</div>
            `;
        }

        _buildImagePin(el) {
            el.innerHTML = `
                <div class="pin-header">
                    <div class="pin-drag-handle"><i class="fa-regular fa-image"></i></div>
                    <button class="pin-delete"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <img src="${this.data.content}" draggable="false" style="width:100%; pointer-events: none;" />
            `;
        }

        _buildTodoPin(el) {
            el.innerHTML = `
                <div class="pin-header">
                    <div class="pin-drag-handle"><i class="fa-solid fa-list-check"></i> To-Do</div>
                    <button class="pin-delete"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div class="pin-content" contenteditable="true">${this.data.content || '- [ ] Task 1'}</div>
            `;
        }

        _addListeners(el) {
            const deleteBtn = el.querySelector('.pin-delete');
            if (deleteBtn) {
                deleteBtn.style.zIndex = '100';
                deleteBtn.style.position = 'relative';

                deleteBtn.addEventListener('mousedown', e => e.stopPropagation());
                deleteBtn.addEventListener('click', e => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.events.onDelete(this.data.id);
                });
            }

            const content = el.querySelector('.pin-content');
            if (content) {
                content.addEventListener('blur', () => {
                    const newContent = content.innerHTML;
                    if (newContent !== this.data.content) {
                        this.data.content = newContent;
                        this.events.onUpdate(this.data);
                    }
                });
                content.addEventListener('mousedown', e => e.stopPropagation());
            }
        }
    }

    // --- 3. App State ---
    class AppState {
        constructor() {
            this.db = new LocalDatabase();
            this.pins = [];
            this.listeners = [];
            this.zoom = 1;
            this.pan = { x: 0, y: 0 };
            this.history = [];
            this.historyIndex = -1;
            this.isUndoing = false;
        }

        async init() {
            await this.db.init();
            this.pins = await this.db.getAllPins();
            // initialize history
            this.history = [JSON.parse(JSON.stringify(this.pins))];
            this.historyIndex = 0;
            this._notify();
        }

        subscribe(cb) { this.listeners.push(cb); }

        _notify(type = 'REFRESH', payload = null) {
            this.listeners.forEach(cb => cb(this.pins, { zoom: this.zoom, pan: this.pan }, type, payload));
        }

        _saveHistory() {
            if (this.isUndoing) return;
            if (this.historyIndex < this.history.length - 1) {
                this.history = this.history.slice(0, this.historyIndex + 1);
            }
            this.history.push(JSON.parse(JSON.stringify(this.pins)));
            this.historyIndex++;
            if (this.history.length > 50) {
                this.history.shift();
                this.historyIndex--;
            }
        }

        async addPin(pin) {
            this._saveHistory();
            this.pins.push(pin);
            await this.db.savePin(pin);
            this._notify('ADD', pin);
        }

        async updatePin(pin) {
            this._saveHistory();
            const idx = this.pins.findIndex(p => p.id === pin.id);
            if (idx !== -1) {
                this.pins[idx] = pin;
                await this.db.savePin(pin);
                this._notify('UPDATE', pin);
            }
        }

        async deletePin(id) {
            this._saveHistory();
            this.pins = this.pins.filter(p => p.id !== id);
            await this.db.deletePin(id);
            this._notify('DELETE', id);
        }

        // ✅ FIXED UNDO/REDO
        async undo() {
            if (this.historyIndex > 0) {
                this.isUndoing = true;
                this.historyIndex--;
                this.pins = JSON.parse(JSON.stringify(this.history[this.historyIndex]));
                await this._syncDBFull();
                this.isUndoing = false;
                this._notify('REFRESH');
            }
        }

        async redo() {
            if (this.historyIndex < this.history.length - 1) {
                this.isUndoing = true;
                this.historyIndex++;
                this.pins = JSON.parse(JSON.stringify(this.history[this.historyIndex]));
                await this._syncDBFull();
                this.isUndoing = false;
                this._notify('REFRESH');
            }
        }

        // Full DB sync (adds, updates, removes)
        async _syncDBFull() {
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

        setZoom(z) { this.zoom = z; this._notify('VIEW_CHANGE'); }
        setPan(x, y) { this.pan = { x, y }; this._notify('VIEW_CHANGE'); }
    }

    // --- 4. Canvas Controller ---
    class CanvasController {
        constructor(state) {
            this.state = state;
            this.container = document.getElementById('canvas-container');
            this.content = document.getElementById('canvas-content');
            this.zoomLevelEl = document.getElementById('zoom-level');
            this.pinMap = new Map();
            this.isPanning = false;
            this.panStart = { x: 0, y: 0 };
            this.panOffset = { x: 0, y: 0 };
            this.activeDrag = null;
            this._setupListeners();
        }

        handleUpdate(pins, view, type, payload) {
            this.content.style.transform = `translate(${view.pan.x}px, ${view.pan.y}px) scale(${view.zoom})`;
            if (this.zoomLevelEl) this.zoomLevelEl.textContent = `${Math.round(view.zoom * 100)}%`;
            if (type === 'REFRESH') this._renderAll(pins);
            else if (type === 'ADD') this._renderPin(payload);
            else if (type === 'UPDATE') this._updatePinDOM(payload);
            else if (type === 'DELETE') this._removePinDOM(payload);
        }

        _renderAll(pins) {
            this.content.innerHTML = '';
            const hint = document.createElement('div');
            hint.className = 'hint-text';
            hint.innerHTML = '<h3>This is your canvas — fill it with whatever\'s on your mind! 🌟</h3>';
            this.content.appendChild(hint);
            this.pinMap.clear();
            pins.forEach(p => this._renderPin(p));
        }

        _renderPin(pin) {
            if (this.pinMap.has(pin.id)) return;
            const cmp = new PinComponent(pin, {
                onUpdate: d => this.state.updatePin(d),
                onDelete: id => this.state.deletePin(id)
            });

            cmp.element.style.touchAction = 'none';
            const onPointerDown = (e) => {
                if (e.target.closest('.pin-delete') || e.target.closest('.pin-content')) return;
                e.preventDefault();
                e.stopPropagation();

                this.activeDrag = {
                    id: pin.id,
                    start: { x: e.clientX, y: e.clientY },
                    pinStart: { x: pin.x, y: pin.y }
                };

                cmp.element.classList.add('selected');
                try { cmp.element.setPointerCapture(e.pointerId); } catch (err) {}

                const onMove = (ev) => {
                    if (!this.activeDrag || this.activeDrag.id !== pin.id) return;
                    const dx = (ev.clientX - this.activeDrag.start.x) / this.state.zoom;
                    const dy = (ev.clientY - this.activeDrag.start.y) / this.state.zoom;
                    const nx = this.activeDrag.pinStart.x + dx;
                    const ny = this.activeDrag.pinStart.y + dy;
                    cmp.element.style.left = `${nx}px`;
                    cmp.element.style.top = `${ny}px`;
                    this.activeDrag.last = { x: nx, y: ny };
                };

                const onUp = (ev) => {
                    try { cmp.element.releasePointerCapture(ev.pointerId); } catch (err) {}
                    cmp.element.classList.remove('selected');
                    if (this.activeDrag && this.activeDrag.last) {
                        const p = this.state.pins.find(pp => pp.id === pin.id);
                        if (p) this.state.updatePin({ ...p, x: this.activeDrag.last.x, y: this.activeDrag.last.y });
                    }
                    this.activeDrag = null;
                    window.removeEventListener('pointermove', onMove);
                    window.removeEventListener('pointerup', onUp);
                };

                window.addEventListener('pointermove', onMove);
                window.addEventListener('pointerup', onUp);
            };

            cmp.element.addEventListener('pointerdown', onPointerDown, { capture: true });
            this.content.appendChild(cmp.element);
            this.pinMap.set(pin.id, cmp);
        }

        _updatePinDOM(pin) {
            const cmp = this.pinMap.get(pin.id);
            if (cmp) {
                cmp.data = pin;
                cmp.updatePosition();
            }
        }

        _removePinDOM(id) {
            const cmp = this.pinMap.get(id);
            if (cmp) {
                cmp.element.remove();
                this.pinMap.delete(id);
            }
        }

        _setupListeners() {
            this.container.addEventListener('pointerdown', (e) => {
                if (e.target.closest && e.target.closest('.pin')) return;
                if (e.button === 1 || e.target === this.container || e.target === this.content) {
                    this.isPanning = true;
                    this.panStart = { x: e.clientX, y: e.clientY };
                    this.panOffset = { ...this.state.pan };

                    const onMove = (ev) => {
                        if (!this.isPanning) return;
                        const dx = ev.clientX - this.panStart.x;
                        const dy = ev.clientY - this.panStart.y;
                        this.state.setPan(this.panOffset.x + dx, this.panOffset.y + dy);
                    };

                    const onUp = () => {
                        this.isPanning = false;
                        window.removeEventListener('pointermove', onMove);
                        window.removeEventListener('pointerup', onUp);
                    };

                    window.addEventListener('pointermove', onMove);
                    window.addEventListener('pointerup', onUp);
                }
            });

            this.container.addEventListener('wheel', (e) => {
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    const delta = e.deltaY > 0 ? 0.9 : 1.1;
                    const newZoom = Math.min(Math.max(0.1, this.state.zoom * delta), 5);
                    this.state.setZoom(newZoom);
                }
            }, { passive: false });
        }
    }

    // --- 5. Main Initialization ---
    document.addEventListener('DOMContentLoaded', async () => {
        const state = new AppState();
        const canvas = new CanvasController(state);
        state.subscribe((pins, view, type, payload) => canvas.handleUpdate(pins, view, type, payload));
        await state.init();

        const getCenter = () => {
            const cx = (window.innerWidth / 2 - state.pan.x) / state.zoom;
            const cy = (window.innerHeight / 2 - state.pan.y) / state.zoom;
            return { x: cx - 100, y: cy - 100 };
        };

        const addBtn = (id) => document.getElementById(id);

        addBtn('add-note-btn').onclick = () => {
            const p = getCenter();
            state.addPin({ id: crypto.randomUUID(), type: 'text', x: p.x, y: p.y, content: 'New Note', color: 'yellow' });
        };

        addBtn('add-todo-btn').onclick = () => {
            const p = getCenter();
            state.addPin({ id: crypto.randomUUID(), type: 'todo', x: p.x, y: p.y, content: '- [ ] Task 1', color: 'blue' });
        };

        addBtn('zoom-in').onclick = () => state.setZoom(Math.min(state.zoom + 0.1, 5));
        addBtn('zoom-out').onclick = () => state.setZoom(Math.max(state.zoom - 0.1, 0.1));

        addBtn('undo-btn').onclick = async () => await state.undo();
        addBtn('redo-btn').onclick = async () => await state.redo();

        addBtn('save-snap-btn').onclick = () => {
            state.db.savePin('QuickSave', state.pins);
            alert('Saved to DB!');
        };

        const themeBtn = addBtn('theme-toggle');
        themeBtn.onclick = () => {
            const b = document.body;
            if (b.getAttribute('data-theme') === 'dark') b.removeAttribute('data-theme');
            else b.setAttribute('data-theme', 'dark');
        };

        // === Background Selector ===
        const bgBtn = document.getElementById('bg-select-btn');
        const backgrounds = ['classic', 'blobs', 'waves', 'grid', 'galaxy'];
        let currentIndex = 0;

        const savedBg = localStorage.getItem('inkboard-bg');
        if (savedBg) {
            document.body.setAttribute('data-bg', savedBg);
            currentIndex = backgrounds.indexOf(savedBg);
        } else {
            document.body.setAttribute('data-bg', 'classic');
        }

        bgBtn.addEventListener('click', () => {
            currentIndex = (currentIndex + 1) % backgrounds.length;
            const nextBg = backgrounds[currentIndex];
            document.body.setAttribute('data-bg', nextBg);
            localStorage.setItem('inkboard-bg', nextBg);
            bgBtn.title = `Background: ${nextBg}`;
        });

        // === Image Upload ===
        addBtn('add-image-btn').onclick = () => document.getElementById('image-upload').click();
        document.getElementById('image-upload').onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                const r = new FileReader();
                r.onload = (evt) => {
                    const p = getCenter();
                    state.addPin({
                        id: crypto.randomUUID(),
                        type: 'image',
                        x: p.x,
                        y: p.y,
                        content: evt.target.result,
                        color: 'white'
                    });
                };
                r.readAsDataURL(file);
            }
        };
    });
})();


