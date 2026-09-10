/**
 * LinkedIn Auto-Applier - Form Filler Engine
 * Handles React synthetic event dispatching, Easy Apply modal multi-step progression,
 * unchecking "Follow company", CAPTCHA detection, and safe pause on unknown questions.
 */

(function () {
  if (typeof window !== 'undefined' && window.LinkedInAutoFormFiller) return;

  function setNativeValue(element, value) {
    if (!element) return;
    const stringVal = String(value ?? '');
    const previousValue = element.value;

    let valueSetter = null;
    const docWin = (element.ownerDocument && element.ownerDocument.defaultView) || window;

    if (element.tagName === 'INPUT') {
      const proto = docWin.HTMLInputElement ? docWin.HTMLInputElement.prototype : Object.getPrototypeOf(element);
      valueSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    } else if (element.tagName === 'TEXTAREA') {
      const proto = docWin.HTMLTextAreaElement ? docWin.HTMLTextAreaElement.prototype : Object.getPrototypeOf(element);
      valueSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    } else if (element.tagName === 'SELECT') {
      const proto = docWin.HTMLSelectElement ? docWin.HTMLSelectElement.prototype : Object.getPrototypeOf(element);
      valueSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    }

    if (valueSetter) {
      valueSetter.call(element, stringVal);
    } else {
      element.value = stringVal;
    }

    if (element._valueTracker && typeof element._valueTracker.setValue === 'function') {
      element._valueTracker.setValue(previousValue);
      element._valueTracker.setValue(stringVal);
    }
  }

  function setNativeChecked(element, checked = true) {
    if (!element || element.tagName !== 'INPUT') return;
    const previousChecked = element.checked;
    const docWin = (element.ownerDocument && element.ownerDocument.defaultView) || window;
    const proto = docWin.HTMLInputElement ? docWin.HTMLInputElement.prototype : Object.getPrototypeOf(element);
    const checkedSetter = Object.getOwnPropertyDescriptor(proto, 'checked')?.set;

    if (checkedSetter) {
      try {
        checkedSetter.call(element, checked);
      } catch (_) {}
    }
    element.checked = checked;

    if (element._valueTracker && typeof element._valueTracker.setValue === 'function') {
      element._valueTracker.setValue(previousChecked);
    }
  }

  function dispatchReactInput(element, value) {
    if (!element) return false;
    const docWin = (element.ownerDocument && element.ownerDocument.defaultView) || window;
    const FocusEvt = docWin.FocusEvent || Event;
    const InputEvt = docWin.InputEvent || Event;
    const Evt = docWin.Event || Event;

    if (typeof element.focus === 'function') element.focus();
    element.dispatchEvent(new FocusEvt('focus', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new FocusEvt('focusin', { bubbles: true, cancelable: true }));

    setNativeValue(element, value);

    element.dispatchEvent(new InputEvt('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: String(value) }));
    element.dispatchEvent(new Evt('change', { bubbles: true, cancelable: true }));

    element.dispatchEvent(new FocusEvt('blur', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new FocusEvt('focusout', { bubbles: true, cancelable: true }));
    if (typeof element.blur === 'function') element.blur();
    return true;
  }

  function dispatchReactClick(element) {
    if (!element) return;
    const docWin = (element.ownerDocument && element.ownerDocument.defaultView) || window;
    const MouseEvt = docWin.MouseEvent || Event;

    if (typeof element.focus === 'function') element.focus();
    element.dispatchEvent(new MouseEvt('mousedown', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new MouseEvt('mouseup', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new MouseEvt('click', { bubbles: true, cancelable: true }));
    if (typeof element.click === 'function') element.click();
  }

  function dispatchReactRadio(radio) {
    if (!radio) return;
    setNativeChecked(radio, true);
    dispatchReactClick(radio);
    radio.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function dispatchReactSelect(select, targetValue) {
    if (!select) return false;
    const target = String(targetValue).toLowerCase().trim();
    let matchedOption = null;

    for (const option of select.options) {
      const optText = (option.textContent || '').toLowerCase().trim();
      const optVal = (option.value || '').toLowerCase().trim();
      if (!optText && !optVal) continue;
      if (optVal === '' && optText.includes('select')) continue;

      if (optText === target || optVal === target || optText.includes(target) || target.includes(optText)) {
        matchedOption = option;
        break;
      }
    }

    if (matchedOption) {
      setNativeValue(select, matchedOption.value);
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    return false;
  }

  const FormFiller = {
    getModal(documentRef = document) {
      const doc = documentRef || document;
      return doc.querySelector('.jobs-easy-apply-modal') ||
        doc.querySelector('div.artdeco-modal[role="dialog"]') ||
        doc.querySelector('div[role="dialog"]:has(.jobs-easy-apply-content)') ||
        doc.querySelector('div[role="dialog"]:has([data-easy-apply-next-button])') ||
        null;
    },

    checkCaptcha(documentRef = document) {
      const doc = documentRef || document;
      const captchaSelectors = [
        '#recaptcha-element',
        '.captcha-challenge',
        'iframe[title="reCAPTCHA"]',
        '#captcha-container',
        '.challenge-dialog',
        'iframe[src*="captcha"]',
        'iframe[src*="arkoselabs"]'
      ];
      for (const sel of captchaSelectors) {
        const el = doc.querySelector(sel);
        if (el && el.offsetWidth > 0 && el.offsetHeight > 0) return true;
      }
      return false;
    },

    isApplicationSubmitted(modalEl = null, documentRef = document) {
      const doc = documentRef || document;
      const modal = modalEl || this.getModal(doc);

      // Check for success modal / toast / alert
      const successIndicators = [
        'div[data-test-modal-id="easy-apply-success"]',
        '.artdeco-modal:has(.artdeco-inline-feedback--success)',
        'div.jobs-easy-apply-modal:has([data-test-easy-apply-success])'
      ];

      for (const sel of successIndicators) {
        if (doc.querySelector(sel)) return true;
      }

      if (modal) {
        const text = (modal.innerText || modal.textContent || '').toLowerCase();
        if (text.includes('application sent') || text.includes('your application was sent') || text.includes('application was submitted') || text.includes('applied on linkedin')) {
          return true;
        }
      }

      const bodyText = (doc.body.innerText || '').toLowerCase();
      if (bodyText.includes('your application was sent to') && !modal) {
        return true;
      }

      return false;
    },

    closeModal(documentRef = document) {
      const doc = documentRef || document;
      const modal = this.getModal(doc);

      // 1. Check for Done / Dismiss button on success modal
      const doneBtn = doc.querySelector('button[aria-label="Dismiss"], button[data-control-name="discard_application_confirm_btn"], button.artdeco-modal__dismiss, button[data-test-modal-close-btn]');
      if (doneBtn) {
        dispatchReactClick(doneBtn);
        return;
      }

      if (modal) {
        const dismissBtn = modal.querySelector('button[aria-label="Dismiss"], button.artdeco-modal__dismiss');
        if (dismissBtn) {
          dispatchReactClick(dismissBtn);
          // Confirm discard if prompt appears
          setTimeout(() => {
            const discardBtn = doc.querySelector('button[data-control-name="discard_application_confirm_btn"], button[data-test-dialog-primary-btn]');
            if (discardBtn) dispatchReactClick(discardBtn);
          }, 300);
        }
      }
    },

    uncheckFollowCompany(modalEl) {
      if (!modalEl) return;
      const checkboxes = Array.from(modalEl.querySelectorAll('input[type="checkbox"]'));
      for (const cb of checkboxes) {
        const labelEl = modalEl.querySelector(`label[for="${cb.id}"]`) || cb.closest('label') || cb.closest('div');
        const text = (labelEl ? labelEl.textContent : '').toLowerCase();
        if (text.includes('follow') && cb.checked) {
          setNativeChecked(cb, false);
          dispatchReactClick(cb);
          cb.dispatchEvent(new Event('change', { bubbles: true }));
          console.log('[FormFiller] Unchecked "Follow company" box.');
        }
      }
    },

    fillCurrentStep(profile, settings = {}) {
      const modal = this.getModal();
      if (!modal) return { filled: 0, unhandledRequired: [] };

      const matcher = window.LinkedInAutoMatcher;
      let filled = 0;
      const unhandledRequired = [];

      // Always uncheck follow company if setting enabled
      if (settings.uncheckFollowCompany !== false) {
        this.uncheckFollowCompany(modal);
      }

      const containers = Array.from(modal.querySelectorAll(
        '.fb-dash-form-element, .jobs-easy-apply-form-element, .artdeco-form-element, fieldset, div[role="radiogroup"], div[data-test-form-element]'
      ));
      const targetContainers = containers.length > 0 ? containers : [modal];

      const processedInputs = new Set();

      for (const container of targetContainers) {
        // 1. Radios
        const radios = Array.from(container.querySelectorAll('input[type="radio"]'));
        if (radios.length > 0) {
          if (!radios.some(r => processedInputs.has(r))) {
            radios.forEach(r => processedInputs.add(r));
            const anyChecked = radios.some(r => r.checked);
            if (!anyChecked) {
              const legend = matcher ? matcher.extractFieldLabel(container, radios[0]) : '';
              const match = matcher ? matcher.findBestMatch(legend, profile, profile.screening) : null;
              let targetVal = match ? String(match.value).toLowerCase() : null;

              if (targetVal === 'true') targetVal = 'yes';
              if (targetVal === 'false') targetVal = 'no';

              if (!targetVal) {
                const lowerLeg = legend.toLowerCase();
                if (lowerLeg.includes('authorized to work') || lowerLeg.includes('legally authorized')) targetVal = 'yes';
                else if (lowerLeg.includes('sponsorship')) targetVal = 'no';
                else if (lowerLeg.includes('relocate') || lowerLeg.includes('commute')) targetVal = 'yes';
              }

              if (targetVal) {
                let bestRadio = null;
                let maxScore = -1;
                radios.forEach(radio => {
                  const rLabel = container.querySelector(`label[for="${matcher?.escapeId(radio.id || '')}"]`)?.textContent || radio.value || '';
                  const score = matcher ? matcher.calculateSimilarity(rLabel, targetVal) : (rLabel.toLowerCase().includes(targetVal) ? 1 : 0);
                  if (score > maxScore) {
                    maxScore = score;
                    bestRadio = radio;
                  }
                });

                if (bestRadio && maxScore >= 0.35) {
                  dispatchReactRadio(bestRadio);
                  filled++;
                } else {
                  unhandledRequired.push({ type: 'radio', label: legend, element: container });
                }
              } else {
                unhandledRequired.push({ type: 'radio', label: legend, element: container });
              }
            }
          }
          continue;
        }

        // 2. Selects
        const selects = Array.from(container.querySelectorAll('select'));
        for (const select of selects) {
          if (!processedInputs.has(select)) {
            processedInputs.add(select);
            if (!select.value || select.value === '') {
              const label = matcher ? matcher.extractFieldLabel(container, select) : '';
              const match = matcher ? matcher.findBestMatch(label, profile, profile.screening) : null;
              if (match && match.value) {
                const ok = dispatchReactSelect(select, String(match.value));
                if (ok) filled++;
                else if (select.required || select.getAttribute('aria-required') === 'true') {
                  unhandledRequired.push({ type: 'select', label, element: select });
                }
              } else if (select.required || select.getAttribute('aria-required') === 'true') {
                unhandledRequired.push({ type: 'select', label, element: select });
              }
            }
          }
        }

        // 3. Text, number, tel, email inputs and textareas
        const inputs = Array.from(container.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], input[type="number"], input[type="url"], textarea'));
        for (const input of inputs) {
          if (!processedInputs.has(input)) {
            processedInputs.add(input);
            if (!input.value || input.value.trim() === '') {
              const label = matcher ? matcher.extractFieldLabel(container, input) : '';
              const match = matcher ? matcher.findBestMatch(label, profile, profile.screening) : null;
              if (match && match.value !== undefined && match.value !== null) {
                dispatchReactInput(input, match.value);
                filled++;
              } else {
                const isReq = input.required || input.hasAttribute('required') || input.getAttribute('aria-required') === 'true';
                if (isReq) {
                  unhandledRequired.push({ type: 'input', label, element: input });
                }
              }
            }
          }
        }
      }

      return { filled, unhandledRequired };
    },

    findActionButtons(modalEl) {
      if (!modalEl) return { btnNext: null, btnReview: null, btnSubmit: null };
      const footer = modalEl.querySelector('.jobs-easy-apply-footer, footer, .artdeco-modal__actionbar');
      const searchScope = footer || modalEl;

      const isVisible = (b) => b && b.offsetWidth > 0 && b.offsetHeight > 0;

      let btnNext = searchScope.querySelector('button[data-easy-apply-next-button], button[aria-label*="Continue to next step"], button[aria-label*="Continue"], #btn-next');
      let btnReview = searchScope.querySelector('button[aria-label*="Review your application"], button[aria-label*="Review"], #btn-review');
      let btnSubmit = searchScope.querySelector('button[aria-label*="Submit application"], #btn-submit');

      if (btnNext && !isVisible(btnNext)) btnNext = null;
      if (btnReview && !isVisible(btnReview)) btnReview = null;
      if (btnSubmit && !isVisible(btnSubmit)) btnSubmit = null;

      if (btnNext || btnReview || btnSubmit) {
        return { btnNext, btnReview, btnSubmit };
      }

      const allButtons = Array.from(searchScope.querySelectorAll('button')).filter(isVisible);
      for (const btn of allButtons) {
        const text = `${btn.innerText || btn.textContent || ''} ${btn.getAttribute('aria-label') || ''}`.toLowerCase();
        if (text.includes('back') || text.includes('previous') || text.includes('cancel') || text.includes('dismiss') || text.includes('discard') || text.includes('close')) continue;

        if (!btnSubmit && text.includes('submit')) btnSubmit = btn;
        else if (!btnReview && text.includes('review')) btnReview = btn;
        else if (!btnNext && (text.includes('next') || text.includes('continue') || text.includes('proceed'))) btnNext = btn;
      }

      return { btnNext, btnReview, btnSubmit };
    },

    async advanceOrSubmit(modalEl, settings = {}) {
      const modal = modalEl || this.getModal();
      if (!modal) return { action: 'none' };

      const { btnNext, btnReview, btnSubmit } = this.findActionButtons(modal);

      if (btnSubmit) {
        if (settings.autoSubmit === false) {
          return { action: 'review_pause' };
        }
        dispatchReactClick(btnSubmit);
        return { action: 'submitted' };
      }

      if (btnReview) {
        dispatchReactClick(btnReview);
        return { action: 'advanced' };
      }

      if (btnNext) {
        dispatchReactClick(btnNext);
        return { action: 'advanced' };
      }

      return { action: 'none' };
    }
  };

  window.LinkedInAutoFormFiller = FormFiller;
})();
