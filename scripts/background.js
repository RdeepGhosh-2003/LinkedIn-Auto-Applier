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

async function updateSessionStats(delta) {
  try {
    const data = await chrome.storage.local.get(['autoApplySession']);
    const session = data.autoApplySession || { isRunning: false, stats: { scanned: 0, applied: 0, saved: 0, skipped: 0 } };

    if (!session.stats) session.stats = { scanned: 0, applied: 0, saved: 0, skipped: 0 };
    if (delta.scanned) session.stats.scanned = (session.stats.scanned || 0) + delta.scanned;
    if (delta.applied) session.stats.applied = (session.stats.applied || 0) + delta.applied;
    if (delta.saved) session.stats.saved = (session.stats.saved || 0) + delta.saved;
    if (delta.skipped) session.stats.skipped = (session.stats.skipped || 0) + delta.skipped;

    await chrome.storage.local.set({ autoApplySession: session });
    chrome.runtime.sendMessage({ action: 'STATS_UPDATED', stats: session.stats }).catch(() => {});
  } catch (err) {
    console.error('[Background] Failed to update stats:', err);
  }
}

function buildLinkedInSearchUrl(settings = {}) {
  const query = settings.targetJobQuery || 'Data Analyst';
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

  // If user disabled Dual Strategy and wants Easy Apply ONLY
  if (settings.dualStrategy === false) {
    url += `&f_AL=true`;
  }

  return url;
}

async function handleStartAutoApply(settings) {
  const searchUrl = buildLinkedInSearchUrl(settings);
  await appendSessionLog(`Launching LinkedIn with search: "${settings.targetJobQuery || 'Jobs'}" in "${settings.targetLocation || 'Location'}"`, 'info');

  const tabs = await chrome.tabs.query({ url: '*://*.linkedin.com/*' });
  let targetTab = null;

  if (tabs.length > 0) {
    targetTab = tabs[0];
    await chrome.tabs.update(targetTab.id, { url: searchUrl, active: true });
  } else {
    targetTab = await chrome.tabs.create({ url: searchUrl, active: true });
  }

  const existingData = await chrome.storage.local.get(['autoApplySession']);
  const prevProcessed = existingData.autoApplySession?.processedJobIds || [];

  const newSession = {
    isRunning: true,
    tabId: targetTab.id,
    startTime: Date.now(),
    settings,
    stats: { scanned: 0, applied: 0, saved: 0, skipped: 0 },
    processedJobIds: prevProcessed
  };

  await chrome.storage.local.set({ autoApplySession: newSession });
  chrome.runtime.sendMessage({ action: 'SESSION_STARTED', session: newSession }).catch(() => {});

  return { success: true, tabId: targetTab.id };
}

async function handleStopAutoApply() {
  const data = await chrome.storage.local.get(['autoApplySession']);
  const session = data.autoApplySession || {};
  session.isRunning = false;

  await chrome.storage.local.set({ autoApplySession: session });
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
      id: job.jobId || `saved_${Date.now()}`,
      title: job.title || 'Untitled',
      company: job.company || 'Unknown',
      location: job.location || '',
      salary: job.salary || '',
      url: job.url || '',
      reason: job.reason || 'Criteria Matched',
      savedAt: new Date().toLocaleString()
    };

    if (!list.some(item => item.url === jobItem.url || (job.jobId && item.id === job.jobId))) {
      list.unshift(jobItem);
      await chrome.storage.local.set({ savedJobs: list });
      await updateSessionStats({ saved: 1 });
      await appendSessionLog(`💾 Saved external listing: "${jobItem.title}" at "${jobItem.company}"`, 'info');
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function handleJobApplied(job) {
  try {
    const data = await chrome.storage.local.get(['appliedJobs']);
    const list = data.appliedJobs || [];
    const jobItem = {
      id: job.jobId || `applied_${Date.now()}`,
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
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
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
        });
      } catch (_) {}
    }
    sendResponse({ status: 'notified' });
    return true;
  }

  if (request.action === 'SESSION_COMPLETED') {
    chrome.storage.local.get(['autoApplySession'], (data) => {
      const stats = data.autoApplySession?.stats || {};
      const applied = stats.applied || 0;
      const saved = stats.saved || 0;

      if (chrome.notifications) {
        try {
          chrome.notifications.create(`complete_${Date.now()}`, {
            type: 'basic',
            iconUrl: chrome.runtime.getURL('icons/icon48.png'),
            title: '🎉 LinkedIn Auto-Apply Complete!',
            message: `Finished session: ${applied} jobs applied, ${saved} jobs saved for review.`,
            priority: 1
          });
        } catch (_) {}
      }
      appendSessionLog(`Session completed. Applied: ${applied}, Saved: ${saved}.`, 'success');
      handleStopAutoApply();
    });
    sendResponse({ status: 'done' });
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

// Initialize profile defaults on install
chrome.runtime.onInstalled.addListener(async () => {
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
