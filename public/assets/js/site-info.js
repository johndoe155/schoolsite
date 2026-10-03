/**
 * Facts that appear on more than one page.
 *
 * Why this file exists: the school's address was written out by hand in four
 * places and had drifted into two different addresses — the academies page had
 * a misspelled street name and a different road order from the home, contact
 * and news pages. A visitor comparing two pages saw two schools. Anything that
 * has to be identical on every page lives here, and pages render it rather than
 * repeating it.
 *
 * Loaded before nav.js / layout.js on every page (they read it), and available
 * as window.BIC_INFO for page scripts. Deliberately dependency-free and small:
 * it runs in the critical path of every page.
 *
 * The single source of truth for the address is ADDRESS.full. If the school
 * moves, change it here and nowhere else — the CI check in .github/workflows/
 * site.yml fails the build if a page starts carrying its own copy again.
 */
(function () {
  "use strict";

  var ADDRESS = {
    line1: "1-5 Osuntokun Avenue",
    line2: "Off Tunde Lakanmi Street, Crescent",
    line3: "Oyo",
    /* One-line form for meta descriptions, emails and structured data. */
    full: "1-5 Osuntokun Avenue, Off Tunde Lakanmi Street, Crescent, Oyo.",
  };

  var INFO = {
    name: "Bodija International College",
    shortName: "Bodija Int\u2019l College",
    address: ADDRESS,
    email: "bicbis95@gmail.com",
    phone: "+234 816 606 1632",

    /* Hours read the same everywhere. */
    hours: "Mon\u2013Fri, 08:00 \u2013 16:00",

    /**
     * How long the school takes to answer a message.
     *
     * This is a promise, so it is written once. It used to be "one business
     * day" in the Programs form's success message and "2\u20133 business days" on
     * Contact — a parent who sent two enquiries got two different promises
     * from the same school.
     */
    replyPromise: "2\u20133 business days",
    replySentence: "We reply within 2\u20133 business days.",

    /**
     * The BIMA short course intake.
     *
     * The academies page used to advertise a bare "Next Session: April 2 – 19"
     * with no year. Once that April passed, the page kept advertising a session
     * that had already finished, and a visitor had no way to tell. Storing the
     * window as a month/day pair and resolving it to the next future occurrence
     * (with the year spelled out) means the page stays true without anyone
     * remembering to edit it each spring.
     *
     * If the academy's calendar changes, change it here and nowhere else.
     */
    sessionWindow: { month: 4, from: 2, to: 19 },
  };

  window.BIC_INFO = INFO;

  var MONTHS = ["January", "February", "March", "April", "May", "June", "July",
                "August", "September", "October", "November", "December"];

  /**
   * "Next Session: April 2 – 19, 2027" — the next occurrence of the intake
   * window, rolled to next year once this year's closing day has passed.
   * `now` is injectable so the value can be tested at a fixed date.
   */
  INFO.nextSessionLabel = function (now) {
    var w = INFO.sessionWindow;
    var today = now || new Date();
    var year = today.getFullYear();
    /* The window is over on the day after `to` — compare on a date-only basis
       so the label flips at midnight local time, not at some UTC hour. */
    var closes = new Date(year, w.month - 1, w.to + 1);
    if (today >= closes) year += 1;
    return "Next Session: " + MONTHS[w.month - 1] + " " + w.from + " \u2013 " + w.to + ", " + year;
  };

  /* Multi-line address as HTML, escaped-by-construction (the values above are
     literals in this file, not user input). */
  INFO.addressHtml = function () {
    return [ADDRESS.line1, ADDRESS.line2, ADDRESS.line3].join("<br>");
  };
})();
