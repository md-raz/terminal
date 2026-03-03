const output = document.getElementById('terminal-output');
const input = document.getElementById('console-input');
const terminal = document.getElementById('terminal-shell');
const srStatus = document.getElementById('sr-status');

let currentState = 'menu';
let currentPage = null;
let isAnimating = false;
let asciiArt = '';
let projectsData = [];
let researchData = [];
let linksData = [];
let profileData = {};

let history = [];
let historyIndex = -1;
let activeRows = [];
let activeKind = null;
let activeIndex = -1;
let dashboardBindings = null;
let simulationTimer = null;
let simulationRunning = true;

const pages = ['research', 'links'];
const baseCommands = ['whoami', 'ls', 'help', 'keys', 'view', 'theme', 'open', 'run', 'stop', 'focus', 'echo', 'date', 'clear'];
const themes = ['default', 'amber', 'ice'];
const LINE_DELAY = 30;
const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

const simState = {
  seed: 41731,
  tick: 0,
  metrics: {
    cpu: 0.31,
    mem: 0.42,
    net: 0.15,
    queue: 6,
  },
  history: {
    cpu: Array(24).fill(0.28),
    mem: Array(24).fill(0.35),
    net: Array(24).fill(0.12),
  },
  spinnerIndex: 0,
  wavePhase: 0,
  matrixLine: '',
  processSort: 'cpu',
  processes: [],
};

function rand() {
  simState.seed = (simState.seed * 1664525 + 1013904223) >>> 0;
  return simState.seed / 4294967296;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function updateClock() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  document.getElementById('clock').textContent = `${hh}:${mm}:${ss}`;
}
updateClock();
setInterval(updateClock, 1000);

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function termLine(text, cls) {
  return el('div', `term-line${cls ? ` ${cls}` : ''}`, text);
}

function announce(text) {
  if (!srStatus) return;
  srStatus.textContent = '';
  setTimeout(() => { srStatus.textContent = text; }, 0);
}

function setBusy(on) {
  terminal.classList.toggle('is-busy', !!on);
}

function pulseAlert() {
  terminal.classList.remove('is-alert');
  void terminal.offsetWidth;
  terminal.classList.add('is-alert');
}

function animateSequence(frames, delay, onComplete) {
  isAnimating = true;
  setBusy(true);

  const effectiveDelay = reducedMotionQuery.matches ? 0 : delay;
  let i = 0;
  function next() {
    if (i >= frames.length) {
      isAnimating = false;
      setBusy(false);
      if (onComplete) onComplete();
      return;
    }
    output.appendChild(frames[i]);
    output.scrollTop = output.scrollHeight;
    i++;
    if (effectiveDelay === 0) {
      next();
      return;
    }
    setTimeout(next, effectiveDelay);
  }
  next();
}

function transitionTo(buildFrames, onComplete) {
  clearSelectionState();
  dashboardBindings = null;

  if (output.children.length > 0 && !reducedMotionQuery.matches) {
    isAnimating = true;
    setBusy(true);
    const wrapper = el('div', 'scroll-wrapper');
    while (output.firstChild) wrapper.appendChild(output.firstChild);
    output.appendChild(wrapper);
    output.style.overflow = 'hidden';

    requestAnimationFrame(() => {
      wrapper.classList.add('scrolling-up');

      let handled = false;
      const finish = () => {
        if (handled) return;
        handled = true;
        output.style.overflow = '';
        output.innerHTML = '';
        animateSequence(buildFrames(), LINE_DELAY, onComplete);
      };

      wrapper.addEventListener('animationend', finish, { once: true });
      setTimeout(finish, 500);
    });
  } else {
    output.innerHTML = '';
    animateSequence(buildFrames(), LINE_DELAY, onComplete);
  }
}

function buildStatusBar(items) {
  const bar = el('div', 'status-bar');
  items.forEach(([label, value]) => {
    const cell = el('span', 'status-cell');
    cell.appendChild(document.createTextNode(`${label}: `));
    cell.appendChild(el('span', 'status-chip', value));
    bar.appendChild(cell);
  });
  return bar;
}

function buildKeyHints(hints) {
  const wrap = el('div', 'key-hints');
  hints.forEach(([key, desc]) => {
    const hint = el('span', 'key-hint');
    const keyEl = el('b', '', key);
    hint.appendChild(keyEl);
    hint.appendChild(document.createTextNode(` ${desc}`));
    wrap.appendChild(hint);
  });
  return wrap;
}

function buildPanel(title, children) {
  const panel = el('div', 'tui-panel');
  panel.appendChild(el('div', 'panel-header', title));
  const body = el('div', 'panel-body');
  children.forEach((child) => body.appendChild(child));
  panel.appendChild(body);
  return panel;
}

function getProfileValue(key, fallback) {
  return profileData[key] || fallback;
}

function getListValue(key) {
  const value = profileData[key];
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

function buildNeofetchLines() {
  const artLines = asciiArt ? asciiArt.split('\n') : [];
  const maxArtWidth = artLines.length > 0 ? Math.max(...artLines.map((line) => line.length)) : 0;
  const gap = '    ';

  const interests = getListValue('interests');
  const infoLines = [
    { type: 'name', text: getProfileValue('name', 'Md Raz') },
    { type: 'title', text: getProfileValue('title', 'Ph.D. Candidate, Electrical and Computer Engineering') },
    { type: 'sep' },
    { type: 'field', label: 'Affiliation', value: getProfileValue('affiliation', 'New York University (NYU Tandon)') },
    { type: 'field', label: 'Role', value: getProfileValue('role', 'Graduate Research Assistant') },
    { type: 'field', label: 'Location', value: getProfileValue('location', 'New York, NY, USA') },
    { type: 'field', label: 'Research', value: getProfileValue('researchFocus', 'Cyber-physical systems and hardware security') },
    { type: 'field', label: 'Interests', value: interests.slice(0, 3).join(', ') || 'Hardware security, embedded systems, AI/ML' },
  ];

  const totalLines = Math.max(artLines.length, infoLines.length);
  const lines = [];
  for (let i = 0; i < totalLines; i++) {
    const line = el('div', 'neofetch-line');
    const artText = (artLines[i] || '').padEnd(maxArtWidth);
    line.appendChild(el('span', 'neofetch-art', artText + gap));
    const info = infoLines[i];
    if (info) {
      if (info.type === 'name') {
        line.appendChild(el('span', 'neofetch-name', info.text));
      } else if (info.type === 'title') {
        line.appendChild(el('span', 'neofetch-title-text', info.text));
      } else if (info.type === 'sep') {
        line.appendChild(el('span', 'neofetch-sep', '─'.repeat(32)));
      } else if (info.type === 'field') {
        line.appendChild(el('span', 'neofetch-label', `${info.label}:`.padEnd(13)));
        line.appendChild(el('span', 'neofetch-value', info.value));
      }
    }
    lines.push(line);
  }
  return lines;
}

function buildAboutLines() {
  const about = getListValue('about');
  if (about.length === 0) return [];
  const lines = [termLine(''), termLine('$ cat about.txt', 'prompt')];
  about.forEach((text) => lines.push(termLine(`  ${text}`)));
  return lines;
}

function buildMenuItem(branch, name, hint) {
  const row = el('div', 'menu-item');
  row.dataset.page = name;
  row.appendChild(el('span', 'tree-branch', branch));
  row.appendChild(document.createTextNode(name));
  if (hint) row.appendChild(el('span', 'tree-branch', `   (${hint})`));
  row.addEventListener('click', () => navigateTo(name));
  return row;
}

function showHome() {
  currentState = 'menu';
  currentPage = null;

  transitionTo(() => [
    termLine('$ whoami', 'prompt'),
    buildStatusBar([
      ['name', getProfileValue('name', 'Md Raz')],
      ['role', getProfileValue('role', 'Ph.D. Candidate')],
      ['location', getProfileValue('location', 'New York, NY')],
    ]),
    ...buildNeofetchLines(),
    ...buildAboutLines(),
    termLine(''),
    termLine('$ tree ./', 'prompt'),
    termLine(''),
    buildMenuItem('├── ', 'research'),
    buildMenuItem('└── ', 'links'),
  ], () => {
    const rows = [...output.querySelectorAll('.menu-item')];
    setActiveRows(rows, 'menu');
    input.focus();
  });
}

function buildReturnLine() {
  const row = el('div', 'term-line');
  const btn = el('button', 'return-btn', '[return]');
  btn.addEventListener('click', showHome);
  row.appendChild(btn);
  return row;
}

function formatPercent(v) {
  return `${String(Math.round(v * 100)).padStart(2)}%`;
}

function sparkline(values) {
  const glyphs = '▁▂▃▄▅▆▇█';
  return values.map((v) => glyphs[Math.floor(clamp(v, 0, 0.999) * glyphs.length)]).join('');
}

function buildProjectLines() {
  const lines = [];
  if (projectsData.length === 0) {
    lines.push(termLine('  No projects loaded.', 'dim'));
    return { lines, rows: [] };
  }

  lines.push(termLine(''));
  const rows = [];
  projectsData.forEach((project, i) => {
    const row = el('div', 'project-row');
    row.appendChild(el('span', 'project-name', project.name || `project-${i + 1}`));
    row.appendChild(el('span', 'project-desc', project.description || 'no description'));
    if (project.status) row.appendChild(el('span', 'badge', project.status));
    row.addEventListener('click', () => {
      setActiveRow(i, true);
      if (project.url) openUrl(project.url);
    });
    rows.push(row);
    lines.push(row);
  });
  return { lines, rows };
}

function buildResearchLines() {
  const lines = [];
  if (researchData.length === 0) {
    lines.push(termLine('  No research papers found.', 'dim'));
    return { lines, rows: [] };
  }

  lines.push(termLine(''));
  const rows = [];
  researchData.forEach((paper, i) => {
    const row = el('div', 'research-row');
    row.appendChild(el('span', 'research-num', `  [${String(i + 1).padStart(2)}] `));
    row.appendChild(el('span', 'research-title', paper.title || `paper-${i + 1}`));
    if (paper.year) row.appendChild(el('span', 'research-year', `  (${paper.year})`));
    row.addEventListener('click', () => {
      setActiveRow(i, true);
      if (paper.url) openUrl(paper.url);
    });
    rows.push(row);
    lines.push(row);
  });
  return { lines, rows };
}

function buildLinkLines() {
  const lines = [];
  if (linksData.length === 0) {
    lines.push(termLine('  No links configured.', 'dim'));
    return { lines, rows: [] };
  }
  lines.push(termLine(''));
  const rows = [];
  linksData.forEach((link, i) => {
    const row = el('div', 'link-row');
    row.appendChild(el('span', 'link-label', link.label || `link-${i + 1}`));
    const details = [];
    if (link.url) details.push(link.url);
    if (link.description) details.push(link.description);
    row.appendChild(el('span', 'link-url', details.join('  |  ')));
    row.addEventListener('click', () => {
      setActiveRow(i, true);
      if (link.url) openUrl(link.url);
    });
    rows.push(row);
    lines.push(row);
  });
  return { lines, rows };
}

function buildMetricRow(label, key) {
  const row = el('div', 'metric-row');
  const l = el('span', 'metric-label', label);
  const bar = el('div', 'metric-bar');
  const fill = el('div', 'metric-fill');
  const value = el('span', 'metric-value', '0%');
  const spark = el('span', 'sparkline', '');
  bar.appendChild(fill);
  row.appendChild(l);
  row.appendChild(bar);
  row.appendChild(value);
  row.appendChild(spark);
  dashboardBindings.metrics[key] = { fill, value, spark };
  return row;
}

function buildDashboardFrames() {
  dashboardBindings = {
    metrics: {},
    processRows: [],
    processCells: [],
    spinnerEl: null,
    waveEl: null,
    matrixEl: null,
    modeEl: null,
  };

  const frames = [];
  frames.push(termLine('$ view dashboard', 'prompt'));
  const status = buildStatusBar([
    ['panel', 'dashboard'],
    ['feed', simulationRunning ? 'running' : 'paused'],
    ['sort', simState.processSort.toUpperCase()],
    ['rows', `${simState.processes.length}`],
  ]);
  dashboardBindings.modeEl = status.querySelector('.status-chip');
  frames.push(status);

  const metricPanel = buildPanel('system-metrics', [
    buildMetricRow('CPU', 'cpu'),
    buildMetricRow('MEM', 'mem'),
    buildMetricRow('NET', 'net'),
    termLine('queue: 000 pending', 'dim'),
  ]);
  dashboardBindings.queueEl = metricPanel.querySelector('.term-line.dim');
  frames.push(metricPanel);

  const tableHeader = el('div', 'process-table-header');
  ['PID', 'NAME', 'CPU', 'MEM', 'STATE'].forEach((name) => {
    tableHeader.appendChild(el('span', '', name));
  });
  const processRows = [tableHeader];
  simState.processes.forEach((proc, idx) => {
    const row = el('div', 'process-row');
    const pid = el('span', '', String(proc.pid));
    const name = el('span', 'process-name', proc.name);
    const cpu = el('span', '', formatPercent(proc.cpu));
    const mem = el('span', '', formatPercent(proc.mem));
    const state = el('span', '', proc.state);
    row.append(pid, name, cpu, mem, state);
    row.addEventListener('click', () => {
      setActiveRow(idx, true);
      openActiveRow();
    });
    dashboardBindings.processRows.push(row);
    dashboardBindings.processCells.push({ pid, name, cpu, mem, state });
    processRows.push(row);
  });
  frames.push(buildPanel('process-list', processRows));

  const spinnerLine = termLine('spin: |');
  spinnerLine.classList.add('ascii-anim');
  const waveLine = termLine('wave: ▁▂▃▄▅▆▇█', 'dim');
  waveLine.classList.add('ascii-anim');
  const matrixLine = termLine('mesh: ', 'dim');
  matrixLine.classList.add('ascii-anim');
  dashboardBindings.spinnerEl = spinnerLine;
  dashboardBindings.waveEl = waveLine;
  dashboardBindings.matrixEl = matrixLine;

  frames.push(buildPanel('activity', [spinnerLine, waveLine, matrixLine]));
  frames.push(buildReturnLine());
  return frames;
}

function renderDashboardDynamic() {
  if (!dashboardBindings) return;
  ['cpu', 'mem', 'net'].forEach((key) => {
    const metric = simState.metrics[key];
    const ui = dashboardBindings.metrics[key];
    if (!ui) return;
    ui.fill.style.width = `${Math.round(metric * 100)}%`;
    ui.value.textContent = formatPercent(metric);
    ui.spark.textContent = sparkline(simState.history[key]);
  });
  if (dashboardBindings.queueEl) {
    dashboardBindings.queueEl.textContent = `queue: ${String(simState.metrics.queue).padStart(3, '0')} pending`;
  }
  dashboardBindings.processCells.forEach((cells, idx) => {
    const proc = simState.processes[idx];
    if (!proc) return;
    cells.pid.textContent = String(proc.pid);
    cells.name.textContent = proc.name;
    cells.cpu.textContent = formatPercent(proc.cpu);
    cells.mem.textContent = formatPercent(proc.mem);
    cells.state.textContent = proc.state;
  });

  const spinner = ['|', '/', '-', '\\'];
  if (dashboardBindings.spinnerEl) {
    dashboardBindings.spinnerEl.textContent = `spin: ${spinner[simState.spinnerIndex % spinner.length]}`;
  }
  if (dashboardBindings.waveEl) {
    dashboardBindings.waveEl.textContent = `wave: ${buildWaveLine(simState.wavePhase)}`;
  }
  if (dashboardBindings.matrixEl) {
    dashboardBindings.matrixEl.textContent = `mesh: ${simState.matrixLine}`;
  }
}

function buildWaveLine(phase) {
  const chars = ' .:-=+*#%@';
  let text = '';
  for (let i = 0; i < 28; i++) {
    const v = (Math.sin((i + phase) * 0.45) + 1) / 2;
    text += chars[Math.floor(v * (chars.length - 1))];
  }
  return text;
}

function buildMatrixLine() {
  const glyphs = '01abcdef<>[]{}+-*/';
  let out = '';
  for (let i = 0; i < 30; i++) {
    out += rand() > 0.72 ? glyphs[Math.floor(rand() * glyphs.length)] : '.';
  }
  return out;
}

function clearSelectionState() {
  activeRows.forEach((row) => row.classList.remove('active'));
  activeRows = [];
  activeKind = null;
  activeIndex = -1;
}

function setActiveRows(rows, kind) {
  clearSelectionState();
  activeRows = rows;
  activeKind = kind;
  if (rows.length > 0) setActiveRow(0, false);
}

function setActiveRow(index, scrollIntoView) {
  if (!activeRows.length) return;
  const max = activeRows.length - 1;
  activeIndex = clamp(index, 0, max);
  activeRows.forEach((row, i) => row.classList.toggle('active', i === activeIndex));
  if (scrollIntoView) {
    activeRows[activeIndex].scrollIntoView({ block: 'nearest' });
  }
}

function moveSelection(delta) {
  if (!activeRows.length) return false;
  setActiveRow(activeIndex + delta, true);
  return true;
}

function openActiveRow() {
  if (activeIndex < 0) return false;
  if (activeKind === 'menu') {
    const page = activeRows[activeIndex].dataset.page;
    if (page) navigateTo(page);
    return true;
  }
  if (activeKind === 'projects') {
    const item = projectsData[activeIndex];
    if (item && item.url) {
      openUrl(item.url);
      return true;
    }
  }
  if (activeKind === 'research') {
    const item = researchData[activeIndex];
    if (item && item.url) {
      openUrl(item.url);
      return true;
    }
  }
  if (activeKind === 'links') {
    const item = linksData[activeIndex];
    if (item && item.url) {
      openUrl(item.url);
      return true;
    }
  }
  if (activeKind === 'process') {
    const proc = simState.processes[activeIndex];
    if (proc) {
      printLine(`pid=${proc.pid} name=${proc.name} cpu=${formatPercent(proc.cpu)} mem=${formatPercent(proc.mem)} state=${proc.state}`, 'dim');
      return true;
    }
  }
  return false;
}

function navigateTo(page) {
  const target = String(page || '').toLowerCase();
  if (!pages.includes(target)) return false;

  if (target === 'dashboard') {
    currentState = 'dashboard';
    currentPage = 'dashboard';
    transitionTo(() => buildDashboardFrames(), () => {
      setActiveRows(dashboardBindings.processRows, 'process');
      renderDashboardDynamic();
      input.focus();
    });
    announce('Dashboard view');
    return true;
  }

  currentState = 'content';
  currentPage = target;
  let selectedRows = [];

  transitionTo(() => {
    const frames = [];
    frames.push(termLine(`$ cat ${target}/`, 'prompt'));
    frames.push(buildStatusBar([
      ['view', target],
      ['items', String(target === 'projects' ? projectsData.length : target === 'research' ? researchData.length : linksData.length)],
      ['updated', new Date().toLocaleDateString()],
    ]));
    frames.push(el('div', 'content-header', target));

    let built = { lines: [], rows: [] };
    if (target === 'projects') built = buildProjectLines();
    if (target === 'research') built = buildResearchLines();
    if (target === 'links') built = buildLinkLines();
    selectedRows = built.rows;
    frames.push(...built.lines);
    frames.push(buildReturnLine());

    return frames;
  }, () => {
    setActiveRows(selectedRows, target);
    input.focus();
  });

  announce(`${target} view`);
  return true;
}

function printLine(text, cls) {
  output.appendChild(termLine(text, cls));
  output.scrollTop = output.scrollHeight;
}

function openUrl(url) {
  if (!url) return;
  let finalUrl = url;
  if (!/^https?:\/\//i.test(finalUrl)) finalUrl = `https://${finalUrl}`;
  window.open(finalUrl, '_blank');
  printLine(`opening ${finalUrl}`, 'ok');
}

function tokenizeInput(raw) {
  const tokens = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m = null;
  while ((m = re.exec(raw)) !== null) {
    tokens.push(m[1] ?? m[2] ?? m[3]);
  }
  return tokens;
}

function setTheme(name) {
  const next = name || 'default';
  if (!themes.includes(next)) return false;
  if (next === 'default') {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = next;
  }
  announce(`Theme ${next}`);
  return true;
}

function cycleTheme() {
  const current = document.documentElement.dataset.theme || 'default';
  let index = themes.indexOf(current);
  if (index < 0) index = 0;
  index = (index + 1) % themes.length;
  const next = themes[index];
  setTheme(next);
  return next;
}

function showHelp() {
  return [
    'ok:commands:',
    '  help, keys, whoami, ls, view <research|links>',
    '  theme [default|amber|ice], run, stop, focus <cpu|mem|pid|name>',
    '  open <url>, echo <text>, date, clear',
    '  aliases: q, back, return, exit',
  ];
}

function showKeys() {
  return [
    'ok:keybinds:',
    '  Enter: execute command / open selected row',
    '  ArrowUp/ArrowDown: history or move row selection',
    '  Tab/Shift+Tab: cycle selection',
    '  Esc: return to home screen',
    '  Ctrl+L: clear output',
    '  F2: cycle theme',
  ];
}

function applySort(kind) {
  if (!kind) return false;
  if (kind === 'cpu' || kind === 'mem') {
    simState.processSort = kind;
    simState.processes.sort((a, b) => b[kind] - a[kind]);
    if (currentState === 'dashboard') {
      transitionTo(() => buildDashboardFrames(), () => {
        setActiveRows(dashboardBindings.processRows, 'process');
        renderDashboardDynamic();
      });
    }
    return true;
  }
  if (kind === 'pid') {
    simState.processSort = kind;
    simState.processes.sort((a, b) => a.pid - b.pid);
    if (currentState === 'dashboard') {
      transitionTo(() => buildDashboardFrames(), () => {
        setActiveRows(dashboardBindings.processRows, 'process');
        renderDashboardDynamic();
      });
    }
    return true;
  }
  if (kind === 'name') {
    simState.processSort = kind;
    simState.processes.sort((a, b) => a.name.localeCompare(b.name));
    if (currentState === 'dashboard') {
      transitionTo(() => buildDashboardFrames(), () => {
        setActiveRows(dashboardBindings.processRows, 'process');
        renderDashboardDynamic();
      });
    }
    return true;
  }
  return false;
}

const commands = {
  whoami: () => { showHome(); return null; },
  ls: () => { showHome(); return null; },
  help: () => showHelp(),
  keys: () => showKeys(),
  view: (args) => {
    if (args.length === 0) return 'err:usage: view <projects|research|links|dashboard>';
    const ok = navigateTo(args[0]);
    return ok ? null : `err:unknown view ${args[0]}`;
  },
  theme: (args) => {
    if (args.length === 0) return `ok:theme=${document.documentElement.dataset.theme || 'default'}`;
    const ok = setTheme(args[0]);
    return ok ? `ok:theme set to ${args[0]}` : 'err:usage: theme <default|amber|ice>';
  },
  run: (args) => {
    simulationRunning = true;
    if (args[0] === 'dashboard' || currentState !== 'dashboard') navigateTo('dashboard');
    return 'ok:simulation running';
  },
  stop: () => {
    simulationRunning = false;
    return 'ok:simulation paused';
  },
  focus: (args) => {
    if (args.length === 0) return 'err:usage: focus <cpu|mem|pid|name>';
    const ok = applySort(args[0].toLowerCase());
    return ok ? `ok:sorted by ${args[0].toLowerCase()}` : 'err:focus supports cpu, mem, pid, name';
  },
  open: (args) => {
    if (args.length === 0) return 'err:usage: open <url>';
    openUrl(args[0]);
    return null;
  },
  echo: (args) => args.join(' '),
  date: () => new Date().toString(),
  clear: () => {
    output.innerHTML = '';
    return null;
  },
};

function handleCommand(raw) {
  if (isAnimating) return;
  const trimmed = raw.trim();
  if (!trimmed) return;

  const parts = tokenizeInput(trimmed);
  const cmd = (parts[0] || '').toLowerCase();
  const args = parts.slice(1);

  if (cmd === 'return' || cmd === 'exit' || cmd === 'back' || cmd === 'q') {
    showHome();
    return;
  }
  if (pages.includes(cmd)) {
    navigateTo(cmd);
    return;
  }

  const handler = commands[cmd];
  if (!handler) {
    pulseAlert();
    printLine(`command not found: ${cmd}`, 'err');
    return;
  }

  const result = handler(args);
  if (result === null || result === undefined) return;
  const lines = Array.isArray(result) ? result : [result];
  lines.forEach((line) => {
    if (line.startsWith('err:')) printLine(line.slice(4), 'err');
    else if (line.startsWith('ok:')) printLine(line.slice(3), 'ok');
    else if (line.startsWith('warn:')) printLine(line.slice(5), 'warn');
    else printLine(line, '');
  });
}

function autocompleteCommand() {
  const value = input.value.trim();
  if (!value || /\s/.test(value)) return false;
  const list = [...new Set([...baseCommands, ...pages])];
  const matches = list.filter((item) => item.startsWith(value.toLowerCase()));
  if (matches.length === 1) {
    input.value = `${matches[0]} `;
    return true;
  }
  if (matches.length > 1) {
    printLine(matches.join('  '), 'dim');
    return true;
  }
  return false;
}

function handleInteractiveKeys(e) {
  if (!activeRows.length || input.value.trim() !== '') return false;
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    return moveSelection(-1);
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    return moveSelection(1);
  }
  if (e.key === 'Tab') {
    e.preventDefault();
    return moveSelection(e.shiftKey ? -1 : 1);
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    return openActiveRow();
  }
  return false;
}

input.addEventListener('keydown', (e) => {
  if (handleInteractiveKeys(e)) return;

  if (e.key === 'Enter') {
    const val = input.value;
    if (val.trim()) {
      history.unshift(val);
      if (history.length > 50) history.pop();
    }
    historyIndex = -1;
    handleCommand(val);
    input.value = '';
    return;
  }

  if (e.key === 'Tab') {
    e.preventDefault();
    autocompleteCommand();
    return;
  }

  if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (historyIndex < history.length - 1) {
      historyIndex++;
      input.value = history[historyIndex];
    }
    return;
  }

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (historyIndex > 0) {
      historyIndex--;
      input.value = history[historyIndex];
    } else {
      historyIndex = -1;
      input.value = '';
    }
    return;
  }

  if (e.key === 'Escape') {
    e.preventDefault();
    if (currentState !== 'menu') showHome();
    return;
  }

  if (e.key === '?' && input.value.trim() === '') {
    e.preventDefault();
    showKeys().forEach((line) => {
      if (line.startsWith('ok:')) printLine(line.slice(3), 'ok');
      else printLine(line, 'dim');
    });
    return;
  }

  if (e.key.toLowerCase() === 'l' && e.ctrlKey) {
    e.preventDefault();
    output.innerHTML = '';
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'F2') {
    e.preventDefault();
    const next = cycleTheme();
    printLine(`theme -> ${next}`, 'ok');
    return;
  }
});

terminal.addEventListener('click', (e) => {
  if (e.target.tagName !== 'A' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'BUTTON') {
    input.focus();
  }
});

function seedProcesses() {
  const base = projectsData.length > 0 ? projectsData.map((p) => p.name) : ['renderer', 'crawler', 'inference', 'graph', 'assets', 'watcher'];
  simState.processes = base.slice(0, 8).map((name, idx) => ({
    pid: 2100 + idx * 7 + Math.floor(rand() * 20),
    name: name.slice(0, 18),
    cpu: clamp(0.12 + rand() * 0.55, 0.02, 0.99),
    mem: clamp(0.08 + rand() * 0.45, 0.02, 0.99),
    state: ['run', 'sleep', 'wait'][Math.floor(rand() * 3)],
  }));
}

function tickSimulation() {
  if (!simulationRunning) return;

  simState.tick++;
  const m = simState.metrics;
  m.cpu = clamp(m.cpu * 0.7 + rand() * 0.5 * 0.3 + 0.18 * 0.3, 0.06, 0.96);
  m.mem = clamp(m.mem * 0.85 + (0.35 + rand() * 0.35) * 0.15, 0.2, 0.94);
  m.net = clamp(Math.abs(Math.sin(simState.tick / 7)) * 0.5 + rand() * 0.2, 0.03, 0.96);
  m.queue = Math.max(0, Math.round((m.cpu * 12 + rand() * 4) - 3));

  simState.history.cpu.push(m.cpu);
  simState.history.mem.push(m.mem);
  simState.history.net.push(m.net);
  if (simState.history.cpu.length > 24) simState.history.cpu.shift();
  if (simState.history.mem.length > 24) simState.history.mem.shift();
  if (simState.history.net.length > 24) simState.history.net.shift();

  simState.processes.forEach((proc) => {
    proc.cpu = clamp(proc.cpu + (rand() - 0.5) * 0.1, 0.01, 0.99);
    proc.mem = clamp(proc.mem + (rand() - 0.5) * 0.06, 0.02, 0.99);
    const r = rand();
    proc.state = r > 0.82 ? 'wait' : r > 0.55 ? 'run' : 'sleep';
  });

  if (simState.processSort === 'cpu' || simState.processSort === 'mem') {
    simState.processes.sort((a, b) => b[simState.processSort] - a[simState.processSort]);
  } else if (simState.processSort === 'pid') {
    simState.processes.sort((a, b) => a.pid - b.pid);
  } else {
    simState.processes.sort((a, b) => a.name.localeCompare(b.name));
  }

  simState.spinnerIndex = (simState.spinnerIndex + 1) % 4;
  simState.wavePhase += 1;
  simState.matrixLine = buildMatrixLine();

  if (currentState === 'dashboard') renderDashboardDynamic();
}

function startSimulationLoop() {
  if (simulationTimer) clearInterval(simulationTimer);
  simulationTimer = setInterval(tickSimulation, reducedMotionQuery.matches ? 1000 : 650);
}

function normalizeData(d) {
  profileData = d.profile || {};
  projectsData = (d.projects || []).map((p) => ({
    name: p.name || 'untitled-project',
    description: p.description || '',
    url: p.url || '',
    tags: p.tags || [],
    status: p.status || '',
  }));
  researchData = (d.research || []).map((r) => ({
    title: r.title || '',
    year: r.year || '',
    url: r.url || '',
    tags: r.tags || [],
  }));
  linksData = (d.links || []).map((l) => ({
    label: l.label || '',
    url: l.url || '',
    description: l.description || '',
    group: l.group || 'general',
  }));
}

Promise.all([
  fetch('ascii.txt')
    .then((r) => r.text())
    .then((t) => { asciiArt = t.trimEnd(); })
    .catch(() => {
      asciiArt = '';
    }),
  fetch('data.json')
    .then((r) => r.json())
    .then((d) => {
      normalizeData(d);
      return null;
    })
    .catch(() => {
      normalizeData({});
      printLine('data.json load failed, using defaults', 'warn');
    }),
]).then(() => {
  seedProcesses();
  simState.matrixLine = buildMatrixLine();
  startSimulationLoop();
  showHome();
});
