// API messages with variable parts. matchServerMessage(msg) -> { key, vars, tvNames, fieldNames } or null.
// Field names ("Title is required") are translated with tx; status words with tv.
const P = [
  [/^Not enough leave days: (\d+(?:\.\d+)?) requested, (-?\d+(?:\.\d+)?) available$/, 'Not enough leave days: {{n}} requested, {{a}} available', ['n', 'a']],
  [/^This type of leave needs at least (\d+) days notice$/, 'This type of leave needs at least {{n}} days notice', ['n']],
  [/^A resignation needs at least (\d+) days notice\. The last working day must be (.+) or later$/, 'A resignation needs at least {{n}} days notice. The last working day must be {{d}} or later', ['n', 'd']],
  [/^Loan installments cannot be more than (\d+)% of the basic salary$/, 'Loan installments cannot be more than {{n}}% of the basic salary', ['n']],
  [/^This employee still has (\d+) direct report\(s\)\. Assign them a new manager first$/, 'This employee still has {{n}} direct report(s). Assign them a new manager first', ['n']],
  [/^The last working day \((.+)\) has not arrived yet$/, 'The last working day ({{d}}) has not arrived yet', ['d']],
  [/^(.+) is required$/, '{{field}} is required', ['field'], true], [/^(.+) is not valid$/, '{{field}} is not valid', ['field'], true], [/^(.+) is too long$/, '{{field}} is too long', ['field'], true],
  [/^(.+) not found$/, '{{field}} not found', ['field'], true], [/^(.+) is not a valid date$/, '{{field}} is not a valid date', ['field'], true],
  [/^A (\w+) case cannot become (\w+)$/, 'A {{from}} case cannot become {{to}}', ['from', 'to'], false, ['from', 'to']],
  [/^(.+) is already in custody \((.+)\)$/, '{{name}} is already in custody ({{no}})', ['name', 'no']],
  [/^(.+) is not available \((\w+)\)$/, '{{name}} is not available ({{status}})', ['name', 'status'], false, ['status']],
  [/^A person with this ID number is already registered \((.+)\)$/, 'A person with this ID number is already registered ({{who}})', ['who']],
  [/^Someone with the same name and birth date exists \((.+)\)\. Use that record instead$/, 'Someone with the same name and birth date exists ({{no}}). Use that record instead', ['no']],
  [/^(.+) is already booked at this time \((.+)\)$/, '{{room}} is already booked at this time ({{case}})', ['room', 'case']],
  [/^(.+) already has a hearing at this time \((.+)\)$/, '{{judge}} already has a hearing at this time ({{case}})', ['judge', 'case']],
  [/^The (\d+)-day appeal period has ended\. Only the court president can allow a late appeal$/, 'The {{days}}-day appeal period has ended. Only the court president can allow a late appeal', ['days']],
  [/^The file is larger than (\d+) MB$/, 'The file is larger than {{n}} MB', ['n']],
  [/^Evidence that was (\w+) cannot be moved again$/, 'Evidence that was {{status}} cannot be moved again', ['status'], false, ['status']],
  [/^This action is not allowed now \(stage: (\w+)\)$/, 'This action is not allowed now (stage: {{stage}})', ['stage'], false, ['stage']],
  [/^Complete these fields first: (.+)$/, 'Complete these fields first: {{list}}', ['list']],
  [/^Attach the required supporting document\(s\) first \((\d+)\/(\d+)\)$/, 'Attach the required supporting document(s) first ({{n}}/{{m}})', ['n', 'm']],
  [/^Only (\d+) more may be issued this budget year$/, 'Only {{n}} more may be issued this budget year', ['n']],
  [/^Not enough stock \((-?\d+) available\)$/, 'Not enough stock ({{n}} available)', ['n']],
  [/^The plan is (\w+); this step needs (\w+)$/, 'The plan is {{status}}; this step needs {{need}}', ['status', 'need'], false, ['status', 'need']],
  [/^This kind of separation needs an approved HR case \(Cases → (\w+)\) with an authorized decision$/, 'This kind of separation needs an approved HR case (Cases → {{kind}}) with an authorized decision', ['kind'], false, ['kind']],
  [/^Record this first: (.+)$/, 'Record this first: {{list}}', ['list']],
  [/^This staff position is already occupied \(capacity (\d+)\)$/, 'This staff position is already occupied (capacity {{n}})', ['n']],
  [/^This staff position is (\w+) and cannot be assigned$/, 'This staff position is {{status}} and cannot be assigned', ['status'], false, ['status']],
  [/^The waiting period \((\d+) months\) has not been completed$/, 'The waiting period ({{n}} months) has not been completed', ['n']],
];
export function matchServerMessage(msg) {
  for (const [re, key, names, field, tvNames] of P) {
    const m = re.exec(msg); if (!m) continue;
    const vars = Object.fromEntries(names.map((n, i) => [n, m[i + 1]]));
    return { key, vars, tvNames: tvNames || [], fieldNames: field ? ['field'] : [] };
  }
  return null;
}
