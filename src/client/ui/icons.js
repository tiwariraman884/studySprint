const ICONS = {
  spark:
    "m12 3 1.8 6.2L20 11l-6.2 1.8L12 19l-1.8-6.2L4 11l6.2-1.8L12 3 M19 3v4 M17 5h4",
  grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  calendar:
    "M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2 M7 3v4 M17 3v4 M3 11h18 M7 15h2 M13 15h2",
  book: "M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1v15",
  question:
    "M9 8a3 3 0 0 1 6 0c0 2-3 2-3 5 M12 17h.01 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  quiz: "m13 2-9 12h7l-1 8 10-13h-7l1-7",
  revision: "M3 10a9 9 0 1 1 1 7 M3 4v6h6 M12 7v5l3 2",
  cpu: "M7 7h10v10H7z M9 1v3 M15 1v3 M9 20v3 M15 20v3 M1 9h3 M1 15h3 M20 9h3 M20 15h3 M10 10h4v4h-4z",
  code: "m8 5-6 7 6 7 M16 5l6 7-6 7 M14 3l-4 18",
  layers: "m12 3 10 5-10 5L2 8l10-5 M2 12l10 5 10-5 M2 16l10 5 10-5",
  network:
    "M10 2h4v4h-4z M2 17h4v4H2z M10 17h4v4h-4z M18 17h4v4h-4z M12 6v6 M4 17v-5h16v5 M12 12v5",
  leaf: "M20 3C8 2 3 8 5 15c2 7 13 6 15-12 M5 20l10-11",
  arrow: "M4 12h16 m-6-6 6 6-6 6",
  chevron: "m9 5 7 7-7 7",
  check: "m5 12 4 4L19 6",
  clock: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M12 7v5l3 2",
  flag: "M5 22V3c4-3 8 3 14 0v11c-6 3-10-3-14 0",
  search: "M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0 M15 15l6 6",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M9 2h6l1 3 3 1 3 3v6l-3 3-3 1-1 3H9l-1-3-3-1-3-3V9l3-3 3-1 1-3",
  close: "m6 6 12 12 M6 18 18 6",
  play: "m8 5 11 7-11 7V5",
  pause: "M8 5v14 M16 5v14",
  reset: "M3 10a9 9 0 1 1 1 7 M3 4v6h6",
  sun: "M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10 M12 1v2 M12 21v2 M1 12h2 M21 12h2 M4 4l2 2 M18 18l2 2 M20 4l-2 2 M6 18l-2 2",
  menu: "M4 6h16 M4 12h16 M4 18h16",
  download: "M12 3v12 m-5-5 5 5 5-5 M4 16v5h16v-5",
  upload: "M12 16V4 m-5 5 5-5 5 5 M4 16v5h16v-5",
  shield: "m12 2 9 4v6c0 6-9 10-9 10S3 18 3 12V6l9-4 m-4 10 3 3 5-6",
  target:
    "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0 M13 12a1 1 0 1 1-2 0 1 1 0 0 1 2 0",
  print: "M6 8V3h12v5 M6 17H3V9h18v8h-3 M6 14h12v7H6z",
  info: "M12 11v6 M12 7h.01 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
};
const icon = (name, cls = "") =>
  `<svg aria-hidden="true" class="${cls}" viewBox="0 0 24 24"><path d="${ICONS[name] || ICONS.book}"/></svg>`;

export { icon };
