/**
 * LinkedIn Auto-Applier - Background Service Worker (Manifest V3)
 * Manages crawl sessions, tab navigation, desktop alerts, and data persistence.
 */

const notificationTabMap = new Map();

async function appendSessionLog(message, type = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  const logItem = { timestamp, message, type };

  try {
    const data = await chrome.storage.local.get(['sessionLogs']);
    const logs = data.sessionLogs || [];
    logs.push(logItem);
    if (logs.length > 200) logs.shift();

    await chrome.storage.local.set({ sessionLogs: logs });
    chrome.runtime.sendMessage({ action: 'NEW_LOG', log: logItem }).catch(() => {});
  } catch (err) {
    console.error('[Background] Failed to append log:', err);
  }
}

// Helper to get local date key formatted as YYYY-MM-DD
function getLocalDateKey(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Async mutex queue for sequential atomic stats updates
let statsUpdateQueue = Promise.resolve();

// Update session statistics and persistent daily analytics
function updateSessionStats(delta) {
  statsUpdateQueue = statsUpdateQueue.then(async () => {
    try {
      const data = await chrome.storage.local.get(['autoApplySession', 'analyticsHistory']);
      const session = data.autoApplySession || { isRunning: false, stats: { scanned: 0, applied: 0, saved: 0, skipped: 0 } };
      session.skipReasons = session.skipReasons || {
        blacklist: 0,
        ai_spam: 0,
        title_relevance: 0,
        location: 0,
        company: 0,
        salary: 0,
        experience: 0,
        senior: 0,
        easy_apply: 0,
        already_applied: 0,
        unrecognized: 0
      };

      if (delta.applied) session.stats.applied = (session.stats.applied || 0) + delta.applied;
      if (delta.saved) session.stats.saved = (session.stats.saved || 0) + delta.saved;
      if (delta.skipped) {
        session.stats.skipped = (session.stats.skipped || 0) + delta.skipped;
        if (delta.reason) {
          session.skipReasons[delta.reason] = (session.skipReasons[delta.reason] || 0) + delta.skipped;
        }
      }
      // Mathematical Invariant: Scanned is ALWAYS strictly the sum of applied + saved + skipped
      session.stats.scanned = (session.stats.applied || 0) + (session.stats.saved || 0) + (session.stats.skipped || 0);

      const today = getLocalDateKey();
      const history = data.analyticsHistory || {};
      if (!history[today]) {
        history[today] = {
          date: today,
          scanned: 0,
          applied: 0,
          saved: 0,
          skipped: 0,
          sessions: session.isRunning ? 1 : 0,
          skipReasons: {
            blacklist: 0,
            ai_spam: 0,
            title_relevance: 0,
            location: 0,
            company: 0,
            salary: 0,
            experience: 0,
            senior: 0,
            easy_apply: 0,
            already_applied: 0,
            unrecognized: 0
          },
          lastUpdated: Date.now()
        };
      }
      history[today].skipReasons = history[today].skipReasons || {
        blacklist: 0,
        ai_spam: 0,
        title_relevance: 0,
        location: 0,
        company: 0,
        salary: 0,
        experience: 0,
        senior: 0,
        easy_apply: 0,
        already_applied: 0,
        unrecognized: 0
      };

      if (delta.applied) history[today].applied = (history[today].applied || 0) + delta.applied;
      if (delta.saved) history[today].saved = (history[today].saved || 0) + delta.saved;
      if (delta.skipped) {
        history[today].skipped = (history[today].skipped || 0) + delta.skipped;
        if (delta.reason) {
          history[today].skipReasons[delta.reason] = (history[today].skipReasons[delta.reason] || 0) + delta.skipped;
        }
      }
      // Mathematical Invariant: Scanned is ALWAYS strictly the sum of applied + saved + skipped
      history[today].scanned = (history[today].applied || 0) + (history[today].saved || 0) + (history[today].skipped || 0);
      history[today].lastUpdated = Date.now();

      await chrome.storage.local.set({
        autoApplySession: session,
        analyticsHistory: history
      });

      chrome.runtime.sendMessage({ action: 'STATS_UPDATED', stats: session.stats, skipReasons: session.skipReasons }).catch(() => {});
      chrome.runtime.sendMessage({ action: 'ANALYTICS_UPDATED', history }).catch(() => {});
    } catch (err) {
      console.error('[Background] Failed to update stats:', err);
    }
  }).catch(err => console.error('[Background] Stats queue error:', err));

  return statsUpdateQueue;
}

// Reconcile and heal any existing historical records so Scanned = Applied + Saved + Skipped
async function reconcileAnalyticsHistory() {
  try {
    const data = await chrome.storage.local.get(['autoApplySession', 'analyticsHistory', 'sessionHistory']);
    let modified = false;

    if (data.autoApplySession?.stats) {
      const s = data.autoApplySession.stats;
      const expected = (s.applied || 0) + (s.saved || 0) + (s.skipped || 0);
      if (s.scanned !== expected) {
        s.scanned = expected;
        modified = true;
      }
    }

    if (data.analyticsHistory) {
      for (const k of Object.keys(data.analyticsHistory)) {
        const rec = data.analyticsHistory[k];
        const expected = (rec.applied || 0) + (rec.saved || 0) + (rec.skipped || 0);
        if (rec.scanned !== expected) {
          rec.scanned = expected;
          modified = true;
        }
      }
    }

    if (Array.isArray(data.sessionHistory)) {
      data.sessionHistory.forEach(sess => {
        if (sess.stats) {
          const expected = (sess.stats.applied || 0) + (sess.stats.saved || 0) + (sess.stats.skipped || 0);
          if (sess.stats.scanned !== expected) {
            sess.stats.scanned = expected;
            modified = true;
          }
        }
      });
    }

    if (modified) {
      await chrome.storage.local.set({
        autoApplySession: data.autoApplySession,
        analyticsHistory: data.analyticsHistory,
        sessionHistory: data.sessionHistory
      });
      console.log('[Background] Reconciled historical stats to satisfy Scanned = Applied + Saved + Skipped.');
    }
  } catch (err) {
    console.warn('[Background] Failed to reconcile historical stats:', err);
  }
}

function buildLinkedInSearchUrl(queryStr, settings = {}) {
  const query = queryStr || 'Data Analyst';
  const location = settings.targetLocation || 'Bengaluru, Karnataka, India';
  const dateFilter = settings.dateFilter || 'r86400'; // r86400 = Past 24 hours, r604800 = Past week
  const sortBy = settings.sortBy || 'DD'; // DD = Most recent

  let url = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(query)}&location=${encodeURIComponent(location)}`;

  if (dateFilter && dateFilter !== 'any') {
    url += `&f_TPR=${encodeURIComponent(dateFilter)}`;
  }

  if (sortBy) {
    url += `&sortBy=${encodeURIComponent(sortBy)}`;
  }

  // If user enabled Easy Apply ONLY (or disabled Dual Strategy)
  if (settings.easyApplyOnly || settings.dualStrategy === false) {
    url += `&f_AL=true`;
  }

  return url;
}

async function handleStartAutoApply(customSettings) {
  const data = await chrome.storage.local.get(['userProfile', 'autoApplierSettings', 'analyticsHistory', 'autoApplySession']);
  const profile = data.userProfile || {};
  const settings = Object.assign({}, profile.autoApplierSettings || {}, data.autoApplierSettings || {}, customSettings || {});

  const rawQuery = settings.targetJobQuery || profile.work?.targetRole?.jobTitle || 'Data Analyst';
  const queryQueue = rawQuery.split(/[,;]/).map(q => q.trim()).filter(q => q.length > 0);
  if (queryQueue.length === 0) queryQueue.push('Data Analyst');

  const currentQueryIndex = 0;
  const currentQuery = queryQueue[currentQueryIndex];
  const searchUrl = buildLinkedInSearchUrl(currentQuery, settings);

  const prevProcessed = data.autoApplySession?.processedJobIds || [];

  const queueLabel = queryQueue.length > 1
    ? `role [1/${queryQueue.length}: "${currentQuery}"] (Queue: ${queryQueue.join(', ')})`
    : `"${currentQuery}"`;

  await appendSessionLog(`🚀 Auto-Apply launched for ${queueLabel} in "${settings.targetLocation || 'Bengaluru'}" (Filter: Last 24 Hours)`, 'info');

  const tabs = await chrome.tabs.query({ url: '*://*.linkedin.com/*' });
  let targetTab = null;

  if (tabs.length > 0) {
    targetTab = tabs[0];
    await chrome.tabs.update(targetTab.id, { url: searchUrl, active: true });
    await appendSessionLog(`Navigating existing LinkedIn tab #${targetTab.id}...`, 'info');
  } else {
    targetTab = await chrome.tabs.create({ url: searchUrl, active: true });
    await appendSessionLog(`Opened new LinkedIn tab #${targetTab.id}...`, 'info');
  }

  const sessionId = 'sess_' + Date.now();
  const newSession = {
    sessionId,
    isRunning: true,
    tabId: targetTab.id,
    startTime: Date.now(),
    settings,
    queryQueue,
    currentQueryIndex,
    stats: { scanned: 0, applied: 0, saved: 0, skipped: 0 },
    skipReasons: {
      blacklist: 0,
      ai_spam: 0,
      title_relevance: 0,
      location: 0,
      company: 0,
      salary: 0,
      experience: 0,
      senior: 0,
      easy_apply: 0,
      already_applied: 0,
      unrecognized: 0
    },
    processedJobIds: prevProcessed
  };

  const today = getLocalDateKey();
  const history = data.analyticsHistory || {};
  if (!history[today]) {
    history[today] = {
      date: today,
      scanned: 0,
      applied: 0,
      saved: 0,
      skipped: 0,
      sessions: 0,
      skipReasons: {
        blacklist: 0,
        ai_spam: 0,
        title_relevance: 0,
        location: 0,
        company: 0,
        salary: 0,
        experience: 0,
        senior: 0,
        easy_apply: 0,
        already_applied: 0,
        unrecognized: 0
      },
      lastUpdated: Date.now()
    };
  }
  history[today].sessions = (history[today].sessions || 0) + 1;
  history[today].lastUpdated = Date.now();

  await chrome.storage.local.set({
    autoApplySession: newSession,
    sessionLogs: [],
    analyticsHistory: history
  });

  chrome.runtime.sendMessage({ action: 'SESSION_STARTED', session: newSession }).catch(() => {});
  return { success: true, tabId: targetTab.id };
}

async function handleStopAutoApply() {
  const data = await chrome.storage.local.get(['autoApplySession', 'sessionHistory']);
  const session = data.autoApplySession || {};
  session.isRunning = false;

  if (session.startTime) {
    const sessionHistory = data.sessionHistory || [];
    const sessApplied = session.stats?.applied || 0;
    const sessSaved = session.stats?.saved || 0;
    const sessSkipped = session.stats?.skipped || 0;
    sessionHistory.unshift({
      id: session.sessionId || ('sess_' + session.startTime),
      date: getLocalDateKey(new Date(session.startTime)),
      startTime: session.startTime,
      endTime: Date.now(),
      query: (session.queryQueue && session.queryQueue.length > 1) ? session.queryQueue.join(', ') : (session.settings?.targetJobQuery || 'Job Search'),
      location: session.settings?.targetLocation || '',
      stats: {
        applied: sessApplied,
        saved: sessSaved,
        skipped: sessSkipped,
        scanned: sessApplied + sessSaved + sessSkipped
      },
      skipReasons: { ...(session.skipReasons || {}) },
      status: 'stopped'
    });
    if (sessionHistory.length > 100) sessionHistory.pop();
    await chrome.storage.local.set({ autoApplySession: session, sessionHistory });
  } else {
    await chrome.storage.local.set({ autoApplySession: session });
  }

  await appendSessionLog('Auto-Apply session stopped by user.', 'warning');

  if (session.tabId) {
    chrome.tabs.sendMessage(session.tabId, { action: 'HALT_SESSION' }).catch(() => {});
  }

  chrome.runtime.sendMessage({ action: 'SESSION_STOPPED' }).catch(() => {});
  return { success: true };
}

async function handleSaveJob(job) {
  try {
    const data = await chrome.storage.local.get(['savedJobs']);
    const list = data.savedJobs || [];
    const jobItem = {
      id: job.id || job.jobId || `saved_${Date.now()}`,
      title: job.title || 'Untitled',
      company: job.company || 'Unknown',
      location: job.location || '',
      salary: job.salary || '',
      url: job.url || '',
      reason: job.reason || 'Criteria Matched',
      savedAt: new Date().toLocaleString()
    };

    const existingIndex = list.findIndex(item => (jobItem.url && item.url === jobItem.url) || (jobItem.id && item.id === jobItem.id));
    if (existingIndex === -1) {
      list.unshift(jobItem);
      await chrome.storage.local.set({ savedJobs: list });
      await updateSessionStats({ saved: 1 });
      await appendSessionLog(`💾 Saved listing: "${jobItem.title}" at "${jobItem.company}" (${jobItem.reason})`, 'info');
    } else {
      list[existingIndex].savedAt = new Date().toLocaleString();
      if (jobItem.reason) list[existingIndex].reason = jobItem.reason;
      await chrome.storage.local.set({ savedJobs: list });
      // Do not increment saved stats for an already-saved listing
      await appendSessionLog(`💾 Updated saved listing: "${jobItem.title}" (${jobItem.reason})`, 'info');
    }
    return { success: true, savedCount: list.length };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function handleJobApplied(job) {
  try {
    const data = await chrome.storage.local.get(['appliedJobs']);
    const list = data.appliedJobs || [];
    const jobItem = {
      id: job.id || job.jobId || `applied_${Date.now()}`,
      title: job.title || 'Untitled',
      company: job.company || 'Unknown',
      location: job.location || '',
      salary: job.salary || '',
      url: job.url || '',
      appliedAt: new Date().toLocaleString()
    };

    list.unshift(jobItem);
    await chrome.storage.local.set({ appliedJobs: list });
    await updateSessionStats({ applied: 1 });
    await appendSessionLog(`🎉 Successfully applied to: "${jobItem.title}" at "${jobItem.company}"`, 'success');
    return { success: true, appliedCount: list.length };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// Multi-role search queue progression
async function handleQueryResultsFinished(summary = {}) {
  const data = await chrome.storage.local.get(['autoApplySession']);
  const session = data.autoApplySession;
  if (!session || !session.isRunning) return { completed: true };

  const queue = session.queryQueue || [];
  const nextIndex = (session.currentQueryIndex || 0) + 1;

  if (nextIndex < queue.length) {
    session.currentQueryIndex = nextIndex;
    const nextQuery = queue[nextIndex];
    const searchUrl = buildLinkedInSearchUrl(nextQuery, session.settings);

    await appendSessionLog(`🔄 Multi-Role Queue: Advancing to next role [${nextIndex + 1}/${queue.length}]: "${nextQuery}"...`, 'info');
    await chrome.storage.local.set({ autoApplySession: session });

    if (session.tabId) {
      try {
        await chrome.tabs.update(session.tabId, { url: searchUrl, active: true });
        return { advanced: true, query: nextQuery };
      } catch (err) {
        console.warn('[Background] Failed to navigate session tab to next query:', err);
      }
    }
  }

  // All roles in queue finished!
  await handleSessionCompleted(summary || session.stats);
  return { completed: true };
}

async function handleSessionCompleted(summary = {}) {
  const data = await chrome.storage.local.get(['autoApplySession', 'sessionHistory']);
  const session = data.autoApplySession || {};
  session.isRunning = false;

  if (session.startTime) {
    const sessionHistory = data.sessionHistory || [];
    const applied = summary.applied !== undefined ? summary.applied : (session.stats?.applied || 0);
    const saved = summary.saved !== undefined ? summary.saved : (session.stats?.saved || 0);
    const skipped = summary.skipped !== undefined ? summary.skipped : (session.stats?.skipped || 0);
    sessionHistory.unshift({
      id: session.sessionId || ('sess_' + session.startTime),
      date: getLocalDateKey(new Date(session.startTime)),
      startTime: session.startTime,
      endTime: Date.now(),
      query: (session.queryQueue && session.queryQueue.length > 1) ? session.queryQueue.join(', ') : (session.settings?.targetJobQuery || 'Job Search'),
      location: session.settings?.targetLocation || '',
      stats: {
        applied,
        saved,
        skipped,
        scanned: applied + saved + skipped
      },
      skipReasons: { ...(session.skipReasons || {}) },
      status: 'completed'
    });
    if (sessionHistory.length > 100) sessionHistory.pop();
    await chrome.storage.local.set({ autoApplySession: session, sessionHistory });
  } else {
    await chrome.storage.local.set({ autoApplySession: session });
  }

  const applied = summary.applied !== undefined ? summary.applied : (session.stats?.applied || 0);
  const saved = summary.saved !== undefined ? summary.saved : (session.stats?.saved || 0);
  const msg = `🎉 LinkedIn session completed! Applied: ${applied}, Saved: ${saved}.`;
  await appendSessionLog(msg, 'success');

  if (chrome.notifications) {
    try {
      chrome.notifications.create(`complete_${Date.now()}`, {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon48.png'),
        title: '🎯 LinkedIn Auto-Applier Finished!',
        message: msg,
        priority: 1
      }, () => {
        if (chrome.runtime.lastError) console.warn('[Background] Notification error:', chrome.runtime.lastError.message);
      });
    } catch (_) {}
  }

  chrome.runtime.sendMessage({ action: 'SESSION_STOPPED' }).catch(() => {});
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'START_AUTO_APPLY') {
    handleStartAutoApply(request.settings)
      .then(res => sendResponse(res))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === 'STOP_AUTO_APPLY') {
    handleStopAutoApply()
      .then(res => sendResponse(res))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === 'APPEND_LOG') {
    appendSessionLog(request.message, request.logType || 'info');
    sendResponse({ success: true });
    return true;
  }

  if (request.action === 'UPDATE_STATS') {
    updateSessionStats(request.delta || {});
    sendResponse({ success: true });
    return true;
  }

  if (request.action === 'SAVE_JOB' && request.job) {
    handleSaveJob(request.job)
      .then(res => sendResponse(res))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === 'JOB_APPLIED' && request.job) {
    handleJobApplied(request.job)
      .then(res => sendResponse(res))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === 'CHECK_CRAWLER_TAB') {
    chrome.storage.local.get(['autoApplySession'], (data) => {
      const session = data?.autoApplySession;
      const isAllowed = !!(session?.isRunning && sender.tab && session.tabId === sender.tab.id);
      sendResponse({ isAllowed, tabId: sender.tab?.id, sessionTabId: session?.tabId });
    });
    return true;
  }

  if (request.action === 'STALL_ALERT') {
    if (chrome.notifications) {
      try {
        const notifId = `stall_${Date.now()}`;
        if (sender.tab) {
          notificationTabMap.set(notifId, { tabId: sender.tab.id, windowId: sender.tab.windowId });
        }
        chrome.notifications.create(notifId, {
          type: 'basic',
          iconUrl: chrome.runtime.getURL('icons/icon48.png'),
          title: '⚠️ Action Required: Screening Question',
          message: `${request.question || 'An Easy Apply question requires manual input'}. Click to switch to tab.`,
          priority: 2,
          requireInteraction: true
        }, () => {
          if (chrome.runtime.lastError) console.warn('[Background] Notification error:', chrome.runtime.lastError.message);
        });
      } catch (_) {}
    }
    sendResponse({ status: 'notified' });
    return true;
  }

  if (request.action === 'CAPTCHA_ALERT') {
    if (chrome.notifications) {
      try {
        const notifId = `captcha_${Date.now()}`;
        if (sender.tab) {
          notificationTabMap.set(notifId, { tabId: sender.tab.id, windowId: sender.tab.windowId });
        }
        chrome.notifications.create(notifId, {
          type: 'basic',
          iconUrl: chrome.runtime.getURL('icons/icon48.png'),
          title: '🚨 LinkedIn CAPTCHA Detected!',
          message: 'A security challenge appeared. Click here to solve it.',
          priority: 2,
          requireInteraction: true
        }, () => {
          if (chrome.runtime.lastError) console.warn('[Background] Notification error:', chrome.runtime.lastError.message);
        });
      } catch (_) {}
    }
    sendResponse({ status: 'notified' });
    return true;
  }

  if (request.action === 'QUERY_RESULTS_FINISHED') {
    if (sender && sender.frameId && sender.frameId !== 0) {
      sendResponse({ status: 'ignored' });
      return true;
    }
    handleQueryResultsFinished(request.summary)
      .then(res => sendResponse(res))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === 'SESSION_COMPLETED') {
    if (sender && sender.frameId && sender.frameId !== 0) {
      sendResponse({ status: 'ignored' });
      return true;
    }
    handleSessionCompleted(request.summary);
    sendResponse({ status: 'ok' });
    return true;
  }

  if (request.action === 'CLEAR_ANALYTICS_HISTORY') {
    chrome.storage.local.set({
      analyticsHistory: {},
      sessionHistory: []
    }, () => {
      sendResponse({ success: true });
    });
    return true;
  }
});

// Click notification to focus application tab
if (chrome.notifications) {
  chrome.notifications.onClicked.addListener((notifId) => {
    const target = notificationTabMap.get(notifId);
    if (target) {
      chrome.tabs.update(target.tabId, { active: true });
      chrome.windows.update(target.windowId, { focused: true });
      chrome.notifications.clear(notifId);
      notificationTabMap.delete(notifId);
    }
  });
}

// Initialize profile defaults on install and reconcile stats
chrome.runtime.onInstalled.addListener(async () => {
  await reconcileAnalyticsHistory();
  const data = await chrome.storage.local.get(['userProfile']);
  if (!data.userProfile) {
    try {
      const res = await fetch(chrome.runtime.getURL('data/default_profile.json'));
      const defaultProfile = await res.json();
      await chrome.storage.local.set({ userProfile: defaultProfile });
      console.log('[LinkedIn Auto-Applier] Default profile initialized.');
    } catch (err) {
      console.error('[Background] Failed to load default profile:', err);
    }
  }
});

// Run reconciliation on service worker startup
reconcileAnalyticsHistory();
