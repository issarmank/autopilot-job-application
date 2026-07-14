// JobPilot universal apply-capture content script.
//
// Runs on every page (see manifest matches). Watches for an Apply/Submit
// action via three heuristics — button/link text, form submission, and the
// URL moving to an /apply-style path — then extracts whatever structured job
// fields the DOM offers (JSON-LD JobPosting → meta tags → heading heuristics)
// and stashes the capture in chrome.storage.local for the popup to confirm.
// If the DOM lacks clean fields, the raw page text travels along so the popup
// can run it through the server-side LLM extraction fallback.
//
// 100% client-side by design: this script only reads the DOM the user's own
// browser rendered. The server never fetches job-site URLs.

;(() => {
  const APPLY_TEXT = /\b(easy apply|apply now|apply|submit application|submit)\b/i
  const APPLY_URL = /\/(apply|application|applications)(\/|\?|#|$)/i
  const RAW_TEXT_LIMIT = 30000

  // ── Field extraction ──────────────────────────────────────────────────────

  function textOf(el) {
    return el && el.textContent ? el.textContent.trim() : null
  }

  function stripHtml(html) {
    const div = document.createElement('div')
    div.innerHTML = html
    return div.textContent ? div.textContent.trim() : null
  }

  // Salary values in JSON-LD can be yearly or hourly — normalize to annual USD.
  function annualize(value, unitText) {
    const n = Number(value)
    if (!Number.isFinite(n) || n <= 0) return null
    const unit = (unitText || '').toUpperCase()
    if (unit === 'HOUR') return Math.round(n * 2080)
    if (unit === 'MONTH') return Math.round(n * 12)
    if (unit === 'WEEK') return Math.round(n * 52)
    if (unit === 'DAY') return Math.round(n * 260)
    return Math.round(n)
  }

  function findJobPosting(node) {
    if (!node || typeof node !== 'object') return null
    if (Array.isArray(node)) {
      for (const item of node) {
        const found = findJobPosting(item)
        if (found) return found
      }
      return null
    }
    const type = node['@type']
    if (type === 'JobPosting' || (Array.isArray(type) && type.includes('JobPosting'))) {
      return node
    }
    if (node['@graph']) return findJobPosting(node['@graph'])
    return null
  }

  // Most ATS pages (Greenhouse, Lever, Workday, LinkedIn…) embed a
  // schema.org JobPosting — the cleanest structured source available.
  function extractFromJsonLd() {
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      let data
      try {
        data = JSON.parse(script.textContent)
      } catch {
        continue
      }
      const posting = findJobPosting(data)
      if (!posting) continue

      const org = posting.hiringOrganization
      const company = typeof org === 'string' ? org : (org && org.name) || null

      let location = null
      const loc = Array.isArray(posting.jobLocation) ? posting.jobLocation[0] : posting.jobLocation
      if (loc && loc.address) {
        const a = loc.address
        location = [a.addressLocality, a.addressRegion, a.addressCountry]
          .filter(v => typeof v === 'string' && v.trim())
          .join(', ') || null
      }
      if (!location && posting.jobLocationType === 'TELECOMMUTE') location = 'Remote'

      let salaryMin = null
      let salaryMax = null
      const base = posting.baseSalary
      if (base && base.value && typeof base.value === 'object') {
        const unit = base.value.unitText
        salaryMin = annualize(base.value.minValue ?? base.value.value, unit)
        salaryMax = annualize(base.value.maxValue ?? base.value.value, unit)
      }

      return {
        title       : typeof posting.title === 'string' ? posting.title.trim() : null,
        company,
        location,
        salaryMin,
        salaryMax,
        description : typeof posting.description === 'string'
          ? (stripHtml(posting.description) || '').slice(0, 500) || null
          : null,
      }
    }
    return null
  }

  function metaContent(selector) {
    const el = document.querySelector(selector)
    const content = el && el.getAttribute('content')
    return content ? content.trim() : null
  }

  function extractFromDom() {
    return {
      title       : metaContent('meta[property="og:title"]') || textOf(document.querySelector('h1')) || document.title || null,
      company     : metaContent('meta[property="og:site_name"]'),
      location    : null,
      salaryMin   : null,
      salaryMax   : null,
      description : metaContent('meta[property="og:description"]') || metaContent('meta[name="description"]'),
    }
  }

  function extractJob() {
    const fields = extractFromJsonLd() || extractFromDom()
    return {
      fields,
      rawText   : (document.body.innerText || '').slice(0, RAW_TEXT_LIMIT),
      sourceUrl : location.href,
      pageTitle : document.title,
    }
  }

  // ── Apply detection ───────────────────────────────────────────────────────

  let lastCaptureAt = 0

  function capture(detectedVia) {
    // A single Apply click can fire several heuristics at once — keep one capture.
    const now = Date.now()
    if (now - lastCaptureAt < 3000) return
    lastCaptureAt = now

    const job = extractJob()
    const pendingCapture = { ...job, detectedVia, capturedAt: now }

    // Stash for the popup (manual review/edit path)…
    chrome.storage.local.set({ pendingCapture })
    // …and hand it to the background worker, which auto-saves it to the
    // tracker immediately. sendMessage can throw if the extension was
    // reloaded under this page — the stored capture still lets the popup
    // save manually in that case.
    try {
      chrome.runtime.sendMessage({ type: 'JOB_CAPTURED', capture: pendingCapture })
    } catch {
      /* extension context invalidated — popup fallback still works */
    }
  }

  function looksLikeApply(text) {
    return !!text && text.length < 60 && APPLY_TEXT.test(text)
  }

  document.addEventListener('click', event => {
    const target = event.target instanceof Element
      ? event.target.closest('button, a, [role="button"], input[type="submit"]')
      : null
    if (!target) return

    const label = target.tagName === 'INPUT'
      ? target.value
      : target.textContent || target.getAttribute('aria-label')
    if (looksLikeApply(label)) capture('button-click')
  }, true)

  document.addEventListener('submit', event => {
    const form = event.target
    if (!(form instanceof HTMLFormElement)) return
    // Only treat it as an application if the form or page looks apply-related —
    // plenty of pages have search/newsletter forms.
    const submitLabel = textOf(form.querySelector('button[type="submit"], input[type="submit"]'))
    if (looksLikeApply(submitLabel) || APPLY_URL.test(location.href) || APPLY_URL.test(form.action || '')) {
      capture('form-submit')
    }
  }, true)

  // SPA job sites change the URL without a page load — poll for /apply paths.
  let lastUrl = location.href
  setInterval(() => {
    if (location.href === lastUrl) return
    const wasApply = APPLY_URL.test(lastUrl)
    lastUrl = location.href
    if (!wasApply && APPLY_URL.test(location.href)) capture('url-change')
  }, 1500)

  // ── Popup contract ────────────────────────────────────────────────────────
  // The popup sends EXTRACT_JOB to read the current page on demand
  // (same message contract the LinkedIn content script uses).
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message && message.type === 'EXTRACT_JOB') {
      sendResponse(extractJob())
    }
    return false
  })
})()
