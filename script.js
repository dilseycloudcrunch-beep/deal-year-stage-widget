let allDeals = [];
let dealsByStage = {};
let activeStage = null;

// Initialize Zoho Embedded App SDK
ZOHO.embeddedApp.on("PageLoad", async function (data) {
  ZOHO.CRM.UI.Resize({ height: "700px", width: "50%" }).then(function () {
    console.log("Widget resized");
  });

  populateYearDropdown();
  // Thoda delay do taaki SDK ka parent-window bridge fully ready ho jaye
  setTimeout(async function () {
    await fetchDeals();
  }, 400);
});
ZOHO.embeddedApp.init();

// Populate Year Dropdown dynamically (e.g., last 5 years + next year)
function populateYearDropdown() {
  const yearSelect = document.getElementById("yearSelect");
  const currentYear = new Date().getFullYear();
  for (let year = currentYear + 1; year >= currentYear - 5; year--) {
    const option = document.createElement("option");
    option.value = year;
    option.text = year;
    if (year === currentYear) option.selected = true;
    yearSelect.appendChild(option);
  }
  yearSelect.addEventListener("change", renderStages);
}

// Fetch all Deals using Zoho SDK API
async function fetchDeals() {
  try {
    const response = await ZOHO.CRM.API.getAllRecords({
      Entity: "Deals",
      sort_order: "desc",
      per_page: 200
    });
    if (response && response.data) {
      allDeals = response.data;
      renderStages();
    } else {
      document.getElementById("stagesContainer").innerHTML = "<p>No Deals found.</p>";
    }
  } catch (error) {
    console.error("Error fetching Deals:", error);
    document.getElementById("stagesContainer").innerHTML =
      "<p>Error loading Deals data. Check console (F12) for details.</p>";
  }
}

// Render Stage Pills (with counts) for the selected Year
function renderStages() {
  const selectedYear = parseInt(document.getElementById("yearSelect").value);
  const container = document.getElementById("stagesContainer");
  container.innerHTML = "";

  // Reset the open deals panel whenever year changes
  activeStage = null;
  document.getElementById("dealsPanel").style.display = "none";

  // Filter deals based on Closing Date year
  const filteredDeals = allDeals.filter(deal => {
    const dateStr = deal.Closing_Date || deal.Created_Time;
    if (!dateStr) return false;
    const dealYear = new Date(dateStr).getFullYear();
    return dealYear === selectedYear;
  });

  // Group filtered deals by Stage
  dealsByStage = {};
  filteredDeals.forEach(deal => {
    const stage = deal.Stage || "Unassigned";
    if (!dealsByStage[stage]) {
      dealsByStage[stage] = [];
    }
    dealsByStage[stage].push(deal);
  });

  if (Object.keys(dealsByStage).length === 0) {
    container.innerHTML = `<p>No Deals found for the year ${selectedYear}.</p>`;
    return;
  }

  // Build a pill/button for each Stage with its count
  Object.keys(dealsByStage).forEach(stage => {
    const pill = document.createElement("button");
    pill.className = "stage-pill";
    pill.type = "button";
    pill.innerHTML = `${stage} (${dealsByStage[stage].length})`;
    pill.addEventListener("click", () => toggleStage(stage, pill));
    container.appendChild(pill);
  });
}

// Show/hide the deals list for the clicked Stage
function toggleStage(stage, pillEl) {
  const panel = document.getElementById("dealsPanel");
  const allPills = document.querySelectorAll(".stage-pill");

  // Clicking the already-active stage again closes the panel
  if (activeStage === stage) {
    activeStage = null;
    panel.style.display = "none";
    allPills.forEach(p => p.classList.remove("active"));
    return;
  }

  activeStage = stage;
  allPills.forEach(p => p.classList.remove("active"));
  pillEl.classList.add("active");

  document.getElementById("dealsPanelTitle").innerHTML = `${stage} (${dealsByStage[stage].length})`;

  const dealsList = document.getElementById("dealsList");
  dealsList.innerHTML = "";
  dealsByStage[stage].forEach(deal => {
    const dealCard = document.createElement("div");
    dealCard.className = "deal-card";
    dealCard.innerHTML = `
      <div class="deal-name">${deal.Deal_Name || "Unnamed Deal"}</div>
      <div class="deal-info">Amount: $${deal.Amount || 0}</div>
      <div class="deal-info">Closing: ${deal.Closing_Date || "N/A"}</div>
    `;
    dealsList.appendChild(dealCard);
  });

  panel.style.display = "block";
}
