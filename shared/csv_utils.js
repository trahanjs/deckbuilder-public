'use strict';

const { parse } = require('csv-parse/sync');

function parseCsvText(text, options = {}) {
  return parse(String(text || ''), {
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true,
    ...options
  });
}

function csvCell(value) {
  const stringValue = value == null ? '' : String(value);
  if (/[",\n]/.test(stringValue)) {
    return '"' + stringValue.replace(/"/g, '""') + '"';
  }
  return stringValue;
}

function csvRowsToText(rows) {
  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

module.exports = {
  parseCsvText,
  csvCell,
  csvRowsToText
};
