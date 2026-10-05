'use strict';
const assert = require('assert');
const { canManageTeam, canManageBilling, roleAllowed, ROLES } = require('../lib/company-membership');

const m = role => ({ role, status:'active' });
assert.equal(canManageTeam(m(ROLES.OWNER)), true);
assert.equal(canManageTeam(m(ROLES.ADMIN)), true);
assert.equal(canManageTeam(m(ROLES.FOREMAN)), false);
assert.equal(canManageTeam(m(ROLES.WORKER)), false);
assert.equal(canManageBilling(m(ROLES.OWNER)), true);
assert.equal(canManageBilling(m(ROLES.ADMIN)), false);
assert.equal(roleAllowed({role:ROLES.OWNER,status:'disabled'}, [ROLES.OWNER]), false);
console.log('ScopeGuard company membership tests passed.');
