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
  const ruleEasyApplyOnly = document.getElementById('rule-easy-apply-only');
  const ruleExp = document.getElementById('rule-exp');
  const ruleSalary = document.getElementById('rule-salary');
  const ruleUnlistedExp = document.getElementById('rule-unlisted-exp');
  const ruleBlacklist = document.getElementById('rule-blacklist');
  const ruleBlockedCompanies = document.getElementById('rule-blocked-companies');
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

  // DOM Elements - Tab: Logs & Historical Analytics
  const logsPeriodBtns = document.querySelectorAll('.period-btn');
  const logsPeriodLabel = document.getElementById('logs-period-label');
  const logsSessionsCount = document.getElementById('logs-sessions-count');
  const logsProgressTitle = document.getElementById('logs-progress-title');
  const logsProgressText = document.getElementById('logs-progress-text');
  const logsProgressBarFill = document.getElementById('logs-progress-bar-fill');
  const logsMetricScanned = document.getElementById('logs-metric-scanned');
  const logsMetricApplied = document.getElementById('logs-metric-applied');
  const logsMetricSaved = document.getElementById('logs-metric-saved');
  const logsMetricSkipped = document.getElementById('logs-metric-skipped');
  const logsTableHeading = document.getElementById('logs-table-heading');
  const logsBreakdownContainer = document.getElementById('logs-breakdown-container');
  const btnExportLogs = document.getElementById('btn-export-logs');
  const btnClearHistory = document.getElementById('btn-clear-history');

  let currentLogsPeriod = 'daily';

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
  const btnSaveProfile = document.getElementById('btn-save-profile');

  // Screening Q&A Bank elements
  const btnOpenAddQa = document.getElementById('btn-open-add-qa');
  const qaFormContainer = document.getElementById('qa-form-container');
  const qaFormTitle = document.getElementById('qa-form-title');
  const qaEditIndex = document.getElementById('qa-edit-index');
  const qaInputKeywords = document.getElementById('qa-input-keywords');
  const qaInputAnswer = document.getElementById('qa-input-answer');
  const btnCancelQa = document.getElementById('btn-cancel-qa');
  const btnSaveQa = document.getElementById('btn-save-qa');
  const qaListContainer = document.getElementById('qa-list-container');

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
      if (targetTabId === 'tab-logs') renderAnalytics(currentLogsPeriod);
    });
  });

  logsPeriodBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      logsPeriodBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentLogsPeriod = btn.dataset.period || 'daily';
      renderAnalytics(currentLogsPeriod);
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
    if (ruleEasyApplyOnly) ruleEasyApplyOnly.checked = !!s.easyApplyOnly;
    if (ruleBlockedCompanies) ruleBlockedCompanies.value = s.blockedCompanies || '';
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
      easyApplyOnly: !!ruleEasyApplyOnly?.checked,
      userYearsExp: parseFloat(ruleExp.value) || 1,
      minMonthlySalary: parseInt(ruleSalary.value, 10) || 25000,
      unlistedExpAction: ruleUnlistedExp.value,
      blacklistKeywords: ruleBlacklist.value.trim(),
      blockedCompanies: (ruleBlockedCompanies?.value || '').trim(),
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
      easyApplyOnly: !!ruleEasyApplyOnly?.checked,
      userYearsExp: parseFloat(ruleExp.value) || 1,
      minMonthlySalary: parseInt(ruleSalary.value, 10) || 25000,
      unlistedExpAction: ruleUnlistedExp.value,
      blacklistKeywords: ruleBlacklist.value.trim(),
      blockedCompanies: (ruleBlockedCompanies?.value || '').trim(),
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
      const isWarning = job.reason && job.reason.includes('⚠️');
      const badgeClass = isWarning ? 'saved-job-badge saved-job-badge-warning' : 'saved-job-badge';

      card.innerHTML = `
        <div class="saved-job-header">
          <div>
            <div class="saved-job-title">${escapeHtml(job.title || 'Untitled')}</div>
            <div class="saved-job-company">${escapeHtml(job.company || 'Unknown')}</div>
          </div>
          <span class="${badgeClass}">${escapeHtml(job.reason || 'Criteria Matched')}</span>
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

  // 10. Screening Q&A Bank Manager
  function renderQaBank(screeningList = []) {
    if (!qaListContainer) return;
    qaListContainer.innerHTML = '';

    if (screeningList.length === 0) {
      qaListContainer.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 14px; font-size: 11.5px;">No screening Q&A rules configured yet.<br>Click "+ Add Question" to create one.</div>';
      return;
    }

    screeningList.forEach((item, index) => {
      const card = document.createElement('div');
      card.className = 'qa-card';

      const keywords = (item.keywords || '').split(',').map(k => k.trim()).filter(Boolean);
      const tagsHtml = keywords.map(kw => `<span class="qa-keyword-tag">${escapeHtml(kw)}</span>`).join('');

      card.innerHTML = `
        <div class="qa-card-header">
          <div class="qa-keywords-wrap">${tagsHtml}</div>
          <div class="qa-actions">
            <button class="qa-btn-action btn-edit-qa" title="Edit Rule">✏️</button>
            <button class="qa-btn-action btn-delete-qa" title="Delete Rule">🗑️</button>
          </div>
        </div>
        <div class="qa-card-body">
          <span style="font-size: 10.5px; color: var(--text-secondary);">Answer:</span>
          <span class="qa-answer-badge">${escapeHtml(item.answer || '')}</span>
        </div>
      `;

      card.querySelector('.btn-edit-qa').addEventListener('click', () => {
        qaFormTitle.textContent = 'Edit Screening Rule';
        qaEditIndex.value = index;
        qaInputKeywords.value = item.keywords || '';
        qaInputAnswer.value = item.answer || '';
        qaFormContainer.style.display = 'block';
        qaInputKeywords.focus();
      });

      card.querySelector('.btn-delete-qa').addEventListener('click', async () => {
        const data = await chrome.storage.local.get(['userProfile']);
        const prof = data.userProfile || {};
        const screening = prof.screening || [];
        screening.splice(index, 1);
        prof.screening = screening;
        currentProfile.screening = screening;
        await chrome.storage.local.set({ userProfile: prof });
        renderQaBank(screening);
      });

      qaListContainer.appendChild(card);
    });
  }

  btnOpenAddQa?.addEventListener('click', () => {
    qaFormTitle.textContent = 'Add Screening Rule';
    qaEditIndex.value = '-1';
    qaInputKeywords.value = '';
    qaInputAnswer.value = '';
    qaFormContainer.style.display = 'block';
    qaInputKeywords.focus();
  });

  btnCancelQa?.addEventListener('click', () => {
    qaFormContainer.style.display = 'none';
  });

  btnSaveQa?.addEventListener('click', async () => {
    const keywords = qaInputKeywords.value.trim();
    const answer = qaInputAnswer.value.trim();
    if (!keywords || !answer) {
      alert('Please provide both question keywords and an answer value.');
      return;
    }

    const data = await chrome.storage.local.get(['userProfile']);
    const prof = data.userProfile || {};
    const screening = prof.screening || [];
    const editIdx = parseInt(qaEditIndex.value, 10);

    if (editIdx >= 0 && editIdx < screening.length) {
      screening[editIdx] = { keywords, answer };
    } else {
      screening.push({ keywords, answer });
    }

    prof.screening = screening;
    currentProfile.screening = screening;
    await chrome.storage.local.set({ userProfile: prof });
    renderQaBank(screening);
    qaFormContainer.style.display = 'none';
  });

  btnSaveProfile.addEventListener('click', async () => {
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

    await chrome.storage.local.set({ userProfile: currentProfile });
    btnSaveProfile.textContent = '✅ Details Saved!';
    setTimeout(() => { btnSaveProfile.textContent = 'Save Profile Details'; }, 1500);
  });

  // 11. Logs & Historical Analytics Engine
  function getLocalDateKey(d = new Date()) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function renderDropoffAnalytics(reasons = {}, totalPeriodSkipped = 0) {
    const logsDropoffContainer = document.getElementById('logs-dropoff-container');
    const dropoffTotalSkipped = document.getElementById('dropoff-total-skipped');
    if (!logsDropoffContainer) return;

    const categories = [
      { key: 'experience', label: '🎓 Experience Exceeded', class: 'fill-exp' },
      { key: 'salary', label: '💰 Salary Floor Unmet', class: 'fill-salary' },
      { key: 'blacklist', label: '🚫 Blacklist Keyword', class: 'fill-blacklist' },
      { key: 'location', label: '📍 Outside Target Location', class: 'fill-loc' },
      { key: 'company', label: '🏢 Blocked Company', class: 'fill-company' },
      { key: 'easy_apply', label: '⚡ External Site (Easy Apply Only)', class: 'fill-easy' },
      { key: 'ai_spam', label: '🛡️ AI Gig / Annotation Spam', class: 'fill-spam' },
      { key: 'title_relevance', label: '🎯 Title Relevance Filter', class: 'fill-other' },
      { key: 'senior', label: '👔 Senior Level / Badge', class: 'fill-other' },
      { key: 'unrecognized', label: '❓ Unrecognized / Expired', class: 'fill-other' }
    ];

    let categorizedTotal = 0;
    categories.forEach(c => {
      c.count = reasons[c.key] || 0;
      categorizedTotal += c.count;
    });

    const displayTotal = Math.max(categorizedTotal, totalPeriodSkipped);

    if (totalPeriodSkipped > categorizedTotal) {
      const uncat = totalPeriodSkipped - categorizedTotal;
      categories.push({
        key: 'other_filters',
        label: '⏳ Prior / General Filters',
        count: uncat,
        class: 'fill-other'
      });
    }

    if (dropoffTotalSkipped) {
      dropoffTotalSkipped.textContent = `${displayTotal} Skipped`;
    }

    if (displayTotal === 0) {
      logsDropoffContainer.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 8px; font-size: 11px;">No skipped jobs recorded for this period.</div>';
      return;
    }

    logsDropoffContainer.innerHTML = categories
      .filter(c => c.count > 0)
      .map(c => {
        const pct = Math.round((c.count / displayTotal) * 100);
        return `
          <div class="dropoff-row">
            <div class="dropoff-header">
              <span class="dropoff-name">${c.label}</span>
              <span class="dropoff-count">${c.count} (${pct}%)</span>
            </div>
            <div class="dropoff-bar-bg">
              <div class="dropoff-bar-fill ${c.class}" style="width: ${pct}%;"></div>
            </div>
          </div>
        `;
      }).join('');
  }

  async function renderAnalytics(period = 'daily') {
    const data = await chrome.storage.local.get(['analyticsHistory', 'sessionHistory', 'autoApplySession']);
    let history = data.analyticsHistory || {};
    const sessions = data.sessionHistory || [];
    const autoApplySession = data.autoApplySession || {};
    const sessionStats = autoApplySession.stats || { scanned: 0, applied: 0, saved: 0, skipped: 0 };

    const todayKey = getLocalDateKey();

    // Auto-seed today's record if missing or empty but current session has stats
    if ((!history[todayKey] || (history[todayKey].scanned === 0 && sessionStats.scanned > 0)) &&
        (sessionStats.scanned > 0 || sessionStats.saved > 0 || sessionStats.applied > 0 || sessionStats.skipped > 0)) {
      history[todayKey] = {
        date: todayKey,
        scanned: sessionStats.scanned || 0,
        applied: sessionStats.applied || 0,
        saved: sessionStats.saved || 0,
        skipped: sessionStats.skipped || 0,
        sessions: 1,
        lastUpdated: Date.now()
      };
      await chrome.storage.local.set({ analyticsHistory: history });
    }

    const now = new Date();

    if (period === 'daily') {
      const rec = history[todayKey] || { scanned: 0, applied: 0, saved: 0, skipped: 0, sessions: 0 };
      const todaySessions = sessions.filter(s => s.date === todayKey);
      const sessCount = rec.sessions || todaySessions.length || (rec.scanned > 0 ? 1 : 0);

      const todayDayName = now.toLocaleDateString(undefined, { weekday: 'short' });
      logsPeriodLabel.textContent = `Today, ${todayDayName} (${now.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })})`;
      logsSessionsCount.textContent = `${sessCount} ${sessCount === 1 ? 'Session' : 'Sessions'} Run`;

      const scanned = rec.scanned || 0;
      const applied = rec.applied || 0;
      const saved = rec.saved || 0;
      const skipped = rec.skipped || 0;

      logsMetricScanned.textContent = scanned;
      logsMetricApplied.textContent = applied;
      logsMetricSaved.textContent = saved;
      logsMetricSkipped.textContent = skipped;

      const processed = applied + saved;
      const targetJobs = (parseInt(ruleMaxJobs?.value, 10) || 25) * Math.max(1, sessCount);
      logsProgressTitle.textContent = 'Session Progress';
      logsProgressText.textContent = `${processed} / ${targetJobs > 0 ? targetJobs : 25} Jobs`;
      const pct = targetJobs > 0 ? Math.min(100, Math.round((processed / targetJobs) * 100)) : (processed > 0 ? 100 : 0);
      logsProgressBarFill.style.width = `${pct}%`;

      logsTableHeading.textContent = "Today's Session Activity";
      if (todaySessions.length > 0) {
        logsBreakdownContainer.innerHTML = todaySessions.map((s, idx) => {
          const timeStr = s.startTime ? new Date(s.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recent';
          const durMins = (s.startTime && s.endTime) ? Math.max(1, Math.round((s.endTime - s.startTime) / 60000)) : null;
          return `
            <div class="logs-session-item">
              <div class="logs-session-title">
                <span>Session #${todaySessions.length - idx} &bull; ${escapeHtml(s.query || 'Auto-Apply')}</span>
                <span class="logs-session-time">${timeStr}${durMins ? ` (${durMins}m)` : ''}</span>
              </div>
              <div style="font-size: 10.5px; color: var(--text-secondary);">${escapeHtml(s.location || 'India')} &bull; Status: <strong>${escapeHtml(s.status || 'completed')}</strong></div>
              <div class="logs-session-tags">
                <span class="tag-badge tag-scanned">Scanned: ${s.stats?.scanned || 0}</span>
                <span class="tag-badge tag-applied">Applied: ${s.stats?.applied || 0}</span>
                <span class="tag-badge tag-saved">Saved: ${s.stats?.saved || 0}</span>
                <span class="tag-badge tag-skipped">Skipped: ${s.stats?.skipped || 0}</span>
              </div>
            </div>
          `;
        }).join('');
      } else if (scanned > 0 || applied > 0 || saved > 0) {
        logsBreakdownContainer.innerHTML = `
          <div class="logs-session-item">
            <div class="logs-session-title">
              <span>Active Today's Summary</span>
              <span class="logs-session-time">${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <div style="font-size: 10.5px; color: var(--text-secondary);">Jobs Processed & Categorized</div>
            <div class="logs-session-tags">
              <span class="tag-badge tag-scanned">Scanned: ${scanned}</span>
              <span class="tag-badge tag-applied">Applied: ${applied}</span>
              <span class="tag-badge tag-saved">Saved: ${saved}</span>
              <span class="tag-badge tag-skipped">Skipped: ${skipped}</span>
            </div>
          </div>
        `;
      } else {
        logsBreakdownContainer.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 25px 10px; font-size: 11.5px;">No auto-apply sessions recorded today.<br>Click "Start Auto-Apply" to begin!</div>';
      }

      const dailyReasons = Object.assign({}, autoApplySession.skipReasons || {}, rec.skipReasons || {});
      renderDropoffAnalytics(dailyReasons, skipped);
    } else if (period === 'weekly') {
      const days = [];
      let scannedSum = 0, appliedSum = 0, savedSum = 0, skippedSum = 0, sessSum = 0;

      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const k = getLocalDateKey(d);
        const r = history[k] || { scanned: 0, applied: 0, saved: 0, skipped: 0, sessions: 0 };
        const dayOfWeek = d.toLocaleDateString(undefined, { weekday: 'short' });
        let dayLabel = dayOfWeek;
        if (i === 0) {
          dayLabel = `Today, ${dayOfWeek}`;
        } else if (i === 1) {
          dayLabel = `Yesterday, ${dayOfWeek}`;
        }

        days.push({
          dateKey: k,
          label: dayLabel,
          dateStr: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
          scanned: r.scanned || 0,
          applied: r.applied || 0,
          saved: r.saved || 0,
          skipped: r.skipped || 0,
          sessions: r.sessions || (r.scanned > 0 ? 1 : 0)
        });
        scannedSum += (r.scanned || 0);
        appliedSum += (r.applied || 0);
        savedSum += (r.saved || 0);
        skippedSum += (r.skipped || 0);
        sessSum += (r.sessions || (r.scanned > 0 ? 1 : 0));
      }

      logsPeriodLabel.textContent = `Last 7 Days (${days[0].dateStr} - ${days[6].dateStr})`;
      logsSessionsCount.textContent = `${sessSum} ${sessSum === 1 ? 'Session' : 'Sessions'} Total`;

      logsMetricScanned.textContent = scannedSum;
      logsMetricApplied.textContent = appliedSum;
      logsMetricSaved.textContent = savedSum;
      logsMetricSkipped.textContent = skippedSum;

      const processed = appliedSum + savedSum;
      const targetJobs = Math.max(25, sessSum * 25);
      logsProgressTitle.textContent = 'Weekly Progress';
      logsProgressText.textContent = `${processed} / ${targetJobs} Jobs`;
      logsProgressBarFill.style.width = `${Math.min(100, Math.round((processed / targetJobs) * 100))}%`;

      logsTableHeading.textContent = 'Daily Breakdown (Last 7 Days)';
      logsBreakdownContainer.innerHTML = `
        <table class="logs-table">
          <thead>
            <tr>
              <th>Date</th>
              <th class="num-col">Scanned</th>
              <th class="num-col">Applied</th>
              <th class="num-col">Saved</th>
              <th class="num-col">Skipped</th>
            </tr>
          </thead>
          <tbody>
            ${days.slice().reverse().map(d => `
              <tr>
                <td><strong>${d.label}</strong> <span style="font-size: 10px; color: var(--text-secondary);">(${d.dateStr})</span></td>
                <td class="num-col">${d.scanned}</td>
                <td class="num-col" style="color: ${d.applied > 0 ? 'var(--accent-success)' : 'inherit'};">${d.applied}</td>
                <td class="num-col" style="color: ${d.saved > 0 ? 'var(--accent-warning)' : 'inherit'};">${d.saved}</td>
                <td class="num-col">${d.skipped}</td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr style="font-weight: 700; border-top: 1px solid var(--border-color);">
              <td>Total</td>
              <td class="num-col">${scannedSum}</td>
              <td class="num-col" style="color: var(--accent-success);">${appliedSum}</td>
              <td class="num-col" style="color: var(--accent-warning);">${savedSum}</td>
              <td class="num-col">${skippedSum}</td>
            </tr>
          </tfoot>
        </table>
      `;

      const weeklyReasons = {};
      days.forEach(d => {
        const r = history[d.dateKey];
        if (r && r.skipReasons) {
          Object.entries(r.skipReasons).forEach(([k, v]) => {
            weeklyReasons[k] = (weeklyReasons[k] || 0) + v;
          });
        }
      });
      renderDropoffAnalytics(weeklyReasons, skippedSum);
    } else if (period === 'monthly') {
      const year = now.getFullYear();
      const month = now.getMonth();
      const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;
      const monthName = now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

      let scannedSum = 0, appliedSum = 0, savedSum = 0, skippedSum = 0, sessSum = 0;
      const monthEntries = [];

      Object.keys(history).sort().forEach(k => {
        if (k.startsWith(monthPrefix)) {
          const r = history[k];
          scannedSum += (r.scanned || 0);
          appliedSum += (r.applied || 0);
          savedSum += (r.saved || 0);
          skippedSum += (r.skipped || 0);
          sessSum += (r.sessions || (r.scanned > 0 ? 1 : 0));
          monthEntries.push({
            dateKey: k,
            dateStr: new Date(k + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', weekday: 'short' }),
            ...r
          });
        }
      });

      logsPeriodLabel.textContent = monthName;
      logsSessionsCount.textContent = `${sessSum} ${sessSum === 1 ? 'Session' : 'Sessions'} in ${now.toLocaleDateString(undefined, { month: 'short' })}`;

      logsMetricScanned.textContent = scannedSum;
      logsMetricApplied.textContent = appliedSum;
      logsMetricSaved.textContent = savedSum;
      logsMetricSkipped.textContent = skippedSum;

      const processed = appliedSum + savedSum;
      const targetJobs = Math.max(50, sessSum * 25);
      logsProgressTitle.textContent = 'Monthly Progress';
      logsProgressText.textContent = `${processed} / ${targetJobs} Jobs`;
      logsProgressBarFill.style.width = `${Math.min(100, Math.round((processed / targetJobs) * 100))}%`;

      logsTableHeading.textContent = `Daily Breakdown (${now.toLocaleDateString(undefined, { month: 'short' })})`;

      if (monthEntries.length === 0) {
        logsBreakdownContainer.innerHTML = `<div style="text-align: center; color: var(--text-secondary); padding: 25px 10px; font-size: 11.5px;">No activity logged yet for ${monthName}.</div>`;
      } else {
        logsBreakdownContainer.innerHTML = `
          <table class="logs-table">
            <thead>
              <tr>
                <th>Date</th>
                <th class="num-col">Scanned</th>
                <th class="num-col">Applied</th>
                <th class="num-col">Saved</th>
                <th class="num-col">Skipped</th>
              </tr>
            </thead>
            <tbody>
              ${monthEntries.slice().reverse().map(d => `
                <tr>
                  <td>${d.dateStr}</td>
                  <td class="num-col">${d.scanned || 0}</td>
                  <td class="num-col" style="color: ${(d.applied || 0) > 0 ? 'var(--accent-success)' : 'inherit'};">${d.applied || 0}</td>
                  <td class="num-col" style="color: ${(d.saved || 0) > 0 ? 'var(--accent-warning)' : 'inherit'};">${d.saved || 0}</td>
                  <td class="num-col">${d.skipped || 0}</td>
                </tr>
              `).join('')}
            </tbody>
            <tfoot>
              <tr style="font-weight: 700; border-top: 1px solid var(--border-color);">
                <td>Total</td>
                <td class="num-col">${scannedSum}</td>
                <td class="num-col" style="color: var(--accent-success);">${appliedSum}</td>
                <td class="num-col" style="color: var(--accent-warning);">${savedSum}</td>
                <td class="num-col">${skippedSum}</td>
              </tr>
            </tfoot>
          </table>
        `;
      }

      const monthlyReasons = {};
      monthEntries.forEach(m => {
        if (m.skipReasons) {
          Object.entries(m.skipReasons).forEach(([k, v]) => {
            monthlyReasons[k] = (monthlyReasons[k] || 0) + v;
          });
        }
      });
      renderDropoffAnalytics(monthlyReasons, skippedSum);
    } else if (period === 'yearly') {
      const currentYear = now.getFullYear();
      const yearPrefix = `${currentYear}-`;

      let scannedSum = 0, appliedSum = 0, savedSum = 0, skippedSum = 0, sessSum = 0;
      const monthBuckets = Array.from({ length: 12 }, (_, i) => {
        const m = String(i + 1).padStart(2, '0');
        const monthDate = new Date(currentYear, i, 1);
        return {
          monthKey: `${currentYear}-${m}`,
          monthName: monthDate.toLocaleDateString(undefined, { month: 'short' }),
          scanned: 0,
          applied: 0,
          saved: 0,
          skipped: 0,
          sessions: 0
        };
      });

      Object.keys(history).forEach(k => {
        if (k.startsWith(yearPrefix)) {
          const r = history[k];
          const mIdx = parseInt(k.substring(5, 7), 10) - 1;
          if (mIdx >= 0 && mIdx < 12) {
            monthBuckets[mIdx].scanned += (r.scanned || 0);
            monthBuckets[mIdx].applied += (r.applied || 0);
            monthBuckets[mIdx].saved += (r.saved || 0);
            monthBuckets[mIdx].skipped += (r.skipped || 0);
            monthBuckets[mIdx].sessions += (r.sessions || (r.scanned > 0 ? 1 : 0));
          }
          scannedSum += (r.scanned || 0);
          appliedSum += (r.applied || 0);
          savedSum += (r.saved || 0);
          skippedSum += (r.skipped || 0);
          sessSum += (r.sessions || (r.scanned > 0 ? 1 : 0));
        }
      });

      logsPeriodLabel.textContent = `Year ${currentYear}`;
      logsSessionsCount.textContent = `${sessSum} ${sessSum === 1 ? 'Session' : 'Sessions'} in ${currentYear}`;

      logsMetricScanned.textContent = scannedSum;
      logsMetricApplied.textContent = appliedSum;
      logsMetricSaved.textContent = savedSum;
      logsMetricSkipped.textContent = skippedSum;

      const processed = appliedSum + savedSum;
      const targetJobs = Math.max(100, sessSum * 25);
      logsProgressTitle.textContent = 'Yearly Progress';
      logsProgressText.textContent = `${processed} / ${targetJobs} Jobs`;
      logsProgressBarFill.style.width = `${Math.min(100, Math.round((processed / targetJobs) * 100))}%`;

      logsTableHeading.textContent = `Monthly Summary (${currentYear})`;
      logsBreakdownContainer.innerHTML = `
        <table class="logs-table">
          <thead>
            <tr>
              <th>Month</th>
              <th class="num-col">Scanned</th>
              <th class="num-col">Applied</th>
              <th class="num-col">Saved</th>
              <th class="num-col">Skipped</th>
            </tr>
          </thead>
          <tbody>
            ${monthBuckets.filter(m => m.scanned > 0 || m.applied > 0 || m.saved > 0 || m.skipped > 0).length > 0
              ? monthBuckets.filter(m => m.scanned > 0 || m.applied > 0 || m.saved > 0 || m.skipped > 0).map(m => `
                <tr>
                  <td><strong>${m.monthName}</strong></td>
                  <td class="num-col">${m.scanned}</td>
                  <td class="num-col" style="color: ${m.applied > 0 ? 'var(--accent-success)' : 'inherit'};">${m.applied}</td>
                  <td class="num-col" style="color: ${m.saved > 0 ? 'var(--accent-warning)' : 'inherit'};">${m.saved}</td>
                  <td class="num-col">${m.skipped}</td>
                </tr>
              `).join('')
              : monthBuckets.slice(0, now.getMonth() + 1).map(m => `
                <tr>
                  <td><strong>${m.monthName}</strong></td>
                  <td class="num-col">${m.scanned}</td>
                  <td class="num-col">${m.applied}</td>
                  <td class="num-col">${m.saved}</td>
                  <td class="num-col">${m.skipped}</td>
                </tr>
              `).join('')}
          </tbody>
          <tfoot>
            <tr style="font-weight: 700; border-top: 1px solid var(--border-color);">
              <td>Total</td>
              <td class="num-col">${scannedSum}</td>
              <td class="num-col" style="color: var(--accent-success);">${appliedSum}</td>
              <td class="num-col" style="color: var(--accent-warning);">${savedSum}</td>
              <td class="num-col">${skippedSum}</td>
            </tr>
          </tfoot>
        </table>
      `;

      const yearlyReasons = {};
      Object.keys(history).forEach(k => {
        if (k.startsWith(yearPrefix) && history[k].skipReasons) {
          Object.entries(history[k].skipReasons).forEach(([subK, v]) => {
            yearlyReasons[subK] = (yearlyReasons[subK] || 0) + v;
          });
        }
      });
      renderDropoffAnalytics(yearlyReasons, skippedSum);
    }
  }

  btnExportLogs?.addEventListener('click', async () => {
    const data = await chrome.storage.local.get(['analyticsHistory', 'sessionHistory']);
    const history = data.analyticsHistory || {};
    const sessions = data.sessionHistory || [];

    if (Object.keys(history).length === 0 && sessions.length === 0) {
      alert('No analytics history to export yet!');
      return;
    }

    let csv = '=== DAILY ANALYTICS SUMMARY ===\n';
    csv += 'Date,Scanned,Applied,Saved,Skipped,Sessions,LastUpdated\n';
    const dates = Object.keys(history).sort();
    dates.forEach(d => {
      const r = history[d];
      csv += `"${d}",${r.scanned || 0},${r.applied || 0},${r.saved || 0},${r.skipped || 0},${r.sessions || 0},"${r.lastUpdated ? new Date(r.lastUpdated).toISOString() : ''}"\n`;
    });

    if (sessions.length > 0) {
      csv += '\n=== SESSION RUN DETAILS ===\n';
      csv += 'SessionID,Date,StartTime,EndTime,Query,Location,Scanned,Applied,Saved,Skipped,Status\n';
      sessions.forEach(s => {
        const escape = (val) => `"${String(val || '').replace(/"/g, '""')}"`;
        const start = s.startTime ? new Date(s.startTime).toISOString() : '';
        const end = s.endTime ? new Date(s.endTime).toISOString() : '';
        csv += `${escape(s.id)},${escape(s.date)},${escape(start)},${escape(end)},${escape(s.query)},${escape(s.location)},${s.stats?.scanned || 0},${s.stats?.applied || 0},${s.stats?.saved || 0},${s.stats?.skipped || 0},${escape(s.status)}\n`;
      });
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `linkedin_auto_applier_analytics_${getLocalDateKey()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });

  btnClearHistory?.addEventListener('click', () => {
    if (confirm('Are you sure you want to reset all historical logs and analytics? This cannot be undone.')) {
      chrome.runtime.sendMessage({ action: 'CLEAR_ANALYTICS_HISTORY' }, () => {
        renderAnalytics(currentLogsPeriod);
      });
    }
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
