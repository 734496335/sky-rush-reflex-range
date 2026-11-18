/* Sky Rush — local top-5 leaderboard backed by localStorage.
   Stored on the booth machine only; nothing ever leaves the browser.
   Shape: [{ name: "ACE", score: 12345, accuracy: 87, date: "2026-11-18" }] */
(function () {
  "use strict";

  var STORAGE_KEY = "skyrush_leaderboard_v1";
  var MAX_ENTRIES = 5;

  function load() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) { return []; }
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) { return []; }
      return parsed.filter(function (e) {
        return e && typeof e.name === "string" && typeof e.score === "number";
      }).slice(0, MAX_ENTRIES);
    } catch (err) {
      return []; /* storage unavailable (private mode, file:// quirks) */
    }
  }

  function save(entries) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
    } catch (err) { /* non-fatal: the game still works without persistence */ }
  }

  function qualifies(score) {
    if (score <= 0) { return false; }
    var entries = load();
    if (entries.length < MAX_ENTRIES) { return true; }
    return score > entries[entries.length - 1].score;
  }

  function add(name, score, accuracy) {
    var entries = load();
    entries.push({
      name: (name || "ACE").toUpperCase().slice(0, 3),
      score: Math.round(score),
      accuracy: Math.round(accuracy),
      date: new Date().toISOString().slice(0, 10)
    });
    entries.sort(function (a, b) { return b.score - a.score; });
    entries = entries.slice(0, MAX_ENTRIES);
    save(entries);
    return entries;
  }

  window.SkyBoard = {
    load: load,
    qualifies: qualifies,
    add: add,
    MAX_ENTRIES: MAX_ENTRIES
  };
})();
