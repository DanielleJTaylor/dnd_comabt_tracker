/* Imagine your webpage is a toy box.

Inside the toy box there are two big toys:
🎒 the Dashboards (on the left)
🧝 the Tracker (on the right).

By default, the Dashboards toy is hidden (it’s squished to 0 width).

If you want to see it, you need to open the toy box door */

document.addEventListener("DOMContentLoaded", () => {                         //👉 This means: “Don’t start playing until all the toys are unpacked.”       

//👉 We point to the toy box (app-container), the "See Dashboards" button, and the ✖ close button.
  const appContainer = document.getElementById("app-container");        
  const seeBtn = document.getElementById("seeDashboardsBtn");
  const closeBtn = document.getElementById("closeDashboardBtn");    

  seeBtn.addEventListener("click", () => {
        appContainer.classList.add("dashboard-visible");
  });

  closeBtn.addEventListener("click", () => {
        appContainer.classList.remove("dashboard-visible");
  });
});