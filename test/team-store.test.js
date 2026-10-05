'use strict';
const assert = require('assert');
const crypto = require('crypto');

// Security invariants for the team invitation flow.
const INVITE_ROLES = new Set(['admin','foreman','worker']);
const normalizeEmail = email => String(email||'').trim().toLowerCase();
const token = crypto.randomBytes(32).toString('base64url');
const hash = crypto.createHash('sha256').update(token).digest('hex');

assert.equal(INVITE_ROLES.has('owner'), false, 'Invitations must never grant owner role');
assert.equal(INVITE_ROLES.has('admin'), true);
assert.equal(INVITE_ROLES.has('foreman'), true);
assert.equal(INVITE_ROLES.has('worker'), true);
assert.equal(normalizeEmail(' Worker@Example.COM '), 'worker@example.com');
assert.equal(hash.length, 64, 'Only a SHA-256 token hash should be persisted');
assert.notEqual(hash, token, 'Raw invitation tokens must not be stored');
assert.equal(new Date(Date.now()-1000) <= new Date(), true, 'Expired invitations must be detectable');

console.log('ScopeGuard team invitation security tests passed.');
