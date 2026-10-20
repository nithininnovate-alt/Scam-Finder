import assert from 'node:assert/strict';
import { test } from 'node:test';
// Node's built-in type stripping keeps this pure browser helper test network-free.
import { extractPhoneCandidates } from './phone-candidates.ts';

test('only phone-labelled candidates, never arbitrary digit sequences', () => {
  assert.deepEqual(extractPhoneCandidates('Offer 9876543210. Salary 12345678. 2026-10-20. +44 7700 900123'), []);
  assert.deepEqual(extractPhoneCandidates('Phone: +44 7700 900123\nMobile: 020 7946 0958').map(c => c.number),
    ['+44 7700 900123', '020 7946 0958']);
});

test('deduplicates formatting and caps long candidate lists', () => {
  const result = extractPhoneCandidates('Tel: +44 (7700) 900123\nWhatsApp: +44 7700 900123\nPhone: 0044 7700 900123');
  assert.equal(result.length, 1);
  assert.equal(extractPhoneCandidates(Array.from({ length: 20 }, (_, i) => `Phone: +44 7700 9001${String(i).padStart(2, '0')}`).join('\n')).length, 12);
});

test('sensitive fields are never suggested even when also labelled as phone', () => {
  for (const label of ['Account', 'Identity', 'OTP', 'Reference', 'Aadhaar', 'PAN', 'Passport', 'Bank', 'SSN', 'Application', 'Employee ID', 'Invoice', 'PIN', 'One-time']) {
    assert.deepEqual(extractPhoneCandidates(`${label}: 9876543210`), [], label);
    assert.deepEqual(extractPhoneCandidates(`${label} phone: 9876543210`), [], label);
    assert.deepEqual(extractPhoneCandidates(`${label}:\nPhone: 9876543210`), [], label);
    assert.deepEqual(extractPhoneCandidates(`Phone: 9876543210 (${label})`), [], label);
  }
});

test('ignores short, oversized, masked, OCR-confused and alphanumeric values', () => {
  for (const value of ['123456', '+1234567890123456', '98XXX XXX12', '+91 98O76 54321', '1234567890ABC', '1111111111', '2026-10-20', '20.10.2026']) {
    assert.deepEqual(extractPhoneCandidates(`Phone: ${value}`), [], value);
  }
});

test('accepts common phone label punctuation without guessing country context', () => {
  for (const label of ['Tel.:', 'Phone #', 'Call us on', 'Contact:', 'Mobile no.']) {
    assert.equal(extractPhoneCandidates(`${label} 020 7946 0958`)[0]?.number, '020 7946 0958', label);
  }
});

test('supports text/PDF/OCR lines and inert HTML without modifying the source', () => {
  const source = '<p>Mobile: &plus;91 98765 43210</p><script>untrusted()</script>';
  assert.equal(extractPhoneCandidates(source)[0]?.number, '+91 98765 43210');
  assert.equal(source.includes('<script>'), true);
  assert.equal(extractPhoneCandidates('[Local OCR page 1]\nContact number: (020) 7946 0958')[0]?.number, '(020) 7946 0958');
});

test('returns no stale candidates when source is cleared or replaced', () => {
  assert.equal(extractPhoneCandidates('Phone: +44 7700 900123').length, 1);
  assert.deepEqual(extractPhoneCandidates(''), []);
  assert.deepEqual(extractPhoneCandidates('A new offer with no contact number'), []);
});
