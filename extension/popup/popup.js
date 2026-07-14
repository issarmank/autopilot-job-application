// JobPilot popup: pre-fills the form from the active tab's content script
// (or the last auto-capture), lets the user edit/confirm, then POSTs to the
// tracker's unified save endpoint with sourceType 'extension'.
//
// Auth: the fetch runs with credentials: 'include'. Because the extension has
// host permission for the app origin, Chrome attaches the Auth.js session
// cookie — the API validates the session exactly like a same-site request.

const API_BASE = 'http://localhost:3000'

const inputs = {
  title     : document.getElementById('title'),
  company   : document.getElementById('company'),
  location  : document.getElementById('location'),
  salaryMin : document.getElementById('salaryMin'),
  salaryMax : document.getElementById('salaryMax'),
  sourceUrl : document.getElementById('sourceUrl'),
}
const statusEl = document.getElementById('status')
const extractBtn = document.getElementById('extract-btn')
const saveBtn = document.getElementById('save-btn')

// Raw page text kept out of the form — only sent if the user asks for AI extraction.
let rawText = ''

function setStatus(kind, message) {
  statusEl.className = kind
  statusEl.textContent = message
}

function fillForm(fields, sourceUrl) {
  if (fields) {
    for (const key of ['title', 'company', 'location']) {
      if (fields[key] && !inputs[key].value) inputs[key].value = fields[key]
    }
    if (fields.salaryMin && !inputs.salaryMin.value) inputs.salaryMin.value = fields.salaryMin
    if (fields.salaryMax && !inputs.salaryMax.value) inputs.salaryMax.value = fields.salaryMax
  }
  if (sourceUrl && !inputs.sourceUrl.value) inputs.sourceUrl.value = sourceUrl
}

// How long a stored auto-capture stays fresher than a live page read.
// After applying, the user usually lands on a confirmation page whose DOM is
// useless — the capture taken at the moment they applied is the real job.
const CAPTURE_FRESH_MS = 15 * 60 * 1000

async function loadCapture() {
  const { pendingCapture, lastAutoSave } = await chrome.storage.local.get([
    'pendingCapture',
    'lastAutoSave',
  ])

  // Prefer a recent auto-capture over a live read of the current page —
  // fall back to the live read for older captures or none at all.
  const captureIsFresh =
    pendingCapture && Date.now() - (pendingCapture.capturedAt || 0) < CAPTURE_FRESH_MS

  if (captureIsFresh) {
    rawText = pendingCapture.rawText || ''
    fillForm(pendingCapture.fields, pendingCapture.sourceUrl)
  } else {
    let live = null
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (tab && tab.id != null) {
        live = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_JOB' })
      }
    } catch {
      // No content script on this page (chrome:// pages, web store, etc.)
    }
    if (live) {
      rawText = live.rawText || ''
      fillForm(live.fields, live.sourceUrl)
    } else if (pendingCapture) {
      rawText = pendingCapture.rawText || ''
      fillForm(pendingCapture.fields, pendingCapture.sourceUrl)
      setStatus('info', 'Loaded your last detected application.')
    }
  }

  // Tell the user what the background auto-save did with the last capture.
  if (lastAutoSave && Date.now() - (lastAutoSave.at || 0) < CAPTURE_FRESH_MS) {
    if (lastAutoSave.ok) {
      const verb = lastAutoSave.action === 'applied' ? 'Marked as Applied' : 'Auto-saved'
      setStatus('success', `${verb}: ${lastAutoSave.title} — already on your dashboard.`)
      return
    }
    setStatus('error', lastAutoSave.error)
    return
  }

  if (!inputs.title.value || !inputs.company.value) {
    if (rawText) {
      setStatus('info', 'Some fields are missing — try “Extract with AI”.')
    } else {
      setStatus('info', 'Nothing detected on this page. Fill in the details manually.')
    }
  }
}

async function extractWithAI() {
  if (!rawText || rawText.length < 50) {
    setStatus('error', 'No page text captured to extract from.')
    return
  }
  extractBtn.disabled = true
  setStatus('info', 'Extracting fields with AI…')

  try {
    const res = await fetch(`${API_BASE}/api/jobs/extract`, {
      method      : 'POST',
      headers     : { 'Content-Type': 'application/json' },
      credentials : 'include',
      body        : JSON.stringify({ rawText }),
    })

    if (res.status === 401) {
      setStatus('error', `Not signed in — open ${API_BASE}/auth first.`)
      return
    }
    if (!res.ok) {
      setStatus('error', 'Extraction failed. You can still fill fields manually.')
      return
    }

    const { fields } = await res.json()
    fillForm(fields, null)
    setStatus('success', 'Fields extracted — review and save.')
  } catch {
    setStatus('error', `Could not reach JobPilot at ${API_BASE}. Is the app running?`)
  } finally {
    extractBtn.disabled = false
  }
}

async function save() {
  const sourceUrl = inputs.sourceUrl.value.trim()
  if (!sourceUrl) {
    setStatus('error', 'Posting URL is required.')
    return
  }
  saveBtn.disabled = true
  setStatus('info', 'Saving…')

  const num = value => {
    const n = parseInt(value, 10)
    return Number.isFinite(n) ? n : null
  }

  try {
    const res = await fetch(`${API_BASE}/api/jobs/save`, {
      method      : 'POST',
      headers     : { 'Content-Type': 'application/json' },
      credentials : 'include',
      body        : JSON.stringify({
        title      : inputs.title.value.trim() || null,
        company    : inputs.company.value.trim() || null,
        location   : inputs.location.value.trim() || null,
        salaryMin  : num(inputs.salaryMin.value),
        salaryMax  : num(inputs.salaryMax.value),
        sourceUrl,
        sourceType : 'extension',
      }),
    })

    if (res.status === 401) {
      setStatus('error', `Not signed in — open ${API_BASE}/auth first.`)
      return
    }
    if (!res.ok) {
      setStatus('error', 'Save failed. Check the fields and try again.')
      return
    }

    await chrome.storage.local.remove(['pendingCapture', 'lastAutoSave'])
    setStatus('success', 'Saved! It’s on your dashboard.')
  } catch {
    setStatus('error', `Could not reach JobPilot at ${API_BASE}. Is the app running?`)
  } finally {
    saveBtn.disabled = false
  }
}

extractBtn.addEventListener('click', extractWithAI)
saveBtn.addEventListener('click', save)
loadCapture()
