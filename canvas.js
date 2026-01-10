import { PinComponent } from './pin.js';

export class CanvasController {
    constructor(state) {
        this.state = state;
        this.container = document.getElementById('canvas-container');
        this.content = document.getElementById('canvas-content');
        this.zoomLevelEl = document.getElementById('zoom-level');
        this.pinMap = new Map(); // id -> Element

        // Drag State
        this.isDraggingBoard = false;
        this.isDraggingPin = false;
        this.dragStart = { x: 0, y: 0 };
        this.dragOffset = { x: 0, y: 0 }; // Pan buffer
        this.activePinId = null;

        this._setupListeners();
        this._renderLoop(); // Use requestAnimationFrame if needed, but event-driven is fine via notify
    }

    handleUpdate(pins, viewState, type, payload) {
        // View Update
        this.content.style.transform = `translate(${viewState.pan.x}px, ${viewState.pan.y}px) scale(${viewState.zoom})`;
        this.zoomLevelEl.textContent = `${Math.round(viewState.zoom * 100)}%`;

        // Pin Update strategy
        if (type === 'REFRESH') {
            this._renderAll(pins);
        } else if (type === 'ADD') {
            this._renderPin(payload);
        } else if (type === 'UPDATE') {
            this._updatePinDOM(payload);
        } else if (type === 'DELETE') {
            this._removePinDOM(payload);
        }
    }

    _renderAll(pins) {
        this.content.innerHTML = '';
        this.content.appendChild(document.getElementById('onboarding-hint')); // Keep hint
        this.pinMap.clear();
        pins.forEach(pin => this._renderPin(pin));
    }

    _renderPin(data) {
        if (this.pinMap.has(data.id)) return;

        const pinCmp = new PinComponent(data, {
            onUpdate: (d) => this.state.updatePin(d),
            onDelete: (id) => this.state.deletePin(id)
        });

        this.content.appendChild(pinCmp.element);
        this.pinMap.set(data.id, pinCmp);

        // Attach MouseDown for Dragging directly to the element wrapper
        pinCmp.element.addEventListener('mousedown', (e) => this._onPinMouseDown(e, data.id));
    }

    _updatePinDOM(data) {
        const cmp = this.pinMap.get(data.id);
        if (cmp) {
            cmp.data = data;
            cmp.updatePosition();
            // Content updates are usually handled by internal listeners mostly
        }
    }

    _removePinDOM(id) {
        const cmp = this.pinMap.get(id);
        if (cmp) {
            cmp.element.remove();
            this.pinMap.delete(id);
        }
    }

    // --- Interaction Logic ---

    _setupListeners() {
        // Board Panning (Space + Drag or Middle Click)
        this.container.addEventListener('mousedown', (e) => {
            if (e.target === this.container || e.target === this.content || (e.button === 1)) {
                this.isDraggingBoard = true;
                this.dragStart = { x: e.clientX, y: e.clientY };
                this.dragOffset = { ...this.state.pan };
                this.container.style.cursor = 'grabbing';
            }
        });

        window.addEventListener('mousemove', (e) => this._onGlobalMouseMove(e));
        window.addEventListener('mouseup', () => this._onGlobalMouseUp());

        // Zooming
        this.container.addEventListener('wheel', (e) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                const delta = e.deltaY > 0 ? 0.9 : 1.1;
                let newZoom = this.state.zoom * delta;
                newZoom = Math.min(Math.max(0.1, newZoom), 5); // Clamp
                this.state.setZoom(newZoom);
            }
        }, { passive: false });

        // Zoom Buttons
        document.getElementById('zoom-in').addEventListener('click', () => {
            this.state.setZoom(Math.min(this.state.zoom + 0.1, 5));
        });
        document.getElementById('zoom-out').addEventListener('click', () => {
            this.state.setZoom(Math.max(this.state.zoom - 0.1, 0.1));
        });
    }

    _onPinMouseDown(e, id) {
        // Only trigger drag if clicking header or general area, not buttons/inputs
        if (e.target.closest('.pin-delete') || e.target.closest('.pin-content')) return;

        this.isDraggingPin = true;
        this.activePinId = id;
        this.dragStart = { x: e.clientX, y: e.clientY };

        const pin = this.state.pins.find(p => p.id === id);
        this.initialPinPos = { x: pin.x, y: pin.y };

        // Bring to front
        const el = this.pinMap.get(id).element;
        el.classList.add('selected');
    }

    _onGlobalMouseMove(e) {
        if (this.isDraggingBoard) {
            const dx = e.clientX - this.dragStart.x;
            const dy = e.clientY - this.dragStart.y;
            this.state.setPan(this.dragOffset.x + dx, this.dragOffset.y + dy);
        }

        if (this.isDraggingPin && this.activePinId) {
            const dx = (e.clientX - this.dragStart.x) / this.state.zoom;
            const dy = (e.clientY - this.dragStart.y) / this.state.zoom;

            const newX = this.initialPinPos.x + dx;
            const newY = this.initialPinPos.y + dy;

            // Optimistic UI update (bypass state full notify for performance)
            const cmp = this.pinMap.get(this.activePinId);
            if (cmp) {
                cmp.element.style.transform = `translate(${newX}px, ${newY}px)`;
            }
        }
    }

    _onGlobalMouseUp() {
        this.isDraggingBoard = false;
        this.container.style.cursor = 'grab';

        if (this.isDraggingPin && this.activePinId) {
            // Commit final position
            const cmp = this.pinMap.get(this.activePinId);
            if (cmp) {
                // Read computed transform or just re-calculate
                // To be precise, we use the logic from mousemove
                // But we are in mouseup, relying on last frame state is risky if we didn't track it.
                // Better approach: Calculate final pos one last time based on dragStart.
                // Or easier: we updated the DOM transform, let's just grab the current visual or re-calc.
                // Re-calc is safer.

                // Oops, 'e' is not here. We need to track last mouse pos or just trust the logic.
                // Let's assume the user didn't teleport.
                // Actually, let's just read the transform style from DOM? No, messy.
                // Let's store the `currentDragPos` in mousemove.
            }
            // For now, let's just re-render to snap back to source of truth OR update source of truth if we had the coordinates.
            // CORRECT FIX: We need to properly commit the logic.
            // Simplification: We rely on the fact that `mousemove` updated the visual, 
            // but we need the final coordinates to save to DB.
            // Current limitation: I didn't store `newX/Y` in a scope accessible here.

            // Allow sloppy fix: Next drag corrects it, but we want persistence.
            // Let's force a "move end" logic if tracked.
        }

        // Since I can't easily access the `e` from mouseup here without refactoring `dragStart` to store `lastX/Y`.
        // Let's patch `mousemove` to store `lastKnownPinPos`.
        if (this.isDraggingPin) {
            if (this.lastKnownPinPos) {
                const pin = this.state.pins.find(p => p.id === this.activePinId);
                if (pin) {
                    this.state.updatePin({ ...pin, x: this.lastKnownPinPos.x, y: this.lastKnownPinPos.y });
                }
                this.lastKnownPinPos = null;
            }

            // Remove selection style
            if (this.pinMap.get(this.activePinId)) {
                this.pinMap.get(this.activePinId).element.classList.remove('selected');
            }
        }

        this.isDraggingPin = false;
        this.activePinId = null;
    }

    // Patching mousemove for the fix above
    _onGlobalMouseMove(e) {
        if (this.isDraggingBoard) {
            const dx = e.clientX - this.dragStart.x;
            const dy = e.clientY - this.dragStart.y;
            this.state.setPan(this.dragOffset.x + dx, this.dragOffset.y + dy);
        }

        if (this.isDraggingPin && this.activePinId) {
            const dx = (e.clientX - this.dragStart.x) / this.state.zoom;
            const dy = (e.clientY - this.dragStart.y) / this.state.zoom;

            const newX = this.initialPinPos.x + dx;
            const newY = this.initialPinPos.y + dy;

            this.lastKnownPinPos = { x: newX, y: newY };

            // Optimistic UI update
            const cmp = this.pinMap.get(this.activePinId);
            if (cmp) {
                cmp.element.style.transform = `translate(${newX}px, ${newY}px)`;
            }
        }
    }
}