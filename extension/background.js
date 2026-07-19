// JobPilot background service worker: turns detected Apply/Submit actions
// into automatic saves.
//
// The content script (universal.js) sends a JOB_CAPTURED message the moment
// it detects an apply action. This worker POSTs the job straight to the
// tracker — no popup interaction needed. The badge on the extension icon
// reports the outcome: ✓ saved, ! needs sign-in or failed.
//
// Auth: fetch runs with credentials: 'include'. The extension has host
// permission for the app origin, so Chrome attaches the Auth.js session
// cookie — same mechanism the popup already uses.

const API_BASE = 'http://localhost:3000'

// One application often spans several captures in the same tab:
//   click Apply on the listing  → capture (button-click)  → save as SAVED
//   fill the form, hit Submit   → capture (form-submit)   → upgrade to APPLIED
// We remember the last save per tab so the later capture PATCHes the stage
// instead of creating a duplicate row.
const JOURNEY_WINDOW_MS = 30 * 60 * 1000 // 30 minutes

function setBadge(text, color) {
  chrome.action.setBadgeBackgroundColor({ color })
  chrome.action.setBadgeText({ text })
  // Clear after a few seconds so stale results don't linger on the icon.
  setTimeout(() => chrome.action.setBadgeText({ text: '' }), 8000)
}

async function setLastResult(result) {
  // The popup reads this to tell the user what the auto-save did.
  await chrome.storage.local.set({ lastAutoSave: { ...result, at: Date.now() } })
}

// If the DOM gave us nothing useful, run the raw page text through the
// server-side LLM extraction (same fallback path the popup's
// "Extract with AI" button uses) before saving.
async function fillMissingFields(fields, rawText) {
  if ((fields.title && fields.company) || !rawText || rawText.length < 50) {
    return fields
  }
  try {
    const res = await fetch(`${API_BASE}/api/jobs/extract`, {
      method      : 'POST',
      headers     : { 'Content-Type': 'application/json' },
      credentials : 'include',
      body        : JSON.stringify({ rawText }),
    })
    if (!res.ok) return fields
    const { fields: extracted } = await res.json()
    // DOM values win — the LLM only fills the gaps.
    return {
      title       : fields.title       ?? extracted.title       ?? null,
      company     : fields.company     ?? extracted.company     ?? null,
      location    : fields.location    ?? extracted.location    ?? null,
      salaryMin   : fields.salaryMin   ?? extracted.salaryMin   ?? null,
      salaryMax   : fields.salaryMax   ?? extracted.salaryMax   ?? null,
      description : fields.description ?? extracted.description ?? null,
    }
  } catch {
    return fields // extraction is best-effort — never block the save
  }
}

async function saveJob(capture, fields, stage) {
  const res = await fetch(`${API_BASE}/api/jobs/save`, {
    method      : 'POST',
    headers     : { 'Content-Type': 'application/json' },
    credentials : 'include',
    body        : JSON.stringify({
      title       : fields.title       ?? null,
      company     : fields.company     ?? null,
      location    : fields.location    ?? null,
      salaryMin   : fields.salaryMin   ?? null,
      salaryMax   : fields.salaryMax   ?? null,
      description : fields.description ?? null,
      sourceUrl   : capture.sourceUrl,
      sourceType  : 'extension',
      stage,
    }),
  })
  return res
}

async function upgradeToApplied(applicationId) {
  const res = await fetch(`${API_BASE}/api/jobs/${applicationId}`, {
    method      : 'PATCH',
    headers     : { 'Content-Type': 'application/json' },
    credentials : 'include',
    body        : JSON.stringify({ stage: 'APPLIED' }),
  })
  return res
}

async function handleCapture(capture, tabId) {
  const stage = capture.detectedVia === 'form-submit' ? 'APPLIED' : 'SAVED'

  const { journeys = {} } = await chrome.storage.local.get('journeys')
  const journey = journeys[tabId]
  const inWindow = journey && Date.now() - journey.savedAt < JOURNEY_WINDOW_MS

  if (inWindow) {
    // Same URL again → duplicate heuristic firing, or the same journey
    // continuing on another page of the flow after a form submit.
    const sameUrl = journey.sourceUrl === capture.sourceUrl

    if (stage === 'APPLIED' && journey.stage === 'SAVED') {
      // The job was saved when Apply was clicked; the user just submitted
      // the actual application — upgrade the existing row.
      const res = await upgradeToApplied(journey.applicationId)
      if (res.ok) {
        journeys[tabId] = { ...journey, stage: 'APPLIED', savedAt: Date.now() }
        await chrome.storage.local.set({ journeys })
        setBadge('✓', '#15803d')
        await setLastResult({ ok: true, action: 'applied', title: journey.title })
        return
      }
      // Fall through to a fresh save if the PATCH failed (e.g. row deleted).
    } else if (sameUrl || stage === 'SAVED') {
      // Already tracked this job in this tab — don't create a duplicate.
      return
    }
  }

  // Hard gate: even if the content script's heuristics fired, refuse to
  // auto-save anything we can't name. A real posting yields a title and
  // company (from the DOM or the LLM fallback); junk pages don't. The
  // capture stays in storage so the popup's manual path still works.
  let fields
  let res
  try {
    fields = await fillMissingFields(capture.fields || {}, capture.rawText)
  } catch {
    fields = capture.fields || {}
  }
  if (!fields.title || !fields.company) {
    await setLastResult({
      ok    : false,
      error : 'Detected an apply click but couldn’t identify a job posting — open the popup to review and save manually.',
    })
    return
  }

  try {
    res = await saveJob(capture, fields, stage)
  } catch {
    setBadge('!', '#b91c1c')
    await setLastResult({ ok: false, error: `Could not reach JobPilot at ${API_BASE}. Is the app running?` })
    return
  }

  if (res.status === 401) {
    setBadge('!', '#b91c1c')
    await setLastResult({ ok: false, error: `Not signed in — open ${API_BASE}/auth first.` })
    return
  }
  if (!res.ok) {
    setBadge('!', '#b91c1c')
    await setLastResult({ ok: false, error: 'Auto-save failed — open the popup to save manually.' })
    return
  }

  const { applicationId } = await res.json()
  journeys[tabId] = {
    applicationId,
    stage,
    sourceUrl : capture.sourceUrl,
    title     : (capture.fields && capture.fields.title) || capture.pageTitle || capture.sourceUrl,
    savedAt   : Date.now(),
  }
  // Keep the map small: drop journeys older than the window.
  for (const [id, j] of Object.entries(journeys)) {
    if (Date.now() - j.savedAt > JOURNEY_WINDOW_MS) delete journeys[id]
  }
  await chrome.storage.local.set({ journeys })

  setBadge('✓', '#15803d')
  await setLastResult({
    ok     : true,
    action : stage === 'APPLIED' ? 'applied' : 'saved',
    title  : journeys[tabId].title,
  })
}

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message && message.type === 'JOB_CAPTURED' && sender.tab && sender.tab.id != null) {
    // Fire and forget — the content script doesn't wait for a response.
    handleCapture(message.capture, sender.tab.id)
  }
  return false
})
