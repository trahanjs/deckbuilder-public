'use strict';

function normalizeName(value, options = {}) {
  const {
    normalizeSingleQuotes = true,
    stripDoubleEdgeQuotes = true,
    stripSingleEdgeQuotes = false,
    collapseWhitespace = true,
    lowercase = true
  } = options;

  let next = String(value || '');

  if (normalizeSingleQuotes) {
    next = next
      .replace(/\u2019/g, "'")
      .replace(/\u2018/g, "'")
      .replace(/\u2013|\u2014/g, '-');
  }

  if (stripDoubleEdgeQuotes) {
    next = next.replace(/^"+|"+$/g, '');
  }

  if (stripSingleEdgeQuotes) {
    next = next.replace(/^'+|'+$/g, '');
  }

  if (collapseWhitespace) {
    next = next.replace(/\s+/g, ' ');
  }

  next = next.trim();

  return lowercase ? next.toLowerCase() : next;
}

module.exports = {
  normalizeName
};
