import { AppState } from './state.js';
import { CanvasController } from './canvas.js';

document.addEventListener('DOMContentLoaded', async () => {
    const state = new AppState();
    const canvas = new CanvasController(state);

    // Link State to Canvas
    state.subscribe((pins, view, type, payload) => canvas.handleUpdate(pins, view, type, payload));

    // Initialize (Load from DB)
    await state.init();

    // --- Toolbar Actions ---

    const getCenterPos = () => {
        // Create pin in center of view
        const cx = (window.innerWidth / 2 - state.pan.x) / state.zoom;
        const cy = (window.innerHeight / 2 - state.pan.y) / state.zoom;
        return { x: cx - 100, y: cy - 100 }; // Centered-ish
    };

    document.getElementById('add-note-btn').addEventListener('click', () => {
        const pos = getCenterPos();
        state.addPin({
            id: crypto.randomUUID(),
            type: 'text',
            x: pos.x,
            y: pos.y,
            content: 'New Note',
            color: 'yellow'
        });
    });

    document.getElementById('add-todo-btn').addEventListener('click', () => {
        const pos = getCenterPos();
        state.addPin({
            id: crypto.randomUUID(),
            type: 'todo',
            x: pos.x,
            y: pos.y,
            content: '- [ ] First Item',
            color: 'blue'
        });
    });

    document.getElementById('add-image-btn').addEventListener('click', () => {
        document.getElementById('image-upload').click();
    });

    document.getElementById('image-upload').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (evt) => {
                const pos = getCenterPos();
                state.addPin({
                    id: crypto.randomUUID(),
                    type: 'image',
                    x: pos.x,
                    y: pos.y,
                    content: evt.target.result, // Base64
                    color: 'white'
                });
            };
            reader.readAsDataURL(file);
        }
    });

    // Undo / Redo
    document.getElementById('undo-btn').addEventListener('click', () => state.undo());
    document.getElementById('redo-btn').addEventListener('click', () => state.redo());

    // Theme Toggle
    const themeBtn = document.getElementById('theme-toggle');
    themeBtn.addEventListener('click', () => {
        const body = document.body;
        if (body.getAttribute('data-theme') === 'dark') {
            body.removeAttribute('data-theme');
            themeBtn.innerHTML = '<i class="fa-solid fa-moon"></i>';
        } else {
            body.setAttribute('data-theme', 'dark');
            themeBtn.innerHTML = '<i class="fa-solid fa-sun"></i>';
        }
    });

    // Snapshot (Simple Alert for now since logic is internal)
    document.getElementById('save-snap-btn').addEventListener('click', async () => {
        await state.db.saveSnapshot('Quick Save', state.pins);
        alert('Snapshot saved to internal database!');
    });

});