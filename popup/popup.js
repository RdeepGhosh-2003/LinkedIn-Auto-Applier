/**
 * LinkedIn Auto-Applier - Popup Controller
 * Manages Dashboard stats, live logs, rules, saved jobs, profile editing, and screening Q&A bank.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // DOM Elements - Navigation & Header
  const navTabBtns = document.querySelectorAll('.nav-tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');
  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  const sessionBadge = document.getElementById('session-badge');

  // DOM Elements - Tab 1: Dashboard
  const btnStart = document.getElementById('btn-start');
  const btnStop = document.getElementById('btn-stop');
  const progressText = document.getElementById('progress-text');
  const progressBarFill = document.getElementById('progress-bar-fill');
  const metricScanned = document.getElementById('metric-scanned');
  const metricApplied = document.getElementById('metric-applied');
  const metricSaved = document.getElementById('metric-saved');
  const metricSkipped = document.getElementById('metric-skipped');
  const consoleLogs = document.getElementById('console-logs');
  const btnClearLogs = document.getElementById('btn-clear-logs');

  // DOM Elements - Tab 2: Rules & Filters
  const ruleQuery = document.getElementById('rule-query');
  const ruleLocation = document.getElementById('rule-location');
  const ruleDateFilter = document.getElementById('rule-date-filter');
  const ruleSortBy = document.getElementById('rule-sort-by');
  const ruleDualStrategy = document.getElementById('rule-dual-strategy');
  const ruleExp = document.getElementById('rule-exp');
  const ruleSalary = document.getElementById('rule-salary');
  const ruleUnlistedExp = document.getElementById('rule-unlisted-exp');
  const ruleBlacklist = document.getElementById('rule-blacklist');
  const ruleStrictLocation = document.getElementById('rule-strict-location');
  const ruleBlockAiSpam = document.getElementById('rule-block-ai-spam');
  const ruleTitleRelevance = document.getElementById('rule-title-relevance');
  const ruleUncheckFollow = document.getElementById('rule-uncheck-follow');
  const ruleNativeSave = document.getElementById('rule-native-save');
  const ruleMaxJobs = document.getElementById('rule-max-jobs');
  const ruleDelay = document.getElementById('rule-delay');
  const btnSaveRules = document.getElementById('btn-save-rules');

  // DOM Elements - Tab: Applied Jobs
  const appliedSearchInput = document.getElementById('applied-search-input');
  const btnExportApplied = document.getElementById('btn-export-applied');
  const btnClearApplied = document.getElementById('btn-clear-applied');
  const appliedJobsContainer = document.getElementById('applied-jobs-container');
  const appliedCountBadge = document.getElementById('applied-count-badge');

  // DOM Elements - Tab: Saved Jobs
  const savedSearchInput = document.getElementById('saved-search-input');
  const btnExportSaved = document.getElementById('btn-export-saved');
  const btnClearSaved = document.getElementById('btn-clear-saved');
  const savedJobsContainer = document.getElementById('saved-jobs-container');
  const savedCountBadge = document.getElementById('saved-count-badge');

  // DOM Elements - Tab: Profile & Screening QA
  const profFullname = document.getElementById('prof-fullname');
  const profPhone = document.getElementById('prof-phone');
  const profEmail = document.getElementById('prof-email');
  const profCity = document.getElementById('prof-city');
  const profLinkedin = document.getElementById('prof-linkedin');
  const profCurrTitle = document.getElementById('prof-curr-title');
  const profCurrCompany = document.getElementById('prof-curr-company');
  const profYearsExp = document.getElementById('prof-years-exp');
  const profNotice = document.getElementById('prof-notice');
  const profCurrSalary = document.getElementById('prof-curr-salary');
  const profExpSalary = document.getElementById('prof-exp-salary');
  const btnAddQa = document.getElementById('btn-add-qa');
  const qaBankList = document.getElementById('qa-bank-list');
  const btnSaveProfile = document.getElementById('btn-save-profile');

  let currentProfile = {};
  let currentSession = {};
  let savedJobsList = [];
  let appliedJobsList = [];

  // 1. Theme Management
  const themeData = await chrome.storage.local.get(['uiTheme']);
  if (themeData.uiTheme === 'light') {
    document.body.setAttribute('data-theme', 'light');
    themeToggleBtn.textContent = '☀️';
  } else {
    document.body.removeAttribute('data-theme');
    themeToggleBtn.textContent = '🌙';
  }

  themeToggleBtn.addEventListener('click', async () => {
    const isLight = document.body.getAttribute('data-theme') === 'light';
    if (isLight) {
      document.body.removeAttribute('data-theme');
      themeToggleBtn.textContent = '🌙';
      await chrome.storage.local.set({ uiTheme: 'dark' });
    } else {
      document.body.setAttribute('data-theme', 'light');
      themeToggleBtn.textContent = '☀️';
      await chrome.storage.local.set({ uiTheme: 'light' });
    }
  });

  // 2. Tab Navigation
  navTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTabId = btn.getAttribute('data-tab');
      navTabBtns.forEach(b => b.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const targetPane = document.getElementById(targetTabId);
      if (targetPane) targetPane.classList.add('active');

      if (targetTabId === 'tab-applied') renderAppliedJobs();
      if (targetTabId === 'tab-saved') renderSavedJobs();
    });
  });

  // 3. Load & Hydrate Data
  async function loadInitialData() {
    const data = await chrome.storage.local.get(['userProfile', 'autoApplySession', 'sessionLogs', 'savedJobs', 'appliedJobs']);
    currentProfile = data.userProfile || {};
    currentSession = data.autoApplySession || {};
    savedJobsList = data.savedJobs || [];
    appliedJobsList = data.appliedJobs || [];

    // Hydrate Rules & Settings
    const s = currentProfile.autoApplierSettings || {};
    ruleQuery.value = s.targetJobQuery || '';
    ruleLocation.value = s.targetLocation || '';
    if (s.dateFilter) ruleDateFilter.value = s.dateFilter;
    if (s.sortBy) ruleSortBy.value = s.sortBy;
    ruleDualStrategy.checked = s.dualStrategy !== false;
    ruleExp.value = s.userYearsExp !== undefined ? s.userYearsExp : 1;
    ruleSalary.value = s.minMonthlySalary !== undefined ? s.minMonthlySalary : 25000;
    if (s.unlistedExpAction) ruleUnlistedExp.value = s.unlistedExpAction;
    const defaultBlacklist = 'intern, unpaid, bpo, telecaller, faculty, teaching, night shift, annotator, annotation, reviewer, labeler, labeling, ai trainer, rlhf, evaluator, transcription, data entry, crossing hurdles, outlier, remotasks, alignerr';
    if (!s.blacklistKeywords || s.blacklistKeywords.trim() === 'intern, unpaid, bpo, telecaller, faculty, teaching, night shift') {
      ruleBlacklist.value = defaultBlacklist;
    } else {
      ruleBlacklist.value = s.blacklistKeywords;
    }
    ruleBlockAiSpam.checked = s.blockAiSpam !== false;
    ruleTitleRelevance.checked = s.matchTitleRelevance !== false;
    ruleStrictLocation.checked = s.strictLocation !== false;
    ruleUncheckFollow.checked = s.uncheckFollowCompany !== false;
    ruleNativeSave.checked = s.saveToLinkedInProfile !== false;
    ruleMaxJobs.value = s.maxJobsPerSession !== undefined ? s.maxJobsPerSession : 0;
    ruleDelay.value = s.stepDelayMs || 1000;

    // Hydrate Profile Details
    const p = currentProfile.personal || {};
    const w = currentProfile.work || {};
    const cur = w.currentRole || {};
    const tgt = w.targetRole || {};

    profFullname.value = p.fullName || '';
    profPhone.value = p.phone || '';
    profEmail.value = p.email || '';
    profCity.value = p.city || '';
    profLinkedin.value = p.linkedin || p.linkedinUrl || '';

    profCurrTitle.value = cur.jobTitle || '';
    profCurrCompany.value = cur.company || '';
    profYearsExp.value = cur.yearsExperience || '1';
    profNotice.value = tgt.noticePeriod || 'Immediate / 15 Days';
    profCurrSalary.value = cur.currentSalary || '';
    profExpSalary.value = tgt.expectedSalary || '';

    // Hydrate QA Bank
    renderQaBank(currentProfile.screening || []);

    // Hydrate Stats & Session State
    updateSessionUI(currentSession);

    // Hydrate Logs
    renderLogs(data.sessionLogs || []);

    // Update Badges
    appliedCountBadge.textContent = appliedJobsList.length;
    savedCountBadge.textContent = savedJobsList.length;
  }

  // 4. Session State & Metrics UI
  function updateSessionUI(session) {
    const isRunning = !!session?.isRunning;
    btnStart.disabled = isRunning;
    btnStop.disabled = !isRunning;

    if (isRunning) {
      sessionBadge.textContent = 'Running';
      sessionBadge.className = 'status-badge status-running';
    } else {
      sessionBadge.textContent = 'Ready';
      sessionBadge.className = 'status-badge status-idle';
    }

    const stats = session?.stats || { scanned: 0, applied: 0, saved: 0, skipped: 0 };
    metricScanned.textContent = stats.scanned || 0;
    metricApplied.textContent = stats.applied || 0;
    metricSaved.textContent = stats.saved || 0;
    metricSkipped.textContent = stats.skipped || 0;

    const maxJobs = session?.settings?.maxJobsPerSession || currentProfile?.autoApplierSettings?.maxJobsPerSession || 0;
    const totalDone = (stats.applied || 0) + (stats.saved || 0);

    if (maxJobs > 0) {
      progressText.textContent = `${totalDone} / ${maxJobs} Jobs`;
      const pct = Math.min(100, Math.round((totalDone / maxJobs) * 100));
      progressBarFill.style.width = `${pct}%`;
    } else {
      progressText.textContent = `Uncapped (${totalDone} Applied & Saved)`;
      progressBarFill.style.width = isRunning ? '100%' : '0%';
    }
  }

  // 5. Console Terminal Logs
  function renderLogs(logs) {
    if (!logs || logs.length === 0) {
      consoleLogs.innerHTML = '<div class="log-entry log-info">[System] LinkedIn Auto-Applier standing by. Click Start to begin session.</div>';
      return;
    }
    consoleLogs.innerHTML = '';
    logs.forEach(logItem => appendLogEntry(logItem));
    consoleLogs.scrollTop = consoleLogs.scrollHeight;
  }

  function appendLogEntry(logItem) {
    const div = document.createElement('div');
    div.className = `log-entry log-${logItem.type || 'info'}`;
    div.textContent = `[${logItem.timestamp || 'Now'}] ${logItem.message || ''}`;
    consoleLogs.appendChild(div);
    consoleLogs.scrollTop = consoleLogs.scrollHeight;
  }

  btnClearLogs.addEventListener('click', async () => {
    await chrome.storage.local.set({ sessionLogs: [] });
    consoleLogs.innerHTML = '<div class="log-entry log-info">[System] Logs cleared.</div>';
  });

  // 6. Start / Stop Actions
  btnStart.addEventListener('click', async () => {
    // Gather latest settings
    const settings = {
      targetJobQuery: ruleQuery.value.trim() || 'Data Analyst',
      targetLocation: ruleLocation.value.trim() || 'Bengaluru, Karnataka, India',
      dateFilter: ruleDateFilter.value,
      sortBy: ruleSortBy.value,
      dualStrategy: ruleDualStrategy.checked,
      userYearsExp: parseFloat(ruleExp.value) || 1,
      minMonthlySalary: parseInt(ruleSalary.value, 10) || 25000,
      unlistedExpAction: ruleUnlistedExp.value,
      blacklistKeywords: ruleBlacklist.value.trim(),
      blockAiSpam: ruleBlockAiSpam.checked,
      matchTitleRelevance: ruleTitleRelevance.checked,
      strictLocation: ruleStrictLocation.checked,
      uncheckFollowCompany: ruleUncheckFollow.checked,
      saveToLinkedInProfile: ruleNativeSave.checked,
      maxJobsPerSession: parseInt(ruleMaxJobs.value, 10) || 0,
      stepDelayMs: parseInt(ruleDelay.value, 10) || 1000
    };

    // Save into profile settings
    if (!currentProfile.autoApplierSettings) currentProfile.autoApplierSettings = {};
    Object.assign(currentProfile.autoApplierSettings, settings);
    await chrome.storage.local.set({ userProfile: currentProfile });

    btnStart.disabled = true;
    sessionBadge.textContent = 'Launching';

    chrome.runtime.sendMessage({ action: 'START_AUTO_APPLY', settings }, (response) => {
      if (response && response.success) {
        updateSessionUI({ isRunning: true, settings });
      } else {
        btnStart.disabled = false;
        sessionBadge.textContent = 'Error';
      }
    });
  });

  btnStop.addEventListener('click', () => {
    btnStop.disabled = true;
    chrome.runtime.sendMessage({ action: 'STOP_AUTO_APPLY' }, () => {
      updateSessionUI({ isRunning: false });
    });
  });

  // 7. Save Rules Button
  btnSaveRules.addEventListener('click', async () => {
    if (!currentProfile.autoApplierSettings) currentProfile.autoApplierSettings = {};
    currentProfile.autoApplierSettings = {
      targetJobQuery: ruleQuery.value.trim(),
      targetLocation: ruleLocation.value.trim(),
      dateFilter: ruleDateFilter.value,
      sortBy: ruleSortBy.value,
      dualStrategy: ruleDualStrategy.checked,
      userYearsExp: parseFloat(ruleExp.value) || 1,
      minMonthlySalary: parseInt(ruleSalary.value, 10) || 25000,
      unlistedExpAction: ruleUnlistedExp.value,
      blacklistKeywords: ruleBlacklist.value.trim(),
      blockAiSpam: ruleBlockAiSpam.checked,
      matchTitleRelevance: ruleTitleRelevance.checked,
      strictLocation: ruleStrictLocation.checked,
      uncheckFollowCompany: ruleUncheckFollow.checked,
      saveToLinkedInProfile: ruleNativeSave.checked,
      maxJobsPerSession: parseInt(ruleMaxJobs.value, 10) || 0,
      stepDelayMs: parseInt(ruleDelay.value, 10) || 1000
    };

    await chrome.storage.local.set({ userProfile: currentProfile });
    btnSaveRules.textContent = '✅ Saved!';
    setTimeout(() => { btnSaveRules.textContent = 'Save Rules & Filters'; }, 1500);
  });

  // 8. Applied Jobs Tab Logic
  function renderAppliedJobs(filterText = '') {
    appliedJobsContainer.innerHTML = '';
    const query = filterText.toLowerCase().trim();

    const filtered = appliedJobsList.filter(job => {
      if (!query) return true;
      return (job.title || '').toLowerCase().includes(query) ||
             (job.company || '').toLowerCase().includes(query) ||
             (job.location || '').toLowerCase().includes(query);
    });

    if (filtered.length === 0) {
      appliedJobsContainer.innerHTML = `
        <div style="text-align: center; padding: 30px; color: var(--text-secondary); font-size: 12px;">
          ${query ? 'No applied jobs match your search.' : 'No applied jobs recorded yet.<br>When Auto-Apply submits Easy Apply applications, they appear here.'}
        </div>
      `;
      return;
    }

    filtered.forEach((job, index) => {
      const card = document.createElement('div');
      card.className = 'saved-job-card';
      card.innerHTML = `
        <div class="saved-job-header">
          <div>
            <div class="saved-job-title">${escapeHtml(job.title || 'Untitled')}</div>
            <div class="saved-job-company">${escapeHtml(job.company || 'Unknown')}</div>
          </div>
          <span class="saved-job-badge badge-applied">Applied ✅</span>
        </div>
        <div class="saved-job-meta">
          <span>📍 ${escapeHtml(job.location || 'Location Not Specified')}</span>
          ${job.salary ? `<span>💰 ${escapeHtml(job.salary)}</span>` : ''}
          <span>📅 ${escapeHtml(job.appliedAt || '')}</span>
        </div>
        <div class="saved-job-footer">
          <a href="${escapeHtml(job.url || '#')}" target="_blank" class="saved-link">Open Listing ↗</a>
          <button class="delete-applied-btn" data-index="${index}">Delete</button>
        </div>
      `;
      appliedJobsContainer.appendChild(card);
    });

    // Attach delete listeners
    appliedJobsContainer.querySelectorAll('.delete-applied-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const idx = parseInt(e.target.getAttribute('data-index'), 10);
        appliedJobsList.splice(idx, 1);
        await chrome.storage.local.set({ appliedJobs: appliedJobsList });
        appliedCountBadge.textContent = appliedJobsList.length;
        renderAppliedJobs(appliedSearchInput.value);
      });
    });
  }

  appliedSearchInput.addEventListener('input', () => {
    renderAppliedJobs(appliedSearchInput.value);
  });

  btnClearApplied.addEventListener('click', async () => {
    if (confirm('Clear all applied job records?')) {
      appliedJobsList = [];
      await chrome.storage.local.set({ appliedJobs: [] });
      appliedCountBadge.textContent = 0;
      renderAppliedJobs();
    }
  });

  btnExportApplied.addEventListener('click', () => {
    if (appliedJobsList.length === 0) {
      alert('No applied jobs to export.');
      return;
    }

    const headers = ['Title', 'Company', 'Location', 'Salary', 'URL', 'Applied At'];
    const rows = appliedJobsList.map(j => [
      `"${(j.title || '').replace(/"/g, '""')}"`,
      `"${(j.company || '').replace(/"/g, '""')}"`,
      `"${(j.location || '').replace(/"/g, '""')}"`,
      `"${(j.salary || '').replace(/"/g, '""')}"`,
      `"${(j.url || '').replace(/"/g, '""')}"`,
      `"${(j.appliedAt || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `linkedin_applied_jobs_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  });

  // 9. Saved Jobs Tab Logic
  function renderSavedJobs(filterText = '') {
    savedJobsContainer.innerHTML = '';
    const query = filterText.toLowerCase().trim();

    const filtered = savedJobsList.filter(job => {
      if (!query) return true;
      return (job.title || '').toLowerCase().includes(query) ||
             (job.company || '').toLowerCase().includes(query) ||
             (job.location || '').toLowerCase().includes(query);
    });

    if (filtered.length === 0) {
      savedJobsContainer.innerHTML = `
        <div style="text-align: center; padding: 30px; color: var(--text-secondary); font-size: 12px;">
          ${query ? 'No saved jobs match your search.' : 'No company-site jobs saved yet.<br>When Dual Strategy runs, matching external jobs appear here.'}
        </div>
      `;
      return;
    }

    filtered.forEach((job, index) => {
      const card = document.createElement('div');
      card.className = 'saved-job-card';
      card.innerHTML = `
        <div class="saved-job-header">
          <div>
            <div class="saved-job-title">${escapeHtml(job.title || 'Untitled')}</div>
            <div class="saved-job-company">${escapeHtml(job.company || 'Unknown')}</div>
          </div>
          <span class="saved-job-badge">${escapeHtml(job.reason || 'Criteria Matched')}</span>
        </div>
        <div class="saved-job-meta">
          <span>📍 ${escapeHtml(job.location || 'Location Not Specified')}</span>
          ${job.salary ? `<span>💰 ${escapeHtml(job.salary)}</span>` : ''}
          <span>📅 ${escapeHtml(job.savedAt || '')}</span>
        </div>
        <div class="saved-job-footer">
          <a href="${escapeHtml(job.url || '#')}" target="_blank" class="saved-link">Open Listing ↗</a>
          <button class="delete-saved-btn" data-index="${index}">Delete</button>
        </div>
      `;
      savedJobsContainer.appendChild(card);
    });

    // Attach delete listeners
    savedJobsContainer.querySelectorAll('.delete-saved-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const idx = parseInt(e.target.getAttribute('data-index'), 10);
        savedJobsList.splice(idx, 1);
        await chrome.storage.local.set({ savedJobs: savedJobsList });
        savedCountBadge.textContent = savedJobsList.length;
        renderSavedJobs(savedSearchInput.value);
      });
    });
  }

  savedSearchInput.addEventListener('input', () => {
    renderSavedJobs(savedSearchInput.value);
  });

  btnClearSaved.addEventListener('click', async () => {
    if (confirm('Clear all saved jobs?')) {
      savedJobsList = [];
      await chrome.storage.local.set({ savedJobs: [] });
      savedCountBadge.textContent = 0;
      renderSavedJobs();
    }
  });

  btnExportSaved.addEventListener('click', () => {
    if (savedJobsList.length === 0) {
      alert('No saved jobs to export.');
      return;
    }

    const headers = ['Title', 'Company', 'Location', 'Salary', 'URL', 'Reason', 'Saved At'];
    const rows = savedJobsList.map(j => [
      `"${(j.title || '').replace(/"/g, '""')}"`,
      `"${(j.company || '').replace(/"/g, '""')}"`,
      `"${(j.location || '').replace(/"/g, '""')}"`,
      `"${(j.salary || '').replace(/"/g, '""')}"`,
      `"${(j.url || '').replace(/"/g, '""')}"`,
      `"${(j.reason || '').replace(/"/g, '""')}"`,
      `"${(j.savedAt || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `linkedin_saved_jobs_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  });

  // 10. Profile & QA Bank Tab Logic
  function renderQaBank(screeningList) {
    qaBankList.innerHTML = '';
    screeningList.forEach((item, index) => {
      const qaRow = document.createElement('div');
      qaRow.className = 'qa-item';
      qaRow.innerHTML = `
        <div class="qa-item-header">
          <label style="font-size: 10px; text-transform: uppercase;">Keyword Triggers</label>
          <button class="qa-remove-btn" data-index="${index}">✕ Remove</button>
        </div>
        <input type="text" class="qa-keywords-input" value="${escapeHtml(item.keywords || '')}" placeholder="e.g. excel, advanced excel, vlookup">
        <label style="font-size: 10px; text-transform: uppercase; margin-top: 4px;">Automated Answer</label>
        <input type="text" class="qa-answer-input" value="${escapeHtml(item.answer || '')}" placeholder="e.g. Yes / 1 / Intermediate">
      `;
      qaBankList.appendChild(qaRow);
    });

    qaBankList.querySelectorAll('.qa-remove-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.getAttribute('data-index'), 10);
        currentProfile.screening.splice(idx, 1);
        renderQaBank(currentProfile.screening);
      });
    });
  }

  btnAddQa.addEventListener('click', () => {
    if (!currentProfile.screening) currentProfile.screening = [];
    currentProfile.screening.push({ keywords: '', answer: '' });
    renderQaBank(currentProfile.screening);
  });

  btnSaveProfile.addEventListener('click', async () => {
    // Read QA bank inputs
    const updatedScreening = [];
    const qaRows = qaBankList.querySelectorAll('.qa-item');
    qaRows.forEach(row => {
      const kw = row.querySelector('.qa-keywords-input').value.trim();
      const ans = row.querySelector('.qa-answer-input').value.trim();
      if (kw && ans) {
        updatedScreening.push({ keywords: kw, answer: ans });
      }
    });

    if (!currentProfile.personal) currentProfile.personal = {};
    currentProfile.personal.fullName = profFullname.value.trim();
    currentProfile.personal.phone = profPhone.value.trim();
    currentProfile.personal.email = profEmail.value.trim();
    currentProfile.personal.city = profCity.value.trim();
    currentProfile.personal.linkedin = profLinkedin.value.trim();

    if (!currentProfile.work) currentProfile.work = { currentRole: {}, targetRole: {} };
    if (!currentProfile.work.currentRole) currentProfile.work.currentRole = {};
    if (!currentProfile.work.targetRole) currentProfile.work.targetRole = {};

    currentProfile.work.currentRole.jobTitle = profCurrTitle.value.trim();
    currentProfile.work.currentRole.company = profCurrCompany.value.trim();
    currentProfile.work.currentRole.yearsExperience = profYearsExp.value.trim();
    currentProfile.work.currentRole.currentSalary = profCurrSalary.value.trim();
    currentProfile.work.targetRole.expectedSalary = profExpSalary.value.trim();
    currentProfile.work.targetRole.noticePeriod = profNotice.value.trim();

    currentProfile.screening = updatedScreening;

    await chrome.storage.local.set({ userProfile: currentProfile });
    btnSaveProfile.textContent = '✅ Profile & QA Saved!';
    setTimeout(() => { btnSaveProfile.textContent = 'Save Profile & QA Bank'; }, 1500);
  });

  // 11. Background & Storage Listeners for Real-Time UI Updates
  chrome.runtime.onMessage.addListener((request) => {
    if (request.action === 'NEW_LOG' && request.log) {
      appendLogEntry(request.log);
    }
    if (request.action === 'STATS_UPDATED' && request.stats) {
      metricScanned.textContent = request.stats.scanned || 0;
      metricApplied.textContent = request.stats.applied || 0;
      metricSaved.textContent = request.stats.saved || 0;
      metricSkipped.textContent = request.stats.skipped || 0;
    }
    if (request.action === 'SESSION_STARTED' && request.session) {
      updateSessionUI(request.session);
    }
    if (request.action === 'SESSION_STOPPED') {
      updateSessionUI({ isRunning: false });
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      if (changes.appliedJobs) {
        appliedJobsList = changes.appliedJobs.newValue || [];
        appliedCountBadge.textContent = appliedJobsList.length;
        const activeTab = document.querySelector('.nav-tab-btn.active')?.getAttribute('data-tab');
        if (activeTab === 'tab-applied') renderAppliedJobs(appliedSearchInput.value);
      }
      if (changes.savedJobs) {
        savedJobsList = changes.savedJobs.newValue || [];
        savedCountBadge.textContent = savedJobsList.length;
        const activeTab = document.querySelector('.nav-tab-btn.active')?.getAttribute('data-tab');
        if (activeTab === 'tab-saved') renderSavedJobs(savedSearchInput.value);
      }
      if (changes.autoApplySession) {
        currentSession = changes.autoApplySession.newValue || {};
        updateSessionUI(currentSession);
      }
    }
  });

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Initial Boot
  loadInitialData();
});
