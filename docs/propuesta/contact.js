'use strict';
(() => {
  const detail = document.querySelector('#product-detail');
  const advisor = document.querySelector('#advisor-dialog');
  const productDialog = document.querySelector('#product-dialog');
  const whatsapp = (message) => `https://wa.me/51968406042?text=${encodeURIComponent(message)}`;

  function addAdvisorAction() {
    const form = detail.querySelector('#detail-form');
    if (!form || form.querySelector('[data-advisor]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'primary-button advisor-trigger';
    button.dataset.advisor = '';
    button.textContent = 'Consultar a un asesor';
    form.insertBefore(button, form.querySelector('[type="submit"]'));
    form.querySelector('[type="submit"]').className = 'secondary-button detail-add-list';
    form.querySelector('label').textContent = form.querySelector('label').textContent.replace('Cantidad a agregar', 'Cantidad');
  }
  new MutationObserver(addAdvisorAction).observe(detail, {childList: true});
  addAdvisorAction();

  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-advisor]')) {
      const form = detail.querySelector('#detail-form');
      if (!form.reportValidity()) return;
      const title = detail.querySelector('#product-title').textContent;
      const brand = detail.querySelector('.product-brand').textContent;
      const quantity = detail.querySelector('#detail-quantity').value;
      const label = form.querySelector('label').textContent;
      const unit = label.match(/\(([^)]+)\)/)?.[1];
      const url = new URL(location.pathname, location.origin);
      url.searchParams.set('producto', form.dataset.id);
      const message = `Hola, quisiera consultar por este producto:\n\n${title}\nMarca: ${brand}\nCantidad: ${quantity}${unit && unit !== 'entera' ? ' ' + unit : ''}\n\n${url.href}\n\n¿Me confirman precio y disponibilidad?`;
      document.querySelector('#advisor-message').textContent = message;
      document.querySelector('#advisor-continue').href = whatsapp(message);
      productDialog.close();
      advisor.showModal();
    }
    if (event.target.closest('#advisor-back')) {
      advisor.close();
      productDialog.showModal();
      detail.querySelector('[data-advisor]').focus();
    }
  });
  function updateSourcing() {
    const query = new URLSearchParams(location.search).get('q')?.trim();
    const message = query
      ? `Hola, estoy buscando: ${query}. No lo encuentro en el catálogo. ¿Me pueden ayudar a conseguirlo?`
      : 'Hola, busco un producto que no encuentro en la web. ¿Me pueden ayudar a conseguirlo?';
    document.querySelectorAll('[data-sourcing]').forEach(link => { link.href = whatsapp(message); });
  }
  new MutationObserver(updateSourcing).observe(document.querySelector('#catalog-title'), {childList: true});
  updateSourcing();
})();
