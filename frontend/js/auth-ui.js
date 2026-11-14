// Staff navigation starts hidden in the HTML and appears only after server
// session data confirms the administrator role.
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const session = await ParkingAPI.getSession();
    if ((session.data.groups || []).includes('parking-admin')) {
      document.querySelectorAll('[data-admin-only]').forEach((element) => { element.hidden = false; });
    }
  } catch {
    // Public pages remain usable without a signed-in account.
  }
});
