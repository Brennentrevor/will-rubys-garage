/* Public shop connection. Paste the project anon key below when the parent supplies it.
   The anon key is the public browser key. Never put a service-role or secret key here.
   Do not put the shop PIN or the full access password in this file. */
(function () {
  var current = window.WRG_CONFIG || {};
  window.WRG_CONFIG = {
    supabaseUrl: current.supabaseUrl || 'https://evgpnpqtnemlbnygpbxs.supabase.co',
    supabaseAnonKey: current.supabaseAnonKey || '',
    shopEmail: current.shopEmail || 'wrg-shop@garage.example',
    accessPrefix: current.accessPrefix || 'wrg-access-'
  };
})();
