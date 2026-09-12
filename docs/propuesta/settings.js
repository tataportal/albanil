'use strict';
window.AlbanilSettings=Object.freeze({
  api:'https://albanil-settings.tatayamigos.workers.dev',
  async publicRate(fallback){
    const key='albanil-public-exchange-rate-v1';
    try{
      const response=await fetch(this.api+'/api/exchange-rate',{cache:'no-store',signal:AbortSignal.timeout(5000)});
      if(!response.ok)throw Error('No disponible');
      const value=await response.json();
      if(!AlbanilPricing.validRate(value.rate)||!Number.isFinite(new Date(value.updated_at).getTime()))throw Error('Valor inválido');
      try{localStorage.setItem(key,JSON.stringify(value));}catch{}
      return value;
    }catch{
      let last=fallback;
      try{const saved=JSON.parse(localStorage.getItem(key));if(saved&&AlbanilPricing.validRate(saved.rate)&&new Date(saved.updated_at)>new Date(fallback.updated_at))last=saved;}catch{}
      return {...last,unavailable:true};
    }
  }
});
