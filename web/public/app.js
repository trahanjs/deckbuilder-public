const buildBtn = document.getElementById('buildBtn');
const copyBtn = document.getElementById('copyBtn');
const resultEl = document.getElementById('result');
const warningBox = document.getElementById('warningBox');
const addThemeBtn = document.getElementById('addThemeBtn');
const themeRowsEl = document.getElementById('themeRows');

const state = {
  rows: [],
  nextId: 1,
  themeCatalog: []
};

function flashCopyStatus(message, isError = false) {
  const previous = warningBox.textContent;
  warningBox.textContent = message;
  warningBox.style.color = isError ? '#f87171' : '#34d399';

  setTimeout(() => {
    warningBox.textContent = previous;
    warningBox.style.color = '';
  }, 1800);
}

async function copyTextToClipboard(text) {
  if (!text || !text.trim()) {
    throw new Error('Nothing to copy yet.');
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'absolute';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();

  const copied = document.execCommand('copy');
  document.body.removeChild(textarea);

  if (!copied) {
    throw new Error('Clipboard copy is not supported in this browser.');
  }
}

function collectRows() {
  return state.rows
    .map((row) => ({
      theme: String(row.theme || '').trim(),
      primaryCommander: String(row.primaryCommander || '').trim(),
      secondaryCommander: String(row.secondaryCommander || '').trim()
    }))
    .filter((row) => row.theme || row.primaryCommander || row.secondaryCommander);
}

function collectOutputThemes() {
  const selected = state.rows
    .filter((row) => row.includeInOutput)
    .map((row) => String(row.theme || '').trim())
    .filter(Boolean);

  return [...new Set(selected)];
}

function findThemeByName(themeName) {
  return state.themeCatalog.find((entry) => entry.name === themeName) || null;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildSelectOptions(values, selectedValue, placeholder) {
  const options = [`<option value="">${escapeHtml(placeholder)}</option>`];

  values.forEach((value) => {
    const selected = value === selectedValue ? ' selected' : '';
    options.push(`<option value="${escapeHtml(value)}"${selected}>${escapeHtml(value)}</option>`);
  });

  return options.join('');
}

function getThemePrimaryOptions(themeData) {
  const values = Array.isArray(themeData?.primaryOptions) ? themeData.primaryOptions : [];
  return [...new Set(values.filter(Boolean))];
}

function getThemeSecondaryOptions(themeData) {
  const values = Array.isArray(themeData?.secondaryOptions) ? themeData.secondaryOptions : [];
  return [...new Set(values.filter(Boolean))];
}

function createRow(overrides = {}) {
  const id = state.nextId;
  state.nextId += 1;

  const row = {
    id,
    theme: overrides.theme || '',
    primaryCommander: overrides.primaryCommander || '',
    secondaryCommander: overrides.secondaryCommander || '',
    includeInOutput: overrides.includeInOutput !== false
  };

  applyThemeDefaults(row, { force: true });
  state.rows.push(row);
}

function applyThemeDefaults(row, options = {}) {
  const themeData = findThemeByName(row.theme);
  if (!themeData) {
    if (options.force) {
      row.primaryCommander = '';
      row.secondaryCommander = '';
    }
    return;
  }

  const primaryOptions = getThemePrimaryOptions(themeData);
  const secondaryOptions = getThemeSecondaryOptions(themeData);
  const force = Boolean(options.force);

  if (force || !primaryOptions.includes(row.primaryCommander)) {
    row.primaryCommander = themeData.defaultPrimaryCommander || primaryOptions[0] || '';
  }

  if (force || !secondaryOptions.includes(row.secondaryCommander)) {
    row.secondaryCommander = themeData.defaultSecondaryCommander || secondaryOptions[0] || '';
  }
}

function updateRow(rowId, patch) {
  const row = state.rows.find((entry) => entry.id === rowId);
  if (!row) return;

  if (Object.prototype.hasOwnProperty.call(patch, 'theme')) {
    row.theme = patch.theme;
    applyThemeDefaults(row, { force: true });
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'primaryCommander')) {
    row.primaryCommander = patch.primaryCommander;
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'secondaryCommander')) {
    row.secondaryCommander = patch.secondaryCommander;
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'includeInOutput')) {
    row.includeInOutput = patch.includeInOutput;
  }

  renderRows();
}

function removeRow(rowId) {
  if (state.rows.length <= 1) {
    return;
  }

  state.rows = state.rows.filter((entry) => entry.id !== rowId);
  renderRows();
}

function renderRows() {
  const themeOptions = state.themeCatalog.map((entry) => entry.name);

  const html = state.rows.map((row) => {
    const themeData = findThemeByName(row.theme);
    const primaryOptions = themeData ? getThemePrimaryOptions(themeData) : [];
    const secondaryOptions = themeData ? getThemeSecondaryOptions(themeData) : [];

    return `
      <div class="theme-row" data-row-id="${row.id}">
        <label>
          Theme
          <select data-field="theme">
            ${buildSelectOptions(themeOptions, row.theme, 'Select theme')}
          </select>
        </label>
        <label>
          Primary Commander
          <select data-field="primaryCommander" ${themeData ? '' : 'disabled'}>
            ${buildSelectOptions(primaryOptions, row.primaryCommander, themeData ? 'Select primary' : 'Select theme first')}
          </select>
        </label>
        <label>
          Secondary Commander
          <select data-field="secondaryCommander" ${themeData ? '' : 'disabled'}>
            ${buildSelectOptions(secondaryOptions, row.secondaryCommander, themeData ? 'Optional secondary' : 'Select theme first')}
          </select>
        </label>
        <label class="include-toggle">
          Include in output
          <input class="toggle-input" data-field="includeInOutput" type="checkbox" ${row.includeInOutput ? 'checked' : ''} />
          <span class="toggle-shell" aria-hidden="true">
            <span class="toggle-option toggle-option-on">on</span>
            <span class="toggle-option toggle-option-off">off</span>
          </span>
        </label>
        <button class="remove-btn" data-action="remove" type="button" ${state.rows.length <= 1 ? 'disabled' : ''}>Remove</button>
      </div>
    `;
  }).join('');

  themeRowsEl.innerHTML = html;
}

function handleThemeRowInteraction(event) {
  const rowEl = event.target.closest('.theme-row');
  if (!rowEl) return;

  const rowId = Number(rowEl.dataset.rowId);
  if (!rowId) return;

  const field = event.target.dataset.field;
  if (!field) return;

  if (field === 'includeInOutput') {
    updateRow(rowId, { includeInOutput: Boolean(event.target.checked) });
    return;
  }

  updateRow(rowId, { [field]: event.target.value });
}

function handleThemeRowClick(event) {
  const removeButton = event.target.closest('[data-action="remove"]');
  if (!removeButton) return;

  const rowEl = event.target.closest('.theme-row');
  if (!rowEl) return;

  const rowId = Number(rowEl.dataset.rowId);
  if (!rowId) return;

  removeRow(rowId);
}

async function loadUiMetadata() {
  const response = await fetch('/api/metadata');
  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(data.error || 'Unable to load builder metadata.');
  }

  const themeCatalog = Array.isArray(data.themes) ? data.themes : [];
  state.themeCatalog = themeCatalog;
}

function initializeRows() {
  const defaults = ['Reanimate', 'Aggro', 'Flurry', 'Dragons', 'Counters'];
  const knownThemes = state.themeCatalog.map((entry) => entry.name);
  const selectedDefaults = defaults.filter((name) => knownThemes.includes(name));

  if (selectedDefaults.length === 0 && knownThemes.length > 0) {
    createRow({ theme: knownThemes[0] });
    return;
  }

  if (selectedDefaults.length === 0) {
    createRow();
    return;
  }

  selectedDefaults.forEach((theme) => {
    createRow({ theme });
  });
}

async function initializeUi() {
  try {
    await loadUiMetadata();
    initializeRows();
    renderRows();
  } catch (error) {
    warningBox.textContent = error.message || 'Failed to initialize form metadata.';
    createRow();
    renderRows();
  }
}

buildBtn.addEventListener('click', async () => {
  const rows = collectRows();
  const outputThemes = collectOutputThemes();
  resultEl.textContent = 'Building...';
  warningBox.textContent = '';

  try {
    const response = await fetch('/api/build-deck', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows, outputThemes })
    });

    const data = await response.json();

    if (!response.ok || data.ok === false) {
      const warnings = (data.warnings || []).join('\n');
      warningBox.textContent = warnings || data.error || 'Validation failed.';
      resultEl.textContent = JSON.stringify(data, null, 2);
      return;
    }

    warningBox.textContent = '';
    const displayText = data.filteredCsv || (data.rows || []).map((row) => Array.isArray(row) ? row.join(',') : row).join('\n');
    resultEl.textContent = displayText || JSON.stringify(data, null, 2);
  } catch (error) {
    resultEl.textContent = 'Request failed: ' + error.message;
  }
});

addThemeBtn.addEventListener('click', () => {
  createRow();
  renderRows();
});

themeRowsEl.addEventListener('change', handleThemeRowInteraction);
themeRowsEl.addEventListener('click', handleThemeRowClick);

copyBtn.addEventListener('click', async () => {
  try {
    await copyTextToClipboard(resultEl.textContent || '');
    flashCopyStatus('Result copied to clipboard.');
  } catch (error) {
    flashCopyStatus(error.message || 'Copy failed.', true);
  }
});

initializeUi();
