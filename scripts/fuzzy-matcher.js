/**
 * LinkedIn Auto-Applier - Fuzzy Matcher Engine
 * Normalizes labels, matches user profile fields and custom screening Q&A bank.
 */

(function () {
  if (typeof window !== 'undefined' && window.LinkedInAutoMatcher) return;

  const CANONICAL_PROFILE_MAP = [
    {
      key: 'fullName',
      patterns: ['full name', 'first and last name', 'your name', 'legal name', 'complete name', 'name']
    },
    {
      key: 'firstName',
      patterns: ['first name', 'given name']
    },
    {
      key: 'lastName',
      patterns: ['last name', 'surname', 'family name']
    },
    {
      key: 'email',
      patterns: ['email', 'email address', 'contact email', 'e-mail']
    },
    {
      key: 'phone',
      patterns: ['phone', 'mobile phone number', 'phone number', 'contact number', 'telephone', 'mobile']
    },
    {
      key: 'city',
      patterns: ['city', 'current city', 'location city']
    },
    {
      key: 'state',
      patterns: ['state', 'province', 'region', 'state/province']
    },
    {
      key: 'country',
      patterns: ['country', 'country/region', 'nation']
    },
    {
      key: 'location',
      patterns: ['location', 'city state', 'current location', 'address', 'city, state', 'city, state / location']
    },
    {
      key: 'linkedinUrl',
      patterns: ['linkedin profile', 'linkedin url', 'linkedin link', 'profile url', 'linkedin', 'linkedin profile url']
    },
    {
      key: 'githubUrl',
      patterns: ['github', 'github profile', 'github url', 'github link', 'portfolio', 'website']
    },
    {
      key: 'currentCompany',
      patterns: ['current company', 'current employer', 'present company', 'company name', 'most recent company', 'employer']
    },
    {
      key: 'currentJobTitle',
      patterns: ['job title', 'current role', 'present role', 'current title', 'designation', 'position']
    },
    {
      key: 'yearsExperience',
      patterns: ['years of experience', 'overall experience', 'total experience', 'how many years of experience', 'experience in years', 'years of relevant experience']
    },
    {
      key: 'expectedSalary',
      patterns: ['expected ctc', 'desired ctc', 'ctc expectation', 'ctc (expected)', 'expected salary', 'desired salary', 'expected compensation', 'target salary', 'salary expectation', 'expected ctc in lpa', 'expected ctc (lpa)']
    },
    {
      key: 'currentSalary',
      patterns: ['current ctc', 'present ctc', 'fixed ctc', 'ctc (current)', 'current salary', 'present salary', 'ctc', 'current compensation', 'current ctc in lpa', 'ctc in lpa', 'current ctc (lpa)']
    },
    {
      key: 'noticePeriod',
      patterns: ['notice period', 'notice period in days', 'in how many days can you join', 'how many days can you join', 'how soon can you join', 'availability', 'joining period', 'serving notice', 'notice period (in days)', 'notice period (days)', 'notice period in months']
    },
    {
      key: 'workAuthorization',
      patterns: ['legally authorized to work', 'work authorization', 'authorized to work in', 'eligible to work', 'legal right to work', 'are you legally authorized']
    },
    {
      key: 'sponsorshipRequired',
      patterns: ['require sponsorship', 'sponsorship for employment', 'visa status', 'future sponsorship', 'h1b sponsorship', 'will you now or in the future require sponsorship']
    },
    {
      key: 'degree',
      patterns: ['degree', 'qualification', 'bachelor', 'master', 'education degree', 'highest level of education', 'degree level', 'degree achieved', 'education']
    },
    {
      key: 'major',
      patterns: ['major', 'field of study', 'specialization', 'department', 'discipline', 'area of study']
    },
    {
      key: 'university',
      patterns: ['school', 'university', 'college', 'institution', 'school name', 'educational institution']
    },
    {
      key: 'graduationYear',
      patterns: ['graduation year', 'year of graduation', 'completion year', 'year of passing', 'end year']
    }
  ];

  class FuzzyMatcherEngine {
    constructor(confidenceThreshold = 0.65) {
      this.confidenceThreshold = confidenceThreshold;
    }

    escapeId(id) {
      if (!id) return '';
      if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
        return CSS.escape(id);
      }
      return id.replace(/([!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');
    }

    normalizeString(str) {
      if (!str) return '';
      return str
        .toLowerCase()
        .replace(/[^\w\s]/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
    }

    calculateSimilarity(str1, str2) {
      if (!str1 || !str2) return 0;
      const s1 = str1.toLowerCase().trim();
      const s2 = str2.toLowerCase().trim();

      if (s1 === s2) return 1.0;

      const subScore = (s1.includes(s2) || s2.includes(s1)) ? 0.85 : 0;

      // Levenshtein distance
      const track = Array(s2.length + 1).fill(null).map(() => Array(s1.length + 1).fill(null));
      for (let i = 0; i <= s1.length; i += 1) track[0][i] = i;
      for (let j = 0; j <= s2.length; j += 1) track[j][0] = j;

      for (let j = 1; j <= s2.length; j += 1) {
        for (let i = 1; i <= s1.length; i += 1) {
          const indicator = s1[i - 1] === s2[j - 1] ? 0 : 1;
          track[j][i] = Math.min(
            track[j][i - 1] + 1,
            track[j - 1][i] + 1,
            track[j - 1][i - 1] + indicator
          );
        }
      }
      const distance = track[s2.length][s1.length];
      const maxLen = Math.max(s1.length, s2.length);
      const levScore = maxLen > 0 ? (1 - distance / maxLen) : 0;

      // Token set overlap
      const tokensLabel = new Set(s1.split(/\s+/).filter(t => t.length > 2));
      const tokensPattern = new Set(s2.split(/\s+/).filter(t => t.length > 2));

      let intersection = 0;
      tokensPattern.forEach(t => {
        if (tokensLabel.has(t)) intersection++;
      });

      const union = new Set([...tokensLabel, ...tokensPattern]).size;
      const tokenScore = union > 0 ? intersection / union : 0;

      let tokenBoost = tokenScore;
      if (tokensPattern.size > 0 && intersection === tokensPattern.size) {
        tokenBoost = 0.90;
      } else if (tokensPattern.size > 0 && intersection >= Math.ceil(tokensPattern.size * 0.75)) {
        tokenBoost = 0.80;
      }

      return Math.max(subScore, (0.5 * levScore + 0.5 * tokenScore), tokenBoost);
    }

    extractFieldLabel(container, inputEl) {
      let rawText = '';
      const parentContainer = container || (inputEl ? inputEl.closest('.fb-dash-form-element, .jobs-easy-apply-form-element, .artdeco-form-element, fieldset, div[role="group"]') : null);

      if (inputEl && inputEl.id && parentContainer) {
        const labelEl = parentContainer.querySelector(`label[for="${this.escapeId(inputEl.id)}"]`);
        if (labelEl) rawText = labelEl.textContent;
      }

      if (!rawText && parentContainer) {
        const legendEl = parentContainer.querySelector('legend, .fb-dash-form-element__label, .artdeco-form-element__label, label');
        if (legendEl) rawText = legendEl.textContent;
      }

      if (!rawText && inputEl) {
        if (inputEl.getAttribute('aria-label')) {
          rawText = inputEl.getAttribute('aria-label');
        } else if (inputEl.getAttribute('aria-labelledby')) {
          const labelId = inputEl.getAttribute('aria-labelledby');
          const doc = inputEl.ownerDocument || document;
          const labelEl = doc.getElementById(labelId);
          if (labelEl) rawText = labelEl.textContent;
        }
      }

      if (!rawText && inputEl) {
        rawText = inputEl.placeholder || inputEl.name || '';
      }

      return rawText ? rawText.trim().replace(/\s+/g, ' ') : '';
    }

    resolveProfileValue(key, profileData) {
      if (!profileData) return null;
      const isValid = (v) => v !== undefined && v !== null && String(v).trim() !== '';

      const p = profileData.personal || {};
      const w = profileData.work || {};
      const e = profileData.education || {};
      const cur = w.currentRole || {};
      const tgt = w.targetRole || {};

      switch (key) {
        case 'fullName':
          if (isValid(p.fullName)) return p.fullName;
          if (isValid(p.firstName) && isValid(p.lastName)) return `${p.firstName} ${p.lastName}`;
          break;
        case 'firstName':
          if (isValid(p.firstName)) return p.firstName;
          if (isValid(p.fullName)) return p.fullName.split(' ')[0];
          break;
        case 'lastName':
          if (isValid(p.lastName)) return p.lastName;
          if (isValid(p.fullName)) {
            const parts = p.fullName.split(' ');
            return parts.length > 1 ? parts.slice(1).join(' ') : '';
          }
          break;
        case 'email':
          if (isValid(p.email)) return p.email;
          break;
        case 'phone':
          if (isValid(p.phone)) return p.phone;
          break;
        case 'city':
          if (isValid(p.city)) return p.city;
          break;
        case 'state':
          if (isValid(p.state)) return p.state;
          break;
        case 'country':
          if (isValid(p.country)) return p.country;
          break;
        case 'location':
          if (isValid(p.city) && isValid(p.state)) return `${p.city}, ${p.state}`;
          if (isValid(p.city)) return p.city;
          break;
        case 'linkedinUrl':
          if (isValid(p.linkedin)) return p.linkedin;
          if (isValid(p.linkedinUrl)) return p.linkedinUrl;
          break;
        case 'githubUrl':
          if (isValid(p.github)) return p.github;
          if (isValid(p.githubUrl)) return p.githubUrl;
          break;
        case 'currentCompany':
          if (isValid(cur.company)) return cur.company;
          break;
        case 'currentJobTitle':
          if (isValid(cur.jobTitle)) return cur.jobTitle;
          if (isValid(tgt.jobTitle)) return tgt.jobTitle;
          break;
        case 'yearsExperience':
          if (isValid(cur.yearsExperience)) return cur.yearsExperience;
          break;
        case 'expectedSalary':
          if (isValid(tgt.expectedSalary)) return tgt.expectedSalary;
          break;
        case 'currentSalary':
          if (isValid(cur.currentSalary)) return cur.currentSalary;
          break;
        case 'noticePeriod':
          if (isValid(tgt.noticePeriod)) return tgt.noticePeriod;
          break;
        case 'workAuthorization':
          return 'Yes';
        case 'sponsorshipRequired':
          return 'No';
        case 'degree':
          if (isValid(e.degree)) return e.degree;
          break;
        case 'major':
          if (isValid(e.major)) return e.major;
          if (isValid(e.fieldOfStudy)) return e.fieldOfStudy;
          break;
        case 'university':
          if (isValid(e.university)) return e.university;
          if (isValid(e.school)) return e.school;
          break;
        case 'graduationYear':
          if (isValid(e.graduationYear)) return e.graduationYear;
          break;
      }

      if (isValid(profileData[key])) return profileData[key];
      return null;
    }

    findBestMatch(label, profileData = {}, screeningList = []) {
      if (!label) return null;
      const cleanLabel = label.trim();
      const normCleanLabel = this.normalizeString(cleanLabel);

      // 1. Screening Q&A Bank Match (Evaluate user custom questions first)
      if (Array.isArray(screeningList) && screeningList.length > 0) {
        let bestQA = null;
        let maxScore = -1;

        for (const item of screeningList) {
          const rawKeywords = item.keywords || item.questionPattern || item.pattern || '';
          if (!rawKeywords) continue;

          // Split comma/pipe separated keyword triggers
          const triggers = rawKeywords.toLowerCase().split(/[,|]/).map(t => this.normalizeString(t)).filter(t => t.length > 1);

          for (const trigger of triggers) {
            if (normCleanLabel.includes(trigger) || trigger.includes(normCleanLabel)) {
              return { source: 'screening', value: item.answer, score: 1.0 };
            }
            const score = this.calculateSimilarity(normCleanLabel, trigger);
            if (score > maxScore) {
              maxScore = score;
              bestQA = item;
            }
          }
        }

        if (bestQA && maxScore >= this.confidenceThreshold) {
          return { source: 'screening', value: bestQA.answer, score: maxScore };
        }
      }

      // 2. Canonical Profile Mappings
      for (const mapping of CANONICAL_PROFILE_MAP) {
        for (const pattern of mapping.patterns) {
          const normPattern = this.normalizeString(pattern);
          let score = this.calculateSimilarity(normCleanLabel, normPattern);

          // Behavioral guard: avoid matching behavioral questions to city/location
          if (mapping.key === 'location' || mapping.key === 'city') {
            const behavioralKeywords = ['have you', 'ever', 'interview', 'willing', 'relocate', 'how many', 'why', 'notice'];
            if (behavioralKeywords.some(kw => normCleanLabel.includes(kw))) {
              score = 0;
            }
          }

          if (score >= this.confidenceThreshold) {
            const val = this.resolveProfileValue(mapping.key, profileData);
            if (val !== undefined && val !== null && String(val).trim() !== '') {
              return { source: 'profile', key: mapping.key, value: val, score };
            }
          }
        }
      }

      return null;
    }
  }

  const instance = new FuzzyMatcherEngine();
  window.LinkedInAutoMatcher = instance;
  window.LinkedInAutoMatcherEngine = FuzzyMatcherEngine;
})();
