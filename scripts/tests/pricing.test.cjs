const assert=require('node:assert/strict');
const p=require('../../docs/propuesta/pricing.js');
assert.equal(p.pen({price:20,currency:'USD'},3.75),75);
assert.equal(p.pen({price:20,currency:'USD'},3.8),76);
assert.equal(p.pen({price:1.01,currency:'USD'},3.5),3.54);
assert.equal(p.pen({price:20,currency:'PEN'},4),20);
for(const rate of [null,'',true,0,-1,Infinity,NaN,101,3.12345]){assert.equal(p.validRate(rate),false);assert.equal(p.pen({price:20,currency:'USD'},rate),null);}
assert.equal(p.pen({price:null,currency:'USD'},3.75),null);
assert.equal(p.label(p.apply({price:20,currency:'USD'},null)),'Precio a consultar');
console.log('USD/PEN: conversion, rounding, missing rate and PEN preservation passed.');
