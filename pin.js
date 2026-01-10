export class PinComponent {
    constructor(data, events) {
        this.data = data;
        this.events = events; // { onUpdate, onDelete, onFocus }
        this.element = this._createElement();
    }

    _createElement() {
        const el = document.createElement('div');
        el.className = `pin type-${this.data.type} color-${this.data.color || 'yellow'}`;
        el.id = this.data.id;
        el.dataset.id = this.data.id;

        // CSS handles position, but JS sets the exact coordinates
        this.updatePosition(el);

        if (this.data.type === 'text') {
            this._buildTextPin(el);
        } else if (this.data.type === 'image') {
            this._buildImagePin(el);
        } else if (this.data.type === 'todo') {
            this._buildTodoPin(el);
        }

        this._addListeners(el);
        return el;
    }

    _buildTextPin(el) {
        el.innerHTML = `
            <div class="pin-header">
                <div class="pin-drag-handle"><i class="fa-solid fa-grip-lines"></i> <span class="pin-date">Now</span></div>
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
            <img src="${this.data.content}" draggable="false" alt="Pin Image"/>
        `;
    }

    _buildTodoPin(el) {
        // Simple text for now, can be enhanced to genuine checkboxes later
        el.innerHTML = `
            <div class="pin-header">
                <div class="pin-drag-handle"><i class="fa-solid fa-list-check"></i> To-Do</div>
                <button class="pin-delete"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="pin-content" contenteditable="true" style="font-family: var(--font-ui)">${this.data.content || '- [ ] Task 1'}</div>
        `;
    }

    updatePosition(el = this.element) {
        el.style.transform = `translate(${this.data.x}px, ${this.data.y}px)`;
    }

    _addListeners(el) {
        const deleteBtn = el.querySelector('.pin-delete');
        if (deleteBtn) {
            deleteBtn.addEventListener('mousedown', (e) => {
                e.stopPropagation(); // Prevent drag start
            });
            deleteBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (confirm('Delete this note?')) {
                    this.events.onDelete(this.data.id);
                }
            });
        }

        const content = el.querySelector('.pin-content');
        if (content) {
            // Auto-save on blur
            content.addEventListener('blur', () => {
                const newContent = content.innerHTML; // or innerText depending on preference
                if (newContent !== this.data.content) {
                    this.data.content = newContent;
                    this.events.onUpdate(this.data);
                }
            });

            // Prevent drag when typing
            content.addEventListener('mousedown', (e) => {
                e.stopPropagation();
            });
        }
    }
}