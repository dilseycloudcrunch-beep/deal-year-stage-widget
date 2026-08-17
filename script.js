let allDeals = [];       // currently loaded (selected year's) deals
let dealsByStage = {};
let activeStage = null;
let currentFetchId = 0;  // guards against race conditions between year switches

// Initialize Zoho Embedded App SDK
ZOHO.embeddedApp.on("PageLoad", async function (data) {
  ZOHO.CRM.UI.Resize({ height: "700px", width: "50%" }).then(function () {
    console.log("Widget resized");
  });

  populateYearDropdown();
  // Thoda delay do taaki SDK ka parent-window bridge fully ready ho jaye
  setTimeout(async function () {
    await fetchDealsForYear(getSelectedYear());
  }, 400);
});
ZOHO.embeddedApp.init();

function getSelectedYear() {
  return parseInt(document.getElementById("yearSelect").value);
}

// Helper: safely read Owner name regardless of response shape
// (COQL returns "Owner.name" as a flat key; getAllRecords returns nested Owner.name)
function getOwnerName(deal) {
  return deal["Owner.name"] || (deal.Owner && deal.Owner.name) || null;
}

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
  // Year change -> re-fetch only that year's data from CRM
  yearSelect.addEventListener("change", async function () {
    await fetchDealsForYear(getSelectedYear());
  });
}

// Populate Owner Dropdown dynamically from currently loaded (selected year's) Deals
function populateOwnerDropdown() {
  const ownerSelect = document.getElementById("ownerSelect");
  const previousValue = ownerSelect.value || "All";

  const ownerNames = new Set();
  allDeals.forEach(deal => {
    const ownerName = getOwnerName(deal);
    if (ownerName) ownerNames.add(ownerName);
  });

  ownerSelect.innerHTML = `<option value="All">All Owners</option>`;

  Array.from(ownerNames).sort().forEach(name => {
    const option = document.createElement("option");
    option.value = name;
    option.text = name;
    ownerSelect.appendChild(option);
  });

  if ([...ownerSelect.options].some(o => o.value === previousValue)) {
    ownerSelect.value = previousValue;
  }

  ownerSelect.addEventListener("change", renderStages);
}

// Fetch ONLY the selected year's Deals using COQL, split month-by-month to stay
// under Zoho's 2000-offset limit per query. Months are fetched in small parallel
// batches (not all 12 at once, not one-by-one) to balance speed vs rate limits.
async function fetchDealsForYear(year) {
  const container = document.getElementById("stagesContainer");
  container.innerHTML = `<p class="loading-text">Loading Deals for ${year}...</p>`;

  currentFetchId += 1;
  const thisFetchId = currentFetchId;

  const limit = 200;
  const maxOffset = 2000;
  const batchSize = 4; // kitne months ek saath parallel chalenge (rate-limit safe)

  async function fetchMonth(month) {
    const monthStr = String(month).padStart(2, "0");
    const lastDay = new Date(year, month, 0).getDate();
    const startDate = `${year}-${monthStr}-01`;
    const endDate = `${year}-${monthStr}-${lastDay}`;

    const monthDeals = [];
    let offset = 0;
    let moreRecords = true;

    while (moreRecords) {
      if (thisFetchId !== currentFetchId) return monthDeals;

      if (offset > maxOffset) {
        console.warn(`Offset limit reached for ${year}-${monthStr}, some records may be skipped.`);
        break;
      }

      const query = `select Deal_Name, Amount, Closing_Date, Stage, Owner.name from Deals where Closing_Date between '${startDate}' and '${endDate}' limit ${limit} offset ${offset}`;

      try {
        const response = await ZOHO.CRM.API.coql({ select_query: query });

        if (thisFetchId !== currentFetchId) return monthDeals;

        if (response && response.data && response.data.length > 0) {
          monthDeals.push(...response.data);
        }

        moreRecords = !!(response && response.info && response.info.more_records) && response.data && response.data.length === limit;
        offset += limit;
      } catch (err) {
        // Ek month fail ho bhi jaye, baaki months ka data na khoye —
        // is month ko skip karke jo mil chuka hai wahi return karo.
        console.error(`Error fetching ${year}-${monthStr}:`, err);
        break;
      }
    }

    return monthDeals;
  }

  try {
    const allMonths = Array.from({ length: 12 }, (_, i) => i + 1);
    const yearDeals = [];

    // Months ko chhote batches me parallel fetch karo (poora saal ek saath nahi)
    for (let i = 0; i < allMonths.length; i += batchSize) {
      if (thisFetchId !== currentFetchId) return; // stale, abort

      const batch = allMonths.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map(m => fetchMonth(m)));

      if (thisFetchId !== currentFetchId) return;

      batchResults.forEach(deals => yearDeals.push(...deals));
    }

    if (thisFetchId !== currentFetchId) return;

    allDeals = yearDeals;

    if (allDeals.length > 0) {
      populateOwnerDropdown();
      renderStages();
    } else {
      container.innerHTML = `<p>No Deals found for ${year}.</p>`;
    }
  } catch (error) {
    if (thisFetchId !== currentFetchId) return;
    console.error("Error fetching Deals:", error);
    container.innerHTML = "<p>Error loading Deals data. Check console (F12) for details.</p>";
  }
}

// Render Stage rows (one below another). allDeals is already scoped to the selected year.
function renderStages() {
  const selectedOwner = document.getElementById("ownerSelect").value;
  const container = document.getElementById("stagesContainer");
  container.innerHTML = "";
  activeStage = null;

  const filteredDeals = allDeals.filter(deal => {
    if (selectedOwner !== "All") {
      const ownerName = getOwnerName(deal);
      if (ownerName !== selectedOwner) return false;
    }
    return true;
  });

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

  document.querySelectorAll(".stage-block.active").forEach(el => el.classList.remove("active"));

  if (wasActive) {
    activeStage = null;
  } else {
    activeStage = stage;
    stageBlockEl.classList.add("active");
  }
}
