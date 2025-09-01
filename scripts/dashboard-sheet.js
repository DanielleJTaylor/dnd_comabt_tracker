// file name: scripts/dashboard-sheet.js
document.addEventListener('DOMContentLoaded', () => {
    // --- DOM ELEMENT REFERENCES ---
    const formatToolbar = document.getElementById('format-toolbar');
    const blocksContainer = document.getElementById('blocks-container');
    const addBlockBtn = document.getElementById('add-block-btn');
    const lockButton = document.getElementById('lock-toggle-btn');
    const sheetContainer = document.getElementById('sheet-container');

    let isLocked = false;

    // --- EVENT LISTENERS ---
    lockButton.addEventListener('click', toggleLock);
    addBlockBtn.addEventListener('click', createNewBlock);
    
    formatToolbar.addEventListener('click', (e) => {
        const command = e.target.closest('button')?.dataset.command;
        if (command) document.execCommand(command, false, null);
    });
    formatToolbar.addEventListener('change', (e) => {
        const select = e.target.closest('select');
        if (select?.dataset.command === 'formatBlock') {
            document.execCommand(select.dataset.command, false, select.value);
        }
    });

    blocksContainer.addEventListener('click', (e) => {
        if (isLocked) return;
        if (e.target.classList.contains('delete-btn')) {
            e.target.closest('.block').remove();
        }
    });

    // --- CORE FUNCTIONS ---

    function toggleLock() {
        isLocked = !isLocked;
        sheetContainer.classList.toggle('is-locked', isLocked);
        lockButton.textContent = isLocked ? '🔒 Locked' : '🔓 Unlocked';
        document.querySelectorAll('[contenteditable]').forEach(el => {
            el.setAttribute('contenteditable', !isLocked);
        });
        if (isLocked) {
            interact('.block').unset();
        } else {
            initializeInteract();
        }
    }

    function createNewBlock() {
        if (isLocked) return;
        const { row } = findNextAvailableSpot();
        const block = document.createElement('div');
        block.className = 'block';
        block.innerHTML = `
            <div class="block-header">
                <span contenteditable="true">New Block</span>
                <button class="delete-btn">×</button>
            </div>
            <div class="block-content" contenteditable="true"></div>
            <div class="resize-handle"></div>
        `;
        block.style.gridColumn = `1 / span 4`;
        block.style.gridRow = `${row} / span 4`;
        blocksContainer.appendChild(block);
        updateBlockData(block);
    }
    
    // --- INTERACT.JS LOGIC (DRAG & RESIZE) ---
    function initializeInteract() {
        interact('.block')
            .draggable({
                allowFrom: '.block-header',
                listeners: {
                    start: (event) => event.target.classList.add('dragging'),
                    move: dragMoveListener,
                    end: (event) => {
                        event.target.classList.remove('dragging');
                        dragEndListener(event);
                    }
                }
            })
            .resizable({
                edges: { right: '.resize-handle', bottom: '.resize-handle' },
                listeners: { move: resizeListener },
            });
    }

    function dragMoveListener(event) {
        const target = event.target;
        const x = (parseFloat(target.getAttribute('data-x')) || 0) + event.dx;
        const y = (parseFloat(target.getAttribute('data-y')) || 0) + event.dy;
        target.style.transform = `translate(${x}px, ${y}px)`;
        target.setAttribute('data-x', x);
        target.setAttribute('data-y', y);
    }
    
    function dragEndListener(event) {
        const target = event.target;
        const { cellWidth, cellHeight } = getCellDimensions();
        
        const colShift = Math.round(parseFloat(target.getAttribute('data-x')) / cellWidth);
        const rowShift = Math.round(parseFloat(target.getAttribute('data-y')) / cellHeight);

        const newColStart = Math.max(1, parseInt(target.dataset.colStart) + colShift);
        const newRowStart = Math.max(1, parseInt(target.dataset.rowStart) + rowShift);
        
        target.style.gridColumn = `${newColStart} / span ${target.dataset.colSpan}`;
        target.style.gridRow = `${newRowStart} / span ${target.dataset.rowSpan}`;

        target.style.transform = 'none';
        target.setAttribute('data-x', '0');
        target.setAttribute('data-y', '0');
        updateBlockData(target);
    }

    function resizeListener(event) {
        const target = event.target;
        const { cellWidth, cellHeight } = getCellDimensions();

        const newColSpan = Math.max(1, Math.round(event.rect.width / cellWidth));
        const newRowSpan = Math.max(1, Math.round(event.rect.height / cellHeight));
        
        target.style.gridColumn = `${target.dataset.colStart} / span ${newColSpan}`;
        target.style.gridRow = `${target.dataset.rowStart} / span ${newRowSpan}`;
        
        updateBlockData(target);
    }

    // --- HELPER FUNCTIONS ---
    
    function findNextAvailableSpot() {
        const blocks = Array.from(blocksContainer.querySelectorAll('.block'));
        if (blocks.length === 0) return { row: 1, col: 1 };
        
        let maxRowEnd = 0;
        blocks.forEach(block => {
            const rowStart = parseInt(block.dataset.rowStart);
            const rowSpan = parseInt(block.dataset.rowSpan);
            if (rowStart + rowSpan > maxRowEnd) {
                maxRowEnd = rowStart + rowSpan;
            }
        });
        return { row: maxRowEnd, col: 1 };
    }

    function getCellDimensions() {
        const colCount = 12;
        const gap = 15;
        const cellWidth = (blocksContainer.clientWidth - (gap * (colCount - 1))) / colCount;
        const cellHeight = 50 + gap; // grid-auto-rows + gap
        return { cellWidth, cellHeight };
    }

    function updateBlockData(element) {
        const [colStart, colSpan] = element.style.gridColumn.split(' / span ').map(n => parseInt(n));
        const [rowStart, rowSpan] = element.style.gridRow.split(' / span ').map(n => parseInt(n));
        element.dataset.colStart = colStart;
        element.dataset.colSpan = colSpan;
        element.dataset.rowStart = rowStart;
        element.dataset.rowSpan = rowSpan;
    }

    // --- INITIALIZATION ---
    createNewBlock();
    initializeInteract();
});