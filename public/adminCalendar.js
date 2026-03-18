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

// ---------- generate 7 days ----------

for(let i=0; i < calendarDays; i++){
    const date = new Date()
    date.setDate(date.getDate()+i)
    days.push(date)

    const btn = document.createElement("button")
    btn.innerText = date.toDateString()
    btn.dataset.index = i

    if(i === 0) btn.classList.add("active-day")

    btn.onclick = () => {
        document.querySelectorAll("#days button").forEach(b => b.classList.remove("active-day"))
        btn.classList.add("active-day")
        selectedDayIndex = i
        generateCalendar()
    }
    daysContainer.appendChild(btn)
}

// ---------- generate calendar ----------

function generateCalendar(){
    body.innerHTML = ""
    const courtIds = courtData.map(c => c.court_id);
    const d = days[selectedDayIndex];
    const dayOfWeek = d.getDay();
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

    for(let slot=0; slot<24; slot++){

        // Visibility logic (same as public script)
        let isAnyCourtOpen = false;
        if (schedules.length === 0) {
            isAnyCourtOpen = true; 
        } else {
            for (const courtId of courtIds) {
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

        for(const courtId of courtIds){
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

fetchData();