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

  async function loadProcessedJobIds() {
    try {
      const data = await chrome.storage.local.get(['autoApplySession']);
      const list = data?.autoApplySession?.processedJobIds || [];
      processedJobIds.clear();
      list.forEach(id => processedJobIds.add(String(id)));
    } catch (_) {}
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
      el.focus();
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      el.click();
    } catch (_) {
      el.click();
    }
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
    if (/\b(senior|sr\.|lead|manager|principal|architect|director|head of)\b/i.test(title)) {
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

  function inspectApplyButton(detailsPane) {
    const scope = detailsPane || document;

    // 1. Easy Apply button
    const easyApplyBtn = scope.querySelector(
      'button.jobs-apply-button, button[data-job-id][aria-label*="Easy Apply"], button[aria-label*="Easy Apply"], .jobs-apply-button--top-card button'
    );

    if (easyApplyBtn) {
      const txt = (easyApplyBtn.textContent || easyApplyBtn.getAttribute('aria-label') || '').toLowerCase();
      if (txt.includes('easy apply')) {
        return { type: 'easy_apply', element: easyApplyBtn };
      }
    }

    // Check by inner text
    const allButtons = Array.from(scope.querySelectorAll('button, a')).filter(el => el.offsetWidth > 0 && el.offsetHeight > 0);
    const textEasyApply = allButtons.find(b => {
      const t = (b.textContent || b.getAttribute('aria-label') || '').toLowerCase().trim();
      return t.includes('easy apply');
    });
    if (textEasyApply) {
      return { type: 'easy_apply', element: textEasyApply };
    }

    // 2. External Apply button
    const extApply = allButtons.find(b => {
      const t = (b.textContent || b.getAttribute('aria-label') || '').toLowerCase().trim();
      return t.includes('apply on company website') || t.includes('apply to') || t === 'apply';
    });

    if (extApply) {
      const url = extApply.href || extApply.getAttribute('href') || window.location.href;
      return { type: 'company_site', element: extApply, url };
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
        if (el && el.offsetWidth > 0 && el.offsetHeight > 0) {
          saveBtn = el;
          break;
        }
      } catch (_) {}
    }

    if (!saveBtn) {
      const allButtons = Array.from(container.querySelectorAll('button')).filter(b => b.offsetWidth > 0 && b.offsetHeight > 0);
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
    const titleEl = scope.querySelector('.job-details-jobs-unified-top-card__job-title, h2.job-details-jobs-unified-top-card__job-title, h1, h2') ||
                    card.querySelector('a.job-card-list__title--link, a.job-card-container__link, [data-control-name="job_card_click"]');
    const jobTitle = titleEl ? titleEl.textContent.trim() : 'Unknown Role';

    // Company
    let company = '';
    const companyEl = scope.querySelector('.job-details-jobs-unified-top-card__company-name, .jobs-unified-top-card__company-name, a[href*="/company/"]');
    if (companyEl && companyEl.textContent.trim()) {
      company = companyEl.textContent.trim();
    } else {
      const cardCompany = card.querySelector('.job-card-container__primary-description, .job-card-container__company-name, a.job-card-container__company-name');
      if (cardCompany && cardCompany.textContent.trim()) {
        company = cardCompany.textContent.trim();
      }
    }

    // Location
    let location = '';
    const cardLocEl = card.querySelector('.job-card-container__metadata-item, .job-card-list__location, ul.job-card-container__metadata-wrapper li, [class*="metadata-item"], [class*="job-card-container__metadata"]');
    if (cardLocEl && cardLocEl.textContent.trim()) {
      location = cardLocEl.textContent.trim();
    }

    const primaryDescEl = scope.querySelector('.job-details-jobs-unified-top-card__primary-description, .jobs-unified-top-card__primary-description, .job-details-jobs-unified-top-card__subtitle');
    if (primaryDescEl) {
      const rawDesc = primaryDescEl.textContent || '';
      const parts = rawDesc.split(/[·•|]/).map(s => s.trim()).filter(Boolean);
      if (!company && parts.length > 0) {
        company = parts[0];
      }
      if ((!location || location === 'Unknown Location') && parts.length > 1) {
        const candidateLoc = parts.find(p => !p.toLowerCase().includes('ago') && !p.toLowerCase().includes('applicant') && !p.toLowerCase().includes('promoted') && p !== company);
        if (candidateLoc) {
          location = candidateLoc;
        }
      }
    }

    if (!location || location === 'Unknown Location') {
      const locSpan = scope.querySelector('.job-details-jobs-unified-top-card__bullet ~ span, [class*="workplace-type"], .jobs-unified-top-card__bullet ~ span');
      if (locSpan && locSpan.textContent.trim()) {
        location = locSpan.textContent.trim();
      }
    }

    if (!company) company = 'Unknown Company';
    if (!location) location = 'Unknown Location';

    return { jobTitle, company, location };
  }

  async function waitForJobDetails(card, maxWaitMs = 3000) {
    const start = Date.now();
    await sleep(400);

    while (Date.now() - start < maxWaitMs) {
      const detailsPane = document.querySelector('.jobs-search__job-details, .jobs-description__content, #job-details, .job-view-layout');
      const desc = document.querySelector('#job-details, .jobs-description__content, .jobs-box__html-content');

      if (desc && desc.textContent.trim().length > 30) {
        return { detailsPane, desc };
      }
      await sleep(200);
    }
    return {
      detailsPane: document.querySelector('.jobs-search__job-details, .jobs-description__content, #job-details'),
      desc: document.querySelector('#job-details, .jobs-description__content')
    };
  }

  async function executeEasyApplyFlow(profile, settings) {
    log('Waiting for Easy Apply modal to load...', 'info');
    await sleep(2000);

    const maxSteps = 15;
    let stepCount = 0;
    let consecutiveUnchanged = 0;

    while (stepCount < maxSteps) {
      if (isHalted) return { success: false, reason: 'halted' };
      stepCount++;

      const modal = window.LinkedInAutoFormFiller?.getModal();
      if (!modal) {
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
      if (window.LinkedInAutoFormFiller?.isApplicationSubmitted(modal)) {
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
          const currentModal = window.LinkedInAutoFormFiller?.getModal();
          if (!currentModal || window.LinkedInAutoFormFiller?.isApplicationSubmitted(currentModal)) {
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
      const advRes = await window.LinkedInAutoFormFiller?.advanceOrSubmit(modal, settings);
      if (advRes?.action === 'submitted') {
        log('Clicked Submit application button!', 'info');
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

  async function processJobCard(card, profile, settings) {
    if (isHalted) return 'halted';

    // 1. Extract job ID
    const jobId = card.getAttribute('data-job-id') ||
                  card.getAttribute('data-occludable-job-id') ||
                  card.querySelector('[data-job-id]')?.getAttribute('data-job-id') ||
                  card.querySelector('a[href*="/jobs/view/"]')?.href?.match(/\/jobs\/view\/(\d+)/)?.[1] ||
                  `li_job_${Date.now()}`;

    // Fast Skip: Already processed in local session history
    if (processedJobIds.has(String(jobId))) {
      return 'already_processed';
    }

    await persistProcessedJobId(jobId);

    // Fast Skip: Already Applied badge on LinkedIn card
    const isAlreadyAppliedOnLinkedIn = card.querySelector('.job-card-container__footer-job-state, [data-test-job-card-applied]') ||
      Array.from(card.querySelectorAll('span, li, div')).some(el => {
        const t = (el.textContent || '').trim().toLowerCase();
        return t === 'applied' || t.startsWith('applied ');
      });

    if (isAlreadyAppliedOnLinkedIn) {
      log(`⏭️ Skipped: Job #${jobId} already applied on LinkedIn.`, 'info');
      chrome.runtime.sendMessage({ action: 'UPDATE_STATS', delta: { skipped: 1, reason: 'already_applied' } }).catch(() => {});
      return 'skipped_already_applied';
    }

    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const originalOutline = card.style.outline;
    card.style.outline = '2px solid #0a66c2';

    // Click card to load right-side details
    const clickable = card.querySelector('a.job-card-list__title--link, a.job-card-container__link, a[data-control-name="job_card_click"]') || card;
    triggerClick(clickable);

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
      const targetQuery = (settings?.targetJobQuery || profile?.work?.targetRole?.jobTitle || 'Data Analyst').toLowerCase().trim();
      const titleLower = (jobTitle || '').toLowerCase();

      // If user is searching for an Analyst role, title MUST be an Analyst / Analytics / BI / Intelligence role
      if (targetQuery.includes('analyst') || targetQuery.includes('analytics')) {
        const isAnalystRole = /\b(analyst|analytics|analysis|bi\b|business intelligence|reporting|insights|mis\b)/i.test(titleLower);
        if (!isAnalystRole) {
          log(`🎯 Skipped: "${jobTitle}" does not contain target "Analyst" role keywords (Title Relevance Filter).`, 'info');
          chrome.runtime.sendMessage({ action: 'UPDATE_STATS', delta: { skipped: 1, reason: 'title_relevance' } }).catch(() => {});
          card.style.outline = originalOutline;
          return 'skipped_title_relevance';
        }
      } else {
        // Generic target: extract main query keywords (minimum 3 chars, skip filler words)
        const filler = ['and', 'the', 'for', 'with', 'remote', 'in', 'at', 'jobs', 'job'];
        const targetTokens = targetQuery.split(/\s+/).map(t => t.replace(/[^a-z0-9]/g, '')).filter(t => t.length > 2 && !filler.includes(t));
        const hasTokenMatch = targetTokens.some(tok => titleLower.includes(tok));
        if (!hasTokenMatch && targetTokens.length > 0) {
          log(`🎯 Skipped: "${jobTitle}" does not match target keywords from "${targetQuery}" (Title Relevance Filter).`, 'info');
          chrome.runtime.sendMessage({ action: 'UPDATE_STATS', delta: { skipped: 1, reason: 'title_relevance' } }).catch(() => {});
          card.style.outline = originalOutline;
          return 'skipped_title_relevance';
        }
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
      const targetTokens = rawTarget.split(/[,|]/).map(t => t.trim()).filter(t => t.length > 2);
      const isRemote = locLower.includes('remote') || fullText.toLowerCase().includes('remote') || fullText.toLowerCase().includes('work from home');

      let isCityMatch = targetTokens.length === 0;
      if (!isCityMatch) {
        if (targetTokens.includes('india') || rawTarget === 'india' || rawTarget === 'all india') {
          isCityMatch = true;
        } else {
          isCityMatch = targetTokens.some(t => {
            if (t === 'bangalore' || t === 'bengaluru') {
              return locLower.includes('bangalore') || locLower.includes('bengaluru');
            }
            if (t === 'delhi' || t === 'ncr' || t === 'gurgaon' || t === 'gurugram' || t === 'noida') {
              return locLower.includes('delhi') || locLower.includes('ncr') || locLower.includes('gurgaon') || locLower.includes('gurugram') || locLower.includes('noida');
            }
            return locLower.includes(t);
          });
        }
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

    // 2. Seniority Tag Check (LinkedIn official badge)
    const lowerBadge = badgeText.toLowerCase();
    if (lowerBadge.includes('mid-senior') || lowerBadge.includes('director') || lowerBadge.includes('executive')) {
      if (!/\b(junior|jr\.|trainee|associate)\b/i.test(jobTitle)) {
        log(`⏭️ Skipped: "${jobTitle}" has senior LinkedIn level (${badgeText}).`, 'info');
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
    const applyInfo = inspectApplyButton(scope);

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

      const result = await executeEasyApplyFlow(profile, settings);
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

  async function navigateToNextPage() {
    log('Searching for Next Page of job results...', 'info');

    // Smooth scroll down the jobs list to make sure all items and pagination are loaded
    const listContainer = document.querySelector('.jobs-search-results-list, .scaffold-layout__list-container') || window;
    if (listContainer.scrollTo) {
      listContainer.scrollTo({ top: listContainer.scrollHeight || 10000, behavior: 'smooth' });
    }
    await sleep(1500);

    const nextBtn = document.querySelector(
      '.artdeco-pagination__button--next, button[aria-label="Next"], button[aria-label="View next page"], .artdeco-pagination__pages button.selected + button'
    );

    if (nextBtn) {
      if (nextBtn.disabled || nextBtn.getAttribute('aria-disabled') === 'true' || nextBtn.classList.contains('disabled')) {
        log('Reached the last page of results.', 'info');
        return false;
      }

      log('Navigating to next page of results...', 'info');
      triggerClick(nextBtn);
      await sleep(3500);
      return true;
    }

    return false;
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

        // Scroll job list container to trigger lazy loading of cards
        const listContainer = document.querySelector('.jobs-search-results-list, .scaffold-layout__list-container');
        if (listContainer) {
          listContainer.scrollTop += 500;
          await sleep(500);
        }

        const rawCards = Array.from(document.querySelectorAll(
          '.jobs-search-results-list li, div.job-card-container, div[data-job-id], li.jobs-search-results__list-item'
        )).filter(c => c.offsetWidth > 0 && c.offsetHeight > 0);

        // Deduplicate cards by job ID
        const seenIdsThisLoop = new Set();
        const cards = [];
        for (const c of rawCards) {
          const jid = c.getAttribute('data-job-id') ||
                      c.getAttribute('data-occludable-job-id') ||
                      c.querySelector('[data-job-id]')?.getAttribute('data-job-id') ||
                      c.querySelector('a[href*="/jobs/view/"]')?.href?.match(/\/jobs\/view\/(\d+)/)?.[1];
          if (jid) {
            if (!seenIdsThisLoop.has(jid)) {
              seenIdsThisLoop.add(jid);
              cards.push(c);
            }
          } else {
            cards.push(c);
          }
        }

        if (cards.length === 0) {
          log('Waiting for LinkedIn job listings to load...', 'warning');
          await sleep(3000);
          continue;
        }

        for (const card of cards) {
          if (isHalted) break;

          const freshData = await chrome.storage.local.get(['autoApplySession']);
          if (!freshData.autoApplySession?.isRunning) {
            isHalted = true;
            break;
          }

          const freshStats = freshData.autoApplySession?.stats || {};
          if (maxJobs > 0 && (freshStats.applied || 0) + (freshStats.saved || 0) >= maxJobs) {
            isHalted = true;
            break;
          }

          try {
            const status = await processJobCard(card, profile, settings);
            if (status !== 'already_processed') {
              await humanDelay(settings.stepDelayMs || 1000);
            }
          } catch (cardErr) {
            log(`⚠️ Error evaluating card: ${cardErr.message}. Skipping to next job...`, 'warning');
            chrome.runtime.sendMessage({ action: 'UPDATE_STATS', delta: { skipped: 1, reason: 'unrecognized' } }).catch(() => {});
            try { card.style.outline = ''; } catch (_) {}
          }
        }

        if (isHalted) break;

        const hasNext = await navigateToNextPage();
        if (!hasNext) {
          log('No further pages found for current search query.', 'info');
          const finalData = await chrome.storage.local.get(['autoApplySession']);
          chrome.runtime.sendMessage({ action: 'QUERY_RESULTS_FINISHED', summary: finalData.autoApplySession?.stats }).catch(() => {});
          break;
        }
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
