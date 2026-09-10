# LinkedIn Auto-Applier (Chrome & Brave Extension - Manifest V3)

An intelligent, autonomous job application assistant for LinkedIn that filters recent job listings (Past 24 Hours), inspects seniority tags and job descriptions against your experience, auto-applies to matching **Easy Apply** listings, and saves matching company website listings for manual review.

---

## 🚀 Key Features

1. **Autonomous Search & Filter Launch**:
   - Launches LinkedIn search with customizable target keywords, location, and date posted filters (defaults to **Past 24 Hours** via `f_TPR=r86400` sorted by **Most Recent** via `sortBy=DD`).
   - Evaluates listing salaries against your **configurable minimum salary floor** (e.g. ₹25,000/month).

2. **Dual Strategy Engine & Native LinkedIn Save**:
   - **"Easy Apply" Listings**: Automatically opens the application modal, fills your details, answers screening questions from your custom Q&A bank, unchecks "Follow company" on the review step, and submits.
   - **Native LinkedIn [Save] Automation**: When an external company website job satisfies your criteria, the bot **automatically clicks the native LinkedIn [Save] button** on the listing, bookmarking it directly into your personal **LinkedIn Saved Jobs** (`linkedin.com/my-items/saved-jobs/`).
   - **Extension Saved Jobs**: Also saves the direct listing details in the extension's **Saved Jobs** tab for 1-click CSV export.

3. **🛡️ AI Gig & Annotation Spam Shield**:
   - Automatically detects and skips listings with hourly dollar wages (e.g. `$40/hr Remote`, `$10/hr Remote`).
   - Blocks known crowdsourcing/micro-task agencies (e.g. *Crossing Hurdles*, *Outlier*, *Remotasks*, *DataAnnotation*, *Alignerr*, *Mindrift*, *OneForma*, *Appen*, *Invisible Technologies*).
   - Skips gig roles containing keywords like *annotator*, *reviewer*, *data labeler*, *ai trainer*, *rlhf*, *prompt evaluator*, *transcription*, *data entry*.

4. **🎯 Strict Job Title Relevance Filter**:
   - Enforces that listings match your target profession (e.g., searches for *Data Analyst* only apply to *Analyst*, *Analytics*, *BI*, *Business Intelligence*, *MIS*, *Reporting* roles, ignoring unrelated jobs that merely mention "Data").

5. **Hybrid Experience Matching**:
   - Checks LinkedIn's official seniority badge (Entry level / Associate vs Mid-Senior / Director).
   - Scans full job descriptions using regex for required years of experience (e.g., 0–1 yr, 2+ yrs, fresher).
   - Skips listings demanding seniority beyond your set threshold.
   - Configurable policy for jobs with unlisted experience (auto-apply, save for review, or skip).

6. **Negative Keywords Blacklist & Strict Location**:
   - Instantly skips roles containing blacklisted keywords (e.g., unpaid, intern, BPO, telecaller, faculty, teaching, night shift, etc.).
   - Strict location filter ensures positions are in your target city or marked Remote / Work From Home.

7. **Safe Pause on Unknown Questions**:
   - If an Easy Apply modal presents an unknown screening question or unmapped mandatory field, the extension **pauses indefinitely and alerts you with a desktop notification**.
   - You can simply fill the answer and click Next; the bot detects progress and immediately resumes its autonomous run.

8. **Fast & Uncapped Pacing**:
   - Fast, human-like ~1000ms delay with randomized jitter to simulate natural interaction.
   - Default uncapped mode runs continuously until all search pages are exhausted or manually stopped.
   - Floating in-page status pill displays live crawl activity with an instant **[⏹ Stop]** button.
   - Desktop notifications on CAPTCHA challenge detection.

9. **Custom Screening Q&A Bank**:
   - Full Q&A bank with keyword triggers and automated answers (Work authorization, relocation, commute, notice period, Excel, SQL, Power BI, Python, CTC, etc.).
   - Add, edit, or delete questions directly in the popup.

10. **Live Dashboard, Applied Tracking & CSV Export**:
    - **Applied Tab**: Dedicated dashboard tab displaying all submitted applications with company, location, date applied, and direct listing links.
    - **Saved Jobs Tab**: Displays all saved company-site listings.
    - 1-click **Export CSV** for both Applied and Saved listings.

---

## 📦 How to Load in Chrome / Brave

1. Open your browser:
   - In **Brave**: navigate to `brave://extensions`
   - In **Chrome**: navigate to `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked**.
4. Select the extension directory:
   `c:\Users\KIIT\OneDrive\Documents\Automate Jobs\LinkedIn\LinkedIn-Auto-Applier`
5. Pin the extension icon to your toolbar!

---

## 🎯 How to Use

1. Click the **LinkedIn Auto-Applier** icon in your browser toolbar.
2. In the **Rules & Filters** tab:
   - Enter your target job title / keywords (e.g., `Data Analyst`, `MIS Analyst`) and location (e.g., `Bengaluru, Karnataka, India`).
   - Adjust date filter, experience cutoff, minimum salary floor, and negative keywords.
3. In the **Profile & QA** tab:
   - Check your contact details, current role, and screening question answers.
4. In the **Auto-Apply** tab, click **▶ Start Auto-Apply**:
   - The extension opens a LinkedIn search with your filters.
   - The crawler inspects each card, applies or saves based on your criteria, and logs activity in real time.
5. Click **⏹ Stop** in the popup or on the floating page pill at any time.
