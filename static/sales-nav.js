// Sales Workflow Navigation
(() => {
  function createSalesNav(currentPage) {
    const params = new URLSearchParams(window.location.search);
    const bid = params.get('bid') || '';
    
    const nav = document.createElement('div');
    nav.className = 'sales-nav';
    nav.innerHTML = `
      <div class="sales-nav-inner">
        <a href="/sales-intake${bid ? '?bid=' + bid : ''}" class="sales-nav-link ${currentPage === 'intake' ? 'active' : ''}">Intake</a>
        <a href="/sales-quote${bid ? '?bid=' + bid : ''}" class="sales-nav-link ${currentPage === 'quote' ? 'active' : ''}">Quote</a>
        <a href="/sales-details${bid ? '?bid=' + bid : ''}" class="sales-nav-link ${currentPage === 'details' ? 'active' : ''}">Details</a>
        ${bid ? `<span class="sales-nav-bid-id">Bid #${bid}</span>` : ''}
      </div>
    `;
    
    // Insert at the top of the body (after appbar if present)
    const appbar = document.querySelector('[data-appbar]') || document.querySelector('.appbar');
    if (appbar && appbar.nextSibling) {
      appbar.parentNode.insertBefore(nav, appbar.nextSibling);
    } else {
      document.body.insertBefore(nav, document.body.firstChild);
    }
  }
  
  // Expose globally so pages can call it
  window.createSalesNav = createSalesNav;
})();
