import { PinComponent } from './pin.js';

export class CanvasController {
    constructor(state) {
        this.state = state;
        this.container = document.getElementById('canvas-container');
        this.content = document.getElementById('canvas-content');
        this.zoomLevelEl = document.getElementById('zoom-level');
        this.pinMap = new Map(); // id -> PinComponent

        // Interaction state
        this.isDraggingBoard = false;
        this.dragStart = { x: 0, y: 0 };
        this.dragOffset = { x: 0, y: 0 };

        this.isDraggingPin = false;
        this.activePinId = null;
        this.initialPinPos = { x: 0, y: 0 };
        this.lastKnownPinPos = null;

        // Bind handlers
        this._onPointerMove = this._onPointerMove.bind(this);
        this._onPointerUp = this._onPointerUp.bind(this);

        this._setupListeners();
    }

    handleUpdate(pins, viewState, type, payload) {
        // Apply view transform
        this.content.style.transform = `translate(${viewState.pan.x}px, ${viewState.pan.y}px) scale(${viewState.zoom})`;
        if (this.zoomLevelEl) this.zoomLevelEl.textContent = `${Math.round(viewState.zoom * 100)}%`;

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
        const hint = document.getElementById('onboarding-hint');
        if (hint) this.content.appendChild(hint);
        this.pinMap.clear();
        pins.forEach(p => this._renderPin(p));
    }

    _renderPin(data) {
        if (this.pinMap.has(data.id)) return;

        const pinCmp = new PinComponent(data, {
            onUpdate: (d) => this.state.updatePin(d),
            onDelete: (id) => this.state.deletePin(id)
        });

        this.content.appendChild(pinCmp.element);
        this.pinMap.set(data.id, pinCmp);

        // Attach pointerdown to the whole pin element (ignore content/delete inside handler)
        const handle = pinCmp.element;
        handle.style.touchAction = 'none';
        handle.addEventListener('pointerdown', (ev) => {
            this._startPinDrag(ev, data.id);
        });
    }

    _updatePinDOM(data) {
        const cmp = this.pinMap.get(data.id);
        if (!cmp) return;
        cmp.data = data;
        cmp.updatePosition();
        // If pin was being dragged visually, ensure DOM matches state
        if (!this.isDraggingPin) {
            cmp.element.style.left = `${data.x}px`;
            cmp.element.style.top = `${data.y}px`;
        }
    }

    _removePinDOM(id) {
        const cmp = this.pinMap.get(id);
        if (!cmp) return;
        cmp.element.remove();
        this.pinMap.delete(id);
    }

    /* --- Interaction / Dragging --- */
    _setupListeners() {
        // Use pointerdown on container for panning (ignore pointerdowns that originate inside a pin)
        this.container.addEventListener('pointerdown', (e) => {
            if (e.target.closest && e.target.closest('.pin')) return; // don't start pan when interacting with a pin
            if (e.button === 1 || e.target === this.container || e.target === this.content) {
                this.isDraggingBoard = true;
                this.dragStart = { x: e.clientX, y: e.clientY };
                this.dragOffset = { ...this.state.pan };
                this.container.style.cursor = 'grabbing';

                // capture pointer to keep receiving events while panning
                try { if (e.pointerId && e.target.setPointerCapture) e.target.setPointerCapture(e.pointerId); } catch (err) {}

                // attach pointermove/up for panning lifecycle
                const onMove = (ev) => this._onGlobalPointerMove(ev);
                const onUp = (ev) => {
                    try { if (ev.pointerId && ev.target.releasePointerCapture) ev.target.releasePointerCapture(ev.pointerId); } catch (err) {}
                    this._onGlobalPointerUp();
                    window.removeEventListener('pointermove', onMove);
                    window.removeEventListener('pointerup', onUp);
                };

                window.addEventListener('pointermove', onMove);
                window.addEventListener('pointerup', onUp);
            }
        });

        // Wheel zoom (ctrl + wheel)
        this.container.addEventListener('wheel', (e) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                const delta = e.deltaY > 0 ? 0.9 : 1.1;
                let newZoom = this.state.zoom * delta;
                newZoom = Math.min(Math.max(0.1, newZoom), 5);
                this.state.setZoom(newZoom);
            }
        }, { passive: false });

        const zin = document.getElementById('zoom-in');
        const zout = document.getElementById('zoom-out');
        if (zin) zin.addEventListener('click', () => this.state.setZoom(Math.min(this.state.zoom + 0.1, 5)));
        if (zout) zout.addEventListener('click', () => this.state.setZoom(Math.max(this.state.zoom - 0.1, 0.1)));
    }

    _startPinDrag(e, id) {
        // Ignore interactions on actionable elements
        if (e.target.closest('.pin-delete') || e.target.closest('.pin-content')) return;

        e.preventDefault();
        e.stopPropagation();

        this.isDraggingPin = true;
        this.activePinId = id;
        this.dragStart = { x: e.clientX, y: e.clientY };

        const pin = this.state.pins.find(p => p.id === id) || { x: 0, y: 0 };
        this.initialPinPos = { x: pin.x, y: pin.y };
        this.lastKnownPinPos = { x: pin.x, y: pin.y };

        const el = this.pinMap.get(id).element;
        el.classList.add('selected');

        // Try to capture pointer to keep receiving events
        try { if (e.pointerId && e.target.setPointerCapture) e.target.setPointerCapture(e.pointerId); } catch (err) {}

        window.addEventListener('pointermove', this._onPointerMove);
        window.addEventListener('pointerup', this._onPointerUp);
    }

    _onPointerMove(e) {
        
        if (!this.isDraggingPin || !this.activePinId) return;

        const dx = (e.clientX - this.dragStart.x) / this.state.zoom;
        const dy = (e.clientY - this.dragStart.y) / this.state.zoom;

        const newX = this.initialPinPos.x + dx;
        const newY = this.initialPinPos.y + dy;

        this.lastKnownPinPos = { x: newX, y: newY };
        const cmp = this.pinMap.get(this.activePinId);
        if (cmp) {
            cmp.element.style.left = `${newX}px`;
            cmp.element.style.top = `${newY}px`;
        }
    }

    _onPointerUp(e) {
        if (!this.isDraggingPin) return;

        // Release pointer capture
        try { if (e.pointerId && e.target.releasePointerCapture) e.target.releasePointerCapture(e.pointerId); } catch (err) {}

        if (this.lastKnownPinPos && this.activePinId) {
            const pin = this.state.pins.find(p => p.id === this.activePinId);
            if (pin) this.state.updatePin({ ...pin, x: this.lastKnownPinPos.x, y: this.lastKnownPinPos.y });
        }

        if (this.pinMap.get(this.activePinId)) {
            const el = this.pinMap.get(this.activePinId).element;
            el.classList.remove('selected');
        }

        this.isDraggingPin = false;
        this.activePinId = null;
        this.lastKnownPinPos = null;

        window.removeEventListener('pointermove', this._onPointerMove);
        window.removeEventListener('pointerup', this._onPointerUp);
    }

    _onGlobalMouseMove(e) {
        if (!this.isDraggingBoard) return;
        const dx = e.clientX - this.dragStart.x;
        const dy = e.clientY - this.dragStart.y;
        this.state.setPan(this.dragOffset.x + dx, this.dragOffset.y + dy);
    }

    _onGlobalMouseUp() {
        this.isDraggingBoard = false;
        this.container.style.cursor = 'grab';
    }
}
