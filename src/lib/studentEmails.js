export function normalizeStudentEmails(value, primaryEmail = '') {
  const entries = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? Object.values(value)
      : String(value || '').split(/[\s,;]+/);

  return [...new Set([primaryEmail, ...entries]
    .map(email => String(email || '').trim().toLowerCase())
    .filter(Boolean))];
}

export function getStudentEmailKey(email) {
  return String(email || '').trim().toLowerCase().replace(/[.#$\[\]\/]/g, character => {
    if (character === '.') return ',';
    return `%${character.charCodeAt(0).toString(16).toUpperCase()}`;
  });
}
