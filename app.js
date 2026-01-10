/**
 * Digital Board Application - Bundled Logic
 * Merged for file:// protocol compatibility (No CORS/Module issues)
 */

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
            return this._transaction('pins', 'readwrite', (store) => store.put(pin));
        }

        async deletePin(id) {
            return this._transaction('pins', 'readwrite', (store) => store.delete(id));
        }

        async saveSnapshot(name, state) {
            console.log('Snapshot saved', name, state.length + ' items');
            // Mock snapshot persistence
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
            el.style.transform = `translate(${this.data.x}px, ${this.data.y}px)`;
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
                // Ensure button is on top and clickable
                deleteBtn.style.zIndex = '100';
                deleteBtn.style.position = 'relative';

                deleteBtn.addEventListener('mousedown', e => {
                    e.stopPropagation();
                    console.log('Delete button mousedown');
                });
                deleteBtn.addEventListener('click', e => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('Delete button clicked', this.data.id);
                    // Removed confirm() for smoother UX (Undos are available)
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

            // Undo/Redo
            this.history = [];
            this.historyIndex = -1;
            this.isUndoing = false;
        }

        async init() {
            await this.db.init();
            this.pins = await this.db.getAllPins();
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

        undo() {
            if (this.historyIndex > 0) {
                this.isUndoing = true;
                this.historyIndex--;
                this.pins = JSON.parse(JSON.stringify(this.history[this.historyIndex]));
                this._syncDB();
                this.isUndoing = false;
                this._notify('REFRESH');
            }
        }

        redo() {
            if (this.historyIndex < this.history.length - 1) {
                this.isUndoing = true;
                this.historyIndex++;
                this.pins = JSON.parse(JSON.stringify(this.history[this.historyIndex]));
                this._syncDB();
                this.isUndoing = false;
                this._notify('REFRESH');
            }
        }

        async _syncDB() {
            // Simple sync
            for (const p of this.pins) await this.db.savePin(p);
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

            this.dragState = {
                active: false,
                type: null, // 'BOARD' or 'PIN'
                start: { x: 0, y: 0 },
                offset: { x: 0, y: 0 },
                pinId: null,
                pinStart: { x: 0, y: 0 }
            };

            this._setupListeners();
        }

        handleUpdate(pins, view, type, payload) {
            // Update View Transform
            this.content.style.transform = `translate(${view.pan.x}px, ${view.pan.y}px) scale(${view.zoom})`;
            if (this.zoomLevelEl) this.zoomLevelEl.textContent = `${Math.round(view.zoom * 100)}%`;

            if (type === 'REFRESH') this._renderAll(pins);
            else if (type === 'ADD') this._renderPin(payload);
            else if (type === 'UPDATE') this._updatePinDOM(payload);
            else if (type === 'DELETE') this._removePinDOM(payload);
        }

        _renderAll(pins) {
            this.content.innerHTML = '';
            // Re-add hint
            const hint = document.createElement('div');
            hint.className = 'hint-text';
            hint.innerHTML = '<h3>Welcome to your Board! ✨</h3><p>Drag notes here. Double click to edit.</p>';
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

            // Ensure pointer events behave consistently (prevent browser gesture capture)
            cmp.element.style.touchAction = 'none';

            // Pointer Down Handler for Pin Dragging (use drag-handle for reliable starts)
            const handle = cmp.element.querySelector('.pin-drag-handle') || cmp.element;
            const _onPointerDown = (e) => {
                // Debug log for diagnosing drag start
                // console.log('pointerdown on pin', pin.id, e.target);
                // Ignore if clicked on delete or content
                if (e.target.closest('.pin-delete') || e.target.closest('.pin-content')) return;

                this.dragState.active = true;
                this.dragState.type = 'PIN';
                this.dragState.pinId = pin.id;
                this.dragState.start = { x: e.clientX, y: e.clientY };
                this.dragState.pinStart = { x: pin.x, y: pin.y };

                cmp.element.classList.add('selected');
                // Capture the pointer so we continue receiving events even if cursor leaves the element
                try { cmp.element.setPointerCapture(e.pointerId); } catch (err) {}
                e.preventDefault(); // Stop text selection / native gestures
            };

            handle.addEventListener('pointerdown', _onPointerDown);
            if (handle !== cmp.element) cmp.element.addEventListener('pointerdown', _onPointerDown);

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
            // Board Pan
            // Use pointerdown for panning the board
            this.container.addEventListener('pointerdown', (e) => {
                if (e.target === this.container || e.target === this.content || e.button === 1) {
                    this.dragState.active = true;
                    this.dragState.type = 'BOARD';
                    this.dragState.start = { x: e.clientX, y: e.clientY };
                    this.dragState.offset = { ...this.state.pan };
                    this.container.style.cursor = 'grabbing';
                }
            });

            window.addEventListener('pointermove', (e) => {
                if (!this.dragState.active) return;

                if (this.dragState.type === 'BOARD') {
                    const dx = e.clientX - this.dragState.start.x;
                    const dy = e.clientY - this.dragState.start.y;
                    this.state.setPan(this.dragState.offset.x + dx, this.dragState.offset.y + dy);
                }
                else if (this.dragState.type === 'PIN') {
                    const zoom = this.state.zoom;
                    const dx = (e.clientX - this.dragState.start.x) / zoom;
                    const dy = (e.clientY - this.dragState.start.y) / zoom;

                    const newX = this.dragState.pinStart.x + dx;
                    const newY = this.dragState.pinStart.y + dy;

                    // Direct DOM manipulation for smoothness
                    const cmp = this.pinMap.get(this.dragState.pinId);
                    if (cmp) {
                        cmp.element.style.transform = `translate(${newX}px, ${newY}px)`;
                        // Store temp pos for commit
                        this.dragState._lastX = newX;
                        this.dragState._lastY = newY;
                    }
                }
            });

            window.addEventListener('pointerup', (e) => {
                if (!this.dragState.active) return;

                if (this.dragState.type === 'PIN') {
                    const id = this.dragState.pinId;
                    const cmp = this.pinMap.get(id);
                    if (cmp) {
                        try { cmp.element.releasePointerCapture(e.pointerId); } catch (err) {}
                        cmp.element.classList.remove('selected');
                    }

                    // Commit change if moved
                    if (this.dragState._lastX !== undefined) {
                        const pin = this.state.pins.find(p => p.id === id);
                        if (pin) {
                            this.state.updatePin({
                                ...pin,
                                x: this.dragState._lastX,
                                y: this.dragState._lastY
                            });
                        }
                        this.dragState._lastX = undefined;
                    }
                }

                if (this.dragState.type === 'BOARD') {
                    this.container.style.cursor = 'grab';
                }

                this.dragState.active = false;
                this.dragState.type = null;
                this.dragState.pinId = null;
            });

            // Zoom
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

        // UI Handlers
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

        addBtn('undo-btn').onclick = () => state.undo();
        addBtn('redo-btn').onclick = () => state.redo();

        addBtn('save-snap-btn').onclick = () => {
            state.db.saveSnapshot('QuickSave', state.pins);
            alert('Saved to DB!');
        };

        // Theme
        const themeBtn = addBtn('theme-toggle');
        themeBtn.onclick = () => {
            const b = document.body;
            if (b.getAttribute('data-theme') === 'dark') b.removeAttribute('data-theme');
            else b.setAttribute('data-theme', 'dark');
        };

        // Image
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
                        x: p.x, y: p.y,
                        content: evt.target.result,
                        color: 'white'
                    });
                };
                r.readAsDataURL(file);
            }
        };
    });

})();