// Identifier rules. The three identifiers are NEVER merged:
//   employee_no (internal ID) | staff_positions.position_no (ቋሚ የሰራተኛ መደብ ቁጥር) | employees.fayda_fan (Fayda / digital ID, confidential)
const { bad } = require('./mw');
// Fayda FAN: only digits; a 16-digit number is regarded as well-formed. Anything else is stored as "pending verification", never silently "fixed".
const normFan = (v) => { const s = v == null ? '' : String(v).replace(/[\s-]/g, ''); if (!s) return null; if (!/^\d+$/.test(s)) throw bad('The Fayda number may contain digits only'); if (s.length > 20) throw bad('The Fayda number is too long'); return s; };
const fanWellFormed = (s) => /^\d{16}$/.test(s || '');
const maskFan = (s) => (s ? '•••• •••• •••• ' + String(s).slice(-4) : null);
// Position numbers are TEXT exactly as issued (leading zeros, letters, / and - are kept; nothing is converted to a number)
const normPositionNo = (v) => { const s = v == null ? '' : String(v).trim(); if (!s) throw bad('Position number is required'); if (s.length > 40 || !/^[\p{L}\p{N}][\p{L}\p{N}/\-._ ]*$/u.test(s)) throw bad('Position number has invalid characters or is too long'); return s; };
module.exports = { normFan, fanWellFormed, maskFan, normPositionNo };
