const test = require('node:test');
const assert = require('node:assert');
const { fieldLabel } = require('./field-labels');

test('drops REQUIRED, which proto3 does not support', () => {
  assert.strictEqual(fieldLabel('REQUIRED'), null);
});

test('keeps the labels proto3 does support', () => {
  assert.strictEqual(fieldLabel('OPTIONAL'), 'optional');
  assert.strictEqual(fieldLabel('REPEATED'), 'repeated');
});
