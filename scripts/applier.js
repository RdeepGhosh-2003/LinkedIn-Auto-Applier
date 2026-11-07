/**
 * LinkedIn Auto-Applier - Core Crawl & Apply Engine
 * Scans LinkedIn job cards, evaluates experience badges and descriptions,
 * auto-applies to Easy Apply listings, saves company site jobs, and navigates pages.
 */

(function () {
  if (window !== window.top) {
    console.log('[LinkedIn Auto-Applier] Child frame detected; skipping top-level crawler.');
    return;
  }

  let isRunning = false;
  let isHalted = false;
  let isStalledForUser = false;
  let processedJobIds = new Set();
  const appliedJobIdSet = new Set();

  async function loadAppliedJobIds() {
    try {
      const data = await chrome.storage.local.get(['appliedJobs']);
      const list = data?.appliedJobs || [];
      appliedJobIdSet.clear();
      list.forEach(j => {
        if (j.id) appliedJobIdSet.add(String(j.id));
        if (j.jobId) appliedJobIdSet.add(String(j.jobId));
      });
    } catch (_) {}
  }

  async function loadProcessedJobIds() {
    try {
      const data = await chrome.storage.local.get(['autoApplySession']);
      const list = data?.autoApplySession?.processedJobIds || [];
      processedJobIds.clear();
      list.forEach(id => processedJobIds.add(String(id)));
    } catch (_) {}
    await loadAppliedJobIds();
  }

  async function persistProcessedJobId(jobId) {
    if (!jobId) return;
    const cleanId = String(jobId);
    processedJobIds.add(cleanId);
    try {
      const data = await chrome.storage.local.get(['autoApplySession']);
      if (data?.autoApplySession) {
        if (!data.autoApplySession.processedJobIds) data.autoApplySession.processedJobIds = [];
        if (!data.autoApplySession.processedJobIds.includes(cleanId)) {
          data.autoApplySession.processedJobIds.push(cleanId);
          await chrome.storage.local.set({ autoApplySession: data.autoApplySession });
        }
      }
    } catch (_) {}
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function humanDelay(baseMs = 1000) {
    const jitter = Math.floor(Math.random() * 400) - 150;
    return sleep(Math.max(600, baseMs + jitter));
  }

  function isElementVisible(el) {
    if (!el) return false;
    try {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return false;
      }
      if (style.display === 'contents') {
        const child = el.querySelector('a, button, div, span') || el.firstElementChild;
        return child ? isElementVisible(child) : true;
      }
      if (el.offsetWidth > 0 || el.offsetHeight > 0) return true;
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) return true;
      const clientRects = el.getClientRects();
      if (clientRects && clientRects.length > 0 && clientRects[0].width > 0) return true;
    } catch (_) {}
    return false;
  }

  function isInsideDetailsPaneOrNav(el) {
    if (!el) return false;
    try {
      return Boolean(el.closest(
        '.scaffold-layout__detail, [data-view-name="job-details"], #job-details, .jobs-description__content, .jobs-search__job-details, div.job-view-layout, .jobs-details__main-content, .job-details-jobs-unified-top-card, header, nav, footer'
      ));
    } catch (_) {
      return false;
    }
  }

  // Synthesize pleasant two-tone chime via Web Audio API (offline, zero assets)
  function playAudioChime() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15); // A5
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    } catch (_) {}
  }

  function updateFloatingPill(text, isDone = false) {
    let pill = document.getElementById('linkedin-auto-applier-pill');
    if (!pill) {
      pill = document.createElement('div');
      pill.id = 'linkedin-auto-applier-pill';
      pill.innerHTML = `
        <div style="position: fixed; bottom: 20px; right: 20px; z-index: 2147483647; background: #0f172a; color: #f8fafc; border: 1px solid #0a66c2; box-shadow: 0 10px 25px rgba(0,0,0,0.5); border-radius: 30px; padding: 8px 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 10px; cursor: default;">
          <span id="pill-dot" style="width: 8px; height: 8px; border-radius: 50%; background: #10b981; box-shadow: 0 0 8px #10b981; display: inline-block;"></span>
          <span id="pill-text">${text}</span>
          <button id="pill-stop-btn" style="background: #ef4444; color: white; border: none; border-radius: 12px; padding: 4px 10px; font-size: 11px; font-weight: 700; cursor: pointer;">⏹ Stop</button>
        </div>
      `;
      document.body.appendChild(pill);
      pill.querySelector('#pill-stop-btn').addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'STOP_AUTO_APPLY' }).catch(() => {});
        pill.remove();
      });
    }

    const pillText = pill.querySelector('#pill-text');
    if (pillText) pillText.textContent = text;

    if (isDone) {
      const dot = pill.querySelector('#pill-dot');
      if (dot) { dot.style.background = '#0a66c2'; dot.style.boxShadow = 'none'; }
      const btn = pill.querySelector('#pill-stop-btn');
      if (btn) {
        btn.textContent = '✕ Close';
        btn.style.background = '#475569';
        btn.onclick = () => pill.remove();
      }
    }
  }

  function removeFloatingPill() {
    const pill = document.getElementById('linkedin-auto-applier-pill');
    if (pill) pill.remove();
  }

  function log(message, type = 'info') {
    console.log(`[LinkedIn Auto-Applier] ${message}`);
    chrome.runtime.sendMessage({ action: 'APPEND_LOG', message, logType: type }).catch(() => {});
    if (isRunning) updateFloatingPill(message.slice(0, 48));
  }

  function triggerClick(el) {
    if (!el) return;
    try {
      if (typeof el.focus === 'function') el.focus();
      const mouseEventInit = { bubbles: true, cancelable: true, view: window };
      el.dispatchEvent(new MouseEvent('mousedown', mouseEventInit));
      el.dispatchEvent(new MouseEvent('mouseup', mouseEventInit));
      el.dispatchEvent(new MouseEvent('click', mouseEventInit));
      if (typeof el.click === 'function') {
        el.click();
      }
    } catch (_) {
      try { el.click(); } catch (e) {}
    }
  }

  function buildLinkedInSearchUrl(queryStr, settings = {}) {
    const query = queryStr || 'Data Analyst';
    const location = settings.targetLocation || '';
    const dateFilter = settings.dateFilter || 'r86400';
    const sortBy = settings.sortBy || 'DD';

    let url = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(query)}`;
    if (location && location.trim() !== '' && location.toLowerCase() !== 'any') {
      url += `&location=${encodeURIComponent(location)}`;
    }
    if (dateFilter && dateFilter !== 'any') {
      url += `&f_TPR=${encodeURIComponent(dateFilter)}`;
    }
    if (sortBy) {
      url += `&sortBy=${encodeURIComponent(sortBy)}`;
    }
    if (settings.easyApplyOnly || settings.dualStrategy === false) {
      url += `&f_AL=true`;
    }
    return url;
  }

  function parseExperienceRequirement(title = '', description = '', badges = '') {
    const fullText = `${title}\n${badges}\n${description}`.toLowerCase().replace(/[\u2010-\u2015\u2212\u2013\u2014]/g, '-');

    // 1. Freshers / 0 years indicators
    if (/\b(fresher|entry level|intern|trainee|0\s*-\s*1\s*(?:years?|yrs?)|0\s*-\s*2\s*(?:years?|yrs?)|no experience required|freshers(?:\s+are)?\s+welcome)\b/i.test(fullText)) {
      return 0;
    }

    // 2. Explicit patterns for required experience
    const expPatterns = [
      /(?:experience|exp)\s*(?:required|needed|mandatory)?\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(?:to|-|\+)?\s*(\d+(?:\.\d+)?)?\s*(?:years?|yrs?)/i,
      /(\d+(?:\.\d+)?)\s*(?:to|-)\s*(\d+(?:\.\d+)?)\s*(?:years?|yrs?)(?:\s+(?:of\s+)?(?:relevant\s+)?experience)?/i,
      /(\d+(?:\.\d+)?)\s*\+\s*(?:years?|yrs?)(?:\s+(?:of\s+)?(?:relevant\s+)?experience)/i,
      /(\d+(?:\.\d+)?)\s*(?:years?|yrs?)\s+(?:of\s+)?(?:relevant\s+)?experience/i,
      /minimum\s*(?:of\s*)?(\d+(?:\.\d+)?)\s*(?:years?|yrs?)/i,
      /at least\s*(\d+(?:\.\d+)?)\s*(?:years?|yrs?)/i
    ];

    for (const pat of expPatterns) {
      const match = fullText.match(pat);
      if (match && match[1]) {
        const val = parseFloat(match[1]);
        if (!isNaN(val) && val >= 0 && val <= 30) {
          return val;
        }
      }
    }

    // 3. Senior role title hints
    if (/\b(senior|sr\.|lead|manager|principal|architect|director|head of|vp|vice president)\b/i.test(title)) {
      if (!/\b(executive|assistant|junior|jr\.|trainee|associate)\b/i.test(title)) {
        return 4;
      }
    }

    return null;
  }

  function parseMonthlySalary(salaryStr) {
    if (!salaryStr) return null;
    const lower = salaryStr.toLowerCase().replace(/,/g, '');
    const nums = lower.match(/\d+/g);
    if (!nums || nums.length === 0) return null;

    const parsedVals = nums.map(n => parseInt(n, 10)).filter(n => !isNaN(n) && n > 100);
    if (parsedVals.length === 0) return null;

    const toMonthly = (val) => {
      if (lower.includes('year') || lower.includes('lpa') || lower.includes('annum') || val > 80000) {
        return Math.round(val / 12);
      }
      if (lower.includes('month') || lower.includes('pm') || lower.includes('per month')) {
        return val;
      }
      if (val >= 10000 && val <= 80000) return val;
      if (val > 80000) return Math.round(val / 12);
      return val;
    };

    const monthlyVals = parsedVals.map(toMonthly);
    return {
      minMonthly: Math.min(...monthlyVals),
      maxMonthly: Math.max(...monthlyVals)
    };
  }

  function inspectApplyButton(detailsPane, card = null) {
    const scope = detailsPane || document;

    // 1. Direct Easy Apply button selectors
    const easyApplySelectors = [
      'button.jobs-apply-button',
      'button.jobs-apply-button--top-card',
      '.jobs-apply-button--top-card button',
      'button[data-job-id][aria-label*="Easy Apply" i]',
      'button[aria-label*="Easy Apply" i]',
      'button[data-control-name="jobdetails_topcard_inapply"]',
      '.jobs-s-apply button',
      'button:has(span.jobs-apply-button__text)',
      'button.artdeco-button--primary:has(svg)'
    ];

    for (const sel of easyApplySelectors) {
      try {
        const btn = scope.querySelector(sel) || document.querySelector(`.scaffold-layout__detail ${sel}`);
        if (btn && isElementVisible(btn)) {
          const txt = `${btn.textContent || ''} ${btn.getAttribute('aria-label') || ''}`.toLowerCase();
          if (txt.includes('easy apply')) {
            return { type: 'easy_apply', element: btn };
          }
        }
      } catch (_) {}
    }

    // 2. Check all visible buttons in the details pane
    const allButtons = Array.from(scope.querySelectorAll('button, a')).filter(el => isElementVisible(el));
    const textEasyApply = allButtons.find(b => {
      const t = `${b.textContent || ''} ${b.getAttribute('aria-label') || ''}`.toLowerCase().trim();
      return t.includes('easy apply');
    });
    if (textEasyApply) {
      return { type: 'easy_apply', element: textEasyApply };
    }

    // 3. Document-wide fallback for Easy Apply button
    const docButtons = Array.from(document.querySelectorAll('.scaffold-layout__detail button, main button')).filter(el => isElementVisible(el));
    const docEasyApply = docButtons.find(b => {
      const t = `${b.textContent || ''} ${b.getAttribute('aria-label') || ''}`.toLowerCase().trim();
      return t.includes('easy apply');
    });
    if (docEasyApply) {
      return { type: 'easy_apply', element: docEasyApply };
    }

    // 4. External Apply button
    const extApply = allButtons.find(b => {
      const t = `${b.textContent || ''} ${b.getAttribute('aria-label') || ''}`.toLowerCase().trim();
      return t.includes('apply on company website') || t.includes('apply to') || t === 'apply';
    });
    if (extApply) {
      const url = extApply.href || extApply.getAttribute('href') || window.location.href;
      return { type: 'company_site', element: extApply, url };
    }

    // 5. Card-level Easy Apply fallback check
    if (card) {
      const cardText = (card.textContent || '').toLowerCase();
      if (cardText.includes('easy apply')) {
        const anyEasyBtn = Array.from(document.querySelectorAll('button')).find(b => {
          const t = `${b.textContent || ''} ${b.getAttribute('aria-label') || ''}`.toLowerCase();
          return t.includes('easy apply') && isElementVisible(b);
        });
        if (anyEasyBtn) {
          return { type: 'easy_apply', element: anyEasyBtn };
        }
      }
    }

    return { type: 'unknown', element: null };
  }

  // Trigger LinkedIn's native Save button in the job details top card
  function triggerLinkedInNativeSave(scope) {
    const container = scope || document;

    const selectors = [
      'button.jobs-save-button',
      'button[data-job-id][aria-label*="Save" i]',
      'button[aria-label*="Save job" i]',
      'button[aria-label*="Save this job" i]',
      'button[data-control-name="save_job"]',
      '.jobs-apply-button--top-card ~ button',
      'button[aria-label="Save" i]'
    ];

    let saveBtn = null;
    for (const sel of selectors) {
      try {
        const el = container.querySelector(sel);
        if (el && isElementVisible(el)) {
          saveBtn = el;
          break;
        }
      } catch (_) {}
    }

    if (!saveBtn) {
      const allButtons = Array.from(container.querySelectorAll('button')).filter(b => isElementVisible(b));
      saveBtn = allButtons.find(b => {
        const txt = (b.innerText || b.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
        const aria = (b.getAttribute('aria-label') || '').toLowerCase();
        const isSave = (txt === 'save' || aria === 'save' || aria === 'save job' || aria.startsWith('save '));
        const isNotSaved = !txt.includes('saved') && !aria.includes('saved') && !aria.includes('remove') && !aria.includes('unsave');
        return isSave && isNotSaved;
      });
    }

    if (saveBtn) {
      const txt = (saveBtn.innerText || saveBtn.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const aria = (saveBtn.getAttribute('aria-label') || '').toLowerCase();
      const isAlreadySaved = txt.includes('saved') || aria.includes('saved') || aria.includes('remove') || aria.includes('unsave') || saveBtn.classList.contains('jobs-save-button--saved');

      if (!isAlreadySaved) {
        log('💾 Clicking LinkedIn native [Save] button to bookmark on your LinkedIn profile...', 'info');
        triggerClick(saveBtn);
        return true;
      } else {
        log('ℹ️ Job is already bookmarked on your LinkedIn profile.', 'info');
        return true;
      }
    } else {
      console.log('[LinkedIn Auto-Applier] Native Save button not found in details pane.');
      return false;
    }
  }

  // Extract clean Title, Company, and Location from both details pane and card
  function extractJobMetadata(scope, card) {
    const pane = scope || document;

    // 1. Job Title: Extract from card first (most reliable source for active card)
    let jobTitle = '';
    if (card) {
      const cardTitleEl = card.querySelector(
        'a.job-card-list__title--link, a.job-card-container__link, .job-card-list__title, [class*="job-card-list__title"], [class*="job-title"], strong, h3, h2, a[href*="/jobs/view/"], a[href*="currentJobId="]'
      );
      if (cardTitleEl && cardTitleEl.textContent.trim()) {
        jobTitle = cardTitleEl.textContent.trim();
      }
    }

    // Supplement from details pane top card (avoid generic headers like "About the company")
    if (!jobTitle) {
      const paneTitleEl = pane.querySelector(
        '.job-details-jobs-unified-top-card__job-title, .jobs-unified-top-card__job-title, h1[class*="job-title"], [data-view-name="job-details"] h1, h1.t-24, h2.job-details-jobs-unified-top-card__job-title'
      );
      if (paneTitleEl && paneTitleEl.textContent.trim()) {
        jobTitle = paneTitleEl.textContent.trim();
      }
    }
    if (!jobTitle) jobTitle = 'Unknown Role';

    // 2. Company
    let company = '';
    if (card) {
      const cardComp = card.querySelector(
        '.job-card-container__primary-description, .job-card-container__company-name, [class*="company-name"], [class*="primary-description"], .artdeco-entity-lockup__subtitle, [class*="subtitle"]'
      );
      if (cardComp && cardComp.textContent.trim()) {
        company = cardComp.textContent.trim();
      }
    }
    if (!company) {
      const paneComp = pane.querySelector(
        '.job-details-jobs-unified-top-card__company-name, .jobs-unified-top-card__company-name, a[href*="/company/"]'
      );
      if (paneComp && paneComp.textContent.trim()) {
        company = paneComp.textContent.trim();
      }
    }
    if (!company) company = 'Unknown Company';

    // 3. Location
    let location = '';
    if (card) {
      const cardLoc = card.querySelector(
        '.job-card-container__metadata-item, .job-card-list__location, [class*="metadata-item"], [class*="job-card-container__metadata"], .artdeco-entity-lockup__caption, [class*="caption"]'
      );
      if (cardLoc && cardLoc.textContent.trim()) {
        location = cardLoc.textContent.trim();
      }
    }
    if (!location || location === 'Unknown Location') {
      const primaryDescEl = pane.querySelector(
        '.job-details-jobs-unified-top-card__primary-description, .jobs-unified-top-card__primary-description, .job-details-jobs-unified-top-card__subtitle'
      );
      if (primaryDescEl) {
        const rawDesc = primaryDescEl.textContent || '';
        const parts = rawDesc.split(/[·•|]/).map(s => s.trim()).filter(Boolean);
        const candidateLoc = parts.find(p => !p.toLowerCase().includes('ago') && !p.toLowerCase().includes('applicant') && !p.toLowerCase().includes('promoted') && p !== company);
        if (candidateLoc) location = candidateLoc;
      }
    }
    if (!location) {
      const locSpan = pane.querySelector('.job-details-jobs-unified-top-card__bullet ~ span, [class*="workplace-type"]');
      if (locSpan && locSpan.textContent.trim()) location = locSpan.textContent.trim();
    }
    if (!location) location = 'Unknown Location';

    return { jobTitle, company, location };
  }

  async function waitForJobDetails(card, maxWaitMs = 3000) {
    const start = Date.now();
    await sleep(350);

    const getPane = () => document.querySelector(
      '.scaffold-layout__detail, .jobs-search-two-pane__details, [data-view-name="job-details"], main.scaffold-layout__main, .jobs-search__job-details, div.job-view-layout, .jobs-details__main-content'
    );

    const getDesc = (pane) => {
      const scope = pane || document;
      return scope.querySelector('#job-details, .jobs-description__content, .jobs-box__html-content, article');
    };

    while (Date.now() - start < maxWaitMs) {
      const pane = getPane();
      const desc = getDesc(pane);
      const hasTopCard = pane?.querySelector('.job-details-jobs-unified-top-card, .jobs-unified-top-card, button.jobs-apply-button');
      if (pane && (desc || hasTopCard)) {
        return { detailsPane: pane, desc };
      }
      await sleep(200);
    }

    const finalPane = getPane() || document;
    return {
      detailsPane: finalPane,
      desc: getDesc(finalPane)
    };
  }

  async function executeEasyApplyFlow(profile, settings, applyBtn = null) {
    log('Waiting for Easy Apply modal to load...', 'info');

    let modal = null;
    for (let wait = 0; wait < 6; wait++) {
      await sleep(600);
      modal = window.LinkedInAutoFormFiller?.getModal();
      if (modal) break;
    }

    // If modal didn't open, retry clicking the Easy Apply button once
    if (!modal && applyBtn) {
      log('Modal did not appear; re-triggering Easy Apply click...', 'info');
      triggerClick(applyBtn);
      for (let wait = 0; wait < 5; wait++) {
        await sleep(600);
        modal = window.LinkedInAutoFormFiller?.getModal();
        if (modal) break;
      }
    }

    if (!modal) {
      log('⚠️ Easy Apply modal did not open. Moving to next job.', 'warning');
      return { success: false, reason: 'modal_did_not_open' };
    }

    const maxSteps = 15;
    let stepCount = 0;
    let consecutiveUnchanged = 0;

    while (stepCount < maxSteps) {
      if (isHalted) return { success: false, reason: 'halted' };
      stepCount++;

      const currentModal = window.LinkedInAutoFormFiller?.getModal() || modal;
      if (!currentModal) {
        if (window.LinkedInAutoFormFiller?.isApplicationSubmitted()) {
          log('🎉 Application submitted successfully!', 'success');
          return { success: true };
        }
        await sleep(1500);
        if (!window.LinkedInAutoFormFiller?.getModal()) {
          return { success: true };
        }
      }

      // Check CAPTCHA
      if (window.LinkedInAutoFormFiller?.checkCaptcha()) {
        playAudioChime();
        log('⚠️ CAPTCHA detected on application! Pausing for user verification...', 'warning');
        chrome.runtime.sendMessage({ action: 'CAPTCHA_ALERT' }).catch(() => {});
        while (window.LinkedInAutoFormFiller?.checkCaptcha() && !isHalted) {
          await sleep(2000);
        }
      }

      // Check if already on submitted confirmation
      if (window.LinkedInAutoFormFiller?.isApplicationSubmitted(currentModal)) {
        log('🎉 Confirmation detected: Application submitted!', 'success');
        await sleep(1500);
        window.LinkedInAutoFormFiller?.closeModal();
        return { success: true };
      }

      // Fill current step
      const fillRes = window.LinkedInAutoFormFiller?.fillCurrentStep(profile, settings) || { filled: 0, unhandledRequired: [] };
      log(`Step ${stepCount}: Auto-filled ${fillRes.filled} fields.`, 'info');

      // Check for unhandled required questions
      if (fillRes.unhandledRequired && fillRes.unhandledRequired.length > 0) {
        playAudioChime();
        const unhandledLabels = fillRes.unhandledRequired.map(u => u.label).filter(Boolean).join(', ');
        log(`⚠️ Unknown required question: "${unhandledLabels || 'Question'}". Pausing for manual input...`, 'warning');
        chrome.runtime.sendMessage({
          action: 'STALL_ALERT',
          question: unhandledLabels || 'Screening question requires manual input'
        }).catch(() => {});

        isStalledForUser = true;
        updateFloatingPill('⚠️ Please fill required question & click Next');

        // Freeze indefinitely until user fills the question and advances/submits or closes modal
        while (isStalledForUser && !isHalted) {
          await sleep(1500);
          const activeModal = window.LinkedInAutoFormFiller?.getModal();
          if (!activeModal || window.LinkedInAutoFormFiller?.isApplicationSubmitted(activeModal)) {
            isStalledForUser = false;
            break;
          }
          // Re-check if required fields were filled by user
          const recheck = window.LinkedInAutoFormFiller?.fillCurrentStep(profile, settings);
          if (!recheck?.unhandledRequired || recheck.unhandledRequired.length === 0) {
            isStalledForUser = false;
            log('User input detected! Resuming auto-apply flow...', 'info');
            break;
          }
        }
      }

      await humanDelay(settings?.stepDelayMs || 1000);

      // Advance or Submit
      const advRes = await window.LinkedInAutoFormFiller?.advanceOrSubmit(currentModal, settings);
      if (advRes?.action === 'submitted') {
        log('Clicked Submit application button! Waiting for confirmation...', 'info');
        await sleep(2500);
        window.LinkedInAutoFormFiller?.closeModal();
        return { success: true };
      } else if (advRes?.action === 'advanced') {
        log(`Advanced past Step ${stepCount}...`, 'info');
        await sleep(1500);
        consecutiveUnchanged = 0;
      } else {
        consecutiveUnchanged++;
        if (consecutiveUnchanged >= 3) {
          log('⚠️ Wizard could not advance past current step. Waiting for user action...', 'warning');
          await sleep(2000);
        }
      }
    }

    if (window.LinkedInAutoFormFiller?.isApplicationSubmitted()) {
      window.LinkedInAutoFormFiller?.closeModal();
      return { success: true };
    }

    return { success: false, reason: 'max_steps_exceeded' };
  }

  function extractCardJobId(card) {
    if (!card) return null;
    try {
      // 1. Direct job data attributes on card (NEVER use generic 'id' or ember IDs)
      const dataAttrs = ['data-job-id', 'data-occludable-job-id', 'data-entity-urn'];
      for (const attrName of dataAttrs) {
        const val = card.getAttribute(attrName);
        if (val) {
          const m = val.match(/\d{6,14}/);
          if (m) return m[0];
        }
      }

      // 2. Job data attributes on child elements
      const childWithAttr = card.querySelector('[data-job-id], [data-occludable-job-id], [data-entity-urn]');
      if (childWithAttr) {
        for (const attrName of dataAttrs) {
          const val = childWithAttr.getAttribute(attrName);
          if (val) {
            const m = val.match(/\d{6,14}/);
            if (m) return m[0];
          }
        }
      }

      // 3. Raw href attribute on job title link or job view link
      // CRITICAL: NEVER use a.href which resolves to window.location! Use a.getAttribute('href')!
      const jobLinks = card.querySelectorAll(
        'a.job-card-list__title--link, a.job-card-container__link, a[href*="/jobs/view/"], a[data-control-name="job_card_click"]'
      );
      for (const a of jobLinks) {
        const rawHref = a.getAttribute('href') || '';
        const m1 = rawHref.match(/\/jobs\/view\/(\d{6,14})/);
        if (m1) return m1[1];
        const m2 = rawHref.match(/currentJobId=(\d{6,14})/);
        if (m2) return m2[1];
      }

      if (card.tagName === 'A') {
        const rawHref = card.getAttribute('href') || '';
        const m1 = rawHref.match(/\/jobs\/view\/(\d{6,14})/);
        if (m1) return m1[1];
        const m2 = rawHref.match(/currentJobId=(\d{6,14})/);
        if (m2) return m2[1];
      }

      // Fallback: any link inside card with /jobs/view/
      const anyJobView = card.querySelector('a[href*="/jobs/view/"]');
      if (anyJobView) {
        const rawHref = anyJobView.getAttribute('href') || '';
        const m = rawHref.match(/\/jobs\/view\/(\d{6,14})/);
        if (m) return m[1];
      }
    } catch (_) {}
    return null;
  }

  function detectCurrentPageNumber() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const startParam = parseInt(urlParams.get('start'), 10);
      if (!isNaN(startParam) && startParam >= 0) {
        return Math.floor(startParam / 25) + 1;
      }
      const pageParam = parseInt(urlParams.get('page'), 10);
      if (!isNaN(pageParam) && pageParam >= 1) {
        return pageParam;
      }
    } catch (_) {}
    return 1;
  }

  function getJobListContainer() {
    // 1. Direct modern LinkedIn left rail containers
    const selectors = [
      '.scaffold-layout__list',
      'div.scaffold-layout__list',
      '.scaffold-layout__list-container',
      '.jobs-search-results-list',
      '.jobs-search-results-list__list',
      'div[data-view-name*="search-results"]',
      'div[class*="jobs-search-results"]',
      'div[class*="scaffold-layout__list"]'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.scrollHeight > el.clientHeight && el.clientHeight > 150) return el;
    }

    // 2. Traverse up from any rendered job card or anchor to find the true scrollable container
    const sample = document.querySelector(
      'ul.scaffold-layout__list-container > li, div.job-card-container, li.jobs-search-results__list-item, div[data-job-id], [data-occludable-job-id], a[href*="/jobs/view/"], a[href*="currentJobId="]'
    );
    if (sample && !isInsideDetailsPaneOrNav(sample)) {
      let p = sample.parentElement;
      while (p && p !== document.body && p !== document.documentElement) {
        if (p.scrollHeight > p.clientHeight && p.clientHeight > 150) {
          const style = window.getComputedStyle(p);
          const oy = style.overflowY;
          if (oy === 'auto' || oy === 'scroll' || p.classList.contains('scaffold-layout__list')) {
            return p;
          }
        }
        p = p.parentElement;
      }
    }

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }

    return window;
  }

  async function scrollListToTop() {
    const listContainer = getJobListContainer();
    try {
      if (listContainer && listContainer !== window && listContainer.scrollTo) {
        listContainer.scrollTo({ top: 0, behavior: 'instant' });
      }
    } catch (_) {}
    try { window.scrollTo({ top: 0, behavior: 'instant' }); } catch (_) {}
    if (document.documentElement) document.documentElement.scrollTop = 0;
    if (document.body) document.body.scrollTop = 0;
    await sleep(800);
  }

  function isNonJobElement(el) {
    if (!el) return true;
    const text = (el.innerText || el.textContent || '').toLowerCase();
    if (text.includes('are these results helpful') ||
        text.includes('see jobs where you\'re a top applicant') ||
        text.includes('try premium') ||
        text.includes('activate premium') ||
        text.includes('get job alerts for this search') ||
        text.includes('explore collaborative articles') ||
        text.includes('how ai search works') ||
        text.includes('how promoted jobs are ranked')) {
      return true;
    }
    return false;
  }

  function getRenderedJobCards() {
    const deduped = [];
    const seenJobIds = new Set();

    function tryAddCard(cardEl) {
      if (!cardEl || isInsideDetailsPaneOrNav(cardEl)) return;
      if (isNonJobElement(cardEl)) return;
      if (!isElementVisible(cardEl)) return;

      const jid = extractCardJobId(cardEl);
      // STRICT REQUIREMENT: Only elements with an authentic extracted numeric job ID are treated as jobs
      if (!jid) return;

      const key = `id_${jid}`;
      if (!seenJobIds.has(key)) {
        seenJobIds.add(key);
        deduped.push(cardEl);
      }
    }

    // Tier 1: Invariant Job Link Discovery
    // Every single job card rendered in the search results left rail contains an anchor pointing to the job
    const candidateLinks = Array.from(document.querySelectorAll(
      'a.job-card-list__title--link, a.job-card-container__link, a[href*="/jobs/view/"], a[data-control-name="job_card_click"]'
    ));

    for (const link of candidateLinks) {
      if (isInsideDetailsPaneOrNav(link)) continue;
      // Map link up to its job card container
      const cardContainer = link.closest(
        'li.jobs-search-results__list-item, li.scaffold-layout__list-item, li[data-occludable-job-id], [data-occludable-job-id], div.job-card-container, div[data-view-name="job-card"], div[data-job-id], div.artdeco-entity-lockup, div.base-card, div[data-entity-urn*="jobPosting"], li, div[role="listitem"]'
      ) || link.closest('li') || link.parentElement?.parentElement || link;

      tryAddCard(cardContainer);
    }

    // Tier 2: Direct Card Selectors Fallback
    const cardSelectors = [
      'li.jobs-search-results__list-item',
      'li.scaffold-layout__list-item',
      '.jobs-search-results-list li',
      '[data-occludable-job-id]',
      'div.job-card-container',
      'div[data-view-name="job-card"], [data-view-name="job-card"]',
      'div[data-job-id]',
      'div.artdeco-entity-lockup[data-job-id]',
      'div.base-card[data-entity-urn]'
    ];

    const directElements = Array.from(document.querySelectorAll(cardSelectors.join(', ')));
    for (const el of directElements) {
      const cardEl = el.closest('li.jobs-search-results__list-item, li.scaffold-layout__list-item, ul.scaffold-layout__list-container > li') || el;
      tryAddCard(cardEl);
    }

    return deduped;
  }

  function isJobAlreadyApplied(jobId, card) {
    if (appliedJobIdSet.has(String(jobId))) return true;
    if (!card) return false;
    const appliedBadge = card.querySelector('.job-card-container__footer-job-state, [data-test-job-card-applied]');
    if (appliedBadge) return true;
    const textElements = Array.from(card.querySelectorAll('span, li, div, time'));
    return textElements.some(el => {
      const t = (el.textContent || '').trim().toLowerCase();
      return t === 'applied' || t.startsWith('applied ');
    });
  }

  function selectJobCard(card) {
    if (!card) return;
    const clickable = (card.tagName === 'A' ? card : null) ||
      card.querySelector('a[href*="/jobs/view/"], a[href*="currentJobId="], a.job-card-list__title--link, a.job-card-container__link, .job-card-list__title, [data-control-name="job_card_click"]') ||
      card.querySelector('.job-card-container, .job-card-list__entity-lockup, div[data-job-id], .artdeco-entity-lockup') ||
      card;

    try {
      if (typeof clickable.focus === 'function') clickable.focus();
      const mouseEventInit = { bubbles: true, cancelable: true, view: window };
      clickable.dispatchEvent(new MouseEvent('mousedown', mouseEventInit));
      clickable.dispatchEvent(new MouseEvent('mouseup', mouseEventInit));
      clickable.dispatchEvent(new MouseEvent('click', mouseEventInit));
      if (typeof clickable.click === 'function') {
        clickable.click();
      }
    } catch (_) {}
  }

  async function processJobCard(card, profile, settings) {
    if (isHalted) return 'halted';

    // 1. Extract job ID
    const jobId = extractCardJobId(card) || `li_job_${Date.now()}`;

    // Fast Skip: Permanent check against already-applied listings
    if (isJobAlreadyApplied(jobId, card)) {
      log(`⏭️ Skipped: Job #${jobId} already applied.`, 'info');
      chrome.runtime.sendMessage({ action: 'UPDATE_STATS', delta: { skipped: 1, reason: 'already_applied' } }).catch(() => {});
      return 'skipped_already_applied';
    }

    // Fast Skip: Already processed in current session run
    if (processedJobIds.has(String(jobId))) {
      return 'already_processed';
    }

    await persistProcessedJobId(jobId);

    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const originalOutline = card.style.outline;
    card.style.outline = '2px solid #0a66c2';

    // Click card to load right-side details cleanly
    selectJobCard(card);

    // Wait for details pane
    const { detailsPane, desc } = await waitForJobDetails(card, 3000);
    const scope = detailsPane || document;

    const { jobTitle, company, location } = extractJobMetadata(scope, card);
    const badgesEl = scope.querySelector('.job-details-jobs-unified-top-card__job-insight, .jobs-unified-top-card__job-insight');
    const salaryEl = scope.querySelector('.job-details-jobs-unified-top-card__job-insight:has([data-test-icon*="money"]), [data-test-icon*="money"]');

    const badgeText = badgesEl ? badgesEl.textContent.trim() : '';
    const salaryText = salaryEl ? salaryEl.textContent.trim() : '';
    const descText = desc ? (desc.innerText || desc.textContent || '') : '';
    const fullText = `${jobTitle}\n${badgeText}\n${descText}`;
    const jobUrl = window.location.href;

    log(`🔍 Inspecting: "${jobTitle}" at "${company}" (${location})`, 'info');

    function escapeRegex(str) {
      return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // 0. Blocked Companies / Agency Blacklist Check
    const blockedCompaniesStr = settings?.blockedCompanies || '';
    if (blockedCompaniesStr) {
      const blockedTokens = blockedCompaniesStr.toLowerCase().split(/[,|]/).map(t => t.trim()).filter(t => t.length > 1);
      const compLower = (company || '').toLowerCase();
      const matchedBlocked = blockedTokens.find(token => compLower.includes(token));
      if (matchedBlocked) {
        log(`⏭️ Skipped: "${jobTitle}" at "${company}" matches blocked company filter ("${matchedBlocked}").`, 'info');
        chrome.runtime.sendMessage({ action: 'UPDATE_STATS', delta: { skipped: 1, reason: 'company' } }).catch(() => {});
        card.style.outline = originalOutline;
        return 'skipped_company';
      }
    }

    // 0.1 AI Gig, Micro-Task & Annotation Spam Shield
    if (settings?.blockAiSpam !== false) {
      const titleLower = (jobTitle || '').toLowerCase();
      const companyLower = (company || '').toLowerCase();

      // 0a. Hourly dollar rate in title or compensation (e.g. "$40/hr Remote", "$10/hr Remote", "$25 / hr")
      const hourlyDollarRegex = /\$\s*\d+(?:\.\d+)?\s*(?:\/|\s*per\s*)h(?:ou)?r/i;
      const hasHourlyDollar = hourlyDollarRegex.test(jobTitle) || hourlyDollarRegex.test(salaryText);

      // 0b. Known AI crowdsourcing / gig spam companies
      const spamCompanies = [
        'crossing hurdles', 'outlier', 'remotasks', 'dataannotation', 'alignerr',
        'mindrift', 'oneforma', 'invisible technologies', 'appen', 'telus international',
        'welocalize', 'clickworker', 'toloka'
      ];
      const matchedSpamCompany = spamCompanies.find(sc => companyLower.includes(sc));

      // 0c. AI labeling / gig reviewer / annotation role keywords in title
      const gigTitleKeywords = [
        'annotator', 'annotation', 'data annotator', 'data reviewer', 'ai reviewer',
        'ai data reviewer', 'content reviewer', 'data labeler', 'data labeling',
        'labeler', 'labeling', 'ai trainer', 'model trainer', 'data trainer',
        'rlhf', 'prompt evaluator', 'ai evaluator', 'transcriptionist', 'transcription',
        'data entry', 'form filling', 'crowdworker', 'micro task', 'microtask'
      ];
      const matchedGigKeyword = gigTitleKeywords.find(kw => {
        const regex = new RegExp(`\\b${escapeRegex(kw)}\\b`, 'i');
        return regex.test(titleLower);
      });

      if (hasHourlyDollar || matchedSpamCompany || matchedGigKeyword) {
        const flagReason = hasHourlyDollar ? 'Hourly dollar rate ($/hr) detected' :
                           matchedSpamCompany ? `Spam agency "${company}"` :
                           `AI labeling/gig keyword "${matchedGigKeyword}" in title`;
        log(`🛡️ Skipped AI Gig Spam: "${jobTitle}" at "${company}" (${flagReason}).`, 'warning');
        chrome.runtime.sendMessage({ action: 'UPDATE_STATS', delta: { skipped: 1, reason: 'ai_spam' } }).catch(() => {});
        card.style.outline = originalOutline;
        return 'skipped_ai_spam';
      }
    }

    // 0.2 Strict Job Title Relevance Filter
    if (settings?.matchTitleRelevance !== false) {
      const targetQueryRaw = (settings?.targetJobQuery || profile?.work?.targetRole?.jobTitle || 'Data Analyst').toLowerCase().trim();
      const targetQueries = targetQueryRaw.split(/[,;]/).map(q => q.trim()).filter(Boolean);
      const titleLower = (jobTitle || '').toLowerCase();

      const matchesAnyTarget = targetQueries.some(tQuery => {
        if (tQuery.includes('analyst') || tQuery.includes('analytics')) {
          return /\b(analyst|analytics|analysis|bi\b|business intelligence|reporting|insights|mis\b|data)\b/i.test(titleLower);
        }
        if (tQuery.includes('developer') || tQuery.includes('engineer')) {
          return /\b(developer|engineer|software|sde|swe|programmer)\b/i.test(titleLower);
        }
        const filler = ['and', 'the', 'for', 'with', 'remote', 'in', 'at', 'jobs', 'job'];
        const targetTokens = tQuery.split(/\s+/).map(t => t.replace(/[^a-z0-9]/g, '')).filter(t => t.length > 2 && !filler.includes(t));
        return targetTokens.length === 0 || targetTokens.some(tok => titleLower.includes(tok));
      });

      if (!matchesAnyTarget) {
        log(`🎯 Skipped: "${jobTitle}" does not match target role "${targetQueryRaw}" (Title Relevance Filter).`, 'info');
        chrome.runtime.sendMessage({ action: 'UPDATE_STATS', delta: { skipped: 1, reason: 'title_relevance' } }).catch(() => {});
        card.style.outline = originalOutline;
        return 'skipped_title_relevance';
      }
    }

    // 0.3 Blacklist / Negative Keywords
    const blacklistStr = settings?.blacklistKeywords || 'intern, unpaid, bpo, telecaller, faculty, teaching, night shift, annotator, annotation, reviewer, labeler, labeling, ai trainer, rlhf, evaluator, transcription, data entry, crossing hurdles, outlier, remotasks, alignerr';
    const blacklistTokens = blacklistStr.toLowerCase().split(/[,|]/).map(t => t.trim()).filter(t => t.length > 1);

    const matchedBlacklist = blacklistTokens.find(token => {
      if (!token) return false;
      const regex = new RegExp(`\\b${escapeRegex(token)}\\b`, 'i');
      return regex.test(fullText);
    });

    if (matchedBlacklist) {
      log(`⏭️ Skipped: "${jobTitle}" matches blacklist keyword "${matchedBlacklist}".`, 'info');
      chrome.runtime.sendMessage({ action: 'UPDATE_STATS', delta: { skipped: 1, reason: 'blacklist' } }).catch(() => {});
      card.style.outline = originalOutline;
      return 'skipped_blacklist';
    }

    // 0.4 Strict Location Filter (Target City + Remote Only, Countrywide India Matching)
    if (settings?.strictLocation !== false) {
      const locLower = (location || '').toLowerCase();
      const rawTarget = (settings?.targetLocation || '').toLowerCase().trim();
      const isRemote = locLower.includes('remote') || fullText.toLowerCase().includes('remote') || fullText.toLowerCase().includes('work from home');

      const targetTokens = rawTarget.split(/[,|]/).map(t => t.trim()).filter(t => t.length > 1);
      const isNationwideIndia = targetTokens.length === 0 ||
                                targetTokens.includes('india') ||
                                rawTarget === 'india' ||
                                rawTarget === 'all india' ||
                                rawTarget === 'any' ||
                                rawTarget === '';

      let isCityMatch = isNationwideIndia;
      if (!isCityMatch) {
        isCityMatch = targetTokens.some(t => {
          if (t === 'bangalore' || t === 'bengaluru') {
            return locLower.includes('bangalore') || locLower.includes('bengaluru') || fullText.toLowerCase().includes('bengaluru');
          }
          if (t === 'delhi' || t === 'ncr' || t === 'gurgaon' || t === 'gurugram' || t === 'noida') {
            return locLower.includes('delhi') || locLower.includes('ncr') || locLower.includes('gurgaon') || locLower.includes('gurugram') || locLower.includes('noida');
          }
          if (t === 'hyderabad') {
            return locLower.includes('hyderabad');
          }
          if (t === 'mumbai' || t === 'pune') {
            return locLower.includes(t);
          }
          return locLower.includes(t);
        });
      }

      if (!isRemote && !isCityMatch) {
        log(`⏭️ Skipped: "${jobTitle}" at "${location}" is outside target location and not Remote.`, 'info');
        chrome.runtime.sendMessage({ action: 'UPDATE_STATS', delta: { skipped: 1, reason: 'location' } }).catch(() => {});
        card.style.outline = originalOutline;
        return 'skipped_location';
      }
    }

    // 1. Salary Check
    const minSalaryFloor = settings?.minMonthlySalary !== undefined ? settings.minMonthlySalary : 25000;
    const sal = parseMonthlySalary(salaryText);
    if (sal && sal.maxMonthly < minSalaryFloor) {
      log(`⏭️ Skipped: "${jobTitle}" salary (₹${sal.maxMonthly.toLocaleString()}/mo) below ₹${minSalaryFloor.toLocaleString()} floor.`, 'info');
      chrome.runtime.sendMessage({ action: 'UPDATE_STATS', delta: { skipped: 1, reason: 'salary' } }).catch(() => {});
      card.style.outline = originalOutline;
      return 'skipped_salary';
    }

    // 2. Seniority Tag Check (LinkedIn official badge & Title level)
    const lowerBadge = badgeText.toLowerCase();
    const isSeniorBadge = lowerBadge.includes('mid-senior') || lowerBadge.includes('director') || lowerBadge.includes('executive');
    const isSeniorTitle = /\b(director|head of|vp|vice president)\b/i.test(jobTitle);
    if (isSeniorBadge || isSeniorTitle) {
      if (!/\b(junior|jr\.|trainee|associate)\b/i.test(jobTitle)) {
        const reasonDetail = isSeniorTitle ? 'Executive / VP title' : badgeText;
        log(`⏭️ Skipped: "${jobTitle}" has senior LinkedIn level (${reasonDetail}).`, 'info');
        chrome.runtime.sendMessage({ action: 'UPDATE_STATS', delta: { skipped: 1, reason: 'senior' } }).catch(() => {});
        card.style.outline = originalOutline;
        return 'skipped_senior_badge';
      }
    }

    // 3. Experience Requirement Check (Hybrid: Badge + Regex)
    const userExp = settings?.userYearsExp !== undefined ? settings.userYearsExp : 1;
    const reqExp = parseExperienceRequirement(jobTitle, descText, badgeText);

    if (reqExp !== null && reqExp > userExp) {
      log(`⏭️ Skipped: "${jobTitle}" requires ${reqExp}+ years experience (Profile: ${userExp} yr).`, 'info');
      chrome.runtime.sendMessage({ action: 'UPDATE_STATS', delta: { skipped: 1, reason: 'experience' } }).catch(() => {});
      card.style.outline = originalOutline;
      return 'skipped_experience';
    }

    if (reqExp === null && settings?.unlistedExpAction === 'skip') {
      log(`⏭️ Skipped: "${jobTitle}" has no experience listed (Policy: Skip).`, 'info');
      chrome.runtime.sendMessage({ action: 'UPDATE_STATS', delta: { skipped: 1, reason: 'experience' } }).catch(() => {});
      card.style.outline = originalOutline;
      return 'skipped_unlisted_exp';
    }

    // 4. Criteria matches! Inspect apply button
    log(`🎯 Criteria matched for "${jobTitle}"! Checking apply type...`, 'success');
    const applyInfo = inspectApplyButton(scope, card);

    // Subcase A: "Easy Apply" -> AUTO-APPLY
    if (applyInfo.type === 'easy_apply') {
      if (reqExp === null && settings?.unlistedExpAction === 'save') {
        log(`📋 Experience unlisted: Saving "${jobTitle}" for manual review as configured.`, 'info');
        if (settings?.saveToLinkedInProfile !== false) {
          triggerLinkedInNativeSave(scope);
          await sleep(500);
        }
        chrome.runtime.sendMessage({
          action: 'SAVE_JOB',
          job: { jobId, title: jobTitle, company, location, salary: salaryText, url: jobUrl, reason: 'Unlisted Experience (Manual Review)' }
        }).catch(() => {});
        card.style.outline = originalOutline;
        return 'saved_unlisted_exp';
      }

      log(`🚀 "Easy Apply" found! Starting application for "${jobTitle}"...`, 'info');
      triggerClick(applyInfo.element);

      const result = await executeEasyApplyFlow(profile, settings, applyInfo.element);
      if (result.success) {
        chrome.runtime.sendMessage({
          action: 'JOB_APPLIED',
          job: { jobId, title: jobTitle, company, location, salary: salaryText, url: jobUrl }
        }).catch(() => {});
      } else {
        const failDetail = result.reason === 'unresolved_fields' ? 'Unresolved Questions' :
                           result.reason === 'max_steps_exceeded' ? 'Multi-Step Limit' :
                           (result.reason || 'Manual Review');
        log(`⚠️ Could not auto-complete application for "${jobTitle}" (${failDetail}).`, 'warning');
        log(`📋 Auto-saving to "Saved Jobs" for manual completion so opportunity is not lost!`, 'info');
        if (settings?.saveToLinkedInProfile !== false) {
          triggerLinkedInNativeSave(scope);
          await sleep(500);
        }
        chrome.runtime.sendMessage({
          action: 'SAVE_JOB',
          job: {
            jobId,
            title: jobTitle,
            company,
            location,
            salary: salaryText,
            url: jobUrl,
            reason: `⚠️ Incomplete: ${failDetail}`
          }
        }).catch(() => {});
      }
      card.style.outline = originalOutline;
      return result.success ? 'applied' : 'saved_incomplete';
    }

    // Subcase B: External "Apply" -> SAVE ONLY IF CRITERIA MATCHES (or skip if easyApplyOnly)
    if (applyInfo.type === 'company_site') {
      if (settings?.easyApplyOnly || settings?.dualStrategy === false) {
        log(`⏭️ Skipped: "${jobTitle}" requires application on external company site (Easy Apply Only mode active).`, 'info');
        chrome.runtime.sendMessage({ action: 'UPDATE_STATS', delta: { skipped: 1, reason: 'easy_apply' } }).catch(() => {});
        card.style.outline = originalOutline;
        return 'skipped_external';
      }
      log(`📋 Criteria matched! Saving external company site job: "${jobTitle}" at "${company}".`, 'info');
      if (settings?.saveToLinkedInProfile !== false) {
        triggerLinkedInNativeSave(scope);
        await sleep(500);
      }
      chrome.runtime.sendMessage({
        action: 'SAVE_JOB',
        job: { jobId, title: jobTitle, company, location, salary: salaryText, url: applyInfo.url || jobUrl, reason: 'Criteria Matched (Company Site)' }
      }).catch(() => {});
      card.style.outline = originalOutline;
      return 'saved_company_site';
    }

    // Subcase C: Unrecognized apply button
    log(`⏭️ Skipped: No active apply button found for "${jobTitle}".`, 'info');
    chrome.runtime.sendMessage({ action: 'UPDATE_STATS', delta: { skipped: 1, reason: 'unrecognized' } }).catch(() => {});
    card.style.outline = originalOutline;
    return 'skipped_unrecognized';
  }

  async function navigateToNextPage(currentPageNum = 1) {
    log('Searching for Next Page of job results...', 'info');

    // Smooth scroll down the jobs list container and window to ensure pagination renders
    const listContainer = getJobListContainer();
    if (listContainer && listContainer !== window && listContainer.scrollTo) {
      listContainer.scrollTo({ top: listContainer.scrollHeight || 10000, behavior: 'smooth' });
    }
    try { window.scrollTo({ top: document.body?.scrollHeight || 10000, behavior: 'smooth' }); } catch (_) {}
    await sleep(2000);

    function isSafePaginationElement(el) {
      if (!el || !isElementVisible(el)) return false;
      // CRITICAL: Must NOT be inside the top nav bar, message overlay, details pane, or modals
      if (el.closest('header, nav.global-nav, .global-nav, #msg-overlay, .msg-overlay-list-bubble, aside, [role="dialog"], .scaffold-layout__detail, [data-view-name="job-details"]')) {
        return false;
      }
      return true;
    }

    const targetPageNum = (currentPageNum || 1) + 1;

    // Strategy 1: Check pagination container if present
    const paginationContainer = document.querySelector(
      '.artdeco-pagination, [aria-label*="pagination" i], .jobs-search-pagination, [data-view-name*="pagination"], .jobs-search-results-list__pagination, div[class*="pagination"], nav[class*="pagination"], ul[class*="pagination"], .scaffold-layout__list-pagination'
    );

    if (paginationContainer && isSafePaginationElement(paginationContainer)) {
      const pageButtons = Array.from(paginationContainer.querySelectorAll('button, a')).filter(isSafePaginationElement);

      // 1A. Check for next page number button (e.g. "2" if current is 1)
      const targetBtn = pageButtons.find(b => {
        const txt = b.textContent?.trim();
        const aria = (b.getAttribute('aria-label') || '').toLowerCase();
        return txt === String(targetPageNum) || aria === `page ${targetPageNum}` || aria.includes(`page ${targetPageNum}`);
      });
      if (targetBtn && !targetBtn.disabled && targetBtn.getAttribute('aria-disabled') !== 'true') {
        log(`Navigating to Page ${targetPageNum} via page button...`, 'info');
        triggerClick(targetBtn);
        await sleep(3500);
        await scrollListToTop();
        return true;
      }

      // 1B. Check for "Next" / "Next >" button in container
      const nextBtn = pageButtons.find(b => {
        const txt = (b.innerText || b.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
        const aria = (b.getAttribute('aria-label') || '').toLowerCase();
        return b.classList.contains('artdeco-pagination__button--next') ||
               txt === 'next' || txt.startsWith('next') || txt === 'next >' ||
               aria === 'next' || aria.includes('next page') || aria === 'view next page';
      });
      if (nextBtn) {
        const isDisabled = nextBtn.disabled ||
                           nextBtn.getAttribute('aria-disabled') === 'true' ||
                           nextBtn.classList.contains('artdeco-button--disabled') ||
                           nextBtn.classList.contains('disabled');
        if (isDisabled) {
          log('Reached the last page of results (Next button is disabled).', 'info');
          return false;
        }
        log('Navigating to next page of results...', 'info');
        triggerClick(nextBtn);
        await sleep(3500);
        await scrollListToTop();
        return true;
      }
    }

    // Strategy 2: Direct Search for Page Number or "Next >" in Search/Main area
    const searchScope = document.querySelector('.scaffold-layout__list, main, [class*="search-results"]') || document;
    const candidateButtons = Array.from(searchScope.querySelectorAll('button, a')).filter(isSafePaginationElement);

    // 2A. Find Page Number button (e.g. "2")
    const docTargetBtn = candidateButtons.find(b => {
      const txt = b.textContent?.trim();
      const aria = (b.getAttribute('aria-label') || '').toLowerCase();
      return txt === String(targetPageNum) || aria === `page ${targetPageNum}` || aria.includes(`page ${targetPageNum}`);
    });
    if (docTargetBtn && !docTargetBtn.disabled && docTargetBtn.getAttribute('aria-disabled') !== 'true') {
      log(`Navigating to Page ${targetPageNum} via page number...`, 'info');
      triggerClick(docTargetBtn);
      await sleep(3500);
      await scrollListToTop();
      return true;
    }

    // 2B. Find "Next >" button
    const docNextBtn = candidateButtons.find(b => {
      const txt = (b.innerText || b.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const aria = (b.getAttribute('aria-label') || '').toLowerCase();
      return b.classList.contains('artdeco-pagination__button--next') ||
             txt === 'next' || txt.startsWith('next') || txt === 'next >' ||
             aria === 'next' || aria.includes('next page') || aria === 'view next page';
    });
    if (docNextBtn) {
      const isDisabled = docNextBtn.disabled ||
                         docNextBtn.getAttribute('aria-disabled') === 'true' ||
                         docNextBtn.classList.contains('artdeco-button--disabled') ||
                         docNextBtn.classList.contains('disabled');
      if (isDisabled) {
        log('Reached the last page of results (Next button is disabled).', 'info');
        return false;
      }
      log('Navigating to next page of results...', 'info');
      triggerClick(docNextBtn);
      await sleep(3500);
      await scrollListToTop();
      return true;
    }

    log('Reached the last page of results (no further pages found).', 'info');
    return false;
  }

  async function crawlCurrentPage(profile, settings, maxJobs, pageNum = 1) {
    // 1. Guarantee scroll is at the very top at the start of every page
    await scrollListToTop();

    const listContainer = getJobListContainer();
    const processedThisPage = new Set();
    let consecutiveNoNewCards = 0;
    let scrollCycles = 0;
    const MAX_PAGE_CYCLES = 35; // Maximum scrolling passes per page (sufficient for 25+ cards)

    while (!isHalted && scrollCycles < MAX_PAGE_CYCLES) {
      // 1. Check if session has been stopped or capped
      const freshData = await chrome.storage.local.get(['autoApplySession']);
      if (!freshData.autoApplySession?.isRunning) {
        isHalted = true;
        break;
      }
      const freshStats = freshData.autoApplySession?.stats || {};
      const totalProcessed = (freshStats.applied || 0) + (freshStats.saved || 0);
      if (maxJobs > 0 && totalProcessed >= maxJobs) {
        isHalted = true;
        break;
      }

      // 2. Query all job cards currently rendered in DOM
      const rawCards = getRenderedJobCards();

      // 3. Find cards not yet processed on this page
      const unprocessed = [];
      for (const card of rawCards) {
        const jid = extractCardJobId(card);
        const cardKey = jid ? String(jid) : (card.innerText?.slice(0, 50) || '');
        if (cardKey && !processedThisPage.has(cardKey)) {
          unprocessed.push({ card, cardKey });
        }
      }

      // 4. Process all newly rendered cards in this scroll segment
      if (unprocessed.length > 0) {
        consecutiveNoNewCards = 0;
        for (const item of unprocessed) {
          if (isHalted) break;

          processedThisPage.add(item.cardKey);

          const checkData = await chrome.storage.local.get(['autoApplySession']);
          if (!checkData.autoApplySession?.isRunning) {
            isHalted = true;
            break;
          }
          const checkStats = checkData.autoApplySession?.stats || {};
          if (maxJobs > 0 && ((checkStats.applied || 0) + (checkStats.saved || 0)) >= maxJobs) {
            isHalted = true;
            break;
          }

          try {
            const status = await processJobCard(item.card, profile, settings);
            if (status !== 'already_processed') {
              await humanDelay(settings.stepDelayMs || 1000);
            }
          } catch (cardErr) {
            log(`⚠️ Error evaluating card: ${cardErr.message}. Skipping to next job...`, 'warning');
            chrome.runtime.sendMessage({ action: 'UPDATE_STATS', delta: { skipped: 1, reason: 'unrecognized' } }).catch(() => {});
            try { item.card.style.outline = ''; } catch (_) {}
          }
        }
      } else {
        consecutiveNoNewCards++;
      }

      if (isHalted) break;

      // 5. Check if bottom of container has been reached
      const activeContainer = getJobListContainer();
      let isAtBottom = false;
      if (activeContainer && activeContainer !== window && activeContainer.scrollHeight > activeContainer.clientHeight) {
        isAtBottom = (activeContainer.scrollTop + activeContainer.clientHeight) >= (activeContainer.scrollHeight - 80);
      } else {
        const scrollY = window.scrollY || document.documentElement?.scrollTop || document.body?.scrollTop || 0;
        const innerH = window.innerHeight;
        const totalH = Math.max(document.documentElement?.scrollHeight || 0, document.body?.scrollHeight || 0);
        isAtBottom = (scrollY + innerH) >= (totalH - 120);
      }

      // Only finish the page if we have done at least 2 scroll cycles and have reached bottom with no new cards
      if (scrollCycles >= 2 && isAtBottom && consecutiveNoNewCards >= 2) {
        break;
      }

      // 6. Scroll down the list container to trigger lazy rendering of next card chunk
      scrollCycles++;
      const prevScroll = (activeContainer && activeContainer !== window && activeContainer.scrollTop) ? activeContainer.scrollTop : (window.scrollY || 0);
      if (activeContainer && activeContainer !== window) {
        if (activeContainer.scrollBy) {
          activeContainer.scrollBy({ top: 400, behavior: 'smooth' });
        } else if (activeContainer.scrollTop !== undefined) {
          activeContainer.scrollTop += 400;
        }
      }
      try { window.scrollBy({ top: 400, behavior: 'smooth' }); } catch (_) {}

      if (rawCards.length > 0) {
        try {
          rawCards[rawCards.length - 1].scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch (_) {}
      }

      await sleep(1200);

      // If scroll didn't move (reached end of scrollable area)
      const currScroll = (activeContainer && activeContainer !== window && activeContainer.scrollTop) ? activeContainer.scrollTop : (window.scrollY || 0);
      if (currScroll === prevScroll && unprocessed.length === 0) {
        consecutiveNoNewCards++;
        if (consecutiveNoNewCards >= 2 && scrollCycles >= 2) break;
      }
    }

    log(`✅ Completed Page ${pageNum}: Scanned ${processedThisPage.size} jobs.`, 'info');
    return processedThisPage.size;
  }

  async function runCrawlLoop() {
    if (isRunning) return;

    // Check tab authorization
    try {
      const auth = await new Promise(resolve => {
        chrome.runtime.sendMessage({ action: 'CHECK_CRAWLER_TAB' }, resp => {
          if (chrome.runtime.lastError) resolve({ isAllowed: false });
          else resolve(resp);
        });
        setTimeout(() => resolve({ isAllowed: false }), 2500);
      });
      if (!auth || !auth.isAllowed) {
        console.log('[LinkedIn Auto-Applier] Tab is not the active session tab. Crawler will remain idle.');
        return;
      }
    } catch (_) {
      return;
    }

    isRunning = true;
    isHalted = false;

    log('Starting LinkedIn Auto-Applier crawler loop...', 'info');
    await loadProcessedJobIds();

    try {
      const data = await chrome.storage.local.get(['userProfile', 'autoApplySession']);
      const profile = data.userProfile || {};
      const session = data.autoApplySession || {};
      const settings = session.settings || profile.autoApplierSettings || {};
      const maxJobs = settings.maxJobsPerSession || 0; // 0 = uncapped

      // Guard: If currently on a standalone /jobs/view/ page, redirect back to search results
      if (window.location.pathname.includes('/jobs/view')) {
        log('⚠️ Detected standalone job view page (/jobs/view/). Redirecting back to search results...', 'warning');
        updateFloatingPill('Redirecting to search page...');
        const currentQuery = session.queryQueue?.[session.currentQueryIndex] || settings.targetJobQuery || profile.work?.targetRole?.jobTitle || 'Data Analyst';
        const searchUrl = buildLinkedInSearchUrl(currentQuery, settings);
        chrome.runtime.sendMessage({ action: 'REDIRECT_TO_SEARCH' }).catch(() => {});
        await sleep(1500);
        window.location.href = searchUrl;
        return;
      }

      await scrollListToTop();
      let emptyWaitCount = 0;
      let currentPageNumber = detectCurrentPageNumber();

      while (!isHalted) {
        const currentData = await chrome.storage.local.get(['autoApplySession']);
        const currentStats = currentData.autoApplySession?.stats || { scanned: 0, applied: 0, saved: 0, skipped: 0 };
        const totalProcessed = (currentStats.applied || 0) + (currentStats.saved || 0);

        if (maxJobs > 0 && totalProcessed >= maxJobs) {
          log(`🎯 Session cap reached (${totalProcessed} jobs applied/saved).`, 'success');
          playAudioChime();
          chrome.runtime.sendMessage({ action: 'SESSION_COMPLETED', summary: currentStats }).catch(() => {});
          updateFloatingPill(`🎉 Completed ${totalProcessed} jobs!`, true);
          break;
        }

        // Standalone page guard inside loop
        if (window.location.pathname.includes('/jobs/view')) {
          log('⚠️ Detected standalone job view page (/jobs/view/). Redirecting back to search results...', 'warning');
          updateFloatingPill('Redirecting to search page...');
          const currentQuery = session.queryQueue?.[session.currentQueryIndex] || settings.targetJobQuery || profile.work?.targetRole?.jobTitle || 'Data Analyst';
          const searchUrl = buildLinkedInSearchUrl(currentQuery, settings);
          chrome.runtime.sendMessage({ action: 'REDIRECT_TO_SEARCH' }).catch(() => {});
          await sleep(1500);
          window.location.href = searchUrl;
          return;
        }

        // Check if job listings have rendered on the page
        const existingCards = getRenderedJobCards();

        if (existingCards.length === 0) {
          emptyWaitCount++;
          if (emptyWaitCount <= 4) {
            log(`Waiting for LinkedIn job listings to load (${emptyWaitCount}/4)...`, 'info');
            await sleep(2500);
            continue;
          }
          log('⚠️ No job listings found on this page after 4 attempts. Checking next steps...', 'warning');
          const hasNext = await navigateToNextPage(currentPageNumber);
          if (!hasNext) {
            log('No further pages found for current search query.', 'info');
            const finalData = await chrome.storage.local.get(['autoApplySession']);
            chrome.runtime.sendMessage({ action: 'QUERY_RESULTS_FINISHED', summary: finalData.autoApplySession?.stats }).catch(() => {});
            break;
          }
          emptyWaitCount = 0;
          currentPageNumber = detectCurrentPageNumber();
          continue;
        }

        emptyWaitCount = 0;

        log(`📄 Crawling search results Page ${currentPageNumber}...`, 'info');
        updateFloatingPill(`📄 Crawling Page ${currentPageNumber}...`);

        const scannedOnPage = await crawlCurrentPage(profile, settings, maxJobs, currentPageNumber);

        if (isHalted) break;

        const hasNext = await navigateToNextPage(currentPageNumber);
        if (!hasNext) {
          log('No further pages found for current search query.', 'info');
          const finalData = await chrome.storage.local.get(['autoApplySession']);
          chrome.runtime.sendMessage({ action: 'QUERY_RESULTS_FINISHED', summary: finalData.autoApplySession?.stats }).catch(() => {});
          break;
        }

        const detectedNext = detectCurrentPageNumber();
        if (detectedNext > currentPageNumber) {
          currentPageNumber = detectedNext;
        } else {
          currentPageNumber++;
        }
        await sleep(2500);
      }
    } catch (err) {
      log(`Error in crawl loop: ${err.message}`, 'error');
    } finally {
      isRunning = false;
      log('LinkedIn Auto-Applier crawler stopped.', 'info');
    }
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'HALT_SESSION') {
      isHalted = true;
      isRunning = false;
      isStalledForUser = false;
      removeFloatingPill();
      log('Session halted by user request.', 'warning');
      sendResponse({ status: 'halted' });
      return true;
    }
    if (request.action === 'PLAY_ALERT_CHIME') {
      playAudioChime();
      sendResponse({ status: 'played' });
      return true;
    }
  });

  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.autoApplySession) {
      const newSession = changes.autoApplySession.newValue;
      if (newSession && newSession.isRunning && !isRunning) {
        runCrawlLoop();
      } else if (newSession && !newSession.isRunning && isRunning) {
        isHalted = true;
      }
    }
  });

  chrome.storage.local.get(['autoApplySession'], (res) => {
    if (res?.autoApplySession?.isRunning) {
      log('Resuming active auto-apply session on page load...', 'info');
      setTimeout(runCrawlLoop, 2000);
    }
  });

  console.log('[LinkedIn Auto-Applier] Core applier engine loaded.');
})();
