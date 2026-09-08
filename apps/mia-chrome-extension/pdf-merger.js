(function () {
  'use strict';

  const state = {
    overlay: null,
    modal: null,
    dropzone: null,
    fileInput: null,
    fileListEl: null,
    mergeBtn: null,
    files: [],
    nextId: 1,
    draggingId: null,
    dragDepth: 0,
    isMerging: false,
    previousActiveElement: null,
    listDnDRegistered: false,
  };
  window.__pdfMergerState = state;

  function createIcon(pathD) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '20');
    svg.setAttribute('height', '20');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathD);
    svg.appendChild(path);

    return svg;
  }

  function ensureOverlay() {
    if (!state.overlay) {
      buildOverlay();
    }
  }

  function buildOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'pdf-merge-overlay';
    overlay.setAttribute('aria-hidden', 'true');

    const modal = document.createElement('div');
    modal.className = 'pdf-merge-modal';
    const titleId = 'pdf-merge-title';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', titleId);
    modal.setAttribute('tabindex', '-1');

    const header = document.createElement('div');
    header.className = 'pdf-merge-header';

    const title = document.createElement('h2');
    title.id = titleId;
    title.textContent = 'Merge PDFs';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'pdf-merge-close';
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', closeOverlay);

    header.append(title, closeBtn);

    const subtitle = document.createElement('p');
    subtitle.className = 'pdf-merge-subtitle';
    subtitle.append('Combine PDFs without leaving the browser. ');
    const subtitleHighlight = document.createElement('strong');
    subtitleHighlight.textContent = 'Files never leave your device.';
    subtitle.appendChild(subtitleHighlight);

    const dropzone = document.createElement('div');
    dropzone.className = 'pdf-merge-dropzone';

    const dropTitle = document.createElement('p');
    dropTitle.className = 'pdf-merge-dropzone-title';
    dropTitle.textContent = 'Drag and drop PDF files here';

    const dropHint = document.createElement('p');
    dropHint.className = 'pdf-merge-dropzone-hint';
    dropHint.textContent = 'or click the button to browse for PDFs.';

    const uploadBtn = document.createElement('button');
    uploadBtn.type = 'button';
    uploadBtn.className = 'pdf-merge-btn pdf-merge-btn-secondary pdf-merge-upload-btn';
    uploadBtn.textContent = 'Upload PDFs';

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'application/pdf';
    fileInput.multiple = true;
    fileInput.style.display = 'none';

    uploadBtn.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (event) => {
      addFilesFromInput(event.target.files);
      event.target.value = '';
    });

    dropzone.append(dropTitle, dropHint, uploadBtn);

    const listLabel = document.createElement('p');
    listLabel.className = 'pdf-merge-list-label';
    listLabel.textContent = 'Selected files';

    const fileList = document.createElement('div');
    fileList.className = 'pdf-merge-file-list';
    fileList.setAttribute('aria-live', 'polite');

    const buttonRow = document.createElement('div');
    buttonRow.className = 'pdf-merge-buttons';

    const mergeBtn = document.createElement('button');
    mergeBtn.type = 'button';
    mergeBtn.className = 'pdf-merge-btn pdf-merge-btn-primary';
    mergeBtn.textContent = 'Merge PDFs';
    mergeBtn.addEventListener('click', mergeAndDownload);

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'pdf-merge-btn pdf-merge-btn-destructive';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', closeOverlay);

    buttonRow.append(mergeBtn, cancelBtn);

    modal.append(header, subtitle, dropzone, fileInput, listLabel, fileList, buttonRow);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        closeOverlay();
      }
    });

    state.overlay = overlay;
    state.modal = modal;
    state.dropzone = dropzone;
    state.fileInput = fileInput;
    state.fileListEl = fileList;
    state.mergeBtn = mergeBtn;

    setupDropzoneEvents();
    setupListReorderEvents();
    renderFileList();
    updateMergeButton();
  }

  function setupDropzoneEvents() {
    if (!state.dropzone) {
      return;
    }

    state.dropzone.addEventListener('dragenter', (event) => {
      event.preventDefault();
      state.dragDepth += 1;
      state.dropzone.classList.add('pdf-merge-dropzone-active');
    });

    state.dropzone.addEventListener('dragleave', (event) => {
      event.preventDefault();
      state.dragDepth = Math.max(0, state.dragDepth - 1);
      if (state.dragDepth === 0) {
        state.dropzone.classList.remove('pdf-merge-dropzone-active');
      }
    });

    state.dropzone.addEventListener('dragover', (event) => {
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'copy';
      }
    });

    state.dropzone.addEventListener('drop', (event) => {
      event.preventDefault();
      state.dragDepth = 0;
      state.dropzone.classList.remove('pdf-merge-dropzone-active');
      const files = event.dataTransfer && event.dataTransfer.files;
      if (files && files.length) {
        addFilesFromInput(files);
      }
    });
  }

  function openOverlay() {
    if (!state.overlay || !state.modal) {
      return;
    }
    state.previousActiveElement = document.activeElement;
    state.overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('pdf-merge-no-scroll');
    state.modal.focus();
  }

  function closeOverlay() {
    if (!state.overlay) {
      return;
    }
    state.overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('pdf-merge-no-scroll');
    state.dragDepth = 0;
    if (state.dropzone) {
      state.dropzone.classList.remove('pdf-merge-dropzone-active');
    }
    resetFileQueue();
    if (state.previousActiveElement && typeof state.previousActiveElement.focus === 'function') {
      state.previousActiveElement.focus();
    }
    window.dispatchEvent(new Event('pdfMergeOverlayClosed'));
  }

  function resetFileQueue() {
    if (!state.files.length && state.nextId === 1) {
      return;
    }

    state.files = [];
    state.nextId = 1;
    state.draggingId = null;

    if (state.fileInput) {
      state.fileInput.value = '';
    }

    renderFileList();
    updateMergeButton();
  }

  function isOverlayOpen() {
    return Boolean(state.overlay && state.overlay.getAttribute('aria-hidden') === 'false');
  }

  function handleGlobalKeyDown(event) {
    if (event.key === 'Escape' && isOverlayOpen()) {
      event.preventDefault();
      closeOverlay();
    }
  }

  function addFilesFromInput(fileList) {
    if (!fileList || !fileList.length) {
      return;
    }

    let invalidFound = false;

    Array.from(fileList).forEach((file) => {
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      if (!isPdf) {
        invalidFound = true;
        return;
      }
      state.files.push({
        file,
        id: state.nextId++,
      });
    });

    if (invalidFound) {
      alert('Only PDF files can be added.');
    }

    renderFileList();
  }

  function removeFile(id) {
    state.files = state.files.filter((entry) => entry.id !== id);
    renderFileList();
  }

  const arrowBigUpPath = 'M9 18v-6H5l7-7 7 7h-4v6H9z';
  const arrowBigDownPath = 'M15 6v6h4l-7 7-7-7h4V6h6z';

  function moveFile(id, direction) {
    const index = state.files.findIndex((entry) => entry.id === id);
    if (index === -1) {
      return;
    }

    const targetIndex =
      direction === 'up' ? Math.max(0, index - 1) : Math.min(state.files.length - 1, index + 1);

    if (targetIndex === index) {
      return;
    }

    const [file] = state.files.splice(index, 1);
    state.files.splice(targetIndex, 0, file);
    renderFileList();
  }

  function renderFileList() {
    if (!state.fileListEl) {
      return;
    }

    state.fileListEl.innerHTML = '';

    if (state.files.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'pdf-merge-empty';
      empty.textContent = 'No files added yet. Drag PDFs above or upload them.';
      state.fileListEl.appendChild(empty);
      updateMergeButton();
      return;
    }

    const fragment = document.createDocumentFragment();

    state.files.forEach((entry, index) => {
      const card = document.createElement('div');
      card.className = 'pdf-merge-card';
      card.draggable = true;
      card.dataset.id = String(entry.id);

      const indexBadge = document.createElement('span');
      indexBadge.className = 'pdf-merge-card-index';
      indexBadge.textContent = String(index + 1);

      const name = document.createElement('span');
      name.className = 'pdf-merge-card-name';
      name.title = entry.file.name;
      name.textContent = entry.file.name;

      const actions = document.createElement('div');
      actions.className = 'pdf-merge-card-actions';

      const moveUpBtn = document.createElement('button');
      moveUpBtn.type = 'button';
      moveUpBtn.className = 'pdf-merge-card-move';
      moveUpBtn.appendChild(createIcon(arrowBigUpPath));
      moveUpBtn.setAttribute('aria-label', `Move ${entry.file.name} up`);
      moveUpBtn.disabled = index === 0;
      moveUpBtn.addEventListener('click', () => moveFile(entry.id, 'up'));

      const moveDownBtn = document.createElement('button');
      moveDownBtn.type = 'button';
      moveDownBtn.className = 'pdf-merge-card-move';
      moveDownBtn.appendChild(createIcon(arrowBigDownPath));
      moveDownBtn.setAttribute('aria-label', `Move ${entry.file.name} down`);
      moveDownBtn.disabled = index === state.files.length - 1;
      moveDownBtn.addEventListener('click', () => moveFile(entry.id, 'down'));

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'pdf-merge-card-remove';
      removeBtn.setAttribute('aria-label', `Remove ${entry.file.name}`);
      removeBtn.innerHTML = '&times;';
      removeBtn.addEventListener('click', () => removeFile(entry.id));

      actions.append(moveUpBtn, moveDownBtn, removeBtn);

      card.addEventListener('dragstart', (event) => {
        state.draggingId = entry.id;
        card.classList.add('pdf-merge-card-dragging');
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', '');
        }
      });

      card.addEventListener('dragend', () => {
        state.draggingId = null;
        card.classList.remove('pdf-merge-card-dragging');
      });

      card.addEventListener('dragover', (event) => {
        event.preventDefault();
        if (event.dataTransfer) {
          event.dataTransfer.dropEffect = 'move';
        }
      });

      card.addEventListener('drop', (event) => handleCardDrop(event, entry.id));

      card.append(indexBadge, name, actions);
      fragment.appendChild(card);
    });

    state.fileListEl.appendChild(fragment);
    updateMergeButton();
  }

  function handleCardDrop(event, targetId) {
    event.preventDefault();
    if (state.draggingId === null || state.draggingId === targetId) {
      return;
    }

    const draggedIndex = state.files.findIndex((entry) => entry.id === state.draggingId);
    if (draggedIndex === -1) {
      return;
    }

    const removed = state.files.splice(draggedIndex, 1);
    if (!removed.length) {
      return;
    }
    const moved = removed[0];
    const newTargetIndex = state.files.findIndex((entry) => entry.id === targetId);

    const rect = event.currentTarget.getBoundingClientRect();
    const shouldPlaceAfter = event.clientY > rect.top + rect.height / 2;
    let insertIndex = newTargetIndex === -1 ? state.files.length : newTargetIndex;
    if (shouldPlaceAfter) {
      insertIndex += 1;
    }

    state.files.splice(insertIndex, 0, moved);
    renderFileList();
  }

  function handleListDragOver(event) {
    if (state.draggingId === null) {
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  function handleListDrop(event) {
    if (state.draggingId === null || !state.fileListEl) {
      return;
    }

    if (event.target !== state.fileListEl) {
      return;
    }

    event.preventDefault();
    const draggedIndex = state.files.findIndex((entry) => entry.id === state.draggingId);
    if (draggedIndex === -1) {
      return;
    }

    const [moved] = state.files.splice(draggedIndex, 1);
    if (!moved) {
      return;
    }

    const bounds = state.fileListEl.getBoundingClientRect();
    const midpoint = bounds.top + bounds.height / 2;
    const placeAtEnd = event.clientY > midpoint;
    const insertIndex = placeAtEnd ? state.files.length : 0;
    state.files.splice(insertIndex, 0, moved);
    renderFileList();
  }

  function setupListReorderEvents() {
    const currentState = window.__pdfMergerState;
    if (!currentState || !currentState.fileListEl || currentState.listDnDRegistered) {
      return;
    }

    currentState.fileListEl.addEventListener('dragover', handleListDragOver);
    currentState.fileListEl.addEventListener('drop', handleListDrop);
    currentState.listDnDRegistered = true;
  }

  function updateMergeButton() {
    if (!state.mergeBtn) {
      return;
    }

    if (state.isMerging) {
      state.mergeBtn.textContent = 'Merging...';
      state.mergeBtn.disabled = true;
    } else {
      state.mergeBtn.textContent = 'Merge PDFs';
      state.mergeBtn.disabled = state.files.length === 0;
    }
  }

  async function mergeAndDownload() {
    if (state.isMerging) {
      return;
    }

    if (!state.files.length) {
      alert('Please add at least one PDF first.');
      return;
    }

    const pdfLib = window.PDFLib;
    if (!pdfLib || !pdfLib.PDFDocument) {
      alert('pdf-lib is required. Please include pdf-lib.min.js before this script.');
      return;
    }

    state.isMerging = true;
    updateMergeButton();

    try {
      const mergedDoc = await pdfLib.PDFDocument.create();

      for (const entry of state.files) {
        const fileBuffer = await readFileAsArrayBuffer(entry.file);
        const currentDoc = await pdfLib.PDFDocument.load(fileBuffer);
        const pageIndices = currentDoc.getPageIndices();
        const copiedPages = await mergedDoc.copyPages(currentDoc, pageIndices);
        copiedPages.forEach((page) => mergedDoc.addPage(page));
      }

      const mergedBytes = await mergedDoc.save();
      downloadMergedPdf(mergedBytes);
    } catch (error) {
      console.error('PDF merge error', error);
      alert('There was a problem merging the PDFs.');
    } finally {
      state.isMerging = false;
      updateMergeButton();
    }
  }

  function downloadMergedPdf(byteArray) {
    const blob = new Blob([byteArray], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'merged.pdf';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('Failed to read file.'));
      reader.readAsArrayBuffer(file);
    });
  }

  window.ensurePdfMergeOverlay = ensureOverlay;

  window.openPdfMergeOverlay = function () {
    ensureOverlay();
    openOverlay();
  };

  document.addEventListener('keydown', handleGlobalKeyDown);
  window.dispatchEvent(new Event('pdfMergeOverlayReady'));
})();
