export type PhoneCandidate = {
  number: string;
  context: string;
};

// Suggestions, not validation: require a nearby phone-specific label and reject
// sensitive/ambiguous contexts. Missing a number is preferable to suggesting an ID.
const sensitive = /\b(?:account|a\/c|iban|ifsc|bank|aadhaar|aadhar|pan|passport|ssn|identity|id|otp|pin|one[- ]time|verification|security code|reference|ref|invoice|order|transaction|application|employee|salary|amount)\b/i;
const labelledNumber = /\b(?:phone|telephone|tel|mobile|mob|whats\s?app|fax|call(?:[ \t]+us|[ \t]+me)?|contact(?:[ \t]+number)?)\b(?:[ \t]*(?:number|no\.?))?(?:[ \t]+(?:at|on))?[ \t]*[:.#\-]{0,3}[ \t]*(\+?[ \t]*(?:\([0-9]{1,4}\)|[0-9])[0-9() .\t-]{4,38}[0-9])/gi;

export function extractPhoneCandidates(source: string): PhoneCandidate[] {
  // Never render supplied HTML or make a network request. Work is bounded even
  // while a user pastes a large offer. Do not repair OCR-confused letters/digits.
  const text = source.slice(0, 200_000)
    .replace(/<[^>]{0,1000}>/g, '\n')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&plus;|&#43;/gi, '+');
  const candidates: PhoneCandidate[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(labelledNumber)) {
    const number = match[1].trim().replace(/[ \t]+/g, ' ');
    const digits = number.replace(/\D/g, '');
    const start = match.index;
    const lineStart = text.lastIndexOf('\n', start) + 1;
    const lineEnd = text.indexOf('\n', start + match[0].length);
    const line = text.slice(lineStart, lineEnd < 0 ? text.length : lineEnd);
    // A label on the previous line can identify this as an account/OTP field.
    const previous = text.slice(Math.max(0, lineStart - 100), lineStart).trim().split('\n').pop() ?? '';
    if (digits.length < 7 || digits.length > 15 || /^(\d)\1+$/.test(digits)
      || /^(?:\d{4}[-.]\d{1,2}[-.]\d{1,2}|\d{1,2}[-.]\d{1,2}[-.]\d{4})$/.test(number)
      || sensitive.test(line) || sensitive.test(previous)
      || /[A-Za-z0-9@/]/.test(text[start + match[0].length] ?? '')) continue;
    const key = number.startsWith('+') ? `+${digits}` : digits.startsWith('00') ? `+${digits.slice(2)}` : digits;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({
      number,
      context: text.slice(Math.max(lineStart, start - 35), Math.min(lineEnd < 0 ? text.length : lineEnd, start + match[0].length + 45)).trim(),
    });
    if (candidates.length === 12) break;
  }
  return candidates;
}
