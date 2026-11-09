/* Public shop connection. Paste the project anon key below when the parent supplies it.
   The anon key is the public browser key. Never put a service-role or secret key here.
   Do not put the shop PIN or the full access password in this file. */
(function () {
  var current = window.WRG_CONFIG || {};
  window.WRG_CONFIG = {
    supabaseUrl: current.supabaseUrl || 'https://evgpnpqtnemlbnygpbxs.supabase.co',
    supabaseAnonKey: current.supabaseAnonKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2Z3BucHF0bmVtbGJueWdwYnhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMzMjcyMzMsImV4cCI6MjEwODkwMzIzM30.IskAOHWOcOTADboLGe_HlA-S8h4z0PSa8eHhde1sSX4',
    shopEmail: current.shopEmail || 'wrg-shop@garage.example',
    accessPrefix: current.accessPrefix || 'wrg-access-'
  };
})();
