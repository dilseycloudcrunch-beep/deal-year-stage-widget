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

// Populate Owner Dropdown dynamically from fetched Deals (unique Owner names)
function populateOwnerDropdown() {
  const ownerSelect = document.getElementById("ownerSelect");

  // Collect unique owner names from allDeals
  const ownerNames = new Set();
  allDeals.forEach(deal => {
    const ownerName = (deal.Owner && deal.Owner.name) ? deal.Owner.name : null;
    if (ownerName) ownerNames.add(ownerName);
  });

  // Clear existing options except "All Owners"
  ownerSelect.innerHTML = `<option value="All">All Owners</option>`;

  Array.from(ownerNames).sort().forEach(name => {
    const option = document.createElement("option");
    option.value = name;
    option.text = name;
    ownerSelect.appendChild(option);
  });

  ownerSelect.addEventListener("change", renderStages);
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
      populateOwnerDropdown();
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

// Render Stage rows (one below another). Each row expands to show its deals on click.
function renderStages() {
  const selectedYear = parseInt(document.getElementById("yearSelect").value);
  const selectedOwner = document.getElementById("ownerSelect").value;
  const container = document.getElementById("stagesContainer");
  container.innerHTML = "";
  activeStage = null;

  // Filter deals based on Closing Date year and selected Owner
  const filteredDeals = allDeals.filter(deal => {
    const dateStr = deal.Closing_Date || deal.Created_Time;
    if (!dateStr) return false;
    const dealYear = new Date(dateStr).getFullYear();
    if (dealYear !== selectedYear) return false;

    if (selectedOwner !== "All") {
      const ownerName = (deal.Owner && deal.Owner.name) ? deal.Owner.name : null;
      if (ownerName !== selectedOwner) return false;
    }
    return true;
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
    container.innerHTML = `<p>No Deals found for the selected filters.</p>`;
    return;
  }

  // Build one block per Stage: header row + hidden deals list below it
  Object.keys(dealsByStage).forEach(stage => {
    const stageBlock = document.createElement("div");
    stageBlock.className = "stage-block";
    stageBlock.id = "stage-" + stage.replace(/\s+/g, "-");

    const pill = document.createElement("button");
    pill.className = "stage-pill";
    pill.type = "button";
    pill.innerHTML = `<span>${stage} (${dealsByStage[stage].length})</span><span class="stage-arrow">&#9656;</span>`;
    pill.addEventListener("click", () => toggleStage(stage, stageBlock));

    const dealsList = document.createElement("div");
    dealsList.className = "deals-list";
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

    stageBlock.appendChild(pill);
    stageBlock.appendChild(dealsList);
    container.appendChild(stageBlock);
  });
}

// Expand/collapse the clicked Stage's deals, right below its own row
function toggleStage(stage, stageBlockEl) {
  const wasActive = stageBlockEl.classList.contains("active");

  // Close whichever stage was open before
  document.querySelectorAll(".stage-block.active").forEach(el => el.classList.remove("active"));

  if (wasActive) {
    activeStage = null;
  } else {
    activeStage = stage;
    stageBlockEl.classList.add("active");
  }
}
