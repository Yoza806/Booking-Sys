const daysContainer = document.getElementById("days")
const body = document.getElementById("calendarBody")
const cartItems = document.getElementById("cartItems")
document
.getElementById("confirmBooking")
.addEventListener("click", confirmBooking)

// New Elements for Floating Cart
const cartFab = document.getElementById("cartFab")
const bookingSidebar = document.getElementById("bookingSidebar")
const closeCartBtn = document.getElementById("closeCartBtn")
const cartBadge = document.getElementById("cartBadge")

// This will be populated by the script tag in calendar.ejs
const calendarDays = typeof calendarDaysToShow !== 'undefined' ? calendarDaysToShow : 7;

let selectedDayIndex = 0
let days = []
let cart = []
let bookedSlots = []
let courtInfo = {}
let peakTimes = []
let schedules = []

// This will be populated by the script tag in calendar.ejs
if (typeof courtData !== "undefined") {
  courtData.forEach((court) => {
    courtInfo[court.court_id] = {
      name: court.court_name,
      price: Number(court.default_price),
      peak_price: Number(court.peak_price)
    };
  });
}

if (typeof peakTimeData !== "undefined") {
    peakTimes = peakTimeData
}

// ---------- Custom Modal Logic ----------

const customModalHTML = `
<div id="customModal" class="custom-modal">
    <div class="custom-modal-content">
        <h3 class="custom-modal-title" id="customModalTitle">Alert</h3>
        <p class="custom-modal-message" id="customModalMessage"></p>
        <div class="custom-modal-actions">
            <button id="customModalConfirm" class="btn-modal btn-modal-confirm">OK</button>
        </div>
    </div>
</div>
`;

document.body.insertAdjacentHTML('beforeend', customModalHTML);

const customModal = document.getElementById('customModal');
const customModalTitle = document.getElementById('customModalTitle');
const customModalMessage = document.getElementById('customModalMessage');
const customModalConfirmBtn = document.getElementById('customModalConfirm');

let onAlertConfirmCallback = null;

if(customModalConfirmBtn) customModalConfirmBtn.onclick = () => {
    customModal.classList.remove('show');
    if (onAlertConfirmCallback) {
        onAlertConfirmCallback();
        onAlertConfirmCallback = null; // Reset after use
    }
};

function showAlert(message, title = "Notification", callback = null) {
    customModalTitle.innerText = title;
    customModalMessage.innerText = message;
    onAlertConfirmCallback = callback;
    customModal.classList.add('show');
}

// ---------- generate 7 days ----------

function generateDayButtons(startDate) {
    daysContainer.innerHTML = "";
    days = [];

    for(let i=0; i < calendarDays; i++){
        // Clone the start date so we don't modify the original
        const date = new Date(startDate);
        date.setDate(startDate.getDate() + i);

        days.push(date);

        const btn = document.createElement("button");
        btn.innerText = date.toDateString();
        btn.dataset.index = i;

        if(i === 0){
            btn.classList.add("active-day");
        }

        btn.onclick = () => {
            document.querySelectorAll("#days button").forEach(b => b.classList.remove("active-day"));
            btn.classList.add("active-day");
            selectedDayIndex = i;
            generateCalendar();
        }
        daysContainer.appendChild(btn);
    }
}

// ---------- generate calendar ----------

function generateCalendar(){

    body.innerHTML = ""

    // Get the actual court IDs from the data passed by the server.
    // This prevents errors if court IDs are not a simple sequence (e.g., 1, 2, 4 after deleting 3).
    const courtIds = courtData.map(c => c.court_id);

    for(let slot=0;slot<24;slot++){

        // Check if this entire time slot should be hidden because all courts are closed.
        let isAnyCourtOpen = false;
        const d = days[selectedDayIndex];
        const dayOfWeek = d.getDay();

        if (schedules.length === 0) {
            isAnyCourtOpen = true; // If no schedules, assume everything is open.
        } else {
            for (const courtId of courtIds) {
                const schedule = schedules.find(s => s.court_id == courtId && s.day_of_week === dayOfWeek);
                // If a court has no specific schedule, it's considered open.
                // It's only closed if a schedule exists and the slot is outside its bounds.
                if (!schedule || (slot >= schedule.open_slot && slot < schedule.close_slot)) {
                    isAnyCourtOpen = true;
                    break; // Found an open court, so the row must be shown.
                }
            }
        }

        // If no courts are open for this slot, skip creating the row.
        if (!isAnyCourtOpen) continue;

        const row = document.createElement("tr")

        // 1. Create Time Column (First Cell)
        const timeCell = document.createElement("td");
        timeCell.innerText = formatTime(slot);
        timeCell.classList.add("time-slot-label");
        row.appendChild(timeCell);

        // 2. Create Court Columns
        for(const courtId of courtIds){

            const cell = document.createElement("td")

            cell.dataset.slot = slot
            cell.dataset.court = courtId
            cell.dataset.day = selectedDayIndex

            const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

            // Check opening/closing times
            const schedule = schedules.find(s => s.court_id == courtId && s.day_of_week === dayOfWeek);
            let isClosed = false;

            if (schedule) {
                if (slot < schedule.open_slot || slot >= schedule.close_slot) {
                    isClosed = true;
                }
            }

            const booking = bookedSlots.find(b => 
                b.court_id == courtId && 
                b.slot == slot && 
                b.booking_date === dateStr
            )

            if (isClosed) {
                // Slot is closed for this specific court, leave the cell blank.
                cell.style.backgroundColor = "#f5f5f7"; 
            } else if (booking) {
                if (booking.price == 0) {
                    cell.classList.add("unavailable")
                    cell.innerText = "Unavailable"
                    cell.style.backgroundColor = "#ffe6e6"
                    cell.style.color = "#c0392b"
                } else if (typeof currentUserId !== 'undefined' && booking.user_id === currentUserId) {
                    cell.classList.add("booked-by-me")
                    cell.innerText = "My Slot"
                } else {
                    cell.classList.add("booked")
                    cell.innerText = "Booked"
                }
            } else {
                const key = `${selectedDayIndex}-${courtId}-${slot}`

                if (cart.some(item => item.key === key)) {
                    cell.classList.add("selected")
                    cell.innerText = "Selected";
                }
                
                // Optional: Show price in cell or just keep it empty for clean look
                // cell.innerText = "+"; 
                
                cell.onclick = () => toggleSlot(cell)
            }

            row.appendChild(cell)

        }

        body.appendChild(row)

    }

}

// ---------- format AM PM time ----------

function formatTime(slot){

    let start = slot
    let end = slot + 1

    const startLabel = formatHour(start)
    const endLabel = formatHour(end)

    return `${startLabel} - ${endLabel}`

}

function formatHour(hour){

    const suffix = hour >= 12 ? "PM" : "AM"

    let h = hour % 12
    if(h === 0) h = 12

    return `${h.toString().padStart(2,"0")} ${suffix}`

}

// ---------- slot selection ----------

function toggleSlot(cell){

    const day = cell.dataset.day
    const court = cell.dataset.court
    const slot = parseInt(cell.dataset.slot, 10) // Ensure slot is a number for calculations

    const key = `${day}-${court}-${slot}`

    if(cell.classList.contains("selected")){

        cell.classList.remove("selected")
        cell.innerText = ""; // Clear text

        cart = cart.filter(i => i.key !== key)

    }else{

        cell.classList.add("selected")
        cell.innerText = "Selected";

        const d = days[day]
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

        cart.push({
            key,
            day,
            court,
            slot,
            date: dateStr
        })

    }

    updateCart()

}

// ---------- update cart ----------

function updateCart(){

    cartItems.innerHTML = ""

    let total = 0;

    cart.forEach(item => {

        const div = document.createElement("div")

        const date = days[item.day].toDateString()

        const courtName = courtInfo[item.court] ? courtInfo[item.court].name : `Court ${item.court}`;

        div.innerText =
        `${date} | ${courtName} | ${formatTime(item.slot)}`

        cartItems.appendChild(div)

        if (courtInfo[item.court]) {
            let currentPrice = courtInfo[item.court].price;

            // Check for peak time
            const date = days[item.day];
            const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
            const dayName = dayNames[date.getDay()];

            const isPeak = peakTimes.some(rule => {
                return rule.court_id == item.court && 
                       (rule.day_of_week === 'Everyday' || rule.day_of_week === dayName) &&
                       item.slot >= rule.start_time && item.slot < rule.end_time;
            });

            if(isPeak) currentPrice = courtInfo[item.court].peak_price;

            total += currentPrice;
        }
    })

    if(cart.length > 0){
        const totalDiv = document.createElement("div")
        totalDiv.style.marginTop = "10px"
        totalDiv.style.fontWeight = "bold"
        totalDiv.style.borderTop = "1px solid #ccc"
        totalDiv.style.paddingTop = "5px"
        totalDiv.innerText = `Total: LKR ${total.toFixed(2)}`
        cartItems.appendChild(totalDiv)
    }

    // Update FAB and Sidebar Visibility
    if(cart.length > 0){
        if(cartBadge) cartBadge.innerText = cart.length;
        
        // If sidebar is NOT open, make sure FAB is visible
        if(bookingSidebar.style.display !== "block"){
            cartFab.style.display = "flex"
        }
    } else {
        cartFab.style.display = "none"
        bookingSidebar.style.display = "none"
    }

}

async function confirmBooking(){

  if(cart.length === 0){
    showAlert("Please select at least one time slot to book.", "No Slots Selected")
    return
  }

  // Calculate total amount dynamically
  let total = 0;
  cart.forEach(item => {
      if (courtInfo[item.court]) {
          let currentPrice = courtInfo[item.court].price;
          const d = days[item.day];
          const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
          const dayName = dayNames[d.getDay()];

          const isPeak = peakTimes.some(rule => {
              return rule.court_id == item.court && 
                     (rule.day_of_week === 'Everyday' || rule.day_of_week === dayName) &&
                     item.slot >= rule.start_time && item.slot < rule.end_time;
          });

          if(isPeak) currentPrice = courtInfo[item.court].peak_price;
          total += currentPrice;
      }
  });

  const orderId = "BOOK_" + Date.now();
  const amount = total.toFixed(2);

  try {
      if (typeof payhere === "undefined") {
          throw new Error("PayHere SDK not loaded. Please check your internet connection.");
      }

      const response = await fetch("/api/payment/create-payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
              order_id: orderId,
              amount: amount,
              currency: "LKR"
          })
      });

      if (!response.ok) {
          throw new Error("Server failed to initiate payment.");
      }

      const data = await response.json();

      if (data.error) {
          throw new Error(data.error);
      }

      const payment = {
          sandbox: true,
          merchant_id: data.merchant_id,
          return_url: window.location.origin + "/payment-success",
          cancel_url: window.location.origin + "/payment-failed",
          notify_url: window.location.origin + "/api/payment/payhere-notify",
          order_id: orderId,
          items: "Booking System",
          amount: amount,
          currency: "LKR",
          hash: data.hash,
          first_name: "Customer",
          last_name: "Name",
          email: "customer@email.com",
          phone: "0771234567",
          address: "Colombo",
          city: "Colombo",
          country: "Sri Lanka"
      };

      payhere.startPayment(payment);
  } catch (err) {
      console.error(err);
      showAlert("Payment Error: " + err.message, "Error");
  }
}

async function processBooking(orderId) {
  const response = await fetch("/book", {
    method: "POST",
    headers:{
      "Content-Type":"application/json"
    },
    body:JSON.stringify({ bookings: cart, order_id: orderId })
  })

  const result = await response.json()

  if(result.success){

    // The UI update now happens only after the user clicks "OK" on the modal.
    showAlert("Your booking has been confirmed successfully!", "Booking Successful", () => {
        cart = []
        updateCart()
        fetchBookings()
    })

  } else {
    // Use the specific message from the server, or a generic one as a fallback.
    const errorMessage = result.message || "There was an issue processing your booking. Please try again.";
    // On failure (e.g. slot taken), refresh the calendar when user closes the alert.
    showAlert(errorMessage, "Booking Failed", () => {
        fetchBookings();
    });
  }
}

// ---------- Cart Toggle Events ----------

if(cartFab){
    cartFab.onclick = () => {
        bookingSidebar.style.display = "block"
        cartFab.style.display = "none" // Hide FAB when sidebar is open
    }
}

if(closeCartBtn){
    closeCartBtn.onclick = () => {
        bookingSidebar.style.display = "none"
        if(cart.length > 0) cartFab.style.display = "flex" // Show FAB again if items exist
    }
}

async function fetchBookings(){
    const response = await fetch("/api/bookings")
    if(response.ok){
        bookedSlots = await response.json()
        generateCalendar()
    }
}

async function fetchSchedules(){
    const response = await fetch("/api/schedules")
    if(response.ok){
        schedules = await response.json()
        generateCalendar()
    }
}

// ---------- default load today ----------

async function initializeSystem() {
    let startDate = new Date();
    try {
        const res = await fetch("/api/system-date");
        if(res.ok){
            const data = await res.json();
            const parts = data.date.split('-');
            // Create local date object for 00:00:00 of the system date (Month is 0-indexed)
            startDate = new Date(parseInt(parts[0]), parseInt(parts[1])-1, parseInt(parts[2]));
        }
    } catch(e){
        console.error("Failed to fetch system date", e);
    }
    generateDayButtons(startDate);
    fetchBookings();
    fetchSchedules();
}

initializeSystem();

// ---------- PayHere Callbacks ----------

payhere.onCompleted = function(orderId) {
    processBooking(orderId);
};

payhere.onDismissed = function() {
    showAlert("Payment was cancelled.", "Cancelled");
};

payhere.onError = function(error) {
    showAlert("An error occurred during payment processing.", "Payment Error");
};