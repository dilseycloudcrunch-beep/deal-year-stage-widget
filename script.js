let allDeals = [];
let defaultYear = new Date().getFullYear();

// Initialize Zoho Embedded App SDK
ZOHO.embeddedApp.on("PageLoad", async function (data) {
  // Modal ki width/height badhane ke liye
  ZOHO.CRM.UI.Resize({ height: "700px", width: "60%" }).then(function () {
    console.log("Widget resized");
  });

  populateYearDropdown();
  document.getElementById("refreshBtn").addEventListener("click", handleRefresh);

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
  defaultYear = currentYear;
  for (let year = currentYear + 1; year >= currentYear - 5; year--) {
    const option = document.createElement("option");
    option.value = year;
    option.text = year;
    if (year === currentYear) option.selected = true;
    yearSelect.appendChild(option);
  }
  yearSelect.addEventListener("change", renderStagesAndDeals);
}

// Refresh button click: year ko default (current year) par wapas le aao aur deals fresh fetch karo
async function handleRefresh() {
  const yearSelect = document.getElementById("yearSelect");
  yearSelect.value = defaultYear;
  document.getElementById("stagesContainer").innerHTML = "<p class='loading-text'>Refreshing...</p>";
  await fetchDeals();
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
      renderStagesAndDeals();
    } else {
      document.getElementById("stagesContainer").innerHTML = "<p>No Deals found.</p>";
    }
  } catch (error) {
    console.error("Error fetching Deals:", error);
    document.getElementById("stagesContainer").innerHTML =
      "<p>Error loading Deals data. Check console (F12) for details.</p>";
  }
}

// Render Stages (name + count only) and filtered Deals according to selected Year
function renderStagesAndDeals() {
  const selectedYear = parseInt(document.getElementById("yearSelect").value);
  const container = document.getElementById("stagesContainer");
  container.innerHTML = "";

  // Filter deals based on Closing Date year
  const filteredDeals = allDeals.filter(deal => {
    const dateStr = deal.Closing_Date || deal.Created_Time;
    if (!dateStr) return false;
    const dealYear = new Date(dateStr).getFullYear();
    return dealYear === selectedYear;
  });

  // Group filtered deals by Stage
  const dealsByStage = {};
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

  // Build columns: sirf Stage name + count dikhega, click pe records expand honge
  Object.keys(dealsByStage).forEach(stage => {
    const stageColumn = document.createElement("div");
    stageColumn.className = "stage-column";

    const stageHeader = document.createElement("div");
    stageHeader.className = "stage-title";
    stageHeader.innerHTML = `<span>${stage} (${dealsByStage[stage].length})</span><span class="arrow">&#9656;</span>`;

    const dealsWrapper = document.createElement("div");
    dealsWrapper.className = "stage-deals";

    dealsByStage[stage].forEach(deal => {
      const dealCard = document.createElement("div");
      dealCard.className = "deal-card";
      dealCard.innerHTML = `
        <div class="deal-name">${deal.Deal_Name || "Unnamed Deal"}</div>
        <div class="deal-info">Amount: $${deal.Amount || 0}</div>
        <div class="deal-info">Closing: ${deal.Closing_Date || "N/A"}</div>
      `;

      // Deal card pe click karte hi CRM me record khul jaye
      dealCard.addEventListener("click", function (e) {
        e.stopPropagation(); // stage collapse/expand trigger na ho
        ZOHO.CRM.UI.Record.open({ Entity: "Deals", RecordID: deal.id });
      });

      dealsWrapper.appendChild(dealCard);
    });

    // Click pe expand/collapse
    stageHeader.addEventListener("click", function () {
      stageHeader.classList.toggle("open");
      dealsWrapper.classList.toggle("open");
    });

    stageColumn.appendChild(stageHeader);
    stageColumn.appendChild(dealsWrapper);
    container.appendChild(stageColumn);
  });
}
