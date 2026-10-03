(function () {
// Small JS: year injection + client-side form validation feedback.
    var __y = document.getElementById('year'); if (__y) __y.textContent = new Date().getFullYear();

    const form = document.getElementById('contactForm');
    const status = document.getElementById('formStatus');
    const visitDateInput = document.getElementById('visitDate');

    // Prevent selecting a past date — set min to today in the user's local timezone
    (function setMinVisitDate() {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      visitDateInput.min = `${yyyy}-${mm}-${dd}`;
    })();

    function showMessage(type, text) {
      status.innerHTML = '';
      const p = document.createElement('div');
      p.className = 'lux-status ' + (type === 'success' ? 'success' : 'error');
      p.textContent = text;
      p.setAttribute('role', 'status');
      status.appendChild(p);
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      status.innerHTML = '';
      const name = form.name.value.trim();
      const email = form.email.value.trim();
      const subject = form.subject.value.trim();
      const visitDate = form.visitDate.value.trim();
      const message = form.message.value.trim();

      if (!name || !email || !subject || !visitDate || !message) {
        showMessage('error', 'Please complete all required fields before sending.');
        return;
      }
      const emailOK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      if (!emailOK) {
        showMessage('error', 'Please enter a valid email address.');
        form.email.focus();
        return;
      }
      if (visitDate < visitDateInput.min) {
        showMessage('error', 'Please choose a visiting date today or in the future.');
        visitDateInput.focus();
        return;
      }

      const visitDateLabel = new Date(visitDate + 'T00:00:00').toLocaleDateString(undefined, {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
      });
      const messageWithVisit = `Preferred Visiting Date: ${visitDateLabel}\n\n${message}`;

      try {
        const response = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, subject, message: messageWithVisit })
        });
        const data = await response.json();
        if (response.ok) {
          showMessage('success', data.message || ('Thank you. Your message has been sent successfully. ' +
            ((window.BIC_INFO && window.BIC_INFO.replySentence) || 'We reply within 2\u20133 business days.')));
          form.reset();
        } else {
          showMessage('error', data.error || 'Something went wrong. Please try again.');
        }
      } catch (err) {
        showMessage('error', 'Could not connect to server. Please try again later.');
      }
    });

    // ── Scroll reveal ── IntersectionObserver for .reveal elements
    (function initReveal() {
      const els = document.querySelectorAll('.reveal');
      if (!('IntersectionObserver' in window)) {
        els.forEach(el => el.classList.add('is-visible'));
        return;
      }
      const io = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            io.unobserve(entry.target);
          }
        });
      }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
      els.forEach(el => io.observe(el));
    })();
})();

(function () {
/*
  Footer-related JS extracted from your main script.

  The original lines in your script that this covers included:
    // hide footer to make overlay own the viewport
    const footerEl = document.querySelector('footer.site-footer');
    if(footerEl){ overlayPrevFooterDisplay = footerEl.style.display || ''; footerEl.style.display = 'none'; }
    ...
    const footerEl = currentArticleEl._footerEl;
    if(footerEl){
      footerEl.style.display = currentArticleEl._overlayPrevFooterDisplay || '';
      footerEl.removeAttribute('aria-hidden');
    }

  This new script:
    - Fills the copyright year <span id="year">
    - Binds a newsletter form if present (#newsletterForm)
    - Hides/restores the footer when an .article-overlay element appears/disappears
      (works even if the main overlay code fails to hide/restore the footer).
*/

(function footerBehavior() {
  // Run after DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    // 1) Fill copyright year
    const yearEl = document.getElementById('year');
    if (yearEl) {
      yearEl.textContent = new Date().getFullYear();
    }

    // 2) Newsletter binding (if you put the form in the footer)
    const newsletter = document.getElementById('newsletterForm');
    if (newsletter) {
      newsletter.addEventListener('submit', function (e) {
        e.preventDefault();
        const emailInput = document.getElementById('newsletterEmail');
        const email = emailInput ? emailInput.value.trim() : '';
        if (!email || !email.includes('@')) {
          alert('Please enter a valid email address');
          return;
        }
        const btn = newsletter.querySelector('button');
        if (btn) {
          btn.disabled = true;
          const prevText = btn.textContent;
          btn.textContent = 'Subscribed ✓';
          setTimeout(() => {
            btn.disabled = false;
            btn.textContent = prevText || 'Subscribe';
            if (emailInput) emailInput.value = '';
          }, 2500);
        }
      });
    }

    // 3) Footer show/hide behavior driven by presence of .article-overlay
    const footerEl = document.querySelector('footer.site-footer');
    if (!footerEl) {
      // If there's no footer element, nothing to do.
      return;
    }

    // Helper to hide footer and mark previous display
    function hideFooter() {
      footerEl.dataset.prevDisplay = footerEl.style.display || '';
      footerEl.style.display = 'none';
      footerEl.setAttribute('aria-hidden', 'true');
    }

    // Helper to restore footer display
    function restoreFooter() {
      footerEl.style.display = footerEl.dataset.prevDisplay || '';
      footerEl.removeAttribute('aria-hidden');
      delete footerEl.dataset.prevDisplay;
    }

    // If overlay already exists on load (e.g. user landed with #/post/x), hide footer now
    if (document.querySelector('.article-overlay')) {
      hideFooter();
    }

    // Observe top-level additions/removals so we can react when overlay is appended/removed
    const observer = new MutationObserver((mutationsList) => {
      for (const m of mutationsList) {
        // Check added nodes
        for (const node of m.addedNodes) {
          if (node.nodeType === 1 && node.classList && node.classList.contains('article-overlay')) {
            hideFooter();
          }
        }
        // Check removed nodes
        for (const node of m.removedNodes) {
          if (node.nodeType === 1 && node.classList && node.classList.contains('article-overlay')) {
            restoreFooter();
          }
        }
      }
    });

    observer.observe(document.body, { childList: true });

    // Also restore footer when the window unloads / beforeunload (safety)
    window.addEventListener('beforeunload', function () {
      restoreFooter();
    });

    // Expose for debugging if you want to call manually from console:
    window.__footerBehavior = {
      hideFooter,
      restoreFooter
    };
  }
})();
})();
