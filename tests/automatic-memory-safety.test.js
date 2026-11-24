'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {isSafeAutomaticMemory}=require('../server/chat');

test('automatic memory accepts stable non-sensitive preferences',()=>{
 for(const value of [
  'Prefers concise technical explanations.',
  'Enjoys building small JavaScript projects.',
  'Usually wants examples before advanced theory.'
 ])assert.equal(isSafeAutomaticMemory(value),true,value);
});

test('automatic memory rejects health and medical details',()=>{
 for(const value of [
  'User has diabetes and takes insulin.',
  'User was diagnosed with PTSD.',
  'User is pregnant.',
  'User has anxiety.',
  'User has chronic pain.',
  'User takes prescription medication.'
 ])assert.equal(isSafeAutomaticMemory(value),false,value);
});

test('automatic memory rejects religion, politics, sexuality and identity traits',()=>{
 for(const value of [
  'User is Muslim.',
  'User supports a political party.',
  'User is bisexual.',
  'User belongs to a named caste.',
  'User shared their nationality.',
  'User is female.'
 ])assert.equal(isSafeAutomaticMemory(value),false,value);
});

test('automatic memory rejects credentials, secrets and identifying contact data',()=>{
 for(const value of [
  'User password is hunter2.',
  'User shared an API key.',
  'User OTP is 123456.',
  'User Aadhaar number is 1234 5678 9012.',
  'Contact user at rayyan@example.test.',
  'User phone number is +91 98765 43210.',
  'User home address is 12 Example Road.'
 ])assert.equal(isSafeAutomaticMemory(value),false,value);
});

test('automatic memory rejects invalid, empty and oversized values',()=>{
 assert.equal(isSafeAutomaticMemory(null),false);
 assert.equal(isSafeAutomaticMemory('   '),false);
 assert.equal(isSafeAutomaticMemory('x'.repeat(501)),false);
});
