const daysContainer = document.getElementById("days")
const body = document.getElementById("calendarBody")
const modal = document.getElementById("bookingModal")
const modalDetails = document.getElementById("modalDetails")
const forceDeleteBtn = document.getElementById("forceDeleteBtn")

// This will be populated by the script tag in adminCalendar.ejs
const calendarDays = typeof calendarDaysToShow !== 'undefined' ? calendarDaysToShow : 7;

let selectedDayIndex = 0
let days = []
let bookings = []
let schedules = []
let selectedCourtId = null;

// ---------- generate 7 days ----------

function generateDayButtons(startDate) {
    daysContainer.innerHTML = "";
    days = [];

    for(let i=0; i < calendarDays; i++){
        const date = new Date(startDate);
        date.setDate(startDate.getDate() + i);
        days.push(date);

        const btn = document.createElement("button");
        btn.innerText = date.toDateString();
        btn.dataset.index = i;

        if(i === 0) btn.classList.add("active-day");

        btn.onclick = () => {
            document.querySelectorAll("#days button").forEach(b => b.classList.remove("active-day"));
            btn.classList.add("active-day");
            selectedDayIndex = i;
            generateCalendar();
        }
        daysContainer.appendChild(btn);
    }
}

function renderCourtButtons() {
    const isMobile = window.innerWidth <= 768;
    let container = document.getElementById("courtsNav");
    
    if (!isMobile) {
        if (container) container.style.display = "none";
        return;
    }

    if (!container) {
        container = document.createElement("div");
        container.id = "courtsNav";
        container.className = "courts-nav-container";
        const wrapper = document.createElement("div");
        wrapper.className = "courts-scroll";
        container.appendChild(wrapper);
        const daysNav = document.querySelector(".days-nav-container");
        if (daysNav) daysNav.parentNode.insertBefore(container, daysNav.nextSibling);
    }
    
    container.style.display = "block";
    const wrapper = container.querySelector(".courts-scroll");
    wrapper.innerHTML = "";

    if (typeof courtData !== "undefined") {
        courtData.forEach(court => {
            const btn = document.createElement("button");
            btn.innerText = court.court_name;
            if (court.court_id == selectedCourtId) btn.classList.add("active-court");
            btn.onclick = () => {
                selectedCourtId = court.court_id;
                renderCourtButtons();
                generateCalendar();
            };
            wrapper.appendChild(btn);
        });
    }
}

// ---------- generate calendar ----------

function generateCalendar(){
    body.innerHTML = ""
    const isMobile = window.innerWidth <= 768;
    const courtIds = courtData.map(c => c.court_id);
    if (isMobile && !selectedCourtId && courtIds.length > 0) {
        selectedCourtId = courtIds[0];
    }
    const displayedCourtIds = isMobile ? [selectedCourtId] : courtIds;

    const d = days[selectedDayIndex];
    const dayOfWeek = d.getDay();
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

    for(let slot=0; slot<24; slot++){

        // Update Header UI
        if (slot === 0) {
            const headerRow = document.querySelector(".schedule-table thead tr");
            if (headerRow) {
                const timeHeader = headerRow.querySelector(".time-col-header") || headerRow.cells[0];
                headerRow.innerHTML = "";
                headerRow.appendChild(timeHeader);
                displayedCourtIds.forEach(id => {
                    const court = courtData.find(c => c.court_id == id);
                    const th = document.createElement("th");
                    th.innerText = court ? court.court_name : `Court ${id}`;
                    headerRow.appendChild(th);
                });
            }
        }

        // Visibility logic (same as public script)
        let isAnyCourtOpen = false;
        if (schedules.length === 0) {
            isAnyCourtOpen = true; 
        } else {
            for (const courtId of displayedCourtIds) {
                const schedule = schedules.find(s => s.court_id == courtId && s.day_of_week === dayOfWeek);
                if (!schedule || (slot >= schedule.open_slot && slot < schedule.close_slot)) {
                    isAnyCourtOpen = true;
                    break; 
                }
            }
        }
        if (!isAnyCourtOpen) continue;

        const row = document.createElement("tr")

        // Add Time Cell (Missing in original)
        const timeCell = document.createElement("td")
        timeCell.innerText = formatTime(slot)
        timeCell.className = "time-slot-label" // Reuses styles from styles.css
        row.appendChild(timeCell)

        for(const courtId of displayedCourtIds){
            const cell = document.createElement("td")

            // Check Schedule
            const schedule = schedules.find(s => s.court_id == courtId && s.day_of_week === dayOfWeek);
            let isClosed = false;
            if (schedule) {
                if (slot < schedule.open_slot || slot >= schedule.close_slot) {
                    isClosed = true;
                }
            }

            if (isClosed) {
                row.appendChild(cell)
                continue;
            }

            // Check Booking
            const booking = bookings.find(b => 
                b.court_id == courtId && 
                b.slot == slot && 
                b.booking_date === dateStr
            )

            if (booking) {
                // If booked by an Admin -> Unavailable
                if (booking.role === 'admin' && booking.price == 0) {
                    cell.classList.add("unavailable")
                    cell.innerText = "Unavailable"
                    cell.style.backgroundColor = "#ffe6e6"
                    cell.style.color = "#c0392b"
                    cell.onclick = () => {
                        showCustomConfirm("Make this slot available again?", () => {
                            toggleAvailability(courtId, dateStr, slot)
                        })
                    }
                } else {
                    // Booked by User -> Show Name
                    cell.classList.add("booked-user")
                    cell.innerText = booking.name
                    cell.onclick = () => openModal(booking)
                }
            } else {
                // Empty Slot
                cell.innerText = "+"
                cell.style.color = "#888"
                cell.onclick = () => {
                    showCustomConfirm("Block this slot and make it unavailable?", () => {
                        toggleAvailability(courtId, dateStr, slot)
                    })
                }
            }
            row.appendChild(cell)
        }
        body.appendChild(row)
    }
}

async function toggleAvailability(courtId, date, slot){
    try {
        const response = await fetch("/admin/booking/toggle", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ court_id: courtId, date, slot })
        })
        const res = await response.json()
        if(res.success){
            fetchData()
        } else {
            showCustomAlert(res.message || "Action failed")
        }
    } catch(err){
        console.error(err)
        showCustomAlert("Error updating slot")
    }
}

function openModal(booking){
    modalDetails.innerHTML = `
        <strong>User:</strong> ${booking.name}<br>
        <strong>Email:</strong> ${booking.email}<br>
        <strong>Phone:</strong> ${booking.phone || 'N/A'}<br>
        <strong>Address:</strong> ${booking.address || 'N/A'}<br>
        <hr>
        <strong>Date:</strong> ${booking.booking_date}<br>
        <strong>Time:</strong> ${formatTime(booking.slot)}<br>
        <strong>Price:</strong> LKR ${booking.price}
    `
    
    forceDeleteBtn.onclick = async () => {
        showCustomConfirm(`Are you sure you want to cancel the booking for ${booking.name}?`, async () => {
            const response = await fetch("/admin/booking/cancel", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    court_id: booking.court_id, 
                    date: booking.booking_date, 
                    slot: booking.slot 
                })
            })
            const res = await response.json()
            if(res.success){
                closeModal()
                fetchData()
            } else {
                showCustomAlert("Failed to delete booking")
            }
        })
    }

    modal.style.display = "block"
}

function closeModal(){
    modal.style.display = "none"
}

function formatHour(hour){
    const suffix = hour >= 12 ? "PM" : "AM"
    let h = hour % 12
    if(h === 0) h = 12
    return `${h.toString().padStart(2,"0")} ${suffix}`
}

function formatTime(slot){
    const startLabel = formatHour(slot)
    const endLabel = formatHour(slot + 1)
    return `${startLabel} - ${endLabel}`
}

async function fetchData(){
    const [resBookings, resSchedules] = await Promise.all([
        fetch("/api/admin/bookings"),
        fetch("/api/schedules")
    ]);
    if(resBookings.ok) bookings = await resBookings.json();
    if(resSchedules.ok) schedules = await resSchedules.json();
    generateCalendar();
}

// ---------- Custom Modal Helpers ----------
const customModal = document.getElementById('customModal');
const customModalTitle = document.getElementById('customModalTitle');
const customModalMessage = document.getElementById('customModalMessage');
const customModalConfirmBtn = document.getElementById('customModalConfirm');
const customModalCancelBtn = document.getElementById('customModalCancel');

let onConfirmCallback = null;

customModalCancelBtn.onclick = () => {
    customModal.classList.remove('show');
}

customModalConfirmBtn.onclick = () => {
    customModal.classList.remove('show');
    if(onConfirmCallback) onConfirmCallback();
}

function showCustomConfirm(message, callback){
    customModalTitle.innerText = "Confirm Action";
    customModalMessage.innerText = message;
    customModalCancelBtn.style.display = "block"; // Show cancel
    customModal.classList.add('show');
    onConfirmCallback = callback;
}

function showCustomAlert(message){
    customModalTitle.innerText = "Alert";
    customModalMessage.innerText = message;
    customModalCancelBtn.style.display = "none"; // Hide cancel for alerts
    customModal.classList.add('show');
    onConfirmCallback = null;
}

async function initializeSystem() {
    let startDate = new Date();
    try {
        const res = await fetch("/api/admin/system-date");
        if(res.ok){
            const data = await res.json();
            const parts = data.date.split('-');
            // Create local date object for 00:00:00 of the system date
            startDate = new Date(parseInt(parts[0]), parseInt(parts[1])-1, parseInt(parts[2]));
        }
        if (typeof courtData !== "undefined" && courtData.length > 0) {
            selectedCourtId = courtData[0].court_id;
        }
    } catch(e){
        console.error("Failed to fetch system date", e);
    }
    renderCourtButtons();
    generateDayButtons(startDate);
    fetchData();
}

window.addEventListener('resize', () => {
    renderCourtButtons();
    generateCalendar();
});

initializeSystem();